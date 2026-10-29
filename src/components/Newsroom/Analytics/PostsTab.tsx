"use client";

// "Posts": platform numbers for what we posted (GET /analytics/posts and /analytics/insights).
// Until real platform access arrives the numbers are samples, and the page says so.

import React, { useState } from "react";
import { Box, Link as MuiLink, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, Typography } from "@mui/material";
import { ExternalLink, Film } from "lucide-react";
import { anyFake, fetchInsights, fetchPostAnalytics, PLATFORM_LABEL, type AnalyticsPost, type AnalyticsRange, type MetricsPlatform, type PostSort } from "@/lib/socia/analytics";
import { demoInsights, demoPostAnalytics } from "@/data/analyticsMock";
import { LoadError, LoadingRows } from "@/components/Newsroom/SociaDesk/liveShared";
import { SegmentedControl } from "../ui/controls";
import { BarList, ChartCard, COLOR, EmptyNote, fmt, hourLabel, HourBars, pct, SampleBadge, StatTile } from "./parts";
import { useAnalyticsData } from "./useAnalyticsData";

type ColumnSort = PostSort | "replies" | "postedAt";
const SERVER_SORTS: PostSort[] = ["impressions", "likes", "reposts", "engagement"];
const VALUE: Record<ColumnSort, (p: AnalyticsPost) => number> = {
  impressions: (p) => p.metrics?.impressions ?? -1,
  likes: (p) => p.metrics?.likes ?? -1,
  reposts: (p) => p.metrics?.reposts ?? -1,
  replies: (p) => p.metrics?.replies ?? -1,
  engagement: (p) => p.engagementRate ?? -1,
  postedAt: (p) => new Date(p.postedAt).getTime() || 0,
};
const platformName = (p: string) => PLATFORM_LABEL[p as MetricsPlatform] ?? p;
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "–" : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
};

