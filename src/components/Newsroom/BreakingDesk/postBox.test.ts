// The post box's split into body and tag line (postBox.ts). Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isHashtag, splitPost } from "./postBox";

test("P5: the merged district's desk tag '#Kotputli-Behror' is a hashtag, so its tag line stays the tag line", () => {
  assert.equal(isHashtag("#Kotputli-Behror"), true);
  const split = splitPost("नीमराना में फैक्ट्री में लगी आग\n\nपुलिस मौके पर\n\n#RajasthanWithFirstIndia #Kotputli-Behror @KotputliPolice", { strict: true });
  assert.deepEqual(split.hashtags, ["#RajasthanWithFirstIndia", "#Kotputli-Behror"]);
  assert.deepEqual(split.mentions, ["@KotputliPolice"]);
  assert.equal(split.body, "नीमराना में फैक्ट्री में लगी आग\n\nपुलिस मौके पर");
});

test("still no hashtag: a trailing hyphen or comma, a Hindi word after a hyphen, a lone #", () => {
  for (const t of ["#Kotputli-", "#Delhi,", "#जयपुर-दिल्ली", "#", "##"]) assert.equal(isHashtag(t), false, t);
  for (const t of ["#दिल्ली", "#Jaipur", "#Khairthal", "#K2"]) assert.equal(isHashtag(t), true, t);
});
