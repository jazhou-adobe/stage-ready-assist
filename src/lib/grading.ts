const WPM_MIN = 110;
const WPM_MAX = 170;

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

// Normalize prose to a lowercase word list for comparison. Strips `{{ ... }}`
// presenter cues (never spoken) and punctuation so only real words remain.
function normalizeWords(text: string): string[] {
  return text
    .replace(/\{\{[\s\S]*?\}\}/g, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Length of the longest common subsequence of two word lists (order-aware),
// via a rolling-row DP so memory stays O(n) for long scripts.
function lcsLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  let prev = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    const curr = new Array<number>(n + 1).fill(0);
    const ai = a[i - 1];
    for (let j = 1; j <= n; j++) {
      curr[j] =
        ai === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    prev = curr;
  }
  return prev[n];
}

// Completeness: how much of the script was actually delivered, in order, as a
// 0..1 fraction. Uses the longest common subsequence of the script and the
// spoken transcript normalized by script length (recall-oriented). An empty
// script has nothing to measure, so it counts as fully complete.
export function computeCompleteness(script: string, transcript: string): number {
  const scriptWords = normalizeWords(script);
  if (scriptWords.length === 0) return 1;
  const spokenWords = normalizeWords(transcript);
  const covered = lcsLength(scriptWords, spokenWords);
  return clamp(covered / scriptWords.length, 0, 1);
}

export function computeScore({
  avgWpm,
  fillerCount,
  longPauseCount,
  completeness,
}: {
  avgWpm: number;
  fillerCount: number;
  longPauseCount: number;
  completeness: number;
}): number {
  let wpmPenalty = 0;
  if (avgWpm < WPM_MIN) {
    wpmPenalty = Math.min(10, (WPM_MIN - avgWpm) / 5);
  } else if (avgWpm > WPM_MAX) {
    wpmPenalty = Math.min(10, (avgWpm - WPM_MAX) / 5);
  }
  // Base score is the % of the script actually delivered; delivery penalties
  // (fillers, long pauses, off-target pace) come off the top.
  const base = clamp(completeness, 0, 1) * 100;
  const raw = base - fillerCount - 5 * longPauseCount - wpmPenalty;
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
  completeness,
  score,
}: {
  avgWpm: number;
  fillerCount: number;
  longPauseCount: number;
  completeness: number;
  score: number;
}): string {
  if (completeness < 0.85) {
    return `You delivered about ${Math.round(completeness * 100)}% of your script — cover the gaps for a complete run.`;
  }
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
