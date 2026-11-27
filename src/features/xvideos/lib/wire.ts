// The X Videos backend's clip (backend apps/api/src/xvideos/view.ts) and its mapping to the desk's XvClip. Pure, no
// fetch, so node --test can load it.

import type { XvClip } from "../data/xVideosData";
import { SOCIA_API_URL } from "../../../lib/socia/config";

/** A clip as GET /xvideos/clips answers it (backend apps/api/src/xvideos/view.ts). Media links are API paths. */
export interface XvWireClip {
  id: string;
  fileName: string;
  shareName: string;
  title: string;
  src: string;
  poster?: string;
  folder: string[];
  receivedAt: string;
  duration: number;
  size: number;
  width?: number;
  height?: number;
  kind: "clip";
  district: string;
  suggestedHeadline: string | null;
  readingProgress?: number;
  transcript: { at: number; text: string }[];
  screenText: never[];
  frames?: { where: "first" | "mid" | "last"; at: number; src: string; text: string }[];
  contactSheet?: string;
  cutTimes?: number[];
  heard: string[];
  channelLabel: string | null;
  hashtags: { value: string; on: boolean }[];
  mentions: { value: string; on: boolean }[];
  status: "new" | "posted" | "rejected";
  error?: string;
  /** Folders inside the day folder joined with " / ", "" for a file loose in the day folder */
  innerFolder: string;
  /** The day folder, "2026-11-27" */
  day: string | null;
  /** The file name carries the desk's x mark */
  picked: boolean;
  /** Marked done on the share: posted by hand already (status is "posted" too) */
  done: boolean;
  /** "file_name": suggestedHeadline is the file's own full heading; null: the screen read will fill it later */
  headlineSource: "file_name" | null;
  /** The share deleted the file (it keeps 3-4 days) */
  gone: boolean;
}

const abs = (path: string | undefined, base: string) => (path ? `${base}${path}` : undefined);

const dayQuery = (day: string | null) => (day ? `?day=${encodeURIComponent(day)}` : "");

/** GET: one day folder's clips; no day asks for today's (IST) */
export const xvClipsPath = (day: string | null) => `/xvideos/clips${dayQuery(day)}`;

/** POST: asks the watcher to walk that day folder now (and once more 10 s later); no day walks today's (IST) */
export const xvRescanPath = (day: string | null) => `/xvideos/rescan${dayQuery(day)}`;

/** The wire clip → the desk's XvClip: media paths made absolute against the API. A clip done on the share was posted by hand before. */
export function toXvClip(w: XvWireClip, base = SOCIA_API_URL): XvClip {
  // Done on the share means posted by hand, even if a status ever lags behind
  const status = w.done && w.status === "new" ? "posted" : w.status;
  return {
    id: w.id,
    fileName: w.fileName,
    shareName: w.shareName,
    src: `${base}${w.src}`,
    poster: abs(w.poster, base),
    folder: w.folder,
    receivedAt: w.receivedAt,
    duration: w.duration,
    size: w.size,
    width: w.width,
    height: w.height,
    kind: w.kind,
    district: w.district,
    topic: w.title || undefined,
    suggestedHeadline: w.suggestedHeadline,
    readingProgress: w.readingProgress,
    transcript: w.transcript,
    screenText: [],
    frames: w.frames?.map((f) => ({ ...f, src: `${base}${f.src}` })),
    contactSheet: abs(w.contactSheet, base),
    cutTimes: w.cutTimes,
    heard: w.heard,
    channelLabel: w.channelLabel,
    hashtags: w.hashtags,
    mentions: w.mentions,
    status,
    postedAt: status === "posted" ? w.receivedAt : undefined,
    loadError: w.error,
    innerFolder: w.innerFolder ?? "",
    day: w.day ?? null,
    picked: !!w.picked,
    headlineSource: w.headlineSource === "file_name" ? "file_name" : null,
    gone: !!w.gone,
  };
}
