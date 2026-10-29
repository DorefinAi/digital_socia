// Pure checks for the render maths (transitions, fades, filters, geometry, snapping, wrapping, layers).
// No test runner in this repo: call runRenderChecks() from a harness or compile and run with Node.
// Returns one row per check; `ok: false` rows carry what was expected.

import { emptyProject, type MediaClip, type Project, type TextClip } from "../model";
import { snapAngle, snapAxis, snapValue } from "../preview/snapping";
import { applyFiltersToPixels, buildToneLut, cssFilter, isNeutral, saturateMatrix } from "./filters";
import { boxBounds, mediaRects, newRects, pointInBox } from "./geometry";
import { collectLayers, newLayerList } from "./layers";
import { easeInOut, fadeAlpha, newFx, soloTransitionFx, transitionFx, transitionProgress, transitionSpan } from "./transitions";
import { wrapLines } from "./wrap";

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

function media(id: string, start: number, duration: number, extra: Partial<MediaClip> = {}): MediaClip {
  return {
    id, type: "media", assetId: "a1", start, duration, fadeIn: 0, fadeOut: 0, in: 0, speed: 1, volume: 1, audioDetached: false,
    box: { x: 0.5, y: 0.5, w: 1, h: 1, rotation: 0 }, fit: "fill", crop: { left: 0, top: 0, right: 0, bottom: 0 }, flipH: false, flipV: false,
    filters: { brightness: 1, contrast: 1, saturation: 1 }, ...extra,
  };
}

