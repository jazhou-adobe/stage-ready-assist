"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { DEFAULT_FILLERS } from "@/lib/fillers";
import type { FillerEvent } from "@/lib/types";

type SpeechRecognitionAlternative = {
  transcript: string;
  confidence: number;
};

type SpeechRecognitionResult = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
};

type SpeechRecognitionResultList = {
  length: number;
  [index: number]: SpeechRecognitionResult;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionErrorEventLike = {
  error: string;
  message?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

type RecState = "idle" | "recording" | "paused";

type Options = {
  fillers?: readonly string[];
};

export type UseSpeechRecognitionResult = {
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  transcript: string;
  spokenWordCount: number;
  interim: string;
  wpm: number;
  fillers: FillerEvent[];
  fillerCounts: Record<string, number>;
  supported: boolean;
  error: string | null;
};

const WPM_WINDOW_SEC = 15;
const WPM_WINDOW_MS = WPM_WINDOW_SEC * 1_000;

const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildFillerRegex = (fillers: readonly string[]): RegExp | null => {
  const cleaned = Array.from(
    new Set(
      fillers
        .map((f) => f.trim().toLowerCase())
        .filter((f) => f.length > 0),
    ),
  );
  if (cleaned.length === 0) return null;
  cleaned.sort((a, b) => b.length - a.length);
  const alt = cleaned.map(escapeRegExp).join("|");
  return new RegExp(`\\b(?:${alt})\\b`, "gi");
};

const countWordsIn = (text: string): number => {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter((w) => w.length > 0).length;
};

const getRecognitionCtor = (): SpeechRecognitionConstructor | null => {
  if (typeof window === "undefined") return null;
  const w = window as SpeechRecognitionWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const subscribeSupported = () => () => {};
const getSupportedClient = (): boolean => getRecognitionCtor() !== null;
const getSupportedServer = (): boolean => false;

export function useSpeechRecognition(
  opts?: Options,
): UseSpeechRecognitionResult {
  const fillerList = useMemo<readonly string[]>(
    () => opts?.fillers ?? DEFAULT_FILLERS,
    [opts?.fillers],
  );
  const fillerRegex = useMemo(
    () => buildFillerRegex(fillerList),
    [fillerList],
  );

  const supported = useSyncExternalStore(
    subscribeSupported,
    getSupportedClient,
    getSupportedServer,
  );
  const [transcript, setTranscript] = useState("");
  const [spokenWordCount, setSpokenWordCount] = useState(0);
  const [interim, setInterim] = useState("");
  const [wpm, setWpm] = useState(0);
  const [fillers, setFillers] = useState<FillerEvent[]>([]);
  const [fillerCounts, setFillerCounts] = useState<Record<string, number>>({});
  // Committed = from final results; interim = current unconfirmed segment
  const committedFillerCountsRef = useRef<Record<string, number>>({});
  const interimFillerCountsRef = useRef<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const stateRef = useRef<RecState>("idle");
  const startedAtRef = useRef<number>(0);
  // Two separate queues so interim can be replaced cleanly when final arrives
  const finalWordTimesRef = useRef<number[]>([]);
  const interimWordTimesRef = useRef<number[]>([]);
  // Track how many words were in the last interim result to detect deltas
  const lastInterimWordCountRef = useRef<number>(0);

  const mergeFillerCounts = useCallback(() => {
    const merged: Record<string, number> = { ...committedFillerCountsRef.current };
    for (const [w, n] of Object.entries(interimFillerCountsRef.current)) {
      merged[w] = (merged[w] ?? 0) + n;
    }
    setFillerCounts(merged);
  }, []);

  const recomputeWpm = useCallback((nowMs: number) => {
    const cutoff = nowMs - WPM_WINDOW_MS;

    // Discard timestamps older than the window from both queues
    let i = 0;
    while (i < finalWordTimesRef.current.length && finalWordTimesRef.current[i] < cutoff) i++;
    if (i > 0) finalWordTimesRef.current = finalWordTimesRef.current.slice(i);

    let j = 0;
    while (j < interimWordTimesRef.current.length && interimWordTimesRef.current[j] < cutoff) j++;
    if (j > 0) interimWordTimesRef.current = interimWordTimesRef.current.slice(j);

    // Count words in window and extrapolate to a full minute
    const count = finalWordTimesRef.current.length + interimWordTimesRef.current.length;
    setWpm((count / WPM_WINDOW_SEC) * 60);
  }, []);

  const handleFinalChunk = useCallback(
    (chunk: string) => {
      const cleaned = chunk.trim();
      if (!cleaned) return;

      const nowMs = Date.now();
      const relMs = startedAtRef.current ? nowMs - startedAtRef.current : 0;

      // Count filler occurrences to exclude them from WPM
      let fillerWordCount = 0;
      if (fillerRegex) {
        const matches: FillerEvent[] = [];
        const re = new RegExp(fillerRegex.source, fillerRegex.flags);
        let m: RegExpExecArray | null;
        while ((m = re.exec(cleaned)) !== null) {
          const word = m[0].toLowerCase();
          matches.push({ word, t: relMs });
          committedFillerCountsRef.current[word] =
            (committedFillerCountsRef.current[word] ?? 0) + 1;
          fillerWordCount += word.split(/\s+/).length;
        }
        // Final replaces interim — clear interim state
        interimFillerCountsRef.current = {};
        interimWordTimesRef.current = [];
        lastInterimWordCountRef.current = 0;
        if (matches.length > 0) setFillers((prev) => [...prev, ...matches]);
        mergeFillerCounts();
      } else {
        interimWordTimesRef.current = [];
        lastInterimWordCountRef.current = 0;
      }

      const totalWords = countWordsIn(cleaned);
      const meaningfulWords = Math.max(0, totalWords - fillerWordCount);

      if (totalWords > 0) setSpokenWordCount((c) => c + totalWords);

      // Push one timestamp per meaningful (non-filler) word into the final queue
      for (let i = 0; i < meaningfulWords; i++) {
        finalWordTimesRef.current.push(nowMs);
      }

      setTranscript((prev) => (prev ? `${prev} ${cleaned}` : cleaned));
      recomputeWpm(nowMs);
    },
    [fillerRegex, recomputeWpm, mergeFillerCounts],
  );

  const attachHandlers = useCallback(
    (rec: SpeechRecognitionLike) => {
      rec.onresult = (event) => {
        let interimText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const alt = result[0];
          if (!alt) continue;
          if (result.isFinal) {
            handleFinalChunk(alt.transcript);
          } else {
            interimText += alt.transcript;
          }
        }
        setInterim(interimText);

        const nowMs = Date.now();
        const currentInterimWordCount = countWordsIn(interimText);
        const prevInterimWordCount = lastInterimWordCountRef.current;

        // Delta-based interim WPM: only add timestamps for newly spoken words,
        // trim if STT corrected downward
        if (currentInterimWordCount > prevInterimWordCount) {
          for (let k = prevInterimWordCount; k < currentInterimWordCount; k++) {
            interimWordTimesRef.current.push(nowMs);
          }
        } else if (currentInterimWordCount < prevInterimWordCount) {
          interimWordTimesRef.current = interimWordTimesRef.current.slice(
            0,
            currentInterimWordCount,
          );
        }
        lastInterimWordCountRef.current = currentInterimWordCount;
        recomputeWpm(nowMs);

        // Scan interim for fillers (catches um/hmm that browsers strip from finals)
        if (fillerRegex) {
          const counts: Record<string, number> = {};
          const re = new RegExp(fillerRegex.source, fillerRegex.flags);
          let m: RegExpExecArray | null;
          while ((m = re.exec(interimText)) !== null) {
            const word = m[0].toLowerCase();
            counts[word] = (counts[word] ?? 0) + 1;
          }
          interimFillerCountsRef.current = counts;
          mergeFillerCounts();
        }
      };

      rec.onerror = (event) => {
        if (event.error === "no-speech" || event.error === "aborted") {
          return;
        }
        setError(event.message || event.error || "speech-recognition-error");
      };

      rec.onend = () => {
        if (stateRef.current === "recording") {
          try {
            rec.start();
          } catch {
            // ignore — start will fail if already started; next onend will retry
          }
        }
      };
    },
    [handleFinalChunk, fillerRegex, mergeFillerCounts],
  );

  const ensureRecognition = useCallback((): SpeechRecognitionLike | null => {
    if (recognitionRef.current) return recognitionRef.current;
    const Ctor = getRecognitionCtor();
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    attachHandlers(rec);
    recognitionRef.current = rec;
    return rec;
  }, [attachHandlers]);

  const start = useCallback(() => {
    const rec = ensureRecognition();
    if (!rec) {
      setError("Web Speech API is not supported in this browser.");
      return;
    }
    setError(null);
    setTranscript("");
    setSpokenWordCount(0);
    setInterim("");
    setWpm(0);
    setFillers([]);
    setFillerCounts({});
    committedFillerCountsRef.current = {};
    interimFillerCountsRef.current = {};
    finalWordTimesRef.current = [];
    interimWordTimesRef.current = [];
    lastInterimWordCountRef.current = 0;
    startedAtRef.current = Date.now();
    stateRef.current = "recording";
    try {
      rec.start();
    } catch {
      // recognition was already started — keep state but surface a hint via onerror if it bubbles
    }
  }, [ensureRecognition]);

  const stop = useCallback(() => {
    stateRef.current = "idle";
    setInterim("");
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      // noop
    }
  }, []);

  const pause = useCallback(() => {
    if (stateRef.current !== "recording") return;
    stateRef.current = "paused";
    setInterim("");
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      // noop
    }
  }, []);

  const resume = useCallback(() => {
    if (stateRef.current !== "paused") return;
    const rec = ensureRecognition();
    if (!rec) return;
    stateRef.current = "recording";
    try {
      rec.start();
    } catch {
      // already started
    }
  }, [ensureRecognition]);

  // Recompute WPM every second so it decays when speech stops
  useEffect(() => {
    const id = window.setInterval(() => {
      if (stateRef.current === "recording") {
        recomputeWpm(Date.now());
      }
    }, 1_000);
    return () => window.clearInterval(id);
  }, [recomputeWpm]);

  useEffect(() => {
    return () => {
      stateRef.current = "idle";
      const rec = recognitionRef.current;
      if (!rec) return;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        // noop
      }
      recognitionRef.current = null;
    };
  }, []);

  return {
    start,
    stop,
    pause,
    resume,
    transcript,
    spokenWordCount,
    interim,
    wpm,
    fillers,
    fillerCounts,
    supported,
    error,
  };
}
