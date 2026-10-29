"use client";

// More filters for the draft console's queue: priority, category, district, media, received time, status
// and sort. Everything runs in the browser on the stories already loaded; the last choice is remembered here.

import React from "react";
import { Box, TextField } from "@mui/material";
import { FilterChips, type FilterChip, FilterEmpty, FilterOption, FiltersButton, FilterSection, toggleValue } from "../ui/FilterKit";
import { BreakingTag, FtpNewsItem } from "@/types/newsroom";
import { SegmentedControl, storyCategory, storyTag, TAG_TINT } from "./shared";

export type PriorityValue = BreakingTag | "normal";
export type MediaValue = "photos" | "video" | "none";
export type StatusValue = "new" | "mine" | "held";
export type ReceivedValue = "any" | "1h" | "6h" | "today" | "custom";

export interface QueueFilterState {
  priority: PriorityValue[];
  categories: string[];
  districts: string[];
  media: MediaValue[];
  received: ReceivedValue;
  /** Custom range, "YYYY-MM-DDTHH:mm" in IST */
  from: string;
  to: string;
  status: StatusValue[];
  sort: "newest" | "oldest";
}

export const EMPTY_FILTERS: QueueFilterState = { priority: [], categories: [], districts: [], media: [], received: "any", from: "", to: "", status: [], sort: "newest" };

const PRIORITY_LABEL: Record<PriorityValue, string> = { big_breaking: TAG_TINT.big_breaking.label, breaking: TAG_TINT.breaking.label, normal: "Normal" };
const MEDIA_LABEL: Record<MediaValue, string> = { photos: "Has photos", video: "Has video", none: "No media" };
const RECEIVED_LABEL: Record<ReceivedValue, string> = { any: "Any time", "1h": "Last hour", "6h": "Last 6 hours", today: "Today", custom: "Custom" };

// ─── Remembered in this browser ──────────────────────────────────────────────
/** The console queue's key; other lists pass their own */
export const QUEUE_FILTERS_KEY = "socia_queue_filters_v1";

const strings = (v: unknown, allowed?: readonly string[]) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && (!allowed || allowed.includes(x))) : []);

export function readQueueFilters(key: string = QUEUE_FILTERS_KEY): QueueFilterState {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<Record<keyof QueueFilterState, unknown>> | null;
    if (!raw || typeof raw !== "object") return EMPTY_FILTERS;
    return {
      priority: strings(raw.priority, ["big_breaking", "breaking", "normal"]) as PriorityValue[],
      categories: strings(raw.categories),
      districts: strings(raw.districts),
      media: strings(raw.media, ["photos", "video", "none"]) as MediaValue[],
      received: (["any", "1h", "6h", "today", "custom"] as const).find((r) => r === raw.received) ?? "any",
      from: typeof raw.from === "string" ? raw.from : "",
      to: typeof raw.to === "string" ? raw.to : "",
      status: strings(raw.status, ["new", "mine", "held"]) as StatusValue[],
      sort: raw.sort === "oldest" ? "oldest" : "newest",
    };
  } catch {
    return EMPTY_FILTERS;
  }
}

export function saveQueueFilters(f: QueueFilterState, key: string = QUEUE_FILTERS_KEY) {
  try {
    localStorage.setItem(key, JSON.stringify(f));
  } catch {}
}

// ─── Matching ────────────────────────────────────────────────────────────────
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
/** Midnight today in India, as a timestamp */
const istMidnight = (now: number) => {
  const ist = new Date(now + IST_OFFSET_MS);
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS;
};
/** "YYYY-MM-DDTHH:mm" read as IST */
const istInput = (v: string) => (v ? new Date(`${v}:00+05:30`).getTime() : NaN);

export interface FilterFacts {
  media: (item: FtpNewsItem) => { images: number; videos: number };
  status: (item: FtpNewsItem) => StatusValue;
}

/** Everything but priority, so the priority switch can count what each choice would show. */
export function matchesOtherFilters(item: FtpNewsItem, f: QueueFilterState, facts: FilterFacts, now: number): boolean {
  if (f.categories.length && !f.categories.includes(storyCategory(item) ?? "")) return false;
  if (f.districts.length && !f.districts.includes(item.area)) return false;
  if (f.media.length) {
    const { images, videos } = facts.media(item);
    const ok = f.media.some((m) => (m === "photos" ? images > 0 : m === "video" ? videos > 0 : images + videos === 0));
    if (!ok) return false;
  }
  if (f.status.length && !f.status.includes(facts.status(item))) return false;
  if (f.received !== "any") {
    const t = new Date(item.receivedAt).getTime();
    if (f.received === "1h" && t < now - 3600_000) return false;
    if (f.received === "6h" && t < now - 6 * 3600_000) return false;
    if (f.received === "today" && t < istMidnight(now)) return false;
    if (f.received === "custom") {
      const from = istInput(f.from);
      const to = istInput(f.to);
      if (!Number.isNaN(from) && t < from) return false;
      if (!Number.isNaN(to) && t > to) return false;
    }
  }
  return true;
}

export const matchesPriority = (item: FtpNewsItem, priority: PriorityValue[]) => !priority.length || priority.includes(storyTag(item) ?? "normal");

export function sortStories(items: FtpNewsItem[], sort: QueueFilterState["sort"]) {
  const dir = sort === "oldest" ? 1 : -1;
  return [...items].sort((a, b) => dir * (new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()));
}

/** How many filters are set (sort is a view choice, not a filter). */
export function activeFilterCount(f: QueueFilterState) {
  return f.priority.length + f.categories.length + f.districts.length + f.media.length + f.status.length + (f.received !== "any" ? 1 : 0);
}

