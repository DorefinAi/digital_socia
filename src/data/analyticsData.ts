// Demo analytics. Generated from fixed seeds so the numbers stay the same between visits;
// the backend replaces this with the platforms' own insights APIs.

export type AnalyticsPlatform = "X" | "YouTube" | "Instagram";
export type RangeKey = "7d" | "4w" | "1m";

export const ANALYTICS_PLATFORMS: AnalyticsPlatform[] = ["X", "YouTube", "Instagram"];

export const PLATFORM_COLOR: Record<AnalyticsPlatform, string> = { X: "#111111", YouTube: "#FF0000", Instagram: "#D62976" };

export const RANGES: Record<RangeKey, { label: string; days: number; bucket: "day" | "week" }> = {
  "7d": { label: "Last 7 days", days: 7, bucket: "day" },
  "4w": { label: "Last 4 weeks", days: 28, bucket: "week" },
  "1m": { label: "Last 1 month", days: 30, bucket: "day" },
};

export interface MetricDef {
  key: string;
  label: string;
  /** Typical daily value the generator centres on */
  base: number;
  unit?: "hours";
}

/** The reach metric comes first; the rest are the platform's own engagement signals. */
export const METRICS: Record<AnalyticsPlatform, MetricDef[]> = {
  X: [
    { key: "impressions", label: "Impressions", base: 1_150_000 },
    { key: "likes", label: "Likes", base: 21_000 },
    { key: "reposts", label: "Reposts", base: 6_400 },
    { key: "replies", label: "Replies", base: 3_100 },
    { key: "followers", label: "Follower growth", base: 2_300 },
  ],
  YouTube: [
    { key: "views", label: "Views", base: 640_000 },
    { key: "watchHours", label: "Watch time", base: 38_000, unit: "hours" },
    { key: "likes", label: "Likes", base: 17_500 },
    { key: "comments", label: "Comments", base: 2_900 },
    { key: "followers", label: "Subscriber growth", base: 3_800 },
  ],
  Instagram: [
    { key: "reach", label: "Reach", base: 880_000 },
    { key: "likes", label: "Likes", base: 46_000 },
    { key: "comments", label: "Comments", base: 3_700 },
    { key: "saves", label: "Saves", base: 5_200 },
    { key: "followers", label: "Follower growth", base: 4_100 },
  ],
};

/** Metrics that count as engagement for each platform. */
const ENGAGEMENT_KEYS: Record<AnalyticsPlatform, string[]> = {
  X: ["likes", "reposts", "replies"],
  YouTube: ["likes", "comments"],
  Instagram: ["likes", "comments", "saves"],
};

export const REACH_KEY: Record<AnalyticsPlatform, string> = { X: "impressions", YouTube: "views", Instagram: "reach" };

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const HISTORY_DAYS = 60;

export interface DayRow {
  date: Date;
  values: Record<string, number>;
  engagements: number;
  posts: number;
}

const cache = new Map<AnalyticsPlatform, DayRow[]>();

/** 60 days of daily figures ending today, oldest first. */
function history(platform: AnalyticsPlatform): DayRow[] {
  const cached = cache.get(platform);
  if (cached && cached[cached.length - 1].date.toDateString() === new Date().toDateString()) return cached;
  const rows: DayRow[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dayKey = date.toISOString().slice(0, 10);
    // Weekends dip, the series climbs slowly, and every day has its own noise
    const weekday = [0.82, 1.04, 1.08, 1.06, 1.1, 1.0, 0.86][date.getDay()];
    const trend = 0.86 + (0.28 * (HISTORY_DAYS - i)) / HISTORY_DAYS;
    const values: Record<string, number> = {};
    for (const m of METRICS[platform]) {
      const rnd = seeded(hash(`${platform}:${m.key}:${dayKey}`));
      const spike = rnd() > 0.93 ? 1.6 : 1;
      values[m.key] = Math.round(m.base * weekday * trend * (0.82 + rnd() * 0.36) * spike);
    }
    const engagements = ENGAGEMENT_KEYS[platform].reduce((sum, k) => sum + (values[k] ?? 0), 0);
    const posts = Math.round({ X: 760, YouTube: 14, Instagram: 72 }[platform] * weekday * (0.85 + seeded(hash(`${platform}:posts:${dayKey}`))() * 0.3));
    rows.push({ date, values, engagements, posts });
  }
  cache.set(platform, rows);
  return rows;
}

/** The selected range and the period just before it, for comparison. */
export function periodRows(platform: AnalyticsPlatform, range: RangeKey) {
  const rows = history(platform);
  const days = RANGES[range].days;
  return { current: rows.slice(-days), previous: rows.slice(-days * 2, -days) };
}

export interface Bucket {
  label: string;
  values: Record<string, number>;
  engagements: number;
  posts: number;
}

