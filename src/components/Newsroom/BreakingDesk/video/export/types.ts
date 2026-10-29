// Types for the Video Studio export (Agent D). Contract: handoff/video-studio-contract.md.
import type { Project } from "../model";

/** Output resolution class: the short side of the frame in pixels (16:9 at 1080 = 1920x1080, 9:16 at 1080 = 1080x1920). */
export type ExportResolution = 720 | 1080;

export type ExportPhase = "preparing" | "audio" | "video" | "finalizing" | "done";

export interface ExportProgress {
  phase: ExportPhase;
  /** Video frames encoded so far */
  framesDone: number;
  framesTotal: number;
  /** 0..1 over the whole export (audio mix counts as a small slice) */
  fraction: number;
  /** Seconds since the export started */
  elapsed: number;
  /** Estimated seconds left; null until a few frames have been timed */
  eta: number | null;
  /** Encoding speed as a multiple of real time (2 = a 10 s video takes 5 s); null until measured */
  speed: number | null;
}

export interface ExportOptions {
  /** Short side of the output: 720 or 1080. Named `height` per the contract; for portrait aspects it is the width. */
  height: ExportResolution;
  /** Defaults to project.fps */
  fps?: number;
  /** Video bits per second; defaults to defaultVideoBitrate(height, fps) */
  bitrate?: number;
  onProgress?: (p: ExportProgress) => void;
  /** Aborting rejects with a DOMException named "AbortError" and releases the encoder and canvas */
  signal?: AbortSignal;
}

/** What renderFrame needs from the pool is the pool's business; export itself only moves the videos. */
export interface SeekablePool {
  seekVideo(assetId: string, sourceTime: number, voice?: number): Promise<void>;
  /** MediaPool's "seek every visible video for time t" (handles the same file shown twice); used when present */
  prepareFrame?(project: Project, t: number): Promise<void>;
}

/** Puts the right source frames in place before each renderFrame call. */
export interface FrameDriver<P> {
  /** The pool renderFrame draws from (may be a view over the caller's pool) */
  pool: P;
  /** Make frame time t drawable; called once per frame in increasing t */
  advance(t: number): Promise<void>;
  dispose(): Promise<void> | void;
  /** Which video assets were decoded with WebCodecs and which fell back to element seeking (diagnostics) */
  info?: { decoded: string[]; fallback: string[] };
}

/** The two pure functions shared with the preview (render/renderFrame.ts, audio/mixAudio.ts). */
export interface ExportDeps<P extends SeekablePool> {
  renderFrame(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    project: Project,
    t: number,
    pool: P,
  ): void;
  mixAudio(project: Project, pool: P, sampleRate?: number): Promise<AudioBuffer>;
  /** Awaited once before the first frame (fonts used by text and captions) */
  prepare?(project: Project): Promise<void>;
  /** Fast frame source for the WebCodecs path; defaults to seeking the pool's videos for every frame */
  frames?(project: Project, pool: P, fps: number, framesTotal: number): Promise<FrameDriver<P>>;
}

export type ExportFn<P extends SeekablePool> = (project: Project, pool: P, options: ExportOptions) => Promise<Blob>;

/** How this browser will export */
export type ExportMethod =
  | {
      kind: "webcodecs";
      container: "mp4" | "webm";
      video: "avc" | "vp9" | "vp8";
      /** null: no usable audio encoder (export is silent only if the project has no sound, otherwise realtime is used) */
      audio: "aac" | "opus" | null;
      hardware: boolean;
    }
  | { kind: "realtime"; mimeType: string }
  | { kind: "none" };
