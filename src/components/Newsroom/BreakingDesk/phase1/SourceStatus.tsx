"use client";

// Phase 1's source health in the Post Studio header: is the newsroom share answering, is today's folder
// there, and when did the last breaking file come in (phase1-contract.md §6, GET /ingest/status).

import React, { useEffect, useState } from "react";
import { Box, Popover, Typography } from "@mui/material";
import * as socia from "@/lib/socia/api";
import { ApiError } from "@/lib/socia/client";
import { usePolled } from "@/lib/socia/usePolled";
import type { IngestStatus } from "@/lib/socia/types";

const POLL_MS = 5000;

async function ingestOrNull(): Promise<IngestStatus | null> {
  try {
    return await socia.fetchIngestStatus();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

function agoSeconds(seconds: number): string {
  const mins = Math.max(0, Math.floor(seconds / 60));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return `${h} hr ${mins % 60} min ago`;
}

type Level = "ok" | "wait" | "bad";
const DOT: Record<Level, string> = { ok: "success.main", wait: "warning.main", bad: "error.main" };

/** "Share connected · 30_OCTOBER_2026 · last file 2 min ago", amber while waiting, red when the share is unreadable. */
export default function SourceStatus() {
  const polled = usePolled(ingestOrNull, POLL_MS, "ingest-source");
  const status = polled.data;
  const [now, setNow] = useState(() => Date.now());
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const src = status?.source ?? null;
  // todayFolderFound is for everyone; the folder's name only for Settings users (older servers: the name)
  const folderFound = src ? (src.todayFolderFound ?? !!src.todayFolder) : false;
  // The server's age of the last file (its clock), counted on locally between polls; else from lastFileAt
  const lastAge =
    src?.lastFileAgeSeconds != null
      ? src.lastFileAgeSeconds + Math.max(0, Math.round((now - new Date(src.checkedAt).getTime()) / 1000))
      : src?.lastFileAt
        ? Math.max(0, Math.round((now - new Date(src.lastFileAt).getTime()) / 1000))
        : null;
  const badData = (status?.dataFiles ?? []).filter((f) => !f.ok);
  const dataProblem = status?.state === "data_file_problem" || badData.length > 0;
  let level: Level = "ok";
  let line: string;
  if (polled.error) {
    level = "bad";
    line = "Can't reach the Socia server";
  } else if (!status) {
    level = "wait";
    line = polled.loading ? "Checking the share" : "Source status unknown";
  } else if (!src) {
    level = status.lastError ? "bad" : "wait";
    line = status.lastError ? "Intake error" : "No share configured";
  } else if (!src.reachable || status.state === "share_unreachable" || status.state === "error" || src.lastError) {
    level = "bad";
    line = src.reachable ? "Can't read the share" : "Share not reachable";
  } else if (!folderFound) {
    level = "wait";
    line = src.expectedFolder ? `Waiting for today's folder ${src.expectedFolder}` : "Waiting for today's folder";
  } else {
    // Quiet for over 20 minutes in the day is worth a look, not an alarm
    const quiet = lastAge === null ? true : lastAge > 20 * 60;
    level = quiet || dataProblem ? "wait" : "ok";
    line = lastAge === null ? "No breaking file today yet" : `Last file ${agoSeconds(lastAge)}`;
    if (dataProblem) line += ", data file problem";
  }

  // Fields the server leaves out for non-admins (folder names, file names, error text) are simply not listed
  const rows: [string, string][] = src
    ? ([
        ["Share", src.reachable ? "Connected" : "Not reachable"],
        ["Today's folder", folderFound ? (src.todayFolder ?? src.expectedFolder ?? "Found") : src.expectedFolder ? `Not created yet (${src.expectedFolder})` : "Not created yet"],
        src.alsoScanning ? ["Also reading", src.alsoScanning] : null,
        typeof src.filesToday === "number" ? ["Files today", String(src.filesToday)] : null,
        ["Last file", src.lastFileAt && lastAge !== null ? `${clock(src.lastFileAt)} (${agoSeconds(lastAge)})` : "None yet"],
        src.lastFileName ? ["Name", src.lastFileName] : null,
        src.checkedAt ? ["Checked", clock(src.checkedAt)] : null,
        ...badData.map((f) => [`Data file: ${f.file}`, f.message ?? "Problem reading it"]),
      ].filter(Boolean) as [string, string][])
    : [];
  const error = src?.lastError ?? status?.lastError ?? null;

  return (
    <>
      <Box
        component="button"
        type="button"
        onClick={(e: React.MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)}
        aria-haspopup="dialog"
        aria-label={`Newsroom share: ${line}. Show details`}
        sx={{ display: "flex", alignItems: "center", gap: 1, height: 36, maxWidth: { xs: "100%", sm: 340 }, minWidth: 0, px: 1.25, border: "1px solid", borderColor: level === "bad" ? "error.main" : "divider", borderRadius: "8px", backgroundColor: "background.paper", color: "text.primary", fontFamily: "inherit", fontSize: "0.8125rem", cursor: "pointer", "&:hover": { borderColor: "text.secondary" }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } }}
      >
        <Box aria-hidden sx={{ width: 8, height: 8, flexShrink: 0, borderRadius: "50%", backgroundColor: DOT[level] }} />
        <Box component="span" sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {src?.reachable && src.todayFolder && level !== "bad" ? (
            <>
              <Box component="span" sx={{ display: { xs: "none", md: "inline" }, color: "text.secondary" }}>
                {src.filesToday} files today ·{" "}
              </Box>
              {line}
            </>
          ) : (
            line
          )}
        </Box>
      </Box>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }} slotProps={{ paper: { sx: { mt: 0.75, p: 2, width: 320, maxWidth: "calc(100vw - 32px)", borderRadius: "12px" } } }}>
        <Typography component="h2" sx={{ fontSize: "0.875rem", fontWeight: 700, mb: 1 }}>
          Newsroom share
        </Typography>
        {rows.length ? (
          <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", columnGap: 1.5, rowGap: 0.5, fontSize: "0.8125rem" }}>
            {rows.map(([k, v]) => (
              <React.Fragment key={k}>
                <Box component="dt" sx={{ color: "text.secondary" }}>{k}</Box>
                <Box component="dd" sx={{ m: 0, overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}>{v}</Box>
              </React.Fragment>
            ))}
          </Box>
        ) : (
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{line}.</Typography>
        )}
        {error && (
          <Typography role="alert" sx={{ mt: 1.25, fontSize: "0.8125rem", color: "error.main", overflowWrap: "anywhere" }}>
            {error.at ? `${clock(error.at)}: ` : ""}
            {error.message || "The share couldn't be read."}
          </Typography>
        )}
      </Popover>
    </>
  );
}
