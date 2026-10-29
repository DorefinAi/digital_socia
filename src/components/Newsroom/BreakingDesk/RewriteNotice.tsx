"use client";

// Web Scraper drafts: which publishers the words were reworded from, and a warning when the rewording is
// still too close to them (web-scraper-contract.md "Draft rewording"). Sits above the post text.

import React from "react";
import { Alert, Box, Link, Typography } from "@mui/material";
import { Repeat2 } from "lucide-react";
import type { DraftRewrite } from "@/lib/socia/types";
import { srOnly } from "./shared";

/** Only web links open; anything else in a publisher's URL shows as plain text */
const safeUrl = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
};

export default function RewriteNotice({ rewrite }: { rewrite: DraftRewrite }) {
  const sources = rewrite.sources ?? [];
  const n = sources.length;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, mb: 1 }}>
      {rewrite.tooClose && (
        <Alert severity="warning" variant="outlined" sx={{ py: 0.25, fontSize: "0.8125rem", fontWeight: 600, borderRadius: "8px", alignItems: "center" }}>
          Too close to the source — reword before posting
        </Alert>
      )}
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.75, color: "text.secondary" }}>
        <Box component="span" aria-hidden sx={{ display: "flex", mt: "2px", flexShrink: 0 }}>
          <Repeat2 size={14} />
        </Box>
        <Typography component="p" sx={{ fontSize: "0.75rem", lineHeight: 1.5, minWidth: 0 }}>
          {n ? `Reworded from ${n} ${n === 1 ? "source" : "sources"}: ` : "Reworded from the publisher's story"}
          {sources.map((s, i) => {
            const href = safeUrl(s.url);
            const name = s.name || "Source";
            return (
              <React.Fragment key={`${s.url}${i}`}>
                {i > 0 && ", "}
                {href ? (
                  <Link href={href} target="_blank" rel="noopener noreferrer" underline="always" sx={{ color: "text.primary", fontWeight: 600, overflowWrap: "anywhere" }}>
                    {name}
                    <Box component="span" sx={srOnly}>
                      {" "}(opens in a new tab)
                    </Box>
                  </Link>
                ) : (
                  <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>{name}</Box>
                )}
              </React.Fragment>
            );
          })}
        </Typography>
      </Box>
    </Box>
  );
}
