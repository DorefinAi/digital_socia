// Unit checks for the header search's page matching and story row words (run by npm test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SEARCH_PAGES, normaliseSearchText, searchPages } from "./pageSearch";
import { BLOCKED_NO_ACCESS, BLOCKED_NO_DRAFT, BLOCKED_TOO_OLD, STORY_LINK_DAYS, matchNote, storyAge, storyBlocked, storyStatus } from "./storySearchFormat";

const ids = (q: string) => searchPages(SEARCH_PAGES, q).map((p) => p.id);

test("pages match their English names case-insensitively", () => {
  assert.deepEqual(ids("DASH"), ["dashboard"]);
  assert.ok(ids("post").includes("post-studio"));
  assert.ok(ids("instagram").includes("post-studio"));
  assert.ok(ids("trends").includes("web-scraper"));
  assert.ok(ids("roles").includes("access"));
});

test("pages match their Hindi names, with or without the nukta", () => {
  assert.deepEqual(ids("डैशबोर्ड"), ["dashboard"]);
  assert.deepEqual(ids("अस्वीकृत"), ["rejected"]);
  assert.deepEqual(ids("प्रोफ़ाइल"), ["profile"]);
  assert.deepEqual(ids("प्रोफाइल"), ["profile"]);
  assert.deepEqual(ids("एक्सेस"), ["access"]);
});

test("decomposed input is NFC-normalised before matching", () => {
  // क + ़ typed as two code points vs the precomposed क़ (U+0958)
  assert.equal(normaliseSearchText("क़"), normaliseSearchText("क़"));
  assert.equal(normaliseSearchText("  Post   Studio "), "post studio");
});

test("a name starting with the query ranks above one that only contains it", () => {
  const pages = [
    { label: "Reports", keywords: ["repost"] },
    { label: "Post Studio", keywords: [] },
  ];
  assert.deepEqual(searchPages(pages, "post").map((p) => p.label), ["Post Studio", "Reports"]);
  assert.equal(searchPages(pages, "").length, 2);
  assert.equal(searchPages(pages, "nothing").length, 0);
});

test("story ages read like the desk", () => {
  const now = Date.parse("2026-11-13T12:00:00+05:30");
  assert.equal(storyAge("2026-11-13T11:59:40+05:30", now), "just now");
  assert.equal(storyAge("2026-11-13T11:48:00+05:30", now), "12 min ago");
  assert.equal(storyAge("2026-11-13T10:00:00+05:30", now), "2 h ago");
  assert.equal(storyAge("2026-11-12T22:00:00+05:30", now), "Yesterday");
  assert.equal(storyAge("2026-11-02T09:00:00+05:30", now), "2 Nov");
  assert.equal(storyAge("2025-11-12T09:00:00+05:30", now), "12 Nov 2025");
  assert.equal(storyAge("not a date", now), "");
});

test("statuses get desk words; translated and phonetic matches say why", () => {
  assert.deepEqual(storyStatus("published"), { label: "Posted", tone: "done" });
  assert.equal(storyStatus("render_failed").tone, "problem");
  assert.equal(storyStatus("needs_check").label, "Needs check");
  assert.equal(matchNote("translated"), "matched in Hindi");
  assert.equal(matchNote("phonetic"), "matched by sound");
  assert.equal(matchNote("text"), null);
});

test("statuses and match kinds don't resolve through Object.prototype", () => {
  assert.deepEqual(storyStatus("constructor"), { label: "Constructor", tone: "neutral" });
  assert.equal(storyStatus("__proto__").tone, "neutral");
  assert.equal(matchNote("toString" as never), null);
});

test("a story that can't be opened says why: too old for a link, no draft yet, or no access", () => {
  const now = Date.parse("2026-11-13T12:00:00+05:30");
  const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
  assert.equal(STORY_LINK_DAYS, 30);
  assert.equal(storyBlocked({ linkSlug: null, receivedAt: daysAgo(31) }, true, now), BLOCKED_TOO_OLD);
  assert.equal(storyBlocked({ linkSlug: null, receivedAt: daysAgo(29) }, true, now), BLOCKED_NO_DRAFT);
  assert.equal(storyBlocked({ linkSlug: null, receivedAt: "not a date" }, true, now), BLOCKED_NO_DRAFT);
  assert.equal(storyBlocked({ linkSlug: "x", receivedAt: daysAgo(1) }, false, now), BLOCKED_NO_ACCESS);
  assert.equal(storyBlocked({ linkSlug: "x", receivedAt: daysAgo(1) }, true, now), null);
  assert.equal(BLOCKED_TOO_OLD.long, "Older than 30 days. Find it in the Posted list.");
});

test("every draft status has a desk label", () => {
  const all = ["rendering", "render_failed", "ready", "claimed", "queued", "publishing", "published", "failed", "rejected", "recalled"] as const;
  // The Record<DraftStatus, …> in storySearchFormat makes a missing one a type error; here, no two read alike
  const labels = all.map((s) => storyStatus(s).label);
  assert.ok(labels.every(Boolean));
  assert.equal(new Set(labels).size, all.length);
});
