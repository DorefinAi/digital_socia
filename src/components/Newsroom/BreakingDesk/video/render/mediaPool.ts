// MediaPool: the decoded sources every renderer draws from. Videos are <video> elements (one per
// "voice": a second copy appears only when the same file shows twice at the same moment), images
// are ImageBitmaps, and sound is a decoded AudioBuffer shared with the audio engine.
//
// Two ways to move the videos:
// - Export: `await pool.prepareFrame(project, t)` (or seekVideo per clip) before each renderFrame.
//   Each seek waits for `seeked` and then the decoded frame (requestVideoFrameCallback) with timeouts.
// - Preview: `pool.syncPreview(project, t, playing)` every animation frame. While playing the
//   elements play on their own at the clip speed and are only nudged when they drift; paused, they
//   seek to the playhead and the pool notifies subscribers when the new frame is ready to draw.

import { sourceTime, type Asset, type MediaClip, type Project } from "../model";
import { decodeAsset, peekDecoded } from "../audio/decode";
import { collectLayers, newLayerList, type LayerList } from "./layers";

export type MediaStatus = "loading" | "ready" | "error";

export interface MediaInfo {
  status: MediaStatus;
  error: string | null;
  /** Natural size in px (0 until loaded) */
  width: number;
  height: number;
  /** Seconds; 0 for images */
  duration: number;
}

interface Entry extends MediaInfo {
  asset: Asset;
  image: ImageBitmap | HTMLImageElement | null;
  videos: HTMLVideoElement[];
  audioBuffer: AudioBuffer | null;
  ready: Promise<void>;
  /** requestVideoFrameCallback answered after recent seeks; turned off after repeated misses */
  rvfcOk: boolean;
  rvfcMisses: number;
  disposed: boolean;
}

const LOAD_TIMEOUT = 20000;
const SEEK_TIMEOUT = 4000;
/** After `seeked`, how long to wait for the frame callback before drawing anyway */
const FRAME_WAIT = 150;
/** Lands a seek inside the wanted frame rather than on its boundary, where some decoders give the one before */
const SEEK_EPSILON = 0.001;
/** How long after the last exact seek the preview leaves the elements alone */
const EXACT_HOLD = 1500;

// ---------------------------------------------------------------------------------------------
// Audio decoding: owned by audio/decode.ts (Agent C); the pool only fronts it.
// ---------------------------------------------------------------------------------------------

/**
 * The asset's sound as an AudioBuffer at 48 kHz, or null when it has none (images, silent videos,
 * undecodable files). Delegates to the audio module's shared cache (audio/decode.ts), so waveforms,
 * the preview engine, the export mix and the pool all share one decode per asset.
 */
export function decodeAudio(asset: Asset): Promise<AudioBuffer | null> {
  return decodeAsset(asset);
}

// ---------------------------------------------------------------------------------------------

const seekChains = new WeakMap<HTMLVideoElement, Promise<void>>();
const voiceReady = new WeakMap<HTMLVideoElement, Promise<void>>();
/** Paused preview: the time a busy element should go to once its current seek lands */
const pendingSeek = new WeakMap<HTMLVideoElement, number>();

type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

const isRemote = (url: string) => /^https?:/i.test(url) && typeof location !== "undefined" && !url.startsWith(location.origin);

export class MediaPool {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private allVideos: HTMLVideoElement[] = [];
  private host: HTMLElement | null = null;
  private layers: LayerList = newLayerList();
  private ahead: LayerList = newLayerList();
  private used = new Set<HTMLVideoElement>();
  private lastPreroll = -1;
  private notifyQueued = false;
  /** Exact seeks (export) own the elements until this performance.now(); the preview sync keeps its hands off */
  private exactUntil = 0;

  constructor(assets: Asset[] = []) {
    this.sync(assets);
  }

  // ----- loading ---------------------------------------------------------------------------

  /** Make the pool match the project's assets: load new ones, reload changed URLs, drop removed ones */
  sync(assets: Asset[]): void {
    const keep = new Set<string>();
    for (const a of assets) {
      keep.add(a.id);
      const e = this.entries.get(a.id);
      if (!e || e.asset.url !== a.url || e.asset.kind !== a.kind) {
        if (e) this.drop(e);
        void this.load(a);
      } else e.asset = a;
    }
    for (const [id, e] of this.entries) if (!keep.has(id)) this.drop(e);
  }

