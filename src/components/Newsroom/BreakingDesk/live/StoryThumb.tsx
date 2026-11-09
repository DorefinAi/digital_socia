"use client";

// A list thumbnail: the story's photo or video poster when it has one, otherwise (live X desk with org
// templates) its card drawn on the design the editor would use. Draws only once the row is in or near view.

import React, { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { FtpNewsItem } from "@/types/newsroom";
import { storyTag } from "../shared";
import type { OrgCardTemplate, UserCardTemplate } from "@/lib/socia/types";
import { isLiveItem } from "./LiveDesk";
import { cardHeadlineText, queueCardHeadline } from "../cardWords";
import { cardChoiceOf, holdThumb, subscribeCardChoice, subscribeThumb, thumbKey, thumbTemplate, thumbUrl, unwantThumb, wantThumb, type ThumbJob } from "./storyThumbs";

/** A list that scrolls on its own marks itself with this attribute, so rows just below its fold draw early. */
export const THUMB_ROOT_ATTR = "data-thumb-root";

// One observer per scrolling list
const observers = new Map<Element | null, { io: IntersectionObserver; on: Map<Element, (visible: boolean) => void> }>();
function observe(el: Element, onChange: (visible: boolean) => void) {
  const root = el.closest(`[${THUMB_ROOT_ATTR}]`);
  let o = observers.get(root);
  if (!o) {
    const on = new Map<Element, (visible: boolean) => void>();
    const io = new IntersectionObserver((entries) => entries.forEach((e) => on.get(e.target)?.(e.isIntersecting)), { root, rootMargin: "240px 0px" });
    o = { io, on };
    observers.set(root, o);
  }
  o.on.set(el, onChange);
  o.io.observe(el);
  const entry = o;
  return () => {
    entry.io.unobserve(el);
    entry.on.delete(el);
    if (!entry.on.size) {
      entry.io.disconnect();
      observers.delete(root);
    }
  };
}

const fill: React.CSSProperties = { width: "100%", height: "100%", display: "block" };

interface StoryThumbProps {
  item: FtpNewsItem;
  /** The box the thumbnail fills, in CSS px; sets the drawing's resolution */
  boxW: number;
  boxH: number;
  /** The live desk's org templates (as polled, so the same array between polls); none: no drawn cards */
  org: OrgCardTemplate[] | null | undefined;
  /** The operator's own X background, for drafts where it was picked */
  own: UserCardTemplate | null | undefined;
}

/**
 * Fills its parent box (which keeps its own size and dark backdrop). Memoised: a queue poll that leaves the
 * story and the templates as they were doesn't re-render it.
 */
const StoryThumb = React.memo(function StoryThumb({ item, boxW, boxH, org, own }: StoryThumbProps) {
  const cover = item.media[0];
  const coverUrl = cover?.posterUrl ?? cover?.url ?? "";
  const live = isLiveItem(item);
  const draftId = item.id;
  const choice = useSyncExternalStore(subscribeCardChoice, () => cardChoiceOf(draftId), () => null);
  const pick = !coverUrl && live && org ? thumbTemplate(org, own ?? null, storyTag(item), choice) : null;
  const template = pick?.template ?? null;
  const designKey = pick?.key ?? "";
  const headline = live ? queueCardHeadline(item.live) : cardHeadlineText(item.headline);
  const { body } = item;

  const drawing = useMemo((): { key: string; job: ThumbJob } | null => {
    if (!template || !designKey) return null;
    const W = template.width || 1;
    const H = template.height || 1;
    // Cover-fit into the box at up to 2x, rounded so near-equal boxes share a drawing
    const dpr = typeof window === "undefined" ? 2 : Math.min(2, window.devicePixelRatio || 1);
    const px = Math.ceil((Math.max(boxW, (boxH * W) / H) * dpr) / 8) * 8;
    return { key: thumbKey(draftId, designKey, template, px, headline, body), job: { template, headline, body, px } };
  }, [draftId, designKey, template, headline, body, boxW, boxH]);
  const key = drawing?.key ?? "";

  // Stable per key, so a poll's re-render doesn't resubscribe 200 rows
  const subscribe = useCallback((l: () => void) => (key ? subscribeThumb(key, l) : () => undefined), [key]);
  const url = useSyncExternalStore(subscribe, () => (key ? thumbUrl(key) : undefined), () => undefined);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => (key ? holdThumb(key) : undefined), [key]);
  useEffect(() => {
    const el = ref.current;
    if (!drawing || url !== undefined || !el) return;
    const stop = observe(el, (visible) => (visible ? wantThumb(drawing.key, drawing.job) : unwantThumb(drawing.key)));
    return () => {
      stop();
      unwantThumb(drawing.key);
    };
  }, [drawing, url]);

  if (coverUrl) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img src={coverUrl} alt="" loading="lazy" style={{ ...fill, objectFit: "cover" }} />;
  }
  if (!drawing) return null;
  // Top of the card: the design's banner and the start of the headline
  return url ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={url} alt="" decoding="async" style={{ ...fill, objectFit: "cover", objectPosition: "50% 0" }} />
  ) : (
    <span ref={ref} aria-hidden style={fill} />
  );
});

export default StoryThumb;
