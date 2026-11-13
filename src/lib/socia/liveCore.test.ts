// Unit checks for liveCore.ts (run by npm test): presence grouping, the header's summary, colours and initials
// as the server makes them, and the throttle that sends the holder's text and cursor.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CURSOR_SEND_MS,
  PRESENCE_COLORS,
  TEXT_SEND_MS,
  colorFor,
  LONG_TEXT_MARK,
  NO_PRESENCE,
  askReducer,
  createOutbox,
  createRefreshGate,
  createStateSender,
  mergePresence,
  needsRejoin,
  planPresence,
  presenceOf,
  readableFill,
  refreshesLists,
  streamable,
  whiteContrast,
  firstName,
  groupPresence,
  initialsOf,
  presenceLines,
  presenceSummary,
  updatedAgo,
  visibleViewers,
  withDefaults,
  type AskState,
  type Clock,
  type EditState,
  type LiveAnswerLike,
  type PresenceEntry,
} from "./liveCore";

const entry = (userId: string, name: string, mode: "edit" | "watch", color = "#7048E8"): PresenceEntry => ({ userId, name, mode, color, initials: initialsOf(name) });
const priya = entry("u-priya", "Priya Sharma", "edit");
const amit = entry("u-amit", "Amit Jain", "watch", "#0C8599");
const rahul = entry("u-rahul", "Rahul Verma", "watch", "#E8590C");

test("colours match the server's FNV-1a hash into the shared palette", () => {
  assert.equal(colorFor("u-priya"), "#0C8599");
  assert.equal(colorFor("8a7b2c1e-0000-4000-8000-000000000001"), "#7048E8");
  assert.equal(colorFor("x"), "#5F3DC4");
  for (const id of ["a", "bb", "ccc", "user-42"]) assert.ok((PRESENCE_COLORS as readonly string[]).includes(colorFor(id)));
});

test("initials are the first letters of the first two words, Hindi names included", () => {
  assert.equal(initialsOf("Asha Rani Verma"), "AR");
  assert.equal(initialsOf("amit"), "A");
  assert.equal(initialsOf("प्रिया शर्मा"), "पश");
  assert.equal(initialsOf("   "), "?");
  assert.equal(firstName("Priya Sharma"), "Priya");
});

test("an entry without a colour or initials gets them", () => {
  const e = withDefaults({ userId: "x", name: "Neha Gupta", mode: "watch", color: "", initials: "" });
  assert.equal(e.color, "#5F3DC4");
  assert.equal(e.initials, "NG");
});

test("grouping: the editor once, viewers once each, a two-tab person counted once", () => {
  const g = groupPresence([amit, priya, { ...amit }, { ...priya, mode: "watch" }, rahul]);
  assert.equal(g.editor?.userId, "u-priya");
  assert.deepEqual(
    g.viewers.map((v) => v.userId),
    ["u-amit", "u-rahul"],
  );
});

test("grouping leaves out the person looking (the story list)", () => {
  const g = groupPresence([priya, amit, rahul], "u-rahul");
  assert.deepEqual(
    g.viewers.map((v) => v.userId),
    ["u-amit"],
  );
  assert.deepEqual(groupPresence(undefined), { editor: null, viewers: [] });
});

test("a row shows three viewers, then +N", () => {
  const many = ["a", "b", "c", "d", "e"].map((id) => entry(id, id.toUpperCase(), "watch"));
  const { shown, more } = visibleViewers(many);
  assert.equal(shown.length, 3);
  assert.equal(more, 2);
  assert.equal(visibleViewers(many.slice(0, 2)).more, 0);
});

test("tooltip lines name everyone, and the person looking as You", () => {
  const g = groupPresence([priya, amit]);
  assert.deepEqual(presenceLines(g), ["Priya Sharma is editing", "Amit Jain is viewing"]);
  assert.deepEqual(presenceLines(g, "u-amit"), ["Priya Sharma is editing", "You are viewing"]);
});

test("the header summary hides when only you are there", () => {
  assert.equal(presenceSummary(groupPresence([amit]), "u-amit"), null);
  assert.equal(presenceSummary(groupPresence([]), "u-amit"), null);
  assert.equal(presenceSummary(groupPresence([priya, amit, rahul]), "u-rahul"), "Priya editing · 2 viewing");
  assert.equal(presenceSummary(groupPresence([priya, amit]), "u-priya"), "You're editing · 1 viewing");
  assert.equal(presenceSummary(groupPresence([amit, rahul]), "u-rahul"), "2 viewing");
});

