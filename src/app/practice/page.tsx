"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MoreHorizontal, Pause, Play } from "lucide-react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import { toPng } from "html-to-image";

import { MetricsChart, type MetricsChartHandle } from "@/components/MetricsChart";
import { WebcamTile } from "@/components/WebcamTile";
import { useAudioMetrics } from "@/hooks/useAudioMetrics";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useWebcam } from "@/hooks/useWebcam";
import { useAppStore } from "@/lib/store";
import { computeScore, gradeFromScore, summaryLine } from "@/lib/grading";
import { splitSentences } from "@/lib/script";
import type {
  MetricsSample,
  SessionResult,
  SessionSummary,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type RecordState = "idle" | "recording" | "paused";

const FADE_PER_STEP = 0.18;
const FADE_LIMIT = 3;
const HINT_AUTO_CLEAR_MS = 4000;
const SILENCE_HINT_MS = 5000;
const SILENCE_CHECK_MS = 500;
const LONG_PAUSE_MS = 1500;

const formatElapsed = (totalSec: number): string => {
  const sec = Math.max(0, Math.floor(totalSec));
  const mm = Math.floor(sec / 60).toString().padStart(2, "0");
  const ss = (sec % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
};

const renderMasked = (text: string): string => {
  let out = "";
  for (const ch of text) {
    out += /\s/.test(ch) ? ch : "·";
  }
  return out;
};

const computeAvgWpm = (transcript: string, durationSec: number): number => {
  if (durationSec <= 0) return 0;
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  return words / (durationSec / 60);
};

const sumValues = (record: Record<string, number>): number => {
  let total = 0;
  for (const v of Object.values(record)) total += v;
  return total;
};

export default function PracticePage() {
  const router = useRouter();

  const script = useAppStore((s) => s.script);
  const scriptTitle = useAppStore((s) => s.scriptTitle);
  const scriptFontSize = useAppStore((s) => s.scriptFontSize);
  const increaseFont = useAppStore((s) => s.increaseFont);
  const decreaseFont = useAppStore((s) => s.decreaseFont);
  const hint = useAppStore((s) => s.hint);
  const showHint = useAppStore((s) => s.showHint);
  const clearHint = useAppStore((s) => s.clearHint);
  const setResult = useAppStore((s) => s.setResult);
  const saveScriptSession = useAppStore((s) => s.saveScriptSession);

  const audio = useAudioMetrics();
  const speech = useSpeechRecognition();
  const webcam = useWebcam();

  const sentences = useMemo(() => splitSentences(script), [script]);

  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [masked, setMasked] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const [elapsedSec, setElapsedSec] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const pausedAccumRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);

  const mergedSamplesRef = useRef<MetricsSample[]>([]);
  const [mergedSamples, setMergedSamples] = useState<MetricsSample[]>([]);
  const lastWpmRef = useRef(0);

  const lastWordChangeAtRef = useRef<number>(0);

  const chartRef = useRef<MetricsChartHandle | null>(null);
  const stoppingRef = useRef(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentenceRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    sentenceRefs.current = sentenceRefs.current.slice(0, sentences.length);
  }, [sentences.length]);

  useEffect(() => {
    lastWpmRef.current = speech.wpm;
  }, [speech.wpm]);

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
    if (recordState !== "recording") return;
    const id = window.setInterval(() => {
      const start = startedAtRef.current;
      if (start == null) return;
      const elapsed =
        (performance.now() - start - pausedAccumRef.current) / 1000;
      setElapsedSec(Math.max(0, elapsed));
    }, 250);
    return () => window.clearInterval(id);
  }, [recordState]);

  const startAll = useCallback(() => {
    audio.start();
    speech.start();
    webcam.start();
    startedAtRef.current = performance.now();
    pausedAccumRef.current = 0;
    pausedAtRef.current = null;
    lastWordChangeAtRef.current = performance.now();
    setElapsedSec(0);
    setRecordState("recording");
  }, [audio, speech, webcam]);

  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!script || !script.trim()) return;
    autoStartedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startAll();
  }, [script, startAll]);

  useEffect(() => {
    lastWordChangeAtRef.current = performance.now();
    if (hint.active) clearHint();
  }, [speech.spokenWordCount, hint.active, clearHint]);

  const currentSentenceIndex = useMemo(() => {
    if (sentences.length === 0) return 0;
    const spoken = speech.spokenWordCount;
    let i = 0;
    while (i < sentences.length && sentences[i].cumulativeWords <= spoken) i++;
    return Math.min(i, sentences.length - 1);
  }, [sentences, speech.spokenWordCount]);

  useEffect(() => {
    if (!hint.active) return;
    const t = window.setTimeout(() => clearHint(), HINT_AUTO_CLEAR_MS);
    return () => window.clearTimeout(t);
  }, [hint.active, hint.sentenceIndex, clearHint]);

  useEffect(() => {
    if (recordState !== "recording") return;
    const id = window.setInterval(() => {
      if (hint.active) return;
      const now = performance.now();
      if (now - lastWordChangeAtRef.current < SILENCE_HINT_MS) return;
      const next = currentSentenceIndex + 1;
      if (next >= sentences.length) return;
      showHint(next);
    }, SILENCE_CHECK_MS);
    return () => window.clearInterval(id);
  }, [recordState, hint.active, currentSentenceIndex, sentences.length, showHint]);

  useEffect(() => {
    const el = sentenceRefs.current[currentSentenceIndex];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentSentenceIndex, scriptFontSize]);

  const onPause = useCallback(() => {
    audio.pause();
    speech.pause();
    pausedAtRef.current = performance.now();
    clearHint();
    setRecordState("paused");
  }, [audio, speech, clearHint]);

  const onResume = useCallback(() => {
    audio.resume();
    speech.resume();
    if (pausedAtRef.current != null) {
      pausedAccumRef.current += performance.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
    if (startedAtRef.current == null) {
      startedAtRef.current = performance.now();
    }
    lastWordChangeAtRef.current = performance.now();
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
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      e.preventDefault();
      togglePauseResume();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePauseResume]);

  const onBack = useCallback(() => {
    audio.stop();
    speech.stop();
    webcam.stop();
    router.push("/");
  }, [audio, speech, webcam, router]);

  const onStop = useCallback(async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;

    let durationMs = 0;
    if (startedAtRef.current != null) {
      const now = performance.now();
      const stillPausedFor =
        pausedAtRef.current != null ? now - pausedAtRef.current : 0;
      durationMs =
        now - startedAtRef.current - pausedAccumRef.current - stillPausedFor;
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
    clearHint();

    let chartPng = "";
    const node = chartRef.current?.onSnapshot();
    if (node) {
      try {
        chartPng = await toPng(node, {
          cacheBust: true,
          pixelRatio: 2,
          backgroundColor: "#0b0e16",
        });
      } catch {
        chartPng = "";
      }
    }

    const fillerCount = sumValues(finalFillerCounts);
    const pauseCount = finalPauses.length;
    const longPauseCount = finalPauses.filter(
      (p) => p.end - p.start >= LONG_PAUSE_MS,
    ).length;
    const peakVolume = finalSamples.reduce(
      (m, s) => Math.max(m, s.volume),
      0,
    );
    const avgVolume = finalSamples.length
      ? finalSamples.reduce((sum, s) => sum + s.volume, 0) /
        finalSamples.length
      : 0;
    const avgWpm = computeAvgWpm(finalTranscript, durationSec);
    const score = computeScore({ avgWpm, fillerCount, longPauseCount });
    const grade = gradeFromScore(score);
    const sumLine = summaryLine({
      avgWpm,
      fillerCount,
      longPauseCount,
      score,
    });

    const recentScripts = useAppStore.getState().recentScripts;
    const scriptId =
      recentScripts.find(
        (r) => r.title === scriptTitle.trim() && r.text === script,
      )?.id ?? "";

    const result: SessionResult = {
      scriptId,
      scriptTitle,
      script,
      duration: durationSec,
      samples: finalSamples,
      pauses: finalPauses,
      fillers: finalFillers,
      transcript: finalTranscript,
      chartSnapshot: chartPng,
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
    clearHint,
    setResult,
    saveScriptSession,
    router,
    script,
    scriptTitle,
  ]);

  const onConfirmRestart = useCallback(() => {
    audio.stop();
    speech.stop();
    clearHint();

    mergedSamplesRef.current = [];
    setMergedSamples([]);
    startedAtRef.current = null;
    pausedAccumRef.current = 0;
    pausedAtRef.current = null;
    lastWordChangeAtRef.current = performance.now();
    setElapsedSec(0);
    setRestartOpen(false);

    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: 0, behavior: "smooth" });
      audio.start();
      speech.start();
      startedAtRef.current = performance.now();
      lastWordChangeAtRef.current = performance.now();
      setRecordState("recording");
    });
  }, [audio, speech, clearHint]);

  const toggleMask = useCallback(() => {
    setMasked((m) => !m);
  }, []);

  const onSentenceClick = useCallback(() => {
    toggleMask();
  }, [toggleMask]);

  const sentenceFontPx = `${scriptFontSize}px`;
  const titleText = scriptTitle?.trim() ? scriptTitle : "Untitled script";
  const isPaused = recordState === "paused";

  const wpmDisplay = Math.round(speech.wpm).toString();
  const latestVolume = mergedSamples.length
    ? mergedSamples[mergedSamples.length - 1].volume
    : 0;
  const volumePercent = Math.round(latestVolume * 100);
  const pausesDisplay = audio.pauses.length.toString();
  const fillersDisplay = sumValues(speech.fillerCounts).toString();

  const permissionError =
    audio.error ??
    speech.error ??
    (webcam.state === "denied"
      ? "Camera access denied. Allow camera permission to continue."
      : webcam.state === "error"
        ? webcam.error
        : null);

  const speechUnsupported =
    !speech.supported && typeof window !== "undefined";

  return (
    <main
      className={cn(
        "fixed inset-0 z-0 flex flex-col bg-neutral-950 text-neutral-100",
        "overflow-hidden",
      )}
    >
      <div className="grid h-full grid-cols-[1fr_220px] gap-4 px-6 pt-6 pb-32">
        <section className="relative overflow-hidden rounded-2xl">
          <div className="absolute left-2 top-2 z-20 flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to dashboard"
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full",
                "border border-neutral-800 bg-neutral-900/70 text-neutral-200",
                "backdrop-blur transition hover:bg-neutral-800",
              )}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex flex-col">
              <span className="text-base font-semibold leading-tight tracking-tight">
                {titleText}
              </span>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                Practice Mode
              </span>
            </div>
          </div>

          {(permissionError || speechUnsupported) && (
            <div className="absolute left-1/2 top-3 z-30 w-[min(560px,90%)] -translate-x-1/2">
              <div
                role="alert"
                className={cn(
                  "rounded-xl border border-amber-700/50 bg-amber-950/85 px-4 py-2.5",
                  "text-sm text-amber-100 shadow-lg backdrop-blur",
                )}
              >
                {permissionError ??
                  "Speech recognition isn't supported in this browser. Try Chrome or Edge for the full experience."}
              </div>
            </div>
          )}

          <div
            ref={scrollRef}
            className="absolute inset-0 overflow-y-auto scroll-smooth"
          >
            {sentences.length === 0 ? (
              <EmptyTeleprompter />
            ) : (
              <div
                className="mx-auto flex max-w-3xl flex-col items-center gap-10 px-8"
                style={{ paddingTop: "45vh", paddingBottom: "45vh" }}
              >
                {sentences.map((sentence, i) => (
                  <SentenceRow
                    key={i}
                    index={i}
                    text={sentence.text}
                    isCurrent={i === currentSentenceIndex}
                    distance={Math.abs(i - currentSentenceIndex)}
                    masked={masked}
                    isHinted={hint.active && hint.sentenceIndex === i}
                    fontPx={sentenceFontPx}
                    onClick={onSentenceClick}
                    refSetter={(el) => {
                      sentenceRefs.current[i] = el;
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
          <WebcamTile webcam={webcam} className="w-full" />
          <MetricCard
            label="Elapsed"
            value={formatElapsed(elapsedSec)}
            mono
            large
          />
          <MetricCard label="WPM" value={wpmDisplay} large />
          <VolumeCard percent={volumePercent} />
          <MetricCard label="Pauses" value={pausesDisplay} />
          <MetricCard label="Fillers" value={fillersDisplay} />
          <TrendsCard
            ref={chartRef}
            samples={mergedSamples}
            pauses={audio.pauses}
          />
        </aside>
      </div>

      <ControlPill
        recordState={recordState}
        isPaused={isPaused}
        onTogglePauseResume={togglePauseResume}
        scriptFontSize={scriptFontSize}
        onIncreaseFont={increaseFont}
        onDecreaseFont={decreaseFont}
        masked={masked}
        onToggleMask={toggleMask}
        onRestart={() => setRestartOpen(true)}
        onStop={onStop}
        onHelp={() => setHelpOpen(true)}
      />

      <RestartConfirm
        open={restartOpen}
        onOpenChange={setRestartOpen}
        onConfirm={onConfirmRestart}
      />

      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </main>
  );
}

function SentenceRow({
  index,
  text,
  isCurrent,
  distance,
  masked,
  isHinted,
  fontPx,
  onClick,
  refSetter,
}: {
  index: number;
  text: string;
  isCurrent: boolean;
  distance: number;
  masked: boolean;
  isHinted: boolean;
  fontPx: string;
  onClick: () => void;
  refSetter: (el: HTMLSpanElement | null) => void;
}) {
  const opacity = isHinted
    ? 1
    : isCurrent
      ? 1
      : Math.max(0, 1 - distance * FADE_PER_STEP - (distance > FADE_LIMIT ? 1 : 0));

  const showMasked = masked && !isHinted;
  const display = showMasked ? renderMasked(text) : text;

  const style: CSSProperties = {
    fontSize: isCurrent ? `calc(${fontPx} * 1.25)` : fontPx,
    opacity,
  };

  return (
    <span
      ref={refSetter}
      data-sentence-index={index}
      role="button"
      tabIndex={-1}
      onClick={onClick}
      style={style}
      className={cn(
        "block max-w-full cursor-pointer text-center font-medium leading-tight",
        "transition-[opacity,transform,font-size,color] duration-300",
        "select-none whitespace-pre-wrap break-words",
        isCurrent ? "text-white" : "text-neutral-300",
        showMasked && "text-neutral-500/70 tracking-wide",
        isHinted &&
          "rounded-2xl px-6 py-3 text-amber-100 ring-2 ring-amber-300/70 shadow-[0_0_40px_-10px_rgba(251,191,36,0.65)] animate-in fade-in",
      )}
    >
      {display}
    </span>
  );
}

function EmptyTeleprompter() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <p className="text-lg font-medium text-neutral-300">No script loaded.</p>
      <p className="text-sm text-neutral-500">
        Paste a script on the dashboard to start practicing.
      </p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  mono,
  large,
}: {
  label: string;
  value: string;
  mono?: boolean;
  large?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-800/80 bg-gradient-to-b from-neutral-900/90 to-neutral-950/90",
        "px-3 py-2.5 backdrop-blur",
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 leading-none text-neutral-100",
          large ? "text-2xl font-semibold" : "text-base font-semibold",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function VolumeCard({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-800/80 bg-gradient-to-b from-neutral-900/90 to-neutral-950/90",
        "px-3 py-2.5 backdrop-blur",
      )}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Volume
        </span>
        <span className="text-xs font-semibold tabular-nums text-neutral-300">
          {clamped}%
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-[width]"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

type TrendsCardProps = {
  samples: MetricsSample[];
  pauses: { start: number; end: number }[];
};

const TrendsCard = forwardRef<MetricsChartHandle, TrendsCardProps>(
  function TrendsCard({ samples, pauses }, ref) {
    return (
      <div
        className={cn(
          "rounded-xl border border-neutral-800/80 bg-gradient-to-b from-neutral-900/90 to-neutral-950/90",
          "px-3 py-2.5 backdrop-blur",
        )}
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Real-time Trends
        </div>
        <div className="mt-2">
          <MetricsChart
            ref={ref}
            samples={samples}
            pauses={pauses}
            variant="mini"
            className="!border-0 !bg-transparent !p-0"
          />
        </div>
      </div>
    );
  },
);

function ControlPill({
  isPaused,
  onTogglePauseResume,
  scriptFontSize,
  onIncreaseFont,
  onDecreaseFont,
  masked,
  onToggleMask,
  onRestart,
  onStop,
  onHelp,
}: {
  recordState: RecordState;
  isPaused: boolean;
  onTogglePauseResume: () => void;
  scriptFontSize: number;
  onIncreaseFont: () => void;
  onDecreaseFont: () => void;
  masked: boolean;
  onToggleMask: () => void;
  onRestart: () => void;
  onStop: () => void;
  onHelp: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-3 rounded-full",
          "border border-neutral-800/80 bg-neutral-900/85 px-3 py-2 shadow-2xl backdrop-blur-md",
        )}
      >
        <button
          type="button"
          onClick={onTogglePauseResume}
          aria-label={isPaused ? "Resume" : "Pause"}
          aria-pressed={!isPaused}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full",
            "bg-white text-neutral-900 transition hover:bg-neutral-200",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
          )}
        >
          {isPaused ? (
            <Play className="h-5 w-5 fill-current" />
          ) : (
            <Pause className="h-5 w-5 fill-current" />
          )}
        </button>

        <span aria-hidden className="h-7 w-px bg-neutral-700/80" />

        <div className="flex items-center gap-1.5">
          <PillIconButton onClick={onDecreaseFont} ariaLabel="Decrease font size">
            <span className="text-base font-semibold leading-none">A−</span>
          </PillIconButton>
          <span
            className="min-w-10 text-center font-mono text-xs tabular-nums text-neutral-300"
            aria-label="Current font size"
          >
            {scriptFontSize}
          </span>
          <PillIconButton onClick={onIncreaseFont} ariaLabel="Increase font size">
            <span className="text-base font-semibold leading-none">A+</span>
          </PillIconButton>
        </div>

        <span aria-hidden className="h-7 w-px bg-neutral-700/80" />

        <Menu.Root>
          <Menu.Trigger
            render={
              <button
                type="button"
                aria-label="More options"
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full",
                  "text-neutral-300 transition hover:bg-neutral-800 hover:text-white",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
                  "data-[popup-open]:bg-neutral-800 data-[popup-open]:text-white",
                )}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            }
          />
          <Menu.Portal>
            <Menu.Positioner side="top" align="end" sideOffset={10}>
              <Menu.Popup
                className={cn(
                  "z-50 min-w-44 overflow-hidden rounded-xl border border-neutral-800",
                  "bg-neutral-900/95 p-1 text-sm text-neutral-200 shadow-2xl backdrop-blur-md",
                  "outline-none",
                )}
              >
                <Menu.CheckboxItem
                  checked={masked}
                  onCheckedChange={onToggleMask}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5",
                    "select-none outline-none",
                    "data-[highlighted]:bg-neutral-800",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-sm border border-neutral-700",
                      masked && "border-white bg-white text-neutral-900",
                    )}
                  >
                    <Menu.CheckboxItemIndicator>
                      <CheckGlyph />
                    </Menu.CheckboxItemIndicator>
                  </span>
                  Mask script
                </Menu.CheckboxItem>
                <MenuItemRow
                  onClick={() => {
                    setTimeout(onRestart, 0);
                  }}
                >
                  Restart
                </MenuItemRow>
                <MenuItemRow
                  onClick={() => {
                    setTimeout(onStop, 0);
                  }}
                >
                  Stop
                </MenuItemRow>
                <MenuItemRow
                  onClick={() => {
                    setTimeout(onHelp, 0);
                  }}
                >
                  Help
                </MenuItemRow>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
    </div>
  );
}

