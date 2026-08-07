// Pure helpers for computing/formatting practice-session metrics.
// Shared by /practice and /practice2 so both stay in lockstep.

export function formatElapsed(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const mm = Math.floor(sec / 60).toString().padStart(2, "0");
  const ss = (sec % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export function computeAvgWpm(transcript: string, durationSec: number): number {
  if (durationSec <= 0) return 0;
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  return words / (durationSec / 60);
}

export function sumValues(record: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(record)) total += v;
  return total;
}
