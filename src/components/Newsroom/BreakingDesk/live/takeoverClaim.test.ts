// Checks (npm test) for the asker's claim after a hand-over (takeoverClaim.ts, wired by PostEditor.tsx): one claim
// at a time, one timer, and the fallback window (N8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { TAKEOVER_CLAIM_MS, TAKEOVER_FALLBACK_MS, TAKEOVER_RETRY_MS, createTakeoverClaim } from "./takeoverClaim";
import type { Clock } from "../../../../lib/socia/liveCore";

const tick = () => new Promise((r) => setTimeout(r, 0));

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
  return { clock, advance, pending: () => timers.size };
}

function setup() {
  const c = fakeClock();
  const claims: { answer: (v: string | null) => void }[] = [];
  const took: string[] = [];
  let gaveUp = 0;
  let busy = false;
  const seq = createTakeoverClaim<string>({
    claim: () => new Promise((answer) => claims.push({ answer })),
    currentDraft: () => "d1",
    busy: () => busy,
    onTook: (d) => took.push(d),
    onGaveUp: () => gaveUp++,
    clock: c.clock,
  });
  return { ...c, seq, claims, took, gaveUp: () => gaveUp, setBusy: (b: boolean) => void (busy = b) };
}

test("N8: one claim runs at a time; a release mid-claim asks for one more right after it", async () => {
  const s = setup();
  s.seq.start("d1");
  s.advance(TAKEOVER_FALLBACK_MS);
  assert.equal(s.claims.length, 1, "the fallback started a claim");
  s.seq.freed(); // the release arrives while that claim is out
  s.seq.freed();
  await tick();
  assert.equal(s.claims.length, 1, "no second claim while one runs");
  s.claims[0].answer(null);
  await tick();
  s.advance(0);
  await tick();
  assert.equal(s.claims.length, 2, "one more try right after");
  s.claims[1].answer("story");
  await tick();
  assert.deepEqual(s.took, ["story"]);
  assert.equal(s.seq.active(), false);
  assert.equal(s.pending(), 0, "no timer left behind");
});

test("N8: a new start clears the existing timer, so only one fallback fires", async () => {
  const s = setup();
  s.seq.start("d1");
  s.advance(500);
  s.seq.start("d1");
  assert.equal(s.pending(), 1, "the old timer is gone");
  s.advance(TAKEOVER_FALLBACK_MS);
  await tick();
  assert.equal(s.claims.length, 1);
});

test("N8: a claim waits behind a running call, retries every second, and gives up after the window", async () => {
  const s = setup();
  s.setBusy(true);
  s.seq.start("d1");
  s.advance(TAKEOVER_FALLBACK_MS);
  assert.equal(s.claims.length, 0, "waits its turn");
  s.setBusy(false);
  s.advance(250);
  assert.equal(s.claims.length, 1);
  for (let i = 0; s.claims.length < 40 && s.seq.active(); i++) {
    s.claims[s.claims.length - 1].answer(null);
    await tick();
    s.advance(TAKEOVER_RETRY_MS);
    await tick();
  }
  assert.equal(s.gaveUp(), 1);
  assert.ok(s.claims.length <= Math.ceil(TAKEOVER_CLAIM_MS / TAKEOVER_RETRY_MS) + 1);
  assert.equal(s.pending(), 0);
});
