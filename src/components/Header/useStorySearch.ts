// Story search for the header modal: debounced, one request in flight, stale answers dropped.

import { useEffect, useState } from "react";
import { ApiError, isOffline } from "@/lib/socia/client";
import { searchStories } from "@/lib/socia/api";
import type { StorySearchItem } from "@/lib/socia/types";

const DEBOUNCE_MS = 250;
export const STORY_SEARCH_MIN = 2;
const STORY_SEARCH_MAX = 100;

export type StorySearchProblem = "offline" | "rate_limited" | "unavailable" | "failed";

/** The answer for one query and limit: its stories, or why there are none */
type Answer =
  | { q: string; limit: number; items: StorySearchItem[]; expanded: string[]; at: number; problem?: undefined }
  | { q: string; limit: number; problem: StorySearchProblem; message: string };

export interface StorySearchState {
  /** The trimmed query is long enough to search */
  active: boolean;
  /** A request for the current query is pending or in flight */
  loading: boolean;
  items: StorySearchItem[];
  expanded: string[];
  problem: StorySearchProblem | null;
  message: string | null;
  /** When the shown stories arrived (ms): the clock their ages are counted from */
  answeredAt: number;
}

function problemOf(err: unknown): { problem: StorySearchProblem; message: string } {
  if (isOffline(err)) return { problem: "offline", message: "Can't reach the Socia server, so stories aren't searched. Pages are still listed." };
  if (err instanceof ApiError && err.status === 429) return { problem: "rate_limited", message: "Too many searches in a short time. Wait a few seconds, then keep typing." };
  if (err instanceof ApiError && err.status === 404) return { problem: "unavailable", message: "Story search isn't on this server yet. Pages are still listed." };
  const detail = err instanceof Error && err.message ? err.message : "the server didn't answer";
  return { problem: "failed", message: `Story search failed: ${detail}` };
}

/** Clips the query to what the API takes, never in the middle of a surrogate pair */
const clip = (q: string) => Array.from(q.trim()).slice(0, STORY_SEARCH_MAX).join("");

/**
 * Searches stories for `query` once typing pauses (250 ms), from 2 characters. Each new query cancels the
 * request before it. While the next answer is on its way the last one stays on screen, so the list does not jump.
 */
export function useStorySearch(query: string, enabled: boolean, limit = 20): StorySearchState {
  const q = clip(query);
  const active = enabled && q.length >= STORY_SEARCH_MIN;
  const [answer, setAnswer] = useState<Answer | null>(null);
  // Nothing to search (modal closed, query too short, Pages only): forget the last answer, so the next
  // search never shows it as current. Adjusted while rendering; an effect would show it for a frame first.
  if (!active && answer !== null) setAnswer(null);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchStories(q, limit, controller.signal).then(
        (res) => {
          if (!controller.signal.aborted) setAnswer({ q, limit, items: res.items, expanded: res.expanded, at: Date.now() });
        },
        (err) => {
          if (controller.signal.aborted) return;
          setAnswer({ q, limit, ...problemOf(err) });
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, q, limit]);

  if (!active) return { active, loading: false, items: [], expanded: [], problem: null, message: null, answeredAt: 0 };
  const loading = answer?.q !== q || answer.limit !== limit;
  if (!answer || answer.problem) {
    return { active, loading, items: [], expanded: [], problem: answer?.problem ?? null, message: answer?.problem ? answer.message : null, answeredAt: 0 };
  }
  return { active, loading, items: answer.items, expanded: answer.expanded, problem: null, message: null, answeredAt: answer.at };
}
