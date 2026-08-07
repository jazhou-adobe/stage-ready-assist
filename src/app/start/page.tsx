"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileUp, RotateCcw, Star, X } from "lucide-react";

import "../landing.css";
import { useAppStore } from "@/lib/store";
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

type HistoryCardProps = {
  script: RecentScript;
  now: number;
  onSelect: () => void;
  onDelete: () => void;
};

function HistoryCard({ script, now, onSelect, onDelete }: HistoryCardProps) {
  const summary: SessionSummary | undefined = script.lastSession;

  return (
    <div
      role="button"
      tabIndex={0}
      className="history-card"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {summary ? <span className="grade">{summary.grade}</span> : null}
      <button
        type="button"
        aria-label="Delete script"
        className="delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <p className="title">{script.title || "Untitled session"}</p>
      <p className="meta">
        {summary
          ? now
            ? `Last practiced ${formatRelative(summary.savedAt, now)}`
            : "Last practiced recently"
          : "Not yet practiced"}
      </p>

      {summary ? (
        <div className="stats">
          <div>
            <p className="label">Avg WPM</p>
            <p className="value">{Math.round(summary.avgWpm)}</p>
          </div>
          <div>
            <p className="label">Duration</p>
            <p className="value">{formatDuration(summary.durationSec)}</p>
          </div>
        </div>
      ) : (
        <p className="preview">{script.preview || "Empty script"}</p>
      )}
    </div>
  );
}

type QuickStartScript = {
  id: string;
  title: string;
  file: string;
  difficulty: 1 | 2;
  preview: string;
};

const QUICK_START_SCRIPTS: QuickStartScript[] = [
  {
    id: "llmo",
    title: "LLM Optimizer Walkthrough",
    file: "/assets/LLMO.txt",
    difficulty: 1,
    preview:
      "Chrome extension demo: audit brand presence, agentic traffic, and GEO opportunities for Frescopa.",
  },
  {
    id: "abv",
    title: "Adobe Brand Visibility Demo",
    file: "/assets/ABV.txt",
    difficulty: 2,
    preview:
      "Brand Concierge guides a shopper to Firefly, LLM Optimizer fixes AI-unreadable pages, and Experience Platform Agents refresh the site live.",
  },
  {
    id: "agent-orchestrator",
    title: "Agent Orchestrator Demo",
    file: "/assets/AgentOrchestrator.txt",
    difficulty: 2,
    preview:
      "AI Assistant campaign planning walkthrough across audience, journey, and content phases.",
  },
];

type QuickStartCardProps = {
  script: QuickStartScript;
  loading: boolean;
  onLoad: (script: QuickStartScript) => void;
};

function QuickStartCard({ script, loading, onLoad }: QuickStartCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-busy={loading}
      className="quickstart-card"
      onClick={() => onLoad(script)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onLoad(script);
        }
      }}
    >
      <span
        className="stars"
        aria-label={`Difficulty: ${script.difficulty} star${script.difficulty > 1 ? "s" : ""}`}
      >
        {Array.from({ length: script.difficulty }).map((_, i) => (
          <Star key={i} className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} />
        ))}
      </span>
      <p className="title">{script.title}</p>
      <p className="preview">{loading ? "Loading…" : script.preview}</p>
    </div>
  );
}

export default function StartPage() {
  const router = useRouter();

  const recentScripts = useAppStore((s) => s.recentScripts);
  const saveRecentScript = useAppStore((s) => s.saveRecentScript);
  const deleteRecentScript = useAppStore((s) => s.deleteRecentScript);
  const setScript = useAppStore((s) => s.setScript);
  const setScriptTitle = useAppStore((s) => s.setScriptTitle);

  const [titleDraft, setTitleDraft] = useState("");
  const [textDraft, setTextDraft] = useState("");
  const [loadingScriptId, setLoadingScriptId] = useState<string | null>(null);
  const [quickStartError, setQuickStartError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const canStart = useMemo(
    () => titleDraft.trim().length > 0 && textDraft.trim().length > 0,
    [titleDraft, textDraft],
  );

  const startPractice = (destination: "/practice" | "/practice2") => {
    if (!canStart) return;
    const title = titleDraft.trim();
    const text = textDraft;
    saveRecentScript({ title, text });
    setScriptTitle(title);
    setScript(text);
    router.push(destination);
  };

  const handleSelectRecent = (script: RecentScript) => {
    setTitleDraft(script.title);
    setTextDraft(script.text);
  };

  const handleReset = () => {
    setTitleDraft("");
    setTextDraft("");
  };

  const handleLoadQuickStart = async (script: QuickStartScript) => {
    if (loadingScriptId) return; // one load at a time — avoid overlapping fetches racing on the drafts
    setLoadingScriptId(script.id);
    setQuickStartError(null);
    try {
      const res = await fetch(script.file);
      if (!res.ok) throw new Error(`${res.status}`);
      const text = await res.text();
      setTitleDraft(script.title);
      setTextDraft(text);
    } catch {
      setQuickStartError(`Couldn't load "${script.title}". Check your connection and try again.`);
    } finally {
      setLoadingScriptId(null);
    }
  };

  return (
    <div className="kami-landing">
      <div className="app-shell">
        <header className="app-header">
          <div className="mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.ico" alt="PresentPro" />
            PresentPro
          </div>
          <Link className="back" href="/">
            &larr; Back to home
          </Link>
        </header>

        <section className="quickstart-section">
          <div className="section-head">
            <p className="section-num">Quick Start</p>
            <h2 className="section-title">Try a sample script</h2>
          </div>
          <div className="quickstart-grid">
            {QUICK_START_SCRIPTS.map((script) => (
              <QuickStartCard
                key={script.id}
                script={script}
                loading={loadingScriptId === script.id}
                onLoad={handleLoadQuickStart}
              />
            ))}
          </div>
          {quickStartError ? (
            <p className="quickstart-error" role="alert">
              {quickStartError}
            </p>
          ) : null}
        </section>

        <div className="overview-card">
          <h1>Ready to perfect your delivery?</h1>
          <p className="lede">Paste your script below to start a practice session.</p>

          <div className="field">
            <label htmlFor="start-title">Title</label>
            <input
              id="start-title"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              placeholder="Untitled session"
              required
              maxLength={120}
            />
          </div>

          <div className="field">
            <label htmlFor="start-script">Script</label>
            <textarea
              id="start-script"
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder="Paste your script here to start practicing immediately..."
              rows={10}
            />
          </div>

          <div className="overview-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={handleReset}
              disabled={!titleDraft && !textDraft}
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => startPractice("/practice2")}
              disabled={!canStart}
            >
              <FileUp className="h-4 w-4" />
              Start Practicing
            </button>
          </div>
          <p className="overview-alt-action">
            <button
              type="button"
              className="link-button"
              onClick={() => startPractice("/practice")}
              disabled={!canStart}
            >
              Or try the classic practice view →
            </button>
          </p>
        </div>

        <section className="history-section">
          <div className="section-head">
            <p className="section-num">History</p>
            <h2 className="section-title">Recent scripts</h2>
          </div>

          {recentScripts.length > 0 ? (
            <div className="history-grid">
              {recentScripts.map((script) => (
                <HistoryCard
                  key={script.id}
                  script={script}
                  now={now}
                  onSelect={() => handleSelectRecent(script)}
                  onDelete={() => deleteRecentScript(script.id)}
                />
              ))}
            </div>
          ) : (
            <p className="history-empty">
              No sessions yet — practice a script and it&apos;ll show up here.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
