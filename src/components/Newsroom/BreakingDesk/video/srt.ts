// SubRip (.srt) captions in and out of the caption track. Parsing is forgiving: a byte-order mark, Windows or
// old Mac line ends, a "." instead of "," before the milliseconds, a missing cue number, HTML-ish <i>/<b>/<font>
// tags and stray blank cues are all accepted. Cues that cannot be read are skipped and counted, never thrown.

import { newId, type CaptionClip } from "./model";

export interface SrtCue {
  /** Seconds */
  start: number;
  end: number;
  text: string;
}

export interface SrtParseResult {
  cues: SrtCue[];
  /** Blocks that had text but no readable timing line */
  skipped: number;
}

const TIME = /(\d{1,2}):(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?/;
const TIMING = new RegExp(`${TIME.source}\\s*-->\\s*${TIME.source}`);

function seconds(h: string, m: string, s: string, ms: string | undefined): number {
  // "5" after the comma means 500 ms, as in "00:00:01,5"
  const frac = ms ? Number(ms.padEnd(3, "0")) / 1000 : 0;
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + frac;
}

/** "00:01:02,500" → 62.5; NaN when the text is not a timestamp */
export function parseTimestamp(text: string): number {
  const m = TIME.exec(text.trim());
  return m ? seconds(m[1], m[2], m[3], m[4]) : NaN;
}

/** 62.5 → "00:01:02,500" (negative times clamp to zero) */
export function formatTimestamp(totalSeconds: number): string {
  const ms = Math.max(0, Math.round(totalSeconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

const stripTags = (line: string) => line.replace(/<\/?(?:i|b|u|font)(?:\s[^>]*)?>/gi, "").replace(/\{\\an?\d\}/g, "");

export function parseSrt(input: string): SrtParseResult {
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const blocks = text.split(/\n[ \t]*\n+/);
  const cues: SrtCue[] = [];
  let skipped = 0;
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
    if (!lines.length) continue;
    const at = lines.findIndex((l) => TIMING.test(l));
    if (at < 0 || at > 1) {
      skipped++;
      continue;
    }
    const m = TIMING.exec(lines[at])!;
    const start = seconds(m[1], m[2], m[3], m[4]);
    const end = seconds(m[5], m[6], m[7], m[8]);
    const body = lines.slice(at + 1).map(stripTags).join("\n").trim();
    if (!body || !(end > start)) {
      if (body) skipped++;
      continue;
    }
    cues.push({ start, end, text: body });
  }
  cues.sort((a, b) => a.start - b.start);
  return { cues, skipped };
}

export function toSrt(cues: SrtCue[]): string {
  return cues
    .filter((c) => c.text.trim() && c.end > c.start)
    .map((c, i) => `${i + 1}\n${formatTimestamp(c.start)} --> ${formatTimestamp(c.end)}\n${c.text.trim()}\n`)
    .join("\n");
}

/** Caption-track clips as cues, in time order */
export function captionsToCues(clips: CaptionClip[]): SrtCue[] {
  return [...clips].sort((a, b) => a.start - b.start).map((c) => ({ start: c.start, end: c.start + c.duration, text: c.text }));
}

/**
 * Cues as caption clips for one track. A track may not overlap, so a cue that starts before the previous one
 * ends cuts the previous one short; a cue that would be left shorter than 0.05 s is dropped.
 */
export function cuesToCaptions(cues: SrtCue[], offset = 0): CaptionClip[] {
  const out: CaptionClip[] = [];
  for (const cue of [...cues].sort((a, b) => a.start - b.start)) {
    const start = Math.max(0, cue.start + offset);
    const end = cue.end + offset;
    if (end - start < 0.05) continue;
    const prev = out[out.length - 1];
    if (prev && prev.start + prev.duration > start) {
      prev.duration = start - prev.start;
      if (prev.duration < 0.05) out.pop();
    }
    out.push({ id: newId("cap"), type: "caption", start, duration: end - start, fadeIn: 0, fadeOut: 0, text: cue.text });
  }
  return out;
}