  /** Load one asset (no-op when it is already loading or loaded at this URL) */
  load(asset: Asset): Promise<void> {
    const existing = this.entries.get(asset.id);
    if (existing && existing.asset.url === asset.url && !existing.disposed) return existing.ready;
    if (existing) this.drop(existing);
    const e: Entry = {
      asset, status: "loading", error: null, width: asset.width ?? 0, height: asset.height ?? 0, duration: asset.duration,
      image: null, videos: [], audioBuffer: null, ready: Promise.resolve(), rvfcOk: true, rvfcMisses: 0, disposed: false,
    };
    this.entries.set(asset.id, e);
    e.ready = (async () => {
      try {
        if (asset.kind === "image") await this.loadImage(e);
        else if (asset.kind === "video") {
          const el = this.voice(e, 0);
          await voiceReady.get(el);
          e.width = el.videoWidth;
          e.height = el.videoHeight;
          if (Number.isFinite(el.duration)) e.duration = el.duration;
        }
        // Audio assets have no picture; their sound loads through loadAudio()
        if (!e.disposed) e.status = "ready";
      } catch (err) {
        if (!e.disposed) {
          e.status = "error";
          e.error = err instanceof Error ? err.message : String(err);
        }
      }
      this.notify();
    })();
    return e.ready;
  }

