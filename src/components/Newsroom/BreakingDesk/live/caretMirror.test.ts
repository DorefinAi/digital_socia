// Unit checks for caretMirror.ts (run by npm test): where the watched holder's cursor goes, with real Hindi.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MIRROR_PROPS, USER_SCROLL_QUIET_MS, caretInBox, caretRect, caretVisible, flagPosition, shouldFollowCaret, graphemeBoundaries, liveSelection, mirrorStyle, mirrorText, snapToGrapheme, toBoxRects } from "./caretMirror";

const HINDI = "#Rajsamand: कुंभलगढ़ के ओलादर ब्रिज पर डंपर-कार की भीषण भिड़ंत, 5 पर्यटक घायल\n\nकुंभलगढ़ घूमने आए मध्यप्रदेश के पर्यटकों की कार हादसे का शिकार";

test("grapheme boundaries never fall before a matra, virama or nukta", () => {
  const marks = /\p{M}/u;
  for (const b of graphemeBoundaries(HINDI)) {
    if (b === HINDI.length) continue;
    assert.ok(!marks.test(HINDI[b]), `boundary ${b} splits "${HINDI.slice(Math.max(0, b - 2), b + 2)}"`);
  }
  assert.equal(graphemeBoundaries("")[0], 0);
});

test("an offset inside a cluster snaps to its start (or end, going up)", () => {
  // "कि" is क (U+0915) + ि (U+093F): offset 1 sits between them
  assert.equal(snapToGrapheme("कि", 1), 0);
  assert.equal(snapToGrapheme("कि", 1, true), 2);
  // "भिड़ंत": the nukta and anusvara stay on their consonants
  const w = "भिड़ंत";
  for (let i = 0; i <= w.length; i++) {
    const at = snapToGrapheme(w, i);
    assert.ok(at === w.length || !/\p{M}/u.test(w[at]));
  }
  assert.equal(snapToGrapheme("abc", -4), 0);
  assert.equal(snapToGrapheme("abc", 99), 3);
  assert.equal(snapToGrapheme("abc", Number.NaN), 0);
});

test("the holder's selection: clamped, ordered, whole clusters, caret at selEnd", () => {
  const text = "किसान पहले";
  const fwd = liveSelection(text, 1, 4);
  assert.deepEqual([fwd.start, fwd.end, fwd.caret, fwd.collapsed], [0, 4, 4, false]);
  const back = liveSelection(text, 4, 1);
  assert.equal(back.caret, back.start);
  const caret = liveSelection(text, 3, 3);
  assert.equal(caret.collapsed, true);
  assert.equal(caret.caret, snapToGrapheme(text, 3));
  assert.equal(liveSelection(text, 500, 600).caret, text.length);
});

test("a trailing newline keeps its empty line in the mirror", () => {
  assert.equal(mirrorText("abc\n"), "abc\n​");
  assert.equal(mirrorText(""), "​");
  assert.equal(mirrorText("abc"), "abc");
});

test("the mirror copies the textarea's type and padding and is as wide as its inside", () => {
  const style = mirrorStyle({ fontFamily: "Mukta, sans-serif", fontSize: "14px", lineHeight: "21.7px", paddingLeft: "0px", letterSpacing: "normal" }, 382);
  assert.equal(style.fontFamily, "Mukta, sans-serif");
  assert.equal(style.lineHeight, "21.7px");
  assert.equal(style.width, 382);
  assert.equal(style.whiteSpace, "pre-wrap");
  assert.equal(style.overflowWrap, "break-word");
  assert.equal(style.boxSizing, "border-box");
  assert.equal(style.visibility, "hidden");
  assert.ok(MIRROR_PROPS.includes("fontFeatureSettings"));
  assert.equal(mirrorStyle({}, -5).width, 0);
});

test("selection rectangles follow the textarea's scroll and are clipped to the box", () => {
  const origin = { left: 100, top: 200 };
  const box = { width: 300, height: 60 };
  const rects = [
    { left: 110, top: 205, width: 50, height: 20 }, // first line, scrolled away
    { left: 100, top: 245, width: 400, height: 20 }, // wider than the box
    { left: 100, top: 400, width: 30, height: 20 }, // below the box
  ];
  assert.deepEqual(toBoxRects(rects, origin, { top: 30, left: 0 }, box), [{ left: 0, top: 15, width: 300, height: 20 }]);
});

