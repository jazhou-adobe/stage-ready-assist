"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pause, Play, RotateCcw, RotateCw } from "lucide-react";

import "../landing.css";
import { useAudioMetrics } from "@/hooks/useAudioMetrics";
import { useRecording } from "@/hooks/useRecording";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useWebcam, type UseWebcamResult } from "@/hooks/useWebcam";
import { useAppStore } from "@/lib/store";
import { setRecordingBlob } from "@/lib/recordingBlobStore";
import { computeScore, gradeFromScore, summaryLine } from "@/lib/grading";
import { formatElapsed, computeAvgWpm, sumValues } from "@/lib/metrics";
import { splitSentences } from "@/lib/script";
import type { MetricsSample, SessionResult, SessionSummary } from "@/lib/types";

type RecordState = "idle" | "recording" | "paused";
type PaceTrend = "rising" | "steady" | "falling";

const LONG_PAUSE_MS = 1500;
const TARGET_WPM = 130; // used both to estimate a target duration and as the skip-pace fallback
const FADE_PER_STEP = 0.16;
const FADE_FLOOR = 0.18;
const FADE_DISTANT_PENALTY = 0.3;
const FADE_DISTANT_AFTER = 4;
const SKIP_SECONDS = 10;
const TREND_WINDOW = 6; // samples per averaging window for the pace trend + sparkline
// practice2 renders noticeably larger than the shared scriptFontSize default —
// scoped to this page only (the store's font size still drives +/- and /practice).
const BASE_FONT_SCALE = 1.6;
const CURRENT_FONT_SCALE = 2;

