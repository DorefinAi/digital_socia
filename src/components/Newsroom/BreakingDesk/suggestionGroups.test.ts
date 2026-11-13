// Unit checks for suggestionGroups.ts (run by npm test): which group each live suggestion goes in.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { HashtagSuggestion, MentionSuggestion } from "../../../lib/socia/types";
import { groupSuggestions, offerableHashtag, offeredHashtags, offeredMentions, sourceLabel } from "./suggestionGroups";

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

test("hashtags: every suggestion is offered; reporter ones grouped, the rest normal with their reason", () => {
  const rows = offeredHashtags(
    [
      "#Kota",
      { tag: "#RajGov", source: "reporter_prior", reason: "rituraj files RajGov stories 62% of the time (102 posts)", score: 0.62, n: 102 },
      { tag: "Jaipur", source: "reporter_policy", reason: "Video desk tags #Jaipur on rituraj's clips" },
      { tag: "Ajmer", source: "district.inferred", reason: "Inferred district: Ajmer" },
      { tag: "Udaipur", source: "reporter_beat", reason: "declared beat: Udaipur" },
      { tag: "#ACB" },
      "Bikaner",
      { tag: "#Existing", source: "reporter_prior", reason: "x" },
      "#existing",
    ],
    ["#existing"],
  );
  assert.deepEqual(values(rows), ["#Kota", "#RajGov", "#Jaipur", "#Ajmer", "#Udaipur", "#ACB", "#Bikaner"]);
  const { normal, reporter } = groupSuggestions(rows);
  assert.deepEqual(values(normal), ["#Kota", "#Jaipur", "#Ajmer", "#ACB", "#Bikaner"]);
  assert.deepEqual(values(reporter), ["#RajGov", "#Udaipur"]);
  const by = (v: string) => rows.find((r) => r.value === v)!;
  assert.equal(by("#Jaipur").reason, "Video desk tags #Jaipur on rituraj's clips");
  assert.equal(by("#Jaipur").source, "reporter_policy");
  assert.equal(by("#Ajmer").reason, "Inferred district: Ajmer");
  assert.equal(by("#Kota").reason, "Suggested");
  assert.equal("source" in by("#Kota"), false);
  assert.equal(by("#ACB").reason, "Suggested");
  assert.equal(by("#RajGov").reason, "rituraj files RajGov stories 62% of the time (102 posts)");
  assert.deepEqual(offeredHashtags(undefined, []), []);
});

test("hashtags: nothing is pre-ticked, dupes collapse, and tags on the draft are not offered again", () => {
  const rows = offeredHashtags(
    ["#Kota", "#kota", { tag: "KOTA", source: "reporter_policy", reason: "p" }, { tag: "#Jaipur", reason: "x" }, " #Tonk ", "#Tonk"],
    ["Jaipur", " #tonk "],
  );
  assert.deepEqual(values(rows), ["#Kota"]);
  assert.ok(rows.every((r) => r.checked === false));
  // A reporter duplicate of a plain one takes its place, so its group and reason show
  const mixed = offeredHashtags(["#Kota", { tag: "#kota", source: "reporter_prior", reason: "rituraj tags Kota 40%" }], []);
  assert.deepEqual(values(mixed), ["#kota"]);
  assert.equal(groupSuggestions(mixed).reporter.length, 1);
  assert.ok(mixed.every((r) => r.checked === false));
});

test("hashtags: bare strings go through the same normaliser and are dropped when it would rewrite them", () => {
  assert.deepEqual(values(offeredHashtags(["Jaipur Police", "#Raj.Gov", "#", "  ##Kota ", "", { tag: "Tonk Police", source: "district.inferred" }], [])), ["#Kota"]);
});

