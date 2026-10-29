// Unit checks for srt.ts. The repo has no test runner; run with Node 22+ (type stripping) and a resolver that
// accepts extensionless TypeScript imports, e.g.:
//   node --import <register-ts-resolve.mjs> --test src/components/Newsroom/BreakingDesk/video/srt.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { captionsToCues, cuesToCaptions, formatTimestamp, parseSrt, parseTimestamp, toSrt } from "./srt";

test("timestamps round-trip", () => {
  assert.equal(parseTimestamp("00:01:02,500"), 62.5);
  assert.equal(parseTimestamp("01:00:00.040"), 3600.04);
  assert.equal(parseTimestamp("0:0:1,5"), 1.5);
  assert.ok(Number.isNaN(parseTimestamp("nope")));
  assert.equal(formatTimestamp(62.5), "00:01:02,500");
  assert.equal(formatTimestamp(3725.0049), "01:02:05,005");
  assert.equal(formatTimestamp(-3), "00:00:00,000");
});

test("parses a normal file with Hindi, multi-line cues, tags and CRLF", () => {
  const src = "﻿1\r\n00:00:01,000 --> 00:00:03,500\r\nजयपुर मेट्रो फेज 2\r\nको मंजूरी\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,000\r\n<i>Second</i> line\r\n";
  const { cues, skipped } = parseSrt(src);
  assert.equal(skipped, 0);
  assert.equal(cues.length, 2);
  assert.deepEqual(cues[0], { start: 1, end: 3.5, text: "जयपुर मेट्रो फेज 2\nको मंजूरी" });
  assert.equal(cues[1].text, "Second line");
});

test("tolerates missing numbers, dot millis, extra blank lines and broken blocks", () => {
  const src = "\n\n00:00:05.000 --> 00:00:06.000\nNo number\n\n\n\n3\nbroken timing\nText\n\n4\n00:00:01,000 --> 00:00:02,000\nOut of order\n";
  const { cues, skipped } = parseSrt(src);
  assert.equal(skipped, 1);
  assert.deepEqual(cues.map((c) => c.text), ["Out of order", "No number"]);
});

test("drops cues with no text or with end before start", () => {
  const { cues } = parseSrt("1\n00:00:02,000 --> 00:00:01,000\nBackwards\n\n2\n00:00:03,000 --> 00:00:04,000\n\n");
  assert.equal(cues.length, 0);
});

test("toSrt numbers cues and parse(toSrt(x)) is identity", () => {
  const cues = [
    { start: 0, end: 1.25, text: "एक" },
    { start: 2, end: 3, text: "two\nlines" },
  ];
  const out = toSrt(cues);
  assert.ok(out.startsWith("1\n00:00:00,000 --> 00:00:01,250\nएक\n"));
  assert.deepEqual(parseSrt(out).cues, cues);
});

test("cuesToCaptions trims overlaps, applies offset and round-trips", () => {
  const clips = cuesToCaptions(
    [
      { start: 0, end: 3, text: "a" },
      { start: 2, end: 4, text: "b" },
      { start: 4, end: 4.02, text: "too short" },
    ],
    1,
  );
  assert.equal(clips.length, 2);
  assert.equal(clips[0].start, 1);
  assert.equal(clips[0].duration, 2);
  assert.equal(clips[1].start, 3);
  assert.equal(clips[1].type, "caption");
  assert.notEqual(clips[0].id, clips[1].id);
  assert.deepEqual(captionsToCues(clips), [
    { start: 1, end: 3, text: "a" },
    { start: 3, end: 5, text: "b" },
  ]);
});
