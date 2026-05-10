export type Sentence = {
  text: string;
  wordCount: number;
  cumulativeWords: number;
};

export function countWords(s: string): number {
  if (!s) return 0;
  return s
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

export function splitSentences(script: string): Sentence[] {
  if (!script || !script.trim()) return [];

  const normalized = script.replace(/\r\n/g, "\n");
  const matches = normalized.match(/[^.!?\n]+(?:[.!?]+|\n+|$)/g) ?? [];

  const sentences: Sentence[] = [];
  let cumulative = 0;
  for (const raw of matches) {
    const text = raw.replace(/\n+$/g, "").trim();
    if (!text) continue;
    const wordCount = countWords(text);
    if (wordCount === 0) continue;
    cumulative += wordCount;
    sentences.push({ text, wordCount, cumulativeWords: cumulative });
  }
  return sentences;
}
