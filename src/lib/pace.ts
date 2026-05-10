import type { MetricsSample } from "./types";
import type { Sentence } from "./script";

export type PaceBucket = "slow" | "optimal" | "fast" | "unknown";

export const WPM_SLOW_MAX = 110;
export const WPM_FAST_MIN = 170;

export function bucketFromWpm(wpm: number): PaceBucket {
  if (!Number.isFinite(wpm) || wpm <= 0) return "unknown";
  if (wpm < WPM_SLOW_MAX) return "slow";
  if (wpm > WPM_FAST_MIN) return "fast";
  return "optimal";
}

function lerpTimeAtWords(
  cumWords: number[],
  times: number[],
  target: number,
): number | null {
  const last = cumWords[cumWords.length - 1] ?? 0;
  if (target > last) return null;
  if (target <= 0) return times[0] ?? 0;
  for (let i = 1; i < cumWords.length; i++) {
    const prev = cumWords[i - 1];
    const curr = cumWords[i];
    if (curr >= target) {
      if (curr === prev) return times[i];
      const f = (target - prev) / (curr - prev);
      return times[i - 1] + f * (times[i] - times[i - 1]);
    }
  }
  return null;
}

export function paceBucketsForSentences(
  samples: MetricsSample[],
  sentences: Sentence[],
): { buckets: PaceBucket[]; wpm: (number | null)[] } {
  const buckets: PaceBucket[] = sentences.map(() => "unknown");
  const wpm: (number | null)[] = sentences.map(() => null);
  if (sentences.length === 0 || samples.length < 2) {
    return { buckets, wpm };
  }

  const times: number[] = [samples[0].t];
  const cumWords: number[] = [0];
  let acc = 0;
  for (let i = 1; i < samples.length; i++) {
    const dtMs = samples[i].t - samples[i - 1].t;
    if (dtMs > 0) {
      acc += (samples[i - 1].wpm * dtMs) / 60000;
    }
    times.push(samples[i].t);
    cumWords.push(acc);
  }

  for (let i = 0; i < sentences.length; i++) {
    const startWords = i === 0 ? 0 : sentences[i - 1].cumulativeWords;
    const endWords = sentences[i].cumulativeWords;
    const tStart = lerpTimeAtWords(cumWords, times, startWords);
    const tEnd = lerpTimeAtWords(cumWords, times, endWords);
    if (tStart == null || tEnd == null) continue;
    const durMin = (tEnd - tStart) / 60000;
    if (durMin <= 0) continue;
    const sentenceWpm = sentences[i].wordCount / durMin;
    wpm[i] = sentenceWpm;
    buckets[i] = bucketFromWpm(sentenceWpm);
  }

  return { buckets, wpm };
}
