// Post analytics API, contract: handoff/scraper-analytics-contract.md section B. Editor/admin only.
// Our own desk numbers (/analytics/desk) and platform metrics per post (/analytics/posts, /analytics/insights).
// The platform numbers are "fake" (deterministic samples) until real access arrives; every answer says so.

import { api } from "./client";

export type MetricsPlatform = "x" | "facebook" | "instagram" | "youtube";
export const METRICS_PLATFORMS: MetricsPlatform[] = ["x", "facebook", "instagram", "youtube"];
export const PLATFORM_LABEL: Record<MetricsPlatform, string> = { x: "X", facebook: "Facebook", instagram: "Instagram", youtube: "YouTube" };
export type MetricsMode = "fake" | "live";
/** Mode per platform, as the answers send it */
export type ModeMap = Partial<Record<MetricsPlatform, MetricsMode>>;

// ─── Desk ────────────────────────────────────────────────────────────────────
export interface DeskAnalytics {
  totals: { received: number; approved: number; posted: number; rejected: number; medianApproveToPostMin: number | null };
  perDay: { day: string; received: number; posted: number; rejected: number }[];
  byDistrict: { district: string | null; posted: number }[];
  byCategory: { category: string | null; posted: number }[];
  byHour: { hour: number; posted: number }[];
  rejectReasons: { reason: string; count: number }[];
  byEditor: { userId: string; name: string; approved: number; posted: number; rejected: number }[];
}

// ─── Posts ───────────────────────────────────────────────────────────────────
export interface PostMetrics {
  impressions: number | null;
  likes: number | null;
  reposts: number | null;
  replies: number | null;
  quotes: number | null;
  bookmarks: number | null;
  videoViews: number | null;
  /** Which capture these are ("1h", "6h", "24h", "3d", "7d") */
  ageBucket: string | null;
  capturedAt: string | null;
}
export interface AnalyticsPost {
  id: string;
  platform: MetricsPlatform | string;
  headline: string;
  district: string | null;
  category: string | null;
  hashtags: string[];
  hasFootage: boolean;
  postedAt: string;
  permalink: string | null;
  metrics: PostMetrics | null;
  /** (likes + reposts + replies + quotes) / impressions, 0..1; null when impressions are unknown */
  engagementRate: number | null;
}
export interface PostsAnalytics {
  items: AnalyticsPost[];
  mode: ModeMap;
}

export interface EngagementGroup {
  posts: number;
  /** 0..1 */
  avgEngagement: number | null;
}
export interface Insights {
  topHashtags: ({ tag: string } & EngagementGroup)[];
  byDistrict: ({ district: string | null } & EngagementGroup)[];
  byCategory: ({ category: string | null } & EngagementGroup)[];
  byHour: ({ hour: number } & EngagementGroup)[];
  footageVsNot: { withFootage: EngagementGroup; without: EngagementGroup };
  mode: ModeMap;
}

export type PostSort = "impressions" | "likes" | "reposts" | "engagement";

export interface AnalyticsRange {
  from: string;
  to: string;
}

// ─── Reading the answers ─────────────────────────────────────────────────────
// The shapes below are read loosely (camelCase or snake_case, flat or nested metrics), so a small
// difference on the backend shows as a missing number rather than a broken page.
type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const pick = (r: Raw, ...keys: string[]) => keys.map((k) => r[k]).find((v) => v !== undefined);

/** `mode` as a map per platform: accepts { x: "fake" }, "fake" (all platforms), or `modes`. */
export function readModes(raw: unknown): ModeMap {
  const r = obj(raw);
  const m = r.mode ?? r.modes;
  if (m === "fake" || m === "live") return Object.fromEntries(METRICS_PLATFORMS.map((p) => [p, m]));
  const out: ModeMap = {};
  for (const [k, v] of Object.entries(obj(m))) if ((v === "fake" || v === "live") && (METRICS_PLATFORMS as string[]).includes(k)) out[k as MetricsPlatform] = v;
  return out;
}
/** True when any platform in view is on sample numbers */
export const anyFake = (modes: ModeMap, platform?: MetricsPlatform | "all") =>
  platform && platform !== "all" ? modes[platform] !== "live" : Object.values(modes).some((m) => m === "fake") || Object.keys(modes).length === 0;