  private async loadImage(e: Entry) {
    const url = e.asset.url;
    if (typeof createImageBitmap === "function") {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bmp = await createImageBitmap(await res.blob(), { imageOrientation: "from-image" });
        if (e.disposed) {
          bmp.close();
          return;
        }
        e.image = bmp;
        e.width = bmp.width;
        e.height = bmp.height;
        return;
      } catch {
        // Fall through to an <img>, which can still show an image the fetch could not read
      }
    }
    const img = new Image();
    if (isRemote(url)) img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.src = url;
    await img.decode();
    e.image = img;
    e.width = img.naturalWidth;
    e.height = img.naturalHeight;
  }

  /** Hidden holder for the video elements: attached to the page so every browser keeps decoding them */
  private holder(): HTMLElement | null {
    if (this.host || typeof document === "undefined") return this.host;
    const div = document.createElement("div");
    div.setAttribute("aria-hidden", "true");
    div.dataset.mediaPool = "";
    div.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1";
    document.body.appendChild(div);
    this.host = div;
    return div;
  }

  /** The element for one voice of a video asset, created on first use */
  private voice(e: Entry, n: number): HTMLVideoElement {
    let el = e.videos[n];
    if (el) return el;
    el = document.createElement("video");
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    el.preload = "auto";
    el.disablePictureInPicture = true;
    el.style.cssText = "width:2px;height:2px";
    if (isRemote(e.asset.url)) el.crossOrigin = "anonymous";
    const v = el;
    voiceReady.set(v, new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The video took too long to load")), LOAD_TIMEOUT);
      const ok = () => {
        clearTimeout(timer);
        resolve();
      };
      if (v.readyState >= 2) ok();
      v.addEventListener("loadeddata", ok, { once: true });
      v.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error(v.error?.message || "The video could not be decoded"));
      }, { once: true });
    }));
    // Keep the promise from reporting as unhandled when nobody awaits a failing extra voice
    voiceReady.get(v)?.catch(() => undefined);
    v.addEventListener("seeked", () => {
      const next = pendingSeek.get(v);
      if (next !== undefined) {
        pendingSeek.delete(v);
        if (Math.abs(v.currentTime - next) > 0.004) v.currentTime = next;
      }
      this.notify();
    });
    v.addEventListener("loadeddata", () => this.notify());
    v.src = e.asset.url;
    this.holder()?.appendChild(v);
    e.videos[n] = v;
    this.allVideos.push(v);
    return v;
  }

  /** Resolves when the given assets (default: all) have finished loading or failed */
  async whenReady(ids?: string[]): Promise<void> {
    const list = ids ? ids.map((id) => this.entries.get(id)).filter((e): e is Entry => !!e) : [...this.entries.values()];
    await Promise.all(list.map((e) => e.ready));
  }

  info(id: string): MediaInfo | null {
    return this.entries.get(id) ?? null;
  }

  // ----- drawing ---------------------------------------------------------------------------

  /** Something drawable for the asset (null while loading, for audio, or when that voice has no frame yet) */
  frame(id: string, voice = 0): CanvasImageSource | null {
    const e = this.entries.get(id);
    if (!e || e.status !== "ready") return null;
    if (e.image) return e.image;
    const el = e.videos[voice] ?? (voice > 0 ? this.voice(e, voice) : null);
    return el && el.readyState >= 2 ? el : null;
  }

  /** Natural size of what frame() returns */
  frameSize(id: string): { width: number; height: number } | null {
    const e = this.entries.get(id);
    return e && e.width > 0 && e.height > 0 ? e : null;
  }

  // ----- export: exact frames ----------------------------------------------------------------

  /**
   * Put the video at `sourceTime` seconds and resolve once that frame can be drawn.
   * Calls on the same element run one after another. Never rejects; on a stuck decoder it gives up
   * after a few seconds and the frame shows whatever the element has. While exact seeks are running
   * (and for 1.5 s after the last one) syncPreview leaves the elements alone, so a mounted preview
   * cannot move a video under the export.
   */
  seekVideo(assetId: string, time: number, voice = 0): Promise<void> {
    const e = this.entries.get(assetId);
    if (!e || e.asset.kind !== "video" || e.disposed) return Promise.resolve();
    const el = this.voice(e, voice);
    this.exactUntil = performance.now() + EXACT_HOLD;
    const prev = seekChains.get(el) ?? Promise.resolve();
    const run = prev.then(() => this.seekOnce(e, el, time)).finally(() => {
      this.exactUntil = performance.now() + EXACT_HOLD;
    });
    seekChains.set(el, run);
    return run;
  }

  private async seekOnce(e: Entry, el: RVFCVideo, time: number): Promise<void> {
    try {
      await voiceReady.get(el);
    } catch {
      return;
    }
    if (!el.paused) el.pause();
    const dur = Number.isFinite(el.duration) ? el.duration : e.duration;
    const target = Math.max(0, Math.min(time + SEEK_EPSILON, dur > 0 ? dur - 0.001 : time));
    if (!el.seeking && el.readyState >= 2 && Math.abs(el.currentTime - target) < 0.0005) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      let seeked = false;
      let framed = false;
      let rvfcId = -1;
      const useRvfc = e.rvfcOk && typeof el.requestVideoFrameCallback === "function";
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(hard);
        el.removeEventListener("seeked", onSeeked);
        if (rvfcId >= 0 && !framed) el.cancelVideoFrameCallback?.(rvfcId);
        resolve();
      };
      const onSeeked = () => {
        seeked = true;
        if (!useRvfc || framed) {
          finish();
          return;
        }
        setTimeout(() => {
          if (settled) return;
          // The frame callback never came: after a few misses stop waiting for it on this asset
          if (++e.rvfcMisses >= 3) e.rvfcOk = false;
          finish();
        }, FRAME_WAIT);
      };
      if (useRvfc) {
        rvfcId = el.requestVideoFrameCallback!(() => {
          framed = true;
          e.rvfcMisses = 0;
          if (seeked) finish();
        });
      }
      const hard = setTimeout(finish, SEEK_TIMEOUT);
      el.addEventListener("seeked", onSeeked);
      el.currentTime = target;
    });
  }

  /** Seek every video visible at timeline time t to its exact frame (call before renderFrame in export) */
  async prepareFrame(project: Project, t: number): Promise<void> {
    const list = collectLayers(project, t, this.layers);
    const jobs: Promise<void>[] = [];
    for (let i = 0; i < list.count; i++) {
      const layer = list.items[i];
      if (layer.clip.type !== "media") continue;
      const e = this.entries.get(layer.clip.assetId);
      if (e?.asset.kind !== "video") continue;
      jobs.push(this.seekVideo(layer.clip.assetId, sourceTime(layer.clip, t), layer.voice));
    }
    await Promise.all(jobs);
  }

  // ----- preview: keep elements running ---------------------------------------------------------

  /**
   * Line the video elements up with timeline time t. Call every animation frame while playing, and
   * whenever the playhead or project changes while paused. Playing: visible videos play at the clip's
   * speed and are only corrected when they drift; everything else pauses. Paused: visible videos
   * seek, and subscribers hear when the frame lands.
   */
  syncPreview(project: Project, t: number, playing: boolean): void {
    // An export is stepping the same elements frame by frame: moving them now would hand it wrong frames
    if (performance.now() < this.exactUntil) return;
    const list = collectLayers(project, t, this.layers);
    const used = this.used;
    used.clear();
    for (let i = 0; i < list.count; i++) {
      const layer = list.items[i];
      const clip = layer.clip;
      if (clip.type !== "media") continue;
      const e = this.entries.get(clip.assetId);
      if (!e || e.asset.kind !== "video" || e.status === "error") continue;
      const el = this.voice(e, layer.voice);
      used.add(el);
      if (el.readyState < 1) continue;
      const want = this.clampSource(e, sourceTime(clip, t));
      if (playing) this.follow(el, clip, want);
      else this.park(el, want);
    }
    for (let i = 0; i < this.allVideos.length; i++) {
      const el = this.allVideos[i];
      if (!used.has(el) && !el.paused) el.pause();
    }
    if (playing && Math.abs(t - this.lastPreroll) > 0.25) {
      this.lastPreroll = t;
      this.preroll(project, t);
    }
  }

  /** Playing: run at the clip's speed, nudge the rate for small drift, jump for large drift */
  private follow(el: HTMLVideoElement, clip: MediaClip, want: number) {
    const drift = el.currentTime - want;
    if (el.paused) {
      if (Math.abs(drift) > 0.05 && !el.seeking) el.currentTime = want;
      el.playbackRate = clip.speed;
      el.play().catch(() => undefined);
      return;
    }
    if (el.seeking) return;
    if (Math.abs(drift) > 0.3 * Math.max(1, clip.speed)) {
      el.currentTime = want;
      return;
    }
    // Within a frame or two: steer gently instead of seeking (a seek stalls the picture)
    const steer = Math.abs(drift) < 0.02 ? 0 : Math.max(-0.08, Math.min(0.08, -drift));
    const rate = clip.speed * (1 + steer);
    if (Math.abs(el.playbackRate - rate) > 0.005) el.playbackRate = rate;
  }

  /** Paused: show exactly `want` */
  private park(el: HTMLVideoElement, want: number) {
    if (!el.paused) el.pause();
    if (Math.abs(el.currentTime - want) < 0.004) return;
    if (el.seeking) pendingSeek.set(el, want);
    else el.currentTime = want;
  }

  /** Cue up clips that start within the next second at their first frame, so the cut does not stall */
  private preroll(project: Project, t: number) {
    const list = collectLayers(project, t + 0.6, this.ahead);
    for (let i = 0; i < list.count; i++) {
      const layer = list.items[i];
      const clip = layer.clip;
      if (clip.type !== "media" || clip.start <= t) continue;
      const e = this.entries.get(clip.assetId);
      if (!e || e.asset.kind !== "video") continue;
      const el = this.voice(e, layer.voice);
      if (this.used.has(el) || el.seeking || el.readyState < 1) continue;
      const want = this.clampSource(e, clip.in);
      if (Math.abs(el.currentTime - want) > 0.02) el.currentTime = want;
    }
  }

  private clampSource(e: Entry, s: number): number {
    const dur = e.duration;
    return s < 0 ? 0 : dur > 0 && s > dur - 0.001 ? dur - 0.001 : s;
  }

  /** Pause every element (playback stopped, preview hidden) */
  pauseAll(): void {
    for (const el of this.allVideos) if (!el.paused) el.pause();
  }

  // ----- sound ---------------------------------------------------------------------------------

  /** The decoded sound if loadAudio() has finished, else null */
  audio(id: string): AudioBuffer | null {
    const e = this.entries.get(id);
    if (!e) return null;
    return e.audioBuffer ?? peekDecoded(e.asset) ?? null;
  }

  /** Decode the asset's sound (shared cache with decodeAudio) and keep it for audio() */
  async loadAudio(id: string): Promise<AudioBuffer | null> {
    const e = this.entries.get(id);
    if (!e) return null;
    const buf = await decodeAudio(e.asset);
    if (!e.disposed) e.audioBuffer = buf;
    return buf;
  }

  /** Decode the sound of every audio asset and every video that may have sound */
  async loadAllAudio(): Promise<void> {
    await Promise.all([...this.entries.keys()].map((id) => this.loadAudio(id)));
  }

  // ----- events / teardown ---------------------------------------------------------------------

  /** Called (batched to one microtask) when an asset loads or a paused seek lands */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify() {
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    queueMicrotask(() => {
      this.notifyQueued = false;
      for (const fn of this.listeners) fn();
    });
  }

  private drop(e: Entry) {
    e.disposed = true;
    this.entries.delete(e.asset.id);
    if (e.image && "close" in e.image) e.image.close();
    e.image = null;
    for (const el of e.videos) {
      el.pause();
      el.removeAttribute("src");
      el.load();
      el.remove();
      const i = this.allVideos.indexOf(el);
      if (i >= 0) this.allVideos.splice(i, 1);
    }
    e.videos = [];
  }

  /** Release every element and bitmap. The pool can be filled again with sync(). */
  dispose(): void {
    for (const e of [...this.entries.values()]) this.drop(e);
    this.host?.remove();
    this.host = null;
    this.listeners.clear();
  }
}
