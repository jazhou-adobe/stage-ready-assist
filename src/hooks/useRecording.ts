"use client";

import { useCallback, useRef, useState } from "react";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

export type RecordingState = "idle" | "recording" | "stopping";

export interface UseRecordingResult {
  startRecording: (videoStream: MediaStream | null, audioStream: MediaStream | null) => void;
  stopRecording: () => Promise<Blob | null>;
  state: RecordingState;
  error: string | null;
}

async function runRecording(
  videoStream: MediaStream | null,
  audioStream: MediaStream | null,
  signal: AbortSignal,
): Promise<Blob | null> {
  const videoTrack = videoStream?.getVideoTracks()[0] ?? null;
  const audioTrack = audioStream?.getAudioTracks()[0] ?? null;

  const hasVideo = !!videoTrack;
  const hasAudio = !!audioTrack;

  if (!hasVideo && !hasAudio) return null;

  const videoSettings = videoTrack?.getSettings();
  const audioSettings = audioTrack?.getSettings();

  const width = (videoSettings?.width ?? 640) & ~1;   // must be even
  const height = (videoSettings?.height ?? 480) & ~1;
  const sampleRate = audioSettings?.sampleRate ?? 48000;
  const channelCount = audioSettings?.channelCount ?? 1;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    ...(hasVideo ? { video: { codec: "avc", width, height } } : {}),
    ...(hasAudio ? { audio: { codec: "aac", numberOfChannels: channelCount, sampleRate } } : {}),
    fastStart: "in-memory",
    firstTimestampBehavior: "cross-track-offset",
  });

  let videoEncoder: VideoEncoder | null = null;
  let audioEncoder: AudioEncoder | null = null;

  if (hasVideo && videoTrack) {
    videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        try { muxer.addVideoChunk(chunk, meta ?? undefined); } catch { /* ignore late chunks */ }
      },
      error: (err) => console.warn("[useRecording] VideoEncoder error:", err),
    });

    const videoConfig: VideoEncoderConfig = {
      codec: "avc1.42001f",
      width,
      height,
      bitrate: 2_500_000,
      framerate: 30,
      latencyMode: "quality",
      avc: { format: "avc" },
    };

    try {
      const support = await VideoEncoder.isConfigSupported(videoConfig);
      if (!support.supported) {
        videoConfig.codec = "avc1.640028";
      }
    } catch { /* proceed with default */ }

    videoEncoder.configure(videoConfig);
  }

  if (hasAudio && audioTrack) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        try { muxer.addAudioChunk(chunk, meta ?? undefined); } catch { /* ignore late chunks */ }
      },
      error: (err) => console.warn("[useRecording] AudioEncoder error:", err),
    });

    audioEncoder.configure({
      codec: "mp4a.40.2",
      sampleRate,
      numberOfChannels: channelCount,
      bitrate: 128_000,
    });
  }

  // Cancel readers when abort fires so pending reads resolve immediately
  let videoReader: ReadableStreamDefaultReader<VideoFrame | AudioData> | null = null;
  let audioReader: ReadableStreamDefaultReader<VideoFrame | AudioData> | null = null;

  signal.addEventListener("abort", () => {
    videoReader?.cancel().catch(() => {});
    audioReader?.cancel().catch(() => {});
  }, { once: true });

  let frameCount = 0;

  const videoLoop = async () => {
    if (!videoEncoder || !videoTrack) return;
    const processor = new MediaStreamTrackProcessor({ track: videoTrack });
    videoReader = processor.readable.getReader();
    try {
      while (true) {
        const { value: raw, done } = await videoReader.read();
        if (done || signal.aborted) { (raw as VideoFrame | undefined)?.close(); break; }
        const frame = raw as VideoFrame;
        const isKey = frameCount % 150 === 0;
        try { videoEncoder.encode(frame, { keyFrame: isKey }); } catch { /* encoder closed */ }
        frame.close();
        frameCount++;
      }
    } catch { /* reader cancelled — normal shutdown */ }
  };

  const audioLoop = async () => {
    if (!audioEncoder || !audioTrack) return;
    const processor = new MediaStreamTrackProcessor({ track: audioTrack });
    audioReader = processor.readable.getReader();
    try {
      while (true) {
        const { value: raw, done } = await audioReader.read();
        if (done || signal.aborted) { (raw as AudioData | undefined)?.close(); break; }
        const audioData = raw as AudioData;
        try { audioEncoder.encode(audioData); } catch { /* encoder closed */ }
        audioData.close();
      }
    } catch { /* reader cancelled — normal shutdown */ }
  };

  await Promise.all([videoLoop(), audioLoop()]);

  // Flush and close encoders
  try { await videoEncoder?.flush(); } catch { /* ignore if already closed */ }
  try { await audioEncoder?.flush(); } catch { /* ignore if already closed */ }
  videoEncoder?.close();
  audioEncoder?.close();

  muxer.finalize();

  const { buffer } = target;
  if (!buffer || buffer.byteLength === 0) return null;
  return new Blob([buffer], { type: "video/mp4" });
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

  const startRecording = useCallback((
    videoStream: MediaStream | null,
    audioStream: MediaStream | null,
  ) => {
    if (stateRef.current !== "idle") return;

    if (typeof VideoEncoder === "undefined" || typeof AudioEncoder === "undefined") {
      setError("Recording requires Chrome 94+ or Safari 16.4+.");
      return;
    }

    setError(null);
    setStateBoth("recording");

    const abort = new AbortController();
    abortRef.current = abort;

    recordingPromiseRef.current = runRecording(videoStream, audioStream, abort.signal)
      .catch((err) => {
        console.warn("[useRecording] runRecording failed:", err);
        return null;
      })
      .finally(() => {
        setStateBoth("idle");
      });
  }, [setStateBoth]);

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
