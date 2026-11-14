// Unit checks for cardImage.ts (pure parts) and stepTimer.ts. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardExt, fitCard, isJpeg } from "./cardImage";
import { stepTimer } from "./stepTimer";

const blob = (size: number) => new Blob([new Uint8Array(size)], { type: "image/jpeg" });
const never = () => false;

test("fitCard takes the first size that fits", async () => {
  const tried: number[] = [];
  const out = await fitCard(async (s) => (tried.push(s), blob(s === 1 ? 900 : 400)), 500, never);
  assert.deepEqual(tried, [1, 0.8]);
  assert.ok("blob" in out && out.scale === 0.8 && out.blob.size === 400);
});

test("fitCard: full size at once when small enough", async () => {
  const out = await fitCard(async () => blob(10), 500, never);
  assert.ok("blob" in out && out.scale === 1);
});

test("fitCard: too big at every size", async () => {
  assert.deepEqual(await fitCard(async () => blob(900), 500, never), { error: "too_big" });
});

test("fitCard: a tainted canvas stops at once", async () => {
  let calls = 0;
  const taint = new Error("tainted");
  const out = await fitCard(async () => (calls++, Promise.reject(taint)), 500, (e) => e === taint);
  assert.deepEqual(out, { error: "tainted" });
  assert.equal(calls, 1);
});

test("fitCard: a failed encode may work smaller", async () => {
  const out = await fitCard(async (s) => (s === 1 ? null : blob(100)), 500, never);
  assert.ok("blob" in out && out.scale === 0.8);
  assert.deepEqual(await fitCard(async () => null, 500, never), { error: "failed" });
});

test("cardExt follows the content type", () => {
  assert.equal(cardExt("image/jpeg"), "jpg");
  assert.equal(cardExt("image/jpg"), "jpg");
  assert.equal(cardExt("image/png"), "png");
  assert.equal(cardExt(""), "png");
  assert.equal(cardExt(undefined), "png");
});

test("isJpeg reads the SOI marker", () => {
  assert.equal(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), false);
  assert.equal(isJpeg(new Uint8Array([0xff, 0xd8])), false);
});

test("stepTimer logs each step's own time and the total", async () => {
  let t = 100;
  const lines: string[] = [];
  const timer = stepTimer("[copy-posted]", () => t, (tag, m) => lines.push(`${tag} ${m}`));
  t = 150;
  assert.equal(timer.lap("save text"), 50);
  t = 400;
  assert.equal(timer.lap("card"), 250);
  await timer.time("mark posted", Promise.resolve(1));
  await assert.rejects(timer.time("download", Promise.reject(new Error("x"))));
  t = 410;
  assert.equal(timer.done(), 310);
  assert.deepEqual(lines, [
    "[copy-posted] save text: 50 ms (at 50 ms)",
    "[copy-posted] card: 250 ms (at 300 ms)",
    "[copy-posted] mark posted: 0 ms (at 300 ms)",
    "[copy-posted] download (failed): 0 ms (at 300 ms)",
    "[copy-posted] done: total 310 ms",
  ]);
});
