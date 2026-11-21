// The X Videos desk's title, tag block and X limit checks.
// Run: node --import ./src/components/Newsroom/BreakingDesk/video/timeline/__checks__/resolve-ts.mjs --test src/components/Newsroom/XVideos/xvTitle.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STANDARD_PREFIXES,
  applyLabel,
  applyPrefix,
  assembleTagBlock,
  brandTagFor,
  buildTitle,
  checkClip,
  cleanTag,
  composeTweet,
  fitTitle,
  fmtClock,
  fmtDuration,
  issueLabel,
  labelOf,
  lineAt,
  prefixOf,
  tweetLength,
} from "./xvTitle";

const PREFIXES = [...STANDARD_PREFIXES, "Jaipur Fire:"];

test("builds '<headline> | <Place> News'", () => {
  assert.equal(buildTitle("अजमेर रोड पर भीषण आग", "Jaipur News"), "अजमेर रोड पर भीषण आग | Jaipur News");
  assert.equal(buildTitle("  किसानों  के लिए पैकेज ", "Rajasthan News"), "किसानों के लिए पैकेज | Rajasthan News");
  assert.equal(buildTitle("अजमेर रोड पर भीषण आग", null), "अजमेर रोड पर भीषण आग");
});

test("adds the prefix and never doubles a label or prefix", () => {
  assert.equal(buildTitle("अजमेर रोड पर भीषण आग | Rajasthan News", "Jaipur News", "Jaipur Fire:", PREFIXES), "Jaipur Fire: अजमेर रोड पर भीषण आग | Jaipur News");
  assert.equal(applyPrefix("VIDEO: आग | Jaipur News", "Viral Video:", PREFIXES), "Viral Video: आग | Jaipur News");
  assert.equal(applyPrefix("Viral Video: आग", null, PREFIXES), "आग");
  assert.equal(prefixOf("viral video: आग", PREFIXES), "Viral Video:");
  assert.equal(applyLabel("आग | Jaipur News", "Rajasthan News"), "आग | Rajasthan News");
  assert.equal(applyLabel("आग | Jaipur News", null), "आग");
  assert.equal(labelOf("CM का ऐलान | Rajasthan News"), "Rajasthan News");
  assert.equal(labelOf("CM का ऐलान"), null);
});

test("the channel label sets the brand tag", () => {
  assert.equal(brandTagFor("Rajasthan News"), "#RajasthanWithFirstIndia");
  assert.equal(brandTagFor("Jaipur News"), "#RajasthanWithFirstIndia");
  assert.equal(brandTagFor("India News"), "#FirstIndiaNews");
  assert.equal(brandTagFor(null), null);
});

test("tag block: #FINVideo first, brand next, each tag once, handles last", () => {
  assert.equal(
    assembleTagBlock(["#Jaipur", "#jaipur", "#FINVideo", "#BhajanlalSharma"], ["@BhajanlalBjp", "@RajGovOfficial"], "#RajasthanWithFirstIndia"),
    "#FINVideo #RajasthanWithFirstIndia #Jaipur #BhajanlalSharma @BhajanlalBjp @RajGovOfficial",
  );
  // A brand tag that disagrees with the label is dropped
  assert.equal(assembleTagBlock(["#RajasthanWithFirstIndia", "#Delhi"], [], "#FirstIndiaNews"), "#FINVideo #FirstIndiaNews #Delhi");
  // #FINVideo even with nothing else
  assert.equal(assembleTagBlock([], [], null), "#FINVideo");
});

test("cleans typed tags", () => {
  assert.equal(cleanTag("##jaipur fire", "#"), "#jaipurfire");
  assert.equal(cleanTag("@jaipur_police", "@"), "@jaipur_police");
  assert.equal(cleanTag("किसान", "#"), "#किसान");
  assert.equal(cleanTag("  # ", "#"), "");
});

test("composes the post and fits it in 280", () => {
  const block = assembleTagBlock(["#Jaipur"], [], "#RajasthanWithFirstIndia");
  assert.equal(composeTweet("आग | Jaipur News", block), "आग | Jaipur News\n\n#FINVideo #RajasthanWithFirstIndia #Jaipur");
  const long = `${"बहुत लंबी खबर ".repeat(30).trim()} | Jaipur News`;
  const fitted = fitTitle(long, block);
  assert.ok(tweetLength(composeTweet(fitted, block)) <= 280);
  assert.ok(fitted.endsWith("… | Jaipur News"));
  assert.equal(fitTitle("आग | Jaipur News", block), "आग | Jaipur News");
});

test("checks the clip against X's limits", () => {
  const clip = { fileName: "LIVE_JPR_VIDHANSABHA_1410.mp4", duration: 222, size: 96 * 1024 * 1024 };
  const issues = checkClip(clip);
  assert.deepEqual(issues.map((i) => i.code), ["too_long"]);
  assert.equal(issueLabel(issues[0]), "3:42, over X's 2:20, trim");
  // A trim to 2:00 clears it
  assert.deepEqual(checkClip(clip, { start: 30, end: 150 }), []);
  assert.deepEqual(checkClip({ fileName: "a.mp4", duration: 140, size: 10 }), []);
  assert.deepEqual(checkClip({ fileName: "a.avi", duration: 30, size: 600 * 1024 * 1024 }).map((i) => i.code), ["too_big", "format"]);
});

test("formats times and finds the line playing", () => {
  assert.equal(fmtDuration(138), "2:18");
  assert.equal(fmtDuration(38), "0:38");
  assert.equal(fmtDuration(3725), "1:02:05");
  assert.equal(fmtClock(42.7), "00:42");
  const lines = [{ at: 4 }, { at: 19 }, { at: 42 }];
  assert.equal(lineAt(lines, 0), -1);
  assert.equal(lineAt(lines, 20), 1);
  assert.equal(lineAt(lines, 99), 2);
});
