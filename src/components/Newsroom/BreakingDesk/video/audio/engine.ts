// Preview audio engine. Plays the project's sound live with Web Audio, scheduling clips a few seconds ahead of the
// playhead, and is the master clock of the preview: the player reads clock() every frame and draws that time, so
// picture follows sound (never the other way round).

import { projectDuration, type Asset, type Project } from "../model";
import { decodeAsset, peekDecoded } from "./decode";
import { createMaster, startVoice, stopVoice, type VoiceNodes } from "./graph";
import { audibleTrackIds, planVoices, voiceShape, type VoicePlan } from "./voices";

/** Seconds between play()/seek() and the first sample, so the first voices are scheduled before they are due */
const START_LEAD = 0.06;
/** How far ahead clips are scheduled, and how often the window moves */
const LOOKAHEAD = 6;
const TICK_MS = 250;
/** Time constant for live gain changes (mute, solo, volume): click-free but immediate to the ear */
const SMOOTH = 0.015;

export interface StereoLevels {
  /** Sample peak and RMS per channel over the last ~20 ms, linear 0..1+ */
  peakL: number;
  peakR: number;
  rmsL: number;
  rmsR: number;
}

type Listener = () => void;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analysers: [AnalyserNode, AnalyserNode] | null = null;
  private scratch: Float32Array<ArrayBuffer> | null = null;
  private readonly levelsOut: StereoLevels = { peakL: 0, peakR: 0, rmsL: 0, rmsR: 0 };

  private project: Project | null = null;
  private assets = new Map<string, Asset>();
  private plans = new Map<string, VoicePlan>();
  private shapes = new Map<string, string>();
  private voices = new Map<string, VoiceNodes>();
  private trackGains = new Map<string, GainNode>();

  private playingNow = false;
  /** Timeline time at context time `anchor` */
  private from = 0;
  private anchor = 0;
  private pausedAt = 0;
  private lastClock = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private volume = 1;
  private muted = false;
  private listeners = new Set<Listener>();

  // ---- lifecycle ----

  /** Created lazily on first use so constructing the engine never trips autoplay rules. */
  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext({ latencyHint: "interactive" });
    const master = createMaster(ctx);
    master.input.gain.value = this.muted ? 0 : this.volume;
    master.output.connect(ctx.destination);
    const split = ctx.createChannelSplitter(2);
    master.output.connect(split);
    const l = ctx.createAnalyser();
    const r = ctx.createAnalyser();
    l.fftSize = r.fftSize = 1024;
    split.connect(l, 0);
    split.connect(r, 1);
    this.ctx = ctx;
    this.master = master.input;
    this.analysers = [l, r];
    this.scratch = new Float32Array(l.fftSize);
    return ctx;
  }

  /** Stop everything and close the AudioContext. The engine can be used again afterwards (it reopens lazily). */
  dispose(): void {
    this.stopAll();
    this.clearTimer();
    this.playingNow = false;
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.analysers = null;
    this.trackGains.clear();
    if (ctx) void ctx.close().catch(() => undefined);
    this.emit();
  }

  // ---- project ----

  /**
   * Give the engine the current project after every edit. Volume, mute and solo changes apply live; a clip whose
   * timing, source, speed or fades changed restarts at the playhead; removed clips stop.
   */
  setProject(project: Project): void {
    this.project = project;
    this.assets = new Map(project.assets.map((a) => [a.id, a]));
    const next = new Map<string, VoicePlan>();
    const nextShapes = new Map<string, string>();
    for (const p of planVoices(project, { includeMuted: true })) {
      next.set(p.clipId, p);
      nextShapes.set(p.clipId, voiceShape(p, this.assets.get(p.assetId)?.url ?? ""));
    }
    const ctx = this.ctx;
    for (const [id, voice] of this.voices) {
      const plan = next.get(id);
      if (!plan || nextShapes.get(id) !== this.shapes.get(id)) {
        if (ctx) stopVoice(voice, ctx);
        this.voices.delete(id);
      } else if (ctx && plan.volume !== this.plans.get(id)?.volume) {
        voice.vol.gain.setTargetAtTime(plan.volume, ctx.currentTime, SMOOTH);
      }
    }
    this.plans = next;
    this.shapes = nextShapes;
    this.applyTrackGains();
    if (this.playingNow) this.tick();
  }

  /** Decode every asset the project can hear, so pressing play starts with sound. */
  async preload(): Promise<void> {
    const ids = new Set([...this.plans.values()].map((p) => p.assetId));
    await Promise.all([...ids].map((id) => this.assets.get(id)).filter((a): a is Asset => !!a).map((a) => decodeAsset(a)));
  }

  // ---- transport ----

  get playing(): boolean {
    return this.playingNow;
  }

  /** Project length in seconds (end of the last clip on any track) */
  duration(): number {
    return this.project ? projectDuration(this.project) : 0;
  }

  /**
   * Start playing from `at` (default: where it was paused). Call it from the click/key handler: the AudioContext
   * can only start inside a user gesture. Resolves when the device is running.
   */
  play(at?: number): Promise<void> {
    const ctx = this.ensureContext();
    const resumed = ctx.state === "running" ? Promise.resolve() : ctx.resume();
    this.stopAll();
    this.from = Math.max(0, at ?? this.pausedAt);
    this.anchor = ctx.currentTime + START_LEAD;
    this.lastClock = this.from;
    this.playingNow = true;
    this.tick();
    this.clearTimer();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.emit();
    return resumed.catch(() => undefined);
  }

  pause(): void {
    if (!this.playingNow) return;
    this.pausedAt = this.clock();
    this.playingNow = false;
    this.clearTimer();
    this.stopAll();
    this.emit();
  }

  /** Jump to timeline time t; keeps playing if it was playing. */
  seek(t: number): void {
    const to = Math.max(0, t);
    if (this.playingNow && this.ctx) {
      this.stopAll();
      this.from = to;
      this.anchor = this.ctx.currentTime + START_LEAD;
      this.lastClock = to;
      this.tick();
    } else {
      this.pausedAt = to;
    }
    this.emit();
  }

  /**
   * The timeline time being heard right now, in seconds. Uses the device's output timestamp (latency compensated)
   * extrapolated with performance.now(), so it moves smoothly between audio callbacks and never runs backwards
   * while playing. When paused it is the paused position.
   */
  clock(): number {
    if (!this.playingNow) return this.pausedAt;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return this.from;
    let now: number;
    const ts = typeof ctx.getOutputTimestamp === "function" ? ctx.getOutputTimestamp() : null;
    if (ts && ts.contextTime && ts.performanceTime) {
      now = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
      // Never extrapolate past what has been rendered.
      now = Math.min(now, ctx.currentTime);
    } else {
      now = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
    }
    const t = Math.max(this.from, this.from + (now - this.anchor));
    if (t > this.lastClock) this.lastClock = t;
    return this.lastClock;
  }

  // ---- output ----

  /** Master volume 0..1 (the preview's own volume knob; does not touch the project) */
  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    this.applyMaster();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyMaster();
  }

  /** Current output levels, or null before the first play. Returns the same object each call (no allocation). */
  levels(): StereoLevels | null {
    const an = this.analysers;
    const buf = this.scratch;
    if (!an || !buf) return null;
    const out = this.levelsOut;
    for (let ch = 0; ch < 2; ch++) {
      an[ch].getFloatTimeDomainData(buf);
      let peak = 0;
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i];
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      if (ch === 0) {
        out.peakL = peak;
        out.rmsL = rms;
      } else {
        out.peakR = peak;
        out.rmsR = rms;
      }
    }
    return out;
  }

  /** Notified on play / pause / seek / dispose (for useSyncExternalStore) */
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---- internals ----

  private emit() {
    for (const fn of this.listeners) fn();
  }

  private clearTimer() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private applyMaster() {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, SMOOTH);
  }

  private trackGain(trackId: string): GainNode {
    let g = this.trackGains.get(trackId);
    if (!g) {
      const ctx = this.ensureContext();
      g = ctx.createGain();
      g.gain.value = this.project && audibleTrackIds(this.project).has(trackId) ? 1 : 0;
      g.connect(this.master!);
      this.trackGains.set(trackId, g);
    }
    return g;
  }

  private applyTrackGains() {
    const ctx = this.ctx;
    if (!ctx || !this.project) return;
    const audible = audibleTrackIds(this.project);
    for (const [id, g] of this.trackGains) g.gain.setTargetAtTime(audible.has(id) ? 1 : 0, ctx.currentTime, SMOOTH);
  }

  private stopAll() {
    const ctx = this.ctx;
    if (ctx) for (const v of this.voices.values()) stopVoice(v, ctx);
    this.voices.clear();
  }

  /** Context time for timeline time t while playing */
  private ctxTime(t: number): number {
    return this.anchor + (t - this.from);
  }

  /** Schedule every clip that overlaps [now, now + LOOKAHEAD] and is not already playing. */
  private tick() {
    const ctx = this.ctx;
    if (!this.playingNow || !ctx) return;
    // Timeline time of the next sample that can still be scheduled.
    const soonest = Math.max(this.from, this.from + (ctx.currentTime + 0.02 - this.anchor));
    const horizon = soonest + LOOKAHEAD;
    for (const plan of this.plans.values()) {
      if (this.voices.has(plan.clipId)) continue;
      const end = plan.start + plan.duration;
      if (plan.start > horizon || end <= soonest) continue;
      const asset = this.assets.get(plan.assetId);
      if (!asset) continue;
      const buffer = peekDecoded(asset);
      if (buffer === undefined) {
        // Not decoded yet: join late once it is.
        void decodeAsset(asset).then(() => this.tick());
        continue;
      }
      if (!buffer) continue;
      const at = Math.max(soonest, plan.start);
      const voice = startVoice(ctx, plan, buffer, this.trackGain(plan.trackId), this.ctxTime(at), at);
      if (!voice) continue;
      this.voices.set(plan.clipId, voice);
      voice.source.onended = () => {
        if (this.voices.get(plan.clipId) === voice) this.voices.delete(plan.clipId);
      };
    }
  }
}
