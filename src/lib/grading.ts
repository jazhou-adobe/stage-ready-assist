const WPM_MIN = 110;
const WPM_MAX = 170;

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

export function computeScore({
  avgWpm,
  fillerCount,
  longPauseCount,
}: {
  avgWpm: number;
  fillerCount: number;
  longPauseCount: number;
}): number {
  let wpmPenalty = 0;
  if (avgWpm < WPM_MIN) {
    wpmPenalty = Math.min(10, (WPM_MIN - avgWpm) / 5);
  } else if (avgWpm > WPM_MAX) {
    wpmPenalty = Math.min(10, (avgWpm - WPM_MAX) / 5);
  }
  const raw = 100 - fillerCount - 5 * longPauseCount - wpmPenalty;
  return clamp(Math.round(raw), 0, 100);
}

export function gradeFromScore(score: number): string {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 87) return "A-";
  if (score >= 83) return "B+";
  if (score >= 80) return "B";
  if (score >= 77) return "B-";
  if (score >= 73) return "C+";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function gradeColor(grade: string): "green" | "amber" | "red" {
  if (grade.startsWith("A")) return "green";
  if (grade.startsWith("B")) return "amber";
  return "red";
}

export function summaryLine({
  avgWpm,
  fillerCount,
  longPauseCount,
  score,
}: {
  avgWpm: number;
  fillerCount: number;
  longPauseCount: number;
  score: number;
}): string {
  if (score >= 90) {
    return "Polished delivery — pace, fillers, and pauses all in a great range.";
  }
  if (avgWpm < WPM_MIN) {
    return "A bit slow — try picking up the pace to keep the audience engaged.";
  }
  if (avgWpm > WPM_MAX) {
    return "On the fast side — slow down a touch so each beat lands.";
  }
  if (fillerCount >= 5) {
    return "Watch the filler words — replace them with brief silent pauses.";
  }
  if (longPauseCount >= 3) {
    return "Several long pauses broke your rhythm — practice the transitions.";
  }
  return "Solid run — small tweaks will push this into A territory.";
}