const STATUS_LABEL = (live: boolean): Record<StatusValue, string> => ({ new: "New", mine: live ? "With you" : "Draft saved", held: "Held by someone" });

/** Removable chips for the active filters, with Clear all. Renders nothing when no filter is set. */
export function ActiveFilterChips({ filters, onChange, live }: { filters: QueueFilterState; onChange: (f: QueueFilterState) => void; live: boolean }) {
  const chip = (key: string, label: string, next: QueueFilterState): FilterChip => ({ key, label, onRemove: () => onChange(next) });
  const chips: FilterChip[] = [
    ...filters.priority.map((p) => chip(`p-${p}`, PRIORITY_LABEL[p], { ...filters, priority: filters.priority.filter((x) => x !== p) })),
    ...filters.categories.map((c) => chip(`c-${c}`, c, { ...filters, categories: filters.categories.filter((x) => x !== c) })),
    ...filters.districts.map((d) => chip(`d-${d}`, d || "No district", { ...filters, districts: filters.districts.filter((x) => x !== d) })),
    ...filters.media.map((m) => chip(`m-${m}`, MEDIA_LABEL[m], { ...filters, media: filters.media.filter((x) => x !== m) })),
    ...filters.status.map((s) => chip(`s-${s}`, STATUS_LABEL(live)[s], { ...filters, status: filters.status.filter((x) => x !== s) })),
    ...(filters.received !== "any" ? [chip("r", filters.received === "custom" ? customLabel(filters) : RECEIVED_LABEL[filters.received], { ...filters, received: "any", from: "", to: "" })] : []),
  ];
  return <FilterChips chips={chips} onClearAll={() => onChange({ ...EMPTY_FILTERS, sort: filters.sort })} />;
}

const shortStamp = (v: string) => (v ? v.replace("T", " ").slice(5) : "");
const customLabel = (f: QueueFilterState) => (f.from && f.to ? `${shortStamp(f.from)} to ${shortStamp(f.to)}` : f.from ? `From ${shortStamp(f.from)}` : f.to ? `Until ${shortStamp(f.to)}` : "Custom range");

// ─── Button and panel ────────────────────────────────────────────────────────
interface FiltersButtonProps {
  filters: QueueFilterState;
  onChange: (f: QueueFilterState) => void;
  /** Values present in the loaded queue */
  categories: string[];
  districts: string[];
  live: boolean;
  /** False where a claim status means nothing (rejected stories) */
  showStatus?: boolean;
}

export function QueueFiltersButton({ filters: f, onChange, categories, districts, live, showStatus = true }: FiltersButtonProps) {
  const set = (patch: Partial<QueueFilterState>) => onChange({ ...f, ...patch });
  const statusLabel = STATUS_LABEL(live);
  return (
    <FiltersButton activeCount={activeFilterCount(f)} onClearAll={() => onChange({ ...EMPTY_FILTERS, sort: f.sort })}>
      <FilterSection title="Sort">
        <SegmentedControl
          ariaLabel="Sort"
          value={f.sort}
          onChange={(sort) => set({ sort })}
          options={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
          ]}
        />
      </FilterSection>
      <FilterSection title="Priority">
        {(["big_breaking", "breaking", "normal"] as const).map((p) => (
          <FilterOption key={p} on={f.priority.includes(p)} onClick={() => set({ priority: toggleValue(f.priority, p) })}>
            {PRIORITY_LABEL[p]}
          </FilterOption>
        ))}
      </FilterSection>
      <FilterSection title="Category">
        {categories.length ? (
          categories.map((c) => (
            <FilterOption key={c} on={f.categories.includes(c)} onClick={() => set({ categories: toggleValue(f.categories, c) })}>
              {c}
            </FilterOption>
          ))
        ) : (
          <FilterEmpty>No story here has a category.</FilterEmpty>
        )}
      </FilterSection>
      <FilterSection title="District">
        {districts.length ? (
          districts.map((d) => (
            <FilterOption key={d} on={f.districts.includes(d)} onClick={() => set({ districts: toggleValue(f.districts, d) })}>
              {d}
            </FilterOption>
          ))
        ) : (
          <FilterEmpty>No story here has a district.</FilterEmpty>
        )}
      </FilterSection>
      <FilterSection title="Media">
        {(["photos", "video", "none"] as const).map((m) => (
          <FilterOption key={m} on={f.media.includes(m)} onClick={() => set({ media: toggleValue(f.media, m) })}>
            {MEDIA_LABEL[m]}
          </FilterOption>
        ))}
      </FilterSection>
      <FilterSection title="Received (IST)">
        {(["any", "1h", "6h", "today", "custom"] as const).map((r) => (
          <FilterOption key={r} on={f.received === r} onClick={() => set({ received: r })}>
            {RECEIVED_LABEL[r]}
          </FilterOption>
        ))}
        {f.received === "custom" && (
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, width: "100%", mt: 0.5 }}>
            <TextField type="datetime-local" size="small" label="From" value={f.from} onChange={(e) => set({ from: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField type="datetime-local" size="small" label="To" value={f.to} onChange={(e) => set({ to: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          </Box>
        )}
      </FilterSection>
      {showStatus && (
        <FilterSection title="Status">
          {(["new", "mine", "held"] as const).map((s) => (
            <FilterOption key={s} on={f.status.includes(s)} onClick={() => set({ status: toggleValue(f.status, s) })}>
              {statusLabel[s]}
            </FilterOption>
          ))}
        </FilterSection>
      )}
    </FiltersButton>
  );
}
