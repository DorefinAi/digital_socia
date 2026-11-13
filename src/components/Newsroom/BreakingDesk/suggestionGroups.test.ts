// Unit checks for suggestionGroups.ts (run by npm test): which group each live suggestion goes in.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { MentionSuggestion } from "../../../lib/socia/types";
import { groupSuggestions, offeredHashtags, offeredMentions, sourceLabel } from "./suggestionGroups";

const handle = (h: string, extra: Partial<MentionSuggestion> = {}): MentionSuggestion => ({ handleId: h, entity: h, handle: h, exact: true, ...extra });
const values = (rows: { value: string }[]) => rows.map((r) => r.value);

test("reporter_prior and reporter_beat items go in the reporter group, in order", () => {
  const rows = offeredMentions(
    [
      handle("@RajGovOfficial", { source: "reporter_prior", reason: "rituraj files RajGov stories 62% of the time (102 posts)", score: 0.62, n: 102 }),
      handle("@KotaPolice", { source: "directory" }),
      handle("@JaipurPolice", { source: "reporter_beat", reason: "rituraj covers Jaipur police" }),
    ],
    [],
  );
  const { normal, reporter } = groupSuggestions(rows);
  assert.deepEqual(values(reporter), ["@RajGovOfficial", "@JaipurPolice"]);
  assert.deepEqual(values(normal), ["@KotaPolice"]);
  assert.equal(reporter[0].reason, "rituraj files RajGov stories 62% of the time (102 posts)");
  assert.equal(sourceLabel(reporter[1].source), "declared beat");
  assert.equal(sourceLabel(reporter[0].source), null);
});

test("an office alias stays a normal suggestion and shows its reason", () => {
  const rows = offeredMentions([handle("@BhajanlalBjp", { entity: "मुख्यमंत्री", source: "office_alias.rajasthan_cm", reason: "CM mentioned without a name" })], []);
  const { normal, reporter } = groupSuggestions(rows);
  assert.deepEqual(values(normal), ["@BhajanlalBjp"]);
  assert.equal(reporter.length, 0);
  assert.equal(normal[0].reason, "CM mentioned without a name");
});

test("a suggestion with no source (older servers) is a normal suggestion with today's reason", () => {
  const rows = offeredMentions([handle("JDAJaipur", { entity: "JDA" })], []);
  const { normal, reporter } = groupSuggestions(rows);
  assert.deepEqual(values(normal), ["@JDAJaipur"]);
  assert.equal(reporter.length, 0);
  assert.equal(normal[0].reason, "Handle for JDA");
  assert.equal("source" in normal[0], false);
});

test("nothing is pre-ticked, and handles already on the draft are not offered again", () => {
  const rows = offeredMentions([handle("@A", { source: "reporter_prior" }), handle("@b"), handle("@B")], ["@a"]);
  assert.deepEqual(values(rows), ["@b"]);
  assert.ok(rows.every((r) => r.checked === false));
});

test("hashtags: only reporter-group objects are offered; bare strings keep today's behaviour", () => {
  const rows = offeredHashtags(
    [
      "#Kota",
      { tag: "#RajGov", source: "reporter_prior", reason: "rituraj files RajGov stories 62% of the time (102 posts)", score: 0.62, n: 102 },
      { tag: "Jaipur", source: "reporter_beat", reason: "declared beat: Jaipur" },
      { tag: "#ACB" },
      { tag: "#Existing", source: "reporter_prior", reason: "x" },
    ],
    ["#existing"],
  );
  assert.deepEqual(values(rows), ["#RajGov", "#Jaipur"]);
  assert.ok(rows.every((r) => r.checked === false));
  assert.equal(groupSuggestions(rows).reporter.length, 2);
  assert.deepEqual(offeredHashtags(undefined, []), []);
});
