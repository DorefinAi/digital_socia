// Waveform peaks for the timeline. Each asset is decoded once (decode.ts) and reduced once to a fine base resolution
// (BASE_RATE min/max pairs per second, all channels folded together); any requested bucket count or source range is
// derived from that base, so zooming the timeline never touches the samples again.

import type { Asset } from "../model";
import { decodeAsset } from "./decode";
import { gainToDb, suggestVolume } from "./gain";

/** Base min/max pairs per second of source (5 ms each) */
export const BASE_RATE = 200;

export interface Peaks {
  /** Per bucket: lowest and highest sample (-1..1) across all channels */
  min: Float32Array;
  max: Float32Array;
  buckets: number;
  /** Source seconds the buckets cover */
  from: number;
  to: number;
}

interface BasePeaks {
  min: Float32Array;
  max: Float32Array;
  /** Source duration, seconds */
  duration: number;
  /** Highest absolute sample in the whole file */
  peak: number;
}

const bases = new Map<string, Promise<BasePeaks | null>>();
const readyBases = new Map<string, BasePeaks | null>();

const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

async function computeBase(buffer: AudioBuffer): Promise<BasePeaks> {
  const per = Math.max(1, Math.round(buffer.sampleRate / BASE_RATE));
  const count = Math.max(1, Math.ceil(buffer.length / per));
  const min = new Float32Array(count).fill(1);
  const max = new Float32Array(count).fill(-1);
  let peak = 0;
  let work = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let b = 0; b < count; b++) {
      const s = b * per;
      const e = Math.min(data.length, s + per);
      let lo = min[b];
      let hi = max[b];
      for (let i = s; i < e; i++) {
        const v = data[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      min[b] = lo;
      max[b] = hi;
      work += e - s;
      // Keep the main thread responsive on long files (~4M samples per slice).
      if (work > 4_000_000) {
        work = 0;
        await yieldToMain();
      }
    }
  }
  for (let b = 0; b < count; b++) {
    if (min[b] > max[b]) min[b] = max[b] = 0;
    peak = Math.max(peak, -min[b], max[b]);
  }
  return { min, max, duration: buffer.duration, peak };
}

function baseFor(asset: Asset): Promise<BasePeaks | null> {
  const key = `${asset.id}|${asset.url}`;
  let job = bases.get(key);
  if (!job) {
    job = decodeAsset(asset).then(async (buffer) => {
      const base = buffer ? await computeBase(buffer) : null;
      readyBases.set(key, base);
      return base;
    });
    bases.set(key, job);
    // decodeAsset returns null for network failures too; let a later call retry those.
    job.then((b) => {
      if (!b) bases.delete(key);
    });
  }
  return job;
}

function rebucket(base: BasePeaks, buckets: number, from: number, to: number): Peaks {
  const n = Math.max(1, Math.floor(buckets));
  const min = new Float32Array(n);
  const max = new Float32Array(n);
  const last = base.min.length - 1;
  const span = (to - from) / n;
  for (let b = 0; b < n; b++) {
    const t0 = from + b * span;
    const t1 = t0 + span;
    let i0 = Math.floor(t0 * BASE_RATE);
    let i1 = Math.ceil(t1 * BASE_RATE) - 1;
    if (i1 < i0) i1 = i0;
    if (i1 < 0 || i0 > last) continue; // outside the source: silence
    i0 = Math.max(0, i0);
    i1 = Math.min(last, i1);
    let lo = 1;
    let hi = -1;
    for (let i = i0; i <= i1; i++) {
      if (base.min[i] < lo) lo = base.min[i];
      if (base.max[i] > hi) hi = base.max[i];
    }
    min[b] = lo > hi ? 0 : lo;
    max[b] = lo > hi ? 0 : hi;
  }
  return { min, max, buckets: n, from, to };
}

/**
 * Waveform peaks of an asset's sound in `buckets` columns. Optional `range` (source seconds) limits it to the part a
 * clip shows: `{ from: clip.in, to: clip.in + clip.duration * clip.speed }`. Resolves null when the asset has no sound.
 */
export async function getPeaks(asset: Asset, buckets: number, range?: { from: number; to: number }): Promise<Peaks | null> {
  const base = await baseFor(asset);
  if (!base) return null;
  const from = Math.max(0, range?.from ?? 0);
  const to = Math.max(from + 1e-3, range?.to ?? base.duration);
  return rebucket(base, buckets, from, to);
}

/** Same as getPeaks but synchronous: undefined while the asset is still decoding (call getPeaks to start it). */
export function peaksIfReady(asset: Asset, buckets: number, range?: { from: number; to: number }): Peaks | null | undefined {
  const base = readyBases.get(`${asset.id}|${asset.url}`);
  if (base === undefined) return undefined;
  if (!base) return null;
  const from = Math.max(0, range?.from ?? 0);
  const to = Math.max(from + 1e-3, range?.to ?? base.duration);
  return rebucket(base, buckets, from, to);
}

export interface NormaliseSuggestion {
  /** Highest absolute sample in the range, 0..1+ */
  peak: number;
  peakDb: number;
  /** Clip volume (0..2) that brings the peak to the target */
  volume: number;
  /** True when even 2x does not reach the target (very quiet source) */
  limited: boolean;
}

/**
 * Peak-based volume suggestion for a clip: measures the loudest sample of the asset in `range` (source seconds,
 * default whole file) and returns the clip volume that puts it at `targetDb` (default -1 dBFS). Null when silent or
 * without sound.
 */
export async function normaliseVolume(
  asset: Asset,
  range?: { from: number; to: number },
  targetDb = -1,
): Promise<NormaliseSuggestion | null> {
  const base = await baseFor(asset);
  if (!base) return null;
  let peak = base.peak;
  if (range) {
    const i0 = Math.max(0, Math.floor(range.from * BASE_RATE));
    const i1 = Math.min(base.min.length - 1, Math.ceil(range.to * BASE_RATE));
    peak = 0;
    for (let i = i0; i <= i1; i++) peak = Math.max(peak, -base.min[i], base.max[i]);
  }
  if (peak <= 0) return null;
  const { volume, limited } = suggestVolume(peak, targetDb);
  return { peak, peakDb: gainToDb(peak), volume, limited };
}

/** Drop cached peaks for an asset id (with forgetDecoded when an asset is removed). */
export function forgetPeaks(assetId: string): void {
  const prefix = `${assetId}|`;
  for (const k of [...bases.keys()]) if (k.startsWith(prefix)) bases.delete(k);
  for (const k of [...readyBases.keys()]) if (k.startsWith(prefix)) readyBases.delete(k);
}
