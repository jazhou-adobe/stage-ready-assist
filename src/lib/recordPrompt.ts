// Prompt for a script-free recording (see /practice2?mode=record and
// /report3) — there is no original script to compare against, just the raw
// transcript. This is a deliberately minimal wrapper; a fuller analysis
// template will replace the instruction text later without changing the
// call site.
export function buildRecordPrompt(transcript: string): string {
  return `Here is a transcript of a recorded talk. Review it for filler words, pacing, clarity, and structure, and suggest concrete improvements.

<transcript>
${transcript.trim()}
</transcript>`;
}
