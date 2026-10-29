// Self-check for the studio reducer and timeline ops (the repo has no test runner).
// Run from the repo root:
//   node --import ./src/components/Newsroom/BreakingDesk/video/timeline/__checks__/resolve-ts.mjs src/components/Newsroom/BreakingDesk/video/timeline/__checks__/store.check.ts

import assert from "node:assert/strict";
import { emptyProject, projectDuration, type Asset, type Clip, type MediaClip, type Project } from "../../model";
import { initStudio, studioReducer, type StudioAction, type StudioState } from "../../store";
import { freeStart, makeCaptionClip, makeTextClip, normalizeClips } from "../ops";
import { snapSpan, snapTime } from "../snap";
import { KEYMAP, bindingForKey, eventKey, keyLabel } from "../../keymap";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

const VID: Asset = { id: "a-vid", kind: "video", url: "blob:v", name: "v.mp4", duration: 10, hasAudio: true };
const VID2: Asset = { id: "a-vid2", kind: "video", url: "blob:w", name: "w.mp4", duration: 6 };
const IMG: Asset = { id: "a-img", kind: "image", url: "blob:i", name: "i.png", duration: 0 };
const MUS: Asset = { id: "a-mus", kind: "audio", url: "blob:m", name: "m.mp3", duration: 30 };

function base(): StudioState {
  const p: Project = emptyProject("16:9");
  // Stable track ids for the checks
  p.tracks = p.tracks.map((t, i) => ({ ...t, id: ["v", "o", "t", "c", "a", "m"][i] }));
  return initStudio(p);
}
const run = (s: StudioState, ...actions: StudioAction[]) => actions.reduce(studioReducer, s);
const track = (s: StudioState, id: string) => s.project.tracks.find((t) => t.id === id)!;
const clips = (s: StudioState, id: string) => track(s, id).clips;
const span = (c: Clip) => [c.start, c.start + c.duration];

function withTwoClips(): StudioState {
  return run(base(), { type: "assets/add", assets: [VID, VID2, IMG, MUS] }, { type: "clip/addFromAsset", assetId: "a-vid" }, { type: "clip/addFromAsset", assetId: "a-vid2" });
}

check("add asset -> clip appends on the video track", () => {
  const s = withTwoClips();
  const v = clips(s, "v");
  assert.equal(v.length, 2);
  assert.deepEqual(span(v[0]), [0, 10]);
  assert.deepEqual(span(v[1]), [10, 16]);
  assert.equal(s.selection.length, 1);
  assert.equal(s.selection[0], v[1].id);
  assert.equal(projectDuration(s.project), 16);
});

check("music goes to the first audio track, image defaults to 5 s", () => {
  let s = run(withTwoClips(), { type: "clip/addFromAsset", assetId: "a-mus" }, { type: "clip/addFromAsset", assetId: "a-img", trackId: "o", start: 2 });
  assert.equal(clips(s, "a")[0].duration, 30);
  assert.deepEqual(span(clips(s, "o")[0]), [2, 7]);
  // Incompatible track is refused
  const before = s;
  s = run(s, { type: "clip/addFromAsset", assetId: "a-mus", trackId: "v" });
  assert.equal(s, before);
});

check("undo/redo restore snapshots; new edits clear redo", () => {
  let s = withTwoClips();
  s = run(s, { type: "history/undo" });
  assert.equal(clips(s, "v").length, 1);
  s = run(s, { type: "history/redo" });
  assert.equal(clips(s, "v").length, 2);
  s = run(s, { type: "history/undo" }, { type: "track/rename", trackId: "v", name: "Main" });
  assert.equal(s.future.length, 0);
  assert.equal(track(s, "v").name, "Main");
});

