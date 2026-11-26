// Local vector memory for Gemini prompts: a hashed bag of words + character trigrams, computed on this machine
// (no embedding API call). Plain module with no imports so `node src/lib/vcache.test.ts` runs it.

export const DIMS = 256;
/** Reuse an answer only above this cosine similarity (and only when the facts match exactly). */
export const THRESHOLD = 0.97;

const fnv = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
};

/** Unit-length vector for a prompt. Similar wording → high cosine. */
export function embed(text: string): number[] {
  const v = new Array<number>(DIMS).fill(0);
  for (const w of text.toLowerCase().match(/[a-z0-9₹]+/g) ?? []) {
    v[fnv(w) % DIMS] += 2;
    const p = `#${w}#`;
    for (let i = 0; i + 3 <= p.length; i++) v[fnv(p.slice(i, i + 3)) % DIMS] += 1;
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

export const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);

/** The hard facts of a prompt — every number/date and capitalised name. Two prompts may share an answer only if these match. */
export function facts(text: string) {
  const f = new Set([...(text.match(/\d[\d,.:/-]*/g) ?? []), ...(text.match(/\b[A-Z][\w'’-]+/g) ?? [])]);
  return [...f].sort().join("|");
}
