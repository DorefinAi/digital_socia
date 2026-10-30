// Every Socia endpoint the desk uses, one function each. Shapes: ./types.ts.

import { ApiError, api, setCsrfToken } from "./client";
import type {
  CardTemplateLayout, CopyPostedResult, Counts, DraftPatch, QueueFacets, QueueQuery, DraftView, IngestStatus, Me, PostCheck, PublishedPost, QueueResponse, QueueView, RejectReasonCode, SignInStep, UserCardTemplate,
} from "./types";

const enc = encodeURIComponent;

// ─── Auth ────────────────────────────────────────────────────────────────────
export async function login(email: string, password: string) {
  const res = await api<{ csrfToken: string; next: SignInStep }>("POST", "/auth/login", { email, password });
  setCsrfToken(res.csrfToken);
  return res;
}

export const verifyTotp = (code: string) => api<{ ok: true }>("POST", "/auth/totp", { code });
export const startTotpSetup = () => api<{ secret: string; otpauthUri: string }>("POST", "/auth/totp/setup");
export const enableTotp = (code: string) => api<{ ok: true }>("POST", "/auth/totp/enable", { code });

export async function fetchMe() {
  const me = await api<Me>("GET", "/me");
  setCsrfToken(me.csrfToken);
  return me;
}

export async function logout() {
  try {
    await api<{ ok: true }>("POST", "/auth/logout");
  } finally {
    setCsrfToken(null);
  }
}

// ─── Queue ───────────────────────────────────────────────────────────────────
/** `query` filters on the server (phase1-contract.md §1); unset fields are left out */
export function fetchQueue(view: QueueView, limit = 100, query?: QueueQuery) {
  const params = new URLSearchParams({ view, limit: String(limit) });
  if (query?.district) params.set("district", query.district);
  if (query?.desk) params.set("desk", query.desk);
  if (query?.big !== undefined) params.set("big", String(query.big));
  if (query?.update !== undefined) params.set("update", String(query.update));
  if (query?.needsCheck !== undefined) params.set("needsCheck", String(query.needsCheck));
  return api<QueueResponse>("GET", `/x/queue?${params}`);
}
/** Counts for the queue filters over the whole view (phase 1) */
export const fetchQueueFacets = (view: "inbox" | "posted") => api<QueueFacets>("GET", `/x/queue/facets?view=${view}`);
export const fetchCounts = () => api<Counts>("GET", "/x/counts");

// ─── Draft ───────────────────────────────────────────────────────────────────
export const fetchDraft = (id: string) => api<DraftView>("GET", `/drafts/${enc(id)}`);
export const claimDraft = (id: string) => api<DraftView>("POST", `/drafts/${enc(id)}/claim`);
export const heartbeat = (id: string) => api<{ until: string }>("POST", `/drafts/${enc(id)}/heartbeat`);
export const releaseDraft = (id: string) => api<{ ok: true }>("POST", `/drafts/${enc(id)}/release`);
export const saveDraft = (id: string, patch: DraftPatch) => api<DraftView>("PATCH", `/drafts/${enc(id)}`, patch);
export const checkPost = (bodyText: string, hashtags: string[], mentions: string[]) => api<PostCheck>("POST", "/x/check", { bodyText, hashtags, mentions });
export const approveDraft = (id: string, version: number) => api<{ jobId: string; sendAt: string }>("POST", `/drafts/${enc(id)}/approve`, { version });
export const undoJob = (jobId: string) => api<DraftView>("POST", `/jobs/${enc(jobId)}/undo`);
export const rejectDraft = (id: string, reason: RejectReasonCode, note?: string) =>
  api<{ ok: true }>("POST", `/drafts/${enc(id)}/reject`, note ? { reason, note } : { reason });
