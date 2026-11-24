// The card heading's place (b9, SOCIA_HEADING_GAPS_AND_PLAN 23 Nov 2026): one decision with the X post's line 1
// (headingPlace), never said twice, and swapped (not stacked) when it changes. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardHeadlineText, cardKeepsPlaceWord, deskSavedHeading, draftCardHeadline, headingCardPlace, queueCardHeadline } from "./cardWords";
import type { HeadingPlace } from "@/lib/socia/types";

const hp = (placement: HeadingPlace["placement"], card: string | null, extra: Partial<HeadingPlace> = {}): HeadingPlace => ({
  tags: [], district: null, town: null, source: "desk", placement, card, ...extra,
});
const draft = (headline: string, district: string | null, town: string | null, headingPlace?: HeadingPlace) => ({
  bodyText: "", story: { district, town, headline }, handlePick: headingPlace ? { headingPlace } : null, headline,
});

test("C2: the card leads with line 1's place, not one of its own (a reporter's #Jaipur on a Bengaluru story)", () => {
  // The story's stored district is the text's guess; line 1 went out "#Jaipur: बेंगलुरु में…" by Nirmal's desk rule
  const d = draft("बेंगलुरु में S-VYASA का दीक्षांत समारोह", "Kota", null, hp("lead", "Jaipur", { source: "reporter_rule", district: "Jaipur" }));
  assert.equal(draftCardHeadline(d.headline, d), "Jaipur: बेंगलुरु में S-VYASA का दीक्षांत समारोह");
});

test("the card follows the backend's place for inline and trailing cities (as the backend sends them: card set)", () => {
  // Inline town: the word is dropped from the card unless a postposition follows (here "में": kept, nothing in front)
  const inline = draft("नैनवां में मां कंकाली की सवारी", "Bundi", "नैनवां", hp("inline", "नैनवां", { town: "नैनवां" }));
  assert.equal(draftCardHeadline(inline.headline, inline), "नैनवां में मां कंकाली की सवारी");
  const inline2 = draft("लाखेरी पंचायत समिति में मतदान", "Bundi", "लाखेरी", hp("inline", "लाखेरी", { town: "लाखेरी" }));
  assert.equal(draftCardHeadline(inline2.headline, inline2), "लाखेरी: पंचायत समिति में मतदान");
  // District in the tag line: same rule
  const trailing = draft("टोंक में अवैध खनन पर कार्रवाई", "Tonk", null, hp("trailing", "Tonk"));
  assert.equal(draftCardHeadline(trailing.headline, trailing), "टोंक में अवैध खनन पर कार्रवाई");
  // The head office in the tag line: the card leads with it (D1)
  const fallback = draft("सरकार ने जारी किए नए दिशा-निर्देश", null, null, hp("trailing", "Jaipur", { source: "fallback" }));
  assert.equal(draftCardHeadline(fallback.headline, fallback), "Jaipur: सरकार ने जारी किए नए दिशा-निर्देश");
});

test("a lead town on line 1 is the card's place in Hindi; a lead district its English name", () => {
  assert.equal(draftCardHeadline("मां कंकाली की सवारी", draft("मां कंकाली की सवारी", "Bundi", "नैनवां", hp("lead", "नैनवां"))), "नैनवां: मां कंकाली की सवारी");
  assert.equal(draftCardHeadline("हाईवे पर हादसा", draft("हाईवे पर हादसा", "Sawai Madhopur", null, hp("lead", "Sawai Madhopur"))), "Sawai Madhopur: हाईवे पर हादसा");
});

test("a draft from before b9, or whose city is the desk's own tag, keeps the old way (district and town)", () => {
  assert.equal(headingCardPlace(undefined), undefined);
  assert.equal(headingCardPlace(hp("copy", null)), undefined);
  // No city on the post: no place on the card (24 Nov 2026)
  assert.equal(headingCardPlace(hp("none", null)), null);
  assert.equal(draftCardHeadline("हाईवे पर हादसा", draft("हाईवे पर हादसा", "Jodhpur", null)), "Jodhpur: हाईवे पर हादसा");
  assert.equal(draftCardHeadline("हाईवे पर हादसा", draft("हाईवे पर हादसा", "Jodhpur", null, hp("copy", null))), "Jodhpur: हाईवे पर हादसा");
});

