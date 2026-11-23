// Unit checks for deskRules.ts. The repo has no test runner; run with Node 22+ (type stripping) and the resolver
// that accepts extensionless TypeScript imports:
//   node --import ./src/components/Newsroom/BreakingDesk/video/timeline/__checks__/resolve-ts.mjs --test src/components/Newsroom/BreakingDesk/deskRules.test.ts
import { describe, it, test } from "node:test";
import assert from "node:assert/strict";
import { afterPostOrder, storiesAbove, storyJustAbove, tabTarget, pattiNumber, adjacentStory, advanceCandidates, afterPost, ftpCopyText, sameTab, ageTone, counterTone, dayChipLabel, dayKey, dayPriorityCounts, freeForAdvance, isDayKey, istDay, steppedTextSize, storyAfterPosted, textSizePreset, workableOrder, postedDayQuery } from "./deskRules";

const now = Date.parse("2026-11-11T07:13:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

test("age dot: green under 5 minutes, amber under 30, grey after", () => {
  assert.equal(ageTone(ago(0), now), "fresh");
  assert.equal(ageTone(ago(299_999), now), "fresh");
  assert.equal(ageTone(ago(300_000), now), "recent");
  assert.equal(ageTone(ago(1_799_999), now), "recent");
  assert.equal(ageTone(ago(1_800_000), now), "old");
});

test("X counter: amber from 260, red at 280 and over", () => {
  assert.equal(counterTone(259, 280, true), "success");
  assert.equal(counterTone(260, 280, true), "warning");
  assert.equal(counterTone(279, 280, true), "warning");
  assert.equal(counterTone(280, 280, true), "error");
  assert.equal(counterTone(281, 280, true), "error");
  // Other platforms warn at 90% of their limit
  assert.equal(counterTone(1979, 2200, false), "success");
  assert.equal(counterTone(1980, 2200, false), "warning");
});

test("date chip reads 11th Nov, with 1st, 2nd, 3rd and the teens as th", () => {
  assert.equal(dayChipLabel("2026-11-11"), "11th Nov");
  assert.equal(dayChipLabel("2026-11-01"), "1st Nov");
  assert.equal(dayChipLabel("2026-11-02"), "2nd Nov");
  assert.equal(dayChipLabel("2026-11-03"), "3rd Nov");
  assert.equal(dayChipLabel("2026-11-12"), "12th Nov");
  assert.equal(dayChipLabel("2026-11-13"), "13th Nov");
  assert.equal(dayChipLabel("2026-11-21"), "21st Nov");
  assert.equal(dayChipLabel("2026-11-22"), "22nd Nov");
  assert.equal(dayChipLabel("2026-11-23"), "23rd Nov");
  assert.equal(dayChipLabel("2026-09-30"), "30th Sep");
  assert.equal(dayChipLabel("not a day"), "not a day");
  assert.equal(dayChipLabel("2026-02-30"), "2026-02-30");
});

test("days are India days whatever the browser's zone, and bad times give none", () => {
  // 18:29 UTC is 23:59 IST; 18:30 UTC is midnight IST, the next day
  assert.equal(istDay("2026-11-10T18:29:00Z"), "2026-11-10");
  assert.equal(istDay("2026-11-10T18:30:00Z"), "2026-11-11");
  assert.equal(istDay(Date.parse("2026-11-11T07:13:00Z")), "2026-11-11");
  assert.equal(istDay("not a time"), null);
  assert.equal(istDay(""), null);
});

test("day keys: only real calendar days in YYYY-MM-DD", () => {
  assert.equal(isDayKey("2026-11-09"), true);
  assert.equal(isDayKey("2028-02-29"), true);
  assert.equal(isDayKey("2026-02-29"), false);
  assert.equal(isDayKey("2026-13-01"), false);
  assert.equal(isDayKey("2026-1-9"), false);
  assert.equal(isDayKey(""), false);
  assert.equal(dayKey(2026, 11, 9), "2026-11-09");
});

test("prev / next walk the queue's own order without wrapping", () => {
  const order = [{ id: "third" }, { id: "first" }, { id: "second" }];
  assert.equal(adjacentStory(order, "first", -1)?.id, "third");
  assert.equal(adjacentStory(order, "first", 1)?.id, "second");
  assert.equal(adjacentStory(order, "third", -1), undefined);
  assert.equal(adjacentStory(order, "second", 1), undefined);
  assert.equal(adjacentStory(order, "not listed", 1), undefined);
});

test("after Copy & Mark Posted: the next story, the one before at the end, none when it was the last", () => {
  const order = [{ id: "a" }, { id: "b" }, { id: "c" }];
  // Posting goes up: C posted opens B; the top story falls back to the one below
  assert.equal(storyAfterPosted(order, "a")?.id, "b");
  assert.equal(storyAfterPosted(order, "b")?.id, "a");
  assert.equal(storyAfterPosted(order, "c")?.id, "b");
  assert.equal(storyAfterPosted([{ id: "a" }], "a"), undefined);
  assert.equal(storyAfterPosted(order, "gone"), undefined);
});

test("text size steps 10% within bounds, and S / M / L presets", () => {
  assert.equal(steppedTextSize(1, 1, 0.5, 1.8, 0.01), 1.1);
  assert.equal(steppedTextSize(1, -1, 0.5, 1.8, 0.01), 0.9);
  assert.equal(steppedTextSize(1.8, 1, 0.5, 1.8, 0.01), 1.8);
  assert.equal(steppedTextSize(0.5, -1, 0.5, 1.8, 0.01), 0.5);
  assert.deepEqual((["S", "M", "L"] as const).map((p) => textSizePreset(p, 0.5, 1.8)), [0.8, 1, 1.2]);
  assert.deepEqual((["S", "M", "L"] as const).map((p) => textSizePreset(p, 16, 240)), [32, 48, 72]);
});

test("prev / next and the story after posting step over stories someone else holds", () => {
  const order = [{ id: "a" }, { id: "held" }, { id: "b" }, { id: "c" }];
  const held = (s: { id: string }) => s.id === "held";
  assert.equal(adjacentStory(workableOrder(order, "a", held), "a", 1)?.id, "b");
  assert.equal(adjacentStory(workableOrder(order, "b", held), "b", -1)?.id, "a");
  assert.equal(storyAfterPosted(workableOrder(order, "a", held), "a")?.id, "b");
  // The open story stays in the order even if it reads as held
  assert.equal(adjacentStory(workableOrder(order, "held", held), "held", 1)?.id, "b");
  assert.equal(storyAfterPosted(workableOrder([{ id: "a" }, { id: "held" }], "a", held), "a"), undefined);
});

test("All / BIG Breaking / Breaking count the chosen day only, and BIG + Breaking = All", () => {
  const today = istDay(now) ?? "";
  const yesterday = istDay(now - 86_400_000) ?? "";
  const stories = [
    { at: ago(60_000), big: true },
    { at: ago(120_000), big: false },
    { at: ago(180_000), big: false },
    { at: ago(86_400_000), big: false },
    // Late last night in India: yesterday's, though it is the same UTC day as `now`
    { at: "2026-11-10T18:00:00Z", big: true },
    { at: "not a time", big: true },
  ];
  const count = (day: string) => dayPriorityCounts(stories, day, (s) => istDay(s.at), (s) => (s.big ? "big_breaking" : "breaking"));
  assert.deepEqual(count(today), { all: 3, big_breaking: 1, breaking: 2 });
  assert.deepEqual(count(yesterday), { all: 2, big_breaking: 1, breaking: 1 });
  assert.deepEqual(count("2026-01-01"), { all: 0, big_breaking: 0, breaking: 0 });
  for (const day of [today, yesterday]) assert.equal(count(day).big_breaking + count(day).breaking, count(day).all);
  // An untagged story counts in All only
  assert.deepEqual(dayPriorityCounts([{ at: ago(0) }], today, (s) => istDay(s.at), () => null), { all: 1, big_breaking: 0, breaking: 0 });
});

test("after a post the editor opens the next free story on the FTP feed; after a fix the desk turns to New too", () => {
  const next = { id: "n" };
  // Copy & Mark Posted / Save as posted
  assert.deepEqual(afterPost(next, false), { open: next, tool: "ftp", returnTo: undefined });
  assert.deepEqual(afterPost(undefined, false), { open: null, returnTo: undefined });
  // A fix of a posted story (saved, unchanged, or taken back): the desk behind shows New, whether it moves on or closes
  assert.deepEqual(afterPost(next, true), { open: next, tool: "ftp", returnTo: "queue" });
  assert.deepEqual(afterPost(undefined, true), { open: null, returnTo: "queue" });
});

test("after posting: the stories to try run on after the posted one, then back before it, nearest first", () => {
  const order = [{ id: "a" }, { id: "b" }, { id: "p" }, { id: "c" }, { id: "d" }];
  const none = () => false;
  assert.deepEqual(advanceCandidates(order, "p", none).map((s) => s.id), ["b", "a", "c", "d"]);
  assert.deepEqual(advanceCandidates(order, "d", none).map((s) => s.id), ["c", "p", "b", "a"]);
  assert.deepEqual(advanceCandidates(order, "a", none).map((s) => s.id), ["b", "p", "c", "d"]);
  // Taken stories are left out; none left means back to the desk
  assert.deepEqual(advanceCandidates(order, "p", (s) => s.id === "b").map((s) => s.id), ["a", "c", "d"]);
  assert.deepEqual(advanceCandidates([{ id: "p" }, { id: "x" }], "p", (s) => s.id === "x"), []);
  // A story not in the list (filtered out, or a posted one fixed from Posted today): from the top, taken ones left out
  assert.deepEqual(advanceCandidates(order, "gone", none).map((s) => s.id), ["a", "b", "p", "c", "d"]);
  assert.deepEqual(advanceCandidates(order, "gone", (s) => s.id === "a").map((s) => s.id), ["b", "p", "c", "d"]);
  assert.deepEqual(advanceCandidates([], "gone", none), []);
  // The first candidate is the story storyAfterPosted would pick when nothing is taken
  assert.equal(advanceCandidates(order, "p", none)[0]?.id, storyAfterPosted(order, "p")?.id);
});

test("after posting: only a story that is waiting and nobody else has or is editing is free", () => {
  const editing = new Set(["e"]);
  const nobody = new Set<string>();
  assert.equal(freeForAdvance("r", { status: "ready", claim: null }, nobody), true);
  assert.equal(freeForAdvance("m", { status: "claimed", claim: { mine: true } }, nobody), true);
  assert.equal(freeForAdvance("h", { status: "claimed", claim: { mine: false } }, nobody), false);
  assert.equal(freeForAdvance("h2", { status: "ready", claim: { mine: false } }, nobody), false);
  // Live presence: someone has it open in edit mode, even though the polled data still says ready
  assert.equal(freeForAdvance("e", { status: "ready", claim: null }, editing), false);
  for (const status of ["published", "rejected", "queued", "publishing", "failed", "rendering", "render_failed", "recalled"]) {
    assert.equal(freeForAdvance("s", { status, claim: null }, nobody), false, status);
  }
  // No draft data (demo desk): free unless someone is editing it
  assert.equal(freeForAdvance("demo", null, nobody), true);
  assert.equal(freeForAdvance("e", undefined, editing), false);
});

test("after posting: the pick skips held, edited-by-others and posted stories", () => {
  type S = { id: string; draft: { status: string; claim: { mine: boolean } | null } };
  const s = (id: string, status = "ready", claim: { mine: boolean } | null = null): S => ({ id, draft: { status, claim } });
  const order = [s("p"), s("held", "claimed", { mine: false }), s("open"), s("done", "published"), s("free"), s("last")];
  const editing = new Set(["open"]);
  const taken = (x: S) => !freeForAdvance(x.id, x.draft, editing);
  assert.deepEqual(advanceCandidates(order, "p", taken).map((x) => x.id), ["free", "last"]);
});

test("patti number comes from the file name", () => {
  assert.equal(pattiNumber("nat_flash_rj_breaking_7920_yn_16NOV_control_ashvini_big"), "7920");
  assert.equal(pattiNumber("nat_flash_rj_breaking_7920_yn_16NOV_control_ashvini_big.txt"), "7920");
  assert.equal(pattiNumber("no_number_here"), null);
  assert.equal(pattiNumber(null), null);
});

describe("after posting stays in the same tab and in the editor", () => {
  const s = (id: string, big: boolean) => ({ id, big });
  const order = [s("A", true), s("B", false), s("C", true), s("D", false), s("E", true)];
  const tab = (x: { big: boolean }) => x.big;
  it("keeps only the open story's tab", () => {
    assert.deepEqual(sameTab(order, order[2], tab).map((x) => x.id), ["A", "C", "E"]);
    assert.deepEqual(sameTab(order, order[3], tab).map((x) => x.id), ["B", "D"]);
  });
  it("never offers a story from the other tab", () => {
    assert.equal(sameTab(order, order[1], tab).some((x) => x.big), false);
  });
  it("stays on the story when nothing else is in the tab", () => {
    const only = sameTab([s("A", true), s("B", false)], s("B", false), tab);
    assert.deepEqual(only.map((x) => x.id), ["B"]);
    assert.equal(afterPost(undefined, false).open, null);
    assert.equal(afterPost(undefined, true).open, null);
  });
});

describe("after Copy & Mark Posted: the story just above, in the same tab, never a posted one", () => {
  type S = { id: string; big: boolean; posted?: boolean };
  const tab = (x: S) => (x.big ? "big" : "breaking");
  const posted = (x: S) => !!x.posted;
  const none = () => false;
  // The list as the editor shows it, newest first: BIG and Breaking mixed, two already posted
  const order: S[] = [
    { id: "B1", big: true },
    { id: "R1", big: false },
    { id: "B2", big: true, posted: true },
    { id: "B3", big: true },
    { id: "R2", big: false },
    { id: "B4", big: true },
  ];
  const next = (currentId: string, currentTab: string) => advanceCandidates(afterPostOrder(order, currentId, currentTab, tab, posted), currentId, none)[0]?.id;
  it("opens the BIG story just above, stepping over the posted one and the Breaking ones", () => {
    assert.equal(next("B4", "big"), "B3");
    assert.equal(next("B3", "big"), "B1");
  });
  it("the top story of the tab falls back to the one below it in the same tab", () => {
    assert.equal(next("B1", "big"), "B3");
    assert.equal(next("R1", "breaking"), "R2");
  });
  it("a Breaking story never opens a BIG one, and a BIG one never a Breaking one", () => {
    assert.equal(next("R2", "breaking"), "R1");
    for (const id of ["B1", "B3", "B4"]) assert.notEqual(tab(order.find((s) => s.id === next(id, "big"))!), "breaking");
  });
  it("a fix of a posted story opens the one just above it, not the newest", () => {
    // B2 is posted and being fixed: it stays in its place, so the pick starts above it
    assert.equal(next("B2", "big"), "B1");
  });
  it("the tab comes from the desk's row, so an editor copy without the BIG tag doesn't flip tabs", () => {
    // What the old code did: the editor copy read as Breaking, so R stories were offered after a BIG post
    assert.equal(advanceCandidates(afterPostOrder(order, "B4", "breaking", tab, posted), "B4", none)[0]?.id, "R2");
    assert.equal(next("B4", "big"), "B3");
  });
  it("none left in the tab: nothing to open, the editor stays", () => {
    const only: S[] = [{ id: "B1", big: true }, { id: "B2", big: true, posted: true }, { id: "R1", big: false }];
    assert.deepEqual(advanceCandidates(afterPostOrder(only, "B1", "big", tab, posted), "B1", none), []);
    assert.equal(afterPost(undefined, false).open, null);
  });
});

describe("clicking a BIG Breaking / Breaking tab", () => {
  type S = { id: string; big: boolean; posted?: boolean };
  const tab = (x: S) => (x.big ? "big" : "breaking");
  const posted = (x: S) => !!x.posted;
  const listed: S[] = [
    { id: "B1", big: true, posted: true },
    { id: "R1", big: false, posted: true },
    { id: "B2", big: true },
    { id: "R2", big: false },
  ];
  it("opens the story last open in that tab", () => {
    assert.equal(tabTarget(listed, "breaking", tab, "R2", posted)?.id, "R2");
    // Even a posted one: it is viewed, not opened for a fix
    assert.equal(tabTarget(listed, "big", tab, "B1", posted)?.id, "B1");
  });
  it("with none remembered, the top story that isn't posted (a posted top story is skipped)", () => {
    assert.equal(tabTarget(listed, "big", tab, null, posted)?.id, "B2");
    assert.equal(tabTarget(listed, "breaking", tab, undefined, posted)?.id, "R2");
  });
  it("a remembered story that left the list or is in the other tab is ignored", () => {
    assert.equal(tabTarget(listed, "big", tab, "gone", posted)?.id, "B2");
    assert.equal(tabTarget(listed, "big", tab, "R2", posted)?.id, "B2");
  });
  it("a tab with only posted stories opens nothing", () => {
    assert.equal(tabTarget([{ id: "B1", big: true, posted: true }], "big", tab, null, posted), undefined);
  });
});

describe("FTP copy text", () => {
  it("copies only the body", () => {
    assert.equal(ftpCopyText("  body line  ", "queue body"), "body line");
  });
  it("falls back to the queue body when the FTP text is empty", () => {
    assert.equal(ftpCopyText("", "queue body"), "queue body");
    assert.equal(ftpCopyText(null, undefined), "");
  });
});

describe("storiesAbove + advanceCandidates (the rebuilt-list helpers; the editor now takes the row directly above, posted or not)", () => {
  type S = { id: string; big: boolean; receivedAt: string; posted?: boolean; heldByOther?: boolean };
  const at = (min: number) => new Date(Date.UTC(2026, 10, 17, 10, min)).toISOString();
  // The editor's left list, newest first: A (10:40), B (10:30), C (10:20, posted), D (10:10)
  const A: S = { id: "A", big: true, receivedAt: at(40) };
  const B: S = { id: "B", big: true, receivedAt: at(30) };
  const C: S = { id: "C", big: true, receivedAt: at(20), posted: true };
  const D: S = { id: "D", big: true, receivedAt: at(10) };
  const tab = (x: S) => (x.big ? "big" : "breaking");
  const taken = (x: S) => !!x.heldByOther;
  /** What the editor opens after posting `id`: undefined = it stays on the story */
  const next = (order: S[], id: string) => {
    const above = storiesAbove(afterPostOrder(order, id, "big", tab, (x) => !!x.posted), id);
    return above.length > 1 ? advanceCandidates(above, id, taken)[0]?.id : undefined;
  };
  it("case 1: A, B, C (posted), D: posting B opens A, not D", () => {
    assert.equal(next([A, B, C, D], "B"), "A");
  });
  it("case 2: posting A (the top story, nothing above) stays on A", () => {
    assert.equal(next([A, B, C, D], "A"), undefined);
    assert.equal(afterPost(undefined, false).open, null);
  });
  it("case 3: the desk's queue sorted oldest first (D, C, B, A) still opens A after B: the list's order decides", () => {
    assert.equal(next([D, C, B, A], "B"), "A");
    assert.equal(next([D, C, B, A], "A"), undefined);
  });
  it("case 4: posting D skips the posted C and opens B; with A held by someone else, posting B stays on B", () => {
    assert.equal(next([A, B, C, D], "D"), "B");
    assert.equal(next([{ ...A, heldByOther: true }, B, C, D], "B"), undefined);
  });
});

describe("after Copy & Mark Posted: the row directly above in the list on screen, posted or not (owner, 17 Nov 2026)", () => {
  // The editor's left list, top to bottom: A, B, C (posted), D
  const list = ["A", "B", "C", "D"];
  it("case 1: posting B opens A", () => assert.equal(storyJustAbove(list, "B"), "A"));
  it("case 2: posting A (the top row) stays on A", () => assert.equal(storyJustAbove(list, "A"), null));
  it("case 3: posting D opens C, even though C is posted", () => assert.equal(storyJustAbove(list, "D"), "C"));
  it("case 4: a story the list does not show: worked out another way (undefined), never a guess", () => assert.equal(storyJustAbove(list, "X"), undefined));
});

test("Posted follows the picked day: today as before, an earlier day with the posts since that day", () => {
  assert.deepEqual(postedDayQuery({}, "2026-11-24"), {});
  assert.deepEqual(postedDayQuery({ day: "2026-11-24" }, "2026-11-24"), {});
  assert.deepEqual(postedDayQuery({ day: "2026-11-23" }, "2026-11-24"), { day: "2026-11-23", days: 2 });
  assert.deepEqual(postedDayQuery<{ day?: string; days?: number; district?: string }>({ day: "2026-10-01", district: "Jaipur" }, "2026-11-24"), { day: "2026-10-01", days: 30 });
  // The filters stay with today's request only
  assert.deepEqual(postedDayQuery<{ day?: string; days?: number; district?: string }>({ district: "Jaipur" }, "2026-11-24"), { district: "Jaipur" });
  // Across a month end
  assert.deepEqual(postedDayQuery({ day: "2026-11-30" }, "2026-12-01"), { day: "2026-11-30", days: 2 });
});
