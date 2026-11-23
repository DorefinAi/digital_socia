// Unit checks for the post's template switch (templateToggle.ts). Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasTemplate, templateOff, templateOn } from "./templateToggle";

const opts = { strict: true };
const assemble = (body: string, hashtags: string[], mentions: string[]) => [body.trim(), [...hashtags, ...mentions].join(" ")].filter(Boolean).join("\n\n");

const rajasthan = "#Alwar #रावतभाटा: युवा RPS मनीष कुमार के घर गूंजी किलकारी\n\nपरिवार में खुशी का माहौल\n\n#RajasthanWithFirstIndia @AlwarPolice";
const national = "#Srinagar: कश्मीर सुरक्षा ग्रिड की समीक्षा बैठक\n\nएजेंसियों के बीच तालमेल\n\n#FirstIndiaNews #Kashmir";

test("Rajasthan post: the district goes before the footer, the Hindi town stays as plain text", () => {
  const off = templateOff(rajasthan, assemble, opts)!;
  assert.equal(off.text, "रावतभाटा: युवा RPS मनीष कुमार के घर गूंजी किलकारी\n\nपरिवार में खुशी का माहौल\n\n#Alwar #RajasthanWithFirstIndia @AlwarPolice");
  assert.deepEqual(off.move, { moved: ["#Alwar"], town: "रावतभाटा" });
  assert.equal(hasTemplate(off.text, opts), false);
});

test("National post: the place goes right after the footer", () => {
  const off = templateOff(national, assemble, opts)!;
  assert.equal(off.text, "कश्मीर सुरक्षा ग्रिड की समीक्षा बैठक\n\nएजेंसियों के बीच तालमेल\n\n#FirstIndiaNews #Srinagar #Kashmir");
});

test("Off then on gives back the original post", () => {
  for (const post of [rajasthan, national]) {
    const off = templateOff(post, assemble, opts)!;
    assert.equal(templateOn(off.text, off.move, assemble, opts), post);
    assert.equal(hasTemplate(post, opts), true);
  }
});

test("On keeps the desk's edits made while off", () => {
  const off = templateOff(rajasthan, assemble, opts)!;
  // The desk deleted #Alwar and edited the headline: only the town comes back
  const edited = off.text.replace("#Alwar ", "").replace("किलकारी", "खुशियां");
  assert.equal(templateOn(edited, off.move, assemble, opts), "#रावतभाटा: युवा RPS मनीष कुमार के घर गूंजी खुशियां\n\nपरिवार में खुशी का माहौल\n\n#RajasthanWithFirstIndia @AlwarPolice");
});

test("A second Hindi tag in the run goes to the tag line and comes back", () => {
  const post = "#Bundi #नैनवां #बूंदी: मंडी में नई फसल की आवक\n\nभाव स्थिर\n\n#RajasthanWithFirstIndia";
  const off = templateOff(post, assemble, opts)!;
  assert.equal(off.text, "नैनवां: मंडी में नई फसल की आवक\n\nभाव स्थिर\n\n#Bundi #बूंदी #RajasthanWithFirstIndia");
  assert.equal(templateOn(off.text, off.move, assemble, opts), "#Bundi #बूंदी #नैनवां: मंडी में नई फसल की आवक\n\nभाव स्थिर\n\n#RajasthanWithFirstIndia");
});

test("No run on line 1: nothing to turn off", () => {
  assert.equal(templateOff("मनी लॉन्ड्रिंग मामले में समन\n\n#FirstIndiaNews #ED", assemble, opts), null);
});

test("A tag already on the tag line is not added twice", () => {
  const off = templateOff("#Delhi: व्यापार मेले में हरियाणा स्टेट-डे\n\n#FirstIndiaNews #delhi", assemble, opts)!;
  assert.equal(off.text, "व्यापार मेले में हरियाणा स्टेट-डे\n\n#FirstIndiaNews #delhi");
});