test("queue thumbnails use the same place", () => {
  const item = { headline: "बेंगलुरु में दीक्षांत समारोह", bodyText: "", district: "Kota", town: null, headingPlace: hp("lead", "Jaipur") };
  assert.equal(queueCardHeadline(item), "Jaipur: बेंगलुरु में दीक्षांत समारोह");
  assert.equal(queueCardHeadline({ ...item, headingPlace: null }), "Kota: बेंगलुरु में दीक्षांत समारोह");
});

test("D1: the card always leads with its place; a heading opening with that place loses the word, not the prefix", () => {
  // The desk's own cards, 15–22 Nov
  assert.equal(cardHeadlineText("उदयपुर घूमने आई थाईलैंड की यू-ट्यूबर के साथ अभद्रता", "Udaipur"), "Udaipur: घूमने आई थाईलैंड की यू-ट्यूबर के साथ अभद्रता");
  assert.equal(cardHeadlineText("बूंदी महोत्सव 2026-27 से 29 नवंबर तक", "Bundi"), "Bundi: महोत्सव 2026-27 से 29 नवंबर तक");
  assert.equal(cardHeadlineText("लाखेरी पंचायत समिति के सभी ग्राम पंचायत में मतदान", "Bundi", "लाखेरी"), "लाखेरी: पंचायत समिति के सभी ग्राम पंचायत में मतदान");
  // Spelling-tolerant: "बून्दी" is Bundi; "नैनवा" is नैनवां; "बड़ी सादड़ी" is बड़ीसादड़ी
  assert.equal(cardHeadlineText("बून्दी महोत्सव का आगाज", "Bundi"), "Bundi: महोत्सव का आगाज");
  assert.equal(cardHeadlineText("नैनवा पंचायत समिति में मतदान", "Bundi", "नैनवां"), "नैनवां: पंचायत समिति में मतदान");
  assert.equal(cardHeadlineText("बड़ी सादड़ी उपखंड में हादसा", "Chittorgarh", "बड़ीसादड़ी"), "बड़ीसादड़ी: उपखंड में हादसा");
  // A place later in the heading is not dropped and does not stop the prefix (C1 is gone: the desk wrote "आंधी: पंचायत समिति आंधी…")
  assert.equal(cardHeadlineText("पंचायत समिति आंधी से सरपंचो का तीसरा रूझान", "Jaipur", "आंधी"), "आंधी: पंचायत समिति आंधी से सरपंचो का तीसरा रूझान");
  assert.equal(cardHeadlineText("राजधानी जयपुर में बारिश", "Jaipur"), "Jaipur: राजधानी जयपुर में बारिश");
  // The composer's place leads even when the city is only in the tag line (fallback, inferred)
  assert.equal(cardHeadlineText("वाह रे सिस्टम !", null, null, "Jaipur"), "Jaipur: वाह रे सिस्टम !");
  assert.equal(cardHeadlineText("अशोक गहलोत का आज जोधपुर दौरा", "Jodhpur", null, "Jodhpur"), "Jodhpur: अशोक गहलोत का आज जोधपुर दौरा");
});

