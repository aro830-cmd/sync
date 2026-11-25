// Scroll-scrubbed fox: decode the clip once into JPEG blobs, then draw any frame instantly.
// Kling encodes it with a single keyframe, so seeking a <video> backwards is far too slow.
// Client-only module (uses window, WebCodecs, OffscreenCanvas).

export const FOX_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20261107_145142_a39216fc-13cf-4ce3-baf8-d9bdbfd5f955.mp4";
const img = (id: string, w: number) =>
  `https://images.higgs.ai/?default=1&output=webp&url=${encodeURIComponent(`https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/${id}.png`)}&w=${w}&q=85`;
/** Stills for phones / reduced motion. Width rule from the brief: vw × dpr × 1.05, multiple of 64, 1024–2048. */
export const foxStill = (which: "hero" | "story", w = 1024) =>
  img(which === "hero" ? "hf_20261107_005547_8a9e6889-76aa-4688-81b5-4452d9afa4ad" : "hf_20261107_005547_a3e2027b-0bcb-455d-bef4-6c0c6d722cb1", w);
export const stillWidth = () => Math.min(2048, Math.max(1024, Math.round((innerWidth * devicePixelRatio * 1.05) / 64) * 64));
export const CAST_SHEET = img("hf_20261107_005542_4250aa05-1091-4015-b242-d58db718f6b7", 2000);

export const FRAMES = 241;
const FPS = 24;
const STORE_W = 960; // stored frame width; the clip is 1280×720
const MP4BOX = "https://cdn.jsdelivr.net/npm/mp4box@0.5.2/dist/mp4box.all.min.js";

type Store = { blobs: (Blob | undefined)[]; count: number; w: number; h: number; listeners: Set<() => void> };
let store: Store | null = null;

/** Starts decoding on first call (once per page session) and returns the shared frame store. */
export function foxFrames(): Store {
  if (store) return store;
  const s: Store = { blobs: new Array(FRAMES), count: 0, w: STORE_W, h: Math.round((STORE_W * 9) / 16), listeners: new Set() };
  store = s;
  const ok = "VideoDecoder" in window && "OffscreenCanvas" in window && "ReadableStream" in window;
  (ok ? decodeWithWebCodecs(s) : Promise.reject(new Error("no WebCodecs"))).catch(() => captureWithVideo(s));
  return s;
}

function put(s: Store, i: number, blob: Blob) {
  if (i < 0 || i >= FRAMES || s.blobs[i]) return;
  s.blobs[i] = blob;
  s.count++;
  s.listeners.forEach((f) => f());
}

function loadScript(src: string) {
  return new Promise<void>((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`) && "MP4Box" in window) return res();
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => res();
    el.onerror = () => rej(new Error("script failed"));
    document.head.appendChild(el);
  });
}

// ───────── WebCodecs path ─────────

/* eslint-disable @typescript-eslint/no-explicit-any -- mp4box.js ships without types */
async function decodeWithWebCodecs(s: Store) {
  await loadScript(MP4BOX);
  const MP4Box = (window as any).MP4Box;
  const file = MP4Box.createFile();
  const canvas = new OffscreenCanvas(s.w, s.h);
  const ctx = canvas.getContext("2d")!;
  const queue: EncodedVideoChunk[] = [];
  let fed = 0, total = 0, out = 0, encoding = 0, ended = false, flushed = false;
  let decoder: VideoDecoder | null = null;

  const done = new Promise<void>((resolve, reject) => {
    const pump = () => {
      if (!decoder) return;
      while (queue.length && decoder.decodeQueueSize < 4 && encoding < 3) {
        decoder.decode(queue.shift()!);
        fed++;
      }
      if (ended && fed === total && !queue.length && !flushed) {
        flushed = true;
        decoder.flush().then(() => resolve(), reject);
      }
    };

    file.onError = reject;
    file.onReady = (info: any) => {
      const track = info.videoTracks[0];
      total = track.nb_samples;
      const trak = file.getTrackById(track.id);
      let description: Uint8Array | undefined;
      for (const entry of trak.mdia.minf.stbl.stsd.entries) {
        const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
        if (box) {
          const ds = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
          box.write(ds);
          description = new Uint8Array(ds.buffer, 8); // skip the box header
        }
      }
      decoder = new VideoDecoder({
        output: (frame) => {
          const i = out++; // frames come out in presentation order
          ctx.drawImage(frame, 0, 0, s.w, s.h);
          frame.close();
          encoding++;
          canvas.convertToBlob({ type: "image/jpeg", quality: 0.86 }).then((b) => {
            encoding--;
            put(s, i, b);
            pump();
          });
        },
        error: reject,
      });
      decoder.ondequeue = pump;
      decoder.configure({ codec: track.codec, codedWidth: track.video.width, codedHeight: track.video.height, description, hardwareAcceleration: "prefer-software" });
      file.setExtractionOptions(track.id, null, { nbSamples: 12 });
      file.start();
    };
    file.onSamples = (id: number, _u: unknown, samples: any[]) => {
      for (const x of samples) {
        queue.push(new EncodedVideoChunk({ type: x.is_sync ? "key" : "delta", timestamp: (1e6 * x.cts) / x.timescale, duration: (1e6 * x.duration) / x.timescale, data: x.data }));
      }
      file.releaseUsedSamples(id, samples[samples.length - 1].number + 1);
      if (fed + queue.length >= total) ended = true;
      pump();
    };
  });

  const res = await fetch(FOX_VIDEO, { mode: "cors" });
  if (!res.ok || !res.body) throw new Error(`video ${res.status}`);
  const reader = res.body.getReader();
  let offset = 0;
  for (;;) {
    const { done: eof, value } = await reader.read();
    if (eof) break;
    const buf = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer & { fileStart: number };
    buf.fileStart = offset;
    offset += value.byteLength;
    file.appendBuffer(buf);
  }
  file.flush();
  await done;
  if (s.count < FRAMES * 0.9) throw new Error("too few frames");
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ───────── fallback: play once and capture presented frames ─────────

function captureWithVideo(s: Store) {
  const v = document.createElement("video");
  Object.assign(v, { src: FOX_VIDEO, muted: true, playsInline: true, crossOrigin: "anonymous", playbackRate: 0.5 });
  // Must be painted for frame callbacks to fire.
  Object.assign(v.style, { position: "fixed", left: "0", top: "0", width: "2px", height: "2px", opacity: "0.01", pointerEvents: "none" });
  document.body.appendChild(v);
  const c = document.createElement("canvas");
  c.width = s.w;
  c.height = s.h;
  const ctx = c.getContext("2d")!;
  const grab = (_: number, meta: VideoFrameCallbackMetadata) => {
    const i = Math.round(meta.mediaTime * FPS);
    ctx.drawImage(v, 0, 0, s.w, s.h);
    c.toBlob((b) => b && put(s, i, b), "image/jpeg", 0.86);
    if (!v.ended) v.requestVideoFrameCallback(grab);
  };
  v.requestVideoFrameCallback(grab);
  v.onended = () => v.remove();
  v.play().catch(() => v.remove());
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
