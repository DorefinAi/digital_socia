// Web Audio wiring shared by mixAudio (OfflineAudioContext) and AudioEngine (AudioContext):
// source -> envelope gain -> volume gain -> track gain -> master gain -> soft clip -> destination.

import { sampleEnvelope, softClipCurve, type EnvPoint } from "./gain";
import type { VoicePlan } from "./voices";

export interface VoiceNodes {
  source: AudioBufferSourceNode;
  env: GainNode;
  vol: GainNode;
}

/** Write envelope breakpoints onto a param: `when` is the context time at which the clip is `fromLocal` s in. */
export function scheduleEnvelope(param: AudioParam, points: EnvPoint[], when: number, fromLocal: number): void {
  param.setValueAtTime(sampleEnvelope(points, fromLocal), when);
  for (const p of points) if (p.t > fromLocal) param.linearRampToValueAtTime(p.g, when + (p.t - fromLocal));
}

/**
 * Start one clip's sound. `when` is the context time that corresponds to timeline time `at`; the clip may begin later
 * than `at` (scheduled ahead) or earlier (joined mid-clip). Returns null when nothing of the clip is left to play.
 */
export function startVoice(
  ctx: BaseAudioContext,
  plan: VoicePlan,
  buffer: AudioBuffer,
  output: AudioNode,
  when: number,
  at: number,
): VoiceNodes | null {
  const local = Math.max(0, at - plan.start);
  const remaining = plan.duration - local;
  if (remaining <= 1e-4) return null;
  const offset = plan.in + local * plan.speed;
  if (offset >= buffer.duration) return null;
  const startAt = when + Math.max(0, plan.start - at);
  // Source seconds still needed, capped at what the file holds.
  const sourceSpan = Math.min(remaining * plan.speed, buffer.duration - offset);

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = plan.speed;
  const env = ctx.createGain();
  const vol = ctx.createGain();
  vol.gain.value = plan.volume;
  scheduleEnvelope(env.gain, plan.envelope, startAt, local);
  source.connect(env).connect(vol).connect(output);
  source.start(startAt, offset, sourceSpan);
  source.stop(startAt + remaining);
  return { source, env, vol };
}

export function stopVoice(v: VoiceNodes, ctx: BaseAudioContext): void {
  try {
    // A 10 ms ramp to silence avoids a click when a voice is cut mid-sound (seek, pause, edit).
    const now = ctx.currentTime;
    v.vol.gain.cancelScheduledValues(now);
    v.vol.gain.setValueAtTime(v.vol.gain.value, now);
    v.vol.gain.linearRampToValueAtTime(0, now + 0.01);
    v.source.stop(now + 0.012);
  } catch {
    // already stopped
  }
  setTimeout(() => {
    try {
      v.source.disconnect();
      v.vol.disconnect();
    } catch {
      // ignore
    }
  }, 50);
}

let curve: Float32Array<ArrayBuffer> | null = null;

/** Master gain followed by the soft-clip shaper. Connect voices/track gains to `input`, take sound from `output`. */
export function createMaster(ctx: BaseAudioContext): { input: GainNode; output: WaveShaperNode } {
  const input = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  curve ??= softClipCurve();
  shaper.curve = curve;
  shaper.oversample = "none";
  input.connect(shaper);
  return { input, output: shaper };
}
