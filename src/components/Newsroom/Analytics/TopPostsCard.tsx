"use client";

import React, { useState } from "react";
import { Box, Link as MuiLink, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { ExternalLink } from "lucide-react";
import type { TopPost } from "@/data/analyticsData";
import { CardHeading, cardSx } from "./AnalyticsParts";
import { formatIndian } from "./exportPdf";
import { PLATFORM_ICON } from "./platformIcons";

type SortBy = "reach" | "engagements";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Box sx={{ textAlign: { xs: "left", sm: "right" }, minWidth: 0 }}>
      <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", lineHeight: 1.3 }}>{label}</Typography>
      <Typography sx={{ fontSize: "0.875rem", fontWeight: strong ? 700 : 500, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
    </Box>
  );
}

/** The five best posts in the period, ranked by reach or engagements. */
export default function TopPostsCard({ posts, scope, segmentSx }: { posts: TopPost[]; scope: string; segmentSx: object }) {
  const [by, setBy] = useState<SortBy>("reach");
  const top = [...posts].sort((a, b) => b[by] - a[by]).slice(0, 5);

  return (
    <Box sx={cardSx}>
      <CardHeading title={`Top 5 posts · ${scope}`} hint={`Ranked by ${by === "reach" ? "reach (views on YouTube)" : "engagements"} in the selected range.`}>
        <ToggleButtonGroup value={by} exclusive size="small" onChange={(_, v) => v && setBy(v)} aria-label="Rank posts by" data-pdf-hide="true" sx={{ height: 32, ...segmentSx }}>
          <ToggleButton value="reach">Reach</ToggleButton>
          <ToggleButton value="engagements">Engagements</ToggleButton>
        </ToggleButtonGroup>
      </CardHeading>

      {top.length === 0 ? (
        <Typography sx={{ py: 4, textAlign: "center", color: "text.secondary", fontSize: "0.875rem" }}>No posts in this range. Pick a wider or more recent range.</Typography>
      ) : (
        <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0 }}>
          {top.map((p, i) => (
            <Box
              component="li"
              key={p.id}
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "18px 64px minmax(0, 1fr) 36px", sm: "22px 80px minmax(0, 1fr) 96px 110px 36px" },
                gridTemplateAreas: { xs: '"rank thumb text link" ". nums nums nums"', sm: '"rank thumb text reach eng link"' },
                columnGap: { xs: 1.25, sm: 1.5 },
                rowGap: 0.75,
                alignItems: "center",
                py: 1.25,
                borderTop: i === 0 ? "none" : "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography aria-hidden sx={{ gridArea: "rank", fontSize: "0.8125rem", fontWeight: 700, color: "text.secondary", fontVariantNumeric: "tabular-nums", alignSelf: "start", pt: 0.25 }}>{i + 1}</Typography>
              <Box sx={{ gridArea: "thumb", aspectRatio: "16 / 10", borderRadius: "6px", overflow: "hidden", backgroundColor: "#111" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.thumbUrl && <img src={p.thumbUrl} alt="" loading="lazy" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
              </Box>
              <Box sx={{ gridArea: "text", minWidth: 0 }}>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{p.title}</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.25, color: "text.secondary" }}>
                  <Box sx={{ display: "flex", flexShrink: 0 }}>{PLATFORM_ICON[p.platform]}</Box>
                  <Typography sx={{ fontSize: "0.6875rem", fontVariantNumeric: "tabular-nums" }}>
                    {p.platform}, {when(p.postedAt)}
                  </Typography>
                </Box>
              </Box>
              {/* On phones the two figures sit side by side under the title */}
              <Box sx={{ gridArea: { xs: "nums", sm: "reach / reach / eng / eng" }, display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "96px 110px" }, columnGap: 1.5 }}>
                <Figure label={p.platform === "YouTube" ? "Views" : "Reach"} value={formatIndian(p.reach)} strong />
                <Figure label="Engagements" value={`${formatIndian(p.engagements)} (${p.rate.toFixed(1)}%)`} />
              </Box>
              <MuiLink href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`Open post on ${p.platform}: ${p.title}`} sx={{ gridArea: "link", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, color: "text.secondary", borderRadius: "6px", "&:hover": { color: "text.primary" } }}>
                <ExternalLink size={15} />
              </MuiLink>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