check("drag edits with a group are one undo step", () => {
  let s = withTwoClips();
  const id = clips(s, "v")[1].id;
  const pastBefore = s.past.length;
  for (const x of [20, 22, 25]) s = run(s, { type: "clip/move", clipId: id, trackId: "v", start: x, group: "drag-1" });
  s = run(s, { type: "history/endGroup" });
  assert.equal(s.past.length, pastBefore + 1);
  assert.equal(clips(s, "v")[1].start, 25);
  s = run(s, { type: "history/undo" });
  assert.equal(clips(s, "v")[1].start, 10);
  // A no-op edit does not create history
  const again = run(s, { type: "clip/move", clipId: id, trackId: "v", start: 10 });
  assert.equal(again, s);
});

check("move onto another clip lands at the nearest free spot", () => {
  let s = withTwoClips();
  const id = clips(s, "v")[1].id; // 6 s long
  s = run(s, { type: "clip/move", clipId: id, trackId: "v", start: 3 });
  // 0..10 occupied by the first clip, so it lands at 10 (the nearer side)
  assert.equal(clips(s, "v")[1].start, 10);
  s = run(s, { type: "clip/move", clipId: clips(s, "v")[0].id, trackId: "v", start: 20 });
  assert.deepEqual(clips(s, "v").map((c) => c.start), [10, 20]);
});

check("move between compatible tracks only; locked tracks refuse", () => {
  let s = withTwoClips();
  const id = clips(s, "v")[1].id;
  s = run(s, { type: "clip/move", clipId: id, trackId: "o", start: 1 });
  assert.equal(clips(s, "o")[0].id, id);
  assert.equal(clips(s, "v").length, 1);
  const before = run(s, { type: "clip/move", clipId: id, trackId: "a", start: 1 });
  assert.equal(before, s);
  s = run(s, { type: "track/set", trackId: "o", patch: { locked: true } });
  const locked = run(s, { type: "clip/move", clipId: id, trackId: "v", start: 30 });
  assert.equal(locked, s);
});

check("trim start moves the in-point; limited by source and neighbours", () => {
  let s = withTwoClips();
  const [a, b] = clips(s, "v");
  s = run(s, { type: "clip/trim", clipId: b.id, edge: "start", time: 12 });
  let nb = clips(s, "v")[1] as MediaClip;
  assert.deepEqual(span(nb), [12, 16]);
  assert.equal(nb.in, 2);
  // Pull it back past its source start: stops at in = 0
  s = run(s, { type: "clip/trim", clipId: b.id, edge: "start", time: 5 });
  nb = clips(s, "v")[1] as MediaClip;
  assert.equal(nb.start, 10);
  assert.equal(nb.in, 0);
  // Extend first clip's end: limited by source duration (10 s)
  s = run(s, { type: "clip/trim", clipId: a.id, edge: "end", time: 8 });
  s = run(s, { type: "clip/trim", clipId: a.id, edge: "end", time: 50 });
  assert.equal(clips(s, "v")[0].duration, 10);
  // Minimum length
  s = run(s, { type: "clip/trim", clipId: a.id, edge: "end", time: -5 });
  assert.equal(clips(s, "v")[0].duration, 0.1);
});

check("split at playhead keeps source continuity", () => {
  let s = withTwoClips();
  s = run(s, { type: "select", clipIds: [] }, { type: "seek", time: 4 }, { type: "clip/split" });
  const v = clips(s, "v") as MediaClip[];
  assert.equal(v.length, 3);
  assert.deepEqual(span(v[0]), [0, 4]);
  assert.deepEqual(span(v[1]), [4, 10]);
  assert.equal(v[1].in, 4);
  assert.notEqual(v[1].id, v[0].id);
  // Split near an edge is refused
  const edge = run(s, { type: "seek", time: 4.05 }, { type: "clip/split" });
  assert.equal(clips(edge, "v").length, 3);
});

check("split with a selection splits only the selection and selects the tail", () => {
  let s = run(withTwoClips(), { type: "clip/addFromAsset", assetId: "a-mus" });
  const music = clips(s, "a")[0].id;
  s = run(s, { type: "select", clipIds: [music] }, { type: "seek", time: 5 }, { type: "clip/split" });
  assert.equal(clips(s, "a").length, 2);
  assert.equal(clips(s, "v").length, 2);
  assert.deepEqual(s.selection, [clips(s, "a")[1].id]);
});

