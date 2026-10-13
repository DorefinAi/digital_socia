"use client";

import { Box, Typography, Button, Tooltip as MuiTooltip } from "@mui/material";
import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, MapPin, RefreshCw } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { useThemeMode } from "@/providers/MuiProvider";
import { SocialPlatform } from "@/types/newsroom";
import PostedPostsList from "./BreakingDesk/PostedPostsList";
import { InstagramIcon, PLATFORM_META, TagChip, XIcon, timeAgo } from "./BreakingDesk/shared";

const INSTAGRAM_PINK = "#D62976";

const panelSx = {
  backgroundColor: "background.paper",
  border: "1px solid",
  borderColor: "divider",
  borderRadius: "8px",
};

const SectionHeader: React.FC<{ title: string; href?: string; linkLabel?: string }> = ({ title, href, linkLabel }) => (
  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.25, minHeight: 30 }}>
    <Typography component="h2" sx={{ fontWeight: 600, fontSize: "0.8125rem" }}>
      {title}
    </Typography>
    {href && (
      <Button component={Link} href={href} size="small" endIcon={<ArrowRight size={14} />} sx={{ minHeight: 30, fontSize: "0.75rem", color: "text.secondary" }}>
        {linkLabel}
      </Button>
    )}
  </Box>
);

