// The export engine: renderFrame on an OffscreenCanvas at exact frame times -> WebCodecs (via mediabunny) -> MP4 with
// fast start (moov before mdat). renderFrame/mixAudio are injected so the engine can be tested without the real
// renderer; exportMp4.ts wires in the real ones.
import { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, WebMOutputFormat } from "mediabunny";
import { projectDuration, type Project } from "../model";
import { AUDIO_BITRATE, AUDIO_SAMPLE_RATE, defaultVideoBitrate, detectExportMethod, outputSize } from "./capabilities";
import { projectHasSound, seekingDriver } from "./frameSeek";
import type { ExportDeps, ExportFn, ExportOptions, ExportPhase, ExportProgress, FrameDriver, SeekablePool } from "./types";

const abortError = () => new DOMException("Export cancelled", "AbortError");

/** Share of the progress bar per phase (video dominates). */
const AUDIO_SLICE = 0.04;
const FINALIZE_SLICE = 0.03;

export function createExporter<P extends SeekablePool>(deps: ExportDeps<P>): ExportFn<P> {
  return (project, pool, options) => runExport(deps, project, pool, options);
}

/** Reports progress at most every 100 ms (plus every phase change) so a React state setter is not hit per frame. */
function progressReporter(onProgress: ExportOptions["onProgress"], framesTotal: number, fps: number) {
  const started = performance.now();
  let videoStarted = 0;
  let lastSent = 0;
  let lastPhase: ExportPhase | null = null;
  return (phase: ExportPhase, framesDone: number) => {
    if (!onProgress) return;
    const now = performance.now();
    if (phase === "video" && videoStarted === 0) videoStarted = now;
    if (phase === lastPhase && phase === "video" && now - lastSent < 100 && framesDone < framesTotal) return;
    lastSent = now;
    lastPhase = phase;
    const videoElapsed = videoStarted ? (now - videoStarted) / 1000 : 0;
    const perFrame = framesDone >= 5 && videoElapsed > 0 ? videoElapsed / framesDone : null;
    const videoFrac = framesTotal ? framesDone / framesTotal : 1;
    const fraction =
      phase === "preparing" ? 0
      : phase === "audio" ? AUDIO_SLICE / 2
      : phase === "video" ? AUDIO_SLICE + videoFrac * (1 - AUDIO_SLICE - FINALIZE_SLICE)
      : phase === "finalizing" ? 1 - FINALIZE_SLICE
      : 1;
    const p: ExportProgress = {
      phase,
      framesDone,
      framesTotal,
      fraction,
      elapsed: (now - started) / 1000,
      eta: phase === "done" ? 0 : perFrame !== null ? perFrame * (framesTotal - framesDone) + 0.3 : null,
      speed: perFrame !== null ? 1 / (perFrame * fps) : null,
    };
    onProgress(p);
  };
}

async function runExport<P extends SeekablePool>(deps: ExportDeps<P>, project: Project, pool: P, options: ExportOptions): Promise<Blob> {
  const { signal } = options;
  if (signal?.aborted) throw abortError();

  const fps = options.fps ?? project.fps;
  const duration = projectDuration(project);
  if (!(duration > 0)) throw new Error("The timeline is empty. Add a clip before exporting.");
  const size = outputSize(project.aspect, options.height);
  const bitrate = options.bitrate ?? defaultVideoBitrate(options.height, fps);
  const framesTotal = Math.max(1, Math.round(duration * fps));
  const report = progressReporter(options.onProgress, framesTotal, fps);
  report("preparing", 0);

  // Fonts (Mangal / Noto Devanagari) must be loaded before the first frame, for both the encoder and realtime paths
  const [method] = await Promise.all([detectExportMethod(size, fps, bitrate, projectHasSound(project)), deps.prepare?.(project)]);
  if (signal?.aborted) throw abortError();
  if (method.kind === "none") throw new Error("This browser can't export video. Open the studio in Chrome or Edge.");
  if (method.kind === "realtime") {
    const { recordRealtime } = await import("./realtime");
    return recordRealtime(deps, project, pool, { size, fps, bitrate, duration, mimeType: method.mimeType, framesTotal, report, signal });
  }

  const canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Couldn't create a drawing surface for the export.");

  const output = new Output({
    format: method.container === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const videoSource = new CanvasSource(canvas, {
    codec: method.video,
    bitrate,
    keyFrameInterval: 2,
    latencyMode: "quality",
    hardwareAcceleration: method.hardware ? "prefer-hardware" : "no-preference",
  });
  output.addVideoTrack(videoSource, { frameRate: fps });
  // Always add a sound track when an encoder exists (silence for a silent timeline): social platforms expect one
  const audioSource = method.audio ? new AudioBufferSource({ codec: method.audio, bitrate: AUDIO_BITRATE }) : null;
  if (audioSource) output.addAudioTrack(audioSource);

  let driver: FrameDriver<P> | null = null;
  const onAbort = () => {
    if (output.state === "pending" || output.state === "started") void output.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", onAbort);

  try {
    await output.start();

    // Audio first (OfflineAudioContext renders many times faster than real time), then encode it alongside the
    // video frames: awaiting one track to completion before feeding the other can stall the muxer's interleaving.
    let audioDone: Promise<void> = Promise.resolve();
    if (audioSource) {
      report("audio", 0);
      const mixed = await deps.mixAudio(project, pool, AUDIO_SAMPLE_RATE);
      if (signal?.aborted) throw abortError();
      audioDone = audioSource.add(mixed).then(() => audioSource.close());
      // Surface the error at the end, but don't leave an unhandled rejection meanwhile
      audioDone.catch(() => {});
    }

    driver = deps.frames ? await deps.frames(project, pool, fps, framesTotal) : seekingDriver(project, pool, fps);
    if (signal?.aborted) throw abortError();
    const { advance, pool: framePool } = driver;
    const frameDuration = 1 / fps;
    report("video", 0);
    // CanvasSource.add snapshots the canvas synchronously, so the next frame's seek can run while the encoder is
    // still busy with (or applying backpressure for) the previous one.
    let encoding: Promise<void> = Promise.resolve();
    for (let i = 0; i < framesTotal; i++) {
      if (signal?.aborted) throw abortError();
      const t = i / fps;
      await Promise.all([advance(t), encoding]);
      if (i > 0) report("video", i);
      deps.renderFrame(ctx, project, t, framePool);
      encoding = videoSource.add(t, frameDuration);
    }
    await encoding;
    report("video", framesTotal);
    videoSource.close();
    await audioDone;
    if (signal?.aborted) throw abortError();

    report("finalizing", framesTotal);
    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer) throw new Error("The encoder finished without producing a file.");
    report("done", framesTotal);
    return new Blob([buffer], { type: output.format.mimeType });
  } catch (err) {
    if (output.state === "pending" || output.state === "started") await output.cancel().catch(() => {});
    if (signal?.aborted) throw abortError();
    throw err;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await Promise.resolve(driver?.dispose()).catch(() => {});
    // Release the canvas backing store right away rather than at GC
    canvas.width = 1;
    canvas.height = 1;
  }
}
