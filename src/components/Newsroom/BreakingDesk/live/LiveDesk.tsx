"use client";

// The Breaking Desk on the real Socia backend. The desk's components were built on the demo data in
// src/data; this provider polls the API and hands them the same shapes, plus the actions that only
// exist live (claim, approve with the server's undo window, restore, retry). Mounted only when
// NEXT_PUBLIC_USE_MOCKS is off, so in demo mode `useLiveDesk()` is null and nothing here runs.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as socia from "@/lib/socia/api";
import { SOCIA_API_URL, POLL_MS } from "@/lib/socia/config";
import { usePolled, type Polled } from "@/lib/socia/usePolled";
import { usePermissions } from "@/lib/access/usePermissions";
import { usePhase } from "@/lib/socia/usePhase";
import { LiveProvider } from "@/lib/socia/live";
import {
  errorCode,
  errorText,
} from "@/components/Newsroom/SociaDesk/liveShared";
import type {
  Counts,
  DraftMedia,
  DraftView,
  PublishedPost,
  QueueFacets,
  QueueItem,
  QueueQuery,
  QueueResponse,
  RejectReasonCode,
  UserCardTemplate,
  OrgCardTemplate,
} from "@/lib/socia/types";
import type { FtpMedia, FtpNewsItem, SocialPost } from "@/types/newsroom";
import { draftCardHeadline, queueCardBody } from "../cardWords";
import { istToday } from "../deskRules";

/** A queue or feed story on the live desk: the demo shape plus the draft it came from. */
export interface LiveNewsItem extends FtpNewsItem {
  live: QueueItem;
}

export const isLiveItem = (item: FtpNewsItem): item is LiveNewsItem =>
  "live" in item;

/**
 * File links from the API point at the API's own host. When the desk reaches the API through this app's
 * /socia-api proxy, files go the same way, so the card editor can read their pixels (same origin) and
 * export the card. Absolute links elsewhere (signed storage URLs) are left alone.
 */
export function fileUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (!SOCIA_API_URL.startsWith("/")) return url;
  try {
    const u = new URL(url, window.location.origin);
    if (u.pathname.startsWith("/dev-files/"))
      return `${SOCIA_API_URL}${u.pathname}${u.search}`;
  } catch {
    // Not a URL; use as is
  }
  return url;
}

/**
 * The card background must load from this app's origin (through the /socia-api proxy), or the editor
 * could not export the card drawn on it. API paths ("/me/...") get the API base; links to the API's own
 * host go through the proxy; anything else (signed storage URLs) is left alone.
 */
