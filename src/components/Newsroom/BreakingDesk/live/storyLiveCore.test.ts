// Hook-level checks (npm test) for useStoryLive.ts, through the controller it is a thin shell over
// (storyLiveCore.ts): the take-over dialog during an export (N2), dropping unsent text (N7), watch mode only with a
// draft id (N12), and a story under correction (L2, L4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStoryLive, showAskTakeover, takeoverDialogControls, viewOf, watchBannerCopy, watchedText, type StoryLiveActions, type StoryLiveInput } from "./storyLiveCore";
import type { EditState, LiveAnswerLike, PresenceEntry, StorySpot } from "../../../../lib/socia/liveCore";

const tick = () => new Promise((r) => setTimeout(r, 0));

/** The tab's live calls, recorded; events can be pushed in by name */
function fakeActions() {
  const log: string[] = [];
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  const answers: { takeover: LiveAnswerLike } = { takeover: { ok: true } };
  const actions: StoryLiveActions = {
    setStory: async (s: StorySpot | null) => {
      log.push(s ? `story:${s.draftId}:${s.mode}` : "story:none");
      return { ok: true, mode: s?.mode };
    },
    sendState: (s: EditState) => void log.push(`state:${s.text}`),
    flushState: () => void log.push("flush"),
    dropState: () => void log.push("drop"),
    on: (event, handler) => {
      const set = handlers.get(event) ?? new Set();
      handlers.set(event, set);
      set.add(handler as (p: unknown) => void);
      return () => void set.delete(handler as (p: unknown) => void);
    },
    requestTakeover: async (id) => {
      log.push(`ask:${id}`);
      return answers.takeover;
    },
    answerTakeover: async (id, requester, accept) => {
      log.push(`answer:${id}:${requester}:${accept}`);
      return { ok: true };
    },
  };
  const emit = (event: string, payload: unknown) => handlers.get(event)?.forEach((h) => h(payload));
  return { actions, log, emit, answers };
}

function harness(start: Partial<StoryLiveInput> = {}) {
  const f = fakeActions();
  const ctl = createStoryLive({ heldByOther: async () => false });
  let input: StoryLiveInput = {
    actions: f.actions,
    draftId: "d1",
    lease: { kind: "mine" },
    connected: true,
    me: "u-me",
    text: "hello",
    selection: () => null,
    version: () => 1,
    onClaimedBy: () => undefined,
    onAccepted: () => undefined,
    onFreed: () => undefined,
    ...start,
  };
  ctl.update(input);
  /** A re-render with new props */
  const render = (patch: Partial<StoryLiveInput>) => {
    input = { ...input, ...patch };
    ctl.update(input);
  };
  return { ctl, f, render, input: () => input };
}

const priyaState = (text: string, correcting?: boolean) => ({ draftId: "d1", text, selStart: 0, selEnd: 0, version: 2, userId: "u-priya", name: "Priya Sharma", color: "#7048E8", at: "now", ...(correcting === undefined ? {} : { correcting }) });

test("N2: during an export, Keep editing closes the take-over popup (only Hand over waits)", async () => {
  const h = harness();
  h.f.emit("takeover.requested", { draftId: "d1", from: { userId: "u-amit", name: "Amit Jain", color: "#0C8599" } });
  assert.equal(h.ctl.getSnapshot().incoming?.name, "Amit Jain", "the popup is open");
  const controls = takeoverDialogControls({ handing: false, handOverBlocked: true });
  assert.deepEqual(controls, { canKeep: true, canHandOver: false }, "export running: Keep works, Hand over waits");
  h.ctl.decline();
  await tick();
  assert.equal(h.ctl.getSnapshot().incoming, null, "the popup closes");
  assert.ok(h.f.log.includes("answer:d1:u-amit:false"), "the asker hears no");
  assert.deepEqual(takeoverDialogControls({ handing: true, handOverBlocked: true }), { canKeep: false, canHandOver: false }, "the hand-over itself can't be stopped");
});

test("N7: leaving edit mode or closing the story never flushes the waiting text; handing over drops it", async () => {
  const h = harness();
  await tick();
  h.f.log.length = 0;
  h.render({ text: "hello there" });
  assert.deepEqual(h.f.log, ["state:hello there"]);
  h.f.log.length = 0;
  h.render({ lease: { kind: "held", name: "Amit Jain" } });
  await tick();
  assert.deepEqual(h.f.log, ["story:d1:watch"], "edit to watch: a join, no flush");
  h.render({ lease: { kind: "mine" } });
  await tick();
  h.f.log.length = 0;
  h.ctl.dropPending();
  assert.deepEqual(h.f.log, ["drop"]);
  h.f.log.length = 0;
  h.ctl.dispose();
  assert.deepEqual(h.f.log, ["story:none"], "closing: a leave, no flush");
});

