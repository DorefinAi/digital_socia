"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Modal, Box, Typography, InputBase, LinearProgress, IconButton } from "@mui/material";
import { Search, Archive, BarChart3, Sparkles, Globe, UserRound, ShieldCheck, Newspaper, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { usePermissions } from "@/lib/access/usePermissions";
import { useThemeMode } from "@/providers/MuiProvider";
import type { StorySearchItem } from "@/lib/socia/types";
import { SEARCH_PAGES, searchPages, type PageId, type SearchPage } from "./pageSearch";
import { STORY_SEARCH_MIN, useStorySearch } from "./useStorySearch";
import { matchNote, storyAge, storyBlocked, storyStatus, type Blocked, type StatusTone } from "./storySearchFormat";

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

type Filter = "all" | "stories" | "pages";

const FILTERS: { key: Filter; label: string; announce: string }[] = [
  { key: "all", label: "All", announce: "Showing stories and pages" },
  { key: "stories", label: "Stories", announce: "Showing stories only" },
  { key: "pages", label: "Pages", announce: "Showing pages only" },
];

const PAGE_ICONS: Record<PageId, React.ReactNode> = {
  rejected: <Archive size={18} />,
  dashboard: <BarChart3 size={18} />,
  "post-studio": <Sparkles size={18} />,
  "web-scraper": <Globe size={18} />,
  profile: <UserRound size={18} />,
  access: <ShieldCheck size={18} />,
};

/** Queries an editor might try first: Hindi, Roman Hindi, and English */
const EXAMPLES = ["जयपुर", "jaipur", "hadsa", "accident"];

/** Hindi headlines read best in Noto Sans Devanagari; Roboto then covers any Latin in them */
const HINDI_FONT = "var(--font-devanagari), var(--font-roboto), \"Nirmala UI\", sans-serif";

/** Stories shown under "All", where pages share the list; "Stories" shows every one the server sent */
const STORIES_IN_ALL = 8;

/** "hi" when the text has any Devanagari, so screen readers switch voice for it */
const langOf = (text: string) => (/[ऀ-ॿ]/.test(text) ? "hi" : "en");

/** Status colours that keep 4.5:1 on the selected and hovered row too (the theme's main shades don't) */
const TONE_COLOURS: Record<"light" | "dark", Record<StatusTone, string>> = {
  light: { done: "#1b5e20", problem: "#b71c1c", neutral: "text.secondary" },
  dark: { done: "#a5d6a7", problem: "#ff8a80", neutral: "text.secondary" },
};


type Option =
  | { key: string; kind: "page"; page: SearchPage }
  | { key: string; kind: "story"; story: StorySearchItem; href: string | null; blocked: Blocked | null };

const storyHref = (slug: string) => `/ai-content/x?story=${encodeURIComponent(slug)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const noteSx = { px: 1.5, py: 0.5, fontSize: "0.8125rem", color: "text.secondary" } as const;
const groupLabelSx = { px: 1.5, pt: 1.25, pb: 0.5, fontSize: "0.75rem", fontWeight: 600, color: "text.secondary" } as const;

const SearchModal: React.FC<SearchModalProps> = ({ open, onClose }) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  /**
   * A one-off message for the live region (filter changed, a row that can't open, still searching); a keystroke
   * clears it. "Still searching…" belongs to the answer on screen when it was said (`answer`), so the next
   * answer's count replaces it.
   */
  const [noticeState, setNoticeState] = useState<{ text: string; answer: number | null } | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { can, canAny } = usePermissions();
  const { mode } = useThemeMode();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const optionId = (key: string) => `${listId}-${key}`;

  // Every opening starts fresh, whichever way the last one closed (Esc, a click outside, or Ctrl+K in the header).
  // Adjusted while rendering rather than in an effect, so the old query never shows for a frame.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSearch("");
      setActiveKey(null);
      setNoticeState(null);
    }
  }

  const showStories = filter !== "pages";
  const showPages = filter !== "stories";
  const stories = useStorySearch(search, open && showStories);
  const setNotice = (text: string | null, untilNextAnswer = false) =>
    setNoticeState(text ? { text, answer: untilNextAnswer ? stories.answeredAt : null } : null);
  const notice = noticeState && (noticeState.answer === null || noticeState.answer === stories.answeredAt) ? noticeState.text : null;
  const canOpenX = can("page.post_studio.x");
  const now = stories.answeredAt;

  const pages = useMemo(
    () => (showPages ? searchPages(SEARCH_PAGES.filter((p) => p.allowed({ can, canAny })), search) : []),
    [showPages, search, can, canAny],
  );

  const options = useMemo<Option[]>(() => {
    // No rows until an answer has landed: its time is what their ages are counted from
    const shown = stories.answeredAt ? stories.items : [];
    const storyOptions: Option[] = (filter === "all" ? shown.slice(0, STORIES_IN_ALL) : shown).map((story) => {
      const blocked = storyBlocked(story, canOpenX, stories.answeredAt);
      return { key: `story-${story.id}`, kind: "story", story, href: story.linkSlug && !blocked ? storyHref(story.linkSlug) : null, blocked };
    });
    const pageOptions: Option[] = pages.map((page) => ({ key: `page-${page.id}`, kind: "page", page }));
    return [...storyOptions, ...pageOptions];
  }, [filter, stories.items, stories.answeredAt, pages, canOpenX]);

  const activeIndex = Math.max(0, options.findIndex((o) => o.key === activeKey));
  const active = options[activeIndex] as Option | undefined;

  useEffect(() => {
    if (!active) return;
    document.getElementById(`${listId}-${active.key}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  const close = () => {
    setSearch("");
    setActiveKey(null);
    setNotice(null);
    onClose();
  };

  const choose = (option: Option) => {
    if (option.kind === "page") {
      router.push(option.page.path);
      close();
      return;
    }
    // The rows on screen belong to the previous query until the new answer lands
    if (stories.loading) {
      setNotice("Still searching…", true);
      return;
    }
    if (option.blocked || !option.href) {
      setNotice(`${option.blocked?.short ?? "No X draft yet"}. This story can't be opened.`);
      return;
    }
    // The X desk reads ?story= when it mounts, so on the desk itself only a fresh load opens the story
    if (pathname === "/ai-content/x") window.location.assign(option.href);
    else router.push(option.href);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // A Hindi (or any) input method is picking a candidate: its Enter and arrows are not ours
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (!options.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActiveKey(options[(activeIndex + step + options.length) % options.length].key);
      setNotice(null);
    } else if (e.key === "Enter" && active) {
      e.preventDefault();
      choose(active);
    }
  };

  const tryExample = (q: string) => {
    setSearch(q);
    setActiveKey(null);
    setNotice(null);
    inputRef.current?.focus();
  };

  const q = search.trim();
  const qSpan = <span lang={langOf(q)}>{q}</span>;
  const storyOptions = options.filter((o): o is Extract<Option, { kind: "story" }> => o.kind === "story");
  const pageOptions = options.filter((o): o is Extract<Option, { kind: "page" }> => o.kind === "page");
  const storiesSettled = stories.active && !stories.loading;
  const showStorySection = showStories && !!q;
  const pagesEmpty = showPages && !!q && pageOptions.length === 0;

  // One visible line under the Stories heading when there are no rows to show
  let storyNote: React.ReactNode = null;
  if (showStorySection) {
    if (stories.problem) storyNote = stories.message;
    else if (!stories.active) storyNote = `Type ${STORY_SEARCH_MIN} or more letters to search stories.`;
    else if (storiesSettled && !stories.items.length) storyNote = <>No stories match “{qSpan}”. Try the Hindi or English word.</>;
    else if (!stories.items.length) storyNote = "Searching stories…";
  }

  // Said once the answer has settled, counting the rows actually shown. Nodes, so the echoed query carries its own lang.
  let announcement: React.ReactNode = null;
  if (notice) announcement = notice;
  else if (q && !stories.loading) {
    const parts: React.ReactNode[] = [];
    if (showStorySection && stories.active) {
      if (stories.problem && stories.message) parts.push(stories.message);
      else if (!storyOptions.length) parts.push(<>No stories match “{qSpan}”</>);
      else parts.push(plural(storyOptions.length, "story", "stories"));
    }
    if (showPages) parts.push(pageOptions.length ? plural(pageOptions.length, "page", "pages") : <>No page matches “{qSpan}”</>);
    announcement = parts.map((part, i) => (
      <React.Fragment key={i}>
        {i > 0 && ", "}
        {part}
      </React.Fragment>
    ));
  }

  const muted = mode === "light" ? "#6D6E6F" : "#b0b0b0";
  const tones = TONE_COLOURS[mode === "dark" ? "dark" : "light"];

  const rowSx = (isActive: boolean, disabled: boolean) => ({
    display: "flex",
    alignItems: "flex-start",
    gap: 1.25,
    minHeight: 44,
    px: 1.5,
    py: 1,
    borderRadius: "8px",
    cursor: disabled ? "default" : "pointer",
    listStyle: "none",
    backgroundColor: isActive ? "action.selected" : "transparent",
    outline: isActive ? "2px solid" : "none",
    outlineColor: "primary.main",
    outlineOffset: "-2px",
    "&:hover": { backgroundColor: isActive ? "action.selected" : "action.hover" },
  });

  const renderStory = (option: Extract<Option, { kind: "story" }>) => {
    const { story, blocked } = option;
    const isActive = active?.key === option.key;
    const status = storyStatus(story.status);
    const note = matchNote(story.match);
    return (
      <Box
        component="li"
        key={option.key}
        id={optionId(option.key)}
        role="option"
        aria-selected={isActive}
        aria-disabled={!!blocked || undefined}
        onClick={() => choose(option)}
        onMouseMove={() => !isActive && setActiveKey(option.key)}
        sx={rowSx(isActive, !!blocked)}
      >
        <Box sx={{ minWidth: 24, pt: "2px", color: blocked ? "text.secondary" : "text.primary", display: "flex" }} aria-hidden>
          <Newspaper size={18} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            lang={story.headline ? "hi" : "en"}
            sx={{
              fontFamily: HINDI_FONT,
              fontSize: "0.9375rem",
              fontWeight: 600,
              lineHeight: 1.45,
              color: blocked ? "text.secondary" : "text.primary",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              overflowWrap: "anywhere",
            }}
          >
            {story.headline || "Untitled story"}
          </Typography>
          {story.snippet && (
            <Typography
              lang="hi"
              sx={{ fontFamily: HINDI_FONT, mt: 0.25, fontSize: "0.8125rem", lineHeight: 1.5, color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {story.snippet}
            </Typography>
          )}
          <Box sx={{ mt: 0.5, display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 0.75, rowGap: 0.25, fontSize: "0.75rem", color: "text.secondary", lineHeight: 1.5 }}>
            {story.district && <span lang="en">{story.district}</span>}
            {story.district && story.town && <span aria-hidden>·</span>}
            {story.town && <Box component="span" lang="hi" sx={{ fontFamily: HINDI_FONT }}>{story.town}</Box>}
            {(story.district || story.town) && <span aria-hidden>·</span>}
            <Box component="time" dateTime={story.receivedAt}>{storyAge(story.receivedAt, now)}</Box>
            <Box component="span" sx={{ px: 0.75, border: "1px solid", borderColor: "divider", borderRadius: "4px", color: tones[status.tone], fontWeight: 500, lineHeight: "18px" }}>
              {status.label}
            </Box>
            {note && (
              <Box component="span" sx={{ px: 0.75, border: "1px dashed", borderColor: "text.secondary", borderRadius: "4px", backgroundColor: "transparent", color: "text.secondary", fontStyle: "italic", lineHeight: "16px" }}>
                {note}
              </Box>
            )}
          </Box>
          {blocked && (
            <Typography sx={{ mt: 0.25, fontSize: "0.75rem", lineHeight: 1.5, color: "text.secondary", fontStyle: "italic" }}>{blocked.long}</Typography>
          )}
        </Box>
      </Box>
    );
  };

  const renderPage = (option: Extract<Option, { kind: "page" }>) => {
    const isActive = active?.key === option.key;
    return (
      <Box
        component="li"
        key={option.key}
        id={optionId(option.key)}
        role="option"
        aria-selected={isActive}
        onClick={() => choose(option)}
        onMouseMove={() => !isActive && setActiveKey(option.key)}
        sx={{ ...rowSx(isActive, false), alignItems: "center", py: 0.75 }}
      >
        <Box sx={{ minWidth: 24, color: "text.primary", display: "flex" }} aria-hidden>
          {PAGE_ICONS[option.page.id]}
        </Box>
        <Typography sx={{ fontSize: "0.875rem", fontWeight: 500, color: "text.primary" }}>{option.page.label}</Typography>
      </Box>
    );
  };

  return (
    <Modal open={open} onClose={close}>
      <Box
        role="dialog"
        aria-modal="true"
        aria-label="Search stories and pages"
        tabIndex={-1}
        sx={{
          // Hung from the top rather than centred, so the panel stays put as results come and go
          position: "absolute",
          top: { xs: 24, sm: "12vh" },
          left: "50%",
          transform: "translateX(-50%)",
          width: "calc(100vw - 32px)",
          maxWidth: { xs: 360, sm: 460, md: 520 },
          maxHeight: { xs: "min(560px, calc(100dvh - 48px))", sm: "min(560px, calc(100dvh - 12vh - 24px))" },
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: "12px",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.35)",
          overflow: "hidden",
          outline: "none",
        }}
      >
        <Box
          sx={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            pl: 2,
            pr: { xs: 0.5, sm: 2 },
            py: { xs: 0.5, sm: 1.5 },
            minHeight: { xs: 56, sm: "auto" },
            borderBottom: "1px solid",
            borderColor: "divider",
            flexShrink: 0,
            color: "text.primary",
            // The field has no box of its own; this line shows where typing goes
            "&:focus-within": { boxShadow: "inset 0 -2px 0 currentColor" },
          }}
        >
          <Search size={20} style={{ color: muted, flexShrink: 0 }} aria-hidden />
          <InputBase
            inputRef={inputRef}
            placeholder="Search stories in Hindi or English…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setActiveKey(null);
              setNotice(null);
            }}
            onKeyDown={onKeyDown}
            autoFocus
            inputProps={{
              role: "combobox",
              "aria-label": "Search stories in Hindi or English, and pages",
              "aria-expanded": options.length > 0,
              "aria-controls": options.length > 0 ? listId : undefined,
              "aria-autocomplete": "list",
              "aria-activedescendant": active ? optionId(active.key) : undefined,
              autoComplete: "off",
              spellCheck: false,
              enterKeyHint: "go",
              maxLength: 100,
            }}
            sx={{ flex: 1, color: "text.primary", fontSize: "0.9375rem", "& input": { fontFamily: `var(--font-roboto), ${HINDI_FONT}` } }}
          />
          <Box component="kbd" sx={{ display: { xs: "none", sm: "block" }, px: 0.75, border: "1px solid", borderColor: "divider", borderRadius: "4px", fontSize: "0.6875rem", fontFamily: "inherit", color: "text.secondary" }}>
            Esc
          </Box>
          {/* Phones have no Esc key */}
          <IconButton
            aria-label="Close search"
            onClick={close}
            sx={{ display: { xs: "inline-flex", sm: "none" }, width: 44, height: 44, flexShrink: 0, color: "text.secondary", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 } }}
          >
            <X size={20} />
          </IconButton>
          {/* Absolutely placed, so starting and finishing a search never moves the list */}
          {stories.loading && (
            <LinearProgress
              aria-hidden
              sx={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: -1,
                height: 2,
                backgroundColor: "transparent",
                "& .MuiLinearProgress-bar": { backgroundColor: "text.secondary" },
                "@media (prefers-reduced-motion: reduce)": {
                  opacity: 0.4,
                  "& .MuiLinearProgress-bar": { animation: "none", transform: "none", left: 0, right: 0, width: "100%" },
                  "& .MuiLinearProgress-bar2": { display: "none" },
                },
              }}
            />
          )}
        </Box>

        <Box role="group" aria-label="Show" sx={{ display: "flex", gap: 0.75, px: 2, py: 1, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <Box
                key={f.key}
                component="button"
                type="button"
                aria-pressed={on}
                onClick={(e: React.MouseEvent) => {
                  setFilter(f.key);
                  setActiveKey(null);
                  setNotice(f.announce);
                  // A mouse click goes back to typing; a keyboard press leaves focus on the chip
                  if (e.detail > 0) inputRef.current?.focus();
                }}
                sx={{
                  height: 28,
                  px: 1.25,
                  border: 0,
                  borderRadius: "8px",
                  fontFamily: "inherit",
                  fontSize: "0.75rem",
                  fontWeight: on ? 600 : 400,
                  cursor: "pointer",
                  backgroundColor: on ? "text.primary" : "action.hover",
                  color: on ? (mode === "light" ? "#fff" : "#000") : "text.secondary",
                  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
                }}
              >
                {f.label}
              </Box>
            );
          })}
        </Box>

        <Box sx={{ p: 1, overflowY: "auto", flex: 1, minHeight: 0 }}>
          {!q && showStories && (
            <Box sx={{ px: 1.5, pt: 1, pb: 1.25 }}>
              <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mb: 1 }}>
                Type a place, a word from the headline, or its English meaning. Try:
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                {EXAMPLES.map((ex) => (
                  <Box
                    key={ex}
                    component="button"
                    type="button"
                    onClick={() => tryExample(ex)}
                    lang={langOf(ex)}
                    sx={{
                      minHeight: 32,
                      px: 1.25,
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: "16px",
                      backgroundColor: "transparent",
                      color: "text.primary",
                      fontFamily: `var(--font-roboto), ${HINDI_FONT}`,
                      fontSize: "0.8125rem",
                      cursor: "pointer",
                      "&:hover": { backgroundColor: "action.hover" },
                      "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
                    }}
                  >
                    {ex}
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {/* The Stories heading and its notes sit outside the listbox, which holds options only */}
          {showStorySection && (
            <>
              <Typography id={`${listId}-stories`} sx={groupLabelSx}>
                Stories
              </Typography>
              {stories.expanded.length > 0 && (
                <Typography sx={{ ...noteSx, pt: 0, fontSize: "0.75rem" }}>
                  Also searched:{" "}
                  <Box component="span" lang="hi" sx={{ fontFamily: HINDI_FONT }}>
                    {stories.expanded.join(", ")}
                  </Box>
                </Typography>
              )}
              {filter === "all" && stories.items.length > STORIES_IN_ALL && (
                <Typography sx={{ ...noteSx, pt: 0, fontSize: "0.75rem" }}>
                  {STORIES_IN_ALL} of {stories.items.length} shown. Choose Stories above to see them all.
                </Typography>
              )}
              {storyNote && <Typography sx={{ ...noteSx, py: 0.75 }}>{storyNote}</Typography>}
            </>
          )}

          {options.length > 0 && (
            <Box component="ul" id={listId} role="listbox" aria-label="Search results" aria-busy={stories.loading || undefined} sx={{ m: 0, p: 0 }}>
              {storyOptions.length > 0 && (
                <Box component="li" role="group" aria-labelledby={`${listId}-stories`} sx={{ listStyle: "none" }}>
                  <Box component="ul" role="presentation" sx={{ m: 0, p: 0 }}>
                    {storyOptions.map(renderStory)}
                  </Box>
                </Box>
              )}
              {pageOptions.length > 0 && (
                <Box component="li" role="group" aria-labelledby={`${listId}-pages`} sx={{ listStyle: "none" }}>
                  <Typography id={`${listId}-pages`} role="presentation" sx={groupLabelSx}>
                    Pages
                  </Typography>
                  <Box component="ul" role="presentation" sx={{ m: 0, p: 0 }}>
                    {pageOptions.map(renderPage)}
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {pagesEmpty && filter === "pages" && (
            <Typography sx={{ ...noteSx, py: 2 }}>No page matches “{qSpan}”.</Typography>
          )}

          <Box
            role="status"
            aria-live="polite"
            lang="en"
            sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}
          >
            {announcement}
          </Box>
        </Box>
      </Box>
    </Modal>
  );
};

export default SearchModal;
