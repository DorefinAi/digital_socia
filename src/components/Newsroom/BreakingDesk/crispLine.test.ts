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
const composed = `${headline}\n\n${crispPoints(points, dots)}`;
const live = (body: string, budget = 250, original = composed) =>
  fitPostBody({ liveBreaking: true, platform: "X (Twitter)", body, original, storyPoints: points, budget });

// ─── The shared cases: the backend writes them, this copy must match every one (b8 decisions #11) ───────────

const SHARED = new URL("../../../../../backend/packages/core/test/fixtures/crisp-cases.json", import.meta.url);

test("matches the backend on all 200 shared cases", () => {
  assert.ok(existsSync(SHARED), `the backend's shared cases are missing at ${SHARED.pathname}; the frontend copy cannot be checked`);
  const { cases } = JSON.parse(readFileSync(SHARED, "utf8")) as { cases: { points: string[]; dots: string; max: number; expected: string }[] };
  assert.equal(cases.length, 200);
  for (const c of cases) assert.equal(crispPoints(c.points, c.dots, c.max), c.expected);
});

// ─── crispPoints ─────────────────────────────────────────────────────────────────────────────────────────

test("cuts long points to 100–130 with the dots counted inside, on a linking word", () => {
  assert.equal(crispPoints(points, "...."), "मंडी की एडवाइजरी में भी सियासी सवाल, किसान पहले जाएं या मौसम देखें, फसल खाली जमीन पर नहीं रखने का फरमान, किसानों की....");
  for (const d of ["...", "...."]) {
    const body = crispPoints(points, d);
    assert.ok(xLen(body) >= BREAKING_BODY_MIN && xLen(body) <= BREAKING_BODY_MAX, `${xLen(body)}`);
  }
});

test("drops a line 2 under 40 characters, and cuts one huge word by letters", () => {
  assert.equal(crispPoints(["पुलिस ने आरोपी को पकड़ा", "जांच जारी"], "...."), "");
  assert.equal(crispPoints(["अ".repeat(200)], "..."), `${"अ".repeat(BREAKING_BODY_MAX - 3)}...`);
});

test("splits on spaces where the browser has no Intl.Segmenter", () => {
  const intl = Intl as { Segmenter?: unknown };
  const saved = intl.Segmenter;
  intl.Segmenter = undefined;
  try {
    const body = crispPoints(points, "...");
    assert.ok(body.endsWith("...") && xLen(body) <= BREAKING_BODY_MAX && xLen(body) >= BREAKING_BODY_FLOOR, body);
    assert.equal(xLen("क्षेत्र"), 7);
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
  // The same headline gives the same dots whatever tags line 1 carries
  assert.equal(breakingDots(plainHeadline("#Jaipur: कोटा में हादसा")), breakingDots(plainHeadline("कोटा में हादसा")));
});

// ─── Fit to 280 ──────────────────────────────────────────────────────────────────────────────────────────

test("Fit on the untouched draft gives the same draft back", () => {
  assert.equal(live(composed), composed);
});

test("Fit rebuilds the composer's line 2 and trims it only when the post is over 280", () => {
  const over = `${headline}\n\n${points.join(", ")}`;
  const fit = live(over, 250, `${headline}\n\n${points.join(", ")}`);
  assert.equal(fit, composed);
  for (const budget of [200, 170]) {
    const tight = live(composed, budget);
    assert.ok(xLen(tight) <= budget, `${budget}: ${xLen(tight)}`);
    assert.ok(tight.startsWith(headline));
  }
  // So little room that line 2 would be a stub: it is dropped
  assert.equal(live(composed, xLen(headline) + 30), headline);
});

test("Fit reads a single line break as headline then line 2 (the story is never repeated)", () => {
  const single = `${headline}\n${points.join(", ")}`;
  const fit = live(single, 250, `${headline}\n\n${points.join(", ")}`);
  assert.equal(fit, composed);
  assert.equal(fit.split("मंडी की एडवाइजरी").length, 2);
});

test("Fit keeps a line 2 the desk shortened, and does not bring back one they deleted", () => {
  const trimmed = `${headline}\n\nमंडी की एडवाइजरी में भी सियासी सवाल, किसान पहले जाएं...`;
  assert.equal(live(trimmed), trimmed);
  assert.equal(live(headline), headline);
});

test("Fit leaves the desk's own line 2 exactly as typed when it fits, ending and all", () => {
  const typed = `${headline}\n\nकिसानों ने मंडी में किया जोरदार प्रदर्शन!`;
  assert.equal(live(typed), typed);
});

test("Fit cuts the desk's own words, not the story's, when their line 2 is over the limit", () => {
  const long = "किसानों ने आज मंडी में जोरदार प्रदर्शन किया और प्रशासन के खिलाफ नारेबाजी करते हुए अपनी मांगों को लेकर ज्ञापन सौंपा, अधिकारियों ने आश्वासन दिया और मामले की जांच का भरोसा दिलाया";
  const fit = live(`${headline}\n\n${long}`, 200);
  const line2 = fit.split("\n\n")[1]!;
  assert.ok(line2.startsWith("किसानों ने आज मंडी में"));
  assert.ok(line2.endsWith(dots) && xLen(fit) <= 200);
});

test("Fit keeps the old shortening for anything that is not a live breaking draft (a trends story)", () => {
  const trends = "Rajasthan weather update: rain likely in 10 districts\n\nSource: https://example.com/weather";
  assert.equal(fitPostBody({ liveBreaking: false, platform: "X (Twitter)", body: trends, original: trends, storyPoints: [], budget: 250 }), trends.replace(/\s+/g, " "));
});