const NewsroomDashboard: React.FC = () => {
  const { metrics, ftpNews, socialPosts, activity, permissions, fetchFtpNews, ftpSyncedAt } = useNewsroom();
  const [fetchNote, setFetchNote] = useState("");
  const { mode } = useThemeMode();
  const ink = mode === "light" ? "#111111" : "#F2F2F2";

  const postedOn = (platform: SocialPlatform) => new Set(socialPosts.filter((p) => p.platform === platform).map((p) => p.newsId));
  const onX = postedOn("X (Twitter)");
  const onInstagram = postedOn("Instagram");
  const queue = ftpNews.filter((n) => !onX.has(n.id) || !onInstagram.has(n.id));

  const today = new Date().toDateString();
  const postedToday = socialPosts.filter((p) => new Date(p.postedAt).toDateString() === today);
  const todayX = postedToday.filter((p) => p.platform === "X (Twitter)").length;

  const week = Array.from({ length: 7 }, (_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - (6 - i));
    const posts = socialPosts.filter((p) => new Date(p.postedAt).toDateString() === day.toDateString());
    return {
      day: i === 6 ? "Today" : day.toLocaleDateString("en-IN", { weekday: "short" }),
      X: posts.filter((p) => p.platform === "X (Twitter)").length,
      Instagram: posts.filter((p) => p.platform === "Instagram").length,
    };
  });

  const stats = [
    { label: "Breaking to post", value: queue.length, note: `${queue.filter((n) => n.tag === "big_breaking").length} big breaking` },
    { label: "Posted today", value: postedToday.length, note: `X ${todayX} · Instagram ${postedToday.length - todayX}` },
    { label: "Posted this week", value: week.reduce((sum, d) => sum + d.X + d.Instagram, 0), note: "Last 7 days" },
    { label: "Awaiting approval", value: metrics.storiesPending, note: "In the approval portal" },
  ];

  const platformButton = (newsId: string, platform: SocialPlatform, done: boolean) => {
    const meta = PLATFORM_META[platform];
    const icon = platform === "Instagram" ? <InstagramIcon size={14} color={done ? "currentColor" : INSTAGRAM_PINK} /> : <XIcon size={13} />;
    if (done) {
      return (
        <MuiTooltip title={`Posted to ${meta.short}`}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 1, height: 30, fontSize: "0.75rem", color: "success.main" }}>
            {icon}
            <Check size={13} />
          </Box>
        </MuiTooltip>
      );
    }
    return (
      <Button
        component={Link}
        href={`${meta.path}?compose=${newsId}`}
        variant="outlined"
        size="small"
        disabled={!permissions.canApproveSocialContent}
        startIcon={icon}
        sx={{ minHeight: 28, minWidth: 0, px: 1, fontSize: "0.75rem", borderColor: "divider", color: "text.primary", whiteSpace: "nowrap" }}
      >
        Post
      </Button>
    );
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, mt: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap" }}>
        <Box>
          <Typography component="h1" sx={{ fontWeight: 600, fontSize: "1.125rem", letterSpacing: "-0.01em" }}>
            Today on the desk
          </Typography>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })} · {fetchNote || `FTP checked ${timeAgo(ftpSyncedAt)}`}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshCw size={14} />}
          onClick={() => {
            const added = fetchFtpNews();
            setFetchNote(added ? `${added} new breaking ${added === 1 ? "story" : "stories"} from FTP` : "FTP checked, nothing new");
          }}
          sx={{ borderColor: "divider", color: "text.primary" }}
        >
          Fetch from FTP
        </Button>
      </Box>

      {/* Key numbers */}
      <Box sx={{ ...panelSx, display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" } }}>
        {stats.map((stat, i) => (
          <Box
            key={stat.label}
            sx={{
              px: 1.75,
              py: 1.25,
              borderStyle: "solid",
              borderColor: "divider",
              borderWidth: 0,
              borderLeftWidth: { xs: i % 2, md: i ? 1 : 0 },
              borderTopWidth: { xs: i > 1 ? 1 : 0, md: 0 },
            }}
          >
            <Typography sx={{ fontSize: "0.6875rem", fontWeight: 500, color: "text.secondary" }}>{stat.label}</Typography>
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: "1.375rem", fontWeight: 600, lineHeight: 1.3, fontVariantNumeric: "tabular-nums" }}>{stat.value}</Typography>
              <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>{stat.note}</Typography>
            </Box>
          </Box>
        ))}
      </Box>

      {/* Queue + posted */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1.1fr) minmax(0, 1fr)" }, gap: 2.5, alignItems: "start" }}>
        <Box>
          <SectionHeader title="Breaking queue" href="/ai-content/x" linkLabel="Open desk" />
          {queue.length === 0 ? (
            <Box sx={{ py: 5, px: 2, textAlign: "center", border: "1px dashed", borderColor: "divider", borderRadius: "8px" }}>
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }}>Queue is clear</Typography>
              <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.5 }}>
                Every breaking story is out on both platforms. Fetch from FTP on the desk to check for new ones.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ ...panelSx, overflow: "hidden" }}>
              {queue.slice(0, 5).map((item, i) => (
                <Box
                  key={item.id}
                  sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 1.25, py: 1, borderTop: i ? "1px solid" : "none", borderColor: "divider" }}
                >
                  <Box sx={{ display: { xs: "none", sm: "block" }, width: 56, height: 40, flexShrink: 0, borderRadius: "4px", overflow: "hidden", backgroundColor: "#111" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.media[0].posterUrl ?? item.media[0].url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.headline}
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.25, fontSize: "0.6875rem", color: "text.secondary", whiteSpace: "nowrap", overflow: "hidden" }}>
                      <TagChip tag={item.tag} />
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
                        <MapPin size={12} /> {item.area}
                      </Box>
                      <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>{timeAgo(item.receivedAt)}</Box>
                    </Box>
                  </Box>
                  <Box sx={{ display: "flex", gap: 0.75, flexShrink: 0 }}>
                    {platformButton(item.id, "X (Twitter)", onX.has(item.id))}
                    {platformButton(item.id, "Instagram", onInstagram.has(item.id))}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        <Box>
          <SectionHeader title="Posted" href="/ai-content/x" linkLabel="All posts" />
          <PostedPostsList limit={5} />
        </Box>
      </Box>

      {/* Output + activity */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1.1fr) minmax(0, 1fr)" }, gap: 2.5, alignItems: "start" }}>
        <Box>
          <SectionHeader title="Posts in the last 7 days" />
          <Box sx={{ ...panelSx, p: 2 }}>
            <Box sx={{ display: "flex", gap: 2, mb: 1, fontSize: "0.75rem", color: "text.secondary" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: "2px", backgroundColor: ink }} /> X
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: "2px", backgroundColor: INSTAGRAM_PINK }} /> Instagram
              </Box>
            </Box>
            <Box sx={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={week} margin={{ top: 5, right: 4, left: -24, bottom: 0 }} barCategoryGap="28%">
                  <CartesianGrid vertical={false} stroke={mode === "light" ? "#EDEDED" : "#2C2C2C"} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={11} />
                  <YAxis axisLine={false} tickLine={false} fontSize={11} allowDecimals={false} />
                  <Tooltip cursor={{ fill: mode === "light" ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.06)" }} contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #ddd", color: "#111" }} />
                  <Bar dataKey="X" stackId="posts" fill={ink} isAnimationActive={false} />
                  <Bar dataKey="Instagram" stackId="posts" fill={INSTAGRAM_PINK} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Box>
        </Box>

        <Box>
          <SectionHeader title="Recent activity" />
          <Box sx={{ ...panelSx, px: 1.75, py: 0.5, maxHeight: 266, overflowY: "auto" }}>
            {activity.slice(0, 8).map((item, i) => (
              <Box key={item.id} sx={{ py: 1.1, borderTop: i ? "1px solid" : "none", borderColor: "divider" }}>
                <Typography sx={{ fontSize: "0.8125rem", lineHeight: 1.45 }}>
                  <strong>{item.actor}</strong> <span style={{ opacity: 0.7 }}>{item.action}</span> {item.target}
                </Typography>
                <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", mt: 0.25 }}>{timeAgo(item.timestamp)}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default NewsroomDashboard;