export const restoreDraft = (id: string) => api<DraftView>("POST", `/drafts/${enc(id)}/restore`);
/** Makes the card the operator designed in the editor the one that gets posted (PNG, up to 5 MB). */
export const uploadCard = (id: string, version: number, png: Blob) => api<DraftView>("PUT", `/drafts/${enc(id)}/card?version=${version}`, png);
/** Back to the automatically drawn card. */
export const resetCard = (id: string, version: number) => api<DraftView>("DELETE", `/drafts/${enc(id)}/card?version=${version}`);
/** Records a post the operator made by hand on X, with its link. */
export const markPosted = (id: string, version: number, permalink: string) =>
  api<{ postId: string; permalink: string }>("POST", `/drafts/${enc(id)}/mark-posted`, { version, permalink });
/** Copy & Posted: the browser has copied the post text; this moves the draft to Posted (no link). */
export const copyPosted = (id: string, version: number) => api<CopyPostedResult>("POST", `/drafts/${enc(id)}/copy-posted`, { version });
/** Within `undoUntil`: back to the queue */
export const undoCopyPosted = (id: string) => api<DraftView>("POST", `/drafts/${enc(id)}/copy-posted/undo`);
/** "Add card": the server draws the card (202, `card.state: "rendering"`); safe to call again */
export const renderCard = (id: string) => api<DraftView>("POST", `/drafts/${enc(id)}/card/render`);
export const retryDraft = (id: string) => api<{ jobId: string }>("POST", `/drafts/${enc(id)}/retry`);

// ─── Published ───────────────────────────────────────────────────────────────
export const fetchPosts = (limit = 50) => api<{ items: PublishedPost[] }>("GET", `/posts?limit=${limit}`);
export const recallPost = (id: string, reason: string) => api<{ jobId: string }>("POST", `/posts/${enc(id)}/recall`, { reason });

// ─── Card background (one per user per platform) ─────────────────────────────
/** The signed-in user's card background, or null when they have not uploaded one. */
export const fetchCardTemplate = (platform = "x") =>
  api<{ template: UserCardTemplate | null }>("GET", `/me/card-template?platform=${enc(platform)}`);
/** Creates or replaces the background (PNG or JPEG, up to 5 MB, both sides at least 600 px). The layout is kept on replace. */
export const uploadCardTemplate = (image: Blob, platform = "x") =>
  api<{ template: UserCardTemplate }>("PUT", `/me/card-template?platform=${enc(platform)}`, image);
export const saveCardTemplateLayout = (layout: CardTemplateLayout, platform = "x") =>
  api<{ template: UserCardTemplate }>("PATCH", `/me/card-template?platform=${enc(platform)}`, { layout });
export const deleteCardTemplate = (platform = "x") => api<unknown>("DELETE", `/me/card-template?platform=${enc(platform)}`);

// ─── Source health ───────────────────────────────────────────────────────────
export const fetchIngestStatus = () => api<IngestStatus>("GET", "/ingest/status");

/**
 * Tab badges and dashboard counts. Uses GET /x/counts; while that route is missing on a server
 * (404), derives the same numbers from the queue views and the published list.
 */
export async function fetchCountsOrDerive(): Promise<Counts> {
  try {
    return await fetchCounts();
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err;
  }
  const [inbox, sending, rejected, failed, posts] = await Promise.all([
    fetchQueue("inbox", 200), fetchQueue("sending", 200), fetchQueue("rejected", 200), fetchQueue("failed", 200), fetchPosts(200),
  ]);
  const today = new Date().toDateString();
  const claimed = inbox.items.filter((i) => i.status === "claimed").length;
  return {
    byStatus: { ready: inbox.items.length - claimed, claimed, rejected: rejected.items.length },
    byView: { inbox: inbox.items.length, sending: sending.items.length, rejected: rejected.items.length, failed: failed.items.length },
    publishedToday: posts.items.filter((p) => !p.recalled && new Date(p.publishedAt).toDateString() === today).length,
    cap: inbox.cap,
  };
}
