"use client";

// Where to land after sign-in: the X desk when this person may open it, else the first page the left
// navigation offers them (same checks as leftNavigation.tsx), else their profile (open to everyone).

import { AI_CONTENT_PLATFORMS } from "@/components/leftNavigation/aiContentPlatforms";
import { REJECTED_NEWS_PATH, REJECTED_NEWS_PERMISSION } from "@/lib/rejectedNews";
import { usePhase } from "@/lib/socia/usePhase";
import { postStudioKey } from "./catalogue";
import { usePermissions } from "./usePermissions";

export const PREFERRED_HOME = "/ai-content/x";

/** Null until the permissions have loaded. */
export function useHomePath(): string | null {
  const { ready, can } = usePermissions();
  const { known, showsPlatform } = usePhase();
  if (!ready) return null;
  // A server that sends no phase switches nothing off
  const studios = AI_CONTENT_PLATFORMS.filter((p) => can(postStudioKey(p.platformKey)) && (!known || showsPlatform(p.platformKey)));
  const x = studios.find((p) => p.path === PREFERRED_HOME);
  if (x) return x.path;
  const pages: [string, boolean][] = [
    [REJECTED_NEWS_PATH, can(REJECTED_NEWS_PERMISSION)],
    ["/digital", can("page.dashboard")],
    ["/web-scraper", can("page.web_scraper")],
    ...studios.map((p): [string, boolean] => [p.path, true]),
  ];
  return pages.find(([, ok]) => ok)?.[0] ?? "/profile";
}