test("the caret falls back to the next or previous character when a collapsed range has no box", () => {
  const c = { left: 10, top: 20, width: 0, height: 18 };
  // The character after the caret, on the caret's line
  const next = { left: 10, top: 20, width: 8, height: 18 };
  const prev = { left: 50, top: 60, width: 8, height: 18 };
  assert.deepEqual(caretRect({ collapsed: c, next, prev }), { left: 10, top: 20, width: 0, height: 18 });
  assert.deepEqual(caretRect({ collapsed: { ...c, height: 0 }, next: { ...next, left: 30, top: 40 }, prev }), { left: 30, top: 40, width: 0, height: 18 });
  assert.deepEqual(caretRect({ next: null, prev }), { left: 58, top: 60, width: 0, height: 18 });
  assert.equal(caretRect({}), null);
});

test("at a soft wrap the caret goes to the start of the next line, as the textarea draws it", () => {
  const endOfLine = { left: 330, top: 40, width: 0, height: 19 };
  const firstOnNext = { left: 14, top: 62, width: 22, height: 19 };
  assert.deepEqual(caretRect({ collapsed: endOfLine, next: firstOnNext }), { left: 14, top: 62, width: 0, height: 19 });
  // Same line: the collapsed range stands
  assert.deepEqual(caretRect({ collapsed: endOfLine, next: { ...firstOnNext, top: 40, left: 330 } }), { left: 330, top: 40, width: 0, height: 19 });
});

test("a caret scrolled out of view is not drawn; one at the edge stays inside", () => {
  const origin = { left: 0, top: 0 };
  const box = { width: 200, height: 100 };
  assert.equal(caretInBox({ left: 5, top: 10, width: 0, height: 20 }, origin, { top: 50, left: 0 }, box), null);
  assert.deepEqual(caretInBox({ left: 5, top: 60, width: 0, height: 20 }, origin, { top: 50, left: 0 }, box), { left: 5, top: 10, width: 2, height: 20 });
  assert.equal(caretInBox({ left: 400, top: 0, width: 0, height: 20 }, origin, { top: 0, left: 0 }, box)?.left, 198);
});

test("the name flag sits above the caret, below it on the first line, and inside the box", () => {
  const flag = { width: 44, height: 18 };
  assert.deepEqual(flagPosition({ left: 80, top: 40, width: 2, height: 20 }, { width: 300 }, flag), { left: 80, top: 22, below: false });
  assert.deepEqual(flagPosition({ left: 80, top: 4, width: 2, height: 20 }, { width: 300 }, flag), { left: 80, top: 24, below: true });
  assert.equal(flagPosition({ left: 290, top: 40, width: 2, height: 20 }, { width: 300 }, flag).left, 256);
});

test("following the holder's caret: only when it just went out of view, never while the watcher reads elsewhere", () => {
  const quiet = USER_SCROLL_QUIET_MS + 1;
  // Moved to a line below the box: follow
  assert.equal(shouldFollowCaret({ line: 200, lastLine: 20, visible: false, wasVisible: true, sinceUserScroll: quiet }), true);
  // In view: nothing to do
  assert.equal(shouldFollowCaret({ line: 40, lastLine: 20, visible: true, wasVisible: true, sinceUserScroll: quiet }), false);
  // The watcher scrolled a moment ago: leave their scroll alone
  assert.equal(shouldFollowCaret({ line: 200, lastLine: 20, visible: false, wasVisible: true, sinceUserScroll: 500 }), false);
  // Out of view already and still on the same line (typing on a line the watcher scrolled away from): stay put
  assert.equal(shouldFollowCaret({ line: 200, lastLine: 200, visible: false, wasVisible: false, sinceUserScroll: quiet }), false);
  // Out of view and on to another line: follow
  assert.equal(shouldFollowCaret({ line: 222, lastLine: 200, visible: false, wasVisible: false, sinceUserScroll: quiet }), true);
});

test("a caret is visible when wholly inside the scrolled band", () => {
  assert.equal(caretVisible(50, 20, 40, 100), true);
  assert.equal(caretVisible(130, 20, 40, 100), false);
  assert.equal(caretVisible(10, 20, 40, 100), false);
});
