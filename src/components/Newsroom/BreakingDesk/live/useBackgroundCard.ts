"use client";

// Keeps the card drawn on the operator's X background in step with the headline, the story and the
// date. Redraws a moment after the words stop changing; the last good drawing stays on screen meanwhile.

import { useCallback, useEffect, useRef, useState } from "react";
import type { UserCardTemplate } from "@/lib/socia/types";
import { apiFileUrl } from "./LiveDesk";
import { type DrawnCard, drawBackgroundCard, istDate } from "./backgroundCard";

export interface BackgroundCard {
  /** "none" when there is nothing to draw (no background, or not in use) */
  status: "none" | "drawing" | "ready" | "error";
  /** Identifies what the drawing shows; changes when any of its inputs change */
  key: string;
  /** The latest finished drawing; while a redraw runs it still shows the previous words */
  card: DrawnCard | null;
  error: string | null;
  /**
   * Resolves to the drawing of the current words (waits for a redraw in progress), or throws its error.
   * With `scope`, also throws when the drawing was made for another draft.
   */
  whenReady: (scope?: string) => Promise<{ key: string; card: DrawnCard }>;
}

interface Result {
  key: string;
  card: DrawnCard | null;
  error: string | null;
}

interface Deferred {
  key: string;
  promise: Promise<{ key: string; card: DrawnCard }>;
}

/** The draft a drawing was made for (the first part of its key). */
export const keyScope = (key: string): string | null => {
  try {
    const parsed: unknown = JSON.parse(key);
    return Array.isArray(parsed) && typeof parsed[0] === "string" ? parsed[0] : null;
  } catch {
    return null;
  }
};

/** A short fingerprint of a drawing key, to remember which drawing a draft's card is without storing the whole story. */
export function keyHash(key: string): string {
  // FNV-1a, 32-bit, twice with different seeds: plenty to tell drawings of one draft apart
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ key.length;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

/** `scope` names what the drawing is for (the draft id) and is part of its key. */
export function useBackgroundCard(template: UserCardTemplate | null | undefined, headline: string, body: string, maxBytes: number, scope = ""): BackgroundCard {
  const key = template ? JSON.stringify([scope, template.backgroundUrl, template.updatedAt, template.layout, istDate(template.layout.date.format), headline, body]) : "";
  const [result, setResult] = useState<Result | null>(null);
  const pending = useRef<Deferred | null>(null);
  const shownUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!template) return;
    let cancelled = false;
    let settle: { resolve: (v: { key: string; card: DrawnCard }) => void; reject: (e: Error) => void } | null = null;
    const promise = new Promise<{ key: string; card: DrawnCard }>((resolve, reject) => {
      settle = { resolve, reject };
    });
    // Nobody may be waiting; keep an unawaited failure from being reported as unhandled
    promise.catch(() => undefined);
    pending.current = { key, promise };
    // Typing in the headline redraws once the operator pauses
    const timer = setTimeout(async () => {
      try {
        const card = await drawBackgroundCard(template, apiFileUrl(template.backgroundUrl), { headline, body }, maxBytes);
        if (cancelled) {
          URL.revokeObjectURL(card.url);
          return;
        }
        if (shownUrl.current) URL.revokeObjectURL(shownUrl.current);
        shownUrl.current = card.url;
        setResult({ key, card, error: null });
        settle?.resolve({ key, card });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Your X background card didn't draw.";
        if (!cancelled) setResult((r) => ({ key, card: r?.card ?? null, error: message }));
        settle?.reject(new Error(message));
      }
    }, result ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      settle?.reject(new Error("The card changed while it was being drawn. Try again."));
    };
    // `key` covers every input; `result` only picks the first delay
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, maxBytes]);

  useEffect(
    () => () => {
      if (shownUrl.current) URL.revokeObjectURL(shownUrl.current);
    },
    [],
  );

  const whenReady = useCallback(async (scope?: string) => {
    // A redraw replaced by a newer one rejects; follow the newest until it settles
    for (let i = 0; i < 5; i++) {
      const current = pending.current;
      if (!current) break;
      try {
        const done = await current.promise;
        if (scope !== undefined && keyScope(done.key) !== scope) throw new Error("This card was drawn for another story. Try again.");
        return done;
      } catch (err) {
        if (pending.current === current) throw err;
      }
    }
    throw new Error("Your X background card isn't ready yet. Try again in a moment.");
  }, []);

  if (!template) return { status: "none", key: "", card: null, error: null, whenReady };
  const done = result?.key === key;
  return {
    status: done ? (result.error ? "error" : "ready") : "drawing",
    key,
    card: result?.card ?? null,
    error: done ? result.error : null,
    whenReady,
  };
}
