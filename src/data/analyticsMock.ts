// Demo-mode numbers for the Analytics page, in the shapes of handoff/scraper-analytics-contract.md (B).
// Deterministic: the same day always gives the same numbers, so switching ranges stays consistent.

import { engagementOf, METRICS_PLATFORMS, type AnalyticsPost, type AnalyticsRange, type DeskAnalytics, type EngagementGroup, type Insights, type MetricsPlatform, type PostsAnalytics, type PostSort } from "@/lib/socia/analytics";

const DISTRICTS = ["Jaipur", "Jodhpur", "Kota", "Udaipur", "Ajmer", "Bikaner", "Alwar", "Bharatpur", "Sikar", "Sawai Madhopur", "Barmer", "Bhilwara"];
const DISTRICT_WEIGHT = [30, 12, 11, 10, 8, 6, 6, 4, 4, 3, 3, 3];
const CATEGORIES = ["Politics", "Crime", "Weather", "Infrastructure", "Education", "Health", "Agriculture", "Culture & Tourism", "Sports", "Business"];
const CATEGORY_WEIGHT = [22, 18, 9, 10, 8, 6, 5, 9, 7, 6];
const REASONS = ["Duplicate of an earlier post", "Not verified yet", "Not Rajasthan news", "Poor footage or picture", "Headline needs work", "Legal or sensitive", "Too old"];
const REASON_WEIGHT = [30, 22, 14, 11, 10, 7, 6];
const EDITORS = [
  { userId: "u-anita", name: "Anita Sharma" },
  { userId: "u-rohit", name: "Rohit Meena" },
  { userId: "u-farhan", name: "Farhan Qureshi" },
  { userId: "u-kavya", name: "Kavya Rathore" },
  { userId: "u-dev", name: "Dev Choudhary" },
];
/** When posts go out (IST): busier in the morning and evening */
const HOUR_WEIGHT = [1, 0, 0, 0, 0, 1, 3, 6, 9, 10, 9, 8, 8, 7, 7, 8, 9, 11, 13, 14, 12, 9, 5, 2];
const HEADLINES = [
  "Jaipur Metro phase 2: cabinet clears the Sitapura link",
  "Kota: coaching students get a new helpline from today",
  "Heavy rain alert for Udaipur and Rajsamand districts",
  "Jodhpur AIIMS opens a new trauma wing",
  "Ajmer Urs: traffic plan for the next five days",
  "Bikaner solar park adds 600 MW to the grid",
  "Alwar police bust a cyber fraud gang, 12 held",
  "Ranthambore: tiger T-120 spotted with three cubs",
  "Sikar farmers protest over canal water share",
  "Bharatpur: Keoladeo sees the first migratory birds",
  "Barmer refinery to start trial runs by March",
  "Bhilwara textile units told to cut water use",
  "Assembly session: opposition walks out over paper leak",
  "Jaipur: Rambagh circle flyover opens to traffic",
  "Pushkar fair dates announced, camel trading to return",
  "Rajasthan Royals pick two local players",
];
const TAGS = ["#Jaipur", "#Rajasthan", "#JaipurMetro", "#Kota", "#Weather", "#Udaipur", "#Ranthambore", "#Jodhpur", "#RajasthanPolice", "#Ajmer", "#Breaking", "#Bikaner"];

/** Small seeded PRNG (mulberry32) from a string */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function weighted<T>(r: () => number, items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (let i = 0; i < items.length; i++) {
    x -= weights[i];
    if (x <= 0) return items[i];
  }
  return items[items.length - 1];
}

