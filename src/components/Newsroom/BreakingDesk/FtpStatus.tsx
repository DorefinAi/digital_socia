"use client";

import React, { useEffect, useState } from "react";
import { Box, Typography, Button, Popover, CircularProgress, Tooltip } from "@mui/material";
import { History, RefreshCw } from "lucide-react";
import { FTP_POLL_SECONDS, useNewsroom } from "@/providers/NewsroomProvider";

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

/** Shows that the FTP is being checked automatically, when it last ran, and what recent checks brought in. */
export default function FtpStatus({ onManualFetch }: { onManualFetch?: (added: number) => void }) {
  const { ftpSyncedAt, ftpFetchLog, fetchFtpNews, nextFetchAt } = useNewsroom();
  const [now, setNow] = useState(() => Date.now());
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const since = Math.max(0, Math.round((now - new Date(ftpSyncedAt).getTime()) / 1000));
  const nextIn = Math.max(0, Math.ceil((nextFetchAt - now) / 1000));
  const last = ftpFetchLog[0];

  const checkNow = () => {
    setChecking(true);
    // Brief delay stands in for the FTP round-trip
    setTimeout(() => {
      const added = fetchFtpNews();
      setChecking(false);
      onManualFetch?.(added);
    }, 600);
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
      <Tooltip title="Show recent FTP checks">
        <Box
          component="button"
          onClick={(e: React.MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)}
          aria-label="FTP fetch status and history"
          sx={{ display: "flex", alignItems: "center", gap: 1, height: 36, px: 1.25, border: "1px solid", borderColor: "divider", borderRadius: "8px", backgroundColor: "background.paper", color: "text.primary", fontFamily: "inherit", cursor: "pointer", "&:hover": { borderColor: "text.secondary" } }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: "success.main",
              boxShadow: "0 0 0 0 rgba(46,125,50,0.5)",
              animation: "ftpPulse 2s infinite",
              "@keyframes ftpPulse": { "0%": { boxShadow: "0 0 0 0 rgba(46,125,50,0.5)" }, "70%": { boxShadow: "0 0 0 6px rgba(46,125,50,0)" }, "100%": { boxShadow: "0 0 0 0 rgba(46,125,50,0)" } },
            }}
          />
          <Box sx={{ textAlign: "left", lineHeight: 1.2 }}>
            <Typography sx={{ fontSize: "0.75rem", fontWeight: 600 }}>FTP auto-fetch on</Typography>
            <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
              checked {since < 2 ? "just now" : `${since}s ago`} · next in {nextIn}s
            </Typography>
          </Box>
          <History size={14} />
        </Box>
      </Tooltip>
      <Button
        variant="outlined"
        onClick={checkNow}
        disabled={checking}
        startIcon={checking ? <CircularProgress size={14} color="inherit" /> : <RefreshCw size={14} />}
        sx={{ height: 36, fontWeight: 600, borderColor: "divider", color: "text.primary", whiteSpace: "nowrap" }}
      >
        {checking ? "Checking" : "Check now"}
      </Button>

      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { mt: 1, width: 360, maxHeight: 420, borderRadius: "12px", boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.15)" } } }}
      >
        <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>FTP fetch history</Typography>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            Checked automatically every {FTP_POLL_SECONDS} seconds{last ? `. Last: ${clock(last.at)}` : ""}
          </Typography>
        </Box>
        <Box sx={{ maxHeight: 340, overflowY: "auto" }}>
          {ftpFetchLog.length === 0 && <Typography sx={{ p: 2, fontSize: "0.8125rem", color: "text.secondary" }}>No checks yet. The first one runs within {FTP_POLL_SECONDS} seconds.</Typography>}
          {ftpFetchLog.map((run, i) => (
            <Box key={run.id} sx={{ display: "flex", gap: 1.25, px: 2, py: 1, borderTop: i ? "1px solid" : "none", borderColor: "divider" }}>
              <Typography sx={{ fontSize: "0.75rem", fontFamily: "var(--font-mono), ui-monospace, monospace", color: "text.secondary", pt: "1px", flexShrink: 0 }}>{clock(run.at)}</Typography>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: run.added ? 600 : 400, color: run.added ? "success.main" : "text.secondary" }}>
                  {run.added ? `${run.added} new ${run.added === 1 ? "story" : "stories"}` : "No new stories"}
                  <Box component="span" sx={{ color: "text.disabled", fontWeight: 400 }}>
                    {" "}· {run.trigger === "auto" ? "auto" : "manual"}
                  </Box>
                </Typography>
                {run.headlines.map((h) => (
                  <Typography key={h} sx={{ fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {h}
                  </Typography>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      </Popover>
    </Box>
  );
}