const group = (r: Raw): EngagementGroup => ({ posts: num(pick(r, "posts", "count")) ?? 0, avgEngagement: num(pick(r, "avgEngagement", "avg_engagement", "engagementRate")) });

export const engagementOf = (m: PostMetrics | null): number | null => {
  if (!m || !m.impressions) return null;
  return ((m.likes ?? 0) + (m.reposts ?? 0) + (m.replies ?? 0) + (m.quotes ?? 0)) / m.impressions;
};

function readPost(raw: unknown): AnalyticsPost {
  const r = obj(raw);
  const mr = obj(pick(r, "metrics", "latest", "latestMetrics")) ;
  const src = Object.keys(mr).length ? mr : r;
  const metrics: PostMetrics = {
    impressions: num(pick(src, "impressions")),
    likes: num(pick(src, "likes")),
    reposts: num(pick(src, "reposts")),
    replies: num(pick(src, "replies")),
    quotes: num(pick(src, "quotes")),
    bookmarks: num(pick(src, "bookmarks")),
    videoViews: num(pick(src, "videoViews", "video_views")),
    ageBucket: str(pick(src, "ageBucket", "age_bucket")),
    capturedAt: str(pick(src, "capturedAt", "captured_at")),
  };
  const hasAny = Object.values(metrics).some((v) => v !== null);
  const m = hasAny ? metrics : null;
  const rate = num(pick(r, "engagementRate", "engagement_rate", "engagement"));
  return {
    id: String(pick(r, "id", "postId", "post_id") ?? ""),
    platform: str(r.platform) ?? "",
    headline: str(pick(r, "headline", "title")) ?? "",
    district: str(r.district),
    category: str(r.category),
    hashtags: arr(r.hashtags).filter((h): h is string => typeof h === "string"),
    hasFootage: pick(r, "hasFootage", "has_footage") === true,
    postedAt: str(pick(r, "postedAt", "posted_at")) ?? "",
    permalink: str(r.permalink),
    metrics: m,
    engagementRate: rate !== null && rate <= 1 ? rate : rate !== null ? rate / 100 : engagementOf(m),
  };
}

function readInsights(raw: unknown): Insights {
  const r = obj(raw);
  const fv = obj(pick(r, "footageVsNot", "footage_vs_not"));
  return {
    topHashtags: arr(pick(r, "topHashtags", "top_hashtags")).map((x) => ({ tag: str(obj(x).tag) ?? "", ...group(obj(x)) })).filter((x) => x.tag),
    byDistrict: arr(pick(r, "byDistrict", "by_district")).map((x) => ({ district: str(obj(x).district), ...group(obj(x)) })),
    byCategory: arr(pick(r, "byCategory", "by_category")).map((x) => ({ category: str(obj(x).category), ...group(obj(x)) })),
    byHour: arr(pick(r, "byHour", "by_hour")).map((x) => ({ hour: num(obj(x).hour) ?? 0, ...group(obj(x)) })),
    footageVsNot: { withFootage: group(obj(pick(fv, "withFootage", "with_footage", "with"))), without: group(obj(pick(fv, "without", "withoutFootage", "without_footage"))) },
    mode: readModes(r),
  };
}

const qs = (params: Record<string, string | number | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

export const fetchDeskAnalytics = (range: AnalyticsRange) => api<DeskAnalytics>("GET", `/analytics/desk?${qs({ ...range })}`);

export async function fetchPostAnalytics(range: AnalyticsRange, platform: MetricsPlatform | "all", sort: PostSort, limit = 100): Promise<PostsAnalytics> {
  const raw = await api<unknown>("GET", `/analytics/posts?${qs({ ...range, platform: platform === "all" ? undefined : platform, sort, limit })}`);
  const r = obj(raw);
  const list = Array.isArray(raw) ? raw : arr(pick(r, "items", "posts"));
  return { items: list.map(readPost), mode: readModes(r) };
}

export async function fetchInsights(range: AnalyticsRange, platform: MetricsPlatform | "all"): Promise<Insights> {
  return readInsights(await api<unknown>("GET", `/analytics/insights?${qs({ ...range, platform: platform === "all" ? undefined : platform })}`));
}
