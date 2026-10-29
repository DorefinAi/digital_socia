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
import { useSociaSession } from "@/providers/SociaSessionProvider";
import {
  errorCode,
  errorText,
} from "@/components/Newsroom/SociaDesk/liveShared";
import type {
  Counts,
  DraftMedia,
  DraftView,
  PublishedPost,
  QueueItem,
  QueueResponse,
  RejectReasonCode,
  UserCardTemplate,
} from "@/lib/socia/types";
import type { FtpMedia, FtpNewsItem, SocialPost } from "@/types/newsroom";

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

export function queueToNews(item: QueueItem): LiveNewsItem {
  return {
    id: item.id,
    headline: item.headline,
    body: item.bodyText,
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
    headline: d.story.headline,
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
    postUrl: p.permalink,
    postedAt: p.publishedAt,
    postedBy: p.publishedBy ?? (p.manual ? "Posted by hand" : "Socia"),
    status: p.recalled ? "recalled" : "live",
    recalledAt: p.recalled?.at,
    recallReason: p.recalled?.reason,
  };
}

/** A post waiting out the server's 10-second undo window, then its outcome. */
export interface LivePending {
  id: string;
  draftId: string;
  jobId: string;
  sendAt: string;
  headline: string;
  outcome?:
    { kind: "posted"; permalink: string } | { kind: "failed"; message: string };
}

interface LiveDeskValue {
  canAct: boolean;
  inbox: Polled<QueueResponse>;
  sending: Polled<QueueResponse>;
  failed: Polled<QueueResponse>;
  rejected: Polled<QueueResponse>;
  posts: Polled<{ items: PublishedPost[] }>;
  counts: Polled<Counts>;
  /** The signed-in user's X card background; `data.template` is null until they upload one */
  cardTemplate: Polled<{ template: UserCardTemplate | null }>;
  /** The inbox, in the desk's story shape */
  queue: LiveNewsItem[];
  /** Polls everything now; resolves to the number of stories that were not in the inbox before */
  refreshAll: () => Promise<number>;
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

export function LiveDeskProvider({ children }: { children: React.ReactNode }) {
  const { me } = useSociaSession();
  const canAct = !!me?.permissions.canAct;

  const inbox = usePolled(
    () => socia.fetchQueue("inbox", 200),
    POLL_MS.queue,
    "inbox",
  );
  const sending = usePolled(
    () => socia.fetchQueue("sending", 100),
    POLL_MS.queue,
    "sending",
  );
  const failed = usePolled(
    () => socia.fetchQueue("failed", 100),
    POLL_MS.counts,
    "failed",
  );
  const rejected = usePolled(
    () => socia.fetchQueue("rejected", 100),
    POLL_MS.counts,
    "rejected",
  );
  const posts = usePolled(() => socia.fetchPosts(100), POLL_MS.posts, "posts");
  const counts = usePolled(
    () => socia.fetchCountsOrDerive(),
    POLL_MS.counts,
    "counts",
  );

  // Changes only from the Templates tab, which refreshes it; the slow poll picks up another tab's change
  const cardTemplate = usePolled(
    () => socia.fetchCardTemplate("x"),
    POLL_MS.cardTemplate,
    "card-template",
  );

  const queue = useMemo(
    () => (inbox.data?.items ?? []).map(queueToNews),
    [inbox.data],
  );

  const refreshers = useRef([
    inbox.refresh,
    sending.refresh,
    failed.refresh,
    rejected.refresh,
    posts.refresh,
    counts.refresh,
  ]);
  useEffect(() => {
    refreshers.current = [
      inbox.refresh,
      sending.refresh,
      failed.refresh,
      rejected.refresh,
      posts.refresh,
      counts.refresh,
    ];
  });
  const known = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (inbox.data) known.current = new Set(inbox.data.items.map((i) => i.id));
  }, [inbox.data]);

  const refreshAll = useCallback(async () => {
    const before = known.current;
    const fresh = await socia.fetchQueue("inbox", 200).catch(() => null);
    await Promise.all(refreshers.current.map((r) => r()));
    return fresh ? fresh.items.filter((i) => !before.has(i.id)).length : 0;
  }, []);
  const refreshSoon = useCallback(
    () => void Promise.all(refreshers.current.map((r) => r())),
    [],
  );

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

  const undo = useCallback(
    async (id: string) => {
      const p = pending.find((x) => x.id === id);
      if (!p) return null;
      const error = await tryAction(async () => {
        await socia.undoJob(p.jobId);
        // Undo hands the draft back claimed; let it go so it is free in the queue again
        await socia.releaseDraft(p.draftId).catch(() => undefined);
      });
      if (!error) dismiss(id);
      refreshSoon();
      return error;
    },
    [pending, dismiss, refreshSoon],
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
      queue,
      refreshAll,
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
      queue,
      refreshAll,
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
      {children}
    </LiveDeskContext.Provider>
  );
}

export { errorCode, errorText };
