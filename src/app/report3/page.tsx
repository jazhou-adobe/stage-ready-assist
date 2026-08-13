"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Download, FileText, Sparkles } from "lucide-react";

import "../landing.css";
import { useAppStore } from "@/lib/store";
import { getRecordingBlob, loadRecordingBlob } from "@/lib/recordingBlobStore";
import { buildRecordPrompt } from "@/lib/recordPrompt";
import type { SessionResult } from "@/lib/types";

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

// The store uses skipHydration, so it rehydrates from localStorage in an
// effect (see AppShell). Gate on this so a refresh doesn't flash the "No
// recording" empty state before the report appears. Mirrors /report2.
function useStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() =>
    useAppStore.persist.hasHydrated(),
  );
  useEffect(() => {
    if (hydrated) return;
    return useAppStore.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);
  return hydrated;
}

// The session recording is in memory right after a take; after a refresh
// it's restored from IndexedDB (see recordingBlobStore). Mirrors /report2.
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

export default function Report3Page() {
  const result = useAppStore((s) => s.result);
  const hydrated = useStoreHydrated();

  if (!hydrated) {
    return null;
  }

  // Also guards a stray /report3 visit while the last session was a normal
  // (scripted) practice take — that one belongs on /report2.
  if (!result || result.mode !== "record") {
    return <EmptyReport />;
  }

  return <Report3Content result={result} />;
}

function EmptyReport() {
  return (
    <div className="kami-landing report2-page">
      <main className="page report2 report2-empty-page">
        <div className="report2-empty">
          <p className="report2-empty-title">No recording to display</p>
          <p className="report2-empty-body">
            Record a script-free take to see your transcript here.
          </p>
          <Link className="btn-primary" href="/practice2?mode=record">
            Start recording
          </Link>
        </div>
      </main>
    </div>
  );
}

function Report3Content({ result }: { result: SessionResult }) {
  const transcript = result.transcript.trim();
  const totalWords = transcript
    ? transcript.split(/\s+/).filter(Boolean).length
    : 0;
  const hasTranscript = transcript.length > 0;
  const fillerCount = result.fillers.length;
  const avgWpm = result.duration > 0 ? (totalWords / result.duration) * 60 : 0;

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

  const [promptCopied, setPromptCopied] = useState(false);
  const handleCopyPrompt = async () => {
    const prompt = buildRecordPrompt(result.transcript);
    try {
      await navigator.clipboard.writeText(prompt);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      // Clipboard permission denied/unavailable — non-fatal, just no feedback.
    }
  };

  const recordingBlob = useRecordingBlob();
  const fileBase = `recording-${result.recordedAt}`;
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  const downloadRecording = () => {
    if (!recordingBlob) return;
    triggerDownload(recordingBlob, `${fileBase}.m4a`);
  };
  const downloadTranscript = () => {
    if (!hasTranscript) return;
    triggerDownload(
      new Blob([transcript], { type: "text/plain" }),
      `${fileBase}-transcript.txt`,
    );
  };

  const recordedDate = new Date(result.recordedAt);
  const recordedLabel = `Recorded Practice - ${recordedDate.getFullYear()}/${String(recordedDate.getMonth() + 1).padStart(2, "0")}/${String(recordedDate.getDate()).padStart(2, "0")} ${String(recordedDate.getHours()).padStart(2, "0")}:${String(recordedDate.getMinutes()).padStart(2, "0")}`;
  const tagline = hasTranscript
    ? `${totalWords} word${totalWords === 1 ? "" : "s"} captured over ${formatDurationMmSs(result.duration)}.`
    : "No speech was detected in this recording.";

  return (
    <div className="kami-landing report2-page">
      <main className="page report2">
        <header className="hero">
          <div className="eyebrow">
            <span>Recording Report</span>
            <span className="hero-links">
              <Link href="/start">Start</Link>
            </span>
          </div>

          <h1>{recordedLabel}</h1>

          <p className="tagline">{tagline}</p>

          <div className="hero-tokens">
            <span>
              <b>{Math.round(avgWpm)}</b> WPM average
            </span>
            <span>
              <b>{totalWords}</b> total words
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
          </div>

          {recordingBlob || hasTranscript ? (
            <div className="hero-cta">
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
            </div>
          ) : null}
        </header>

        <section className="report2-ai-callout">
          <div className="report2-ai-callout-icon" aria-hidden="true">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="report2-ai-callout-body">
            <h2>Want a deeper AI coaching report?</h2>
            <p>
              Copy a ready-to-use prompt with your transcript already filled
              in, then paste it into ChatGPT, Claude, or any AI chat for a
              breakdown of filler words, pacing habits, and practice drills
              tailored to this recording.
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
            <p className="section-num">01 · Filler words</p>
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
            <p className="section-num">02 · Transcript</p>
            <h2 className="section-title">What you said</h2>
          </div>

          {hasTranscript ? (
            <p className="report2-transcript-block">{transcript}</p>
          ) : (
            <p className="report2-note">
              No speech was detected in this recording.
            </p>
          )}
        </section>

        <footer className="report2-foot">
          <Link href="/feedback">Leave feedback on this report</Link>
        </footer>
      </main>
    </div>
  );
}
