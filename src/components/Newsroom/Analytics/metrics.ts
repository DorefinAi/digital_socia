import { ANALYTICS_PLATFORMS, AnalyticsPlatform, Bucket, DayRow, ENGAGEMENT_TEXT, METRICS, PLATFORM_COLOR, REACH_KEY, sumMetric } from "@/data/analyticsData";
import { formatIndian } from "./exportPdf";

export type View = "all" | AnalyticsPlatform;
export type MetricKey = "reach" | "engagements" | "rate" | "followers" | "posts";

export const KPIS: MetricKey[] = ["reach", "engagements", "rate", "followers", "posts"];

/** Platform colour that reads on the current background: X's near-black turns light in dark mode. */
export const tone = (p: AnalyticsPlatform, mode: "light" | "dark") => (p === "X" && mode === "dark" ? "#E5E7EB" : PLATFORM_COLOR[p]);

/** What each platform calls its reach figure. */
export const reachName = (p: AnalyticsPlatform) => METRICS[p].find((m) => m.key === REACH_KEY[p])!.label;

export function metricLabel(view: View, key: MetricKey) {
  const reach = view === "all" ? "Total reach" : reachName(view);
  return { reach, engagements: "Engagements", rate: "Engagement rate", followers: view === "YouTube" ? "Subscriber growth" : "Follower growth", posts: "Posts published" }[key];
}

/** Value of a metric for one platform over a set of day rows. */
export function valueOf(platform: AnalyticsPlatform, rows: DayRow[], key: MetricKey) {
  const reach = sumMetric(rows, REACH_KEY[platform]);
  if (key === "reach") return reach;
  if (key === "engagements") return sumMetric(rows, "engagements");
  if (key === "rate") return reach ? (sumMetric(rows, "engagements") / reach) * 100 : 0;
  if (key === "followers") return sumMetric(rows, "followers");
  return sumMetric(rows, "posts");
}

/** Value of a metric for one platform in one chart point. */
export function bucketValue(p: AnalyticsPlatform, b: Bucket, key: MetricKey) {
  const reach = b.values[REACH_KEY[p]] ?? 0;
  if (key === "reach") return reach;
  if (key === "engagements") return b.engagements;
  if (key === "rate") return reach ? (b.engagements / reach) * 100 : 0;
  if (key === "followers") return b.values.followers ?? 0;
  return b.posts;
}

export const display = (key: MetricKey, v: number) => (key === "rate" ? `${v.toFixed(2)}%` : formatIndian(v));

/** One or two sentences on how a KPI is counted; the rate one shows the sum with this period's own figures. */
export function metricHelp(view: View, key: MetricKey, totals: { reach: number; engagements: number }) {
  const platforms = view === "all" ? ANALYTICS_PLATFORMS : [view];
  if (key === "reach") {
    if (view === "all") return "X impressions + YouTube views + Instagram reach + Facebook reach, added up. Impressions and views count every time a post is seen, so one person can count more than once.";
    if (view === "X") return "Impressions: how many times X showed your posts, repeat views included.";
    if (view === "YouTube") return "Views: how many times your videos were watched, repeat views included.";
    return `Reach: accounts that saw your posts on ${view}, counted each day and added up over the period.`;
  }
  if (key === "engagements") {
    if (view === "all") return `Every interaction, added up: ${platforms.map((p) => `${ENGAGEMENT_TEXT[p]} on ${p}`).join("; ")}.`;
    return `Every interaction, added up: ${ENGAGEMENT_TEXT[view]}.`;
  }
  if (key === "rate") {
    const rate = totals.reach ? (totals.engagements / totals.reach) * 100 : 0;
    const per = view === "all" ? "total reach" : reachName(view).toLowerCase();
    return `Engagements ÷ ${per} × 100, over the whole period. Here: ${formatIndian(totals.engagements)} ÷ ${formatIndian(totals.reach)} × 100 = ${rate.toFixed(2)}%.`;
  }
  if (key === "followers") return view === "YouTube" ? "New subscribers minus unsubscribes in the period." : "New followers minus unfollows in the period, across the platforms in view.";
  return view === "all" ? "Posts, videos and reels published on all four platforms in the period." : `Posts published on ${view} in the period.`;
}
