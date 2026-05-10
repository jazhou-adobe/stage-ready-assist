"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import type { FeedbackCategory, FeedbackEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Bug Report",
  feature: "Feature Request",
  general: "General Feedback",
};

const CATEGORY_BADGE: Record<FeedbackCategory, string> = {
  bug: "bg-rose-900/40 text-rose-400 border border-rose-800/50",
  feature: "bg-violet-900/40 text-violet-400 border border-violet-800/50",
  general: "bg-sky-900/40 text-sky-400 border border-sky-800/50",
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getInitials(subject: string): string {
  const words = subject.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function FeedbackItemCard({ entry }: { entry: FeedbackEntry }) {
  return (
    <div className="flex gap-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-200">
        {getInitials(entry.subject)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-100 truncate">
            {entry.subject}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              CATEGORY_BADGE[entry.category],
            )}
          >
            {CATEGORY_LABELS[entry.category]}
          </span>
          <span className="ml-auto text-xs text-slate-500 shrink-0">
            {formatDate(entry.submittedAt)}
          </span>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-400 line-clamp-3">
          {entry.message}
        </p>
      </div>
    </div>
  );
}

function FeedbackList({
  feedbacks,
}: {
  feedbacks: FeedbackEntry[];
}) {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<FeedbackCategory | "all">("all");

  const filtered =
    filter === "all" ? feedbacks : feedbacks.filter((f) => f.category === filter);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  const filterBtn = (val: FeedbackCategory | "all", label: string) => (
    <button
      key={val}
      type="button"
      onClick={() => {
        setFilter(val);
        setPage(1);
      }}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        filter === val
          ? "bg-slate-700 text-white"
          : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-100">
          Recent Feedback
        </h2>
        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
          {filterBtn("all", "All")}
          {filterBtn("bug", "Bugs")}
          {filterBtn("feature", "Features")}
          {filterBtn("general", "General")}
        </div>
      </div>

      {pageItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-800 bg-slate-900/50 py-14 text-center">
          <p className="text-sm font-medium text-slate-400">No feedback yet</p>
          <p className="text-xs text-slate-600">
            Submitted feedback will appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pageItems.map((entry) => (
            <FeedbackItemCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded px-2 py-1 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                className={cn(
                  "min-w-[28px] rounded px-2 py-1 transition-colors",
                  p === currentPage
                    ? "bg-slate-700 text-white"
                    : "hover:bg-slate-800",
                )}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded px-2 py-1 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FeedbackPage() {
  const feedbacks = useAppStore((s) => s.feedbacks);
  const addFeedback = useAppStore((s) => s.addFeedback);

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("general");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = subject.trim().length > 0 && message.trim().length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    addFeedback({ subject, category, message });
    setSubject("");
    setCategory("general");
    setMessage("");
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  }

  return (
    <div className="flex flex-1 flex-col bg-slate-950 text-slate-100">
      {/* Hero */}
      <div className="border-b border-slate-800 bg-slate-900 px-8 py-10">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Help us improve the Studio.
        </h1>
        <p className="mt-1.5 max-w-xl text-sm text-slate-400">
          Share bugs, ideas, or general thoughts. Every piece of feedback helps
          us build a better practice experience.
        </p>
      </div>

      {/* Body: two-column layout */}
      <div className="grid flex-1 grid-cols-1 gap-8 p-8 lg:grid-cols-2">
        {/* Left: Submit form */}
        <div className="flex flex-col gap-6">
          <h2 className="text-base font-semibold text-slate-100">
            Submit Feedback
          </h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="subject"
                className="text-xs font-medium uppercase tracking-wider text-slate-400"
              >
                Subject
              </label>
              <input
                id="subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief summary of your feedback"
                maxLength={120}
                className={cn(
                  "rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5",
                  "text-sm text-slate-100 placeholder:text-slate-500",
                  "outline-none transition-colors focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50",
                )}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="category"
                className="text-xs font-medium uppercase tracking-wider text-slate-400"
              >
                Category
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as FeedbackCategory)
                }
                className={cn(
                  "rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5",
                  "text-sm text-slate-100",
                  "outline-none transition-colors focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50",
                )}
              >
                <option value="bug">Bug Report</option>
                <option value="feature">Feature Request</option>
                <option value="general">General Feedback</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="message"
                className="text-xs font-medium uppercase tracking-wider text-slate-400"
              >
                Message
              </label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your feedback in detail..."
                rows={6}
                maxLength={2000}
                className={cn(
                  "resize-none rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5",
                  "text-sm text-slate-100 placeholder:text-slate-500",
                  "outline-none transition-colors focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50",
                )}
              />
              <span className="self-end text-xs text-slate-600">
                {message.length}/2000
              </span>
            </div>

            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={!canSubmit}
                className={cn(
                  "rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors",
                  "bg-sky-600 text-white hover:bg-sky-500",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                Submit Feedback
              </button>
              {submitted && (
                <span className="text-sm text-emerald-400">
                  Thanks for your feedback!
                </span>
              )}
            </div>
          </form>
        </div>

        {/* Right: Feedback list */}
        <FeedbackList feedbacks={feedbacks} />
      </div>
    </div>
  );
}
