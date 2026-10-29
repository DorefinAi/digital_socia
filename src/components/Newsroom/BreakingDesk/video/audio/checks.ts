// Pure checks for the audio maths and project helpers. No test runner in this repo: call runAudioChecks() from a dev
// harness or run it with Node (type stripping) — every check returns { name, ok, detail }.

import { emptyProject, type MediaClip, type Project } from "../model";
import { detachAudio } from "./detach";
import {
  clipEnvelope, dbToGain, effectiveFades, envelopeGain, fallTowards, gainToDb, meterFraction, sampleEnvelope, softClip,
  suggestVolume, type EnvelopeSpec,
} from "./gain";
import { audibleTrackIds, planVoices } from "./voices";

export interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

function maxEnvelopeError(spec: EnvelopeSpec): number {
  const pts = clipEnvelope(spec);
  let err = 0;
  for (let i = 0; i <= 2000; i++) {
    const t = (spec.duration * i) / 2000;
    err = Math.max(err, Math.abs(sampleEnvelope(pts, t) - envelopeGain(spec, t)));
  }
  return err;
}

function media(id: string, start: number, duration: number, extra: Partial<MediaClip> = {}): MediaClip {
  return {
    id, type: "media", assetId: "vid", start, duration, fadeIn: 0, fadeOut: 0, in: 0, speed: 1, volume: 1, audioDetached: false,
    box: { x: 0.5, y: 0.5, w: 1, h: 1, rotation: 0 }, fit: "fit", crop: { left: 0, top: 0, right: 0, bottom: 0 },
    flipH: false, flipV: false, filters: { brightness: 1, contrast: 1, saturation: 1 }, ...extra,
  };
}

function sampleProject(): Project {
  const p = emptyProject();
  p.assets.push({ id: "vid", kind: "video", url: "blob:v", name: "v", duration: 30, hasAudio: true });
  p.assets.push({ id: "mus", kind: "audio", url: "blob:m", name: "m", duration: 60, hasAudio: true });
  p.tracks[0].clips = [media("a", 0, 5), media("b", 4, 5, { transitionIn: { type: "crossfade", duration: 1 } })];
  p.tracks[4].clips = [{ id: "m1", type: "audio", assetId: "mus", start: 0, duration: 10, in: 2, speed: 1, volume: 0.5, fadeIn: 1, fadeOut: 2 }];
  return p;
}