test("updated-ago wording", () => {
  assert.equal(updatedAgo(800), "just now");
  assert.equal(updatedAgo(21_000), "21 s ago");
  assert.equal(updatedAgo(185_000), "3 min ago");
});

/** A clock the test moves by hand */
function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: Clock = {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = ++seq;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (h) => void timers.delete(h as number),
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].fn();
    }
    now = end;
  };
  return { clock, advance };
}

const st = (text: string, sel = text.length): EditState => ({ draftId: "d1", text, selStart: sel, selEnd: sel, version: 3 });

test("the sender goes at once, then holds text changes to about 3 a second, always the latest", () => {
  const { clock, advance } = fakeClock();
  const sent: string[] = [];
  const s = createStateSender((x) => sent.push(x.text), clock);
  s.push(st("a"));
  assert.deepEqual(sent, ["a"]);
  advance(50);
  s.push(st("ab"));
  advance(50);
  s.push(st("abc"));
  assert.deepEqual(sent, ["a"]);
  advance(TEXT_SEND_MS);
  assert.deepEqual(sent, ["a", "abc"]);
});

test("cursor-only moves go faster than text, at most 5 a second (the server allows 6)", () => {
  const { clock, advance } = fakeClock();
  const sent: number[] = [];
  const s = createStateSender((x) => sent.push(x.selStart), clock);
  s.push(st("hello", 5));
  s.push(st("hello", 2));
  advance(CURSOR_SEND_MS - 1);
  assert.deepEqual(sent, [5]);
  advance(1);
  assert.deepEqual(sent, [5, 2]);
  assert.ok(CURSOR_SEND_MS >= 200, "cursor sends are 200 ms apart or more");
});

test("a text change waiting behind a cursor move keeps the text gap", () => {
  const { clock, advance } = fakeClock();
  const sent: string[] = [];
  const s = createStateSender((x) => sent.push(`${x.text}@${x.selStart}`), clock);
  s.push(st("hi", 2));
  s.push(st("hi", 1));
  s.push(st("hiya", 4));
  advance(CURSOR_SEND_MS);
  assert.deepEqual(sent, ["hi@2"]);
  advance(TEXT_SEND_MS - CURSOR_SEND_MS);
  assert.deepEqual(sent, ["hi@2", "hiya@4"]);
});

test("flush sends what waits now; cancel drops it", () => {
  const { clock, advance } = fakeClock();
  const sent: string[] = [];
  const s = createStateSender((x) => sent.push(x.text), clock);
  s.push(st("a"));
  s.push(st("ab"));
  s.flush();
  assert.deepEqual(sent, ["a", "ab"]);
  advance(10);
  s.push(st("abc"));
  s.cancel();
  advance(1000);
  assert.deepEqual(sent, ["a", "ab"]);
});

// ─── Refreshing the lists on queue events ────────────────────────────────────

test("autosaves don't refresh the lists; claims, releases, posts and arrivals do", () => {
  assert.equal(refreshesLists("draft.updated", { status: "claimed" }), false);
  assert.equal(refreshesLists("draft.updated", { status: "queued" }), true);
  assert.equal(refreshesLists("draft.updated", { status: "published" }), true);
  for (const t of ["draft.claimed", "draft.released", "story.arrived", "post.sent", "post.recalled"]) assert.equal(refreshesLists(t, {}), true, t);
  assert.equal(refreshesLists("presence.list", {}), false);
});

test("the refresh gate runs at once, then at most once per 2 s, and only in a visible tab", () => {
  const { clock, advance } = fakeClock();
  let visible = true;
  let runs = 0;
  const gate = createRefreshGate({ run: () => runs++, visible: () => visible, clock });
  gate.call();
  assert.equal(runs, 1);
  advance(100);
  gate.call();
  gate.call();
  advance(500);
  gate.call();
  assert.equal(runs, 1, "calls inside the gap wait");
  advance(1400);
  assert.equal(runs, 2, "and collapse into one run at its end");
  visible = false;
  advance(5000);
  gate.call();
  assert.equal(runs, 2, "a hidden tab doesn't refresh");
  visible = true;
  gate.call();
  advance(100);
  gate.call();
  visible = false;
  advance(5000);
  assert.equal(runs, 3, "a run due after the tab went hidden is dropped");
  visible = true;
  gate.call();
  gate.cancel();
  advance(5000);
  assert.equal(runs, 4);
});

// ─── The presence store ──────────────────────────────────────────────────────

