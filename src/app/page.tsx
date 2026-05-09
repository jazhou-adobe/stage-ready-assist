"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { Bell, CircleUser, FileUp, MoreVertical, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { RecentScript, SessionSummary } from "@/lib/types";

const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const RELATIVE_UNITS: Array<{ ms: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { ms: 60_000, unit: "second" },
  { ms: 3_600_000, unit: "minute" },
  { ms: 86_400_000, unit: "hour" },
  { ms: 604_800_000, unit: "day" },
  { ms: 2_629_800_000, unit: "week" },
  { ms: 31_557_600_000, unit: "month" },
  { ms: Infinity, unit: "year" },
];
const UNIT_DIVISORS: Record<Intl.RelativeTimeFormatUnit, number> = {
  second: 1000,
  seconds: 1000,
  minute: 60_000,
  minutes: 60_000,
  hour: 3_600_000,
  hours: 3_600_000,
  day: 86_400_000,
  days: 86_400_000,
  week: 604_800_000,
  weeks: 604_800_000,
  month: 2_629_800_000,
  months: 2_629_800_000,
  quarter: 7_889_400_000,
  quarters: 7_889_400_000,
  year: 31_557_600_000,
  years: 31_557_600_000,
};

const subscribeMinute = (callback: () => void): (() => void) => {
  const id = window.setInterval(callback, 60_000);
  return () => window.clearInterval(id);
};
const getNow = (): number => Date.now();
const getNowServer = (): number => 0;

const formatRelative = (timestamp: number, now: number): string => {
  const diffMs = timestamp - now;
  const absMs = Math.abs(diffMs);
  if (absMs < 60_000) return "just now";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const bucket =
    RELATIVE_UNITS.find((u) => absMs < u.ms) ??
    RELATIVE_UNITS[RELATIVE_UNITS.length - 1];
  const divisor = UNIT_DIVISORS[bucket.unit];
  return rtf.format(Math.round(diffMs / divisor), bucket.unit);
};

const gradeTier = (grade: string): "good" | "ok" | "poor" => {
  const letter = grade.trim().charAt(0).toUpperCase();
  if (letter === "A") return "good";
  if (letter === "B") return "ok";
  return "poor";
};

const gradeBadgeClass = (grade: string): string => {
  const tier = gradeTier(grade);
  if (tier === "good")
    return "border-emerald-500/40 bg-emerald-50 text-emerald-700";
  if (tier === "ok") return "border-amber-500/40 bg-amber-50 text-amber-700";
  return "border-red-500/40 bg-red-50 text-red-700";
};

type RecentCardProps = {
  script: RecentScript;
  now: number;
  onSelect: () => void;
  onDelete: () => void;
};

function RecentScriptCard({ script, now, onSelect, onDelete }: RecentCardProps) {
  const summary: SessionSummary | undefined = script.lastSession;

  return (
    <Card className="relative overflow-hidden border-slate-200 bg-white text-slate-900 transition-colors hover:border-slate-300">
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full flex-col gap-4 p-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
      >
        <div className="flex items-start justify-between gap-3 pr-8">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold text-slate-900">
              {script.title || "Untitled session"}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {summary
                ? now
                  ? `Last practiced: ${formatRelative(summary.savedAt, now)}`
                  : "Last practiced recently"
                : "Not yet practiced"}
            </p>
          </div>
          {summary ? (
            <span
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-sm font-semibold",
                gradeBadgeClass(summary.grade),
              )}
            >
              {summary.grade}
            </span>
          ) : null}
        </div>

        {summary ? (
          <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Avg WPM
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {Math.round(summary.avgWpm)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Duration
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {formatDuration(summary.durationSec)}
              </p>
            </div>
          </div>
        ) : (
          <p className="line-clamp-2 border-t border-slate-200 pt-4 text-sm text-slate-500">
            {script.preview || "Empty script"}
          </p>
        )}
      </button>

      <Menu.Root>
        <Menu.Trigger
          aria-label="Recent script options"
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
        >
          <MoreVertical className="h-4 w-4" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={4} align="end">
            <Menu.Popup className="min-w-[140px] overflow-hidden rounded-md border border-slate-200 bg-white p-1 text-sm shadow-lg outline-none">
              <Menu.Item
                onClick={onDelete}
                className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-red-600 outline-none data-[highlighted]:bg-red-50 data-[highlighted]:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </Card>
  );
}

export default function DashboardPage() {
  const router = useRouter();

  const recentScripts = useAppStore((s) => s.recentScripts);
  const saveRecentScript = useAppStore((s) => s.saveRecentScript);
  const deleteRecentScript = useAppStore((s) => s.deleteRecentScript);
  const setScript = useAppStore((s) => s.setScript);
  const setScriptTitle = useAppStore((s) => s.setScriptTitle);

  const [titleDraft, setTitleDraft] = useState("");
  const [textDraft, setTextDraft] = useState("");
  const now = useSyncExternalStore(subscribeMinute, getNow, getNowServer);

  const canStart = useMemo(
    () => titleDraft.trim().length > 0 && textDraft.trim().length > 0,
    [titleDraft, textDraft],
  );

  const handleStart = () => {
    if (!canStart) return;
    const title = titleDraft.trim();
    const text = textDraft;
    saveRecentScript({ title, text });
    setScriptTitle(title);
    setScript(text);
    router.push("/practice");
  };

  const handleSelectRecent = (script: RecentScript) => {
    setTitleDraft(script.title);
    setTextDraft(script.text);
  };

  return (
    <div className="flex flex-1 flex-col gap-8 p-6 md:p-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Overview
        </h1>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500"
          >
            <Bell className="h-4 w-4" />
          </span>
          <span
            aria-hidden="true"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500"
          >
            <CircleUser className="h-5 w-5" />
          </span>
        </div>
      </header>

      <Card className="border-neutral-800 bg-neutral-900 p-8 text-neutral-50 md:p-10">
        <div className="flex flex-col gap-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-50 md:text-3xl">
              Ready to perfect your delivery?
            </h2>
            <p className="max-w-2xl text-sm text-neutral-300 md:text-base">
              Import your latest keynote, pitch, or presentation script to start
              an AI-assisted practice session.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <label
              htmlFor="dashboard-title"
              className="text-xs font-medium uppercase tracking-wider text-neutral-400"
            >
              Title
            </label>
            <Input
              id="dashboard-title"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              placeholder="Untitled session"
              required
              maxLength={120}
            />
          </div>

          <div className="flex flex-col gap-3">
            <label
              htmlFor="dashboard-script"
              className="text-xs font-medium uppercase tracking-wider text-neutral-400"
            >
              Script
            </label>
            <Textarea
              id="dashboard-script"
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder="Paste your script here to start practicing immediately..."
              rows={10}
              className="min-h-[240px]"
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleStart}
              disabled={!canStart}
              size="lg"
              className="gap-2"
            >
              <FileUp className="h-4 w-4" />
              Quick Start: Import Script
            </Button>
          </div>
        </div>
      </Card>

      {recentScripts.length > 0 ? (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Recent Scripts
            </h2>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="text-sm font-medium text-slate-500 hover:text-slate-900"
            >
              View All
            </a>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentScripts.map((script) => (
              <RecentScriptCard
                key={script.id}
                script={script}
                now={now}
                onSelect={() => handleSelectRecent(script)}
                onDelete={() => deleteRecentScript(script.id)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