export function apiFileUrl(url: string | null | undefined): string {
  if (!url) return "";
  const proxied = SOCIA_API_URL.startsWith("/");
  if (url.startsWith("/")) return proxied && url.startsWith(`${SOCIA_API_URL}/`) ? url : `${SOCIA_API_URL}${url}`;
  if (!proxied) return url;
  try {
    const u = new URL(url);
    if (u.origin !== window.location.origin && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || /^\/(dev-files|me)\//.test(u.pathname)))
      return `${SOCIA_API_URL}${u.pathname}${u.search}`;
  } catch {
    // Not a URL; use as is
  }
  return url;
}

/** Breaking stories on the live desk carry no Big Breaking tag yet; every story shows as Breaking. */
const LIVE_TAG = "breaking" as const;

/**
 * Same id and same server data as the last poll: the same object, so memoised rows skip the re-render.
 * Module-level and bounded; a poll brings at most a few hundred items.
 */
const newsCache = new Map<string, { key: string; news: LiveNewsItem }>();
export function stableQueueToNews(item: QueueItem): LiveNewsItem {
  const key = JSON.stringify(item);
  const hit = newsCache.get(item.id);
  if (hit && hit.key === key) return hit.news;
  if (newsCache.size > 2000) newsCache.clear();
  const news = queueToNews(item);
  newsCache.set(item.id, { key, news });
  return news;
}

/**
 * Cookies go only to this app's origin (the /socia-api proxy) or the configured API origin; any other host
 * (a signed storage URL) is fetched without them.
 */
export function credentialsFor(url: string): RequestCredentials {
  try {
    const u = new URL(url, window.location.origin);
    if (u.origin === window.location.origin) return "include";
    const api = new URL(SOCIA_API_URL, window.location.origin);
    return u.origin === api.origin ? "include" : "omit";
  } catch {
    return "omit";
  }
}

export function queueToNews(item: QueueItem): LiveNewsItem {
  return {
    id: item.id,
    headline: item.headline,
    // Cards drawn from this row (list thumbnails) read the story, like the editor's card; the post text is shortText
    body: queueCardBody(item),
    shortText: item.bodyText,
    tag: LIVE_TAG,
    area: item.district ?? "",
    people: [],
    ftpPath: item.slug,
    // The queue lists the drawn card, not the photos; the editor loads the photos from the draft
    media: [
      { kind: "image", url: fileUrl(item.cardUrl), fileName: "card.png" },
    ],
    receivedAt: item.receivedAt,
    live: item,
  };
}

/** Footage the editor can draw on: copied photos and videos (files only recorded on the FTP have no link). */
export function draftMedia(media: DraftMedia[] | undefined): FtpMedia[] {
  return (media ?? [])
    .filter((m) => m.copied && m.url)
    .map((m) => ({ kind: m.kind, url: fileUrl(m.url), fileName: m.fileName }));
}

/** The editor's story, built from the full draft. */
export function draftToNews(d: DraftView): FtpNewsItem {
  const media = draftMedia(d.media);
  return {
    id: d.id,
    // The editor's card starts from these words: "<District>: <headline>", never the post's place hashtags
    headline: draftCardHeadline(d.story.headline, d),
    body: d.story.body,
    shortText: d.bodyText,
    tag: LIVE_TAG,
    area: d.story.district ?? "",
    people: [],
    ftpPath: d.story.external?.footagePath ?? d.story.slug,
    // A story without footage still opens: the template draws on its dark backdrop
    media: media.length
      ? media
      : [{ kind: "image", url: "", fileName: "No photo from the FTP" }],
    receivedAt: d.story.receivedAt,
  };
}

export function postToSocial(p: PublishedPost): SocialPost {
  return {
    id: p.id,
    newsId: p.draftId,
    platform: "X (Twitter)",
    headline: p.headline ?? p.text,
    text: p.text,
    hashtags: [],
    mentions: [],
    mediaKind: "image",
    thumbUrl: fileUrl(p.cardUrl),
    // Copy & Mark Posted records no link
    postUrl: p.permalink ?? "",
    postedAt: p.publishedAt,
    postedBy: p.publishedBy ?? (p.manual ? "Posted by hand" : "Socia"),
    status: p.recalled ? "recalled" : "live",
    recalledAt: p.recalled?.at,
    recallReason: p.recalled?.reason,
    byHand: !!(p.copied || p.manual),
    postedByName: p.publishedBy,
  };
}

/**
 * A post waiting out the server's 10-second undo window, then its outcome. Phase 1's Copy & Mark Posted
 * uses the same toast (`copied`): the post is already in Posted and Undo puts it back in the queue.
 */
export interface LivePending {
  id: string;
  draftId: string;
  jobId: string;
  sendAt: string;
  headline: string;
  outcome?:
    { kind: "posted"; permalink: string } | { kind: "failed"; message: string };
  /** Copy & Mark Posted: the server allows Undo until `undoUntil`; the toast offers it while it is shown */
  copied?: { undoUntil: string; withCard: boolean };
}

/** How long the Copy & Mark Posted toast stays (Undo stays in the Posted tab for the server's 5 minutes) */
const COPIED_TOAST_MS = 12_000;

interface LiveDeskValue {
  canAct: boolean;
  /** Phase 1: the chosen day's whole inbox (`truncated` when the page cap left older stories out) */
  inbox: Polled<socia.QueueDay>;
  sending: Polled<QueueResponse>;
  failed: Polled<QueueResponse>;
  rejected: Polled<QueueResponse>;
  posts: Polled<{ items: PublishedPost[] }>;
  counts: Polled<Counts>;
  /** The signed-in user's X card background; `data.template` is null until they upload one */
  cardTemplate: Polled<{ template: UserCardTemplate | null }>;
  /** The desk's shared X card designs; [] on a server without them (the editor then works as before) */
  orgCardTemplates: Polled<OrgCardTemplate[]>;
  /** The inbox, in the desk's story shape */
  queue: LiveNewsItem[];
  /** Phase 1 while an earlier day is shown: today's inbox (for the new-posts pill); null otherwise */
  todayQueue: LiveNewsItem[] | null;
  /** Phase 1 (set on the server): ready posts from the breaking files, Copy & Mark Posted, no X API posting */
  phase1: boolean;
  /** The phase has been read from /me; until then the desk shows a loading state, not phase 2 */
  phaseKnown: boolean;
  /** Phase 1: the server-side filters the inbox and Posted views are fetched with */
  queueQuery: QueueQuery;
  setQueueQuery: (q: QueueQuery) => void;
  /** Phase 1: drafts marked with Copy & Mark Posted (newest first), with the same filters */
  postedView: Polled<QueueResponse>;
  /** Phase 1: counts for the filter menus, over the whole view */
  facets: { inbox: Polled<QueueFacets>; posted: Polled<QueueFacets> };
  /** Copy & Mark Posted went through: show the toast with Undo */
  addCopied: (p: { draftId: string; postId: string; headline: string; undoUntil: string; withCard: boolean }) => void;
  /** Undo a Copy & Mark Posted from the Posted list (within the server's window). Resolves to an error sentence or null. */
  undoCopied: (draftId: string) => Promise<string | null>;
  /** Polls everything now; resolves to the number of stories that were not in the inbox before */
  refreshAll: () => Promise<number>;
  /** Polls everything now (the queue's refresh icon); rejects when the queue itself could not be loaded */
  refreshStrict: () => Promise<void>;
  /**
   * Asks the worker to read the share now (POST /ingest/scan), then polls everything again 2.5 s and 6 s later so a
   * story it takes shows up (a new file needs two looks 2 s apart). Resolves once asked; refresh the lists then.
   */
  scanNow: () => Promise<void>;
  pending: LivePending[];
  addPending: (p: Omit<LivePending, "id">) => void;
  undo: (id: string) => Promise<string | null>;
  dismiss: (id: string) => void;
  /** Reject straight from the queue (claims first, as the backend requires). Resolves to an error sentence or null. */
  rejectFromQueue: (
    draftId: string,
    reason: RejectReasonCode,
    note: string,
  ) => Promise<string | null>;
  restore: (draftId: string) => Promise<string | null>;
  retry: (draftId: string) => Promise<string | null>;
  recall: (postId: string, reason: string) => Promise<string | null>;
}

const LiveDeskContext = createContext<LiveDeskValue | null>(null);

/** The live desk, or null in demo mode. */
export const useLiveDesk = () => useContext(LiveDeskContext);

const tryAction = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (err) {
    return errorText(err);
  }
};

