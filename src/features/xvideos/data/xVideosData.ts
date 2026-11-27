// Demo data for the X Videos desk (/ai-content/x-videos, behind NEXT_PUBLIC_XVIDEOS), built on 26 real video posts
// @1stIndiaNews put on X on 21 Nov 2026 (src/features/xvideos/data/xClipsReal.json, made by docs/xvideos/build-real-clips.py). The
// suggested headline and tags are what was really posted, standing in for the system's guess; the transcript is the
// real Hindi speech (Whisper, machine-made, capped at 40 lines). The desk states (posted, rejected, being read,
// held) are assigned here for the demo. The videos and frames are local copies under public/xvideos-demo/real*/,
// which are gitignored; a missing file shows a dark frame with the file name.

import realClips from "./xClipsReal.json";
import { istDay } from "../lib/folders";

export type XvKind = "live" | "clip";
export type XvStatus = "new" | "posted" | "rejected";
/** Where a story is from: Rajasthan (#RajasthanWithFirstIndia) or outside it (#FirstIndiaNews) */
export type XvRegion = "rajasthan" | "india";

/** One timed line of what is said in the clip (Hindi speech-to-text) */
export interface XvTranscriptLine {
  /** Seconds from the start of the clip */
  at: number;
  text: string;
  /** The part worth posting, highlighted in the panel */
  highlight?: string;
  /** Marked as a line worth using: a blue dot on the trim bar */
  worth?: boolean;
}

/** Text read from a frame: a super, ticker or name strap */
export interface XvScreenText {
  id: string;
  at: number;
  text: string;
  /** Where it was read on the frame, in % of the frame (left, top, width, height) */
  box: { x: number; y: number; w: number; h: number };
  kind: "super" | "ticker" | "strap";
}

/** A still taken from the clip (start, middle, end); its text is read in the backend phase, so it is "" for now */
export interface XvFrameGrab {
  where: "first" | "mid" | "last";
  at: number;
  /** The JPG, under public/ */
  src: string;
  text: string;
}

export interface XvTagSuggestion {
  value: string;
  /** Ticked when the editor opens */
  on: boolean;
}

export interface XvClip {
  id: string;
  fileName: string;
  /** The video, under public/ */
  src: string;
  /** A still for thumbnails and the player before it plays, under public/ */
  poster?: string;
  /** The place the story is from ("Jodhpur", "Bihar"); the title's label is built from it */
  district: string;
  region?: XvRegion;
  /** What the clip is about, in the desk's words ("CM press conference") */
  topic?: string;
  receivedAt: string;
  /** Where the file sits on the share, folder by folder under the month folder: ["21-11-2026", "3 pm convert"] */
  folder: string[];
  /** The file's name on the share as the desk saved it; often messy ("x...jodhpur(0).mp4", a full title, "csmp4") */
  shareName: string;
  /** Seconds */
  duration: number;
  /** Bytes */
  size: number;
  /** Pixels, for the player's shape (1080x1920 is a vertical short) */
  width?: number;
  height?: number;
  kind: XvKind;
  /** The system's guess at a headline; null while the clip is still being read */
  suggestedHeadline: string | null;
  /** A headline the desk already confirmed (shown black, not as Suggested) */
  headline?: string;
  /** 0-100 while the clip is being read (speech and frames); undefined once done */
  readingProgress?: number;
  transcript: XvTranscriptLine[];
  screenText: XvScreenText[];
  /** Stills from the clip with the text on them still to be read (On screen panel) */
  frames?: XvFrameGrab[];
  /** 12 frames in a 4x3 grid ("See all frames"), under public/ */
  contactSheet?: string;
  /** Seconds of each hard scene cut */
  cutTimes?: number[];
  /** Names and things heard, as chips */
  heard: string[];
  /** The channel label the title should end with ("Jaipur News", "Jodhpur | Rajasthan News"), or null */
  channelLabel: string | null;
  /** Video-style prefixes that fit this clip ("Bansur Cylinder Blast:") besides the standard ones */
  prefixes?: string[];
  hashtags: XvTagSuggestion[];
  mentions: XvTagSuggestion[];
  status: XvStatus;
  /** Someone else has it open */
  heldBy?: string;
  postedAt?: string;
  postedText?: string;
  /** Live data: the standing post's id (undo names it) and who posted it */
  postId?: number;
  postedBy?: string;
  rejectedReason?: string;
  /** Live data: the draft an editor saved for this clip (the desk opens it instead of the suggestion) */
  savedDraft?: XvSavedDraft;
  /** Live data only: why the backend could not read this clip (probe or speech failed after its retries) */
  loadError?: string;
  /** Folders inside the day folder, joined with " / " ("3 pm convert"); "" for a file loose in the day folder */
  innerFolder?: string;
  /** The day folder the clip is in, "2026-11-27" */
  day?: string | null;
  /** The file name carries the desk's x mark (shown, never used to hide a clip) */
  picked?: boolean;
  /** "file_name": the suggested headline is the file's own name, a full heading; "screen": written from the screen text */
  headlineSource?: "file_name" | "screen" | null;
  /** The share already deleted the file */
  gone?: boolean;
}

