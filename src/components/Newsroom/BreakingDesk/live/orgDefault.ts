// Which desk card design a story starts on, and which one the template switch button moves to. Pure, no browser.

import type { OrgCardTemplate } from "../../../../lib/socia/types";

/**
 * The desk design a story starts on, the same for every story (owner, 24 Nov 2026): the regular BREAKING NEWS
 * card, the square one (1080 × 1080, slug "breaking-square"), whatever the designs' "default for" settings say
 * (on the live desk they had बड़ी ख़बर as the Breaking default). Then any square design, then the Breaking
 * default, then the first. The desk switches it per story (the Template tab, or the switch button by the post
 * panel). Null without org templates.
 */
export const REGULAR_TEMPLATE_SLUG = "breaking-square";
export function defaultOrgTemplate(org: OrgCardTemplate[]): OrgCardTemplate | null {
  return (
    org.find((o) => o.slug === REGULAR_TEMPLATE_SLUG) ??
    org.find((o) => !!o.width && o.width === o.height) ??
    org.find((o) => (o.defaultFor as string[]).includes("breaking")) ??
    org[0] ??
    null
  );
}

/**
 * The design the card template switch button moves to: the one after `current` in the desk's list, wrapping to the
 * first (BREAKING NEWS → बड़ी ख़बर → BREAKING NEWS); the first when the card is on none of them (your own background).
 * Null with fewer than two designs: there is nothing to switch to.
 */
export function nextOrgTemplate<T extends { slug: string }>(org: readonly T[], current: string | null): T | null {
  if (org.length < 2) return null;
  return org[(org.findIndex((t) => t.slug === current) + 1) % org.length] ?? null;
}
