"use client";

// Analytics (/analytics), contract: handoff/scraper-analytics-contract.md (B, C). Editors and admins.
// "Desk": our own numbers from Socia's tables. "Posts": platform numbers per post, samples until the
// platform accounts are connected. Live it reads the Socia API; in demo mode src/data/analyticsMock.ts.

import React, { useState } from "react";
import { Box, TextField, Typography } from "@mui/material";
import { BarChart3, ClipboardList, Megaphone } from "lucide-react";
import ResponsiveTabs from "@/components/Layout/ResponsiveTabs";
import { USE_MOCKS } from "@/lib/socia/config";
import { fetchDeskAnalytics, type AnalyticsRange } from "@/lib/socia/analytics";
import { demoDeskAnalytics } from "@/data/analyticsMock";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { LoadError, LoadingRows } from "@/components/Newsroom/SociaDesk/liveShared";
import { SegmentedControl } from "../ui/controls";
import DeskTab from "./DeskTab";
import PostsTab from "./PostsTab";
import { useAnalyticsData } from "./useAnalyticsData";

type Tab = "desk" | "posts";
type Preset = "7" | "30" | "90" | "custom";
const MAX_DAYS = 92;
const STORE_KEY = "socia_analytics_view_v1";
const IST_MS = 5.5 * 3600_000;
const DAY_MS = 86_400_000;

/** Today's date in IST, YYYY-MM-DD */
const todayIst = () => new Date(Date.now() + IST_MS).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS) + 1;
const longDate = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** IST days as the API's ISO instants: from the start of the first day to the end of the last */
const toRange = (from: string, to: string): AnalyticsRange => ({ from: new Date(`${from}T00:00:00+05:30`).toISOString(), to: new Date(`${to}T23:59:59.999+05:30`).toISOString() });

interface View {
  tab: Tab;
  preset: Preset;
  from: string;
  to: string;
}
function readView(): View {
  const today = todayIst();
  const fallback: View = { tab: "desk", preset: "7", from: addDays(today, -6), to: today };
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Partial<View> | null;
    if (!raw) return fallback;
    const tab: Tab = raw.tab === "posts" ? "posts" : "desk";
    const preset = (["7", "30", "90", "custom"] as const).find((p) => p === raw.preset) ?? "7";
    if (preset !== "custom") return { tab, preset, from: addDays(today, -(Number(preset) - 1)), to: today };
    const ok = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
    return ok(raw.from) && ok(raw.to) ? { tab, preset, from: raw.from, to: raw.to } : { ...fallback, tab };
  } catch {
    return fallback;
  }
}

function rangeError(from: string, to: string): string | null {
  if (!from || !to) return "Pick both dates.";
  if (from > to) return "The start date is after the end date.";
  if (to > todayIst()) return "The end date is in the future.";
  if (daysBetween(from, to) > MAX_DAYS) return `Pick ${MAX_DAYS} days or fewer.`;
  return null;
}

