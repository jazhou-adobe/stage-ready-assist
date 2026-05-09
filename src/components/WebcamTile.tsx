"use client";

import { useEffect, useRef } from "react";

import { useWebcam, type UseWebcamResult } from "@/hooks/useWebcam";
import { cn } from "@/lib/utils";

interface WebcamTileProps {
  webcam?: UseWebcamResult;
  className?: string;
}

export function WebcamTile({ webcam, className }: WebcamTileProps) {
  const internal = useWebcam();
  const active = webcam ?? internal;
  const { stream, state } = active;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    if (stream && el.paused) {
      el.play().catch(() => {});
    }
  }, [stream]);

  return (
    <div
      className={cn(
        "relative w-56 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-lg",
        "aspect-[4/3]",
        className,
      )}
      data-state={state}
    >
      {state === "live" ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-full w-full object-cover"
        />
      ) : state === "requesting" ? (
        <div className="flex h-full w-full items-center justify-center bg-neutral-900">
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-neutral-800 via-neutral-900 to-neutral-800" />
          <span className="relative text-xs font-medium text-neutral-300">
            Requesting camera...
          </span>
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-neutral-900 text-neutral-400">
          <CameraOffIcon className="h-6 w-6" />
          <span className="text-xs font-medium">Camera unavailable</span>
        </div>
      )}

      {state === "live" ? (
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
          </span>
          Live Preview
        </div>
      ) : null}
    </div>
  );
}

function CameraOffIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M2 2l20 20" />
      <path d="M9.5 4h5l1.5 2H21a1 1 0 0 1 1 1v10.5" />
      <path d="M22 17.5L17 13.5V9.5" />
      <path d="M2 7v12a1 1 0 0 0 1 1h14" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}
