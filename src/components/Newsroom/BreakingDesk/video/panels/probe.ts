import type { AssetKind } from "../model";
import type { MediaFacts } from "../projectFromStory";

const PROBE_TIMEOUT_MS = 8000;

/** Duration and size of a media file from its metadata alone (no full download). Resolves {} if unreadable. */
export function probeMedia(url: string, kind: AssetKind): Promise<MediaFacts> {
  if (typeof document === "undefined") return Promise.resolve({});
  return new Promise((resolve) => {
    let done = false;
    const finish = (facts: MediaFacts) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(facts);
    };
    const timer = setTimeout(() => finish({}), PROBE_TIMEOUT_MS);

    if (kind === "image") {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => finish({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => finish({});
      img.src = url;
      return;
    }
    const el = document.createElement(kind === "video" ? "video" : "audio");
    el.preload = "metadata";
    el.muted = true;
    el.onloadedmetadata = () => {
      const v = el as HTMLVideoElement;
      finish({
        duration: Number.isFinite(el.duration) ? el.duration : undefined,
        width: kind === "video" ? v.videoWidth || undefined : undefined,
        height: kind === "video" ? v.videoHeight || undefined : undefined,
      });
      el.removeAttribute("src");
      el.load();
    };
    el.onerror = () => finish({});
    el.src = url;
  });
}

export function kindOf(file: File): AssetKind | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "mov", "webm", "mkv", "m4v"].includes(ext)) return "video";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  if (["mp3", "wav", "m4a", "aac", "ogg", "oga"].includes(ext)) return "audio";
  return null;
}
