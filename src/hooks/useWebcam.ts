"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type WebcamState =
  | "idle"
  | "requesting"
  | "live"
  | "denied"
  | "error";

export interface UseWebcamResult {
  start: () => Promise<void>;
  stop: () => void;
  stream: MediaStream | null;
  state: WebcamState;
  error: string | null;
}

export function useWebcam(): UseWebcamResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<WebcamState>("idle");
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);

  const stopStream = useCallback((s: MediaStream | null) => {
    if (!s) return;
    for (const track of s.getTracks()) {
      track.stop();
    }
  }, []);

  const stop = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    if (!mountedRef.current) return;
    setStream(null);
    setState("idle");
    setError(null);
  }, [stopStream]);

  const start = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("error");
      setError("Camera API not available in this browser.");
      return;
    }

    if (streamRef.current) return;

    setState("requesting");
    setError(null);

    try {
      const next = await navigator.mediaDevices.getUserMedia({ video: true });
      if (!mountedRef.current) {
        stopStream(next);
        return;
      }
      streamRef.current = next;
      setStream(next);
      setState("live");
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      const message = err instanceof Error ? err.message : "Failed to access camera.";
      if (!mountedRef.current) return;
      if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
        setState("denied");
        setError(message);
      } else {
        setState("error");
        setError(message);
      }
    }
  }, [stopStream]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [stopStream]);

  return { start, stop, stream, state, error };
}