check("delete and ripple delete", () => {
  let s = run(withTwoClips(), { type: "clip/addFromAsset", assetId: "a-vid2" });
  const v = clips(s, "v");
  assert.deepEqual(v.map((c) => c.start), [0, 10, 16]);
  const plain = run(s, { type: "clip/delete", clipIds: [v[1].id] });
  assert.deepEqual(clips(plain, "v").map((c) => c.start), [0, 16]);
  s = run(s, { type: "clip/delete", clipIds: [v[1].id], ripple: true });
  assert.deepEqual(clips(s, "v").map((c) => c.start), [0, 10]);
  // Delete with nothing selected and no ids is a no-op
  const none = run(s, { type: "select", clipIds: [] });
  assert.equal(run(none, { type: "clip/delete" }), none);
});

check("duplicate places the copy after the original and selects it", () => {
  let s = withTwoClips();
  const first = clips(s, "v")[0].id;
  s = run(s, { type: "clip/duplicate", clipIds: [first] });
  const v = clips(s, "v");
  assert.equal(v.length, 3);
  // 10..16 is taken, so the 10 s copy goes after the second clip
  assert.deepEqual(span(v[2]), [16, 26]);
  assert.deepEqual(s.selection, [v[2].id]);
  assert.equal((v[2] as MediaClip).assetId, "a-vid");
});

check("transition overlaps the previous clip and slides later clips", () => {
  let s = run(withTwoClips(), { type: "clip/addFromAsset", assetId: "a-vid2" });
  const [, b, c] = clips(s, "v");
  s = run(s, { type: "clip/setTransition", clipId: b.id, transition: { type: "crossfade", duration: 1 } });
  let v = clips(s, "v");
  assert.equal(v[1].start, 9);
  assert.deepEqual(v[1].transitionIn, { type: "crossfade", duration: 1 });
  assert.equal(v[2].start, 15);
  // Longer transition
  s = run(s, { type: "clip/setTransition", clipId: b.id, transition: { type: "wipe", duration: 2 } });
  v = clips(s, "v");
  assert.equal(v[1].start, 8);
  assert.equal(v[2].start, 14);
  // Trim the outgoing clip's end shorter -> transition shrinks with the overlap
  s = run(s, { type: "clip/trim", clipId: v[0].id, edge: "end", time: 9.5 });
  assert.equal(clips(s, "v")[1].transitionIn?.duration, 1.5);
  // Remove -> slides back to touching
  s = run(s, { type: "clip/setTransition", clipId: b.id, transition: null });
  v = clips(s, "v");
  assert.equal(v[1].transitionIn, undefined);
  assert.equal(v[1].start, 9.5);
  assert.equal(v[2].start, 15.5);
  // A clip after a gap cannot get a transition
  s = run(s, { type: "clip/move", clipId: c.id, trackId: "v", start: 30 });
  assert.equal(run(s, { type: "clip/setTransition", clipId: c.id, transition: { type: "crossfade", duration: 1 } }), s);
});

check("moving a clip away drops its transition", () => {
  let s = withTwoClips();
  const b = clips(s, "v")[1].id;
  s = run(s, { type: "clip/setTransition", clipId: b, transition: { type: "crossfade", duration: 1 } });
  s = run(s, { type: "clip/move", clipId: b, trackId: "v", start: 40 });
  assert.equal(clips(s, "v")[1].transitionIn, undefined);
});

check("speed change rescales duration; fades are clamped", () => {
  let s = withTwoClips();
  const b = clips(s, "v")[1].id;
  s = run(s, { type: "clip/update", clipId: b, patch: { speed: 2 } as Partial<Clip> });
  assert.equal(clips(s, "v")[1].duration, 3);
  s = run(s, { type: "clip/update", clipId: b, patch: { fadeIn: 99 } });
  assert.equal(clips(s, "v")[1].fadeIn, 3);
  // Slowing the first clip down is capped by the next clip
  const a = clips(s, "v")[0].id;
  s = run(s, { type: "clip/update", clipId: a, patch: { speed: 0.5 } as Partial<Clip> });
  assert.equal(clips(s, "v")[0].duration, 10);
});

