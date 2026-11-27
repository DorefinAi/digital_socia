// The X Videos desk's client state: the clips, each clip's draft as the desk edits it, and the posts that can still be
// undone. One reducer, so the list and the editor always agree. Live, XVideosDesk sends each action to the backend and
// its answer comes back as "clip/server"; in the demo nothing is sent.

import type { XvClip, XvSavedDraft } from "../data/xVideosData";
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
  /** The shown day folder's clips, and only those */
  clips: XvClip[];
  /** The day folder `clips` are from ("2026-11-27"); null until the first list says */
  day: string | null;
  /** Other days' clips as this tab last had them, so a post or reject made here survives a look at another day */
  parked: Record<string, XvClip[]>;
  drafts: Record<string, XvDraft>;
  undo: UndoEntry[];
  /**
   * Live: per clip, when the desk last sent it an action and whether the answer is still to come. A list asked for
   * before that (or while it is pending) does not overwrite the clip's desk state, so a poll already on its way never
   * undoes a post, undo, reject or restore made meanwhile.
   */
  acted?: Record<string, { at: number; pending: boolean }>;
}

/** The fields the desk's own actions set; the backend's answer (or a list newer than the last action) replaces them */
const DESK_FIELDS = ["status", "postedAt", "postedText", "postId", "postedBy", "rejectedReason", "heldBy", "savedDraft"] as const;
const deskFields = (c: XvClip) => Object.fromEntries(DESK_FIELDS.map((k) => [k, c[k]])) as Pick<XvClip, (typeof DESK_FIELDS)[number]>;

export type DeskAction =
  | { type: "draft/patch"; id: string; patch: Partial<XvDraft> }
  | { type: "clip/post"; id: string; text: string; at: number }
  | { type: "clip/undo"; id: string }
  | { type: "undo/expire"; now: number }
  | { type: "clip/reject"; id: string; reason: string }
  | { type: "clip/restore"; id: string }
  /**
   * The backend's list for day folder `day` (another day than the shown one switches to it first); `requestedAt`: when
   * that list was asked for (live), so an answer older than the desk's last action on a clip leaves that clip alone
   */
  | { type: "clips/sync"; day: string | null; clips: XvClip[]; requestedAt?: number }
  /** Live: an action on this clip went to the backend */
  | { type: "clip/sending"; id: string; at: number }
  /** Live: the backend refused or could not be reached; the next list shows what stands */
  | { type: "clip/failed"; id: string }
  /** The desk picked another day: show what this tab had for it (if anything) until its list comes */
  | { type: "day/switch"; day: string }
  | { type: "clip/detail"; clip: XvClip }
  /** The backend's answer to an action: its decision, hold and saved draft replace the desk's guess */
  | { type: "clip/server"; clip: XvClip };

/** The "Start with" choices for a clip: the standard ones, then its own */
export const prefixesFor = (clip: XvClip): string[] => [...STANDARD_PREFIXES, ...(clip.prefixes ?? [])];

