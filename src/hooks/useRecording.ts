"use client";

import { useCallback, useRef, useState } from "react";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

export type RecordingState = "idle" | "recording" | "stopping";

export interface UseRecordingResult {
  startRecording: (audioStream: MediaStream | null) => void;
  stopRecording: () => Promise<Blob | null>;
  state: RecordingState;
  error: string | null;
}

// Records the microphone track only and muxes it into an audio-only MP4 (AAC),
// which downloads cleanly as a .m4a file. No video is captured or encoded.
async function runRecording(
  audioStream: MediaStream | null,
  signal: AbortSignal,
): Promise<Blob | null> {
  const audioTrack = audioStream?.getAudioTracks()[0] ?? null;
  if (!audioTrack) return null;

  const audioSettings = audioTrack.getSettings();
  const sampleRate = audioSettings?.sampleRate ?? 48000;
  const channelCount = audioSettings?.channelCount ?? 1;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    audio: { codec: "aac", numberOfChannels: channelCount, sampleRate },
    fastStart: "in-memory",
    firstTimestampBehavior: "cross-track-offset",
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => {
      try {
        muxer.addAudioChunk(chunk, meta ?? undefined);
      } catch {
        /* ignore late chunks */
      }
    },
    error: (err) => console.warn("[useRecording] AudioEncoder error:", err),
  });

  audioEncoder.configure({
    codec: "mp4a.40.2",
    sampleRate,
    numberOfChannels: channelCount,
    bitrate: 128_000,
  });

  let audioReader: ReadableStreamDefaultReader<AudioData> | null = null;
  signal.addEventListener(
    "abort",
    () => {
      audioReader?.cancel().catch(() => {});
    },
    { once: true },
  );

  const processor = new MediaStreamTrackProcessor({ track: audioTrack });
  audioReader =
    processor.readable.getReader() as ReadableStreamDefaultReader<AudioData>;
  try {
    while (true) {
      const { value: audioData, done } = await audioReader.read();
      if (done || signal.aborted) {
        audioData?.close();
        break;
      }
      try {
        audioEncoder.encode(audioData);
      } catch {
        /* encoder closed */
      }
      audioData.close();
    }
  } catch {
    /* reader cancelled — normal shutdown */
  }

  try {
    await audioEncoder.flush();
  } catch {
    /* ignore if already closed */
  }
  audioEncoder.close();

  muxer.finalize();

  const { buffer } = target;
  if (!buffer || buffer.byteLength === 0) return null;
  return new Blob([buffer], { type: "audio/mp4" });
}

export function useRecording(): UseRecordingResult {
  const [state, setState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);

  const stateRef = useRef<RecordingState>("idle");
  const abortRef = useRef<AbortController | null>(null);
  const recordingPromiseRef = useRef<Promise<Blob | null>>(Promise.resolve(null));

  const setStateBoth = useCallback((s: RecordingState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const startRecording = useCallback(
    (audioStream: MediaStream | null) => {
      if (stateRef.current !== "idle") return;

      if (typeof AudioEncoder === "undefined") {
        setError("Recording requires Chrome 94+ or Safari 16.4+.");
        return;
      }

      setError(null);
      setStateBoth("recording");

      const abort = new AbortController();
      abortRef.current = abort;

      recordingPromiseRef.current = runRecording(audioStream, abort.signal)
        .catch((err) => {
          console.warn("[useRecording] runRecording failed:", err);
          return null;
        })
        .finally(() => {
          setStateBoth("idle");
        });
    },
    [setStateBoth],
  );

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    if (stateRef.current === "idle") return null;
    setStateBoth("stopping");
    abortRef.current?.abort();
    const blob = await recordingPromiseRef.current;
    abortRef.current = null;
    return blob;
  }, [setStateBoth]);

  return { startRecording, stopRecording, state, error };
}