check("tracks: add, rename, flags, move, remove", () => {
  let s = base();
  s = run(s, { type: "track/add", kind: "overlay" });
  const ids = s.project.tracks.map((t) => t.kind);
  assert.deepEqual(ids, ["video", "overlay", "overlay", "text", "caption", "audio", "audio"]);
  const added = s.selectedTrackId!;
  s = run(s, { type: "track/rename", trackId: added, name: "  Logo " }, { type: "track/set", trackId: added, patch: { muted: true, hidden: true } });
  assert.equal(track(s, added).name, "Logo");
  assert.equal(track(s, added).hidden, true);
  assert.equal(run(s, { type: "track/rename", trackId: added, name: "   " }), s);
  s = run(s, { type: "track/move", trackId: added, index: 0 });
  assert.equal(s.project.tracks[0].id, added);
  s = run(s, { type: "track/remove", trackId: added });
  assert.equal(s.project.tracks.length, 6);
  assert.equal(s.selectedTrackId, null);
});

check("text and caption clips go to their own tracks", () => {
  let s = base();
  s = run(s, { type: "clip/add", clip: makeTextClip("tx1", "नमस्ते", 1) }, { type: "clip/add", clip: makeCaptionClip("cp1", "Hello", 0) });
  assert.equal(clips(s, "t")[0].id, "tx1");
  assert.equal(clips(s, "c")[0].id, "cp1");
  assert.deepEqual(s.selection, ["cp1"]);
});

check("clip/add by kind uses a track with room, else adds one", () => {
  let s = base();
  s = run(s, { type: "clip/add", kind: "text", clip: makeTextClip("t1", "a", 0, 5) });
  s = run(s, { type: "clip/add", kind: "text", clip: makeTextClip("t2", "b", 2, 5) });
  const texts = s.project.tracks.filter((t) => t.kind === "text");
  assert.equal(texts.length, 2);
  assert.equal(texts[1].name, "Text 2");
  assert.equal(texts[1].clips[0].id, "t2");
  assert.equal(texts[1].clips[0].start, 2);
  s = run(s, { type: "history/undo" });
  assert.equal(s.project.tracks.filter((t) => t.kind === "text").length, 1);
});

check("captions/replace, project/set caption style merge, project/edit", () => {
  let s = run(base(), { type: "captions/replace", clips: [makeCaptionClip("c2", "two", 3), makeCaptionClip("c1", "one", 0)] });
  assert.deepEqual(clips(s, "c").map((c) => c.id), ["c1", "c2"]);
  s = run(s, { type: "project/set", patch: { captionStyle: { size: 40 } } });
  assert.equal(s.project.captionStyle.size, 40);
  assert.equal(s.project.captionStyle.bottom, 0.08);
  assert.equal(run(s, { type: "project/set", patch: { captionStyle: { size: 40 } } }), s);
  s = run(s, { type: "project/edit", edit: (p) => ({ ...p, background: "#111111" }) });
  assert.equal(s.project.background, "#111111");
  s = run(s, { type: "history/undo" });
  assert.equal(s.project.background, "#000000");
});

check("detach audio is one undoable step and selects the new audio clip", () => {
  let s = withTwoClips();
  const a = clips(s, "v")[0].id;
  s = run(s, { type: "clip/detachAudio", clipId: a });
  assert.equal((clips(s, "v")[0] as MediaClip).audioDetached, true);
  const audio = s.project.tracks.filter((t) => t.kind === "audio").flatMap((t) => t.clips);
  assert.equal(audio.length, 1);
  assert.deepEqual(s.selection, [audio[0].id]);
  assert.equal(run(s, { type: "clip/detachAudio", clipId: a }), s);
  s = run(s, { type: "history/undo" });
  assert.equal((clips(s, "v")[0] as MediaClip).audioDetached, false);
  s = run(s, { type: "track/set", trackId: "a", patch: { solo: true } });
  assert.equal(track(s, "a").solo, true);
});

