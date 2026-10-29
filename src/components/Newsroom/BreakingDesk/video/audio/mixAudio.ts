// The export soundtrack: every audible clip rendered through the same graph as the preview, in an OfflineAudioContext.

import { projectDuration, type Asset, type Project } from "../model";
import { decodeAsset } from "./decode";
import { createMaster, startVoice } from "./graph";
import { planVoices } from "./voices";

/**
 * Anything that can hand over a decoded buffer for an asset. Agent B's MediaPool satisfies this through
 * `audio(assetId)`; when it returns nothing (or throws) the asset is decoded here instead.
 */
export interface AudioBufferProvider {
  audio(assetId: string): AudioBuffer | null | undefined;
}

async function bufferFor(asset: Asset, pool: AudioBufferProvider | null | undefined): Promise<AudioBuffer | null> {
  try {
    const b = pool?.audio(asset.id);
    if (b) return b;
  } catch {
    // pool has not loaded this asset's audio: decode it ourselves
  }
  return decodeAsset(asset);
}

/**
 * Stereo mix of the whole project at `sampleRate`, exactly project duration long (silence where nothing plays).
 * Respects track mute/solo, audioDetached, clip volume, fades, speed, in-points and transition crossfades.
 */
export async function mixAudio(project: Project, pool?: AudioBufferProvider | null, sampleRate = 48000): Promise<AudioBuffer> {
  const duration = projectDuration(project);
  const length = Math.max(1, Math.ceil(duration * sampleRate));
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length, sampleRate });
  const plans = planVoices(project);

  const assetIds = [...new Set(plans.map((p) => p.assetId))];
  const buffers = new Map<string, AudioBuffer | null>();
  await Promise.all(
    assetIds.map(async (id) => {
      const asset = project.assets.find((a) => a.id === id);
      buffers.set(id, asset ? await bufferFor(asset, pool) : null);
    }),
  );

  const master = createMaster(ctx);
  master.output.connect(ctx.destination);
  for (const plan of plans) {
    const buffer = buffers.get(plan.assetId);
    if (buffer) startVoice(ctx, plan, buffer, master.input, 0, 0);
  }
  return ctx.startRendering();
}
