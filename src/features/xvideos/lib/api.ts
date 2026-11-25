// The X Videos desk's data from the backend (/xvideos routes, backend branch xvideos): the clips found on the video
// share and one clip with what was read from it. Used only when NEXT_PUBLIC_XVIDEOS_SOURCE=api; the demo data
// (src/data/xVideosData.ts) stays the default.

import type { XvClip } from "../data/xVideosData";
import { api } from "../../../lib/socia/client";
import { toXvClip, type XvWireClip } from "./wire";

export { toXvClip, type XvWireClip };

export async function fetchXvClips(signal?: AbortSignal): Promise<XvClip[]> {
  const { clips } = await api<{ clips: XvWireClip[] }>("GET", "/xvideos/clips", undefined, { signal });
  return clips.map((c) => toXvClip(c));
}

export async function fetchXvClip(id: string, signal?: AbortSignal): Promise<XvClip> {
  const { clip } = await api<{ clip: XvWireClip }>("GET", `/xvideos/clips/${encodeURIComponent(id)}`, undefined, { signal });
  return toXvClip(clip);
}
