// Web Scraper (trends) API, contract: handoff/web-scraper-contract.md. Free public sources only, no AI.

import { api } from "./client";
import type { ScraperItem } from "@/types/newsroom";

export type TrendType = "topics" | "articles" | "hashtags";
export type TrendWindow = "12h" | "24h" | "7d";
/** Where a trend came from; the demo data also uses the older social platform names */
export type TrendPlatform = "Google News" | "Google Trends" | "GDELT" | "RSS" | "YouTube" | ScraperItem["platform"];

/** A trend item: the page's ScraperItem plus the live fields (all optional, so the demo data fits). */
export interface TrendItem extends Omit<ScraperItem, "platform"> {
  platform: TrendPlatform;
  /** District it was tagged with, if any */
  district?: string | null;
  /** Publisher or feed name ("Dainik Bhaskar", "Google Trends India") */
  sourceName?: string;
  /** Preview picture, served by the API (same origin through the proxy); the publisher's copyright */
  imageUrl?: string | null;
  /** Who the picture belongs to */
  imageSource?: string | null;
  /** When the source published it */
  publishedAt?: string | null;
  /** An NDMA (disaster) alert on the item. Field name not fixed in the contract yet; both spellings are read */
  alert?: boolean | string | { level?: string; title?: string } | null;
  ndmaAlert?: boolean | string | { level?: string; title?: string } | null;
  /** Same-story group: items about one story share it; the list shows the best-ranked one */
  clusterId?: string | null;
  /** How many sources told this story (1 when it stands alone) */
  sourceCount?: number;
  /** Every source in the group, with its own link */
  sources?: TrendClusterSource[];
  /** The signed-in user's watch keywords this item matches */
  watchHits?: string[];
}

/** One publisher's copy of a grouped story */
export interface TrendClusterSource {
  name: string;
  url: string;
  publishedAt: string | null;
}

export interface TrendSource {
  name: string;
  ok: boolean;
  lastError?: string;
  /** When the last run tried it */
  at: string;
  /** How many items it gave on that run */
  items?: number;
  /** News / Publisher RSS / Government / Trends / Volume / Social / YouTube (newer backends) */
  group?: string;
}

export interface TrendsResponse {
  items: TrendItem[];
  fetchedAt: string | null;
  sources: TrendSource[];
}

const enc = encodeURIComponent;

export const fetchTrends = (type: TrendType, window: TrendWindow) => api<TrendsResponse>("GET", `/trends?type=${type}&window=${window}`);

/** Districts named in the last 24 h, with how many items name each */
export interface DistrictCount {
  name: string;
  count: number;
}
export const fetchTrendDistricts = () => api<{ districts: DistrictCount[] }>("GET", "/trends/districts");

// ─── Keyword watch (per user) ────────────────────────────────────────────────
export interface TrendWatch {
  id: string;
  keyword: string;
  createdAt?: string;
}
/** Most keywords a user may watch */
export const MAX_WATCHES = 50;
export const MAX_WATCH_LENGTH = 80;

/** Reads a watch in the shapes a backend may send (camelCase or snake_case) */
function toWatch(raw: unknown): TrendWatch | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = r.id;
  const keyword = r.keyword;
  if ((typeof id !== "string" && typeof id !== "number") || typeof keyword !== "string") return null;
  const created = r.createdAt ?? r.created_at;
  return { id: String(id), keyword, createdAt: typeof created === "string" ? created : undefined };
}
function toWatchList(raw: unknown): TrendWatch[] {
  const r = raw as Record<string, unknown> | unknown[] | null;
  const list = Array.isArray(r) ? r : Array.isArray(r?.watches) ? r.watches : Array.isArray(r?.items) ? r.items : [];
  return (list as unknown[]).map(toWatch).filter((w): w is TrendWatch => !!w);
}

export const listTrendWatches = async () => toWatchList(await api<unknown>("GET", "/me/trend-watches"));
export async function addTrendWatch(keyword: string): Promise<TrendWatch | null> {
  const res = await api<unknown>("POST", "/me/trend-watches", { keyword });
  const r = res as Record<string, unknown> | null;
  return toWatch(r?.watch ?? r?.item ?? r);
}
export const removeTrendWatch = (id: string) => api<unknown>("DELETE", `/me/trend-watches/${enc(id)}`);
/** Items matching the user's keywords that arrived after `since` (the "new matches" badge) */
export const fetchTrendWatchHits = (since: string) => api<{ count: number; items: TrendItem[] }>("GET", `/me/trend-watches/hits?since=${enc(since)}`);

/** Keywords of `keywords` found in the item's title or summary; case-insensitive, safe for Devanagari (plain substring). */
export function watchHitsFor(item: Pick<TrendItem, "title" | "reasonWhy">, keywords: readonly string[]): string[] {
  if (!keywords.length) return [];
  const text = `${item.title} ${item.reasonWhy}`.normalize("NFC").toLocaleLowerCase();
  return keywords.filter((k) => {
    const needle = k.trim().normalize("NFC").toLocaleLowerCase();
    return !!needle && text.includes(needle);
  });
}
/** A live Google News (+ GDELT) search, run now */
export const searchTrends = (q: string) => api<{ items: TrendItem[] }>("POST", "/trends/search", { q });
/** Queues an immediate run of the sources (editor/admin); the results arrive with the next poll */
export const refreshTrends = () => api<unknown>("POST", "/trends/refresh");
/** Makes a story and a draft from a trend (X only on the backend for now); it then appears in that queue */
export const draftFromTrend = (id: string, platform: "x" = "x") => api<{ draftId: string }>("POST", `/trends/${enc(id)}/draft`, { platform });
