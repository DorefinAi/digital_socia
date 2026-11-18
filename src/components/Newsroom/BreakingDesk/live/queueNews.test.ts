// Unit checks for queueNews.ts (run by npm test): slim inbox rows (fields=list) turn into desk stories safely.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { QueueItem } from "../../../../lib/socia/types";
import { queueRowToNews } from "./queueNews";

const link = (url: string | null | undefined) => (url ? `L:${url}` : "");
const slim = {
  id: "d1",
  status: "ready",
  version: 3,
  slug: "jaipur-hadsa",
  headline: "हादसे में दो घायल",
  receivedAt: "2026-11-18T05:00:00.000Z",
  claim: null,
  rejectReason: null,
  flags: { lowConfidence: false, needsReview: false },
  district: "Jaipur",
  town: "सांगानेर",
  linkSlug: "jaipur-hadse-me-do-ghayal-1030",
} as unknown as QueueItem;

test("a slim row (no bodyText, storyBody, postText, cardUrl) becomes a story with empty text", () => {
  const n = queueRowToNews(slim, link);
  assert.equal(n.shortText, "");
  assert.equal(n.body, "");
  assert.equal(n.headline, slim.headline);
  assert.equal(n.area, "Jaipur");
  assert.equal(n.ftpPath, "jaipur-hadsa");
  assert.equal(n.media.length, 1);
  assert.equal(n.media[0].url, "");
  assert.equal(n.live, slim);
});

test("a full row keeps its text, story body and card link", () => {
  const full = { ...slim, bodyText: "#Jaipur #सांगानेर: हादसा\nपहला बिंदु", storyBody: "पहला\nदूसरा", cardUrl: "/dev-files/c.png", postText: "x" } as QueueItem;
  const n = queueRowToNews(full, link);
  assert.equal(n.shortText, full.bodyText);
  assert.equal(n.body, "पहला, दूसरा");
  assert.equal(n.media[0].url, "L:/dev-files/c.png");
});

test("a row with no district gives an empty area", () => {
  assert.equal(queueRowToNews({ ...slim, district: null } as QueueItem, link).area, "");
});
