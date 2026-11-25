// Scroll-scrubbed fox: 241 pre-cut frames (public/fox, transparent WebP) fetched once as blobs, then drawn instantly.
// The frames were matted out of the Kling clip offline so the fox keeps its true colours over any background.
// Client-only module (uses window, createImageBitmap).

/** Transparent cut-out stills for phones / reduced motion. */
export const foxStill = (which: "hero" | "story") => `/fox/${which}.webp`;

export const FRAMES = 241;
const STORE_W = 960; // stored frame width; the clip is 1280×720
const frameUrl = (i: number) => `/fox/${String(i).padStart(3, "0")}.webp`;

type Store = { blobs: (Blob | undefined)[]; count: number; w: number; h: number; listeners: Set<() => void> };
let store: Store | null = null;

/** Starts fetching on first call (once per page session) and returns the shared frame store. */
export function foxFrames(): Store {
  if (store) return store;
  const s: Store = { blobs: new Array(FRAMES), count: 0, w: STORE_W, h: Math.round((STORE_W * 9) / 16), listeners: new Set() };
  store = s;
  let next = 0;
  const worker = async () => {
    while (next < FRAMES) {
      const i = next++;
      const res = await fetch(frameUrl(i)).catch(() => null);
      if (res?.ok) put(s, i, await res.blob());
    }
  };
  for (let k = 0; k < 6; k++) worker(); // in order, 6 at a time
  return s;
}

function put(s: Store, i: number, blob: Blob) {
  if (i < 0 || i >= FRAMES || s.blobs[i]) return;
  s.blobs[i] = blob;
  s.count++;
  s.listeners.forEach((f) => f());
}

// ───────── bitmap cache (LRU) ─────────

const LRU = 56;
const bitmaps = new Map<number, ImageBitmap>();
const inflight = new Set<number>();

/** Decoded bitmap for frame i, or the nearest decoded one within 12 frames. */
export function bitmapNear(i: number) {
  const hit = bitmaps.get(i);
  if (hit) {
    bitmaps.delete(i);
    bitmaps.set(i, hit); // refresh LRU position
    return { i, bmp: hit };
  }
  for (let d = 1; d <= 12; d++) {
    for (const j of [i - d, i + d]) {
      const b = bitmaps.get(j);
      if (b) return { i: j, bmp: b };
    }
  }
  return null;
}

export const bitmapExact = (i: number) => bitmaps.get(i);

/** Queue decodes for frames [from, to], at most 8 in flight. */
export function warm(s: Store, from: number, to: number, onReady: () => void) {
  for (let i = Math.max(0, from); i <= Math.min(FRAMES - 1, to) && inflight.size < 8; i++) {
    const blob = s.blobs[i];
    if (!blob || bitmaps.has(i) || inflight.has(i)) continue;
    inflight.add(i);
    createImageBitmap(blob)
      .then((bmp) => {
        bitmaps.set(i, bmp);
        while (bitmaps.size > LRU) {
          const [k, old] = bitmaps.entries().next().value!;
          old.close();
          bitmaps.delete(k);
        }
        onReady();
      })
      .finally(() => inflight.delete(i));
  }
}
