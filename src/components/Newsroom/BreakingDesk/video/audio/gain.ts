// Pure gain maths shared by the offline mix (export) and the live preview engine, so both sound the same.
// No Web Audio here: everything is numbers in, numbers out (see checks.ts).

/** Clip volume is 0..2 in the model (1 = original) */
export const MAX_VOLUME = 2;

export function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(MAX_VOLUME, Math.max(0, v));
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** -Infinity for silence */
export function gainToDb(g: number): number {
  return g <= 0 ? -Infinity : 20 * Math.log10(g);
}

/** What shapes one clip's loudness over its own length (all seconds, timeline time). */
export interface EnvelopeSpec {
  duration: number;
  /** Linear fade in / out (the clip's fadeIn / fadeOut) */
  fadeIn: number;
  fadeOut: number;
  /** Equal-power crossfade in / out caused by a video transition on the same track */
  xfadeIn: number;
  xfadeOut: number;
}

/** One breakpoint: t = seconds from the clip's timeline start, g = 0..1. Linear between points. */
export interface EnvPoint {
  t: number;
  g: number;
}

/**
 * Fade lengths actually used: never negative, and when fade in + fade out is longer than the clip both shrink in
 * proportion so they meet instead of overlapping.
 */
export function effectiveFades(spec: EnvelopeSpec): { fadeIn: number; fadeOut: number; xfadeIn: number; xfadeOut: number } {
  const d = Math.max(0, spec.duration);
  let fi = Math.max(0, spec.fadeIn || 0);
  let fo = Math.max(0, spec.fadeOut || 0);
  if (fi + fo > d && fi + fo > 0) {
    const k = d / (fi + fo);
    fi *= k;
    fo *= k;
  }
  const xi = Math.min(d, Math.max(0, spec.xfadeIn || 0));
  const xo = Math.min(d, Math.max(0, spec.xfadeOut || 0));
  return { fadeIn: fi, fadeOut: fo, xfadeIn: xi, xfadeOut: xo };
}

/** Exact envelope value (0..1) at t seconds into the clip. Outside the clip it is 0. */
export function envelopeGain(spec: EnvelopeSpec, t: number): number {
  const d = Math.max(0, spec.duration);
  if (!(t >= 0 && t <= d) || d === 0) return 0;
  const f = effectiveFades(spec);
  const left = d - t;
  let g = 1;
  if (f.fadeIn > 0 && t < f.fadeIn) g *= t / f.fadeIn;
  if (f.fadeOut > 0 && left < f.fadeOut) g *= left / f.fadeOut;
  // Equal power: incoming sin, outgoing cos of the same progress, so the summed power stays constant.
  if (f.xfadeIn > 0 && t < f.xfadeIn) g *= Math.sin((t / f.xfadeIn) * (Math.PI / 2));
  if (f.xfadeOut > 0 && left < f.xfadeOut) g *= Math.sin((left / f.xfadeOut) * (Math.PI / 2));
  return Math.min(1, Math.max(0, g));
}

/** Segments used to approximate one equal-power curve with linear ramps (error < 0.5 %) */
const CURVE_STEPS = 24;

/**
 * Breakpoints for AudioParam automation: linear fades need only their ends, equal-power crossfades are sampled.
 * First point is t = 0, last is t = duration; sorted, no duplicate times.
 */
export function clipEnvelope(spec: EnvelopeSpec): EnvPoint[] {
  const d = Math.max(0, spec.duration);
  if (d === 0) return [{ t: 0, g: 0 }];
  const f = effectiveFades(spec);
  const times = new Set<number>([0, d, f.fadeIn, d - f.fadeOut, f.xfadeIn, d - f.xfadeOut]);
  if (f.xfadeIn > 0) for (let i = 1; i < CURVE_STEPS; i++) times.add((f.xfadeIn * i) / CURVE_STEPS);
  if (f.xfadeOut > 0) for (let i = 1; i < CURVE_STEPS; i++) times.add(d - (f.xfadeOut * i) / CURVE_STEPS);
  // A linear fade multiplied by a crossfade is curved too: sample the overlap.
  if (f.fadeIn > 0 && (f.xfadeIn > 0 || f.xfadeOut > d - f.fadeIn)) for (let i = 1; i < CURVE_STEPS; i++) times.add((f.fadeIn * i) / CURVE_STEPS);
  if (f.fadeOut > 0 && (f.xfadeOut > 0 || f.xfadeIn > d - f.fadeOut)) for (let i = 1; i < CURVE_STEPS; i++) times.add(d - (f.fadeOut * i) / CURVE_STEPS);

  const sorted = [...times].filter((t) => t >= 0 && t <= d).sort((a, b) => a - b);
  const points: EnvPoint[] = [];
  for (const t of sorted) {
    if (points.length && t - points[points.length - 1].t < 1e-6) continue;
    // A fade that starts at 0 has value 0 at its start even though envelopeGain(0) of a no-fade clip is 1.
    points.push({ t, g: envelopeGain(spec, t) });
  }
  return points;
}

/** Linear interpolation of breakpoints at t (clamped to the first/last value) */
export function sampleEnvelope(points: EnvPoint[], t: number): number {
  if (!points.length) return 0;
  if (t <= points[0].t) return points[0].g;
  const last = points[points.length - 1];
  if (t >= last.t) return last.g;
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const span = b.t - a.t;
  return span <= 0 ? b.g : a.g + ((b.g - a.g) * (t - a.t)) / span;
}

/**
 * Volume that brings a measured peak to targetDb (default -1 dBFS), clamped to the model's 0..2 range.
 * `limited` is true when the clip would need more than 2x to reach the target.
 */
export function suggestVolume(peak: number, targetDb = -1): { volume: number; limited: boolean } {
  if (!(peak > 0)) return { volume: 1, limited: false };
  const wanted = dbToGain(targetDb) / peak;
  return { volume: clampVolume(Math.round(wanted * 100) / 100), limited: wanted > MAX_VOLUME };
}

/** Level meter position 0..1 for a linear level, on a dB scale from floorDb (0) to 0 dBFS (1). */
export function meterFraction(level: number, floorDb = -60): number {
  const db = gainToDb(level);
  if (db <= floorDb) return 0;
  return Math.min(1, (db - floorDb) / -floorDb);
}

/** Meter ballistics: rises instantly, falls at `fallDbPerSec`. Levels in dB, dt in seconds. */
export function fallTowards(shownDb: number, inputDb: number, dt: number, fallDbPerSec = 24): number {
  if (inputDb >= shownDb || !Number.isFinite(shownDb)) return inputDb;
  return Math.max(inputDb, shownDb - fallDbPerSec * dt);
}

/**
 * Soft-clip transfer curve used on the master bus in both preview and export: identity below `knee`, then a smooth
 * tanh shoulder that never exceeds 1. Zero latency (unlike DynamicsCompressorNode, whose look-ahead would shift audio
 * against the picture).
 */
export function softClip(x: number, knee = 0.9): number {
  const a = Math.abs(x);
  if (a <= knee) return x;
  const room = 1 - knee;
  const y = knee + room * Math.tanh((a - knee) / room);
  return Math.sign(x) * y;
}

/** WaveShaper curve for softClip over -1..1. A WaveShaperNode holds input beyond ±1 at the end values (±0.976). */
export function softClipCurve(samples = 8193): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) curve[i] = softClip((i / (samples - 1)) * 2 - 1);
  return curve;
}
