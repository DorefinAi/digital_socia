// The X Videos desk's live data: the backend's clip → the desk's clip, and the list merge that keeps the tab's own choices.
// Run: node --import ./src/components/Newsroom/BreakingDesk/video/timeline/__checks__/resolve-ts.mjs --test src/features/xvideos/lib/api.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { toXvClip, xvClipsPath, xvRescanPath, type XvWireClip } from "./wire";
import { dayLabel, demoFolders, findDay, istDay, latestDay, monthLabel, toXvFolders } from "./folders";
import { deskReducer, syncClips, type DeskState } from "../components/deskState";

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
  innerFolder: "Convert 3 pm to",
  day: "2026-11-24",
  picked: true,
  done: true,
  headlineSource: null,
  gone: false,
  ...over,
});

const desk = (over: Partial<DeskState> = {}): DeskState => ({ clips: [], day: null, parked: {}, drafts: {}, undo: [], ...over });

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
  const out = deskReducer(desk({ clips: [listed] }), { type: "clip/detail", clip: slowDetail });
  assert.equal(out.clips[0]?.readingProgress, undefined);
  assert.deepEqual(out.clips[0]?.transcript, [{ at: 1, text: "जयपुर" }]);
});

test("the new wire fields reach the clip: inner folder, day, x mark, where the headline came from", () => {
  const c = toXvClip(wire({ status: "new", done: false, headlineSource: "file_name", suggestedHeadline: "SI भर्ती … गिरफ्तार" }));
  assert.equal(c.innerFolder, "Convert 3 pm to");
  assert.equal(c.day, "2026-11-24");
  assert.equal(c.picked, true);
  assert.equal(c.headlineSource, "file_name");
  assert.equal(c.gone, false);
  assert.equal(c.status, "new");
});

test("a loose file has no inner folder; an unmarked file is not picked; an unknown headline source reads as none", () => {
  const c = toXvClip(wire({ innerFolder: "", picked: false, headlineSource: "ocr" as never }));
  assert.equal(c.innerFolder, "");
  assert.equal(c.picked, false);
  assert.equal(c.headlineSource, null);
});

test("a headline the model wrote from the screen says so", () => {
  const c = toXvClip(wire({ headlineSource: "screen", suggestedHeadline: "पोकरण-जोधपुर हाईवे पर सेना की एंबलेंस पलटी" }));
  assert.equal(c.headlineSource, "screen");
  assert.equal(c.suggestedHeadline, "पोकरण-जोधपुर हाईवे पर सेना की एंबलेंस पलटी");
});

test("a clip marked done on the share shows as posted even if its status lags", () => {
  assert.equal(toXvClip(wire({ status: "new", done: true })).status, "posted");
  assert.equal(toXvClip(wire({ status: "rejected", done: true })).status, "rejected");
});

test("the folders answer: newest first, days under their own month, today always listed", () => {
  const f = toXvFolders({
    today: "2026-12-01",
    months: [
      { month: "2026-11", days: [{ day: "2026-11-26", clips: 9, picked: 4, done: 2 }, { day: "2026-11-27", clips: 14, picked: 3, done: 1 }] },
      { month: "2026-10", days: [{ day: "2026-10-31", clips: 2, picked: 0, done: 0 }] },
    ],
  });
  assert.equal(f.today, "2026-12-01");
  assert.deepEqual(f.months.map((m) => m.month), ["2026-12", "2026-11", "2026-10"]);
  assert.deepEqual(f.months[0]?.days, [{ day: "2026-12-01", clips: 0, picked: 0, done: 0 }]);
  assert.deepEqual(f.months[1]?.days.map((d) => d.day), ["2026-11-27", "2026-11-26"]);
  assert.deepEqual(findDay(f, "2026-11-27"), { day: "2026-11-27", clips: 14, picked: 3, done: 1 });
  assert.equal(findDay(f, "2026-11-25"), undefined);
});

test("an old answer that still sends gone counts is read without them", () => {
  const f = toXvFolders({ today: "2026-11-27", months: [{ month: "2026-11", days: [{ day: "2026-11-27", clips: 3, picked: 1, done: 0, gone: 5 }] }] });
  assert.deepEqual(findDay(f, "2026-11-27"), { day: "2026-11-27", clips: 3, picked: 1, done: 0 });
});

test("the folders answer drops bad days and counts, and lists a day once", () => {
  const f = toXvFolders(
    { months: [{ month: "2026-11", days: [{ day: "27-11-2026", clips: 3 }, { day: "2026-11-27", clips: -2, picked: "4", done: 1.7 }, { day: "2026-11-27", clips: 99 }] }] },
    "2026-11-27",
  );
  assert.equal(f.today, "2026-11-27");
  assert.deepEqual(f.months, [{ month: "2026-11", days: [{ day: "2026-11-27", clips: 0, picked: 0, done: 1 }] }]);
  assert.deepEqual(toXvFolders(null, "2026-11-27").months, [{ month: "2026-11", days: [{ day: "2026-11-27", clips: 0, picked: 0, done: 0 }] }]);
});

