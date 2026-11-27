// The day folders on the video share (GET /xvideos/folders): months, newest first, each with the days whose folder
// still holds videos (plus today, even when empty). A file gone from the share is gone for good: nothing lists it.
// Pure, no fetch, so node --test can load it.

/** One day folder (`<dd-mm-yyyy>` on the share), with how many videos it holds */
export interface XvFolderDay {
  /** "2026-11-27" */
  day: string;
  clips: number;
  /** Carry the desk's x mark */
  picked: number;
  /** Marked done (posted by hand) */
  done: number;
}

export interface XvFolderMonth {
  /** "2026-11" */
  month: string;
  days: XvFolderDay[];
}

export interface XvFolders {
  /** Today's day folder by IST, always listed */
  today: string;
  months: XvFolderMonth[];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (v: unknown): v is string => typeof v === "string" && DAY_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const emptyDay = (day: string): XvFolderDay => ({ day, clips: 0, picked: 0, done: 0 });

/** Today's date in India ("2026-11-27"), whatever the browser's time zone */
export function istDay(ms = Date.now()): string {
  return new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
}

/**
 * The folders answer, made safe for the picker: bad days dropped, a day listed once, days grouped by their own month
 * (newest first), and today always there (with zero counts when its folder is still empty).
 */
export function toXvFolders(raw: unknown, fallbackToday = istDay()): XvFolders {
  const r = (raw ?? {}) as { today?: unknown; months?: unknown };
  const today = isDay(r.today) ? r.today : fallbackToday;
  const byDay = new Map<string, XvFolderDay>();
  for (const m of Array.isArray(r.months) ? r.months : []) {
    const days = (m as { days?: unknown })?.days;
    for (const d of Array.isArray(days) ? days : []) {
      const x = d as Partial<Record<keyof XvFolderDay, unknown>>;
      if (!isDay(x?.day) || byDay.has(x.day)) continue;
      byDay.set(x.day, { day: x.day, clips: count(x.clips), picked: count(x.picked), done: count(x.done) });
    }
  }
  if (!byDay.has(today)) byDay.set(today, emptyDay(today));
  const months = new Map<string, XvFolderDay[]>();
  for (const d of [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day))) {
    const key = d.day.slice(0, 7);
    const list = months.get(key);
    if (list) list.push(d);
    else months.set(key, [d]);
  }
  return { today, months: [...months].map(([month, days]) => ({ month, days })) };
}

/** The demo's folders: one day, today, with the demo clips' counts */
export function demoFolders(clips: readonly { picked?: boolean; status: string }[], today = istDay()): XvFolders {
  return toXvFolders({
    today,
    months: [{ month: today.slice(0, 7), days: [{ day: today, clips: clips.length, picked: clips.filter((c) => c.picked).length, done: clips.filter((c) => c.status === "posted").length }] }],
  });
}

/**
 * Today as the desk should treat it: the newest of the days given (the folders' today, the browser's IST date, the day
 * the list just rolled to). Just after midnight the folders answer can still say yesterday for up to a minute; no listed
 * day is ever later than the real today, so the newest one wins. Bad or missing days are skipped.
 */
export function latestDay(...days: (string | null | undefined)[]): string | null {
  let out: string | null = null;
  for (const d of days) if (isDay(d) && (out === null || d > out)) out = d;
  return out;
}

export function findDay(folders: XvFolders | null, day: string | null): XvFolderDay | undefined {
  if (!folders || !day) return undefined;
  return folders.months.find((m) => m.month === day.slice(0, 7))?.days.find((d) => d.day === day);
}

const asUtc = (day: string) => new Date(`${day}T00:00:00Z`);

/** "2026-11-27" → "Fri 27 Nov" */
export function dayLabel(day: string): string {
  const d = asUtc(day);
  return `${d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" })} ${d.getUTCDate()} ${d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}`;
}

/** "2026-11-27" → "Friday 27 November 2026", for screen readers */
export function dayLabelLong(day: string): string {
  const d = asUtc(day);
  return `${d.toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" })} ${d.getUTCDate()} ${d.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}`;
}

/** "2026-11" → "Nov 2026" */
export function monthLabel(month: string): string {
  return asUtc(`${month}-01`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}