/** Daily or weekly points for charts. */
export function bucketRows(rows: DayRow[], bucket: "day" | "week"): Bucket[] {
  const label = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  if (bucket === "day") return rows.map((r) => ({ label: label(r.date), values: r.values, engagements: r.engagements, posts: r.posts }));
  const out: Bucket[] = [];
  for (let i = 0; i < rows.length; i += 7) {
    const week = rows.slice(i, i + 7);
    const values: Record<string, number> = {};
    for (const r of week) for (const [k, v] of Object.entries(r.values)) values[k] = (values[k] ?? 0) + v;
    out.push({
      label: `${label(week[0].date)} – ${label(week[week.length - 1].date)}`,
      values,
      engagements: week.reduce((s, r) => s + r.engagements, 0),
      posts: week.reduce((s, r) => s + r.posts, 0),
    });
  }
  return out;
}

export function sumMetric(rows: DayRow[], key: string) {
  return rows.reduce((s, r) => s + (key === "engagements" ? r.engagements : key === "posts" ? r.posts : r.values[key] ?? 0), 0);
}

/** Average engagement rate (%) by weekday and hour, for the best-time-to-post heatmap. */
export function postingHeatmap(platform: AnalyticsPlatform): number[][] {
  const rnd = seeded(hash(`${platform}:heatmap`));
  const peaks = { X: [9, 13, 21], YouTube: [19, 21], Instagram: [12, 20, 22] }[platform];
  return Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, hour) => {
      const near = Math.max(...peaks.map((p) => Math.max(0, 1 - Math.abs(hour - p) / 3)));
      const night = hour < 6 ? 0.35 : 1;
      const weekend = day === 0 || day === 6 ? 0.85 : 1;
      return +(1.2 + near * 4.2 * night * weekend + rnd() * 0.9).toFixed(2);
    })
  );
}

export interface TopPost {
  id: string;
  platform: AnalyticsPlatform;
  title: string;
  thumbUrl?: string;
  postedAt: string;
  url: string;
  reach: number;
  engagements: number;
  rate: number;
}

const YOUTUBE_SEED = [
  { title: "जयपुर मेट्रो फेज-2: पूरी रिपोर्ट", hoursAgo: 20, image: "photo-1544620347-c4fd4a3d5957" },
  { title: "कोटा NEET प्रदर्शन: छात्रों से सीधी बात", hoursAgo: 46, image: "photo-1523240795612-9a054b0db644" },
  { title: "थार में सोलर क्रांति: बीकानेर ग्राउंड रिपोर्ट", hoursAgo: 90, image: "photo-1508514177221-188b1cf16e9d" },
  { title: "रणथंभौर टाइगर सेंसस: खास पेशकश", hoursAgo: 160, image: "photo-1561731216-c3a4d99437d5" },
  { title: "पुष्कर मेला 2026: तैयारियों का जायजा", hoursAgo: 300, image: "photo-1609949279531-cf48d64bed89" },
  { title: "उदयपुर झीलों की सफाई पर विशेष रिपोर्ट", hoursAgo: 520, image: "photo-1590050752117-238cb0fb12b1" },
];

/** Metrics for posts the desk saved, plus YouTube uploads, generated per post so they stay stable. */
export function topPosts(posts: { id: string; platform: string; headline: string; thumbUrl: string; postedAt: string; postUrl: string; status?: string }[]): TopPost[] {
  const map: Record<string, AnalyticsPlatform> = { "X (Twitter)": "X", Instagram: "Instagram" };
  const scale: Record<AnalyticsPlatform, number> = { X: 42_000, YouTube: 180_000, Instagram: 65_000 };
  const fromDesk = posts
    .filter((p) => map[p.platform] && p.status !== "recalled")
    .map((p) => ({ id: p.id, platform: map[p.platform], title: p.headline, thumbUrl: p.thumbUrl, postedAt: p.postedAt, url: p.postUrl }));
  const fromYouTube = YOUTUBE_SEED.map((v, i) => ({
    id: `yt-${i}`,
    platform: "YouTube" as const,
    title: v.title,
    thumbUrl: `https://images.unsplash.com/${v.image}?auto=format&fit=crop&w=320&q=60`,
    postedAt: new Date(Date.now() - v.hoursAgo * 3600000).toISOString(),
    url: "https://www.youtube.com/@1stIndiaNews",
  }));
  return [...fromDesk, ...fromYouTube].map((p) => {
    const rnd = seeded(hash(p.id));
    const reach = Math.round(scale[p.platform] * (0.3 + rnd() * 2.4));
    const rate = +(1.5 + rnd() * 7).toFixed(2);
    return { ...p, reach, rate, engagements: Math.round((reach * rate) / 100) };
  });
}
