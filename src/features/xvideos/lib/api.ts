// The X Videos desk's data from the backend (/xvideos routes, backend branch xvideos): the clips found on the video
// share and one clip with what was read from it. Used only when NEXT_PUBLIC_XVIDEOS_SOURCE=api; the demo data
// (src/data/xVideosData.ts) stays the default.

import type { XvClip, XvSavedDraft } from "../data/xVideosData";
import { api } from "../../../lib/socia/client";
import { toXvClip, xvClipsPath, xvRescanPath, type XvWireClip } from "./wire";
import { isDay, toXvFolders, type XvFolders } from "./folders";

export { toXvClip, type XvWireClip };

/** One day folder's clips; `day` null asks for today's (IST), and the answer says which day that is */
export async function fetchXvClips(day: string | null, signal?: AbortSignal): Promise<{ day: string | null; clips: XvClip[] }> {
  const res = await api<{ day?: string; clips: XvWireClip[] }>("GET", xvClipsPath(day), undefined, { signal });
  return { day: isDay(res.day) ? res.day : day, clips: res.clips.map((c) => toXvClip(c)) };
}

/** Asks the backend to walk a day folder of the share now (Refresh); no day walks today's */
export async function rescanXvDay(day: string | null, signal?: AbortSignal): Promise<void> {
  await api<{ day: string; requested: boolean }>("POST", xvRescanPath(day), undefined, { signal });
}

/** The day folders by month, newest first, with today always listed */
export async function fetchXvFolders(signal?: AbortSignal): Promise<XvFolders> {
  return toXvFolders(await api<unknown>("GET", "/xvideos/folders", undefined, { signal }));
}

/** The desk's actions (step 6): each answers with the clip as the backend now has it */
const act = async (method: string, id: string, path: string, body?: unknown): Promise<XvClip> => {
  const { clip } = await api<{ clip: XvWireClip }>(method, `/xvideos/clips/${encodeURIComponent(id)}/${path}`, body);
  return toXvClip(clip);
};

/** The editor's draft as the desk keeps it; null goes back to the suggestion */
export const saveXvDraft = (id: string, draft: XvSavedDraft | null) => (draft ? act("PUT", id, "draft", { draft }) : act("DELETE", id, "draft"));
export const holdXvClip = (id: string, held: boolean) => act("POST", id, "hold", { held });
export const postXvClip = (id: string, post: { text: string; title: string; hashtags: string[]; mentions: string[] }) => act("POST", id, "posted", post);
export const undoXvPost = (id: string, postId: number) => act("POST", id, "undo", { postId });
export const rejectXvClip = (id: string, reason: string) => act("POST", id, "reject", { reason });
export const restoreXvClip = (id: string) => act("POST", id, "restore");

export async function fetchXvClip(id: string, signal?: AbortSignal): Promise<XvClip> {
  const { clip } = await api<{ clip: XvWireClip }>("GET", `/xvideos/clips/${encodeURIComponent(id)}`, undefined, { signal });
  return toXvClip(clip);
}
