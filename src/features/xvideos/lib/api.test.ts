// The X Videos desk's live data: the backend's clip → the desk's clip, and the list merge that keeps the tab's own choices.
// Run: node --import ./src/components/Newsroom/BreakingDesk/video/timeline/__checks__/resolve-ts.mjs --test src/features/xvideos/lib/api.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { toXvClip, type XvWireClip } from "./wire";
import { deskReducer, syncClips } from "../components/deskState";

const wire = (over: Partial<XvWireClip> = {}): XvWireClip => ({
  id: "c1",
  fileName: "x...done......Kota News.mp4",
  shareName: "x...done......Kota News.mp4",
  title: "Kota News",
  src: "/xvideos/clips/c1/video",
  poster: "/xvideos/clips/c1/poster",
  folder: ["24-11-2026", "Convert 3 pm to"],
  receivedAt: "2026-11-24T10:00:00.000Z",
  duration: 93,
  size: 1000,
  kind: "clip",
  district: "",
  suggestedHeadline: null,
  transcript: [],
  screenText: [],
  frames: [{ where: "first", at: 0, src: "/xvideos/clips/c1/frames/f_0001.jpg", text: "" }],
  heard: [],
  channelLabel: null,
  hashtags: [],
  mentions: [],
  status: "posted",
  ...over,
});

test("media links point at the API; a clip done on the share shows as posted", () => {
  const c = toXvClip(wire(), "http://api:8210");
  assert.equal(c.src, "http://api:8210/xvideos/clips/c1/video");
  assert.equal(c.poster, "http://api:8210/xvideos/clips/c1/poster");
  assert.equal(c.frames?.[0]?.src, "http://api:8210/xvideos/clips/c1/frames/f_0001.jpg");
  assert.equal(c.status, "posted");
  assert.equal(c.postedAt, "2026-11-24T10:00:00.000Z");
  assert.equal(c.topic, "Kota News");
});

test("a clip still being read keeps its progress; a failed one says why", () => {
  assert.equal(toXvClip(wire({ status: "new", readingProgress: 20 })).readingProgress, 20);
  assert.equal(toXvClip(wire({ status: "new", error: "probe: no video stream" })).loadError, "probe: no video stream");
});

test("the list merge keeps a reject made in this tab and a transcript already fetched", () => {
  const had = [{ ...toXvClip(wire({ status: "new" })), status: "rejected" as const, rejectedReason: "duplicate", transcript: [{ at: 0, text: "नमस्कार" }] }];
  const [merged] = syncClips(had, [toXvClip(wire({ status: "new" }))]);
  assert.equal(merged?.status, "rejected");
  assert.equal(merged?.rejectedReason, "duplicate");
  assert.deepEqual(merged?.transcript, [{ at: 0, text: "नमस्कार" }]);
});

test("the list merge takes new clips and drops ones the backend no longer lists", () => {
  const out = syncClips([toXvClip(wire({ id: "old" }))], [toXvClip(wire({ id: "c2" }))]);
  assert.deepEqual(out.map((c) => c.id), ["c2"]);
});

test("a clip's detail adds its transcript but never rolls back a newer list's status", () => {
  const listed = { ...toXvClip(wire({ status: "new" })), readingProgress: undefined };
  const slowDetail = { ...toXvClip(wire({ status: "new", readingProgress: 20 })), transcript: [{ at: 1, text: "जयपुर" }] };
  const out = deskReducer({ clips: [listed], drafts: {}, undo: [] }, { type: "clip/detail", clip: slowDetail });
  assert.equal(out.clips[0]?.readingProgress, undefined);
  assert.deepEqual(out.clips[0]?.transcript, [{ at: 1, text: "जयपुर" }]);
});
