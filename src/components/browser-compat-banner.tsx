"use client";

import { useSyncExternalStore } from "react";

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
};

const subscribe = () => () => {};

const getClientSnapshot = (): boolean => {
  if (typeof window === "undefined") return true;
  const w = window as SpeechRecognitionWindow;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
};

const getServerSnapshot = (): boolean => true;

export function BrowserCompatBanner() {
  const supported = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  if (supported) return null;

  return (
    <div
      role="alert"
      className="w-full border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
    >
      <strong className="font-semibold">Heads up:</strong> Live transcription
      requires the Web Speech API. Use Chrome or Edge on desktop for the full
      PresentPro experience.
    </div>
  );
}