export function runAudioChecks(): CheckResult[] {
  const r: CheckResult[] = [];
  const check = (name: string, ok: boolean, detail?: string) => r.push({ name, ok, detail });

  // dB conversions
  check("0 dB is unity gain", near(dbToGain(0), 1));
  check("-6 dB is about half", near(dbToGain(-6), 0.501187, 1e-5));
  check("gainToDb inverts dbToGain", near(gainToDb(dbToGain(-13.5)), -13.5, 1e-9));
  check("silence is -Infinity dB", gainToDb(0) === -Infinity);

  // Linear fades
  const lin: EnvelopeSpec = { duration: 10, fadeIn: 2, fadeOut: 4, xfadeIn: 0, xfadeOut: 0 };
  check("fade in starts silent", envelopeGain(lin, 0) === 0);
  check("fade in is linear (half way = 0.5)", near(envelopeGain(lin, 1), 0.5));
  check("full level between fades", envelopeGain(lin, 5) === 1);
  check("fade out is linear (1 s left of 4 = 0.25)", near(envelopeGain(lin, 9), 0.25));
  check("fade out ends silent", near(envelopeGain(lin, 10), 0));
  check("no fades = flat 1", envelopeGain({ duration: 3, fadeIn: 0, fadeOut: 0, xfadeIn: 0, xfadeOut: 0 }, 0) === 1);
  check("outside the clip is 0", envelopeGain(lin, -0.1) === 0 && envelopeGain(lin, 10.1) === 0);

  // Overlong fades shrink in proportion
  const f = effectiveFades({ duration: 4, fadeIn: 3, fadeOut: 3, xfadeIn: 0, xfadeOut: 0 });
  check("overlong fades scale to fit", near(f.fadeIn, 2) && near(f.fadeOut, 2));
  check("overlong fades meet at the peak", near(envelopeGain({ duration: 4, fadeIn: 3, fadeOut: 3, xfadeIn: 0, xfadeOut: 0 }, 2), 1));

  // Equal-power crossfade
  const xin: EnvelopeSpec = { duration: 5, fadeIn: 0, fadeOut: 0, xfadeIn: 1, xfadeOut: 0 };
  const xout: EnvelopeSpec = { duration: 5, fadeIn: 0, fadeOut: 0, xfadeIn: 0, xfadeOut: 1 };
  let worst = 0;
  for (let i = 0; i <= 100; i++) {
    const p = i / 100;
    const gi = envelopeGain(xin, p);
    const go = envelopeGain(xout, 4 + p);
    worst = Math.max(worst, Math.abs(gi * gi + go * go - 1));
  }
  check("crossfade keeps constant power (in² + out² = 1)", worst < 1e-9, `max deviation ${worst}`);
  check("crossfade midpoint is -3 dB", near(envelopeGain(xin, 0.5), Math.SQRT1_2));

  // Breakpoints approximate the exact curve
  const combos: EnvelopeSpec[] = [lin, xin, xout, { duration: 6, fadeIn: 1.5, fadeOut: 1, xfadeIn: 0.5, xfadeOut: 2 }, { duration: 1, fadeIn: 5, fadeOut: 5, xfadeIn: 3, xfadeOut: 3 }];
  for (const [i, s] of combos.entries()) {
    const e = maxEnvelopeError(s);
    check(`breakpoints match exact envelope (case ${i + 1})`, e < 0.006, `max error ${e.toFixed(5)}`);
  }
  const pts = clipEnvelope(lin);
  check("breakpoints sorted, start at 0, end at duration", pts[0].t === 0 && pts[pts.length - 1].t === 10 && pts.every((p, i) => i === 0 || p.t > pts[i - 1].t));
  check("linear-only envelope needs 4 points", pts.length === 4, `${pts.length} points`);

  // Volume suggestion
  check("peak 0.5 -> volume 1.78 for -1 dBFS", suggestVolume(0.5).volume === 1.78);
  check("very quiet clip is limited to 2", suggestVolume(0.05).volume === 2 && suggestVolume(0.05).limited);
  check("hot clip is turned down", suggestVolume(1.4).volume < 1);
  check("silence keeps volume 1", suggestVolume(0).volume === 1);

  // Soft clip
  check("soft clip is identity below the knee", softClip(0.5) === 0.5 && softClip(-0.9) === -0.9);
  check("soft clip never exceeds 1", softClip(10) <= 1 && softClip(-10) >= -1);
  check("soft clip is monotonic", softClip(0.95) < softClip(0.99) && softClip(0.99) < softClip(1.5));

  // Meter maths
  check("meter: 0 dBFS is full", meterFraction(1) === 1);
  check("meter: -30 dB is half on a 60 dB scale", near(meterFraction(dbToGain(-30)), 0.5));
  check("meter: silence is empty", meterFraction(0) === 0);
  check("meter rises instantly", fallTowards(-40, -10, 0.016) === -10);
  check("meter falls 24 dB/s", near(fallTowards(-10, -60, 0.5), -22));

  // Project plan: mute, solo, detach, crossfade
  const p = sampleProject();
  const plans = planVoices(p);
  check("plan has both video clips and the music", plans.map((v) => v.clipId).sort().join() === "a,b,m1");
  const a = plans.find((v) => v.clipId === "a")!;
  const b = plans.find((v) => v.clipId === "b")!;
  check("transition gives outgoing clip a 1 s crossfade out", near(sampleEnvelope(a.envelope, 4.5), Math.SQRT1_2, 0.005));
  check("transition gives incoming clip a 1 s crossfade in", near(sampleEnvelope(b.envelope, 0.5), Math.SQRT1_2, 0.005));
  check("music keeps its volume and in-point", plans.find((v) => v.clipId === "m1")!.volume === 0.5 && plans.find((v) => v.clipId === "m1")!.in === 2);

  const muted: Project = { ...p, tracks: p.tracks.map((t, i) => (i === 4 ? { ...t, muted: true } : t)) };
  check("muted track is silent in export", !planVoices(muted).some((v) => v.clipId === "m1"));
  check("muted track kept for live engine", planVoices(muted, { includeMuted: true }).some((v) => v.clipId === "m1"));

  const solo: Project = { ...p, tracks: p.tracks.map((t, i) => (i === 4 ? ({ ...t, solo: true } as typeof t) : t)) };
  check("solo leaves only the soloed track audible", [...audibleTrackIds(solo)].join() === p.tracks[4].id);

  const silentAsset: Project = { ...p, assets: p.assets.map((x) => (x.id === "vid" ? { ...x, hasAudio: false } : x)) };
  check("video without sound makes no voice", !planVoices(silentAsset).some((v) => v.clipId === "a"));

  const zeroVol: Project = { ...p, tracks: p.tracks.map((t, i) => (i === 0 ? { ...t, clips: t.clips.map((c) => ({ ...c, volume: 0 }) as MediaClip) } : t)) };
  check("volume 0 clips skipped in export", !planVoices(zeroVol).some((v) => v.clipId === "a"));

  const d = detachAudio(p, "b", "aud-b");
  const bAfter = d.tracks[0].clips.find((c) => c.id === "b") as MediaClip;
  const audioTrack = d.tracks.find((t) => t.clips.some((c) => c.id === "aud-b"))!;
  const newClip = audioTrack.clips.find((c) => c.id === "aud-b")!;
  check("detach marks video clip audioDetached", bAfter.audioDetached === true);
  check("detach does not mutate the input", (p.tracks[0].clips[1] as MediaClip).audioDetached === false);
  check("detach skips the busy Audio track and uses Music", audioTrack.name === "Music", audioTrack.name);
  check("detached clip lines up with the picture", newClip.start === 4 && newClip.duration === 5);
  check("detached clip turns the transition into a fade in", newClip.fadeIn === 1);
  check("detached video clip no longer sounds", !planVoices(d).some((v) => v.clipId === "b") && planVoices(d).some((v) => v.clipId === "aud-b"));
  check("detaching twice changes nothing", detachAudio(d, "b") === d);

  const full: Project = { ...p, tracks: p.tracks.map((t) => (t.kind === "audio" ? { ...t, clips: [{ id: `x-${t.id}`, type: "audio", assetId: "mus", start: 0, duration: 20, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] } : t)) };
  const d2 = detachAudio(full, "a", "aud-a");
  check("detach adds a new audio track when all are busy", d2.tracks.length === full.tracks.length + 1 && d2.tracks[d2.tracks.length - 1].clips[0]?.id === "aud-a");

  return r;
}