test("hashtags: server tags go through the editor's normaliser; anything it would have to rewrite is dropped", () => {
  assert.equal(offerableHashtag("RajGov"), "#RajGov");
  assert.equal(offerableHashtag("  ##RajGov "), "#RajGov");
  assert.equal(offerableHashtag("#जयपुर"), "#जयपुर");
  assert.equal(offerableHashtag("Jaipur Police"), "");
  assert.equal(offerableHashtag("#Raj.Gov"), "");
  assert.equal(offerableHashtag("#Kota,"), "");
  assert.equal(offerableHashtag("#"), "");
  assert.equal(offerableHashtag(undefined), "");
  const rows = offeredHashtags(
    [
      { tag: "Jaipur Police", source: "reporter_prior", reason: "x" },
      { tag: "#Raj.Gov", source: "reporter_beat", reason: "y" },
      { tag: " #Kota ", source: "reporter_prior", reason: "z" },
    ],
    [],
  );
  assert.deepEqual(values(rows), ["#Kota"]);
});

test("a duplicate with reporter evidence wins over a plain one, in the first one's place", () => {
  const rows = offeredMentions(
    [
      handle("@KotaPolice", { source: "directory", reason: "Directory: Kota police" }),
      handle("@JDAJaipur"),
      handle("@kotapolice", { source: "reporter_prior", reason: "rituraj tags Kota police 40% of the time (30 posts)" }),
      handle("@KOTAPOLICE", { source: "directory" }),
    ],
    [],
  );
  assert.deepEqual(values(rows), ["@kotapolice", "@JDAJaipur"]);
  assert.equal(rows[0].source, "reporter_prior");
  assert.equal(rows[0].reason, "rituraj tags Kota police 40% of the time (30 posts)");
  assert.deepEqual(values(groupSuggestions(rows).reporter), ["@kotapolice"]);
});

test("between two reporter suggestions, or two plain ones, the first is kept", () => {
  const rows = offeredMentions(
    [
      handle("@A", { source: "reporter_beat", reason: "beat" }),
      handle("@a", { source: "reporter_prior", reason: "prior" }),
      handle("@B", { reason: "first" }),
      handle("@b", { reason: "second" }),
    ],
    [],
  );
  assert.deepEqual(values(rows), ["@A", "@B"]);
  assert.equal(rows[0].reason, "beat");
  assert.equal(rows[1].reason, "first");
});

test("mention handles are trimmed, and blank ones dropped", () => {
  const rows = offeredMentions([handle("  @RajGovOfficial  "), handle("   "), handle(""), handle("@"), handle(" JDAJaipur")], [" @jdajaipur "]);
  assert.deepEqual(values(rows), ["@RajGovOfficial"]);
});

// D-a: one Unicode form. "ऩ" (U+0929) is न + nukta composed; a feed can send either spelling.
const NFC_HI = "#ऩागौर"; // composed
const NFD_HI = "#ऩागौर"; // न + ़ written apart
const NFC_LAT = "#Cáceres";
const NFD_LAT = "#Cáceres"; // á as a + combining accent
test("hashtags: an offered value is always NFC, and the same tag in NFC and NFD shows once", () => {
  assert.notEqual(NFC_HI, NFD_HI);
  assert.equal(NFD_HI.normalize("NFC"), NFC_HI);
  assert.equal(offerableHashtag(NFD_HI), NFC_HI);
  assert.equal(offerableHashtag(NFC_HI), NFC_HI);
  assert.equal(offerableHashtag(NFD_LAT), NFC_LAT);
  const rows = offeredHashtags([NFD_HI, { tag: NFC_HI, source: "reporter_prior", reason: "r" }, NFD_LAT, NFC_LAT], []);
  assert.deepEqual(values(rows), [NFC_HI, NFC_LAT]);
  assert.ok(rows.every((r) => r.value === r.value.normalize("NFC")));
  assert.equal(rows[0].source, "reporter_prior");
  // A tag already on the draft in the other form is not offered again
  assert.deepEqual(values(offeredHashtags([NFD_HI], [NFC_HI])), []);
  assert.deepEqual(values(offeredHashtags([NFC_HI], [NFD_HI])), []);
});

test("mentions: an offered handle is NFC, and NFC/NFD spellings of one handle show once", () => {
  const rows = offeredMentions([handle(NFD_LAT.replace("#", "@")), handle(NFC_LAT.replace("#", "@"))], []);
  assert.deepEqual(values(rows), ["@Cáceres"]);
});

