// Unit checks for "Fit to 280" and the frontend copy of the composer's line 2 (crispLine.ts, b8). Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { BREAKING_BODY_FLOOR, BREAKING_BODY_MAX, BREAKING_BODY_MIN, breakingDots, crispPoints, fitPostBody, plainHeadline } from "./crispLine";
import { countChars } from "./socialText";

const xLen = (s: string) => countChars(s, "X (Twitter)");
const points = [
  "मंडी की एडवाइजरी में भी सियासी सवाल",
  "किसान पहले जाएं या मौसम देखें",
  "फसल खाली जमीन पर नहीं रखने का फरमान",
  "किसानों की मजबूरी पर किसी का ध्यान नहीं",
];
const headline = "#Chittorgarh #निम्बाहेड़ा: काश, पहले भी जारी हो जाती ऐसी एडवाइजरी !";
const dots = breakingDots(plainHeadline(headline));
const line2 = crispPoints(points, dots);
const composed = `${headline}\n\n${line2}`;
const longDesk = "किसानों ने आज मंडी में जोरदार प्रदर्शन किया और प्रशासन के खिलाफ नारेबाजी करते हुए अपनी मांगों को लेकर ज्ञापन सौंपा";
const fit = (body: string, budget = 250, composerLine2: string | null = line2) =>
  fitPostBody({ liveBreaking: true, platform: "X (Twitter)", body, composerLine2, original: composed, storyPoints: points, budget });

// ─── The shared cases: the backend writes them; this copy must match every one (b8 decisions #11, review B7) ──

const SHARED = new URL("../../../../../backend/packages/core/test/fixtures/crisp-cases.json", import.meta.url);
const shared = existsSync(SHARED)
  ? (JSON.parse(readFileSync(SHARED, "utf8")) as {
      cases: { points: string[]; dots: string; max: number; expected: string }[];
      fit: { note: string; body: string; composerLine2: string | null; storyPoints: string[]; budget: number; expected: string }[];
    })
  : null;
const noBackend = shared ? false : `the backend repo is not beside this one (${SHARED.pathname}), so the shared cases cannot be read`;

test("matches the backend on every shared line 2 case", { skip: noBackend }, () => {
  assert.equal(shared!.cases.length, 200);
  for (const c of shared!.cases) assert.equal(crispPoints(c.points, c.dots, c.max), c.expected);
});

test("gives every shared Fit case, each within its budget", { skip: noBackend }, () => {
  for (const f of shared!.fit) {
    const out = fitPostBody({ liveBreaking: true, platform: "X (Twitter)", body: f.body, composerLine2: f.composerLine2, original: "", storyPoints: f.storyPoints, budget: f.budget });
    assert.equal(out, f.expected, f.note);
    assert.ok(xLen(out) <= f.budget, `${f.note}: ${xLen(out)} > ${f.budget}`);
  }
});

// ─── crispPoints ─────────────────────────────────────────────────────────────────────────────────────────

test("cuts long points to 100–130 with the dots counted inside, on a linking word", () => {
  assert.equal(crispPoints(points, "...."), "मंडी की एडवाइजरी में भी सियासी सवाल, किसान पहले जाएं या मौसम देखें, फसल खाली जमीन पर नहीं रखने का फरमान, किसानों की....");
  for (const d of ["...", "...."]) {
    const body = crispPoints(points, d);
    assert.ok(xLen(body) >= BREAKING_BODY_MIN && xLen(body) <= BREAKING_BODY_MAX, `${xLen(body)}`);
  }
});

test("never takes a cut under 40 when one of 40 or more fits (review B2)", () => {
  const raid = ["पुलिस ने अवैध शराब के खिलाफ अभियान चलाकर", "तस्करों के ठिकानों पर दबिश देकर शराब बरामद की गई और दो आरोपी पकड़े"];
  assert.equal(crispPoints(raid, "...", 45), "पुलिस ने अवैध शराब के खिलाफ अभियान चलाकर...");
  for (let max = 45; max <= 69; max++) {
    const out = crispPoints(raid, "...", max);
    assert.ok(xLen(out) >= BREAKING_BODY_FLOOR && xLen(out) <= max, `${max}: ${out}`);
  }
});

test("drops a line 2 under 40 characters, and cuts one huge word by letters", () => {
  assert.equal(crispPoints(["पुलिस ने आरोपी को पकड़ा", "जांच जारी"], "...."), "");
  assert.equal(crispPoints(["अ".repeat(200)], "..."), `${"अ".repeat(BREAKING_BODY_MAX - 3)}...`);
});

test("splits words and counts emoji like the backend where the browser has no Intl.Segmenter (review B5)", () => {
  const intl = Intl as { Segmenter?: unknown };
  const saved = intl.Segmenter;
  const family = `${"👨‍👩‍👧 ".repeat(30)}अंत`;
  const withSegmenter = { cut: crispPoints(points, "..."), family: xLen(family) };
  intl.Segmenter = undefined;
  try {
    assert.equal(xLen("👨‍👩‍👧"), 2);
    assert.equal(xLen(family), withSegmenter.family);
    assert.equal(xLen("क्षेत्र"), 7);
    assert.equal(crispPoints(points, "..."), withSegmenter.cut);
  } finally {
    intl.Segmenter = saved;
  }
});