export default function AnalyticsPage() {
  const live = !USE_MOCKS;
  const { currentRole } = useNewsroom();
  const allowed = currentRole === "admin" || currentRole === "editor";

  const [view, setViewState] = useState<View>(readView);
  // Custom dates being typed; applied once they make a valid range
  const [draft, setDraft] = useState({ from: view.from, to: view.to });
  const setView = (next: View) => {
    setViewState(next);
    setDraft({ from: next.from, to: next.to });
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {}
  };
  const pickPreset = (preset: Preset) => {
    if (preset === "custom") return setView({ ...view, preset });
    const today = todayIst();
    setView({ ...view, preset, from: addDays(today, -(Number(preset) - 1)), to: today });
  };
  const draftError = view.preset === "custom" ? rangeError(draft.from, draft.to) : null;
  const editDate = (key: "from" | "to", value: string) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (!rangeError(next.from, next.to)) {
      const v = { ...view, ...next };
      setViewState(v);
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(v));
      } catch {}
    }
  };

  const range = toRange(view.from, view.to);
  const rangeKey = `${view.from}_${view.to}`;
  const desk = useAnalyticsData(live && allowed, `desk-${rangeKey}`, () => fetchDeskAnalytics(range), () => demoDeskAnalytics(range));
  const days = daysBetween(view.from, view.to);

  if (!allowed) {
    return (
      <Box sx={{ mt: 2, py: 6, px: 2, textAlign: "center", border: "1px dashed", borderColor: "divider", borderRadius: "12px" }}>
        <Typography component="h1" sx={{ fontSize: "1rem", fontWeight: 600 }}>
          Analytics is for editors and admins
        </Typography>
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.5 }}>Ask an admin for editor access if you need these numbers.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Box sx={{ flex: "1 1 320px", minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <BarChart3 size={16} aria-hidden />
            <Typography component="h1" sx={{ fontWeight: 600, fontSize: "1.125rem", letterSpacing: "-0.01em" }}>
              Analytics
            </Typography>
            {!live && (
              <Box component="span" sx={{ display: "inline-flex", alignItems: "center", height: 24, px: 1, borderRadius: "999px", border: "1px solid", borderColor: "divider", fontSize: "0.6875rem", fontWeight: 600, color: "text.secondary" }}>
                Demo data
              </Box>
            )}
          </Box>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>
            {longDate(view.from)} to {longDate(view.to)}, {days} {days === 1 ? "day" : "days"} in IST.
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.25, flexWrap: "wrap" }}>
          <SegmentedControl<Preset>
            ariaLabel="Date range"
            value={view.preset}
            onChange={pickPreset}
            options={[
              { value: "7", label: "7 days", ariaLabel: "Last 7 days" },
              { value: "30", label: "30 days", ariaLabel: "Last 30 days" },
              { value: "90", label: "90 days", ariaLabel: "Last 90 days" },
              { value: "custom", label: "Custom" },
            ]}
          />
          {view.preset === "custom" && (
            <Box component="fieldset" sx={{ border: 0, m: 0, p: 0, display: "flex", gap: 1, flexWrap: "wrap", alignItems: "flex-start" }}>
              <Box component="legend" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                Custom dates
              </Box>
              {(["from", "to"] as const).map((k) => (
                <TextField
                  key={k}
                  type="date"
                  size="small"
                  label={k === "from" ? "From" : "To"}
                  value={draft[k]}
                  onChange={(e) => editDate(k, e.target.value)}
                  error={!!draftError}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayIst() } }}
                  sx={{ width: 160, "& .MuiOutlinedInput-root": { borderRadius: "8px", fontSize: "0.8125rem", height: 38 } }}
                />
              ))}
              {draftError && (
                <Typography role="alert" sx={{ flexBasis: "100%", fontSize: "0.75rem", color: "error.main" }}>
                  {draftError} Showing {longDate(view.from)} to {longDate(view.to)}.
                </Typography>
              )}
            </Box>
          )}
        </Box>
      </Box>

      <ResponsiveTabs<Tab>
        value={view.tab}
        onChange={(tab) => setView({ ...view, tab })}
        ariaLabel="Analytics"
        items={[
          { value: "desk", label: "Desk", icon: <ClipboardList size={15} /> },
          { value: "posts", label: "Posts", icon: <Megaphone size={15} /> },
        ]}
        tabsSx={{ minHeight: 40, borderBottom: "1px solid", borderColor: "divider", "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600, fontSize: "0.875rem", gap: 0.75 } }}
      />

      {view.tab === "desk" ? (
        desk.error && !desk.data ? (
          <LoadError error={desk.error} onRetry={() => void desk.refresh()} />
        ) : !desk.data ? (
          <LoadingRows rows={4} height={120} />
        ) : (
          <DeskTab data={desk.data} />
        )
      ) : (
        <PostsTab live={live} range={range} rangeKey={rangeKey} />
      )}
    </Box>
  );
}