function PillIconButton({
  children,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full",
        "text-neutral-200 transition hover:bg-neutral-800",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
      )}
    >
      {children}
    </button>
  );
}

function MenuItemRow({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Menu.Item
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5",
        "select-none outline-none",
        "data-[highlighted]:bg-neutral-800",
      )}
    >
      {children}
    </Menu.Item>
  );
}

function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}

function RestartConfirm({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 transition-opacity duration-200" />
        <AlertDialog.Popup
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border border-neutral-800 bg-neutral-900/95 p-5 text-neutral-100 shadow-2xl backdrop-blur-md",
            "outline-none",
            "data-[starting-style]:scale-95 data-[ending-style]:scale-95",
            "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
            "transition-[opacity,transform] duration-200",
          )}
        >
          <AlertDialog.Title className="text-base font-semibold">
            Restart practice?
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-neutral-400">
            This clears the current transcript, metrics, and timer, and starts
            recording from the top.
          </AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Close
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium",
                "border border-neutral-700 bg-neutral-900 text-neutral-200",
                "transition hover:bg-neutral-800",
              )}
            >
              Cancel
            </AlertDialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-semibold",
                "bg-white text-neutral-900 transition hover:bg-neutral-200",
              )}
            >
              Restart
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 transition-opacity duration-200" />
        <Dialog.Popup
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border border-neutral-800 bg-neutral-900/95 p-5 text-neutral-100 shadow-2xl backdrop-blur-md",
            "outline-none",
            "data-[starting-style]:scale-95 data-[ending-style]:scale-95",
            "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
            "transition-[opacity,transform] duration-200",
          )}
        >
          <Dialog.Title className="text-base font-semibold">
            Keyboard shortcuts
          </Dialog.Title>
          <ul className="mt-3 space-y-2 text-sm text-neutral-300">
            <ShortcutRow keys={["Space"]} label="Pause / resume" />
            <ShortcutRow keys={["Click"]} label="Toggle masked script" />
            <ShortcutRow keys={["Esc"]} label="Close menus and dialogs" />
          </ul>
          <div className="mt-5 flex justify-end">
            <Dialog.Close
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium",
                "border border-neutral-700 bg-neutral-900 text-neutral-200",
                "transition hover:bg-neutral-800",
              )}
            >
              Got it
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <li className="flex items-center justify-between gap-4">
      <span className="text-neutral-400">{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((k) => (
          <kbd
            key={k}
            className={cn(
              "rounded-md border border-neutral-700 bg-neutral-800/80 px-2 py-0.5",
              "font-mono text-[11px] text-neutral-200",
            )}
          >
            {k}
          </kbd>
        ))}
      </span>
    </li>
  );
}
