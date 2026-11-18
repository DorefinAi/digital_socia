// Unit checks for listSearch.ts (run by npm test): the list search without body text, and the server-search offer.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { FtpNewsItem } from "../../../types/newsroom";
import type { QueueItem } from "../../../lib/socia/types";
import { offerServerSearch, rowsByLinkSlug, storyMatchesSearch } from "./listSearch";

const row = (live: Partial<QueueItem>, over: Partial<FtpNewsItem> = {}) =>
  ({ id: live.id ?? "x", headline: "Bus accident near Ajmer", area: "Ajmer", ftpPath: "ajmer-bus", shortText: "", body: "", live, ...over }) as unknown as FtpNewsItem;

test("matches headline, district, town, file path, slug, link name and category", () => {
  const n = row({ town: "किशनगढ़", sourcePath: "/ftp/NDR/AJM_bus.txt", linkSlug: "ajmer-bus-1030", category: "Crime" });
  for (const q of ["accident", "ajmer", "किशनगढ़", "ndr/ajm", "ajmer-bus", "bus-1030", "crime"]) assert.ok(storyMatchesSearch(n, q), q);
  assert.ok(storyMatchesSearch(n, ""));
  assert.ok(!storyMatchesSearch(n, "jodhpur"));
});

test("never matches post text or body, even when a row still carries them", () => {
  const n = row({ postText: "#Ajmer: injured taken to JLN hospital", bodyText: "JLN hospital" }, { shortText: "JLN hospital", body: "JLN hospital" });
  assert.ok(!storyMatchesSearch(n, "jln"));
});

test("works on a demo story without a live row", () => {
  const demo = { id: "m", headline: "Rain in Kota", area: "Kota", ftpPath: "kota/rain" } as unknown as FtpNewsItem;
  assert.ok(storyMatchesSearch(demo, "kota/"));
  assert.ok(!storyMatchesSearch(demo, "ajmer"));
});

test("offers the server search from 3 characters, or from 2 when the list found nothing", () => {
  assert.equal(offerServerSearch("", 0), false);
  assert.equal(offerServerSearch("a", 0), false);
  assert.equal(offerServerSearch("ab", 5), false);
  assert.equal(offerServerSearch("ab", 0), true);
  assert.equal(offerServerSearch("abc", 5), true);
  assert.equal(offerServerSearch("  ab  ", 0), true);
  assert.equal(offerServerSearch("हाद", 4), true);
});

test("indexes rows by link name, first row wins, rows without one left out", () => {
  const a = row({ id: "a", linkSlug: "s1" });
  const b = row({ id: "b", linkSlug: "s1" });
  const c = row({ id: "c" });
  const map = rowsByLinkSlug([a, b, c]);
  assert.equal(map.size, 1);
  assert.equal(map.get("s1"), a);
});
