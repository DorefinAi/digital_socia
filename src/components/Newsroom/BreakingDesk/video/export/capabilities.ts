// Export sizing and browser capability checks. Plain WebCodecs (no mediabunny import) so the dialog can show what will
// happen before the encoder bundle is loaded.
import { ASPECTS, type Aspect } from "../model";
import type { ExportMethod, ExportResolution } from "./types";

export const AUDIO_BITRATE = 128_000;
export const AUDIO_SAMPLE_RATE = 48_000;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Output pixel size: the short side is `resolution`, the other side follows the project aspect (always even for H.264). */
export function outputSize(aspect: Aspect, resolution: ExportResolution): { width: number; height: number } {
  const { width, height } = ASPECTS[aspect];
  const scale = resolution / Math.min(width, height);
  return { width: even(width * scale), height: even(height * scale) };
}

/** Bits per second that keep fast motion clean: 8 Mbps at 1080p30, 5 Mbps at 720p30, +50% at 60 fps. */
export function defaultVideoBitrate(resolution: ExportResolution, fps: number): number {
  const base = resolution >= 1080 ? 8_000_000 : 5_000_000;
  return fps > 30 ? Math.round(base * 1.5) : base;
}

/** Expected file size in bytes (container overhead ~1%). */
export function estimateBytes(durationSec: number, videoBitrate: number, audioBitrate = AUDIO_BITRATE): number {
  return Math.round(((videoBitrate + audioBitrate) * durationSec * 1.01) / 8);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
}

/** H.264 High profile with a level big enough for the frame size and rate. */
function avcCodecString(width: number, height: number, fps: number): string {
  const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
  const perSecond = macroblocks * fps;
  // 3.1: 3600 MB/frame 108000 MB/s; 4.0: 8192 / 245760; 4.2: 8704 / 522240; 5.1: 36864 / 983040
  const level = macroblocks <= 3600 && perSecond <= 108_000 ? "1f" : macroblocks <= 8192 && perSecond <= 245_760 ? "28" : macroblocks <= 8704 && perSecond <= 522_240 ? "2a" : "33";
  return `avc1.6400${level}`;
}

async function videoSupported(config: VideoEncoderConfig): Promise<boolean> {
  try {
    return (await VideoEncoder.isConfigSupported(config)).supported === true;
  } catch {
    return false;
  }
}

async function audioSupported(codec: string): Promise<boolean> {
  if (typeof AudioEncoder === "undefined") return false;
  try {
    const res = await AudioEncoder.isConfigSupported({ codec, sampleRate: AUDIO_SAMPLE_RATE, numberOfChannels: 2, bitrate: AUDIO_BITRATE });
    return res.supported === true;
  } catch {
    return false;
  }
}

const REALTIME_TYPES = [
  "video/mp4;codecs=avc1.640028,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function realtimeMimeType(): string | null {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement === "undefined" || !("captureStream" in HTMLCanvasElement.prototype)) return null;
  return REALTIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

/**
 * Picks the export path for this browser and size: WebCodecs H.264 MP4 (hardware first), then VP9/VP8 WebM, then a
 * real-time MediaRecorder capture. `needsAudio` false lets a silent project use WebCodecs even without an audio encoder.
 */
export async function detectExportMethod(
  size: { width: number; height: number },
  fps: number,
  bitrate: number,
  needsAudio = true,
): Promise<ExportMethod> {
  const realtime = (): ExportMethod => {
    const mimeType = realtimeMimeType();
    return mimeType ? { kind: "realtime", mimeType } : { kind: "none" };
  };
  if (typeof VideoEncoder === "undefined") return realtime();

  const base = { width: size.width, height: size.height, framerate: fps, bitrate };
  const [aac, opus] = await Promise.all([audioSupported("mp4a.40.2"), audioSupported("opus")]);

  const avc = avcCodecString(size.width, size.height, fps);
  for (const hardware of [true, false]) {
    const ok = await videoSupported({ ...base, codec: avc, hardwareAcceleration: hardware ? "prefer-hardware" : "no-preference" });
    if (!ok) continue;
    const audio = aac ? "aac" : opus ? "opus" : null;
    if (audio || !needsAudio) return { kind: "webcodecs", container: "mp4", video: "avc", audio, hardware };
    break;
  }
  for (const [video, codec] of [["vp9", "vp09.00.40.08"], ["vp8", "vp8"]] as const) {
    for (const hardware of [true, false]) {
      if (!(await videoSupported({ ...base, codec, hardwareAcceleration: hardware ? "prefer-hardware" : "no-preference" }))) continue;
      if (opus || !needsAudio) return { kind: "webcodecs", container: "webm", video, audio: opus ? "opus" : null, hardware };
      break;
    }
  }
  return realtime();
}

/** True when this browser can make an H.264 + AAC MP4 with WebCodecs at 1080p (the full-speed export path). */
export async function canExportMp4(): Promise<boolean> {
  if (typeof VideoEncoder === "undefined") return false;
  const [video, audio] = await Promise.all([
    videoSupported({ codec: avcCodecString(1920, 1080, 30), width: 1920, height: 1080, framerate: 30, bitrate: 8_000_000 }),
    audioSupported("mp4a.40.2"),
  ]);
  return video && audio;
}

/** Plain-language line for the dialog. */
export function describeMethod(m: ExportMethod): string {
  switch (m.kind) {
    case "webcodecs": {
      const v = m.video === "avc" ? "H.264" : m.video.toUpperCase();
      const a = m.audio === "aac" ? "AAC" : m.audio === "opus" ? "Opus" : "no sound";
      return `${m.container.toUpperCase()}, ${v} + ${a}, ${m.hardware ? "hardware" : "software"} encoding`;
    }
    case "realtime":
      return "This browser can't encode video directly, so the export records while it plays: it takes as long as the video and may drop frames. Chrome or Edge export faster.";
    case "none":
      return "This browser can't export video. Open the studio in Chrome or Edge.";
  }
}
