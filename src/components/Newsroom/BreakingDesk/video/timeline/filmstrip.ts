"use client";

// Filmstrip thumbnails for video assets: grabbed once per file with an offscreen <video>, cached for the session,
// shared by every clip cut from that file. Files are processed one at a time so a project with many clips does not
// open many decoders at once. Frames arrive progressively; components re-render as they land.

import { useEffect, useSyncExternalStore } from "react";
import type { Asset } from "../model";

export const THUMB_W = 112;
export const THUMB_H = 63;

export interface Filmstrip {
  /** Source seconds of each frame (evenly spread) */
  times: number[];
  /** JPEG data URLs, undefined until grabbed */
  frames: (string | undefined)[];
  /** The browser refused pixel access (cross-origin without CORS) or the file failed to load */
  failed: boolean;
  done: boolean;
}

const strips = new Map<string, Filmstrip>();
const listeners = new Map<string, Set<() => void>>();
const queue: { key: string; asset: Asset }[] = [];
let running = false;

const keyOf = (a: Pick<Asset, "id" | "url">) => `${a.id}|${a.url}`;
const EMPTY: Filmstrip = { times: [], frames: [], failed: false, done: false };

function emit(key: string, next: Filmstrip) {
  strips.set(key, next);
  listeners.get(key)?.forEach((l) => l());
}

/** One frame every ~2 s, between 6 and 48 per file */
function sampleTimes(duration: number): number[] {
  const count = Math.max(6, Math.min(48, Math.round(duration / 2)));
  return Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * duration);
}

async function grabAll(key: string, asset: Asset) {
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;
  if (!asset.url.startsWith("blob:") && !asset.url.startsWith("data:")) video.crossOrigin = "anonymous";
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext("2d");

  const once = (event: string) =>
    new Promise<void>((resolve, reject) => {
      const ok = () => { cleanup(); resolve(); };
      const bad = () => { cleanup(); reject(new Error(`video ${event} failed`)); };
      const timer = window.setTimeout(bad, 8000);
      const cleanup = () => {
        window.clearTimeout(timer);
        video.removeEventListener(event, ok);
        video.removeEventListener("error", bad);
      };
      video.addEventListener(event, ok);
      video.addEventListener("error", bad);
    });

  try {
    if (!ctx) throw new Error("no 2d context");
    const loaded = once("loadeddata");
    video.src = asset.url;
    await loaded;
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : asset.duration;
    const times = sampleTimes(duration);
    let strip: Filmstrip = { times, frames: times.map(() => undefined), failed: false, done: false };
    emit(key, strip);
    for (let i = 0; i < times.length; i++) {
      const seeked = once("seeked");
      video.currentTime = Math.min(times[i], Math.max(0, duration - 0.05));
      await seeked;
      const scale = Math.max(THUMB_W / video.videoWidth, THUMB_H / video.videoHeight);
      const w = video.videoWidth * scale;
      const h = video.videoHeight * scale;
      ctx.drawImage(video, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h);
      const frames = strip.frames.slice();
      frames[i] = canvas.toDataURL("image/jpeg", 0.6); // throws on a tainted canvas
      strip = { ...strip, frames };
      // Publish every few frames to keep re-renders down
      if (i % 4 === 3 || i === times.length - 1) emit(key, strip);
    }
    emit(key, { ...strip, done: true });
  } catch {
    const prev = strips.get(key) ?? EMPTY;
    emit(key, { ...prev, failed: true, done: true });
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift()!;
    await grabAll(job.key, job.asset);
  }
  running = false;
}

/** Start grabbing (no-op when cached or queued) */
export function ensureFilmstrip(asset: Asset) {
  if (asset.kind !== "video") return;
  const key = keyOf(asset);
  if (strips.has(key)) return;
  strips.set(key, EMPTY);
  queue.push({ key, asset });
  void pump();
}

/** Drop a file's thumbnails (e.g. when its asset is removed) */
export function forgetFilmstrip(asset: Pick<Asset, "id" | "url">) {
  strips.delete(keyOf(asset));
}

function subscribe(key: string, listener: () => void) {
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(listener);
  return () => set.delete(listener);
}

/** The asset's filmstrip; starts generating on first use. Images and audio return an empty strip. */
export function useFilmstrip(asset: Asset | null | undefined): Filmstrip {
  const key = asset && asset.kind === "video" ? keyOf(asset) : "";
  const strip = useSyncExternalStore(
    (l) => (key ? subscribe(key, l) : () => {}),
    () => (key ? strips.get(key) ?? EMPTY : EMPTY),
    () => EMPTY,
  );
  useEffect(() => {
    if (key && asset) ensureFilmstrip(asset);
    // key covers id + url
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return strip;
}

/** Nearest grabbed frame to a source time (falls back to any grabbed neighbour while loading) */
export function frameAt(strip: Filmstrip, sourceTime: number): string | undefined {
  const n = strip.times.length;
  if (!n) return undefined;
  const span = strip.times[n - 1] + strip.times[0];
  let i = Math.round((sourceTime / span) * n - 0.5);
  i = Math.max(0, Math.min(n - 1, i));
  for (let d = 0; d < n; d++) {
    const a = strip.frames[i - d];
    if (a) return a;
    const b = strip.frames[i + d];
    if (b) return b;
  }
  return undefined;
}