check("paste: at playhead, keeps offsets, compatible tracks, brings assets", () => {
  let s = run(withTwoClips(), { type: "clip/addFromAsset", assetId: "a-mus" });
  const [v0] = clips(s, "v");
  const mus = clips(s, "a")[0];
  const items = [
    { clip: v0, trackKind: "video" as const, offset: 0 },
    { clip: mus, trackKind: "audio" as const, offset: 1 },
  ];
  s = run(s, { type: "select/track", trackId: "v" }, { type: "clip/paste", items, at: 20 });
  assert.deepEqual(span(clips(s, "v")[2]), [20, 30]);
  assert.equal(clips(s, "a")[1].start, 31 > 30 ? 30 : 21); // music 0..30 occupies, so it lands after it
  assert.equal(s.selection.length, 2);
  assert.ok(!s.selection.includes(v0.id));
  // Across projects: the asset comes along
  const other = run(base(), { type: "clip/paste", items: [items[0]], at: 0, assets: [VID] });
  assert.equal(other.project.assets[0].id, "a-vid");
  assert.equal(clips(other, "v").length, 1);
  // Paste is one undo step
  assert.equal(run(other, { type: "history/undo" }).project.assets.length, 0);
});

check("clips/shift moves a selection together and stops at obstacles", () => {
  let s = run(withTwoClips(), { type: "clip/addFromAsset", assetId: "a-img", trackId: "o", start: 0 });
  const [a, b] = clips(s, "v");
  const img = clips(s, "o")[0];
  // Move b and the image right by 3: free on both tracks
  const origins = [{ clipId: b.id, start: b.start }, { clipId: img.id, start: img.start }];
  s = run(s, { type: "clips/shift", origins, delta: 3, group: "gesture:g" });
  assert.equal(clips(s, "v")[1].start, 13);
  assert.equal(clips(s, "o")[0].start, 3);
  // Back left by 10 from the origins: b would hit a (ends at 10), so the group stops at delta 0
  s = run(s, { type: "clips/shift", origins, delta: -10, group: "gesture:g" }, { type: "history/endGroup" });
  assert.equal(clips(s, "v")[1].start, 10);
  assert.equal(clips(s, "o")[0].start, 0);
  // Two clips moving together keep the transition between them
  s = withTwoClips();
  s = run(s, { type: "clip/setTransition", clipId: clips(s, "v")[1].id, transition: { type: "crossfade", duration: 1 } });
  const both = clips(s, "v").map((c) => ({ clipId: c.id, start: c.start }));
  s = run(s, { type: "clips/shift", origins: both, delta: 4 });
  assert.deepEqual(clips(s, "v").map((c) => c.start), [4, 13]);
  assert.equal(clips(s, "v")[1].transitionIn?.duration, 1);
  void a;
});

check("keymap: event keys, labels, punctuation, Mac Option letters", () => {
  const ev = (key: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>> = {}, code?: string) =>
    ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, code, ...mods });
  assert.equal(eventKey(ev("Z", { ctrlKey: true, shiftKey: true }), false), "mod+shift+z");
  assert.equal(eventKey(ev("z", { metaKey: true }), true), "mod+z");
  assert.equal(eventKey(ev("z", { ctrlKey: true }), true), "z".replace("z", "z")); // Ctrl on Mac is not mod
  assert.equal(eventKey(ev(" "), false), "space");
  assert.equal(eventKey(ev("+", { shiftKey: true }), false), "+");
  assert.equal(eventKey(ev("≈", { altKey: true }, "KeyX"), true), "alt+x");
  assert.equal(bindingForKey("mod+b")?.id, "clip.split");
  assert.equal(bindingForKey("mod+s")?.global, true);
  assert.equal(keyLabel("mod+shift+z", false), "Ctrl+Shift+Z");
  assert.equal(keyLabel("mod+shift+z", true), "⌘⇧Z");
  // Every key appears once
  const seen = new Set<string>();
  for (const b of KEYMAP) for (const k of b.keys) {
    assert.ok(!seen.has(k), `duplicate key ${k}`);
    seen.add(k);
  }
});

