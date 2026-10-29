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
/** A live Google News (+ GDELT) search, run now */
export const searchTrends = (q: string) => api<{ items: TrendItem[] }>("POST", "/trends/search", { q });
/** Queues an immediate run of the sources (editor/admin); the results arrive with the next poll */
export const refreshTrends = () => api<unknown>("POST", "/trends/refresh");
/** Makes a story and a draft from a trend (X only on the backend for now); it then appears in that queue */
export const draftFromTrend = (id: string, platform: "x" = "x") => api<{ draftId: string }>("POST", `/trends/${enc(id)}/draft`, { platform });
