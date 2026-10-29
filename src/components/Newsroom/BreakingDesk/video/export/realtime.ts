// Last-resort export for browsers without WebCodecs encoders: play the timeline onto a canvas in real time and record
// it with MediaRecorder. Takes as long as the video; frames can drop if seeking falls behind; the tab must stay visible.
import type { Project } from "../model";
import { AUDIO_BITRATE, AUDIO_SAMPLE_RATE } from "./capabilities";
import { seekingDriver } from "./frameSeek";
import type { ExportDeps, ExportPhase, SeekablePool } from "./types";

const abortError = () => new DOMException("Export cancelled", "AbortError");

interface RealtimeOptions {
  size: { width: number; height: number };
  fps: number;
  bitrate: number;
  duration: number;
  mimeType: string;
  framesTotal: number;
  report: (phase: ExportPhase, framesDone: number) => void;
  signal?: AbortSignal;
}

export async function recordRealtime<P extends SeekablePool>(deps: ExportDeps<P>, project: Project, pool: P, o: RealtimeOptions): Promise<Blob> {
  const { signal } = o;
  const canvas = document.createElement("canvas");
  canvas.width = o.size.width;
  canvas.height = o.size.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Couldn't create a drawing surface for the export.");

  o.report("audio", 0);
  const mixed = await deps.mixAudio(project, pool, AUDIO_SAMPLE_RATE);
  if (signal?.aborted) throw abortError();

  const seek = seekingDriver(project, pool, o.fps).advance;
  // Frame 0 is on the canvas before recording starts so the file doesn't open on black
  await seek(0);
  deps.renderFrame(ctx, project, 0, pool);

  const stream = canvas.captureStream(o.fps);
  const audioCtx = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
  const dest = audioCtx.createMediaStreamDestination();
  const source = audioCtx.createBufferSource();
  source.buffer = mixed;
  source.connect(dest);
  for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);

  const recorder = new MediaRecorder(stream, { mimeType: o.mimeType, videoBitsPerSecond: o.bitrate, audioBitsPerSecond: AUDIO_BITRATE });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));

  const cleanup = () => {
    if (recorder.state !== "inactive") recorder.stop();
    try {
      source.stop();
    } catch {}
    for (const track of stream.getTracks()) track.stop();
    void audioCtx.close().catch(() => {});
    canvas.width = 1;
    canvas.height = 1;
  };

  try {
    await audioCtx.resume();
    recorder.start(1000);
    source.start();
    const t0 = audioCtx.currentTime;
    o.report("video", 0);
    // The audio clock drives the picture, so sound and video stay in sync even when a seek is slow
    for (;;) {
      if (signal?.aborted) throw abortError();
      const t = audioCtx.currentTime - t0;
      if (t >= o.duration) break;
      await seek(t);
      deps.renderFrame(ctx, project, t, pool);
      o.report("video", Math.min(o.framesTotal, Math.floor(t * o.fps)));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    }
    o.report("finalizing", o.framesTotal);
    recorder.stop();
    await stopped;
    o.report("done", o.framesTotal);
    return new Blob(chunks, { type: recorder.mimeType || o.mimeType });
  } catch (err) {
    if (signal?.aborted) throw abortError();
    throw err;
  } finally {
    cleanup();
  }
}