test("D1 guard: a postposition would lead after the dropped word, so the word stays and no place goes in front", () => {
  for (const [h, d] of [["बूंदी के देई थाना क्षेत्र में हादसा", "Bundi"], ["कोटा में नए कोर्ट भवन का शिलान्यास", "Kota"], ["टोंक से बड़ी खबर", "Tonk"], ["जयपुर को मिली सौगात", "Jaipur"], ["अजमेर पर संकट", "Ajmer"]] as const) {
    assert.equal(cardHeadlineText(h, d), h);
  }
  assert.equal(cardKeepsPlaceWord("के देई थाना"), true);
  assert.equal(cardKeepsPlaceWord("केकड़ी में"), false);
  // A saved guarded heading reopens unchanged
  assert.equal(cardHeadlineText(cardHeadlineText("बूंदी के देई थाना", "Bundi"), "Bundi"), "बूंदी के देई थाना");
  // And a saved D1 heading too
  const once = cardHeadlineText("उदयपुर घूमने आई", "Udaipur");
  assert.equal(cardHeadlineText(once, "Udaipur"), once);
});

test("C5: a card heading typed over and saved gets its place swapped, never stacked, when the place changes", () => {
  const typed = "Jaipur: सड़क हादसे में दो की मौत, पुलिस ने शुरू की जांच";
  assert.equal(cardHeadlineText(typed, "Ajmer"), "Ajmer: सड़क हादसे में दो की मौत, पुलिस ने शुरू की जांच");
  assert.equal(cardHeadlineText(typed, "Kota", null, "Kota"), "Kota: सड़क हादसे में दो की मौत, पुलिस ने शुरू की जांच");
  // A saved district lead becomes the town lead once the story has a town; the town lead itself stays as it is
  assert.equal(cardHeadlineText("Chittorgarh: सड़क हादसा", "Chittorgarh", "निम्बाहेड़ा"), "निम्बाहेड़ा: सड़क हादसा");
  assert.equal(cardHeadlineText("निम्बाहेड़ा: सड़क हादसा", "Chittorgarh", "निम्बाहेड़ा"), "निम्बाहेड़ा: सड़क हादसा");
  // C3: another Hindi town is a known place now (lists built from the backend's places file), so its lead is swapped too
  assert.equal(cardHeadlineText("बेगूं: सड़क हादसा", "Chittorgarh", "निम्बाहेड़ा"), "निम्बाहेड़ा: सड़क हादसा");
  // A town that is an everyday word is not a known place: "आंधी: …" the desk wrote stays its own words
  assert.equal(cardHeadlineText("बाप: बेटे पर हमला", "Phalodi"), "बाप: बेटे पर हमला");
  // Applied twice it is the same (reopening a saved card)
  const once = cardHeadlineText(typed, "Ajmer");
  assert.equal(cardHeadlineText(once, "Ajmer"), once);
});

test("R3: a place word in a compound or route stays, and nothing goes in front; old drafts too", () => {
  // New draft (the composer's place)
  assert.equal(cardHeadlineText("जयपुर-दिल्ली हाईवे पर हादसा", "Jaipur", null, "Jaipur"), "जयपुर-दिल्ली हाईवे पर हादसा");
  assert.equal(cardHeadlineText("जयपुर – दिल्ली हाईवे पर हादसा", "Jaipur", null, "Jaipur"), "जयपुर – दिल्ली हाईवे पर हादसा");
  // Old draft (no headingPlace: district and town)
  assert.equal(cardHeadlineText("जयपुर-दिल्ली हाईवे पर हादसा", "Jaipur"), "जयपुर-दिल्ली हाईवे पर हादसा");
  assert.equal(cardHeadlineText("बेगूं-चित्तौड़गढ़ मार्ग पर हादसा", "Chittorgarh", "बेगूं"), "बेगूं-चित्तौड़गढ़ मार्ग पर हादसा");
  const old = draft("जयपुर-दिल्ली हाईवे पर हादसा", "Jaipur", null);
  assert.equal(draftCardHeadline(old.headline, old), "जयपुर-दिल्ली हाईवे पर हादसा");
});

test("R4: a desk lead that is an everyday-word town, in any spelling, stays the desk's own words", () => {
  assert.equal(cardHeadlineText("#आंधी: तेज हवा से भारी नुकसान", "Jaipur"), "आंधी: तेज हवा से भारी नुकसान");
  assert.equal(cardHeadlineText("आंधी: तेज हवा से भारी नुकसान", "Jaipur"), "आंधी: तेज हवा से भारी नुकसान");
  assert.equal(cardHeadlineText("आन्धी: तेज हवा से भारी नुकसान", "Jaipur"), "आन्धी: तेज हवा से भारी नुकसान");
});

