"use client";

// The X Videos desk (screen 1, then the editor): live clips land in the clips folder, the desk writes line 1 from
// what is said or shown in the clip, ticks the tags, and posts on X by hand with Copy & Mark Posted. The list is one
// day folder of the share (today's unless the desk picks another day in the header). Demo data by default
// (src/data/xVideosData.ts), where every action stays in this browser tab; live (NEXT_PUBLIC_XVIDEOS_SOURCE=api) each
// action goes to the backend (useXvActions): the desk shows it at once and the backend's answer settles it.

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { Alert, Box, Button, Checkbox, IconButton, InputBase, ListItemText, Menu, MenuItem, Skeleton, Tooltip, Typography } from "@mui/material";
import { Keyboard, ListFilter, RefreshCw, Search, X as CloseIcon } from "lucide-react";
import { XV_POSTED_EARLIER, xVideoClips, type XvClip } from "../data/xVideosData";
import { XVIDEOS_SOURCE } from "../lib/source";
import { dayLabel, demoFolders, findDay, istDay, latestDay } from "../lib/folders";
import { srOnly } from "../../../components/Newsroom/BreakingDesk/shared";
import { XIcon } from "@/components/leftNavigation/aiContentPlatforms";
import VolumeStrip from "../../../components/Newsroom/BreakingDesk/VolumeStrip";
import { isTextEntryTarget } from "../../../components/Newsroom/BreakingDesk/video/keymap";
import { XV_COLORS } from "./ClipFrame";
import { deskReducer, draftOf, type DeskState } from "./deskState";
import { RejectClipDialog, UndoBar } from "./PostFlow";
import { treeOrder } from "./SourcePanels";
import VideoEditor from "./VideoEditor";
import { VideoPostedList, VideoQueueList, VideoRejectedList, xvRowId } from "./VideoQueue";
import { checkClip } from "./xvTitle";
import { useXvClipDetail, useXvFolders, useXvLive } from "./useXvLive";
import { useXvActions } from "./useXvActions";
import DayPicker from "./DayPicker";

type Tab = "new" | "posted" | "rejected";
type Kind = "all" | "live" | "clip";

const tileSx = { flex: 1, minWidth: 0, backgroundColor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "12px", px: 2, py: 1.5 } as const;
const outlineBtnSx = { minHeight: 34, borderRadius: "8px", textTransform: "none", fontWeight: 600, fontSize: "0.8125rem", whiteSpace: "nowrap", borderColor: "divider", color: "text.primary", backgroundColor: "background.paper", gap: 0.75 } as const;

const subscribeNothing = () => () => undefined;
/** False on the server and in the first client render: the demo's times are relative to the browser's clock */
const useMounted = () => useSyncExternalStore(subscribeNothing, () => true, () => false);

const needsCheck = (c: XvClip, trim?: { start: number; end: number }) => c.readingProgress !== undefined || checkClip(c, trim).length > 0;

export default function XVideosDesk() {
  const mounted = useMounted();
  if (!mounted) {
    return (
      <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 1.5 }} role="status" aria-label="Loading the clips">
        <Skeleton variant="rounded" height={30} />
        <Skeleton variant="rounded" height={48} />
        <Skeleton variant="rounded" height={76} />
        <Skeleton variant="rounded" height={420} />
      </Box>
    );
  }
  return <Desk />;
}

