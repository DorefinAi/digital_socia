// The post's template switch. ON is the composer's layout: line 1 opens with the place run ("#Jodhpur #रावतभाटा: ...").
// OFF is the desk's plain layout for news that takes no template (the Srinagar, Alwar and Nepal posts): the headline
// with no tags in front, the place's Latin tag on the tag line instead. On a Rajasthan post the place goes before
// the footer ("#Alwar #RajasthanWithFirstIndia"); on a national post after it ("#FirstIndiaNews #Srinagar").
// A Hindi town tag in the run stays in the headline as plain text ("रावतभाटा: ..."), as the desk writes it.
//
// Pure: it works on the box's text through postBox's split, so the tag pickers follow it as they follow typing.

import { splitPost, tagKey, type PostFormat, type SplitOptions } from "./postBox";

const RAJASTHAN_FOOTER = "#RajasthanWithFirstIndia";
const NATIONAL_FOOTER = "#FirstIndiaNews";

/** Line 1's leading tag run with its colon: "#Jodhpur #रावतभाटा: " */
const LEAD_RUN = /^\s*((?:#[\p{L}\p{M}\p{N}_]+\s*)+):\s*/u;
const DEVANAGARI = /[ऀ-ॿ]/u;

/** What turning the template off moved, so turning it back on puts exactly that back */
export interface TemplateMove {
  /** Latin tags taken off line 1 and put on the tag line, in their order */
  moved: string[];
  /** The Hindi tag of the run, now plain text at the start of the headline ("रावतभाटा"), or null */
  town: string | null;
}

const firstLine = (body: string) => {
  const i = body.indexOf("\n");
  return i < 0 ? { head: body, rest: "" } : { head: body.slice(0, i), rest: body.slice(i) };
};

/** Whether line 1 opens with a tag run and a colon (the template is on) */
export function hasTemplate(text: string, opts: SplitOptions): boolean {
  return LEAD_RUN.test(firstLine(splitPost(text, { ...opts, lenient: true }).body).head);
}

/** The tag line with `moved` put by the footer: before #RajasthanWithFirstIndia, after #FirstIndiaNews, else first */
function placeTags(hashtags: string[], moved: string[]): string[] {
  const have = new Set(hashtags.map(tagKey));
  const add = moved.filter((t) => !have.has(tagKey(t)));
  const at = (footer: string) => hashtags.findIndex((t) => tagKey(t) === tagKey(footer));
  const raj = at(RAJASTHAN_FOOTER);
  if (raj >= 0) return [...hashtags.slice(0, raj), ...add, ...hashtags.slice(raj)];
  const nat = at(NATIONAL_FOOTER);
  if (nat >= 0) return [...hashtags.slice(0, nat + 1), ...add, ...hashtags.slice(nat + 1)];
  return [...add, ...hashtags];
}

/** Template OFF: the run off line 1, its Latin tags onto the tag line. Null when line 1 has no run. */
export function templateOff(text: string, format: PostFormat, opts: SplitOptions): { text: string; move: TemplateMove } | null {
  const split = splitPost(text, { ...opts, lenient: true });
  const { head, rest } = firstLine(split.body);
  const m = LEAD_RUN.exec(head);
  if (!m) return null;
  const tags = m[1]!.trim().split(/\s+/);
  // The first Hindi tag is the town, kept as text; every other tag (a second Hindi one too) goes to the tag line
  const hindi = tags.find((t) => DEVANAGARI.test(t));
  const moved = tags.filter((t) => t !== hindi);
  const town = hindi ? hindi.slice(1) : null;
  const headline = head.slice(m[0].length);
  const newHead = town ? `${town}: ${headline}` : headline;
  return { text: format(newHead + rest, placeTags(split.hashtags, moved), split.mentions), move: { moved, town } };
}

/**
 * Template ON: what `move` took off goes back in front of line 1, and its tags leave the tag line. The desk's edits
 * since are kept: a moved tag it deleted is not put back, and the town comes back as a tag only if line 1 still
 * opens with it. Null when line 1 already has a run.
 */
export function templateOn(text: string, move: TemplateMove, format: PostFormat, opts: SplitOptions): string | null {
  const split = splitPost(text, { ...opts, lenient: true });
  const { head, rest } = firstLine(split.body);
  if (LEAD_RUN.test(head)) return null;
  const movedKeys = new Set(move.moved.map(tagKey));
  const back = split.hashtags.filter((t) => movedKeys.has(tagKey(t)));
  const hashtags = split.hashtags.filter((t) => !movedKeys.has(tagKey(t)));
  let headline = head.trimStart();
  const townPrefix = move.town ? `${move.town}:` : null;
  const run = [...back];
  if (townPrefix && headline.startsWith(townPrefix)) {
    headline = headline.slice(townPrefix.length).trimStart();
    run.push(`#${move.town}`);
  }
  if (!run.length) return null;
  return format(`${run.join(" ")}: ${headline}${rest}`, hashtags, split.mentions);
}
