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

const WPM_WINDOW_MS = 10_000;

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
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const stateRef = useRef<RecState>("idle");
  const startedAtRef = useRef<number>(0);
  const wordTimesRef = useRef<number[]>([]);

  const recomputeWpm = useCallback((nowMs: number) => {
    const cutoff = nowMs - WPM_WINDOW_MS;
    const times = wordTimesRef.current;
    let firstValidIdx = 0;
    while (firstValidIdx < times.length && times[firstValidIdx] < cutoff) {
      firstValidIdx++;
    }
    if (firstValidIdx > 0) {
      wordTimesRef.current = times.slice(firstValidIdx);
    }
    const wordsInWindow = wordTimesRef.current.length;
    setWpm(wordsInWindow * 6);
  }, []);

  const handleFinalChunk = useCallback(
    (chunk: string) => {
      const cleaned = chunk.trim();
      if (!cleaned) return;

      const nowMs = Date.now();
      const relMs = startedAtRef.current
        ? nowMs - startedAtRef.current
        : 0;

      const wordCount = countWordsIn(cleaned);
      if (wordCount > 0) {
        for (let i = 0; i < wordCount; i++) {
          wordTimesRef.current.push(nowMs);
        }
        setSpokenWordCount((c) => c + wordCount);
      }

      setTranscript((prev) => (prev ? `${prev} ${cleaned}` : cleaned));

      if (fillerRegex) {
        const matches: FillerEvent[] = [];
        const counts: Record<string, number> = {};
        const re = new RegExp(fillerRegex.source, fillerRegex.flags);
        let m: RegExpExecArray | null;
        while ((m = re.exec(cleaned)) !== null) {
          const word = m[0].toLowerCase();
          matches.push({ word, t: relMs });
          counts[word] = (counts[word] ?? 0) + 1;
        }
        if (matches.length > 0) {
          setFillers((prev) => [...prev, ...matches]);
          setFillerCounts((prev) => {
            const next = { ...prev };
            for (const [w, n] of Object.entries(counts)) {
              next[w] = (next[w] ?? 0) + n;
            }
            return next;
          });
        }
      }

      recomputeWpm(nowMs);
    },
    [fillerRegex, recomputeWpm],
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
    [handleFinalChunk],
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
    wordTimesRef.current = [];
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
