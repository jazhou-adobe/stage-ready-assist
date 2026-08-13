"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Download, FileText, RotateCcw, Save, Sparkles } from "lucide-react";

import "../landing.css";
import { useAppStore } from "@/lib/store";
import { getRecordingBlob, loadRecordingBlob } from "@/lib/recordingBlobStore";
import {
  computeCompleteness,
  computeScore,
  gradeFromScore,
  summaryLine,
} from "@/lib/grading";
import { splitSentences } from "@/lib/script";
import { paceBucketsForSentences, type PaceBucket } from "@/lib/pace";
import { alignTranscriptToSentences } from "@/lib/transcriptAlign";
import { buildCoachingPrompt } from "@/lib/coachingPrompt";
import type { SessionResult } from "@/lib/types";

const LONG_PAUSE_MS = 1500;

// Pace legend within the kami one-accent family: ink-blue is the "good" pace,
// warm ochre reads too-slow, terracotta reads too-fast.
const BUCKET_CLASS: Record<PaceBucket, string> = {
  slow: "is-slow",
  optimal: "is-optimal",
  fast: "is-fast",
  unknown: "is-unknown",
};

function formatDurationMmSs(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTimestampMmSs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatLongDate(savedAt: number): string {
  return new Date(savedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// "Today" for the header. The client value is cached so the snapshot is stable
// — returning a fresh Date.now() each call would make useSyncExternalStore
// re-render forever. Server returns 0 so SSR markup matches the first paint.
let clientNow = 0;
const subscribeNoop = (): (() => void) => () => {};
const getNowClient = (): number => (clientNow ||= Date.now());
const getNowServer = (): number => 0;

function computeAvgWpm(transcript: string, durationSec: number): number {
  if (durationSec <= 0) return 0;
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  return (words / durationSec) * 60;
}

// The store uses skipHydration, so it rehydrates from localStorage in an
// effect (see AppShell). Until that lands, `result` is still null even when a
// persisted session exists — gate on this so a refresh doesn't flash the
// "No session" empty state before the report appears.
function useStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() =>
    useAppStore.persist.hasHydrated(),
  );
  useEffect(() => {
    if (hydrated) return;
    // Child effects run before AppShell's, so we subscribe before it triggers
    // rehydrate — onFinishHydration is guaranteed to fire for the refresh case.
    return useAppStore.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);
  return hydrated;
}

// The session recording is in memory right after a session; after a refresh
// it's restored from IndexedDB (see recordingBlobStore), so load it async.
function useRecordingBlob(): Blob | null {
  const [blob, setBlob] = useState<Blob | null>(() => getRecordingBlob());
  useEffect(() => {
    if (blob) return;
    let alive = true;
    void loadRecordingBlob().then((restored) => {
      if (alive) setBlob(restored);
    });
    return () => {
      alive = false;
    };
  }, [blob]);
  return blob;
}

export default function Report2Page() {
  const result = useAppStore((s) => s.result);
  const clearResult = useAppStore((s) => s.clearResult);
  const setScript = useAppStore((s) => s.setScript);
  const setScriptTitle = useAppStore((s) => s.setScriptTitle);
  const router = useRouter();

  const hydrated = useStoreHydrated();

  if (!hydrated) {
    return null;
  }

  if (!result) {
    return <EmptyReport />;
  }

  return (
    <Report2Content
      result={result}
      onRepractice={() => {
        // Re-load the same script into the store, then hand off to /practice2
        // for another take. clearResult() also drops the sessionStorage copy.
        setScript(result.script);
        setScriptTitle(result.scriptTitle);
        clearResult();
        router.push("/practice2");
      }}
    />
  );
}

function EmptyReport() {
  return (
    <div className="kami-landing report2-page">
      <main className="page report2 report2-empty-page">
        <div className="report2-empty">
          <p className="report2-empty-title">No session to display</p>
          <p className="report2-empty-body">
            Run a practice session to see your delivery analytics here.
          </p>
          <Link className="btn-primary" href="/start">
            Start a new session
          </Link>
        </div>
      </main>
    </div>
  );
}

function Report2Content({
  result,
  onRepractice,
}: {
  result: SessionResult;
  onRepractice: () => void;
}) {
  // `{{ ... }}` cues aren't spoken words — keep them out of per-sentence pace.
  const sentences = useMemo(
    () => splitSentences(result.script).filter((s) => !s.isHint),
    [result.script],
  );
  const { buckets } = useMemo(
    () => paceBucketsForSentences(result.samples, sentences),
    [result.samples, sentences],
  );
  const spokenLines = useMemo(
    () => alignTranscriptToSentences(sentences, result.transcript),
    [sentences, result.transcript],
  );
  const notCoveredCount = useMemo(
    () => spokenLines.filter((line) => !line).length,
    [spokenLines],
  );

  // Strip sentences the presenter never actually got to before handing the
  // script to the AI prompt — no point asking it to critique lines that were
  // never attempted. Falls back to the full script if nothing was covered.
  const coveredScript = useMemo(() => {
    const covered = sentences
      .filter((_, i) => Boolean(spokenLines[i]))
      .map((s) => s.text)
      .join(" ");
    return covered || result.script;
  }, [sentences, spokenLines, result.script]);

  const [promptCopied, setPromptCopied] = useState(false);
  const handleCopyPrompt = async () => {
    const prompt = buildCoachingPrompt(coveredScript, result.transcript);
    try {
      await navigator.clipboard.writeText(prompt);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      // Clipboard permission denied/unavailable — non-fatal, just no feedback.
    }
  };
  const [showNotCovered, setShowNotCovered] = useState(false);

  const avgWpm = useMemo(
    () => computeAvgWpm(result.transcript, result.duration),
    [result.transcript, result.duration],
  );

  const fillerCount = result.fillers.length;
  const longPauseCount = result.pauses.filter(
    (p) => p.end - p.start >= LONG_PAUSE_MS,
  ).length;
  const completeness = useMemo(
    () => computeCompleteness(result.script, result.transcript),
    [result.script, result.transcript],
  );
  const completenessPct = Math.round(completeness * 100);
  const score = computeScore({
    avgWpm,
    fillerCount,
    longPauseCount,
    completeness,
  });
  const grade = gradeFromScore(score);
  const summary = summaryLine({
    avgWpm,
    fillerCount,
    longPauseCount,
    completeness,
    score,
  });

  const fillerGroups = useMemo(() => {
    const groups = new Map<string, number[]>();
    for (const f of result.fillers) {
      const list = groups.get(f.word) ?? [];
      list.push(f.t);
      groups.set(f.word, list);
    }
    return Array.from(groups.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .map(([word, times]) => ({ word, times }));
  }, [result.fillers]);

  const titleText = result.scriptTitle?.trim() || "Untitled session";
  const now = useSyncExternalStore(subscribeNoop, getNowClient, getNowServer);
  const dateText = now ? formatLongDate(now) : "";

  const hasPace = sentences.length > 0;

  const fileBase =
    titleText.replace(/[^a-z0-9]/gi, "-").toLowerCase() || "session";

  // "Save Report" prints to PDF via the browser's native print dialog. Any
  // not-covered pace lines are force-expanded first so the saved report is
  // always complete, regardless of what was toggled on screen.
  const printAfterExpandRef = useRef(false);
  const handleSaveReport = () => {
    if (showNotCovered) {
      window.print();
      return;
    }
    printAfterExpandRef.current = true;
    setShowNotCovered(true);
  };
  useEffect(() => {
    if (!showNotCovered || !printAfterExpandRef.current) return;
    printAfterExpandRef.current = false;
    const id = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(id);
  }, [showNotCovered]);
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const recordingBlob = useRecordingBlob();
  const downloadRecording = () => {
    if (!recordingBlob) return;
    triggerDownload(recordingBlob, `${fileBase}.m4a`);
  };

  const transcript = result.transcript.trim();
  const totalWords = transcript ? transcript.split(/\s+/).filter(Boolean).length : 0;
  const scriptTotalWords = sentences.length
    ? sentences[sentences.length - 1].cumulativeWords
    : 0;
  const hasTranscript = transcript.length > 0;
  const downloadTranscript = () => {
    if (!hasTranscript) return;
    triggerDownload(
      new Blob([transcript], { type: "text/plain" }),
      `${fileBase}-transcript.txt`,
    );
  };

  return (
    <div className="kami-landing report2-page">
      <main className="page report2">
        <header className="hero">
          <div className="eyebrow">
            <span>Session Report{dateText ? ` · ${dateText}` : ""}</span>
            <span className="hero-links">
              <Link href="/start">Start</Link>
            </span>
          </div>

          <h1>{titleText}</h1>

          <p className="tagline">{summary}</p>

          <div className="hero-tokens">
            <span>
              <b>{Math.round(avgWpm)}</b> WPM average
            </span>
            <span>
              <b>{totalWords}</b> total words
            </span>
            <span>
              <b>{scriptTotalWords}</b> script words
            </span>
            <span>
              <b>{formatDurationMmSs(result.duration)}</b> duration
            </span>
            <span>
              <b>{result.pauses.length}</b> pauses
            </span>
            <span>
              <b>{fillerCount}</b> fillers
            </span>
            <span>
              <b>{completenessPct}%</b> script covered
            </span>
          </div>

          <div className="hero-cta">
            <button
              type="button"
              className="btn-ghost"
              onClick={handleSaveReport}
              title="Print or save this report as a PDF"
            >
              <Save className="h-4 w-4" />
              Save Report
            </button>
            {recordingBlob ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={downloadRecording}
                title={`${(recordingBlob.size / (1024 * 1024)).toFixed(1)} MB · M4A audio`}
              >
                <Download className="h-4 w-4" />
                Download audio
              </button>
            ) : null}
            {hasTranscript ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={downloadTranscript}
                title="Plain-text transcript (.txt)"
              >
                <FileText className="h-4 w-4" />
                Download transcript
              </button>
            ) : null}
            <button type="button" className="btn-primary" onClick={onRepractice}>
              <RotateCcw className="h-4 w-4" />
              Re-practice
            </button>
          </div>
        </header>

        <section className="report2-ai-callout">
          <div className="report2-ai-callout-icon" aria-hidden="true">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="report2-ai-callout-body">
            <h2>Want a deeper AI coaching report?</h2>
            <p>
              Copy a ready-to-use prompt with your script and transcript
              already filled in, then paste it into ChatGPT, Claude, or any
              AI chat for a detailed breakdown of filler words, omissions,
              pacing habits, and practice drills tailored to this take.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary report2-ai-callout-btn"
            onClick={handleCopyPrompt}
          >
            <Copy className="h-4 w-4" />
            {promptCopied ? "Copied!" : "Copy AI Prompt"}
          </button>
        </section>

        <section>
          <div className="section-head">
            <p className="section-num">01 · Overall</p>
            <h2 className="section-title">How it went</h2>
          </div>
          <div className="report2-score">
            <div className="report2-ring">
              <ScoreRing score={score} grade={grade} />
            </div>
            <div className="report2-score-body">
              <p className="report2-score-lede">{summary}</p>
              <p className="report2-score-note">
                Starts from how completely you delivered the script
                ({completenessPct}%), then deducts for filler words, long
                pauses, and off-target pace.
              </p>
            </div>
          </div>
        </section>

        <section>
          <div className="section-head">
            <p className="section-num">02 · Filler words</p>
            <h2 className="section-title">
              {fillerCount === 0 ? "A clean take" : "Where they slipped in"}
            </h2>
          </div>

          {fillerGroups.length === 0 ? (
            <p className="report2-note">
              No filler words detected — nicely done.
            </p>
          ) : (
            <ul className="report2-filler-list">
              {fillerGroups.map(({ word, times }) => (
                <li key={word} className="report2-filler-item">
                  <span className="report2-filler-word">
                    <span aria-hidden="true" className="report2-filler-dot" />
                    &ldquo;{word}&rdquo;
                    <span className="report2-filler-count">
                      ×{times.length}
                    </span>
                  </span>
                  <span className="report2-filler-times">
                    {times.map(formatTimestampMmSs).join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="section-head">
            <p className="section-num">03 · Pace</p>
            <h2 className="section-title">Words-per-minute flow</h2>
            <p className="section-lede">
              Each line tinted by delivery speed, with what you actually said
              lined up underneath.
            </p>
          </div>

          {hasPace ? (
            <>
              <p className="report2-pace-hint">
                Italic text beneath each line is what you actually said.
              </p>
              <div className="report2-pace-flow">
                {sentences.map((sentence, i) => {
                  const spokenText = spokenLines[i];
                  const notCovered = !spokenText;
                  if (notCovered && !showNotCovered) {
                    return (
                      <div key={i} className="report2-pace-row is-collapsed">
                        <span
                          className={`report2-sentence ${BUCKET_CLASS[buckets[i] ?? "unknown"]}`}
                        >
                          {sentence.text}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div key={i} className="report2-pace-row">
                      <span
                        className={`report2-sentence ${BUCKET_CLASS[buckets[i] ?? "unknown"]}`}
                      >
                        {sentence.text}
                      </span>
                      <div className="report2-spoken">
                        <span
                          className={`report2-spoken-text${notCovered ? " is-empty" : ""}`}
                        >
                          {spokenText || "Not detected"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {notCoveredCount > 0 ? (
                <button
                  type="button"
                  className="link-button report2-pace-toggle"
                  onClick={() => setShowNotCovered((v) => !v)}
                >
                  {showNotCovered
                    ? "Hide lines not covered"
                    : `Show ${notCoveredCount} line${notCoveredCount === 1 ? "" : "s"} not covered`}
                </button>
              ) : null}
              <div className="report2-pace-bar" aria-hidden="true">
                {sentences.map((_, i) => (
                  <span
                    key={i}
                    className={`report2-pace-seg ${BUCKET_CLASS[buckets[i] ?? "unknown"]}`}
                  />
                ))}
              </div>
              <div className="report2-legend">
                <LegendDot bucket="slow" label="Slow" />
                <LegendDot bucket="optimal" label="Optimal" />
                <LegendDot bucket="fast" label="Fast" />
              </div>
            </>
          ) : (
            <p className="report2-note">No script to analyze.</p>
          )}
        </section>

        <footer className="report2-foot">
          <Link href="/feedback">Leave feedback on this report</Link>
        </footer>
      </main>
    </div>
  );
}

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const radius = 70;
  const stroke = 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  return (
    <div className="report2-ring-inner">
      <svg className="report2-ring-svg" viewBox="0 0 160 160" aria-hidden="true">
        <circle
          cx="80"
          cy="80"
          r={radius}
          className="report2-ring-track"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx="80"
          cy="80"
          r={radius}
          className="report2-ring-value"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="report2-ring-label">
        <span className="report2-ring-score">{score}</span>
        <span className="report2-ring-grade">Grade {grade}</span>
      </div>
    </div>
  );
}

function LegendDot({ bucket, label }: { bucket: PaceBucket; label: string }) {
  return (
    <span className="report2-legend-dot">
      <span
        aria-hidden="true"
        className={`report2-legend-swatch ${BUCKET_CLASS[bucket]}`}
      />
      {label}
    </span>
  );
}