export function runRenderChecks(): CheckResult[] {
  const out: CheckResult[] = [];
  const check = (name: string, ok: boolean, detail = "") => out.push({ name, ok, detail: ok ? "" : detail });

  // ----- fades
  const c = { start: 2, duration: 4, fadeIn: 1, fadeOut: 2 };
  check("fade: before start of fade-in is 0", near(fadeAlpha(c, 2), 0), `${fadeAlpha(c, 2)}`);
  check("fade: half way into fade-in is 0.5", near(fadeAlpha(c, 2.5), 0.5), `${fadeAlpha(c, 2.5)}`);
  check("fade: middle is 1", near(fadeAlpha(c, 3.5), 1), `${fadeAlpha(c, 3.5)}`);
  check("fade: half way through fade-out is 0.5", near(fadeAlpha(c, 5), 0.5), `${fadeAlpha(c, 5)}`);
  check("fade: no fades is always 1", near(fadeAlpha({ start: 0, duration: 1, fadeIn: 0, fadeOut: 0 }, 0), 1));

  // ----- transition window
  check("span: limited by the overlap", near(transitionSpan({ start: 5, transitionIn: { type: "crossfade", duration: 2 } }, 6), 1));
  check("span: full duration with a longer overlap", near(transitionSpan({ start: 5, transitionIn: { type: "crossfade", duration: 1 } }, 8), 1));
  check("span: no previous clip uses the duration", near(transitionSpan({ start: 5, transitionIn: { type: "wipe", duration: 0.5 } }, null), 0.5));
  check("span: no transition is 0", transitionSpan({ start: 5 }, 6) === 0);
  check("progress: outside is -1", transitionProgress(5, 1, 4.99) === -1 && transitionProgress(5, 1, 6) === -1);
  check("progress: middle is 0.5", near(transitionProgress(5, 1, 5.5), 0.5));

  // ----- transition effects
  const fx = newFx();
  transitionFx("crossfade", 0.5, "in", fx);
  check("crossfade: incoming at half is 0.5", near(fx.alpha, 0.5), `${fx.alpha}`);
  transitionFx("crossfade", 0.5, "out", fx);
  check("crossfade: outgoing stays opaque underneath", near(fx.alpha, 1), `${fx.alpha}`);
  for (const p of [0, 0.25, 0.5, 0.75, 1]) {
    const a = transitionFx("crossfade", p, "out", newFx()).alpha;
    const b = transitionFx("crossfade", p, "in", newFx()).alpha;
    const coverage = b + (1 - b) * a;
    check(`crossfade: full-frame coverage never dips (p=${p})`, coverage >= 0.999, `${coverage}`);
  }
  transitionFx("fade-black", 0.25, "out", fx);
  check("fade-black: outgoing half dark at a quarter", fx.alpha === 1 && near(fx.tintAlpha, 0.5) && fx.tint === "#000000", JSON.stringify(fx));
  transitionFx("fade-black", 0.25, "in", fx);
  check("fade-black: incoming hidden in first half", fx.alpha === 0, JSON.stringify(fx));
  transitionFx("fade-white", 0.75, "in", fx);
  check("fade-white: incoming half white at three quarters", fx.alpha === 1 && near(fx.tintAlpha, 0.5) && fx.tint === "#FFFFFF", JSON.stringify(fx));
  {
    const o = transitionFx("fade-black", 0.5, "out", newFx());
    const i = transitionFx("fade-black", 0.5, "in", newFx());
    check("fade-black: fully black at the midpoint", near(i.tintAlpha, 1) && i.alpha === 1 && o.alpha === 0, `${JSON.stringify(o)} ${JSON.stringify(i)}`);
  }
  transitionFx("slide-left", 0, "in", fx);
  check("slide-left: incoming starts one frame right", near(fx.dx, 1));
  transitionFx("slide-left", 1, "in", fx);
  check("slide-left: incoming ends in place", near(fx.dx, 0));
  transitionFx("slide-left", 0.5, "out", fx);
  check("slide-left: outgoing half way left at midpoint", near(fx.dx, -0.5));
  {
    const i = transitionFx("slide-right", 0.3, "in", newFx());
    const o = transitionFx("slide-right", 0.3, "out", newFx());
    check("slide-right: the two pictures stay edge to edge", near(o.dx - i.dx, 1), `${i.dx} ${o.dx}`);
  }
  transitionFx("wipe", 0.5, "in", fx);
  check("wipe: half revealed at midpoint", near(fx.clipLeft, 0) && near(fx.clipRight, 0.5), JSON.stringify(fx));
  transitionFx("wipe", 0.5, "out", fx);
  check("wipe: outgoing untouched", fx.clipLeft === 0 && fx.clipRight === 1 && fx.alpha === 1);
  soloTransitionFx("crossfade", 0.25, fx);
  check("solo crossfade: a fade in", near(fx.alpha, 0.25));
  soloTransitionFx("fade-white", 0.25, fx);
  check("solo fade-white: rises out of white", near(fx.tintAlpha, 0.75) && fx.alpha === 1);
  check("ease: endpoints and midpoint", near(easeInOut(0), 0) && near(easeInOut(1), 1) && near(easeInOut(0.5), 0.5));

  // ----- layers: order, hidden tracks, transitions, voices
  {
    const p: Project = emptyProject("16:9");
    const [video, overlay, text] = p.tracks;
    video.clips = [media("v1", 0, 5), media("v2", 4, 5, { transitionIn: { type: "crossfade", duration: 1 } })];
    overlay.clips = [media("o1", 0, 10, { box: { x: 0.8, y: 0.2, w: 0.3, h: 0.3, rotation: 0 } })];
    const tc: TextClip = { id: "t1", type: "text", start: 0, duration: 10, fadeIn: 0, fadeOut: 0, text: "नमस्ते", style: { font: "Mangal", size: 72, weight: 700, color: "#fff", outlineColor: null, outlineWidth: 0, background: null, align: "center" }, box: { x: 0.5, y: 0.8, w: 0.8, h: 0.2, rotation: 0 } };
    text.clips = [tc];
    const list = collectLayers(p, 4.5, newLayerList());
    const ids = list.items.slice(0, list.count).map((l) => l.clip.id).join(",");
    check("layers: bottom to top with both sides of a transition", ids === "v1,v2,o1,t1", ids);
    const v2 = list.items[1];
    check("layers: incoming alpha follows the crossfade", near(v2.alpha, 0.5), `${v2.alpha}`);
    check("layers: same file twice at once gets separate voices", list.items[0].voice === 0 && list.items[1].voice === 1 && list.items[2].voice === 2, list.items.slice(0, 3).map((l) => l.voice).join(","));
    overlay.hidden = true;
    const hidden = collectLayers(p, 4.5, newLayerList());
    check("layers: hidden track skipped", hidden.items.slice(0, hidden.count).every((l) => l.clip.id !== "o1"));
    const later = collectLayers(p, 6, newLayerList());
    check("layers: after the transition only the new clip", later.count === 2 && later.items[0].clip.id === "v2" && later.items[0].voice === 0, `${later.count}`);
  }

  // ----- filters (the CSS filter maths)
  check("filters: neutral detection", isNeutral({ brightness: 1, contrast: 1, saturation: 1 }) && !isNeutral({ brightness: 1.1, contrast: 1, saturation: 1 }));
  check("filters: css string", cssFilter({ brightness: 1.2, contrast: 0.9, saturation: 0 }) === "brightness(1.2) contrast(0.9) saturate(0)");
  {
    const lut = buildToneLut(1, 1);
    check("tone: identity", lut[0] === 0 && lut[128] === 128 && lut[255] === 255);
    const bright = buildToneLut(2, 1);
    check("tone: brightness doubles and clamps", bright[100] === 200 && bright[200] === 255, `${bright[100]} ${bright[200]}`);
    const flat = buildToneLut(1, 0);
    check("tone: contrast 0 is mid grey", flat[0] === 128 && flat[255] === 128, `${flat[0]} ${flat[255]}`);
    const m = saturateMatrix(0);
    check("saturate(0): rows equal (grey)", near(m[0], m[3]) && near(m[1], m[4]) && near(m[2], m[5]) && near(m[0] + m[1] + m[2], 1));
    const id = saturateMatrix(1);
    check("saturate(1): identity", near(id[0], 1) && near(id[4], 1) && near(id[8], 1) && near(id[1], 0, 1e-7));
    const px = new Uint8ClampedArray([255, 0, 0, 200]);
    applyFiltersToPixels(px, { brightness: 1, contrast: 1, saturation: 0 });
    check("pixels: red desaturates to its luminance, alpha kept", px[0] === px[1] && px[1] === px[2] && Math.abs(px[0] - 54) <= 1 && px[3] === 200, Array.from(px).join(","));
  }

  // ----- geometry
  {
    const r = newRects();
    const noCrop = { left: 0, top: 0, right: 0, bottom: 0 };
    mediaRects(1920, 1080, noCrop, 1080, 1080, "fit", r);
    check("fit: 16:9 into a square letterboxes", near(r.dw, 1080) && near(r.dh, 607.5) && near(r.dy, -303.75), JSON.stringify(r));
    mediaRects(1920, 1080, noCrop, 1080, 1080, "fill", r);
    check("fill: 16:9 into a square trims the sides", near(r.sw, 1080) && near(r.sx, 420) && near(r.dw, 1080) && near(r.dh, 1080), JSON.stringify(r));
    mediaRects(1000, 1000, { left: 0.1, top: 0, right: 0.1, bottom: 0.5 }, 800, 500, "fit", r);
    check("crop: source window", near(r.sx, 100) && near(r.sw, 800) && near(r.sh, 500) && near(r.dw, 800) && near(r.dh, 500), JSON.stringify(r));
    check("crop: everything cut draws nothing", !mediaRects(100, 100, { left: 0.5, top: 0, right: 0.5, bottom: 0 }, 10, 10, "fit", r));
    const b = boxBounds({ x: 0.5, y: 0.5, w: 0.5, h: 0.5, rotation: 90 }, 1000, 1000);
    check("bounds: square box rotated 90 keeps its bounds", near(b.left, 0.25) && near(b.right, 0.75));
    const rb = { x: 0.5, y: 0.5, w: 0.4, h: 0.1, rotation: 90 };
    check("hit: rotated box catches along its new long side", pointInBox(rb, 0.5, 0.3, 1000, 1000) && !pointInBox(rb, 0.68, 0.5, 1000, 1000));
  }

  // ----- snapping
  {
    const s = snapAxis(0.3, 0.69, [0.5, 0, 1], 0.01);
    check("snap: centre catches the frame centre", near(s.offset, 0.005) && s.guide === 0.5, JSON.stringify(s));
    const e = snapAxis(0.005, 0.2, [0.5, 0, 1], 0.01);
    check("snap: left edge catches the frame edge", near(e.offset, -0.005) && e.guide === 0, JSON.stringify(e));
    const none = snapAxis(0.2, 0.3, [0.5, 0, 1], 0.01);
    check("snap: nothing near, no move", none.offset === 0 && none.guide === null);
    const v = snapValue(0.952, [0.5, 0, 1, 0.05, 0.95], 0.01);
    check("snap edge: catches safe line", near(v.offset, -0.002) && v.guide === 0.95, JSON.stringify(v));
    check("angle: square angles catch", snapAngle(88, false) === 90 && snapAngle(-2, false) === 0 && snapAngle(80, false) === 80);
    check("angle: Shift steps by 15", snapAngle(52, true) === 45 && snapAngle(359, true) === 0 && snapAngle(181, false) === 180);
  }

  // ----- wrapping (one unit per character)
  {
    const m = (s: string) => s.length;
    const lines = wrapLines(m, "one two three four", 9);
    check("wrap: words to width", lines.join("|") === "one two|three|four", lines.join("|"));
    const kept = wrapLines(m, "a\n\nb", 9);
    check("wrap: blank lines kept", kept.join("|") === "a||b", kept.join("|"));
    const long = wrapLines(m, "abcdefghij", 4);
    check("wrap: an over-long word breaks", long.join("|") === "abcd|efgh|ij", long.join("|"));
  }
  return out;
}