test("merging presence keeps each unchanged story's array, so its readers don't re-render", () => {
  const a = [priya, amit];
  const b = [rahul];
  const prev = { d1: a, d2: b };
  const same = mergePresence(prev, { d1: [{ ...priya }, { ...amit }], d2: [{ ...rahul }] });
  assert.equal(same, prev, "nothing changed: the same map");
  const next = mergePresence(prev, { d1: [{ ...priya }, { ...amit }], d2: [{ ...rahul, mode: "edit" }] });
  assert.notEqual(next, prev);
  assert.equal(next.d1, a, "d1 unchanged: the same array");
  assert.notEqual(next.d2, b);
  const fewer = mergePresence(prev, { d1: a });
  assert.notEqual(fewer, prev, "a story leaving the list is a change");
  assert.equal(fewer.d1, a);
  assert.equal(presenceOf(fewer, "d2"), NO_PRESENCE);
  assert.equal(presenceOf(fewer, null), NO_PRESENCE);
});

// ─── Joining and leaving ─────────────────────────────────────────────────────

test("a mode change on the same story is one join; a story change leaves, then joins", () => {
  assert.deepEqual(planPresence(null, { draftId: "d1", mode: "watch" }), [{ kind: "join", draftId: "d1", mode: "watch" }]);
  assert.deepEqual(planPresence({ draftId: "d1", mode: "watch" }, { draftId: "d1", mode: "watch" }), []);
  assert.deepEqual(planPresence({ draftId: "d1", mode: "watch" }, { draftId: "d1", mode: "edit" }), [{ kind: "join", draftId: "d1", mode: "edit" }]);
  assert.deepEqual(planPresence({ draftId: "d1", mode: "edit" }, { draftId: "d2", mode: "watch" }), [
    { kind: "leave", draftId: "d1" },
    { kind: "join", draftId: "d2", mode: "watch" },
  ]);
  assert.deepEqual(planPresence({ draftId: "d1", mode: "edit" }, null), [{ kind: "leave", draftId: "d1" }]);
  assert.deepEqual(planPresence(null, null), []);
});

test("answers that mean the tab is off its story ask for a join again", () => {
  for (const error of ["not_holder", "unknown_client", "not_joined"]) assert.equal(needsRejoin({ ok: false, error }), true, error);
  assert.equal(needsRejoin({ ok: false, error: "rate_limited" }), false);
  assert.equal(needsRejoin({ ok: true }), false);
});

// ─── The outbox: order, coalescing, resends ──────────────────────────────────

const tick = () => new Promise((r) => setImmediate(r));

/** A transport the test answers by hand */
function transport() {
  const calls: { what: string; answer: (a: LiveAnswerLike) => void }[] = [];
  const call = (what: string) => new Promise<LiveAnswerLike>((answer) => calls.push({ what, answer }));
  return { calls, call };
}

test("the outbox sends one at a time in order: the last state goes before the leave", async () => {
  const t = transport();
  const box = createOutbox({ sendState: (s) => t.call(`state:${s.text}`) });
  box.state(st("a"));
  box.state(st("ab"));
  const left = box.control(() => t.call("leave"));
  await tick();
  assert.deepEqual(
    t.calls.map((c) => c.what),
    ["state:a"],
  );
  t.calls[0].answer({ ok: true });
  await tick();
  assert.deepEqual(
    t.calls.map((c) => c.what),
    ["state:a", "state:ab"],
    "the queued state was replaced by the newest, and goes before the leave",
  );
  t.calls[1].answer({ ok: true });
  await tick();
  t.calls[2].answer({ ok: true });
  assert.deepEqual(await left, { ok: true });
  assert.equal(t.calls[2].what, "leave");
});

test("a state refused for speed goes again after a pause, unless a newer one came", async () => {
  const { clock, advance } = fakeClock();
  const t = transport();
  const box = createOutbox({ sendState: (s) => t.call(s.text), clock });
  box.state(st("x"));
  await tick();
  t.calls[0].answer({ ok: false, error: "rate_limited", status: 429 });
  await tick();
  advance(1200);
  await tick();
  assert.deepEqual(
    t.calls.map((c) => c.what),
    ["x", "x"],
    "resent",
  );
  t.calls[1].answer({ ok: false, error: "offline" });
  await tick();
  box.state(st("xy"));
  await tick();
  advance(5000);
  await tick();
  assert.deepEqual(
    t.calls.map((c) => c.what),
    ["x", "x", "xy"],
    "the newer state replaced the resend",
  );
});

