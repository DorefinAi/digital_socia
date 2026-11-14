// The @ / # lookup under the tag pickers' "Add handle" / "Add hashtag" box (desk fixes 14 Nov, point 7): what is typed
// is searched, 150 ms after the last key, against the handle directory and the data files (GET /handles?mode=prefix),
// exact from the start of a handle or name. Enter or a click inserts the result exactly as the server gave it.

import { useEffect, useState } from "react";
import type { HandleSearchItem } from "../../../lib/socia/types";

export const TAG_SEARCH_DEBOUNCE_MS = 150;
/** The API's limit on q */
const MAX_TERM = 100;

/** What a typed draft searches for: without its leading @ / # and outer spaces; "" when there is nothing to search */
export function searchTerm(draft: unknown): string {
  if (typeof draft !== "string") return "";
  const term = draft.normalize("NFC").replace(/^\s*[@#]+/, "").trim().replace(/\s+/g, " ");
  return term.length > MAX_TERM ? "" : term;
}

/** The highlighted row after an arrow key: wraps; -1 (none) when there are no rows */
export function moveHighlight(current: number, count: number, key: "ArrowDown" | "ArrowUp"): number {
  if (count <= 0) return -1;
  if (key === "ArrowDown") return current < 0 || current >= count - 1 ? 0 : current + 1;
  return current <= 0 ? count - 1 : current - 1;
}

/** Results the picker can show: well-formed, with the right prefix, each value once (any case) */
export function usableResults(items: unknown, prefix: "#" | "@"): HandleSearchItem[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: HandleSearchItem[] = [];
  for (const raw of items) {
    const i = raw as Partial<HandleSearchItem> | null;
    if (!i || typeof i !== "object" || typeof i.value !== "string" || !i.value.startsWith(prefix) || i.value.length < 2) continue;
    const key = i.value.normalize("NFC").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ value: i.value.normalize("NFC"), name: typeof i.name === "string" ? i.name : "", nameHi: typeof i.nameHi === "string" ? i.nameHi : null, source: i.source ?? "directory" });
  }
  return out;
}

export type TagSearchFn = (q: string, kind: "mention" | "hashtag", signal: AbortSignal) => Promise<{ items: HandleSearchItem[] }>;

/**
 * The lookup's results for what is typed: none for an empty term or when switched off; a failed or out-of-date
 * request leaves nothing (the box still adds what was typed, as before).
 */
export function useTagSearch(draft: string, prefix: "#" | "@", search: TagSearchFn, enabled = true): HandleSearchItem[] {
  const term = enabled ? searchTerm(draft) : "";
  const [result, setResult] = useState<{ term: string; items: HandleSearchItem[] }>({ term: "", items: [] });
  useEffect(() => {
    if (!term) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      search(term, prefix === "@" ? "mention" : "hashtag", ctl.signal)
        .then((r) => {
          if (!ctl.signal.aborted) setResult({ term, items: usableResults(r?.items, prefix) });
        })
        .catch(() => {
          if (!ctl.signal.aborted) setResult({ term, items: [] });
        });
    }, TAG_SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [term, prefix, search]);
  // Only the results for the term on screen: nothing stale while the next request is on its way
  return term && result.term === term ? result.items : [];
}
