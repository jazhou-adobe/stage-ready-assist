export type Sentence = {
  text: string;
  wordCount: number;
  cumulativeWords: number;
  /**
   * `{{ ... }}` blocks are presenter cues (stage directions), not words to be
   * spoken. Hint sentences carry `wordCount: 0` so they render in the
   * teleprompter but never count toward pace, progress, or skip-detection.
   */
  isHint: boolean;
};

export function countWords(s: string): number {
  if (!s) return 0;
  return s
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

// `{{ ... }}` marks a presenter cue anywhere in the script. Non-greedy so
// adjacent cues don't merge; `[\s\S]` so a cue may span line breaks.
const HINT_RE = /\{\{([\s\S]*?)\}\}/g;

// Splits a hint-free chunk into sentence strings on terminal punctuation and
// line breaks.
function splitPlain(chunk: string): string[] {
  const matches = chunk.match(/[^.!?\n]+(?:[.!?]+|\n+|$)/g) ?? [];
  const out: string[] = [];
  for (const raw of matches) {
    const text = raw.replace(/\n+$/g, "").trim();
    if (text) out.push(text);
  }
  return out;
}

export function splitSentences(script: string): Sentence[] {
  if (!script || !script.trim()) return [];

  const normalized = script.replace(/\r\n/g, "\n");
  const sentences: Sentence[] = [];
  let cumulative = 0;

  const pushPlain = (chunk: string) => {
    for (const text of splitPlain(chunk)) {
      const wordCount = countWords(text);
      if (wordCount === 0) continue;
      cumulative += wordCount;
      sentences.push({ text, wordCount, cumulativeWords: cumulative, isHint: false });
    }
  };

  HINT_RE.lastIndex = 0;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HINT_RE.exec(normalized)) !== null) {
    pushPlain(normalized.slice(lastIndex, m.index));
    const hintText = m[1].trim();
    if (hintText) {
      sentences.push({ text: hintText, wordCount: 0, cumulativeWords: cumulative, isHint: true });
    }
    lastIndex = HINT_RE.lastIndex;
  }
  pushPlain(normalized.slice(lastIndex));

  return sentences;
}
