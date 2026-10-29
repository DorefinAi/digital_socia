// Turn a picked/dropped sound file into an Asset (blob: URL, real duration), decoded once and cached for the
// waveform, preview and export.

import { newId, type Asset } from "../model";
import { decodeBytes, forgetDecoded, primeDecoded } from "./decode";
import { forgetPeaks } from "./peaks";

const AUDIO_EXT = /\.(mp3|wav|wave|m4a|aac|ogg|oga|opus|flac|weba|webm)$/i;

/** Accept attribute for a file input that picks music */
export const MUSIC_ACCEPT = "audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac";

export function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/") || AUDIO_EXT.test(file.name);
}

/**
 * Decode the file and return an audio Asset. Throws an Error with a message fit for the UI when the file is not
 * audio or the browser cannot decode it. The caller owns the blob: URL; release it with releaseAudioAsset().
 */
export async function importMusic(file: File): Promise<Asset> {
  if (!isAudioFile(file)) throw new Error(`"${file.name}" is not an audio file. Choose an MP3, WAV, M4A, OGG or FLAC file.`);
  let buffer: AudioBuffer;
  try {
    buffer = await decodeBytes(await file.arrayBuffer());
  } catch {
    throw new Error(`Couldn't read the sound in "${file.name}". Try an MP3, WAV or M4A file.`);
  }
  const asset: Asset = {
    id: newId("ast"),
    kind: "audio",
    url: URL.createObjectURL(file),
    name: file.name.replace(/\.[^.]+$/, ""),
    duration: buffer.duration,
    hasAudio: true,
  };
  primeDecoded(asset, buffer);
  return asset;
}

/** Revoke the asset's blob: URL and drop its decoded sound and caches. */
export function releaseAudioAsset(asset: Asset): void {
  forgetDecoded(asset.id);
  forgetPeaks(asset.id);
  if (asset.url.startsWith("blob:")) URL.revokeObjectURL(asset.url);
}
