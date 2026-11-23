// Which desk card design a story starts on, and which one the template switch button moves to. Pure, no browser.

import type { OrgCardTemplate } from "../../../../lib/socia/types";

/**
 * The desk design a story starts on: the same for every story (owner, 24 Nov 2026: no BIG Breaking / Breaking
 * split, the template is not decided by the story's tag): the Breaking default (BREAKING NEWS), else the first
 * design. The desk switches it per story (the Template tab, or the switch button by the post panel). Null without
 * org templates.
 */
export function defaultOrgTemplate(org: OrgCardTemplate[]): OrgCardTemplate | null {
  return org.find((o) => (o.defaultFor as string[]).includes("breaking")) ?? org[0] ?? null;
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