/** A draft as the backend keeps it (deskState.ts XvDraft, saved as is) */
export interface XvSavedDraft {
  title: string;
  source?: { kind: string; at?: number };
  brandOn: boolean;
  hashtags: { value: string; on: boolean; added?: boolean }[];
  mentions: { value: string; on: boolean; added?: boolean }[];
  trim: { start: number; end: number };
  savedAt?: string;
  scheduledAt?: string;
}

interface RealClip {
  id: string;
  fileName: string;
  src: string;
  poster: string;
  sheet: string;
  durationS: number;
  sizeMb: number;
  width: number;
  height: number;
  orientation: string;
  postedIst: string;
  place: string;
  region: string;
  brandTag: string;
  channelLabel: string | null;
  prefix: string | null;
  postedTitle: string;
  postedCaption: string;
  hashtags: string[];
  mentions: string[];
  postUrl: string;
  views: number;
  likes: number;
  cutTimes: number[];
  transcript: { at: number; text: string }[];
  frames: { where: string; at: number; src: string; text: string }[];
}

const REAL = realClips as RealClip[];

/** The tags the desk never ticks by hand: the brand tags (set by the label) and #FINVideo (always on) */
const AUTO_TAGS = new Set(["#rajasthanwithfirstindia", "#firstindianews", "#finvideo"]);

// The demo's desk states, by post id (the rest are New)
const POSTED = new Set(["2124051167722512384", "2124052696626028544", "2124054108344864768"]);
const REJECTED: Record<string, string> = { "2124053303436992512": "Feature story, kept for the evening slot" };
const READING: Record<string, number> = { "2124091448337608704": 45 };
const HELD: Record<string, string> = { "2124088850247213056": "Rohit" };

/**
 * The shift folder a clip lands in on the share, from its time: the desk saves into "Convert morning…", "3 pm
 * convert" and "Unconvert" folders under each day (folder names as they are on the share, typos and dashes included)
 */
function shiftFolder(postedIst: string): string {
  const hm = postedIst.slice(11, 16);
  if (hm < "14:30") return "Convert morning to-------";
  if (hm < "16:00") return "3 pm convert";
  return "Unconvert";
}

