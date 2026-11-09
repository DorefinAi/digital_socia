"use client";

// Phase 1's intake alarm in the Post Studio header (phase1-contract.md §6, GET /ingest/status). Shows nothing
// while files are being read; a red "Intake stopped" only when the worker has stopped, so the desk knows new
// files will not arrive.

import React, { useEffect, useState } from "react";
import { Box } from "@mui/material";
import * as socia from "@/lib/socia/api";
import { ApiError } from "@/lib/socia/client";
import { usePolled } from "@/lib/socia/usePolled";
import type { IngestStatus } from "@/lib/socia/types";

const POLL_MS = 5000;
/** The worker polls every few seconds; a last poll older than this means it has stopped (same limit as the API) */
const STOPPED_AFTER_MS = 90_000;
const STOPPED_LINE = "Intake stopped — new files are not being read. Tell the tech team.";

async function ingestOrNull(): Promise<IngestStatus | null> {
  try {
    return await socia.fetchIngestStatus();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

/** Red "Intake stopped" when the worker has stopped; nothing otherwise. */
export default function SourceStatus() {
  const polled = usePolled(ingestOrNull, POLL_MS, "ingest-source");
  const status = polled.data;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  // The server decides (it counts the worker's heartbeat, so a long scan is not "stopped", and its clock is the
  // worker's). Only a server too old to send `state` is judged by this browser's clock.
  const lastPoll = status?.workerLastSeenAt ?? status?.lastPollAt ?? status?.source?.checkedAt ?? null;
  const stopped = status?.state ? status.state === "stopped" : lastPoll !== null && now - new Date(lastPoll).getTime() > STOPPED_AFTER_MS;
  if (!status || polled.error || !stopped) return null;

  return (
    <Box
      role="alert"
      sx={{ display: "flex", alignItems: "center", gap: 1, minHeight: 36, maxWidth: { xs: "100%", sm: 420 }, minWidth: 0, px: 1.25, py: 0.5, border: "1px solid", borderColor: "error.main", borderRadius: "8px", backgroundColor: "background.paper", color: "error.main", fontSize: "0.8125rem", fontWeight: 600 }}
    >
      <Box aria-hidden sx={{ width: 8, height: 8, flexShrink: 0, borderRadius: "50%", backgroundColor: "error.main" }} />
      <span>
        {STOPPED_LINE}
        {lastPoll ? ` Last check ${clock(lastPoll)}.` : ""}
      </span>
    </Box>
  );
}