const IST_MS = 5.5 * 3600_000;
/** IST calendar days from `from` to `to`, as YYYY-MM-DD */
function istDays(range: AnalyticsRange): string[] {
  const start = new Date(new Date(range.from).getTime() + IST_MS);
  const end = new Date(new Date(range.to).getTime() + IST_MS);
  const out: string[] = [];
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  while (d.getTime() <= end.getTime() && out.length < 93) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

interface DemoStory {
  id: string;
  day: string;
  hour: number;
  district: string | null;
  category: string | null;
  editor: (typeof EDITORS)[number];
  outcome: "posted" | "rejected" | "approved" | "pending";
  reason: string | null;
  approveToPostMin: number | null;
}

function storiesOf(day: string): DemoStory[] {
  const r = rng(`day-${day}`);
  const weekend = [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());
  const n = Math.round((weekend ? 34 : 48) + r() * 18);
  return Array.from({ length: n }, (_, i) => {
    const x = r();
    const outcome = x < 0.58 ? "posted" : x < 0.82 ? "rejected" : x < 0.9 ? "approved" : "pending";
    return {
      id: `${day}-${i}`,
      day,
      hour: weighted(r, Array.from({ length: 24 }, (_, h) => h), HOUR_WEIGHT),
      district: r() < 0.12 ? null : weighted(r, DISTRICTS, DISTRICT_WEIGHT),
      category: r() < 0.06 ? null : weighted(r, CATEGORIES, CATEGORY_WEIGHT),
      editor: weighted(r, EDITORS, [32, 26, 18, 14, 10]),
      outcome,
      reason: outcome === "rejected" ? weighted(r, REASONS, REASON_WEIGHT) : null,
      approveToPostMin: outcome === "posted" ? Math.round(3 + r() * r() * 55) : null,
    };
  });
}

function countBy<T, K>(list: T[], key: (t: T) => K): Map<K, number> {
  const m = new Map<K, number>();
  for (const t of list) m.set(key(t), (m.get(key(t)) ?? 0) + 1);
  return m;
}

export function demoDeskAnalytics(range: AnalyticsRange): DeskAnalytics {
  const days = istDays(range);
  const all = days.flatMap(storiesOf);
  const posted = all.filter((s) => s.outcome === "posted");
  const rejected = all.filter((s) => s.outcome === "rejected");
  const waits = posted.map((s) => s.approveToPostMin!).sort((a, b) => a - b);
  const median = waits.length ? waits[Math.floor(waits.length / 2)] : null;
  return {
    totals: {
      received: all.length,
      approved: posted.length + all.filter((s) => s.outcome === "approved").length,
      posted: posted.length,
      rejected: rejected.length,
      medianApproveToPostMin: median,
    },
    perDay: days.map((day) => {
      const s = all.filter((x) => x.day === day);
      return { day, received: s.length, posted: s.filter((x) => x.outcome === "posted").length, rejected: s.filter((x) => x.outcome === "rejected").length };
    }),
    byDistrict: [...countBy(posted, (s) => s.district)].map(([district, n]) => ({ district, posted: n })).sort((a, b) => b.posted - a.posted),
    byCategory: [...countBy(posted, (s) => s.category)].map(([category, n]) => ({ category, posted: n })).sort((a, b) => b.posted - a.posted),
    byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, posted: posted.filter((s) => s.hour === hour).length })),
    rejectReasons: [...countBy(rejected, (s) => s.reason!)].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    byEditor: EDITORS.map((e) => {
      const mine = all.filter((s) => s.editor.userId === e.userId);
      const p = mine.filter((s) => s.outcome === "posted").length;
      return { ...e, approved: p + mine.filter((s) => s.outcome === "approved").length, posted: p, rejected: mine.filter((s) => s.outcome === "rejected").length };
    }),
  };
}

const PERMALINK: Record<MetricsPlatform, (id: string) => string> = {
  x: (id) => `https://x.com/FirstIndiaNews/status/${id}`,
  facebook: (id) => `https://www.facebook.com/FirstIndiaNews/posts/${id}`,
  instagram: (id) => `https://www.instagram.com/p/${id}/`,
  youtube: (id) => `https://www.youtube.com/shorts/${id}`,
};
const REACH: Record<MetricsPlatform, number> = { x: 9000, facebook: 14000, instagram: 11000, youtube: 22000 };