export default function PostsTab({ live, range, rangeKey }: { live: boolean; range: AnalyticsRange; rangeKey: string }) {
  const [platform, setPlatform] = useState<MetricsPlatform | "all">("all");
  const [sort, setSort] = useState<{ by: ColumnSort; dir: "asc" | "desc" }>({ by: "impressions", dir: "desc" });
  // The server picks the top posts by one of its sorts; the other columns sort what came back
  const [serverSort, setServerSort] = useState<PostSort>("impressions");

  const posts = useAnalyticsData(live, `posts-${rangeKey}-${platform}-${serverSort}`, () => fetchPostAnalytics(range, platform, serverSort), () => demoPostAnalytics(range, platform, serverSort));
  const insights = useAnalyticsData(live, `insights-${rangeKey}-${platform}`, () => fetchInsights(range, platform), () => demoInsights(range, platform));

  const sample = !live || (posts.data ? anyFake(posts.data.mode, platform) : false) || (insights.data ? anyFake(insights.data.mode, platform) : false);

  const onSort = (by: ColumnSort) => {
    const dir = sort.by === by ? (sort.dir === "desc" ? "asc" : "desc") : "desc";
    setSort({ by, dir });
    if ((SERVER_SORTS as string[]).includes(by)) setServerSort(by as PostSort);
  };
  const items = [...(posts.data?.items ?? [])].sort((a, b) => (sort.dir === "asc" ? 1 : -1) * (VALUE[sort.by](a) - VALUE[sort.by](b)));

  const head = (by: ColumnSort, label: string) => (
    <TableCell align="right" sortDirection={sort.by === by ? sort.dir : false} sx={{ fontWeight: 700, fontSize: "0.75rem", whiteSpace: "nowrap" }}>
      <TableSortLabel active={sort.by === by} direction={sort.by === by ? sort.dir : "desc"} onClick={() => onSort(by)}>
        {label}
      </TableSortLabel>
    </TableCell>
  );

  const ins = insights.data;
  const totalImpr = (posts.data?.items ?? []).reduce((s, p) => s + (p.metrics?.impressions ?? 0), 0);
  const rated = (posts.data?.items ?? []).filter((p) => p.engagementRate !== null);
  const avgRate = rated.length ? rated.reduce((s, p) => s + p.engagementRate!, 0) / rated.length : null;
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, value: ins?.byHour.find((h) => h.hour === hour)?.avgEngagement ?? 0 }));
  const bestHour = byHour.reduce((b, d) => (d.value > b.value ? d : b), byHour[0]);
  const fw = ins?.footageVsNot.withFootage;
  const fo = ins?.footageVsNot.without;
  const lift = fw?.avgEngagement && fo?.avgEngagement ? fw.avgEngagement / fo.avgEngagement : null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap" }}>
        <SegmentedControl<MetricsPlatform | "all">
          ariaLabel="Platform"
          value={platform}
          onChange={setPlatform}
          options={[{ value: "all", label: "All" }, ...(["x", "facebook", "instagram", "youtube"] as MetricsPlatform[]).map((p) => ({ value: p, label: PLATFORM_LABEL[p] }))]}
        />
        {sample && <SampleBadge />}
      </Box>

      {posts.error && !posts.data ? (
        <LoadError error={posts.error} onRetry={() => void posts.refresh()} />
      ) : !posts.data ? (
        <LoadingRows rows={3} height={110} />
      ) : (
        <>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, gap: 1.5 }}>
            <StatTile label="Posts measured" value={fmt(posts.data.items.length)} note={posts.data.items.length >= 100 ? "The top 100 by the sorted column" : undefined} accent={COLOR.posted} />
            <StatTile label="Impressions" value={fmt(totalImpr)} note="Latest capture of each post" />
            <StatTile label="Average engagement" value={pct(avgRate, 2)} note="Likes, reposts, replies, quotes over impressions" />
            <StatTile label="Best hour" value={ins && bestHour.value > 0 ? `${hourLabel(bestHour.hour)}` : "–"} note={ins && bestHour.value > 0 ? `${pct(bestHour.value, 2)} average engagement, IST` : undefined} />
          </Box>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
            <ChartCard title="Top hashtags" subtitle="Posts using each tag, and their average engagement">
              {insights.error && !ins ? (
                <LoadError error={insights.error} onRetry={() => void insights.refresh()} />
              ) : !ins ? (
                <LoadingRows rows={4} height={22} />
              ) : (
                <BarList rows={ins.topHashtags.map((h) => ({ key: h.tag, label: h.tag, value: h.posts, display: `${fmt(h.posts)} posts`, note: pct(h.avgEngagement, 1) }))} empty="No hashtags on posts in this range." />
              )}
            </ChartCard>
            <ChartCard title="Footage or not" subtitle="Average engagement of posts with video against posts without">
              {!ins ? (
                <LoadingRows rows={2} height={56} />
              ) : !fw?.posts && !fo?.posts ? (
                <EmptyNote>No posts in this range.</EmptyNote>
              ) : (
                <>
                  <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.5 }}>
                    {[
                      { label: "With footage", g: fw, color: COLOR.posted, icon: <Film size={14} aria-hidden /> },
                      { label: "Without", g: fo, color: COLOR.received, icon: null },
                    ].map(({ label, g, color, icon }) => (
                      <Box key={label} sx={{ p: 1.5, borderRadius: "10px", border: "1px solid", borderColor: "divider", minWidth: 0 }}>
                        <Typography sx={{ display: "flex", alignItems: "center", gap: 0.5, fontSize: "0.75rem", fontWeight: 600, color: "text.secondary" }}>
                          {icon}
                          {label}
                        </Typography>
                        <Typography sx={{ fontSize: "1.375rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color }}>{pct(g?.avgEngagement, 2)}</Typography>
                        <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>{fmt(g?.posts ?? 0)} posts</Typography>
                      </Box>
                    ))}
                  </Box>
                  {lift && (
                    <Typography sx={{ fontSize: "0.8125rem" }}>
                      Posts with footage drew <b>{lift >= 1 ? `${lift.toFixed(1)}×` : `${Math.round(lift * 100)}%`}</b> the engagement of posts without.
                    </Typography>
                  )}
                </>
              )}
            </ChartCard>
          </Box>

          <ChartCard title="Engagement by hour posted" subtitle="Average engagement of posts by the IST hour they went out">
            {!ins ? <LoadingRows rows={1} height={200} /> : bestHour.value > 0 ? <HourBars data={byHour} color={COLOR.approved} label={(v) => pct(v, 1)} ariaLabel={`Average engagement by hour posted, best at ${hourLabel(bestHour.hour)} IST`} /> : <EmptyNote>No measured posts in this range.</EmptyNote>}
          </ChartCard>

          <ChartCard title="Posts" subtitle="Each post with its latest numbers. Sort by any column.">
            {!items.length ? (
              <EmptyNote>No posts {platform === "all" ? "" : `on ${PLATFORM_LABEL[platform]} `}in this range.</EmptyNote>
            ) : (
              <TableContainer sx={{ mx: -2, width: "auto", overflowX: "auto" }}>
                <Table size="small" aria-label="Posts with their numbers" sx={{ minWidth: 820 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Post</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Platform</TableCell>
                      <TableCell sortDirection={sort.by === "postedAt" ? sort.dir : false} sx={{ fontWeight: 700, fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                        <TableSortLabel active={sort.by === "postedAt"} direction={sort.by === "postedAt" ? sort.dir : "desc"} onClick={() => onSort("postedAt")}>
                          Posted
                        </TableSortLabel>
                      </TableCell>
                      {head("impressions", "Impressions")}
                      {head("likes", "Likes")}
                      {head("reposts", "Reposts")}
                      {head("replies", "Replies")}
                      {head("engagement", "Engagement")}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.map((p) => (
                      <TableRow key={`${p.platform}-${p.id}`} hover>
                        <TableCell sx={{ maxWidth: 340, minWidth: 220 }}>
                          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.75 }}>
                            <Box sx={{ minWidth: 0 }}>
                              {p.permalink ? (
                                <MuiLink href={p.permalink} target="_blank" rel="noopener noreferrer" underline="hover" color="inherit" sx={{ fontSize: "0.8125rem", fontWeight: 600, display: "inline-flex", alignItems: "baseline", gap: 0.5 }}>
                                  {p.headline || "Untitled post"}
                                  <ExternalLink size={11} aria-hidden style={{ flexShrink: 0 }} />
                                </MuiLink>
                              ) : (
                                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>{p.headline || "Untitled post"}</Typography>
                              )}
                              <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", mt: 0.25 }}>
                                {[p.district, p.category, p.hasFootage ? "with footage" : null].filter(Boolean).join(", ")}
                                {p.hashtags.length > 0 && (
                                  <Box component="span" sx={{ ml: 0.75 }}>
                                    {p.hashtags.join(" ")}
                                  </Box>
                                )}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}>{platformName(p.platform)}</TableCell>
                        <TableCell sx={{ fontSize: "0.8125rem", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{when(p.postedAt)}</TableCell>
                        {(["impressions", "likes", "reposts", "replies"] as const).map((k) => (
                          <TableCell key={k} align="right" sx={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}>
                            {fmt(p.metrics?.[k])}
                          </TableCell>
                        ))}
                        <TableCell align="right" sx={{ fontSize: "0.8125rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                          {pct(p.engagementRate, 2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </ChartCard>
        </>
      )}
    </Box>
  );
}
