// Public export entry: the studio's MediaPool + renderFrame + mixAudio wired into the export engine.
//
//   const blob = await exportMp4(project, pool, { height: 1080, onProgress, signal });
//   if (blob.type === "video/mp4") ... else WebM (browser without H.264 encoding)
//
// Loaded lazily by ExportDialog (pulls in mediabunny); capability checks live in ./capabilities without it.
import { mixAudio } from "../audio/mixAudio";
import type { MediaPool } from "../render/mediaPool";
import { ensureFonts } from "../render/fonts";
import { renderFrame } from "../render/renderFrame";
import { createDecodedFrames } from "./decodedFrames";
import { createExporter } from "./engine";
import { seekingDriver } from "./frameSeek";
import type { ExportFn } from "./types";

export { canExportMp4 } from "./capabilities";
export { download } from "./download";

/** H.264 + AAC MP4 (fast start). Videos are decoded with WebCodecs in order; any that can't be fall back to seeking. */
export const exportMp4: ExportFn<MediaPool> = createExporter<MediaPool>({
  renderFrame,
  mixAudio,
  prepare: ensureFonts,
  frames: async (project, pool, fps, framesTotal) => {
    try {
      return await createDecodedFrames(project, pool, fps, framesTotal);
    } catch {
      return seekingDriver(project, pool, fps);
    }
  },
});

/** Same output, but every frame comes from seeking the pool's <video> elements (about real time; for comparison). */
export const exportMp4BySeeking: ExportFn<MediaPool> = createExporter<MediaPool>({ renderFrame, mixAudio, prepare: ensureFonts });