test("N12: watch mode needs a draft id", () => {
  const snap = createStoryLive({ heldByOther: async () => false }).getSnapshot();
  const held = { kind: "held" as const, name: "Priya Sharma" };
  assert.equal(viewOf(snap, { draftId: null, lease: held, connected: true, entries: [] }).watching, false);
  const h = harness({ lease: held });
  assert.equal(viewOf(h.ctl.getSnapshot(), { draftId: "d1", lease: held, connected: true, entries: [] }).watching, true);
});

test("L2: no Ask to take over while the holder is correcting (from presence, edit.state or the lease)", () => {
  const held = { kind: "held" as const, name: "Priya Sharma" };
  const h = harness({ lease: held });
  const holderEntry: PresenceEntry = { userId: "u-priya", name: "Priya Sharma", initials: "PS", color: "#7048E8", mode: "edit", correcting: true };
  const fromPresence = viewOf(h.ctl.getSnapshot(), { draftId: "d1", lease: held, connected: true, entries: [holderEntry] });
  assert.equal(fromPresence.correcting, true);
  assert.equal(showAskTakeover(true, fromPresence.correcting), false);
  const plain = viewOf(h.ctl.getSnapshot(), { draftId: "d1", lease: held, connected: true, entries: [{ ...holderEntry, correcting: false }] });
  assert.equal(showAskTakeover(true, plain.correcting), true, "an ordinary edit can be asked for");
  h.f.emit("edit.state", priyaState("fixed text", true));
  assert.equal(viewOf(h.ctl.getSnapshot(), { draftId: "d1", lease: held, connected: true, entries: [] }).correcting, true);
  assert.equal(viewOf(createStoryLive({ heldByOther: async () => false }).getSnapshot(), { draftId: "d1", lease: { ...held, fixing: true }, connected: true, entries: [] }).correcting, true);
});

test("L2: a 409 correcting answer ends the ask with a neutral sentence", async () => {
  const h = harness({ lease: { kind: "held", name: "Priya Sharma" } });
  h.f.answers.takeover = { ok: false, error: "correcting", status: 409 };
  h.ctl.askTakeover();
  await tick();
  const ask = h.ctl.getSnapshot().ask;
  assert.equal(ask.state, "failed");
  assert.equal(ask.state === "failed" && ask.message, "Priya is fixing this posted story. You can take it over once they finish.");
});

test("L4: watching a correction shows 'X is fixing this post' and the correction's text, never the old posted text", () => {
  const held = { kind: "held" as const, name: "Priya Sharma", fixing: true };
  const h = harness({ lease: held, text: "the old posted text" });
  const before = viewOf(h.ctl.getSnapshot(), { draftId: "d1", lease: held, connected: true, entries: [] });
  assert.deepEqual(watchedText(before, "the old posted text"), { text: "", from: "waiting" }, "before the first state: empty, not the posted text");
  h.f.emit("edit.snapshot", priyaState("the fixed text", true));
  const after = viewOf(h.ctl.getSnapshot(), { draftId: "d1", lease: held, connected: true, entries: [] });
  assert.deepEqual(watchedText(after, "the old posted text"), { text: "the fixed text", from: "remote" });
  h.f.emit("edit.state", priyaState("[socia:text-too-long]", true));
  const long = viewOf(h.ctl.getSnapshot(), { draftId: "d1", lease: held, connected: true, entries: [] });
  assert.equal(long.remoteLong, true);
  assert.equal(watchedText(long, "the old posted text").text, "", "too long to stream: still never the posted text");
  const copy = watchBannerCopy(true);
  assert.equal(`${copy.before}Priya${copy.after}`, "Priya is fixing this post. You can't type here.");
  // An ordinary edit keeps the old behaviour
  const plainHeld = { kind: "held" as const, name: "Priya Sharma" };
  const p = harness({ lease: plainHeld, text: "saved draft" });
  assert.equal(watchedText(viewOf(p.ctl.getSnapshot(), { draftId: "d1", lease: plainHeld, connected: true, entries: [] }), "saved draft").text, "saved draft");
});

test("a release frees the story for a watcher, and a take-over answer counts only while asking", async () => {
  let freed = 0;
  let accepted = 0;
  const h = harness({ lease: { kind: "held", name: "Priya Sharma" }, onFreed: () => freed++, onAccepted: () => accepted++ });
  h.f.emit("takeover.answered", { draftId: "d1", accept: true, by: { userId: "u-priya", name: "Priya Sharma" } });
  assert.equal(accepted, 0);
  h.ctl.askTakeover();
  h.ctl.askTakeover(); // a second press while asking does nothing
  await tick();
  assert.equal(h.f.log.filter((l) => l.startsWith("ask:")).length, 1);
  h.f.emit("takeover.answered", { draftId: "d1", accept: true, by: { userId: "u-priya", name: "Priya Sharma" } });
  assert.equal(accepted, 1);
  h.f.emit("queue.draft", { type: "draft.released", draftId: "d1" });
  assert.equal(freed, 1);
  assert.equal(h.ctl.getSnapshot().gone, "Priya");
});