export default function Practice2Page() {
  const router = useRouter();

  const script = useAppStore((s) => s.script);
  const scriptTitle = useAppStore((s) => s.scriptTitle);
  const scriptFontSize = useAppStore((s) => s.scriptFontSize);
  const increaseFont = useAppStore((s) => s.increaseFont);
  const decreaseFont = useAppStore((s) => s.decreaseFont);
  const recentScripts = useAppStore((s) => s.recentScripts);
  const setResult = useAppStore((s) => s.setResult);
  const saveScriptSession = useAppStore((s) => s.saveScriptSession);
  const setScript = useAppStore((s) => s.setScript);
  const setScriptTitle = useAppStore((s) => s.setScriptTitle);

  const audio = useAudioMetrics();
  const speech = useSpeechRecognition();
  const webcam = useWebcam();
  const recording = useRecording();

  const sentences = useMemo(() => splitSentences(script), [script]);

  const totalWords = sentences.length
    ? sentences[sentences.length - 1].cumulativeWords
    : 0;
  const targetSec = totalWords > 0 ? (totalWords / TARGET_WPM) * 60 : 0;

  // Flat word list for skip-detection: maps each script word to its sentence index.
  const scriptWords = useMemo(() => {
    const words: Array<{ word: string; sentenceIndex: number }> = [];
    sentences.forEach((s, si) => {
      s.text
        .split(/\s+/)
        .filter(Boolean)
        .forEach((w) => {
          words.push({
            word: w.toLowerCase().replace(/[^a-z0-9']/g, ""),
            sentenceIndex: si,
          });
        });
    });
    return words;
  }, [sentences]);

  const [recordState, setRecordState] = useState<RecordState>("idle");

  const [wordCountOffset, setWordCountOffset] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const pausedAccumRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);

  const mergedSamplesRef = useRef<MetricsSample[]>([]);
  const [mergedSamples, setMergedSamples] = useState<MetricsSample[]>([]);
  const [displayedFillerCounts, setDisplayedFillerCounts] = useState<Record<string, number>>({});
  const fillerCountsRef = useRef<Record<string, number>>({});
  const lastWpmRef = useRef(0);

  const stoppingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentenceRefs = useRef<Array<HTMLParagraphElement | null>>([]);

  // Refs read inside the skip-detection effect to avoid stale closures.
  const wordCountOffsetRef = useRef(0);
  const curSentIdxRef = useRef(0);
  const spokenWordCountRef = useRef(0);
  const scriptWordsRef = useRef<Array<{ word: string; sentenceIndex: number }>>([]);
  const sentencesRef = useRef(sentences);
  const prevTranscriptLenRef = useRef(0);

  useEffect(() => {
    sentenceRefs.current = sentenceRefs.current.slice(0, sentences.length);
  }, [sentences.length]);

  // Recover script from most recent entry after store rehydrates (refresh, or a
  // direct visit to /practice2 without going through /start first).
  useEffect(() => {
    if (script.trim() || !recentScripts.length) return;
    const latest = recentScripts[0];
    setScriptTitle(latest.title);
    setScript(latest.text);
  }, [recentScripts, script, setScript, setScriptTitle]);

  useEffect(() => {
    const merged = mergedSamplesRef.current;
    if (audio.samples.length < merged.length) {
      mergedSamplesRef.current = [];
      setMergedSamples([]);
      return;
    }
    if (audio.samples.length === merged.length) return;
    for (let i = merged.length; i < audio.samples.length; i++) {
      const s = audio.samples[i];
      merged.push({ t: s.t, volume: s.volume, wpm: lastWpmRef.current });
    }
    setMergedSamples(merged.slice());
  }, [audio.samples]);

  useEffect(() => {
    lastWpmRef.current = speech.wpm;
  }, [speech.wpm]);

  // Keep ref in sync with latest counts (no interval dependency on the object).
  useEffect(() => {
    fillerCountsRef.current = speech.fillerCounts;
  }, [speech.fillerCounts]);

  // Stable 5-second interval — reads from ref so it never restarts.
  useEffect(() => {
    const id = window.setInterval(() => {
      setDisplayedFillerCounts({ ...fillerCountsRef.current });
    }, 5_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (recordState !== "recording") return;
    const id = window.setInterval(() => {
      const start = startedAtRef.current;
      if (start == null) return;
      const elapsed = (performance.now() - start - pausedAccumRef.current) / 1000;
      setElapsedSec(Math.max(0, elapsed));
    }, 250);
    return () => window.clearInterval(id);
  }, [recordState]);

  const startAll = useCallback(async () => {
    prevTranscriptLenRef.current = 0;
    await audio.start();
    speech.start();
    await webcam.start();
    recording.startRecording(webcam.stream, audio.getStream());
    startedAtRef.current = performance.now();
    pausedAccumRef.current = 0;
    pausedAtRef.current = null;
    setElapsedSec(0);
    setRecordState("recording");
  }, [audio, speech, webcam, recording]);

  useEffect(() => {
    wordCountOffsetRef.current = wordCountOffset;
  }, [wordCountOffset]);
  useEffect(() => {
    spokenWordCountRef.current = speech.spokenWordCount;
  }, [speech.spokenWordCount]);
  useEffect(() => {
    scriptWordsRef.current = scriptWords;
  }, [scriptWords]);
  useEffect(() => {
    sentencesRef.current = sentences;
  }, [sentences]);

  const currentSentenceIndex = useMemo(() => {
    if (sentences.length === 0) return 0;
    // Include interim (real-time, unfinalized) words so the teleprompter tracks
    // speech immediately rather than waiting for recognition to finalize.
    const interimWords = speech.interim
      ? speech.interim.trim().split(/\s+/).filter(Boolean).length
      : 0;
    const spoken = speech.spokenWordCount + interimWords + wordCountOffset;
    let i = 0;
    while (i < sentences.length && sentences[i].cumulativeWords <= spoken) i++;
    return Math.min(i, sentences.length - 1);
  }, [sentences, speech.spokenWordCount, speech.interim, wordCountOffset]);

  useEffect(() => {
    curSentIdxRef.current = currentSentenceIndex;
  }, [currentSentenceIndex]);

  // Detect when the presenter skips 1+ sentences by matching only the *newly
  // finalized* transcript chunk against upcoming script positions. Mirrors the
  // same delta-matching approach used on /practice.
  useEffect(() => {
    if (recordState !== "recording") return;
    if (!speech.transcript) return;

    const words = scriptWordsRef.current;
    const sents = sentencesRef.current;
    if (words.length === 0) return;

    const MIN_NEW_TOKENS = 3;
    const MAX_MATCH_WORDS = 10;
    const MIN_SCORE = 0.55;
    const LOOK_AHEAD = 15;

    const tokens = speech.transcript
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.replace(/[^a-z0-9']/g, ""))
      .filter((w) => w.length > 0);

    const prevLen = prevTranscriptLenRef.current;
    const newTokens = tokens.slice(prevLen);
    prevTranscriptLenRef.current = tokens.length;

    if (newTokens.length < MIN_NEW_TOKENS) return;

    const matchWindow = newTokens.slice(-MAX_MATCH_WORDS);
    const offset = wordCountOffsetRef.current;
    const spokenCount = spokenWordCountRef.current;
    const curSentIdx = curSentIdxRef.current;

    const searchStart = Math.max(0, spokenCount + offset - 5);
    const lookAheadSent = Math.min(sents.length - 1, curSentIdx + LOOK_AHEAD);
    const searchEnd = Math.min(
      words.length - matchWindow.length,
      sents[lookAheadSent]?.cumulativeWords ?? words.length,
    );

    let bestScore = 0;
    let bestIndex = -1;
    for (let p = searchStart; p <= searchEnd; p++) {
      let score = 0;
      for (let k = 0; k < matchWindow.length && p + k < words.length; k++) {
        if (words[p + k].word === matchWindow[k]) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIndex = p;
      }
    }

    const scoreRatio = bestIndex >= 0 ? bestScore / matchWindow.length : 0;
    if (bestIndex === -1 || scoreRatio < MIN_SCORE) return;

    const matchEndIdx = bestIndex + matchWindow.length - 1;
    const matchedSentIdx = words[matchEndIdx]?.sentenceIndex ?? -1;
    if (matchedSentIdx <= curSentIdx) return;

    const newOffset = matchEndIdx + 1 - spokenCount;
    if (newOffset <= offset) return;

    setWordCountOffset(newOffset);
  }, [speech.transcript, recordState]);

  useEffect(() => {
    const el = sentenceRefs.current[currentSentenceIndex];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentSentenceIndex, scriptFontSize]);

  const onPause = useCallback(() => {
    audio.pause();
    speech.pause();
    pausedAtRef.current = performance.now();
    setRecordState("paused");
  }, [audio, speech]);

  const onResume = useCallback(() => {
    audio.resume();
    speech.resume();
    if (pausedAtRef.current != null) {
      pausedAccumRef.current += performance.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
    if (startedAtRef.current == null) startedAtRef.current = performance.now();
    setRecordState("recording");
  }, [audio, speech]);

  const togglePauseResume = useCallback(() => {
    if (recordState === "recording") onPause();
    else if (recordState === "paused") onResume();
    else startAll();
  }, [recordState, onPause, onResume, startAll]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      e.preventDefault();
      togglePauseResume();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePauseResume]);

  // Ends the session, scores it, and hands off to /report. Same finalize logic
  // as /practice's "Stop" action — /practice2 just calls it "Exit Practice"
  // once a take is underway (see onExit below).
  const finishAndReport = useCallback(async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;

    let durationMs = 0;
    if (startedAtRef.current != null) {
      const now = performance.now();
      const stillPausedFor = pausedAtRef.current != null ? now - pausedAtRef.current : 0;
      durationMs = now - startedAtRef.current - pausedAccumRef.current - stillPausedFor;
    }
    const durationSec = Math.max(0, durationMs / 1000);

    const finalSamples = mergedSamplesRef.current.slice();
    const finalPauses = audio.pauses.slice();
    const finalFillers = speech.fillers.slice();
    const finalFillerCounts = { ...speech.fillerCounts };
    const finalTranscript = speech.transcript;

    audio.stop();
    speech.stop();
    webcam.stop();

    const recordingBlob = await recording.stopRecording().catch(() => null);
    setRecordingBlob(recordingBlob);

    const fillerCount = sumValues(finalFillerCounts);
    const pauseCount = finalPauses.length;
    const longPauseCount = finalPauses.filter(
      (p) => p.end - p.start >= LONG_PAUSE_MS,
    ).length;
    const peakVolume = finalSamples.reduce((m, s) => Math.max(m, s.volume), 0);
    const avgVolume = finalSamples.length
      ? finalSamples.reduce((sum, s) => sum + s.volume, 0) / finalSamples.length
      : 0;
    const avgWpm = computeAvgWpm(finalTranscript, durationSec);
    const score = computeScore({ avgWpm, fillerCount, longPauseCount });
    const grade = gradeFromScore(score);
    const sumLine = summaryLine({ avgWpm, fillerCount, longPauseCount, score });

    const currentRecent = useAppStore.getState().recentScripts;
    const scriptId =
      currentRecent.find((r) => r.title === scriptTitle.trim() && r.text === script)?.id ??
      "";

    const result: SessionResult = {
      scriptId,
      scriptTitle,
      script,
      duration: durationSec,
      samples: finalSamples,
      pauses: finalPauses,
      fillers: finalFillers,
      transcript: finalTranscript,
      chartSnapshot: "",
    };
    setResult(result);

    if (scriptId) {
      const summary: SessionSummary = {
        savedAt: Date.now(),
        durationSec: Math.round(durationSec),
        avgWpm: Math.round(avgWpm),
        peakVolume,
        avgVolume,
        pauseCount,
        fillerCount,
        score,
        grade,
        summaryLine: sumLine,
      };
      saveScriptSession(scriptId, summary);
    }

    router.push("/report");
  }, [
    audio,
    speech,
    webcam,
    recording,
    setResult,
    saveScriptSession,
    router,
    script,
    scriptTitle,
  ]);

  // A take that never started has nothing to score — exit just returns to
  // /start. Once recording/paused, exiting finalizes and shows the report.
  const onExit = useCallback(() => {
    if (recordState === "idle") {
      recording.stopRecording().catch(() => {});
      audio.stop();
      speech.stop();
      webcam.stop();
      setRecordingBlob(null);
      router.push("/start");
      return;
    }
    finishAndReport();
  }, [recordState, recording, audio, speech, webcam, router, finishAndReport]);

  // Manual seek: shifts the word-count baseline by an estimated word delta for
  // `deltaSec` at the current (or a comfortable default) pace, then scrolls
  // there. Generalizes the same wordCountOffset mechanism the skip-detection
  // effect above already relies on.
  const skip = useCallback(
    (deltaSec: number) => {
      if (sentences.length === 0 || recordState === "idle") return;
      const paceWpm = speech.wpm > 20 ? speech.wpm : TARGET_WPM;
      const deltaWords = Math.round((paceWpm / 60) * deltaSec);
      const spokenNow = speech.spokenWordCount + wordCountOffset;
      const targetWordCount = Math.max(0, spokenNow + deltaWords);
      const newOffset = Math.max(0, targetWordCount - speech.spokenWordCount);
      setWordCountOffset(newOffset);

      let idx = 0;
      while (idx < sentences.length && sentences[idx].cumulativeWords <= targetWordCount) idx++;
      idx = Math.min(idx, sentences.length - 1);
      requestAnimationFrame(() => {
        sentenceRefs.current[idx]?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    },
    [sentences, recordState, speech.wpm, speech.spokenWordCount, wordCountOffset],
  );

  // --- Derived display values ---

  const sentenceFontPx = `${scriptFontSize}px`;
  const titleText = scriptTitle?.trim() ? scriptTitle : "Untitled script";
  const wpmDisplay = Math.round(speech.wpm).toString();
  const pausesDisplay = audio.pauses.length.toString();

  const latestVolumePct = useMemo(() => {
    if (mergedSamples.length === 0) return 0;
    const latest = mergedSamples[mergedSamples.length - 1];
    const cutoff = latest.t - 5_000;
    const windowSamples = mergedSamples.filter((s) => s.t >= cutoff);
    if (windowSamples.length === 0) return 0;
    const avg = windowSamples.reduce((s, x) => s + x.volume, 0) / windowSamples.length;
    return Math.round(Math.min(100, (avg / 0.3) * 100));
  }, [mergedSamples]);

  const paceTrend: PaceTrend = useMemo(() => {
    if (mergedSamples.length < TREND_WINDOW * 2) return "steady";
    const recent = mergedSamples.slice(-TREND_WINDOW);
    const prior = mergedSamples.slice(-TREND_WINDOW * 2, -TREND_WINDOW);
    const avg = (arr: MetricsSample[]) => arr.reduce((s, x) => s + x.wpm, 0) / arr.length;
    const delta = avg(recent) - avg(prior);
    if (delta > 6) return "rising";
    if (delta < -6) return "falling";
    return "steady";
  }, [mergedSamples]);

  const fillerEntries = useMemo(
    () => Object.entries(displayedFillerCounts).sort((a, b) => b[1] - a[1]),
    [displayedFillerCounts],
  );

  const permissionError =
    audio.error ??
    speech.error ??
    (webcam.state === "denied"
      ? "Camera access denied. Allow camera permission to continue."
      : webcam.state === "error"
        ? webcam.error
        : null);
  // See /practice's identical fix: no typeof-window guard — it defeats
  // useSyncExternalStore's hydration-safe design and causes a mismatch.
  const speechUnsupported = !speech.supported;

  const canSkip = recordState !== "idle" && sentences.length > 0;

  // Progress through the script — same "spoken" quantity that drives the
  // teleprompter position, expressed as a fraction of the whole script.
  const scriptProgress = useMemo(() => {
    if (totalWords === 0) return 0;
    const interimWords = speech.interim
      ? speech.interim.trim().split(/\s+/).filter(Boolean).length
      : 0;
    const spoken = speech.spokenWordCount + interimWords + wordCountOffset;
    return Math.max(0, Math.min(1, spoken / totalWords));
  }, [totalWords, speech.spokenWordCount, speech.interim, wordCountOffset]);

  return (
    <div className="kami-landing practice2-page">
      {sentences.length === 0 ? (
        <div className="practice2-empty">
          <p className="practice2-empty-title">No script loaded.</p>
          <p className="practice2-empty-body">
            <Link href="/start">Paste a script on the start page</Link> to begin practicing.
          </p>
        </div>
      ) : (
        <div ref={scrollRef} className="practice2-teleprompter">
          <p className="practice2-title-badge">{titleText}</p>
          <div className="practice2-guide" aria-hidden="true" />
          <div className="practice2-teleprompter-inner">
            {sentences.map((sentence, i) => {
              const distance = Math.abs(i - currentSentenceIndex);
              const isCurrent = i === currentSentenceIndex;
              const opacity = isCurrent
                ? 1
                : Math.max(
                    FADE_FLOOR,
                    1 - distance * FADE_PER_STEP - (distance > FADE_DISTANT_AFTER ? FADE_DISTANT_PENALTY : 0),
                  );
              const style: CSSProperties = {
                fontSize: `calc(${sentenceFontPx} * ${isCurrent ? CURRENT_FONT_SCALE : BASE_FONT_SCALE})`,
                opacity,
              };
              return (
                <p
                  key={i}
                  ref={(el) => {
                    sentenceRefs.current[i] = el;
                  }}
                  className={isCurrent ? "practice2-sentence is-current" : "practice2-sentence"}
                  style={style}
                >
                  {sentence.text}
                </p>
              );
            })}
          </div>
        </div>
      )}

      {(permissionError || speechUnsupported) && (
        <p className="practice2-alert" role="alert">
          {permissionError ??
            "Speech recognition isn't supported in this browser. Try Chrome or Edge for the full experience."}
        </p>
      )}

      <div className="practice2-metrics">
        <div
          className="practice2-progress"
          role="progressbar"
          aria-label="Script progress"
          aria-valuenow={Math.round(scriptProgress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="practice2-progress-fill" style={{ width: `${scriptProgress * 100}%` }} />
        </div>
        <div className="practice2-metric">
          <p className="practice2-metric-label">Elapsed</p>
          <p className="practice2-metric-value mono">{formatElapsed(elapsedSec)}</p>
          {targetSec > 0 ? (
            <p className="practice2-metric-caption">Target: {formatElapsed(targetSec)}</p>
          ) : null}
        </div>

        <div className="practice2-metric">
          <p className="practice2-metric-label">Pace (WPM)</p>
          <p className="practice2-metric-value">{wpmDisplay}</p>
          <p className="practice2-metric-caption">{paceTrend}</p>
        </div>

        <div className="practice2-metric">
          <p className="practice2-metric-label">Volume</p>
          <p className="practice2-metric-value">
            {latestVolumePct}
            <span className="practice2-metric-unit">%</span>
          </p>
          <div className="practice2-metric-bar">
            <div className="practice2-metric-bar-fill" style={{ width: `${latestVolumePct}%` }} />
          </div>
        </div>

        <div className="practice2-metric">
          <p className="practice2-metric-label">Pauses</p>
          <p className="practice2-metric-value">{pausesDisplay}</p>
        </div>

        <div className="practice2-metric practice2-fillers">
          <p className="practice2-metric-label">Filler Words</p>
          {fillerEntries.length === 0 ? (
            <p className="practice2-metric-caption">None detected</p>
          ) : (
            <div className="practice2-filler-pills">
              {fillerEntries.map(([word, count]) => (
                <span key={word} className="practice2-filler-pill">
                  <span>{word}</span>
                  <span className="practice2-filler-count">{count}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <Practice2Webcam webcam={webcam} recording={recordState === "recording"} />
      </div>

      <div className="practice2-controls">
        <button type="button" className="practice2-exit" onClick={onExit}>
          <ArrowLeft className="h-4 w-4" />
          <span>Exit Practice</span>
        </button>

        <div className="practice2-transport">
          <button
            type="button"
            className="practice2-skip"
            onClick={() => skip(-SKIP_SECONDS)}
            disabled={!canSkip}
            aria-label={`Back ${SKIP_SECONDS} seconds`}
          >
            <RotateCcw className="h-4 w-4" />
            <span>{SKIP_SECONDS}</span>
          </button>
          <button
            type="button"
            className="practice2-play"
            onClick={togglePauseResume}
            aria-label={recordState === "recording" ? "Pause" : "Play"}
          >
            {recordState === "recording" ? (
              <Pause className="h-5 w-5" fill="currentColor" />
            ) : (
              <Play className="h-5 w-5" fill="currentColor" />
            )}
          </button>
          <button
            type="button"
            className="practice2-skip"
            onClick={() => skip(SKIP_SECONDS)}
            disabled={!canSkip}
            aria-label={`Forward ${SKIP_SECONDS} seconds`}
          >
            <RotateCw className="h-4 w-4" />
            <span>{SKIP_SECONDS}</span>
          </button>
        </div>

        <div className="practice2-font-controls">
          <button
            type="button"
            className="practice2-font-btn"
            style={{ fontSize: 14 }}
            onClick={decreaseFont}
            aria-label="Decrease text size"
          >
            A−
          </button>
          <button
            type="button"
            className="practice2-font-btn"
            style={{ fontSize: 20 }}
            onClick={increaseFont}
            aria-label="Increase text size"
          >
            A+
          </button>
        </div>
      </div>
    </div>
  );
}

function Practice2Webcam({
  webcam,
  recording,
}: {
  webcam: UseWebcamResult;
  recording: boolean;
}) {
  const { stream, state } = webcam;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream && el.paused) el.play().catch(() => {});
  }, [stream]);

  return (
    <div className="practice2-webcam" data-state={state}>
      {state === "live" ? (
        <video ref={videoRef} autoPlay muted playsInline />
      ) : (
        <div className="practice2-webcam-placeholder">
          {state === "requesting" ? "Starting camera…" : "No camera"}
        </div>
      )}
      {recording ? <span className="practice2-webcam-dot" aria-label="Recording" /> : null}
    </div>
  );
}