test("days read as the desk says them, and today is India's date", () => {
  assert.equal(dayLabel("2026-11-27"), "Fri 27 Nov");
  assert.equal(monthLabel("2026-11"), "Nov 2026");
  // 20:00 UTC on 26 Nov is already 27 Nov in India
  assert.equal(istDay(Date.parse("2026-11-26T20:00:00Z")), "2026-11-27");
  assert.equal(istDay(Date.parse("2026-11-26T18:00:00Z")), "2026-11-26");
});

test("the demo's one day counts its clips, the x-marked ones and the posted ones", () => {
  const f = demoFolders([{ picked: true, status: "new" }, { picked: false, status: "posted" }, { status: "new" }], "2026-11-27");
  assert.deepEqual(findDay(f, "2026-11-27"), { day: "2026-11-27", clips: 3, picked: 1, done: 1 });
});

test("another day's list replaces the shown one; going back brings this tab's reject with it", () => {
  const a = toXvClip(wire({ id: "a", status: "new", day: "2026-11-27" }));
  const b = toXvClip(wire({ id: "b", status: "new", day: "2026-11-26" }));
  let s = deskReducer(desk(), { type: "clips/sync", day: "2026-11-27", clips: [a] });
  s = deskReducer(s, { type: "clip/reject", id: "a", reason: "duplicate" });
  s = deskReducer(s, { type: "day/switch", day: "2026-11-26" });
  assert.equal(s.day, "2026-11-26");
  assert.deepEqual(s.clips, [], "nothing of the 27th is listed under the 26th while its list loads");
  s = deskReducer(s, { type: "clips/sync", day: "2026-11-26", clips: [b] });
  assert.deepEqual(s.clips.map((c) => c.id), ["b"]);
  s = deskReducer(s, { type: "day/switch", day: "2026-11-27" });
  assert.deepEqual(s.clips.map((c) => c.id), ["a"]);
  s = deskReducer(s, { type: "clips/sync", day: "2026-11-27", clips: [a] });
  assert.equal(s.clips[0]?.status, "rejected");
});

test("the date rolling over: today's list for a new day switches to it", () => {
  const old = toXvClip(wire({ id: "old", status: "new", day: "2026-11-27" }));
  const fresh = toXvClip(wire({ id: "new", status: "new", day: "2026-11-28" }));
  let s = deskReducer(desk(), { type: "clips/sync", day: "2026-11-27", clips: [old] });
  s = deskReducer(s, { type: "clip/post", id: "old", text: "t", at: Date.now() });
  s = deskReducer(s, { type: "clips/sync", day: "2026-11-28", clips: [fresh] });
  assert.equal(s.day, "2026-11-28");
  assert.deepEqual(s.clips.map((c) => c.id), ["new"]);
  assert.deepEqual(s.undo, [], "the undo bar only offers the shown day's posts");
  assert.deepEqual(s.parked["2026-11-27"]?.map((c) => c.status), ["posted"]);
});

test("the list and the rescan ask for the shown day, or for today with no day at all", () => {
  assert.equal(xvClipsPath("2026-11-26"), "/xvideos/clips?day=2026-11-26");
  assert.equal(xvClipsPath(null), "/xvideos/clips");
  assert.equal(xvRescanPath("2026-11-26"), "/xvideos/rescan?day=2026-11-26");
  assert.equal(xvRescanPath(null), "/xvideos/rescan");
});

test("just after midnight the newest day is today, even while the folders still say yesterday", () => {
  // Folders answered before midnight; the browser's IST date has moved on
  assert.equal(latestDay("2026-11-27", istDay(Date.parse("2026-11-27T18:31:00Z")), "2026-11-27"), "2026-11-28");
  // The list already rolled to the new day before the folders did
  assert.equal(latestDay("2026-11-27", "2026-11-27", "2026-11-28"), "2026-11-28");
  // A picked older day never counts as today
  assert.equal(latestDay("2026-11-27", "2026-11-27", "2026-11-20"), "2026-11-27");
  // Missing or bad days are skipped
  assert.equal(latestDay(undefined, null, "28-11-2026", "2026-11-27"), "2026-11-27");
  assert.equal(latestDay(), null);
});

test("the composed post comes through: place, region, label, tags on and off", () => {
  const c = toXvClip(
    wire({
      district: "Tonk",
      region: "rajasthan",
      channelLabel: "Tonk News",
      hashtags: [{ value: "#Tonk", on: true }, { value: "#RajasthanNews", on: false }],
      mentions: [{ value: "@TonkPolice", on: true }],
    }),
  );
  assert.equal(c.district, "Tonk");
  assert.equal(c.region, "rajasthan");
  assert.equal(c.channelLabel, "Tonk News");
  assert.deepEqual(c.hashtags, [{ value: "#Tonk", on: true }, { value: "#RajasthanNews", on: false }]);
  assert.deepEqual(c.mentions, [{ value: "@TonkPolice", on: true }]);
  assert.equal(toXvClip(wire({ region: "mars" as never })).region, undefined);
});