check("removing an asset removes its clips", () => {
  let s = run(withTwoClips(), { type: "assets/remove", assetId: "a-vid" });
  assert.equal(clips(s, "v").length, 1);
  assert.equal(s.project.assets.some((a) => a.id === "a-vid"), false);
  s = run(s, { type: "history/undo" });
  assert.equal(clips(s, "v").length, 2);
});

check("asset metadata updates reach history snapshots, without an undo step", () => {
  let s = withTwoClips();
  const past = s.past.length;
  s = run(s, { type: "assets/update", assetId: "a-vid", patch: { width: 1280 } });
  assert.equal(s.past.length, past);
  assert.equal(s.past[s.past.length - 1].assets.find((a) => a.id === "a-vid")?.width, 1280);
});

check("selection modes, select all skips locked tracks, undo drops vanished ids", () => {
  let s = withTwoClips();
  const [a, b] = clips(s, "v").map((c) => c.id);
  s = run(s, { type: "select", clipIds: [a] }, { type: "select", clipIds: [b], mode: "add" });
  assert.deepEqual(s.selection, [a, b]);
  s = run(s, { type: "select", clipIds: [a], mode: "toggle" });
  assert.deepEqual(s.selection, [b]);
  s = run(s, { type: "history/undo" });
  assert.deepEqual(s.selection, []);
  s = run(s, { type: "history/redo" }, { type: "track/set", trackId: "v", patch: { locked: true } }, { type: "select/all" });
  assert.deepEqual(s.selection, []);
});

check("playhead: frame step, seconds, edges, next edit", () => {
  let s = withTwoClips();
  s = run(s, { type: "seek", time: 0 }, { type: "step", frames: 1 });
  assert.equal(s.playhead, 0.033);
  s = run(s, { type: "step", frames: -5 });
  assert.equal(s.playhead, 0);
  s = run(s, { type: "step", seconds: 1 });
  assert.equal(s.playhead, 1);
  s = run(s, { type: "seek/edge", edge: "end" });
  assert.equal(s.playhead, 16);
  s = run(s, { type: "seek/edit", dir: -1 });
  assert.equal(s.playhead, 10);
  s = run(s, { type: "seek", time: -4 });
  assert.equal(s.playhead, 0);
});

check("zoom clamps", () => {
  const s = run(base(), { type: "zoom", pxPerSecond: 10000 });
  assert.equal(s.zoom, 400);
});

check("freeStart and normalizeClips", () => {
  const a = makeCaptionClip("x", "", 0, 4);
  const b = makeCaptionClip("y", "", 6, 4);
  assert.equal(freeStart([a, b], 2, 3), 4);
  assert.equal(freeStart([a, b], 3, 3), 10);
  assert.equal(freeStart([a, b], 1, -3), 4);
  const withT = { ...b, start: 5, transitionIn: { type: "crossfade" as const, duration: 2 } };
  // Sorted, and the transition is dropped because the clip no longer overlaps the previous one
  const norm = normalizeClips([withT, a]);
  assert.deepEqual(norm.map((c) => c.id), ["x", "y"]);
  assert.equal(norm[1].transitionIn, undefined);
  // Overlap of 1 s keeps the transition at 1 s
  assert.equal(normalizeClips([a, { ...withT, start: 3 }])[1].transitionIn?.duration, 1);
});

check("snapping", () => {
  assert.deepEqual(snapTime(4.9, [0, 5, 10], 0.2), { time: 5, target: 5 });
  assert.deepEqual(snapTime(4.5, [0, 5, 10], 0.2), { time: 4.5, target: null });
  // A 3 s span starting at 6.9 ends at 9.9 -> snaps its end to 10
  assert.deepEqual(snapSpan(6.9, 3, [0, 5, 10], 0.2), { time: 7, target: 10 });
});

console.log(`store checks: ${passed} passed`);
