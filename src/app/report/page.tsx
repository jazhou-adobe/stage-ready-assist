"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw, Save, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppStore } from "@/lib/store";
import {
  computeScore,
  gradeFromScore,
  summaryLine,
} from "@/lib/grading";
import { splitSentences } from "@/lib/script";
import { paceBucketsForSentences, type PaceBucket } from "@/lib/pace";
import type { SessionResult } from "@/lib/types";
import { cn } from "@/lib/utils";

const LONG_PAUSE_MS = 1500;

const BUCKET_TINT: Record<PaceBucket, string> = {
  slow: "bg-amber-100 text-amber-900",
  optimal: "bg-violet-100 text-violet-900",
  fast: "bg-rose-100 text-rose-900",
  unknown: "bg-slate-100 text-slate-700",
};

const BUCKET_SWATCH: Record<PaceBucket, string> = {
  slow: "bg-amber-400",
  optimal: "bg-violet-400",
  fast: "bg-rose-400",
  unknown: "bg-slate-300",
};

const BUCKET_DOT: Record<PaceBucket, string> = {
  slow: "bg-amber-400",
  optimal: "bg-violet-400",
  fast: "bg-rose-400",
  unknown: "bg-slate-300",
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
  if (!savedAt) return "";
  return new Date(savedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const subscribeNoop = (): (() => void) => () => {};
const getNowClient = (): number => Date.now();
const getNowServer = (): number => 0;

function computeAvgWpm(transcript: string, durationSec: number): number {
  if (durationSec <= 0) return 0;
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  return words / (durationSec / 60);
}

export default function ReportPage() {
  const result = useAppStore((s) => s.result);
  const clearResult = useAppStore((s) => s.clearResult);
  const router = useRouter();

  if (!result) {
    return <EmptyReport />;
  }

  return (
    <ReportContent
      result={result}
      onRepractice={() => {
        clearResult();
        router.push("/practice");
      }}
    />
  );
}

function EmptyReport() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <p className="text-base font-medium text-slate-900">
        No session to display
      </p>
      <p className="max-w-sm text-sm text-slate-500">
        Run a practice session to see your delivery analytics here.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex h-10 items-center rounded-md bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
      >
        Start a new session
      </Link>
    </div>
  );
}

