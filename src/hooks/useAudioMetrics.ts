"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MetricsSample, PauseEvent } from "@/lib/types";

export type AudioMetricsState = "idle" | "recording" | "paused" | "stopped";

export type UseAudioMetricsResult = {
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  state: AudioMetricsState;
  samples: MetricsSample[];
  pauses: PauseEvent[];
  error: string | null;
};

const SAMPLE_INTERVAL_MS = 50;
const SILENCE_THRESHOLD = 0.05;
const SILENCE_WINDOW_SAMPLES = 6; // ~300ms rolling average
const PAUSE_MIN_DURATION_MS = 700;
const RENDER_TICK_MS = 200;

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export function useAudioMetrics(): UseAudioMetricsResult {
  const [state, setState] = useState<AudioMetricsState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [samples, setSamples] = useState<MetricsSample[]>([]);
  const [pauses, setPauses] = useState<PauseEvent[]>([]);

  const stateRef = useRef<AudioMetricsState>("idle");
  const samplesRef = useRef<MetricsSample[]>([]);
  const pausesRef = useRef<PauseEvent[]>([]);

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const rafRef = useRef<number | null>(null);
  const loopRef = useRef<(() => void) | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const lastSampleAtRef = useRef<number>(0);
  const silenceStartRef = useRef<number | null>(null);
  const recentVolumesRef = useRef<number[]>([]);

  const setStateBoth = useCallback((s: AudioMetricsState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const tearDown = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (tickIntervalRef.current !== null) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    loopRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {}
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {}
      analyserRef.current = null;
    }
    const ctx = contextRef.current;
    if (ctx && ctx.state !== "closed") {
      ctx.close().catch(() => {});
    }
    contextRef.current = null;
    bufferRef.current = null;
    silenceStartRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (stateRef.current === "recording" || stateRef.current === "paused") return;
    setError(null);
    samplesRef.current = [];
    pausesRef.current = [];
    silenceStartRef.current = null;
    recentVolumesRef.current = [];
    setSamples([]);
    setPauses([]);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone access is not supported in this browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const Ctor =
        window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (!Ctor) {
        throw new Error("Web Audio API is not supported in this browser.");
      }
      const ctx = new Ctor();
      contextRef.current = ctx;
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      sourceRef.current = source;
      analyserRef.current = analyser;
      bufferRef.current = new Float32Array(
        new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT),
      );

      startTimeRef.current = performance.now();
      lastSampleAtRef.current = 0;
      setStateBoth("recording");

      const loop = () => {
        if (stateRef.current !== "recording") return;
        const a = analyserRef.current;
        const buf = bufferRef.current;
        if (!a || !buf) return;

        const now = performance.now();
        if (now - lastSampleAtRef.current >= SAMPLE_INTERVAL_MS) {
          a.getFloatTimeDomainData(buf);
          let sumSq = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = buf[i];
            sumSq += v * v;
          }
          const rms = Math.sqrt(sumSq / buf.length);
          const volume = Math.min(1, Math.max(0, rms));
          const t = now - startTimeRef.current;
          samplesRef.current.push({ t, volume, wpm: 0 });

          // Rolling average over last SILENCE_WINDOW_SAMPLES for noise immunity
          const rv = recentVolumesRef.current;
          rv.push(volume);
          if (rv.length > SILENCE_WINDOW_SAMPLES) rv.shift();
          const avgVolume = rv.reduce((s, v) => s + v, 0) / rv.length;

          if (avgVolume < SILENCE_THRESHOLD) {
            if (silenceStartRef.current === null) {
              silenceStartRef.current = t;
            }
          } else if (silenceStartRef.current !== null) {
            const dur = t - silenceStartRef.current;
            if (dur >= PAUSE_MIN_DURATION_MS) {
              pausesRef.current.push({
                start: silenceStartRef.current,
                end: t,
              });
            }
            silenceStartRef.current = null;
          }

          lastSampleAtRef.current = now;
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      loopRef.current = loop;

      tickIntervalRef.current = setInterval(() => {
        setSamples(samplesRef.current.slice());
        setPauses(pausesRef.current.slice());
      }, RENDER_TICK_MS);

      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to access microphone.";
      setError(msg);
      tearDown();
      setStateBoth("stopped");
    }
  }, [setStateBoth, tearDown]);

  const stop = useCallback(() => {
    const cur = stateRef.current;
    if (cur === "idle" || cur === "stopped") return;
    if (silenceStartRef.current !== null) {
      const t = performance.now() - startTimeRef.current;
      const dur = t - silenceStartRef.current;
      if (dur >= PAUSE_MIN_DURATION_MS) {
        pausesRef.current.push({ start: silenceStartRef.current, end: t });
      }
      silenceStartRef.current = null;
    }
    tearDown();
    setStateBoth("stopped");
    setSamples(samplesRef.current.slice());
    setPauses(pausesRef.current.slice());
  }, [setStateBoth, tearDown]);

  const pause = useCallback(() => {
    if (stateRef.current !== "recording") return;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    silenceStartRef.current = null;
    recentVolumesRef.current = [];
    const ctx = contextRef.current;
    if (ctx && ctx.state === "running") {
      ctx.suspend().catch(() => {});
    }
    setStateBoth("paused");
  }, [setStateBoth]);

  const resume = useCallback(() => {
    if (stateRef.current !== "paused") return;
    silenceStartRef.current = null;
    recentVolumesRef.current = [];
    const ctx = contextRef.current;
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    lastSampleAtRef.current = performance.now();
    setStateBoth("recording");
    if (loopRef.current) {
      rafRef.current = requestAnimationFrame(loopRef.current);
    }
  }, [setStateBoth]);

  useEffect(() => {
    return () => {
      tearDown();
    };
  }, [tearDown]);

  return {
    start,
    stop,
    pause,
    resume,
    state,
    samples,
    pauses,
    error,
  };
}
