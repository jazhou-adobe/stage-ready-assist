export type MetricsSample = {
  t: number;
  volume: number;
  wpm: number;
};

export type PauseEvent = {
  start: number;
  end: number;
};

export type FillerEvent = {
  word: string;
  t: number;
};

export type SessionResult = {
  scriptId: string;
  scriptTitle: string;
  script: string;
  duration: number;
  samples: MetricsSample[];
  pauses: PauseEvent[];
  fillers: FillerEvent[];
  transcript: string;
  chartSnapshot: string;
};

export type SessionSummary = {
  savedAt: number;
  durationSec: number;
  avgWpm: number;
  peakVolume: number;
  avgVolume: number;
  pauseCount: number;
  fillerCount: number;
  score: number;
  grade: string;
  summaryLine: string;
};

export type RecentScript = {
  id: string;
  title: string;
  text: string;
  preview: string;
  savedAt: number;
  lastSession?: SessionSummary;
};

export type FeedbackCategory = "bug" | "feature" | "general";

export type FeedbackEntry = {
  id: string;
  subject: string;
  category: FeedbackCategory;
  message: string;
  submittedAt: number;
};