const X_MARKS = ["x...", "X....", "x..........", "x.."];
/** The desk's x mark at the start of a file name ("x...", "X....") */
const X_MARK_RE = /^x\.{2,}/i;
/** Characters Windows does not allow in a file name; the desk drops them (a " | " becomes two spaces) */
const unsafe = (title: string) => title.replace(/\s*\|\s*/g, "  ").replace(/[\\/:*?"<>]/g, "").trim();

/**
 * A share-style name for demo clip `i` (posting order): an X mark the desk types when it picks a clip ("x...done..."
 * once posted; every fifth clip not picked yet has none), then either the YouTube title or just the place, numbered
 * "(0)" when the place repeats
 */
function shareNameFor(r: RealClip, i: number, posted: boolean, seen: Map<string, number>): string {
  const mark = !posted && i % 5 === 3 ? "" : X_MARKS[i % X_MARKS.length] + (posted ? "done..." : "");
  if (i % 3 !== 1) return `${mark}${unsafe(r.postedTitle)}.mp4`;
  const place = r.place.toLowerCase();
  const n = seen.get(place) ?? -1;
  seen.set(place, n + 1);
  return `${mark}${place}${n >= 0 ? `(${n})` : ""}.mp4`;
}

/** Minutes between two "2026-11-21 13:36" stamps */
const minutesBetween = (a: string, b: string) => (Date.parse(b.replace(" ", "T")) - Date.parse(a.replace(" ", "T"))) / 60_000;

function toClip(r: RealClip, latest: string, now: number, shareName: string): XvClip {
  // Received times keep the real posting order and gaps, the newest just now
  const receivedMs = now - (minutesBetween(r.postedIst, latest) + 0.5) * 60_000;
  const at = (ms: number) => new Date(ms).toISOString();
  const reading = READING[r.id];
  const posted = POSTED.has(r.id);
  const vertical = r.height > r.width;
  return {
    id: r.id,
    fileName: r.fileName,
    src: r.src,
    poster: r.poster,
    district: r.place,
    region: r.region === "india" ? "india" : "rajasthan",
    topic: vertical ? "Digital short, vertical" : undefined,
    receivedAt: at(receivedMs),
    folder: [`${r.postedIst.slice(8, 10)}-${r.postedIst.slice(5, 7)}-${r.postedIst.slice(0, 4)}`, shiftFolder(r.postedIst)],
    // The demo shows one day folder: today's
    day: istDay(now),
    innerFolder: shiftFolder(r.postedIst),
    picked: X_MARK_RE.test(shareName),
    // A share name that is the full title reads as the headline; a bare place name does not
    headlineSource: reading === undefined && shareName.includes(unsafe(r.postedTitle)) ? "file_name" : null,
    shareName,
    duration: r.durationS,
    size: Math.round(r.sizeMb * 1024 * 1024),
    width: r.width,
    height: r.height,
    kind: "clip",
    suggestedHeadline: reading === undefined ? r.postedTitle : null,
    readingProgress: reading,
    transcript: reading === undefined ? r.transcript : [],
    screenText: [],
    frames: reading === undefined ? r.frames.map((f) => ({ where: f.where as XvFrameGrab["where"], at: f.at, src: f.src, text: f.text })) : [],
    contactSheet: r.sheet,
    cutTimes: r.cutTimes,
    heard: [],
    channelLabel: r.channelLabel,
    prefixes: r.prefix ? [r.prefix] : undefined,
    hashtags: r.hashtags.filter((t) => !AUTO_TAGS.has(t.toLowerCase())).map((value) => ({ value, on: true })),
    mentions: r.mentions.map((value) => ({ value, on: true })),
    status: posted ? "posted" : REJECTED[r.id] ? "rejected" : "new",
    heldBy: HELD[r.id],
    postedAt: posted ? at(receivedMs + 3 * 60_000) : undefined,
    postedText: posted ? r.postedCaption : undefined,
    rejectedReason: REJECTED[r.id],
  };
}

/** The demo clips, newest first, with received times relative to `now` so the list reads "just now", "9 min ago"… */
export function xVideoClips(now = Date.now()): XvClip[] {
  const latest = REAL.reduce((m, r) => (r.postedIst > m ? r.postedIst : m), "");
  const seen = new Map<string, number>();
  const byTime = [...REAL].sort((a, b) => a.postedIst.localeCompare(b.postedIst));
  return byTime.map((r, i) => toClip(r, latest, now, shareNameFor(r, i, POSTED.has(r.id), seen))).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

/** Clips posted today before the demo's own (the "Posted today" card adds the desk's posts to this) */
export const XV_POSTED_EARLIER = 13;

/** "#SMSHospital" → "SMS Hospital", "@jaipur_police" → "jaipur police" */
const tagName = (tag: string) =>
  tag
    .slice(1)
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();

// Hindi names for the common tags, so a search in Hindi finds them
const HINDI: Record<string, string> = {
  jaipur: "जयपुर", jodhpur: "जोधपुर", ajmer: "अजमेर", alwar: "अलवर", kota: "कोटा", tonk: "टोंक", jhunjhunu: "झुंझुनूं",
  jhalawar: "झालावाड़", ashokgehlot: "अशोक गहलोत", ashokgehlot51: "अशोक गहलोत", pmmodi: "नरेंद्र मोदी", narendramodi: "नरेंद्र मोदी",
  nitishkumar: "नीतीश कुमार", smshospital: "एसएमएस अस्पताल", rahulgandhi: "राहुल गांधी", ombirla: "ओम बिरला", ombirlakota: "ओम बिरला",
  isro: "इसरो", sonunigam: "सोनू निगम", jaipur_police: "जयपुर पुलिस",
};

/** The demo's hashtag and handle directory, searched by "Add hashtag" / "Add handle" (the live desk's GET /handles) */
export const XV_TAG_DIRECTORY: { value: string; name: string; nameHi: string | null }[] = (() => {
  const seen = new Set<string>();
  const out: { value: string; name: string; nameHi: string | null }[] = [];
  for (const r of REAL) {
    for (const value of [...r.hashtags, ...r.mentions]) {
      const k = value.toLowerCase();
      if (AUTO_TAGS.has(k) || seen.has(k)) continue;
      seen.add(k);
      out.push({ value, name: tagName(value), nameHi: HINDI[k.slice(1)] ?? null });
    }
  }
  return out;
})();
