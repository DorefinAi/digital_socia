// The X Videos desk's title, tag block and X limit checks.
// Run: node --import ./src/components/Newsroom/BreakingDesk/video/timeline/__checks__/resolve-ts.mjs --test src/features/xvideos/components/xvTitle.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STANDARD_PREFIXES,
  applyLabel,
  applyPrefix,
  assembleTagBlock,
  brandTagFor,
  buildTitle,
  channelLabelsFor,
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
  stripLabel,
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

test("reads the two-part '<City> | Rajasthan News' label", () => {
  const head = "कांग्रेस के सामने जिला प्रमुख चुनने की चुनौती, आधा दर्जन से ज्यादा दावेदार";
  const t = `${head} | Jodhpur | Rajasthan News`;
  assert.equal(labelOf(t), "Jodhpur | Rajasthan News");
  assert.equal(stripLabel(t), head);
  assert.equal(applyLabel(t, "Jodhpur News"), `${head} | Jodhpur News`);
  assert.equal(applyLabel("आग | Jodhpur News", "Jodhpur | Rajasthan News"), "आग | Jodhpur | Rajasthan News");
  assert.equal(labelOf("आग |Alwar|Rajasthan News"), "Alwar | Rajasthan News");
  // A topic segment that is not a channel label is left alone
  const khelo = "Ashok Gehlot ने Budget Files में उठाया खेलों का मामला | Khelo Rajasthan Youth Games | Rajasthan";
  assert.equal(labelOf(khelo), null);
  assert.equal(buildTitle(khelo, null), khelo);
});

test("label chips: <Place> News, <City> | Rajasthan News, Rajasthan News", () => {
  assert.deepEqual(channelLabelsFor("Jodhpur", "rajasthan"), ["Jodhpur News", "Jodhpur | Rajasthan News", "Rajasthan News"]);
  assert.deepEqual(channelLabelsFor("Rajasthan", "rajasthan"), ["Rajasthan News"]);
  // Outside Rajasthan there is no "<City> | Rajasthan News" form
  assert.deepEqual(channelLabelsFor("Bihar", "india"), ["Bihar News", "Rajasthan News"]);
  assert.deepEqual(channelLabelsFor("Jaipur", "rajasthan", "Jaipur News"), ["Jaipur News", "Jaipur | Rajasthan News", "Rajasthan News"]);
});

test("the brand tag follows where the story is from", () => {
  assert.equal(brandTagFor("Rajasthan News"), "#RajasthanWithFirstIndia");
  assert.equal(brandTagFor("Jodhpur | Rajasthan News", "india"), "#RajasthanWithFirstIndia");
  assert.equal(brandTagFor("Jaipur News", "rajasthan"), "#RajasthanWithFirstIndia");
  assert.equal(brandTagFor("India News"), "#FirstIndiaNews");
  // Stories from outside Rajasthan (Haryana, Patna, ISRO) carry #FirstIndiaNews, with a label or without one
  assert.equal(brandTagFor("Haryana News", "india"), "#FirstIndiaNews");
  assert.equal(brandTagFor(null, "india"), "#FirstIndiaNews");
  assert.equal(brandTagFor(null, "rajasthan"), "#RajasthanWithFirstIndia");
  assert.equal(brandTagFor("Jaipur News"), "#RajasthanWithFirstIndia");
  assert.equal(brandTagFor(null), null);
});

test("tag block: brand first, #FINVideo next, each tag once, handles last", () => {
  assert.equal(
    assembleTagBlock(["#Jaipur", "#jaipur", "#FINVideo", "#BhajanlalSharma"], ["@BhajanlalBjp", "@RajGovOfficial"], "#RajasthanWithFirstIndia"),
    "#RajasthanWithFirstIndia #FINVideo #Jaipur #BhajanlalSharma @BhajanlalBjp @RajGovOfficial",
  );
  // A brand tag that disagrees is dropped
  assert.equal(assembleTagBlock(["#RajasthanWithFirstIndia", "#Delhi"], [], "#FirstIndiaNews"), "#FirstIndiaNews #FINVideo #Delhi");
  // #FINVideo even with nothing else
  assert.equal(assembleTagBlock([], [], null), "#FINVideo");
});