test("resends stop after a few tries, and a refusal about the request itself is not resent", async () => {
  const { clock, advance } = fakeClock();
  const t = transport();
  const box = createOutbox({ sendState: (s) => t.call(s.text), clock });
  box.state(st("x"));
  for (let i = 0; i < 6; i++) {
    await tick();
    t.calls[t.calls.length - 1]?.answer({ ok: false, error: "offline" });
    await tick();
    advance(1000);
  }
  assert.equal(t.calls.length, 4, "the first send and three resends");
  const t2 = transport();
  const box2 = createOutbox({ sendState: (s) => t2.call(s.text), clock });
  box2.state(st("bad"));
  await tick();
  t2.calls[0].answer({ ok: false, error: "bad_request", status: 400 });
  await tick();
  advance(5000);
  await tick();
  assert.equal(t2.calls.length, 1);
});

test("too long: the too-long mark goes instead; not on the story: join again", async () => {
  const t = transport();
  let rejoins = 0;
  const box = createOutbox({ sendState: (s) => t.call(s.text), onRejoin: () => rejoins++ });
  box.state(st("long text"));
  await tick();
  t.calls[0].answer({ ok: false, error: "too_long" });
  await tick();
  assert.equal(t.calls[1].what, LONG_TEXT_MARK);
  t.calls[1].answer({ ok: false, error: "not_joined" });
  await tick();
  assert.equal(rejoins, 1);
  box.dropState();
});

test("streamable: control characters become spaces one for one; over 2000 characters is the mark", () => {
  const s = streamable(st("a\u0007b\tc\nd\u0000"));
  assert.equal(s.text, "a b\tc\nd ");
  assert.equal(s.text.length, 8);
  const plain = st("नमस्ते");
  assert.equal(streamable(plain), plain);
  const long = streamable(st("x".repeat(2001)));
  assert.equal(long.text, LONG_TEXT_MARK);
  assert.equal(long.selStart, 0);
});

// ─── Asking to take over ─────────────────────────────────────────────────────

test("the ask: an answer counts only while asking; one that beats the POST isn't undone by it", () => {
  const idle: AskState = { state: "idle" };
  assert.equal(askReducer(idle, { type: "answered", accept: true, name: "Priya" }), idle, "no ask out: ignored");
  let s = askReducer(idle, { type: "ask", name: "Priya" });
  assert.deepEqual(s, { state: "asking", name: "Priya", waiting: false });
  s = askReducer(s, { type: "answered", accept: false, name: "Priya" });
  assert.deepEqual(s, { state: "declined", name: "Priya" });
  assert.deepEqual(askReducer(s, { type: "sent" }), s, "the POST's late ok changes nothing");
  assert.deepEqual(askReducer(s, { type: "timeout" }), s);
});

test("the ask: pending keeps waiting, no holder ends quietly, refusals read as sentences", () => {
  const asking: AskState = { state: "asking", name: "Priya", waiting: false };
  assert.deepEqual(askReducer(asking, { type: "refused", error: "pending" }), { ...asking, waiting: true });
  assert.deepEqual(askReducer(asking, { type: "refused", error: "no_holder" }), { state: "idle" });
  const forbidden = askReducer(asking, { type: "refused", error: "forbidden", status: 403 });
  assert.equal(forbidden.state === "failed" && /can't fix this posted story/.test(forbidden.message), true);
  const cooldown = askReducer(asking, { type: "refused", error: "cooldown", status: 429 });
  assert.equal(cooldown.state === "failed" && /a moment ago/.test(cooldown.message), true);
  const timedOut = askReducer({ ...asking, waiting: true }, { type: "timeout" });
  assert.equal(timedOut.state === "failed" && /didn't answer/.test(timedOut.message), true);
  assert.deepEqual(askReducer(timedOut, { type: "reset" }), { state: "idle" });
});

// ─── Badge colours ───────────────────────────────────────────────────────────

test("badge fills carry white initials at 4.5:1 or more, and passing colours stay as they are", () => {
  for (const c of PRESENCE_COLORS) assert.ok(whiteContrast(readableFill(c)) >= 4.5, `${c} → ${readableFill(c)}`);
  assert.equal(readableFill("#7048E8"), "#7048E8");
  assert.equal(readableFill("#5F3DC4"), "#5F3DC4");
  assert.notEqual(readableFill("#E67700"), "#E67700");
  assert.equal(readableFill("not a colour"), "not a colour");
});
