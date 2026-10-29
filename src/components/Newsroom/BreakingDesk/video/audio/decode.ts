// Decode an asset's sound once and share the AudioBuffer between waveforms, the preview engine and the export mix.
// Agent B's render/mediaPool.ts did not exist when this was written, so audio owns its own cache; MediaPool can
// delegate to decodeAsset() (or mixAudio reads pool.audio() first, see mixAudio.ts).

import type { Asset } from "../model";

/** All decodes resample to this rate; AudioBufferSourceNode resamples again if a context runs at another rate. */
export const DECODE_RATE = 48000;

const pending = new Map<string, Promise<AudioBuffer | null>>();
const done = new Map<string, AudioBuffer | null>();
let decoder: OfflineAudioContext | null = null;

function keyOf(asset: Pick<Asset, "id" | "url">): string {
  return `${asset.id}|${asset.url}`;
}

function getDecoder(): OfflineAudioContext {
  // An OfflineAudioContext that is never rendered costs nothing and needs no user gesture.
  if (!decoder) decoder = new OfflineAudioContext(2, 1, DECODE_RATE);
  return decoder;
}

/** Decode raw file bytes. Rejects when the bytes hold no decodable audio. */
export function decodeBytes(bytes: ArrayBuffer): Promise<AudioBuffer> {
  return getDecoder().decodeAudioData(bytes);
}

/**
 * The asset's decoded sound, or null when it has none (an image, a video without an audio track, an unsupported
 * codec). Network failures are not cached, so a later call retries.
 */
export function decodeAsset(asset: Asset): Promise<AudioBuffer | null> {
  const key = keyOf(asset);
  const existing = pending.get(key);
  if (existing) return existing;
  if (asset.kind === "image" || asset.hasAudio === false) {
    done.set(key, null);
    const none = Promise.resolve(null);
    pending.set(key, none);
    return none;
  }
  const job = (async () => {
    let bytes: ArrayBuffer;
    try {
      const res = await fetch(asset.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      bytes = await res.arrayBuffer();
    } catch (err) {
      pending.delete(key);
      console.warn(`[video/audio] could not load "${asset.name}" for audio:`, err);
      return null;
    }
    try {
      const buffer = await decodeBytes(bytes);
      done.set(key, buffer);
      return buffer;
    } catch {
      // Video without sound, or a codec the browser cannot decode: remember "no audio".
      done.set(key, null);
      return null;
    }
  })();
  pending.set(key, job);
  return job;
}

/** Synchronous look-up: the buffer if decoding finished, null if it finished without audio, undefined if not yet. */
export function peekDecoded(asset: Pick<Asset, "id" | "url">): AudioBuffer | null | undefined {
  return done.get(keyOf(asset));
}

/** Seed the cache with a buffer decoded elsewhere (importMusic, or MediaPool) so nothing decodes twice. */
export function primeDecoded(asset: Pick<Asset, "id" | "url">, buffer: AudioBuffer | null): void {
  const key = keyOf(asset);
  done.set(key, buffer);
  pending.set(key, Promise.resolve(buffer));
}

/** True when the asset has a decodable sound track (decodes it if needed). Use it to fill Asset.hasAudio. */
export async function probeHasAudio(asset: Asset): Promise<boolean> {
  return (await decodeAsset({ ...asset, hasAudio: undefined })) !== null;
}

/** Drop every cached buffer for an asset id (call when the asset is removed or its URL revoked). */
export function forgetDecoded(assetId: string): void {
  const prefix = `${assetId}|`;
  for (const k of [...pending.keys()]) if (k.startsWith(prefix)) pending.delete(k);
  for (const k of [...done.keys()]) if (k.startsWith(prefix)) done.delete(k);
}