function Desk() {
  const [state, dispatch] = useReducer(
    deskReducer,
    undefined,
    (): DeskState => (XVIDEOS_SOURCE === "demo" ? { clips: xVideoClips(Date.now()), day: istDay(), parked: {}, drafts: {}, undo: [] } : { clips: [], day: null, parked: {}, drafts: {}, undo: [] }),
  );
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState<{ id: string; nav: string[] } | null>(null);
  // The day folder the desk picked; null follows today's, also when the date rolls over with the desk open
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  // Demo: the sample clips. Live (NEXT_PUBLIC_XVIDEOS_SOURCE=api): one day folder of the video share, asked every
  // 15 s. While a clip is open the shown day is held, so a midnight rollover never pulls the clip from under the editor
  // (only the requests use it: opening a clip does not restart the poll or stop a Refresh check)
  const live = useXvLive(dispatch, pickedDay, open ? state.day : null);
  const demoDays = useMemo(() => (live.mode === "demo" ? demoFolders(state.clips, state.day ?? undefined) : null), [live.mode, state.clips, state.day]);
  const days = useXvFolders(demoDays);
  const updatedAt = live.updatedAt;
  const [tab, setTab] = useState<Tab>("new");
  const [kind, setKind] = useState<Kind>("all");
  const [query, setQuery] = useState("");
  const [onlyChecks, setOnlyChecks] = useState(false);
  const [filtersAt, setFiltersAt] = useState<HTMLElement | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Live: the open clip's transcript, also after Prev / Next or a reject that moves on
  useXvClipDetail(dispatch, open?.id ?? null);
  // Live: every action to the backend (drafts saved a moment after the last change); a refusal is shown here
  const actions = useXvActions(live.mode === "api", dispatch, state, live.reload);
  const [rejecting, setRejecting] = useState<XvClip | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const lastOpened = useRef<string | null>(null);

  const todayFolder = days.folders?.today;
  // Just after midnight the folders can still say yesterday: the IST date, or a list that rolled on, is newer
  const today = latestDay(todayFolder, istDay(now), state.day) ?? istDay(now);

  // The folders are behind (a list from a day they don't know, or today moved on): ask again, once per case. A
  // request already in flight is followed by one more, so the answer is never the one from before midnight
  const askedFoldersFor = useRef<string | null>(null);
  const refreshDays = days.refresh;
  useEffect(() => {
    if (!days.folders || !state.day) return;
    if (findDay(days.folders, state.day) && days.folders.today >= today) return;
    const key = `${state.day}|${today}`;
    if (askedFoldersFor.current === key) return;
    askedFoldersFor.current = key;
    refreshDays();
  }, [days.folders, state.day, today, refreshDays]);

  const shownDay = state.day;
  const pickDay = useCallback(
    (day: string) => {
      // Compared with the real IST date too, so a stale folders "today" never turns a picked day into "follow today"
      setPickedDay(day === latestDay(todayFolder, istDay(), shownDay) ? null : day);
      dispatch({ type: "day/switch", day });
      setFocusedId(null);
      lastOpened.current = null;
    },
    [todayFolder, shownDay],
  );

  // The ages ("9 min ago") move on every 30 s
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const { clips, drafts, undo } = state;
  const byId = useMemo(() => new Map(clips.map((c) => [c.id, c])), [clips]);
  const trims = useMemo(() => Object.fromEntries(Object.entries(drafts).map(([id, d]) => [id, d.trim])), [drafts]);
  const savedTitles = useMemo(() => Object.fromEntries(Object.entries(drafts).filter(([, d]) => d.savedAt).map(([id, d]) => [id, d.title])), [drafts]);
  const scheduled = useMemo(() => Object.fromEntries(Object.entries(drafts).map(([id, d]) => [id, d.scheduledAt])), [drafts]);

  const newClips = useMemo(() => clips.filter((c) => c.status === "new").toSorted((a, b) => b.receivedAt.localeCompare(a.receivedAt)), [clips]);
  const postedClips = useMemo(() => clips.filter((c) => c.status === "posted").toSorted((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? "")), [clips]);
  const rejectedClips = useMemo(() => clips.filter((c) => c.status === "rejected"), [clips]);

  const q = query.trim().toLowerCase();
  const matches = useCallback(
    (c: XvClip) => !q || [c.fileName, c.district, c.innerFolder ?? "", c.topic ?? "", c.headline ?? "", c.suggestedHeadline ?? "", drafts[c.id]?.title ?? ""].some((s) => s.toLowerCase().includes(q)),
    [q, drafts],
  );
  const searched = useMemo(() => newClips.filter((c) => matches(c) && (!onlyChecks || needsCheck(c, trims[c.id]))), [newClips, matches, onlyChecks, trims]);
  const visibleNew = useMemo(() => (kind === "all" ? searched : searched.filter((c) => c.kind === kind)), [searched, kind]);
  const visiblePosted = useMemo(() => postedClips.filter(matches), [postedClips, matches]);
  const visibleRejected = useMemo(() => rejectedClips.filter(matches), [rejectedClips, matches]);

  const focused = focusedId && visibleNew.some((c) => c.id === focusedId) ? focusedId : (visibleNew[0]?.id ?? null);
  // Today's folder, or another day the desk picked (the stats then count that day; X's daily volume stays today's)
  const viewingToday = live.mode === "demo" || !state.day || state.day === today;
  // The list for the shown day is still on its way (first load, or another day just picked)
  const listLoading = live.mode === "api" && (!live.loaded || (!!state.day && live.loadedDay !== state.day));
  // Nothing to show yet: a skeleton while it loads, the error with Retry when the request failed
  const listFailed = listLoading && !clips.length && !!live.error;
  const showSkeleton = listLoading && !clips.length && !listFailed;
  const hideLists = showSkeleton || listFailed;
  // The demo counts the morning's posts it has no clips for; live, every posted clip is in the list
  const postedShown = (live.mode === "demo" ? XV_POSTED_EARLIER : 0) + postedClips.length;
  const postedToday = viewingToday ? postedShown : (findDay(days.folders, today)?.done ?? 0);
  const shownDayText = state.day && !viewingToday ? dayLabel(state.day) : "today";
  const shownFolder = findDay(days.folders, state.day);
  const emptyDayHint = shownFolder && !shownFolder.clips ? "No videos in this day's folder." : "Every video of this day's folder is posted or rejected.";
  const stats = [
    { label: "To post", value: newClips.length, tone: "text.secondary" },
    { label: "Needs check", value: newClips.filter((c) => needsCheck(c, trims[c.id])).length, tone: XV_COLORS.orange },
    { label: viewingToday ? "Posted today" : `Posted on ${shownDayText}`, value: postedShown, tone: "success.main" },
  ];

  const openClip = useCallback(
    (clip: XvClip) => {
      lastOpened.current = clip.id;
      // Prev/Next follow the list as it is now; a clip posted on the way stays reachable
      const nav = visibleNew.map((c) => c.id);
      setOpen({ id: clip.id, nav: nav.includes(clip.id) ? nav : [clip.id, ...nav] });
    },
    [visibleNew],
  );

  const closeEditor = useCallback(() => {
    setOpen(null);
    const id = lastOpened.current;
    if (id) {
      setFocusedId(id);
      requestAnimationFrame(() => document.getElementById(xvRowId(id))?.focus());
    }
  }, []);

  // The list's keys: J / ↓ next row, K / ↑ previous, Enter opens, R rejects; not while typing or with the editor up
  useEffect(() => {
    if (open || tab !== "new") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || rejecting || filtersAt || keysOpen) return;
      if (isTextEntryTarget(e.target)) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el?.closest(".MuiDialog-root, .MuiPopover-root")) return;
      // Arrow keys keep scrolling the page unless focus is already on a row
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !el?.closest('[id^="xv-row-"]')) return;
      const i = visibleNew.findIndex((c) => c.id === focused);
      const k = e.key.toLowerCase();
      let next = -1;
      if (k === "j" || e.key === "ArrowDown") next = Math.min(visibleNew.length - 1, i + 1);
      else if (k === "k" || e.key === "ArrowUp") next = Math.max(0, i - 1);
      else if (e.key === "Enter" && i >= 0 && !el?.closest?.("button, a")) {
        e.preventDefault();
        openClip(visibleNew[i]);
        return;
      } else if (k === "r" && i >= 0) {
        e.preventDefault();
        setRejecting(visibleNew[i]);
        return;
      } else return;
      e.preventDefault();
      if (next >= 0 && visibleNew[next]) {
        setFocusedId(visibleNew[next].id);
        document.getElementById(xvRowId(visibleNew[next].id))?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, tab, visibleNew, focused, openClip, rejecting, filtersAt, keysOpen]);

  const editorClip = open ? byId.get(open.id) : undefined;
  // Prev/Next skip clips that left New (posted or rejected), except the one open
  // In the Clips tree's order, so J / K go down the list the editor sees
  const navClips = useMemo(() => (open ? treeOrder(open.nav.map((id) => byId.get(id)).filter((c): c is XvClip => !!c && (c.status === "new" || c.id === open.id))) : []), [open, byId]);
  const navIndex = editorClip ? navClips.findIndex((c) => c.id === editorClip.id) : -1;

  const sendUndo = actions.undo;
  const onUndo = useCallback(
    (id: string) => {
      // Shown only when it went to the backend (not while the post's own answer is still on its way)
      if (sendUndo(id)) dispatch({ type: "clip/undo", id });
    },
    [sendUndo],
  );
  const onUndoExpire = useCallback((n: number) => dispatch({ type: "undo/expire", now: n }), []);
  const undoUntil = useMemo(() => Object.fromEntries(undo.map((u) => [u.clipId, u.until])), [undo]);

  const counts = { all: searched.length, live: searched.filter((c) => c.kind === "live").length, clip: searched.filter((c) => c.kind === "clip").length };
  const narrowed = !!q || onlyChecks || kind !== "all";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
      <VolumeStrip name="X" used={postedToday} cap={10000} />
      {actions.error && (
        <Alert key={actions.error.n} severity="warning" onClose={actions.clearError} closeText="Dismiss this warning" sx={{ borderRadius: "10px" }}>
          {actions.error.text}
        </Alert>
      )}

      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <XIcon size={16} color="currentColor" />
            <Typography component="h1" sx={{ fontWeight: 600, fontSize: "1.125rem", letterSpacing: "-0.01em" }}>
              Clip Draft
            </Typography>
          </Box>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>This dashboard is linked with the live clips folder. Click on Open, pick the title from the clip and click on &quot;Copy &amp; Mark Posted&quot;.</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap" }}>
          <DayPicker folders={days.folders} today={today} day={state.day} loading={listLoading && !listFailed} error={days.error} onPick={pickDay} onOpen={days.refresh} />
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, fontSize: "0.75rem", color: "text.secondary" }}>
            <Box component="span" aria-hidden sx={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: live.error ? "error.main" : live.loaded ? "success.main" : "text.disabled" }} />
            {live.error ? <span role="alert">{live.error}</span> : live.loaded ? "Clips folder ok" : "Loading the clips…"}
          </Box>
          <Tooltip title="Shortcuts">
            <IconButton size="small" onClick={() => setKeysOpen(true)} aria-label="Shortcuts" sx={{ color: "text.secondary" }}>
              <Keyboard size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip title={live.mode === "demo" ? "Check the clips folder now (demo: the list does not change)" : live.checking ? "Checking the share for new files" : "Check the share for new files now"}>
            <Box
              component="button"
              type="button"
              aria-disabled={live.checking || undefined}
              aria-busy={live.checking || undefined}
              onClick={() => {
                if (live.checking) return;
                live.refresh();
                days.refresh();
                setNow(Date.now());
              }}
              sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, border: 0, background: "none", p: 0.5, minHeight: 32, cursor: live.checking ? "progress" : "pointer", color: "text.secondary", fontSize: "0.6875rem", fontFamily: "inherit", "&:hover": { color: "text.primary" }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", borderRadius: "4px" } }}
            >
              <Box component="span" aria-hidden sx={{ display: "inline-flex", ...(live.checking && { animation: "xvSpin 1s linear infinite", "@keyframes xvSpin": { to: { transform: "rotate(360deg)" } }, "@media (prefers-reduced-motion: reduce)": { animation: "none" } }) }}>
                <RefreshCw size={12} />
              </Box>
              {live.checking ? "Checking the share…" : `Updated ${new Date(updatedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })}`}
            </Box>
          </Tooltip>
        </Box>
      </Box>

      {/* Today */}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1.5 }}>
        {stats.map((s) => (
          <Box key={s.label} sx={tileSx}>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{s.label}</Typography>
            <Typography sx={{ fontSize: "1.375rem", fontWeight: 700, color: s.tone, fontVariantNumeric: "tabular-nums", lineHeight: 1.3 }}>{s.value}</Typography>
          </Box>
        ))}
      </Box>

      {/* Tabs + filters */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap", borderBottom: "1px solid", borderColor: "divider" }}>
        <Box role="tablist" aria-label="Clip Draft sections" sx={{ display: "flex", gap: 0.5 }}>
          {(
            [
              ["new", `New (${newClips.length})`],
              ["posted", `Posted (${postedClips.length})`],
              ["rejected", "Rejected"],
            ] as const
          ).map(([id, label]) => (
            <Box
              key={id}
              component="button"
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              sx={{ px: 1.5, minHeight: 40, border: 0, borderBottom: "2px solid", borderColor: tab === id ? "text.primary" : "transparent", mb: "-1px", background: "none", font: "inherit", fontSize: "0.875rem", fontWeight: 600, color: tab === id ? "text.primary" : "text.secondary", cursor: "pointer", whiteSpace: "nowrap", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 } }}
            >
              {label}
            </Box>
          ))}
        </Box>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", pb: 1, width: { xs: "100%", md: "auto" } }}>
          {tab === "new" && (
            <Box role="group" aria-label="Kind of clip" sx={{ display: "inline-flex", gap: "2px", p: "3px", border: "1px solid", borderColor: "divider", borderRadius: "8px", backgroundColor: "background.paper" }}>
              {(
                [
                  ["all", `All ${counts.all}`, null],
                  ["live", `Live ${counts.live}`, XV_COLORS.live],
                  ["clip", `Clips ${counts.clip}`, XV_COLORS.clip],
                ] as const
              ).map(([id, label, dot]) => (
                <Box
                  key={id}
                  component="button"
                  type="button"
                  aria-pressed={kind === id}
                  onClick={() => setKind(id)}
                  sx={{ display: "inline-flex", alignItems: "center", gap: 0.625, px: 1.125, py: 0.5, border: 0, borderRadius: "6px", font: "inherit", fontSize: "0.78rem", fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", backgroundColor: kind === id ? "#ECEEF0" : "transparent", color: kind === id ? "text.primary" : "text.secondary", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" } }}
                >
                  {dot && <Box component="span" aria-hidden sx={{ width: 12, height: 6, borderRadius: "3px", backgroundColor: dot }} />}
                  {label}
                </Box>
              ))}
            </Box>
          )}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, height: 34, px: 1.25, flex: { xs: 1, md: "0 0 220px" }, minWidth: 160, border: "1px solid", borderColor: "divider", borderRadius: "8px", backgroundColor: "background.paper", "&:focus-within": { borderColor: "text.primary" } }}>
            <Search size={14} aria-hidden />
            <InputBase value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" inputProps={{ "aria-label": "Search clips" }} sx={{ flex: 1, fontSize: "0.8125rem" }} />
            {query && (
              <IconButton size="small" onClick={() => setQuery("")} aria-label="Clear the search" sx={{ p: 0.25 }}>
                <CloseIcon size={13} />
              </IconButton>
            )}
          </Box>
          <Button variant="outlined" onClick={(e) => setFiltersAt(e.currentTarget)} aria-haspopup="menu" sx={outlineBtnSx}>
            <ListFilter size={14} aria-hidden /> Filters{onlyChecks ? " (1)" : ""}
          </Button>
          <Menu anchorEl={filtersAt} open={!!filtersAt} onClose={() => setFiltersAt(null)}>
            <MenuItem onClick={() => setOnlyChecks((v) => !v)} role="menuitemcheckbox" aria-checked={onlyChecks}>
              <Checkbox size="small" checked={onlyChecks} tabIndex={-1} sx={{ p: 0.5, mr: 1 }} />
              <ListItemText primary="Needs check only" secondary="Over X's limit or still being read" />
            </MenuItem>
          </Menu>
        </Box>
      </Box>

      {/* Lists */}
      {listFailed && (
        <EmptyState
          title={`The clips of ${shownDayText} did not load.`}
          hint={live.error ?? ""}
          action={
            <Button variant="outlined" onClick={() => live.refresh()} disabled={live.checking} sx={outlineBtnSx}>
              {live.checking ? "Checking the share…" : "Retry"}
            </Button>
          }
        />
      )}
      {showSkeleton && (
        <Box role="status" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Box component="span" sx={srOnly}>
            Loading the videos of {shownDayText}
          </Box>
          <Skeleton variant="rounded" height={84} />
          <Skeleton variant="rounded" height={84} />
          <Skeleton variant="rounded" height={84} />
        </Box>
      )}
      {!hideLists &&
        tab === "new" &&
        (visibleNew.length ? (
          <VideoQueueList clips={visibleNew} focusedId={focused} now={now} savedTitles={savedTitles} scheduled={scheduled} trims={trims} onFocus={setFocusedId} onOpen={openClip} onReject={setRejecting} />
        ) : (
          <EmptyState
            title={narrowed ? "No clip matches." : viewingToday ? "No new clips." : `No new clips on ${shownDayText}.`}
            hint={
              narrowed
                ? "Clear the search or the filters to see the rest."
                : viewingToday
                  ? "New clips show here a few seconds after they land in today's folder."
                  : emptyDayHint
            }
            action={
              narrowed ? (
                <Button
                  variant="outlined"
                  onClick={() => {
                    setQuery("");
                    setKind("all");
                    setOnlyChecks(false);
                  }}
                  sx={outlineBtnSx}
                >
                  Clear search and filters
                </Button>
              ) : null
            }
          />
        ))}
      {!hideLists &&
        tab === "posted" &&
        (visiblePosted.length ? (
          <VideoPostedList
            clips={visiblePosted}
            now={now}
            undoUntil={undoUntil}
            copiedId={copiedId}
            onCopy={async (c) => {
              try {
                await navigator.clipboard.writeText(c.postedText ?? "");
                setCopiedId(c.id);
                setTimeout(() => setCopiedId((x) => (x === c.id ? null : x)), 1600);
              } catch {
                window.alert("The browser blocked the clipboard. Open the clip and copy the text by hand.");
              }
            }}
            onUndo={(c) => onUndo(c.id)}
          />
        ) : (
          <EmptyState title={q ? "No posted clip matches." : viewingToday ? "Nothing posted yet today." : `Nothing posted on ${shownDayText}.`} hint="Clips land here when someone presses Copy & Mark Posted." />
        ))}
      {!hideLists &&
        tab === "rejected" &&
        (visibleRejected.length ? (
          <VideoRejectedList
            clips={visibleRejected}
            now={now}
            onRestore={(c) => {
              dispatch({ type: "clip/restore", id: c.id });
              actions.restore(c.id);
            }}
          />
        ) : (
          <EmptyState title="No rejected clips." hint="A clip you reject moves here, with the reason. Restore puts it back in New." />
        ))}

      <RejectClipDialog
        clip={rejecting}
        onClose={() => setRejecting(null)}
        onReject={(reason) => {
          if (rejecting) {
            dispatch({ type: "clip/reject", id: rejecting.id, reason });
            actions.reject(rejecting.id, reason);
          }
          setRejecting(null);
        }}
      />
      <ShortcutsDialog open={keysOpen} onClose={() => setKeysOpen(false)} />

      {editorClip && (
        <VideoEditor
          clip={editorClip}
          draft={draftOf(state, editorClip)}
          navClips={navClips}
          prevId={navIndex > 0 ? navClips[navIndex - 1].id : null}
          nextId={navIndex >= 0 && navIndex < navClips.length - 1 ? navClips[navIndex + 1].id : null}
          postedToday={postedToday}
          undo={undo}
          onPatch={(patch) => dispatch({ type: "draft/patch", id: editorClip.id, patch })}
          onGo={(id) => {
            lastOpened.current = id;
            setOpen((o) => (o ? { ...o, id } : o));
          }}
          onClose={closeEditor}
          onPost={(text) => {
            dispatch({ type: "clip/post", id: editorClip.id, text, at: Date.now() });
            actions.post(editorClip.id, text, draftOf(state, editorClip));
          }}
          onReject={(reason) => {
            const next = navIndex >= 0 ? (navClips[navIndex + 1] ?? navClips[navIndex - 1]) : undefined;
            dispatch({ type: "clip/reject", id: editorClip.id, reason });
            actions.reject(editorClip.id, reason);
            if (next && next.id !== editorClip.id) setOpen((o) => (o ? { ...o, id: next.id } : o));
            else closeEditor();
          }}
          onUndo={onUndo}
          onUndoExpire={onUndoExpire}
        />
      )}
      {!editorClip && <UndoBar entries={undo} onUndo={onUndo} onExpire={onUndoExpire} />}
    </Box>
  );
}