/** How often the whole chosen day is read again; between reads only its first page is (every POLL_MS.queue) */
const DAY_REREAD_MS = 60_000;

/**
 * `templatesOnly`: for Post Studio → Templates, which needs only the card templates, the actions on them and
 * canAct. Every other poller stays off, so that page sends nothing but template calls.
 */
export function LiveDeskProvider({ children, templatesOnly = false }: { children: React.ReactNode; templatesOnly?: boolean }) {
  // Opening a story to work on it needs draft.edit; the finer actions check their own permission
  const { can } = usePermissions();
  const canAct = can("draft.edit");
  // Nothing is fetched until the phase is known, so a phase 1 desk never starts on phase 2's views
  const { phase1, known: phaseRead } = usePhase();
  // The desk's pollers wait for the phase, and stay off on the Templates page
  const phaseKnown = phaseRead && !templatesOnly;
  // Phase 1 filters on the server, so a day's ~700 files stay quick to narrow; the key refetches on change
  const [queueQuery, setQueueQuery] = useState<QueueQuery>({});
  // The inbox is read by day only (the desk narrows it in the browser, so the day's counts stay whole); the
  // other filters go to the server for Posted
  const day = queueQuery.day;
  const inboxQuery = useMemo<QueueQuery>(() => (day ? { day } : {}), [day]);
  const queryKey = phase1 ? JSON.stringify(inboxQuery) : "";
  // The day picks the inbox only; Posted is always today's
  const postedQuery = useMemo(() => {
    const { day: _day, ...rest } = queueQuery;
    void _day;
    return rest;
  }, [queueQuery]);
  const postedKey = phase1 ? JSON.stringify(postedQuery) : "";
  // While an earlier day is shown, today's inbox is still watched so new arrivals can be announced
  const todayIst = istToday();
  const pastDay = phase1 && !!queueQuery.day && queueQuery.day !== todayIst;

  // Phase 1 holds the whole chosen day, so its All / BIG Breaking / Breaking counts are the day's. Every page is
  // read when the day changes, on the refresh icon, after a failed read (so Try again reads it all), and every
  // DAY_REREAD_MS; the 5 s tick reads only the first page and joins it to the held day (mergeQueueHead).
  const dayHeld = useRef<{ key: string; day: socia.QueueDay; readAt: number } | null>(null);
  const rereadDay = useRef(false);
  /** The inbox's latest answer, set as it lands (refreshAll counts new stories against it) */
  const lastInbox = useRef<socia.QueueDay | null>(null);
  const inbox = usePolled<socia.QueueDay>(
    async (signal) => {
      try {
        if (!phase1) return (lastInbox.current = { ...(await socia.fetchQueue("inbox", 200, undefined, undefined, signal)), truncated: false });
        const held = dayHeld.current;
        if (held && held.key === queryKey && !rereadDay.current && Date.now() - held.readAt < DAY_REREAD_MS) {
          const head = await socia.fetchQueue("inbox", socia.QUEUE_PAGE_MAX, inboxQuery, undefined, signal);
          const merged = socia.mergeQueueHead(head, held.day);
          if (merged) {
            dayHeld.current = { ...held, day: merged };
            return (lastInbox.current = merged);
          }
        }
        const whole = await socia.fetchQueueDay("inbox", inboxQuery, signal);
        dayHeld.current = { key: queryKey, day: whole, readAt: Date.now() };
        rereadDay.current = false;
        return (lastInbox.current = whole);
      } catch (err) {
        if (!signal.aborted) rereadDay.current = true;
        throw err;
      }
    },
    POLL_MS.queue,
    `inbox${queryKey}`,
    phaseKnown,
  );
  const refreshInbox = inbox.refresh;
  // Phase 1 posts nothing through the X API, so nothing is ever sending or failed
  const sending = usePolled(
    () => socia.fetchQueue("sending", 100),
    POLL_MS.queue,
    "sending",
    phaseKnown && !phase1,
  );
  const failed = usePolled(
    () => socia.fetchQueue("failed", 100),
    POLL_MS.counts,
    "failed",
    phaseKnown && !phase1,
  );
  const postedView = usePolled(
    () => socia.fetchQueue("posted", 200, postedQuery),
    POLL_MS.posts,
    `posted${postedKey}`,
    phaseKnown && phase1,
  );
  const todayInbox = usePolled(
    (signal) => socia.fetchQueue("inbox", 200, { day: todayIst ?? undefined }, undefined, signal),
    POLL_MS.queue,
    `inbox-today${todayIst}`,
    phaseKnown && pastDay,
  );
  const inboxFacets = usePolled(() => socia.fetchQueueFacets("inbox"), POLL_MS.counts, "facets-inbox", phaseKnown && phase1);
  const postedFacets = usePolled(() => socia.fetchQueueFacets("posted"), POLL_MS.counts, "facets-posted", phaseKnown && phase1);
  const facets = useMemo(() => ({ inbox: inboxFacets, posted: postedFacets }), [inboxFacets, postedFacets]);
  const rejected = usePolled(
    () => socia.fetchQueue("rejected", 100),
    POLL_MS.counts,
    "rejected",
    phaseKnown,
  );
  const posts = usePolled(() => socia.fetchPosts(100), POLL_MS.posts, "posts", phaseKnown);
  const counts = usePolled(
    () => socia.fetchCountsOrDerive(),
    POLL_MS.counts,
    "counts",
    phaseKnown,
  );

  // Changes only from the Templates page, which refreshes it; the slow poll picks up another tab's change
  const cardTemplate = usePolled(
    () => socia.fetchCardTemplate("x"),
    POLL_MS.cardTemplate,
    "card-template",
    phaseRead,
  );
  const orgCardTemplates = usePolled(() => socia.fetchOrgCardTemplates("x"), POLL_MS.cardTemplate, "org-card-templates", phaseRead);

  const queue = useMemo(
    () => (inbox.data?.items ?? []).map(stableQueueToNews),
    [inbox.data],
  );
  const todayData = pastDay ? todayInbox.data : null;
  const todayQueue = useMemo(() => (todayData ? todayData.items.map(stableQueueToNews) : null), [todayData]);

  const pollers = () =>
    phase1
      ? [refreshInbox, rejected.refresh, posts.refresh, counts.refresh, postedView.refresh, inboxFacets.refresh, postedFacets.refresh]
      : [refreshInbox, sending.refresh, failed.refresh, rejected.refresh, posts.refresh, counts.refresh];
  const refreshers = useRef(pollers());
  // The same pollers' soft refresh, for live queue events: never cancels a read already running
  const nudgers = () =>
    phase1
      ? [inbox.nudge, rejected.nudge, posts.nudge, counts.nudge, postedView.nudge, inboxFacets.nudge, postedFacets.nudge]
      : [inbox.nudge, sending.nudge, failed.nudge, rejected.nudge, posts.nudge, counts.nudge];
  const nudges = useRef(nudgers());
  useEffect(() => {
    refreshers.current = pollers();
    nudges.current = nudgers();
  });
  const known = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (inbox.data) known.current = new Set(inbox.data.items.map((i) => i.id));
  }, [inbox.data]);

  // The inbox is read once here (its own poller, first page joined to the held day), then counted against
  // what was shown before
  const refreshAll = useCallback(async () => {
    const before = known.current;
    const answerBefore = lastInbox.current;
    await Promise.all(refreshers.current.map((r) => r()));
    const answer = lastInbox.current;
    return answer && answer !== answerBefore ? answer.items.filter((i) => !before.has(i.id)).length : 0;
  }, []);
  // The refresh icon: a one-story check that rejects when the queue cannot be loaded, then the whole day again
  const refreshStrict = useCallback(async () => {
    await socia.fetchQueue("inbox", 1, phase1 ? inboxQuery : undefined);
    rereadDay.current = true;
    await Promise.all(refreshers.current.map((r) => r()));
  }, [phase1, inboxQuery]);
  const refreshSoon = useCallback(
    () => void Promise.all(refreshers.current.map((r) => r())),
    [],
  );
  // "Scan now" (Check now, the refresh icon, F5): the worker reads the share within ~1 s; the follow-up polls catch
  // the story it takes. A failed ask is not shown: the lists refresh anyway and the health light shows a stopped worker.
  const scanFollowUps = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scanNow = useCallback(async () => {
    try {
      await socia.scanNow();
    } catch {
      // see above
    }
    scanFollowUps.current.forEach(clearTimeout);
    scanFollowUps.current = [2500, 6000].map((ms) => setTimeout(refreshSoon, ms));
  }, [refreshSoon]);
  useEffect(() => () => scanFollowUps.current.forEach(clearTimeout), []);
  // F5 on the desk (list and editor) = scan now + refresh; Ctrl/Shift+F5 still reload the page
  useEffect(() => {
    if (!phaseKnown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F5" || e.ctrlKey || e.shiftKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      if (e.repeat) return;
      void scanNow().then(refreshAll);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phaseKnown, scanNow, refreshAll]);
  /** A live queue event (live.tsx calls it at most every 2 s, visible tabs only): a soft refresh of every list */
  const nudgeAll = useCallback(() => nudges.current.forEach((n) => n()), []);

  // ─── Undo window ───────────────────────────────────────────────────────────
  const [pending, setPending] = useState<LivePending[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setPending((list) => list.filter((p) => p.id !== id));
  }, []);

  const settle = useCallback(
    (id: string, outcome: LivePending["outcome"]) => {
      setPending((list) =>
        list.map((p) => (p.id === id ? { ...p, outcome } : p)),
      );
      refreshSoon();
      // Keep the result on screen a moment, then clear it
      timers.current.set(
        id,
        setTimeout(
          () => dismiss(id),
          outcome?.kind === "failed" ? 15000 : 8000,
        ),
      );
    },
    [dismiss, refreshSoon],
  );

  // After the send time, follow the draft until the worker has posted it (or given up)
  const watch = useCallback(
    (p: LivePending) => {
      const step = (attempt: number) => {
        const wait =
          attempt === 0
            ? Math.max(0, new Date(p.sendAt).getTime() - Date.now()) + 800
            : 1500;
        timers.current.set(
          p.id,
          setTimeout(async () => {
            try {
              const d = await socia.fetchDraft(p.draftId);
              if (d.status === "published") {
                const list = await socia.fetchPosts(20);
                const post = list.items.find((x) => x.draftId === p.draftId);
                settle(p.id, {
                  kind: "posted",
                  permalink: post?.permalink ?? "",
                });
                return;
              }
              if (d.status === "failed") {
                settle(p.id, {
                  kind: "failed",
                  message:
                    d.job?.error ??
                    "X refused the post. Open the Sending tab to retry.",
                });
                return;
              }
              // Undone from another screen: nothing left to report
              if (d.status !== "queued" && d.status !== "publishing") {
                dismiss(p.id);
                refreshSoon();
                return;
              }
            } catch {
              // A missed poll; try again
            }
            if (attempt < 60) step(attempt + 1);
            else
              settle(p.id, {
                kind: "failed",
                message: "Still sending after a minute. Check the Sending tab.",
              });
          }, wait),
        );
      };
      step(0);
    },
    [dismiss, settle, refreshSoon],
  );

  const addPending = useCallback(
    (p: Omit<LivePending, "id">) => {
      const entry = { ...p, id: p.jobId };
      setPending((list) => [...list.filter((x) => x.id !== entry.id), entry]);
      watch(entry);
      refreshSoon();
    },
    [watch, refreshSoon],
  );

  const addCopied = useCallback(
    (c: { draftId: string; postId: string; headline: string; undoUntil: string; withCard: boolean }) => {
      const id = `copied:${c.postId}`;
      clearTimeout(timers.current.get(id));
      setPending((list) => [
        ...list.filter((x) => x.id !== id),
        { id, draftId: c.draftId, jobId: c.postId, sendAt: c.undoUntil, headline: c.headline, copied: { undoUntil: c.undoUntil, withCard: c.withCard } },
      ]);
      timers.current.set(id, setTimeout(() => dismiss(id), COPIED_TOAST_MS));
      refreshSoon();
    },
    [dismiss, refreshSoon],
  );

  const undoCopied = useCallback(
    async (draftId: string) => {
      const error = await tryAction(() => socia.undoCopyPosted(draftId));
      if (!error) setPending((list) => list.filter((p) => !(p.copied && p.draftId === draftId)));
      refreshSoon();
      return error;
    },
    [refreshSoon],
  );

  const undo = useCallback(
    async (id: string) => {
      const p = pending.find((x) => x.id === id);
      if (!p) return null;
      if (p.copied) {
        const error = await undoCopied(p.draftId);
        if (!error) dismiss(id);
        return error;
      }
      const error = await tryAction(async () => {
        await socia.undoJob(p.jobId);
        // Undo hands the draft back claimed; let it go so it is free in the queue again
        await socia.releaseDraft(p.draftId).catch(() => undefined);
      });
      if (!error) dismiss(id);
      refreshSoon();
      return error;
    },
    [pending, dismiss, refreshSoon, undoCopied],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  // ─── Queue actions ─────────────────────────────────────────────────────────
  const rejectFromQueue = useCallback(
    async (draftId: string, reason: RejectReasonCode, note: string) => {
      const error = await tryAction(async () => {
        const item = inbox.data?.items.find((i) => i.id === draftId);
        if (!item?.claim?.mine) await socia.claimDraft(draftId);
        try {
          await socia.rejectDraft(draftId, reason, note || undefined);
        } catch (err) {
          // Leave the story as it was if the reject itself failed
          await socia.releaseDraft(draftId).catch(() => undefined);
          throw err;
        }
      });
      refreshSoon();
      return error;
    },
    [inbox.data, refreshSoon],
  );

  const restore = useCallback(
    async (draftId: string) => {
      const error = await tryAction(() => socia.restoreDraft(draftId));
      refreshSoon();
      return error;
    },
    [refreshSoon],
  );

  const retry = useCallback(
    async (draftId: string) => {
      const error = await tryAction(() => socia.retryDraft(draftId));
      refreshSoon();
      return error;
    },
    [refreshSoon],
  );

  const recall = useCallback(
    async (postId: string, reason: string) => {
      const error = await tryAction(() => socia.recallPost(postId, reason));
      refreshSoon();
      return error;
    },
    [refreshSoon],
  );

  const value = useMemo<LiveDeskValue>(
    () => ({
      canAct,
      inbox,
      sending,
      failed,
      rejected,
      posts,
      counts,
      cardTemplate,
      orgCardTemplates,
      queue,
      todayQueue,
      phase1,
      phaseKnown: phaseRead,
      queueQuery,
      setQueueQuery,
      postedView,
      facets,
      addCopied,
      undoCopied,
      refreshAll,
      refreshStrict,
      scanNow,
      pending,
      addPending,
      undo,
      dismiss,
      rejectFromQueue,
      restore,
      retry,
      recall,
    }),
    [
      canAct,
      inbox,
      sending,
      failed,
      rejected,
      posts,
      counts,
      cardTemplate,
      orgCardTemplates,
      queue,
      todayQueue,
      phase1,
      phaseRead,
      queueQuery,
      postedView,
      facets,
      addCopied,
      undoCopied,
      refreshAll,
      refreshStrict,
      scanNow,
      pending,
      addPending,
      undo,
      dismiss,
      rejectFromQueue,
      restore,
      retry,
      recall,
    ],
  );
  return (
    <LiveDeskContext.Provider value={value}>
      {/* Presence and watch mode (src/lib/socia/live.tsx). Off on the Templates page; while connected, a queue
          event refreshes the desk sooner (polling carries on as the fallback) */}
      <LiveProvider enabled={phaseKnown} onQueueEvent={nudgeAll}>
        {children}
      </LiveProvider>
    </LiveDeskContext.Provider>
  );
}

export { errorCode, errorText };