function ReportContent({
  result,
  onRepractice,
}: {
  result: SessionResult;
  onRepractice: () => void;
}) {
  const sentences = useMemo(() => splitSentences(result.script), [
    result.script,
  ]);
  const { buckets } = useMemo(
    () => paceBucketsForSentences(result.samples, sentences),
    [result.samples, sentences],
  );

  const avgWpm = useMemo(
    () => computeAvgWpm(result.transcript, result.duration),
    [result.transcript, result.duration],
  );

  const fillerCount = result.fillers.length;
  const longPauseCount = result.pauses.filter(
    (p) => p.end - p.start >= LONG_PAUSE_MS,
  ).length;
  const score = computeScore({ avgWpm, fillerCount, longPauseCount });
  const grade = gradeFromScore(score);
  const summary = summaryLine({
    avgWpm,
    fillerCount,
    longPauseCount,
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

  const titleText =
    result.scriptTitle?.trim() || "Untitled session";
  const now = useSyncExternalStore(subscribeNoop, getNowClient, getNowServer);
  const dateText = now ? formatLongDate(now) : "";

  return (
    <div className="relative flex flex-1 flex-col gap-6 bg-slate-50 px-6 py-6 md:px-10 md:py-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Session Analytics
          </h1>
          <p className="mt-1 truncate text-sm text-slate-500">
            {titleText}
            {dateText ? ` — ${dateText}` : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            disabled
            title="Coming soon"
            className="gap-2 border-slate-300 bg-white text-slate-700 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            Save Report
          </Button>
          <Button
            onClick={onRepractice}
            className="gap-2 bg-slate-900 text-white hover:bg-slate-800"
          >
            <RotateCcw className="h-4 w-4" />
            Re-practice
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <OverallPerformanceCard
          score={score}
          grade={grade}
          summary={summary}
        />
        <PaceAnalysisCard sentences={sentences} buckets={buckets} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <FillerWordsCard
          totalCount={fillerCount}
          groups={fillerGroups}
        />
        <AICoachingPlaceholderCard />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricTile
          label="WPM Average"
          value={Math.round(avgWpm).toString()}
        />
        <MetricTile
          label="Duration"
          value={formatDurationMmSs(result.duration)}
          mono
        />
        <MetricTile
          label="Pauses"
          value={result.pauses.length.toString()}
        />
        <MetricTile
          label="Fillers"
          value={fillerCount.toString()}
        />
      </div>

      <button
        type="button"
        title="Sharing coming soon"
        aria-label="Share report"
        className={cn(
          "fixed right-6 top-1/2 z-10 -translate-y-1/2 rounded-full",
          "border border-slate-200 bg-white p-3 text-slate-500 shadow-md",
          "transition-colors hover:text-slate-900",
          "cursor-not-allowed opacity-80",
        )}
      >
        <Share2 className="h-4 w-4" />
      </button>

      <div className="mt-4 flex justify-center border-t border-slate-200 pt-6 pb-2">
        <Link
          href="/feedback"
          className="text-sm text-slate-500 transition-colors hover:text-slate-700 underline underline-offset-4"
        >
          Leave feedback on this report
        </Link>
      </div>
    </div>
  );
}

function OverallPerformanceCard({
  score,
  grade,
  summary,
}: {
  score: number;
  grade: string;
  summary: string;
}) {
  const radius = 70;
  const stroke = 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  return (
    <Card className="flex flex-col items-center gap-5 p-6">
      <div className="self-start text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Overall Performance
      </div>
      <div className="relative flex h-44 w-44 items-center justify-center">
        <svg
          className="h-full w-full -rotate-90"
          viewBox="0 0 160 160"
          aria-hidden
        >
          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke="rgb(226 232 240)"
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke="rgb(99 102 241)"
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-700"
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-5xl font-semibold tabular-nums text-slate-900">
            {score}
          </span>
          <span className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-500">
            Grade {grade}
          </span>
        </div>
      </div>
      <p className="text-center text-sm leading-relaxed text-slate-600">
        {summary}
      </p>
    </Card>
  );
}

function PaceLegendDot({
  bucket,
  label,
}: {
  bucket: PaceBucket;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-500">
      <span
        aria-hidden
        className={cn("h-2 w-2 rounded-full", BUCKET_DOT[bucket])}
      />
      {label}
    </span>
  );
}

function PaceAnalysisCard({
  sentences,
  buckets,
}: {
  sentences: ReturnType<typeof splitSentences>;
  buckets: PaceBucket[];
}) {
  const hasContent = sentences.length > 0;
  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            Pace Analysis
          </h2>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Words per minute (WPM) flow
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PaceLegendDot bucket="slow" label="Slow" />
          <PaceLegendDot bucket="optimal" label="Optimal" />
          <PaceLegendDot bucket="fast" label="Fast" />
        </div>
      </div>

      {hasContent ? (
        <>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm leading-7 text-slate-800">
            {sentences.map((sentence, i) => {
              const bucket = buckets[i] ?? "unknown";
              return (
                <span
                  key={i}
                  className={cn(
                    "mr-1 rounded px-1 py-0.5 align-baseline transition-colors",
                    BUCKET_TINT[bucket],
                  )}
                >
                  {sentence.text}
                </span>
              );
            })}
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
            {sentences.map((_, i) => {
              const bucket = buckets[i] ?? "unknown";
              return (
                <span
                  key={i}
                  className={cn("h-full flex-1", BUCKET_SWATCH[bucket])}
                />
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">No script to analyze.</p>
      )}
    </Card>
  );
}

function FillerWordsCard({
  totalCount,
  groups,
}: {
  totalCount: number;
  groups: { word: string; times: number[] }[];
}) {
  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          Filler Words
        </h2>
        <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-rose-700">
          {totalCount} Detected
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-slate-500">
          No filler words detected — nicely done.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {groups.map(({ word, times }) => (
            <li
              key={word}
              className="flex items-start justify-between gap-4 rounded-md border border-slate-200 bg-white px-3 py-2.5"
            >
              <span className="flex items-center gap-3 text-sm font-medium text-slate-900">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full bg-rose-500"
                />
                &ldquo;{word}&rdquo;
                <span className="text-xs font-normal text-slate-500">
                  ×{times.length}
                </span>
              </span>
              <span className="text-right text-xs tabular-nums text-slate-500">
                {times.map(formatTimestampMmSs).join(", ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AICoachingPlaceholderCard() {
  return (
    <Card className="flex flex-col gap-3 p-6">
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">
        AI Recommendations
      </h2>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
        <p className="text-sm font-medium text-slate-600">
          AI coaching tips coming soon
        </p>
        <p className="max-w-xs text-xs text-slate-500">
          Personalized suggestions based on your delivery will appear here in a
          future release.
        </p>
      </div>
    </Card>
  );
}

function MetricTile({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-2 p-5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <span
        className={cn(
          "text-3xl font-semibold tabular-nums text-slate-900",
          mono && "font-mono",
        )}
      >
        {value}
      </span>
    </Card>
  );
}