test("R5: the card follows line 1 when it leads with the composer's place before the desk's run", () => {
  // line 1 "#Jaipur: #BJP: नई घोषणा की" (rituraj's desk rule)
  assert.equal(cardHeadlineText("#BJP: नई घोषणा की", null, null, "Jaipur"), "Jaipur: BJP: नई घोषणा की");
  // Reopened, it stays the same
  assert.equal(cardHeadlineText("Jaipur: BJP: नई घोषणा की", null, null, "Jaipur"), "Jaipur: BJP: नई घोषणा की");
  // An old draft, or the desk's own run with no composer place, keeps the run as its lead
  assert.equal(cardHeadlineText("#BJP: नई घोषणा की", "Jaipur"), "BJP: नई घोषणा की");
});

test("R8: a national place on the card keeps its spaces, old drafts included", () => {
  assert.equal(cardHeadlineText("सरकार का बड़ा फैसला", "UttarPradesh"), "Uttar Pradesh: सरकार का बड़ा फैसला");
  assert.equal(cardHeadlineText("सरकार का बड़ा फैसला", null, null, "Uttar Pradesh"), "Uttar Pradesh: सरकार का बड़ा फैसला");
  // A saved "UttarPradesh:" lead is swapped, not stacked
  assert.equal(cardHeadlineText("UttarPradesh: सरकार का बड़ा फैसला", "UttarPradesh"), "Uttar Pradesh: सरकार का बड़ा फैसला");
});

test("Q3: a heading the desk saved stays exactly as saved; only Socia's own heading is rewritten", () => {
  const story = { district: "Jaipur", town: null, headline: "जयपुर पुलिस की बड़ी कार्रवाई" };
  // Never saved: card_headline is the story's headline, so Socia writes the card (D1)
  assert.equal(draftCardHeadline(story.headline, { bodyText: "", story }), "Jaipur: पुलिस की बड़ी कार्रवाई");
  // The desk typed its own: kept exactly, spaces and all
  for (const typed of ["जयपुर पुलिस की बड़ी कार्रवाई !", "Jaipur: जयपुर पुलिस की बड़ी कार्रवाई", "बड़ी कार्रवाई"]) {
    assert.equal(draftCardHeadline(typed, { bodyText: "", story, handlePick: { headingPlace: hp("lead", "Jaipur") } }), typed);
  }
  assert.equal(deskSavedHeading("बड़ी कार्रवाई", story.headline), true);
  assert.equal(deskSavedHeading(story.headline, story.headline), false);
  assert.equal(deskSavedHeading("बड़ी कार्रवाई", undefined), false);
});

test("Q4: the guard keeps the place word before तक, द्वारा, और, एवं, व, तथा, सहित, समेत, संग, भी", () => {
  for (const w of ["तक", "द्वारा", "और", "एवं", "व", "तथा", "सहित", "समेत", "संग", "भी"]) {
    const h = `बूंदी ${w} आगे की खबर`;
    assert.equal(cardHeadlineText(h, "Bundi"), h, w);
  }
  // A word that only starts like one is not guarded ("वन विभाग")
  assert.equal(cardHeadlineText("बूंदी वन विभाग की कार्रवाई", "Bundi"), "Bundi: वन विभाग की कार्रवाई");
});

test("24 Nov 2026: a story with no city gets no place on the card, even when the story has a district of its own", () => {
  const d = draft("दिल्लीः केंद्रीय कैबिनेट की कल बैठक होगी", "Jaipur", null, hp("none", null, { source: "none" }));
  assert.equal(draftCardHeadline(d.headline, d), "दिल्लीः केंद्रीय कैबिनेट की कल बैठक होगी");
});
