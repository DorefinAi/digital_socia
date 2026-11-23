// The X Videos desk's client state (demo only, nothing is sent): the clips, each clip's draft as the desk edits it,
// and the posts that can still be undone. One reducer, so the list and the editor always agree.

import type { XvClip } from "@/data/xVideosData";
import { STANDARD_PREFIXES, brandTagFor, buildTitle, labelOf } from "./xvTitle";

/** Where line 1 of the tweet came from, for the source chip */
export type TitleSource = { kind: "suggested" } | { kind: "said"; at: number } | { kind: "screen"; at: number } | { kind: "typed" };

export interface TagRow {
  value: string;
  on: boolean;
  /** Added by the desk in the editor (not suggested from the clip) */
  added?: boolean;
}

export interface XvDraft {
  title: string;
  source: TitleSource;
  /** The brand tag (#RajasthanWithFirstIndia / #FirstIndiaNews, set by the channel label) is ticked */
  brandOn: boolean;
  hashtags: TagRow[];
  mentions: TagRow[];
  trim: { start: number; end: number };
  savedAt?: string;
  scheduledAt?: string;
}

/** Undo window after Copy & Mark Posted, as on the X desk */
export const UNDO_MS = 5 * 60_000;

export interface UndoEntry {
  clipId: string;
  title: string;
  until: number;
}

export interface DeskState {
  clips: XvClip[];
  drafts: Record<string, XvDraft>;
  undo: UndoEntry[];
}

export type DeskAction =
  | { type: "draft/patch"; id: string; patch: Partial<XvDraft> }
  | { type: "clip/post"; id: string; text: string; at: number }
  | { type: "clip/undo"; id: string }
  | { type: "undo/expire"; now: number }
  | { type: "clip/reject"; id: string; reason: string }
  | { type: "clip/restore"; id: string };

/** The "Start with" choices for a clip: the standard ones, then its own */
export const prefixesFor = (clip: XvClip): string[] => [...STANDARD_PREFIXES, ...(clip.prefixes ?? [])];

/** The draft an untouched clip opens with: its headline (or the suggestion) with its channel label, the whole clip */
export function initialDraft(clip: XvClip): XvDraft {
  const headline = clip.headline ?? clip.suggestedHeadline ?? "";
  return {
    title: headline ? buildTitle(headline, clip.channelLabel) : "",
    source: { kind: "suggested" },
    brandOn: true,
    hashtags: clip.hashtags.map((t) => ({ value: t.value, on: t.on })),
    mentions: clip.mentions.map((t) => ({ value: t.value, on: t.on })),
    trim: { start: 0, end: clip.duration },
  };
}

export const draftOf = (state: DeskState, clip: XvClip): XvDraft => state.drafts[clip.id] ?? initialDraft(clip);

/** The brand tag for the draft: from its title's label and where the clip's story is from, or null */
export const draftBrand = (d: XvDraft, clip: Pick<XvClip, "region">) => brandTagFor(labelOf(d.title), clip.region ?? null);

export function deskReducer(state: DeskState, action: DeskAction): DeskState {
  switch (action.type) {
    case "draft/patch": {
      const clip = state.clips.find((c) => c.id === action.id);
      if (!clip) return state;
      return { ...state, drafts: { ...state.drafts, [action.id]: { ...draftOf(state, clip), ...action.patch } } };
    }
    case "clip/post": {
      const clip = state.clips.find((c) => c.id === action.id);
      if (!clip || clip.status === "posted") return state;
      const title = draftOf(state, clip).title;
      return {
        ...state,
        clips: state.clips.map((c) => (c.id === action.id ? { ...c, status: "posted", postedAt: new Date(action.at).toISOString(), postedText: action.text } : c)),
        undo: [...state.undo.filter((u) => u.clipId !== action.id), { clipId: action.id, title, until: action.at + UNDO_MS }],
      };
    }
    case "clip/undo":
      return {
        ...state,
        clips: state.clips.map((c) => (c.id === action.id && c.status === "posted" ? { ...c, status: "new", postedAt: undefined, postedText: undefined } : c)),
        undo: state.undo.filter((u) => u.clipId !== action.id),
      };
    case "undo/expire": {
      const undo = state.undo.filter((u) => u.until > action.now);
      return undo.length === state.undo.length ? state : { ...state, undo };
    }
    case "clip/reject":
      return { ...state, clips: state.clips.map((c) => (c.id === action.id ? { ...c, status: "rejected", rejectedReason: action.reason } : c)) };
    case "clip/restore":
      return { ...state, clips: state.clips.map((c) => (c.id === action.id ? { ...c, status: "new", rejectedReason: undefined } : c)) };
  }
}
