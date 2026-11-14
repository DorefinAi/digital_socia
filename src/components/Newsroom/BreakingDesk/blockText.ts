// A desk template's heading and story are typed in one box on the card, as one text: the heading, a blank line,
// the story. These turn the two into that text and back.

/** The heading, a blank line, the story: the one text typed in the card's text box */
export const joinBlockText = (headline: string, body: string) => `${headline}\n\n${body}`;

/**
 * The typed text back as heading and story: the heading is everything before the first blank line, the story
 * everything after it. Without a blank line the first line is the heading and the rest the story.
 */
export function splitBlockText(text: string): { headline: string; body: string } {
  const value = text.replace(/\r\n?/g, "\n");
  const blank = value.indexOf("\n\n");
  if (blank >= 0) return { headline: value.slice(0, blank), body: value.slice(blank + 2) };
  const line = value.indexOf("\n");
  if (line >= 0) return { headline: value.slice(0, line), body: value.slice(line + 1) };
  return { headline: value, body: "" };
}
