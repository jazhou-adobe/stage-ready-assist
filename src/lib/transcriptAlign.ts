import type { Sentence } from "./script";

const normalizeToken = (w: string): string =>
  w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

// Caps the O(n*m) DP table so alignment stays instant even on unusually long
// scripts/transcripts. ~2000 words on each side (4M cells, ~8MB) comfortably
// covers a rehearsed presentation; beyond that we skip alignment rather than
// stall the report.
const MAX_DP_CELLS = 4_000_000;

/**
 * Best-effort alignment of the raw speech transcript onto each script
 * sentence, so the report can show "what you actually said" underneath each
 * line. Finds the longest common subsequence between normalized script
 * words and normalized transcript words (order-preserving, tolerant of
 * skips/insertions/substitutions), then attributes transcript words to
 * sentences by where they fall along that alignment path.
 *
 * Returns one string per input sentence (same length/order as `sentences`);
 * hint sentences and sentences with no matched words get "".
 */
export function alignTranscriptToSentences(
  sentences: Sentence[],
  transcript: string,
): string[] {
  const spoken: string[] = sentences.map(() => "");
  const trimmed = transcript.trim();
  if (!trimmed) return spoken;

  const scriptWords: string[] = [];
  const wordSentenceIndex: number[] = [];
  sentences.forEach((sentence, si) => {
    if (sentence.isHint) return;
    for (const tok of sentence.text.trim().split(/\s+/).filter(Boolean)) {
      scriptWords.push(normalizeToken(tok));
      wordSentenceIndex.push(si);
    }
  });

  const transcriptWordsRaw = trimmed.split(/\s+/).filter(Boolean);
  const transcriptWordsNorm = transcriptWordsRaw.map(normalizeToken);

  const n = scriptWords.length;
  const m = transcriptWordsRaw.length;
  if (n === 0 || m === 0 || (n + 1) * (m + 1) > MAX_DP_CELLS) return spoken;

  // Standard LCS DP table (dp[i][j] = LCS length of scriptWords[0..i),
  // transcriptWords[0..j)), flattened for a single typed-array allocation.
  const width = m + 1;
  const dp = new Uint16Array((n + 1) * width);
  for (let i = 1; i <= n; i++) {
    const a = scriptWords[i - 1];
    const rowBase = i * width;
    const prevRowBase = rowBase - width;
    for (let j = 1; j <= m; j++) {
      if (a && a === transcriptWordsNorm[j - 1]) {
        dp[rowBase + j] = dp[prevRowBase + j - 1] + 1;
      } else {
        const up = dp[prevRowBase + j];
        const left = dp[rowBase + j - 1];
        dp[rowBase + j] = up >= left ? up : left;
      }
    }
  }

  // Backtrack the alignment path. It's monotonic in both indices, so within
  // a sentence's contiguous scriptWords range, the first match hit while
  // walking backward is the one with the largest transcript index.
  const lastMatchForSentence: number[] = new Array(sentences.length).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const a = scriptWords[i - 1];
    if (a && a === transcriptWordsNorm[j - 1]) {
      const si = wordSentenceIndex[i - 1];
      if (lastMatchForSentence[si] === -1) lastMatchForSentence[si] = j - 1;
      i--;
      j--;
    } else if (dp[(i - 1) * width + j] >= dp[i * width + j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  // Sweep sentences in script order, consuming transcript words up through
  // each sentence's last matched word. Unmatched sentences stay "".
  let cursor = -1;
  let lastFilled = -1;
  for (let si = 0; si < sentences.length; si++) {
    const endIdx = lastMatchForSentence[si];
    if (endIdx === -1) continue;
    spoken[si] = transcriptWordsRaw.slice(cursor + 1, endIdx + 1).join(" ");
    cursor = endIdx;
    lastFilled = si;
  }
  // Trailing ad-libbed words spoken after the last matched line fold into
  // that line rather than vanishing.
  if (lastFilled >= 0 && cursor < transcriptWordsRaw.length - 1) {
    const leftover = transcriptWordsRaw.slice(cursor + 1).join(" ");
    spoken[lastFilled] = `${spoken[lastFilled]} ${leftover}`.trim();
  }

  return spoken;
}