test("counts an emoji sequence as 2, as the backend does", () => {
  assert.equal(xLen("👨‍👩‍👧"), 2);
  const family = `${"👨‍👩‍👧 ".repeat(30)}अंत`;
  assert.equal(xLen(family), 93);
  assert.equal(crispPoints([family], "..."), family);
});

test("seeds the dots with the plain headline, as the composer does", () => {
  assert.equal(plainHeadline("#Jaipur #डग:  बिजली गुल"), "बिजली गुल");
  assert.equal(plainHeadline("#Chittorgarh #आकोला में पैंथर"), "में पैंथर");
  assert.equal(breakingDots(plainHeadline("#Jaipur: कोटा में हादसा")), breakingDots(plainHeadline("कोटा में हादसा")));
});

// ─── Fit to 280 ──────────────────────────────────────────────────────────────────────────────────────────

test("Fit on the untouched draft gives the same draft back", () => {
  assert.equal(fit(composed), composed);
});

test("Fit measures the post as it goes out: two paragraphs and Windows line breaks never pass the budget (review B1)", () => {
  const two = `${headline}\n\n${longDesk}\n\n${longDesk}`;
  const crlf = `${headline}\r\n\r\n${longDesk}\r\n${longDesk}`;
  for (const body of [two, crlf]) {
    for (const budget of [180, 200, 230, 260]) {
      const out = fit(body, budget);
      assert.ok(xLen(out) <= budget, `${budget}: ${xLen(out)}`);
      assert.ok(!out.includes("\r"));
    }
  }
  // Exactly at the budget: nothing to do; one over: trimmed
  const exact = `${headline}\n\n${longDesk}`;
  assert.equal(fit(exact, xLen(exact)), exact);
  assert.ok(xLen(fit(exact, xLen(exact) - 1)) <= xLen(exact) - 1);
});

test("Fit keeps the desk's own line 2 after a save and reopen (review B4)", () => {
  const own = `${headline}\n\nकिसानों ने मंडी में किया जोरदार प्रदर्शन!`;
  assert.equal(fit(own), own);
  // A draft from before the composer's line 2 was stored: its line 2 counts as the desk's
  assert.equal(fit(composed, 250, null), composed);
});

test("Fit keeps a line 2 the desk shortened, and does not bring back one they deleted", () => {
  const trimmed = `${headline}\n\nमंडी की एडवाइजरी में भी सियासी सवाल, किसान पहले जाएं...`;
  assert.equal(fit(trimmed), trimmed);
  assert.equal(fit(headline), headline);
});

test("Fit never cuts a line of tags and handles (review B6)", () => {
  const out = fit(`${headline}\n\n#Extra @x\n\n${longDesk} ${longDesk}`, 200);
  assert.ok(out.includes("\n\n#Extra @x\n\n"));
  assert.ok(xLen(out) <= 200);
});

test("Fit rebuilds the composer's own line 2 when the post is over the limit, and drops it with no room", () => {
  for (const budget of [200, 170]) {
    const out = fit(composed, budget);
    assert.ok(xLen(out) <= budget && out.startsWith(headline));
  }
  assert.equal(fit(composed, xLen(headline) + 30), headline);
});

test("Fit keeps each tag line where it was (re-review R3)", () => {
  const out = fit(`${headline}\n\n${longDesk} ${longDesk}\n\n#Extra @x`, 200);
  assert.ok(out.endsWith("\n\n#Extra @x"), out);
  assert.ok(xLen(out) <= 200);
});

test("Fit never empties the post, even for a headline that is one huge word (re-review R4)", () => {
  const out = fit("क".repeat(300), 250);
  assert.ok(out.length > 0 && xLen(out) <= 250, `${xLen(out)}`);
});

test("counts a subdivision flag as one emoji without a segmenter too (re-review R5)", () => {
  const intl = Intl as { Segmenter?: unknown };
  const saved = intl.Segmenter;
  const flag = "🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F} x";
  const withSegmenter = xLen(flag);
  intl.Segmenter = undefined;
  try {
    assert.equal(xLen(flag), withSegmenter);
  } finally {
    intl.Segmenter = saved;
  }
});

test("Fit keeps the old shortening for stories that are not live breaking drafts (review B3)", () => {
  const trends = "Rajasthan weather update: rain likely in 10 districts\n\nSource: https://example.com/weather";
  assert.equal(
    fitPostBody({ liveBreaking: false, platform: "X (Twitter)", body: trends, composerLine2: null, original: trends, storyPoints: [], budget: 250 }),
    trends.replace(/\s+/g, " "),
  );
});