function demoPosts(range: AnalyticsRange): AnalyticsPost[] {
  const out: AnalyticsPost[] = [];
  for (const day of istDays(range)) {
    for (const s of storiesOf(day).filter((x) => x.outcome === "posted")) {
      const r = rng(`post-${s.id}`);
      const platform = weighted(r, METRICS_PLATFORMS, [50, 22, 18, 10]);
      const hasFootage = r() < 0.45;
      const hashtags = [...new Set([s.district ? `#${s.district.replace(/\s+/g, "")}` : "#Rajasthan", weighted(r, TAGS, TAGS.map((_, i) => 12 - i))])];
      // Footage and the evening slot do better, as on the real desks
      const boost = (hasFootage ? 1.6 : 1) * (s.hour >= 17 && s.hour <= 21 ? 1.4 : 1) * (0.4 + r() * 1.6);
      const impressions = Math.round(REACH[platform] * boost);
      const rate = 0.012 + r() * 0.05 * (hasFootage ? 1.3 : 1);
      const engaged = impressions * rate;
      const likes = Math.round(engaged * 0.62);
      const reposts = Math.round(engaged * 0.18);
      const replies = Math.round(engaged * 0.12);
      const quotes = platform === "x" ? Math.round(engaged * 0.08) : 0;
      const id = `${Math.floor(r() * 1e15)}`;
      const postedAt = new Date(new Date(`${day}T00:00:00+05:30`).getTime() + s.hour * 3600_000 + Math.floor(r() * 3600_000)).toISOString();
      const metrics = { impressions, likes, reposts, replies, quotes, bookmarks: Math.round(engaged * 0.05), videoViews: hasFootage ? Math.round(impressions * 0.7) : null, ageBucket: "24h", capturedAt: postedAt };
      out.push({
        id: `demo-${s.id}`,
        platform,
        headline: HEADLINES[Math.floor(r() * HEADLINES.length)],
        district: s.district,
        category: s.category,
        hashtags,
        hasFootage,
        postedAt,
        permalink: PERMALINK[platform](id.slice(0, 11)),
        metrics,
        engagementRate: engagementOf(metrics),
      });
    }
  }
  return out;
}

const SORT_KEY: Record<PostSort, (p: AnalyticsPost) => number> = {
  impressions: (p) => p.metrics?.impressions ?? -1,
  likes: (p) => p.metrics?.likes ?? -1,
  reposts: (p) => p.metrics?.reposts ?? -1,
  engagement: (p) => p.engagementRate ?? -1,
};
const fake = () => Object.fromEntries(METRICS_PLATFORMS.map((p) => [p, "fake"])) as PostsAnalytics["mode"];

export function demoPostAnalytics(range: AnalyticsRange, platform: MetricsPlatform | "all", sort: PostSort, limit = 100): PostsAnalytics {
  const items = demoPosts(range)
    .filter((p) => platform === "all" || p.platform === platform)
    .sort((a, b) => SORT_KEY[sort](b) - SORT_KEY[sort](a))
    .slice(0, limit);
  return { items, mode: fake() };
}

function groupStats(posts: AnalyticsPost[]): EngagementGroup {
  const rates = posts.map((p) => p.engagementRate).filter((x): x is number => x !== null);
  return { posts: posts.length, avgEngagement: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null };
}
function groupBy<K>(posts: AnalyticsPost[], key: (p: AnalyticsPost) => K): [K, AnalyticsPost[]][] {
  const m = new Map<K, AnalyticsPost[]>();
  for (const p of posts) m.set(key(p), [...(m.get(key(p)) ?? []), p]);
  return [...m];
}

export function demoInsights(range: AnalyticsRange, platform: MetricsPlatform | "all"): Insights {
  const posts = demoPosts(range).filter((p) => platform === "all" || p.platform === platform);
  const tagged = posts.flatMap((p) => p.hashtags.map((tag) => [tag, p] as const));
  const tags = new Map<string, AnalyticsPost[]>();
  for (const [t, p] of tagged) tags.set(t, [...(tags.get(t) ?? []), p]);
  const hourOf = (p: AnalyticsPost) => new Date(new Date(p.postedAt).getTime() + IST_MS).getUTCHours();
  return {
    topHashtags: [...tags].map(([tag, ps]) => ({ tag, ...groupStats(ps) })).sort((a, b) => b.posts - a.posts).slice(0, 12),
    byDistrict: groupBy(posts, (p) => p.district).map(([district, ps]) => ({ district, ...groupStats(ps) })).sort((a, b) => b.posts - a.posts),
    byCategory: groupBy(posts, (p) => p.category).map(([category, ps]) => ({ category, ...groupStats(ps) })).sort((a, b) => b.posts - a.posts),
    byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, ...groupStats(posts.filter((p) => hourOf(p) === hour)) })),
    footageVsNot: { withFootage: groupStats(posts.filter((p) => p.hasFootage)), without: groupStats(posts.filter((p) => !p.hasFootage)) },
    mode: fake(),
  };
}