test("rebuilds real @1stIndiaNews captions (21 Nov sample)", () => {
  // 2124091448337608704: a Rajasthan story
  const sms = "Jaipur SMS Hospital में पुलिस की बड़ी दबिश, मरीजों को झांसा देने वाले 10 लपके हिरासत में";
  const smsTags = assembleTagBlock(["#Jaipur", "#RajasthanNews", "#SMSHospital", "#RajasthanPolice", "#PoliceAction"], ["@jaipur_police"], brandTagFor("Jaipur News", "rajasthan"));
  assert.equal(
    composeTweet(buildTitle(sms, "Jaipur News"), smsTags),
    `${sms} | Jaipur News\n\n#RajasthanWithFirstIndia #FINVideo #Jaipur #RajasthanNews #SMSHospital #RajasthanPolice #PoliceAction @jaipur_police`,
  );
  // 2124052696626028544: a story from outside Rajasthan
  const stf = "बड़ोपट्टी टोल के पास बदमाश ने STF पर चलाई गोली, बाल-बाल बचा जवान";
  const stfTags = assembleTagBlock(["#HaryanaNews", "#BaropattiToll", "#BaropattiTollPlaza", "#STF", "#HaryanaSTF"], ["@police_haryana"], brandTagFor("Haryana News", "india"));
  assert.equal(composeTweet(buildTitle(stf, "Haryana News"), stfTags), `${stf} | Haryana News\n\n#FirstIndiaNews #FINVideo #HaryanaNews #BaropattiToll #BaropattiTollPlaza #STF #HaryanaSTF @police_haryana`);
  // 2124065338094710784: a topic prefix before the headline
  const blast = "Bansur Cylinder Blast: SMS Hospital पहुंचे 10 झुलसे मरीज, 2 महिलाओं की हालत गंभीर | Jaipur News";
  const pre = [...STANDARD_PREFIXES, "Bansur Cylinder Blast:"];
  assert.equal(prefixOf(blast, pre), "Bansur Cylinder Blast:");
  assert.equal(labelOf(blast), "Jaipur News");
  assert.equal(applyPrefix(blast, "VIDEO:", pre), "VIDEO: SMS Hospital पहुंचे 10 झुलसे मरीज, 2 महिलाओं की हालत गंभीर | Jaipur News");
});

test("cleans typed tags", () => {
  assert.equal(cleanTag("##jaipur fire", "#"), "#jaipurfire");
  assert.equal(cleanTag("@jaipur_police", "@"), "@jaipur_police");
  assert.equal(cleanTag("किसान", "#"), "#किसान");
  assert.equal(cleanTag("  # ", "#"), "");
});

test("composes the post and fits it in 280", () => {
  const block = assembleTagBlock(["#Jaipur"], [], "#RajasthanWithFirstIndia");
  assert.equal(composeTweet("आग | Jaipur News", block), "आग | Jaipur News\n\n#RajasthanWithFirstIndia #FINVideo #Jaipur");
  const long = `${"बहुत लंबी खबर ".repeat(30).trim()} | Jaipur News`;
  const fitted = fitTitle(long, block);
  assert.ok(tweetLength(composeTweet(fitted, block)) <= 280);
  assert.ok(fitted.endsWith("… | Jaipur News"));
  assert.equal(fitTitle("आग | Jaipur News", block), "आग | Jaipur News");
  // The two-part label is kept whole
  const two = fitTitle(`${"बहुत लंबी खबर ".repeat(30).trim()} | Jodhpur | Rajasthan News`, block);
  assert.ok(two.endsWith("… | Jodhpur | Rajasthan News"));
  assert.ok(tweetLength(composeTweet(two, block)) <= 280);
});

test("checks the clip against X's limits (10 min for now)", () => {
  // 2124052121398185984, Om Birla at Banasthali: 11:01, the one clip in the sample over the limit
  const clip = { fileName: "2124052121398185984.mp4", duration: 661.42, size: 95.6 * 1024 * 1024 };
  const issues = checkClip(clip);
  assert.deepEqual(issues.map((i) => i.code), ["too_long"]);
  assert.equal(issueLabel(issues[0]), "11:01, over X's 10:00, trim");
  // A trim to 9:00 clears it
  assert.deepEqual(checkClip(clip, { start: 30, end: 570 }), []);
  // Clips past 2:20 went up (6:20 here), so they pass
  assert.deepEqual(checkClip({ fileName: "a.mp4", duration: 380.35, size: 53.6 * 1024 * 1024 }), []);
  assert.deepEqual(checkClip({ fileName: "a.mp4", duration: 600, size: 10 }), []);
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
