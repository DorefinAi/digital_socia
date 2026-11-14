// Unit checks (npm test) for moving between stories: the outbox never merges a state across a join or a leave
// (N1), moving drops the throttle's unsent text (N7), and a story under correction refuses an ask (L2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { askReducer, askRefusal, createOutbox, createStateSender, moveStory, type Clock, type EditState, type LiveAnswerLike } from "./liveCore";

const tick = () => new Promise((r) => setTimeout(r, 0));
const st = (draftId: string, text: string): EditState => ({ draftId, text, selStart: text.length, selEnd: text.length, version: 1 });

function transport() {
  const calls: { what: string; answer: (a: LiveAnswerLike) => void }[] = [];
  const call = (what: string) => new Promise<LiveAnswerLike>((answer) => calls.push({ what, answer }));
  return { calls, call };
}

/** Answers every call as it comes, until nothing more arrives */
async function drain(t: ReturnType<typeof transport>) {
  for (let i = 0; i < 20; i++) {
    await tick();
    const open = t.calls.filter((c) => !(c as { done?: boolean }).done);
    if (!open.length) break;
    for (const c of open) {
      (c as { done?: boolean }).done = true;
      c.answer({ ok: true });
    }
  }
}

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

test("N1: state queued behind a leave or join: switching A to B mid-send, A's watchers get A's last word and B's text goes after B's join", async () => {
  const t = transport();
  const box = createOutbox({ sendState: (s) => t.call(`state:${s.draftId}:${s.text}`) });
  box.state(st("A", "a1"));
  await tick();
  assert.deepEqual(t.calls.map((c) => c.what), ["state:A:a1"], "a1 is in flight");
  box.state(st("A", "a2"));
  void box.control(() => t.call("leave:A"), { kind: "leave", draftId: "A" });
  void box.control(() => t.call("join:B"), { kind: "join", draftId: "B" });
  box.state(st("B", "b1"));
  box.state(st("B", "b2"));
  await drain(t);
  assert.deepEqual(
    t.calls.map((c) => c.what),
    ["state:A:a1", "state:A:a2", "leave:A", "join:B", "state:B:b2"],
    "B's text never replaced A's queued state, and B's newest state goes once, after its join",
  );
});

test("N1: a state still merges with a queued one of the same story when no join or leave is between them", async () => {
  const t = transport();
  const box = createOutbox({ sendState: (s) => t.call(`state:${s.text}`) });
  box.state(st("A", "1"));
  box.state(st("A", "2"));
  void box.control(() => t.call("ask")); // a take-over ask is not a join or a leave
  box.state(st("A", "3"));
  await drain(t);
  assert.deepEqual(t.calls.map((c) => c.what), ["state:1", "state:3", "ask"]);
});

test("N1: a refused state of a story the tab has left is not sent again", async () => {
  const { clock, advance } = fakeClock();
  const t = transport();
  const box = createOutbox({ sendState: (s) => t.call(`state:${s.draftId}`), clock });
  box.state(st("A", "x"));
  await tick();
  void box.control(() => t.call("leave:A"), { kind: "leave", draftId: "A" });
  t.calls[0].answer({ ok: false, error: "rate_limited", status: 429 });
  await drain(t);
  advance(5000);
  await drain(t);
  assert.deepEqual(t.calls.map((c) => c.what), ["state:A", "leave:A"]);
});

test("N7: moving off a story (edit to watch, another story, or none) drops the throttle's unsent text", async () => {
  const { clock, advance } = fakeClock();
  const t = transport();
  const box = createOutbox({ sendState: (s) => t.call(`state:${s.text}`), clock });
  const sender = createStateSender((s) => box.state(s), clock);
  const at = { sender, outbox: box, clientId: "c1", join: (_: string, d: string, m: string) => t.call(`join:${d}:${m}`), leave: (_: string, d: string) => t.call(`leave:${d}`) };
  sender.push(st("A", "typed"));
  sender.push(st("A", "typed more")); // waits in the throttle
  void moveStory({ draftId: "A", mode: "edit" }, { draftId: "A", mode: "watch" }, at);
  advance(2000);
  await drain(t);
  assert.deepEqual(t.calls.map((c) => c.what), ["state:typed", "join:A:watch"], "leaving edit mode: the waiting text never goes");
  sender.push(st("A", "again"));
  sender.push(st("A", "again 2"));
  void moveStory({ draftId: "A", mode: "edit" }, null, at);
  advance(2000);
  await drain(t);
  assert.ok(!t.calls.some((c) => c.what === "state:again 2"), "closing the story: dropped");
  assert.equal(t.calls[t.calls.length - 1].what, "leave:A");
});

test("L2: an ask on a story under correction (409 correcting) ends with a neutral sentence", () => {
  const asking = askReducer({ state: "idle" }, { type: "ask", name: "Priya" });
  const s = askReducer(asking, { type: "refused", error: "correcting", status: 409 });
  assert.equal(s.state, "failed");
  assert.equal(s.state === "failed" && s.message, "Priya is fixing this posted story. You can take it over once they finish.");
  assert.equal(askRefusal("Priya", "correcting", 409), "Priya is fixing this posted story. You can take it over once they finish.");
});
