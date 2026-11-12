// The key of a card drawn on the operator's X background (useBackgroundCard): what the drawing shows and which
// draft it is for. Pure, so the key and its reader are unit-checked together (cardKey.test.ts).

import type { DrawableCardTemplate } from "@/lib/socia/types";
import { CARD_DRAW_VERSION } from "./cardFit";

/** Position of the draft id (the scope) in the key; the drawing version comes first */
const SCOPE_AT = 1;

/** The key of a drawing: drawing version, draft id (`scope`), background, layout, date and words */
export const backgroundCardKey = (scope: string, template: DrawableCardTemplate, date: string | null, headline: string, body: string): string =>
  JSON.stringify([CARD_DRAW_VERSION, scope, template.backgroundUrl, template.updatedAt, template.layout, date, headline, body]);

/** The draft a drawing was made for (read from backgroundCardKey's key), or null for anything else. */
export const keyScope = (key: string): string | null => {
  try {
    const parsed: unknown = JSON.parse(key);
    return Array.isArray(parsed) && typeof parsed[SCOPE_AT] === "string" ? parsed[SCOPE_AT] : null;
  } catch {
    return null;
  }
};