/** The draft an untouched clip opens with: its headline (or the suggestion) with its channel label, the whole clip */
export function initialDraft(clip: XvClip): XvDraft {
  // A draft an editor saved (live data) opens as it was left
  if (clip.savedDraft) return { ...clip.savedDraft, source: (clip.savedDraft.source as TitleSource | undefined) ?? { kind: "suggested" } };
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
    case "day/switch":
      return switchDay(state, action.day);
    case "clips/sync": {
      const base = action.day ? switchDay(state, action.day) : state;
      const clips = syncClips(base.clips, action.clips, base.acted, action.requestedAt);
      // A post the list says no longer stands leaves the undo bar
      const posted = new Set(clips.filter((c) => c.status === "posted").map((c) => c.id));
      const undo = base.undo.filter((u) => posted.has(u.clipId) || !clips.some((c) => c.id === u.clipId));
      return { ...base, clips, undo: undo.length === base.undo.length ? base.undo : undo };
    }
    case "clip/sending":
      return { ...state, acted: { ...state.acted, [action.id]: { at: action.at, pending: true } } };
    case "clip/failed": {
      const a = state.acted?.[action.id];
      return a ? { ...state, acted: { ...state.acted, [action.id]: { ...a, pending: false, at: 0 } } } : state;
    }
    case "clip/server": {
      const s = action.clip;
      const a = state.acted?.[s.id];
      return {
        ...state,
        clips: state.clips.map((c) => (c.id === s.id ? { ...c, ...deskFields(s) } : c)),
        acted: a ? { ...state.acted, [s.id]: { ...a, pending: false } } : state.acted,
        // A post the backend no longer has standing leaves the undo bar
        undo: s.status === "posted" ? state.undo : state.undo.filter((u) => u.clipId !== s.id),
      };
    }
    case "clip/detail":
      // Only what the list leaves out: a slow answer must not undo a newer list's status or progress
      return {
        ...state,
        clips: state.clips.map((c) =>
          c.id === action.clip.id
            ? { ...c, transcript: action.clip.transcript.length ? action.clip.transcript : c.transcript, frames: action.clip.frames ?? c.frames, contactSheet: action.clip.contactSheet ?? c.contactSheet, cutTimes: action.clip.cutTimes ?? c.cutTimes }
            : c,
        ),
      };
  }
}

/**
 * Shows day folder `day`: the shown day's clips are parked and the new day's parked clips (or none) come back, so no
 * clip of one day is ever listed under another. The undo bar keeps only the new day's posts.
 */
export function switchDay(state: DeskState, day: string): DeskState {
  if (state.day === day) return state;
  // The first list of the session (state.day still null) takes over the demo's or the empty start list as is
  if (state.day === null) return { ...state, day };
  const { [day]: back = [], ...rest } = state.parked;
  const ids = new Set(back.map((c) => c.id));
  return { ...state, day, clips: back, parked: { ...rest, [state.day]: state.clips }, undo: state.undo.filter((u) => ids.has(u.clipId)) };
}

/**
 * The list the backend sent, with what this tab did meanwhile kept: a clip whose action is still on its way, or that
 * the desk acted on after this list was asked for, keeps its desk state (status, post, reject, hold, draft); everything
 * else is the backend's. A transcript already fetched for the editor is not dropped by the list, which leaves
 * transcripts out. Without `requestedAt` (an old caller) only pending actions are kept.
 */
export function syncClips(current: readonly XvClip[], incoming: readonly XvClip[], acted: DeskState["acted"] = {}, requestedAt?: number): XvClip[] {
  const byId = new Map(current.map((c) => [c.id, c]));
  return incoming.map((next) => {
    const had = byId.get(next.id);
    if (!had) return next;
    const a = acted[next.id];
    const keep = a && (a.pending || (requestedAt !== undefined && a.at >= requestedAt));
    const merged = keep ? { ...next, ...deskFields(had) } : next;
    return next.transcript.length || !had.transcript.length ? merged : { ...merged, transcript: had.transcript };
  });
}

/** The tags and handles of a draft that go in the post (ticked), as the backend records them */
export function postedParts(draft: Pick<XvDraft, "hashtags" | "mentions">): { hashtags: string[]; mentions: string[] } {
  return { hashtags: draft.hashtags.filter((t) => t.on).map((t) => t.value), mentions: draft.mentions.filter((t) => t.on).map((t) => t.value) };
}

/** A draft as the backend keeps it: only the fields it accepts */
export function savedDraftOf(d: XvDraft): XvSavedDraft {
  const part = (t: { value: string; on: boolean; added?: boolean }) => ({ value: t.value, on: t.on, ...(t.added ? { added: true } : {}) });
  return {
    title: d.title,
    source: d.source.kind === "said" || d.source.kind === "screen" ? { kind: d.source.kind, at: d.source.at } : { kind: d.source.kind },
    brandOn: d.brandOn,
    hashtags: d.hashtags.map(part),
    mentions: d.mentions.map(part),
    trim: { start: Math.max(0, d.trim.start), end: Math.max(d.trim.start, d.trim.end) },
    ...(d.savedAt ? { savedAt: d.savedAt } : {}),
    ...(d.scheduledAt ? { scheduledAt: d.scheduledAt } : {}),
  };
}