// D-b: one malformed suggestion hides only itself, or only its own reason line
test("hashtags: a malformed suggestion is skipped on its own; the others and their reasons still show", () => {
  const bad = [
    null,
    42,
    ["#Array"],
    { tag: 7, source: "reporter_prior", reason: "x" },
    { tag: { nested: true } },
    { source: "reporter_beat", reason: "no tag" },
  ] as unknown as (string | HashtagSuggestion)[];
  const rows = offeredHashtags([{ tag: "#Kota", source: "reporter_prior", reason: "rituraj tags Kota" }, ...bad, { tag: "#Tonk", reason: "Inferred district: Tonk" }], []);
  assert.deepEqual(values(rows), ["#Kota", "#Tonk"]);
  assert.equal(rows[0].reason, "rituraj tags Kota");
  assert.equal(rows[1].reason, "Inferred district: Tonk");
});

test("hashtags: a reason that isn't text hides only that suggestion's reason line", () => {
  const rows = offeredHashtags(
    [
      { tag: "#Kota", source: "reporter_prior", reason: { text: "oops" } },
      { tag: "#Tonk", reason: 12 },
      { tag: "#Ajmer", source: 5, reason: "Inferred district: Ajmer" },
      { tag: "#Bundi", source: "reporter_beat", reason: null },
      { tag: "#Sikar", reason: "  " },
    ] as unknown as HashtagSuggestion[],
    [],
  );
  assert.deepEqual(values(rows), ["#Kota", "#Tonk", "#Ajmer", "#Bundi", "#Sikar"]);
  const by = (v: string) => rows.find((r) => r.value === v)!;
  assert.equal(by("#Kota").reason, "");
  assert.equal(by("#Kota").source, "reporter_prior");
  assert.equal(by("#Tonk").reason, "");
  assert.equal(by("#Ajmer").reason, "Inferred district: Ajmer");
  assert.equal("source" in by("#Ajmer"), false);
  // Missing (null) or blank reasons still get the usual fallback
  assert.equal(by("#Bundi").reason, "Reporter usually tags this");
  assert.equal(by("#Sikar").reason, "Suggested");
  const { normal, reporter } = groupSuggestions(rows);
  assert.deepEqual(values(reporter), ["#Kota", "#Bundi"]);
  assert.deepEqual(values(normal), ["#Tonk", "#Ajmer", "#Sikar"]);
});

test("mentions: a malformed suggestion is skipped on its own; a bad reason hides only its reason line", () => {
  const rows = offeredMentions(
    [
      handle("@KotaPolice", { source: "reporter_prior", reason: "rituraj tags Kota police" }),
      null,
      "@JustAString",
      { entity: "No handle", exact: true },
      { handle: 99, entity: "Number" },
      handle("@JDAJaipur", { reason: { bad: true } as unknown as string }),
      handle("@RajGovOfficial", { entity: { x: 1 } as unknown as string, reason: undefined }),
      handle("@ACB", { source: ["reporter_prior"] as unknown as string }),
    ] as unknown as MentionSuggestion[],
    [],
  );
  assert.deepEqual(values(rows), ["@KotaPolice", "@JDAJaipur", "@RajGovOfficial", "@ACB"]);
  assert.equal(rows[0].reason, "rituraj tags Kota police");
  assert.equal(rows[1].reason, "");
  assert.equal(rows[2].reason, "");
  assert.equal(rows[3].reason, "Handle for @ACB");
  assert.equal("source" in rows[3], false);
  assert.deepEqual(values(groupSuggestions(rows).reporter), ["@KotaPolice"]);
});

test("missing lists, and non-text tags already on the draft, don't break the suggestions", () => {
  assert.deepEqual(offeredMentions(undefined, undefined), []);
  assert.deepEqual(offeredHashtags(undefined, undefined), []);
  const onDraft = [null, 3, "#Kota", { tag: "#Tonk" }] as unknown as string[];
  assert.deepEqual(values(offeredHashtags(["#Kota", "#Tonk"], onDraft)), ["#Tonk"]);
  assert.deepEqual(values(offeredMentions([handle("@A"), handle("@B")], ["@a", null] as unknown as string[])), ["@B"]);
  const grouped = groupSuggestions([null, { source: "reporter_prior" }, undefined, { source: 4 }] as unknown as { source?: string | null }[]);
  assert.equal(grouped.reporter.length, 1);
  assert.equal(grouped.normal.length, 1);
});