function EmptyState({ title, hint, action }: { title: string; hint: string; action?: React.ReactNode }) {
  return (
    <Box role="status" sx={{ display: "grid", placeItems: "center", textAlign: "center", py: 8, px: 2, border: "1px dashed", borderColor: "divider", borderRadius: "12px", backgroundColor: "background.paper" }}>
      <Box sx={{ maxWidth: 380, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
        <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{hint}</Typography>
        {action}
      </Box>
    </Box>
  );
}

const KEYS: [string, string][] = [
  ["J / ↓", "Next clip (list and editor)"],
  ["K / ↑", "Previous clip"],
  ["Enter", "Open the selected clip"],
  ["R", "Reject the selected clip"],
  ["Space / L", "Play or pause (editor)"],
  ["U", "Put the line playing on line 1 of the tweet"],
  ["Esc", "Back to the desk"],
];

function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={{ top: 120, left: typeof window !== "undefined" ? window.innerWidth / 2 : 400 }}
      transformOrigin={{ vertical: "top", horizontal: "center" }}
      slotProps={{ paper: { sx: { borderRadius: "14px", p: 1, minWidth: 300 } }, list: { "aria-label": "Shortcuts" } }}
    >
      <Typography sx={{ px: 1.5, pt: 0.5, pb: 1, fontWeight: 700 }}>Shortcuts</Typography>
      {KEYS.map(([k, label]) => (
        <MenuItem key={k} onClick={onClose} sx={{ gap: 2, fontSize: "0.8125rem" }}>
          <Box component="kbd" sx={{ minWidth: 72, fontFamily: "var(--font-mono), monospace", fontSize: "0.75rem", fontWeight: 700 }}>
            {k}
          </Box>
          {label}
        </MenuItem>
      ))}
      <Typography sx={{ px: 1.5, pt: 1, fontSize: "0.6875rem", color: "text.secondary" }}>Keys do nothing while you type in a box.</Typography>
    </Menu>
  );
}
