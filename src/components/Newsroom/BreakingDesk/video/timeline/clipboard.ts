// Copy / cut / paste of timeline clips. The clipboard is kept in this module (shared by every studio on the page),
// so it survives switching drafts within the session; pasting into another project brings the assets along.

import type { Asset } from "../model";
import { selectedClips, type ClipboardItem, type StudioState, type StudioStore } from "../store";
import { findClip } from "./ops";

interface ClipboardData {
  items: ClipboardItem[];
  assets: Asset[];
}

let clipboard: ClipboardData | null = null;

export function hasClipboard(): boolean {
  return !!clipboard?.items.length;
}

/** The selected clips (on any track), with offsets from the earliest one */
export function copyFrom(state: StudioState): boolean {
  const clips = selectedClips(state);
  if (!clips.length) return false;
  const first = Math.min(...clips.map((c) => c.start));
  const items: ClipboardItem[] = [];
  const assetIds = new Set<string>();
  for (const c of clips) {
    const ref = findClip(state.project, c.id);
    if (!ref) continue;
    items.push({ clip: structuredClone(c), trackKind: ref.track.kind, offset: c.start - first });
    if (c.type === "media" || c.type === "audio") assetIds.add(c.assetId);
  }
  clipboard = { items, assets: state.project.assets.filter((a) => assetIds.has(a.id)) };
  return true;
}

export function copySelection(store: StudioStore): boolean {
  return copyFrom(store.getState());
}

export function cutSelection(store: StudioStore): boolean {
  if (!copyFrom(store.getState())) return false;
  store.dispatch({ type: "clip/delete" });
  return true;
}

/** Paste at `at` (default: playhead) on `trackId` (default: the focused track if it fits) */
export function pasteClipboard(store: StudioStore, at?: number, trackId?: string): boolean {
  if (!clipboard?.items.length) return false;
  store.dispatch({ type: "clip/paste", items: clipboard.items, assets: clipboard.assets, at: at ?? store.getState().playhead, trackId });
  return true;
}
