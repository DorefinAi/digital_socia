"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Typography, Button, TextField, Dialog, IconButton, Slider, Switch, Tooltip, LinearProgress, Alert, Snackbar, CircularProgress, useMediaQuery } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import {
  X as CloseIcon,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Eye,
  Send,
  Film,
  Scissors,
  RotateCcw,
  Plus,
  Minus,
  Check,
  Copy,
  Radio,
  CalendarClock,
  Save,
  Ban,
  Image as ImageIcon,
  Type,
  FileText,
  Upload,
  Maximize,
  Pencil,
  LayoutTemplate,
  Undo2,
  Redo2,
  Trash2,
  CopyPlus,
  Highlighter,
  ArrowUpToLine,
  ArrowDownToLine,
  Bold,
  Italic,
  Underline,
  Clapperboard,
  FlipHorizontal2,
  Volume2,
  VolumeX,
  EyeOff,
  Keyboard,
  Move,
  Scaling,
  MoreHorizontal,
  ClipboardCopy,
} from "lucide-react";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { Playhead, usePlayhead, usePlayheadTime } from "@/hooks/usePlayhead";
import { CardTextLayer, CardTextStyle, FtpMedia, FtpNewsItem, MediaAdjust, PostPayload, RejectReason, SocialPlatform, TextMotion } from "@/types/newsroom";
import { usePermissions } from "@/lib/access/usePermissions";
import TemplateCanvas, {
  BREAKING_RED,
  CanvasSelection,
  CardExport,
  DEFAULT_TEXT_Y,
  TEMPLATE_FORMATS,
  TemplateCanvasHandle,
  TemplateFormat,
  TemplateLayout,
  TrimRange,
  defaultLayout,
} from "./TemplateCanvas";
import { PLATFORM_LIMITS, TagSuggestion, composePostText, countChars, findUrl, shortenToFit, suggestHashtags, suggestMentions } from "./socialText";
import { RejectDialog, ScheduleDialog } from "./actionDialogs";
import { FoldedPanelStrip, PanelResizeHandle, PanelsConfig, useResizablePanels } from "./ResizablePanels";
import { CategoryLabel, PLATFORM_META, PlatformIcon, priorityTag, rejectedNotice, srOnly, storyTag, TAG_TINT, tagTint } from "./shared";
import { PostMock, TagOption, TagPicker, fieldSx, sectionLabel } from "./composerParts";
import { offeredHashtags, offeredMentions } from "./suggestionGroups";
import VideoTimeline, { CLIP_SPEEDS, TimelineText, clock, outputLength } from "./VideoTimeline";
import TextControls, { ALIGN_ICONS, FontSelect } from "./TextControls";
import TemplatePicker from "./TemplatePicker";
import { ENTER_SECONDS, MEDIA_LOOKS, TEXT_ANIMATIONS, accentFor, inkOn, mediaFilter, mediaWarmth, resolveHeadlineStyle, resolveLayerStyle, templateById, templatePatch, textSpan, warmthColor } from "./cardRender";
import { BODY_STYLE, ORG_BODY_ID, ORG_DATE_ID, orgBodyText, orgLayout, orgPlacement, refreshOrgDate, switchOrgTemplate, useBackdrop, useOrgFontsReady, useTemplateImage } from "./live/orgCanvas";
import { ORG_CARD_FONT, fontById, nearestWeight } from "./templateFonts";
import FtpFeedPanel from "./FtpFeedPanel";
import { DAILY_CAP, isLiveOn } from "@/data/socialDesk";
import * as socia from "@/lib/socia/api";
import type { DraftView, DrawableCardTemplate, OrgCardTemplate } from "@/lib/socia/types";
import type { LiveEditing } from "./live/LiveEditor";
import { apiFileUrl, credentialsFor, errorCode, errorText, isLiveItem, useLiveDesk } from "./live/LiveDesk";
import { draftCardHeadline } from "./cardWords";
import { usePhase } from "@/lib/socia/usePhase";
import { assemblePost } from "./phase1/Phase1Editor";
import { type PostBox, type PostFormat, SERVER_HASHTAGS_MAX, SERVER_MENTIONS_MAX, checkedValues, pickerRows, readPostBox, splitPost, syncOptions, tagKey, withBody } from "./postBox";
import { needsCheckHint, needsCheckLabel, shownNeedsCheck } from "./phase1/badges";
import { keyHash, useBackgroundCard } from "./live/useBackgroundCard";
import OrgTemplatePicker, { type CardChoice } from "./live/OrgTemplatePicker";
import { cardChoiceChanged, defaultOrgTemplate } from "./live/storyThumbs";
import { PostedLinkDialog } from "./actionDialogs";
import { EDITOR_KEYS, NUDGE, editorKeyFor, editorShortcut, editorShortcutSuffix, isCanvasKeyTarget, isEditorTypingTarget, isTextEntryTarget, keysById, swallowNextContextMenu, withEditorShortcut } from "./editorKeys";
import { ariaKeyShortcuts, useKeyBindings } from "./keyBindings";
import { ConfirmPostDialog, EditorShortcutsSheet, LeaveEditorDialog } from "./EditorShortcutsSheet";
import RewriteNotice from "./RewriteNotice";
import { type MenuEntry, useEditorMenu } from "./video/ui/EditorContextMenu";

import VolumeStrip from "./VolumeStrip";
import { adjacentStory, counterTone, steppedTextSize, storyAfterPosted, workableOrder } from "./deskRules";

/** Someone else holds this story (their claim), so the studio steps over it */
const heldByOther = (n: FtpNewsItem) => isLiveItem(n) && !!n.live.claim && !n.live.claim.mine;

/**
 * After Copy & Mark Posted moves on to the next story, the main action rests for a moment, so a second press
 * of Ctrl+Enter (or a double click) meant for the story just posted can't post the next one unread.
 * Module-level: the next story may open in a fresh editor.
 */
const ADVANCE_QUIET_MS = 1000;
let approveQuietUntil = 0;
const restApproveAfterAdvance = () => {
  approveQuietUntil = Date.now() + ADVANCE_QUIET_MS;
};
const approveResting = () => Date.now() < approveQuietUntil;

type Tool = "ftp" | "template" | "background" | "text" | "video" | "story";

/** One step of undo history: everything the operator changes by hand, as it was */
type Snapshot = {
  layout: TemplateLayout;
  text: string;
  hashtags: TagOption[];
  mentions: TagOption[];
  mediaIndex: number;
  cardSource: "background" | "design" | null;
};

const TOOLS: { id: Tool; label: string; icon: React.ReactNode; videoOnly?: boolean }[] = [
  { id: "ftp", label: "FTP feed", icon: <Radio size={19} /> },
  { id: "template", label: "Template", icon: <LayoutTemplate size={19} /> },
  { id: "background", label: "Background", icon: <ImageIcon size={19} /> },
  { id: "text", label: "Text", icon: <Type size={19} /> },
  { id: "video", label: "Video", icon: <Clapperboard size={19} />, videoOnly: true },
  { id: "story", label: "Story", icon: <FileText size={19} /> },
];

/** Picture adjustment sliders; all sit at 0 when untouched */
const ADJUSTMENTS: { key: Exclude<keyof MediaAdjust, "filter">; label: string; min: number }[] = [
  { key: "brightness", label: "Brightness", min: -1 },
  { key: "contrast", label: "Contrast", min: -1 },
  { key: "saturation", label: "Saturation", min: -1 },
  { key: "warmth", label: "Warmth", min: -1 },
  { key: "blur", label: "Blur", min: 0 },
  { key: "vignette", label: "Vignette", min: 0 },
];

const BAR = { bg: "#0E0E10", text: "rgba(255,255,255,0.7)", border: "rgba(255,255,255,0.14)" };
const SELECT_BLUE = "#2F7BFF";
/** Saving the card image failed in the browser itself (out of memory), not because of the media */
const CARD_IMAGE_FAILED = "The browser ran out of memory making the card image. Close other tabs and try again.";
const BACKDROPS = ["blur", "#000000", "#FFFFFF", BREAKING_RED] as const;


const chromeButton = {
  color: "#fff",
  borderRadius: "8px",
  minHeight: 34,
  px: 1.25,
  fontSize: "0.8125rem",
  "&:hover": { backgroundColor: "rgba(255,255,255,0.1)" },
  // Disabled (Prev on the first story, Next on the last) stays readable on the dark bar
  "&.Mui-disabled": { color: "rgba(255,255,255,0.38)" },
};

const toolbarIcon = { borderRadius: "6px", width: 30, height: 30, color: "text.primary" };
const toolbarDivider = <Box sx={{ width: "1px", height: 20, backgroundColor: "divider", mx: 0.5 }} />;
const panelTitle = { fontSize: "0.9375rem", fontWeight: 700, mb: 1.5 };

// Desktop columns: tool rail, tool panel, card, post panel. The side panels resize and fold.
const EDITOR_PANELS: PanelsConfig = {
  storageKey: "breakingDesk.editorPanels.v1",
  leftFixed: 72,
  rightFolded: 36,
  minMiddle: 420,
  left: { initial: 280, min: 240, max: 480 },
  right: { initial: 340, min: 300, max: 560 },
};
// A folded panel stays mounted (its scroll and feed stay put) but takes no space and no focus
const foldedPanelSx = { visibility: "hidden", overflow: "hidden", p: 0, borderLeft: 0, borderRight: 0 } as const;
const floatingSx = { backgroundColor: "background.paper", border: "1px solid", borderColor: "divider", boxShadow: "0 4px 14px rgba(0,0,0,0.08)" };

/** Longest text the card template takes; the font shrinks to fit anything up to this. */
const CARD_TEXT_MAX = 500;
/** Longest story a desk template's story box takes (the whole FTP story; the font shrinks to fit) */
const STORY_TEXT_MAX = 3000;

let layerCount = 0;
const newLayerId = () => `t${Date.now().toString(36)}${(layerCount++).toString(36)}`;

/** Starting points for extra text boxes; sizes are px on a 1080 frame */
const LAYER_PRESETS: { id: string; label: string; text: string; size: number; width: number; style: CardTextStyle }[] = [
  { id: "heading", label: "Heading", text: "Heading", size: 96, width: 0.8, style: { weight: 800, align: "center" } },
  { id: "subheading", label: "Subheading", text: "Subheading", size: 60, width: 0.75, style: { weight: 700, align: "center" } },
  { id: "body", label: "Body text", text: "Body text", size: 40, width: 0.7, style: { weight: 500, align: "center", lineHeight: 1.4 } },
  { id: "label", label: "Label", text: "LABEL", size: 34, width: 0.5, style: { weight: 800, align: "center", uppercase: true, box: true, boxOpacity: 1, letterSpacing: 0.04, shadow: 0 } },
];

/** The card carries more than the headline: the story, trimmed at a sentence to fit the card. */
/** Renders with the playhead time, so only this part re-renders while the video plays */
function AtPlayhead({ playhead, children }: { playhead: Playhead; children: (time: number) => React.ReactNode }) {
  return <>{children(usePlayheadTime(playhead))}</>;
}

function defaultCardText(item: FtpNewsItem) {
  return shortenToFit(item.body, 400, "Instagram") || item.headline;
}

/** Fresh suggestions with the draft's selections applied; AI suggestions start unticked. */
function withDraftChoices(suggestions: TagSuggestion[], chosen?: string[]): TagOption[] {
  const options = suggestions.map((s) => ({ ...s, checked: chosen ? chosen.includes(s.value) : !s.ai }));
  const extra = (chosen ?? []).filter((v) => !suggestions.some((s) => s.value === v)).map((value) => ({ value, reason: "Added by editor", checked: true }));
  return [...options, ...extra];
}

interface PostEditorProps {
  /** The desk's queue in its current filter order: Prev / Next, J / K and the story after Copy & Mark Posted follow it */
  queueOrder?: readonly FtpNewsItem[];
  item: FtpNewsItem;
  platform: SocialPlatform;
  onClose: () => void;
  /** Opens another FTP story in the editor */
  onSwitch?: (item: FtpNewsItem) => void;
  /** Lets the desk confirm what happened after the editor closes */
  onSaved?: (message: string) => void;
  /** Set on the live desk: the real draft, the claim on it, and how to report back */
  live?: LiveEditing;
}

/** X takes card images up to 5 MB */
const CARD_MAX_BYTES = 5 * 1024 * 1024;
const plainCardText = (text: string) => text.replace(/\*\*/g, "").trim();

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Small per-draft records in this browser's storage; a blocked storage just means nothing is remembered.
 * Each write stamps `savedAt` so lib/browserTidy can drop records nobody has touched for a while.
 */
function draftStore<T>(prefix: string, valid: (value: Record<string, unknown>) => boolean) {
  const key = (id: string) => `${prefix}${id}`;
  return {
    key,
    /** Null when there is no record, or an old or damaged one that doesn't have this shape */
    read(id: string): T | null {
      try {
        const raw = localStorage.getItem(key(id));
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        return isRecord(parsed) && valid(parsed) ? (parsed as T) : null;
      } catch {
        return null;
      }
    },
    write(id: string, value: T | null) {
      try {
        if (value) localStorage.setItem(key(id), JSON.stringify({ ...value, savedAt: Date.now() }));
        else localStorage.removeItem(key(id));
      } catch {
        // Storage blocked: nothing is remembered for this draft
      }
    },
  };
}

/**
 * The X-background card this browser last uploaded for a draft: a fingerprint of the drawing (draft,
 * background, layout, date, words) and the card URL the server gave it. Reopening with the same drawing
 * skips the upload, and a different URL on the server means someone else replaced the card since.
 */
const bgStore = draftStore<{ hash: string; cardUrl: string }>("socia_bg_card_", (v) => typeof v.hash === "string" && typeof v.cardUrl === "string");

/** The card design the operator picked for a draft in the Template tab: an org template's slug, or "own" for their X background. */
const choiceStore = draftStore<{ template: string }>("socia_card_choice_", (v) => typeof v.template === "string");

/** "Square, 1080 × 1080" for a design's thumbnail */
const shapeNote = (t: { width: number; height: number }) =>
  `${t.width === t.height ? "Square" : t.height > t.width ? "Portrait" : "Landscape"}, ${t.width} × ${t.height}`;

/** The card design last sent to the server for a draft, so reopening shows the card that will be posted. */
const designStore = {
  key: (id: string) => `socia_card_design_${id}`,
  /** `cardUrl` is the server's card after the upload; absent in records from before it was kept */
  read(id: string): { layout: TemplateLayout; mediaFile: string; cardUrl?: string | null } | null {
    try {
      const raw = localStorage.getItem(designStore.key(id));
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      // An old or damaged record is ignored rather than handed to the card
      if (!isRecord(parsed) || !isRecord(parsed.layout) || !isRecord(parsed.layout.box) || !isRecord(parsed.layout.headline)) return null;
      if (typeof parsed.mediaFile !== "string") return null;
      if (parsed.cardUrl !== undefined && parsed.cardUrl !== null && typeof parsed.cardUrl !== "string") return null;
      return parsed as unknown as { layout: TemplateLayout; mediaFile: string; cardUrl?: string | null };
    } catch {
      return null;
    }
  },
  write(id: string, value: { layout: TemplateLayout; mediaFile: string; cardUrl?: string | null } | null) {
    try {
      // savedAt: lib/browserTidy drops records nobody has touched for a while
      if (value) localStorage.setItem(designStore.key(id), JSON.stringify({ ...value, savedAt: Date.now() }));
      else localStorage.removeItem(designStore.key(id));
    } catch {
      // Storage blocked: the design just won't be restored on reopen
    }
  },
};

/**
 * Hashtag and mention choices from the server's draft: its own tags ticked, suggestions offered unticked
 * (the reporter's usual tags among them; TagPicker shows those in their own group).
 */
function liveTags(d: DraftView) {
  const hashtags: TagOption[] = [
    ...d.hashtags.map((value) => ({ value, reason: "From the story", checked: true })),
    ...offeredHashtags(d.hashtagSuggestions, d.hashtags),
  ];
  const mentions: TagOption[] = [
    ...d.mentions.map((value) => ({ value, reason: "In the draft", checked: true })),
    ...offeredMentions(d.mentionSuggestions, d.mentions),
  ];
  return { hashtags, mentions };
}

/** A handle whose add to the directory failed lately (`until` per tag key); only called from event handlers */
const addCoolingDown = (until: ReadonlyMap<string, number>, key: string) => (until.get(key) ?? 0) > Date.now();

export default function PostEditor({ item, platform, onClose, onSwitch, onSaved, live, queueOrder }: PostEditorProps) {
  const { publishSocialPost, saveDraft, scheduleDraft, rejectDraft, socialDrafts, socialPosts, hashtagRules, handleDirectory } = useNewsroom();
  const { can, roleLabel } = usePermissions();
  const desk = useLiveDesk();
  const isX = platform === "X (Twitter)";
  // Live: changes need the claim; held, lost or read-only stories open to look at
  const canEdit = (live ? live.lease.kind === "mine" && !!desk?.canAct : true) && can("draft.edit");
  // Each button also needs its own permission (access-control-contract.md §2)
  const mayPublish = can("post.publish");
  const mayMarkPosted = can("post.mark_posted");
  // Reject declines the draft: draft.reject or post.publish, as on the server
  const mayReject = can("draft.reject") || can("post.publish");
  // Phase 1 (set on the server): no X API posting (approve answers 409 phase_off), no video export and no
  // post-link step. The main button is Copy & Mark Posted: copy the text, send the card, move the story to Posted.
  const { features } = usePhase();
  const phase1 = !!live && !!desk?.phase1;
  const apiPosting = !phase1 || !!features?.xApiPosting;
  const copyMode = phase1 && features?.copyPosted !== false;
  // The post box holds the whole post, body then tag line (postBox.ts). The live desk lays it out as the
  // server assembles it (copy-posted answers with that text); the demo desk keeps its mentions-then-hashtags layout.
  const postFormat: PostFormat = live ? assemblePost : (body, tags, handles) => composePostText(body, handles, tags);
  const splitOpts = { strict: !!live };
  /**
   * A live story opens on the server's own assembled text, so opening saves nothing: until the box is edited
   * the server's split (`pristine.save`) is what counts, even for a draft whose body already ends in tags.
   */
  const openLive = (d: DraftView) => {
    const tags = liveTags(d);
    const text = assemblePost(d.bodyText, d.hashtags, d.mentions);
    return { text, hashtags: tags.hashtags, mentions: tags.mentions, openMentions: d.mentions, pristine: { text, save: { bodyText: d.bodyText, hashtags: d.hashtags, mentions: d.mentions } } };
  };

  // Everything that belongs to one story. Reopening a saved or scheduled story picks up where the operator left off.
  const storyStart = (story: FtpNewsItem) => {
    if (live) {
      const d = live.draft;
      // Reopening shows the design that was last sent for this draft, if this browser sent it and nobody replaced it since
      const record = d.card.custom ? designStore.read(d.id) : null;
      const kept = record && (!record.cardUrl || record.cardUrl === d.card.url) ? record : null;
      // A design saved before card headlines were cleaned (leading hashtags, district prefix) reads as it is
      // saved now, so reopening it is not an edit
      const saved = kept ? { ...kept, layout: { ...kept.layout, headline: draftCardHeadline(kept.layout.headline, d) } } : null;
      const ownBg = d.card.custom ? bgStore.read(d.id) : null;
      const layout = saved?.layout ?? defaultLayout(draftCardHeadline(d.cardHeadline, d), "x");
      return {
        id: story.id,
        draft: undefined,
        igFormat: "ig_post" as TemplateFormat,
        mediaIndex: Math.max(0, story.media.findIndex((m) => m.fileName === saved?.mediaFile)),
        layout,
        ...openLive(d),
        // Until the design changes, the server's card is the one that posts
        custom: !!d.card.custom,
        // A design sent from this browser wins over the operator's X background when the story reopens
        savedDesign: !!saved,
        // A custom card this browser did not send (another operator or browser) stays until the operator chooses
        serverCard: !!d.card.custom && !saved && ownBg?.cardUrl !== d.card.url,
        // The card design picked for this draft in this browser; null opens on the story's default
        bgPick: (choiceStore.read(d.id)?.template ?? null) as string | null,
        // "Use automatic card" was chosen: the card is not moved onto a desk template
        noOrg: false,
        // A design reopened on another day: its date box shows today now, so the card on the server is older
        dateStale: false,
      };
    }
    const draft = socialDrafts.find((d) => d.newsId === story.id && d.platform === platform && (d.status === "saved" || d.status === "scheduled"));
    const igFormat: TemplateFormat = draft?.format === "ig_post" || draft?.format === "ig_reel" ? draft.format : story.media[0].kind === "video" ? "ig_reel" : "ig_post";
    return {
      id: story.id,
      draft,
      igFormat,
      mediaIndex: Math.max(0, story.media.findIndex((m) => m.fileName === draft?.mediaFile)),
      layout: draft?.layout ?? defaultLayout(defaultCardText(story), isX ? "x" : igFormat),
      ...(() => {
        const hashtags = withDraftChoices(suggestHashtags(story, hashtagRules), draft?.hashtags);
        const mentions = withDraftChoices(suggestMentions(story, platform, handleDirectory), draft?.mentions);
        const text = postFormat(draft?.caption ?? story.shortText, checkedValues(hashtags), checkedValues(mentions));
        return { text, hashtags, mentions, openMentions: [] as string[], pristine: null as { text: string; save: PostBox["save"] } | null };
      })(),
      custom: false,
      savedDesign: false,
      serverCard: false,
      bgPick: null as string | null,
      noOrg: false,
      dateStale: false,
    };
  };
  const [start, setStart] = useState(() => storyStart(item));
  const draft = start.draft;
  // Restore the saved cut when it belongs to this file, otherwise keep the whole video
  const clipsFor = (d: typeof draft, fileName: string, seconds: number): TrimRange[] => {
    const saved = d?.mediaFile === fileName ? d.clipSegments?.filter((c) => c.end <= seconds + 0.05) : undefined;
    return saved?.length ? saved : [{ start: 0, end: seconds }];
  };
  const canvasRef = useRef<TemplateCanvasHandle>(null);
  // The dialog mounts its content after this component, so the stage is tracked as state
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const headlineInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const meta = PLATFORM_META[platform];
  const limits = PLATFORM_LIMITS[platform];

  const [uploads, setUploads] = useState<FtpMedia[]>([]);
  const mediaList = useMemo(() => [...item.media, ...uploads], [item.media, uploads]);
  const [mediaIndex, setMediaIndex] = useState(start.mediaIndex);
  const media = mediaList[mediaIndex] ?? mediaList[0];
  const [igFormat, setIgFormat] = useState<TemplateFormat>(start.igFormat);
  const format: TemplateFormat = isX ? "x" : igFormat;
  // Downloads take the story's readable name from the server ("Jaipur-...-09Nov-2241.png"); the draft id on an older server
  const fileStem = live?.draft.fileStem;
  const downloadName = (ext: string, fmt: TemplateFormat = "x") => (fileStem ? `${fileStem}${fmt === "x" ? "" : `-${fmt}`}.${ext}` : `${item.id}-${fmt}.${ext}`);

  const [layout, setLayout] = useState<TemplateLayout>(start.layout);
  // Card versions for undo and redo; a version is kept once the card has been still for a moment
  // Card design and post text versions for undo and redo; a version is kept once both have been still for a moment
  const [history, setHistory] = useState<{ stack: Snapshot[]; index: number }>({
    stack: [{ layout: start.layout, text: start.text, hashtags: start.hashtags, mentions: start.mentions, mediaIndex: start.mediaIndex, cardSource: null }],
    index: 0,
  });
  const [tool, setTool] = useState<Tool>("ftp");
  const { measure: measureWorkspace, columns: workspaceColumns, left: leftPanel, right: rightPanel } = useResizablePanels(EDITOR_PANELS);
  // Below lg the columns stack and the panels keep their natural size
  const wide = useMediaQuery((t: Theme) => t.breakpoints.up("lg"));
  const leftFolded = leftPanel.collapsed;
  const rightFolded = wide && rightPanel.collapsed;
  const [selection, setSelection] = useState<CanvasSelection>(null);
  const [zoom, setZoom] = useState(1);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  const [text, setText] = useState(start.text);
  const [hashtags, setHashtags] = useState<TagOption[]>(start.hashtags);
  const [mentions, setMentions] = useState<TagOption[]>(start.mentions);
  // Handles the server answered bad_mention for: they stay plain text in this story
  const [refused, setRefused] = useState<ReadonlySet<string>>(() => new Set());
  // Tag-line handles this session added to the handle directory (POST /handles/desk): real mentions from then on
  const [added, setAdded] = useState<ReadonlySet<string>>(() => new Set());
  // Handles whose add failed, and until when not to try again (400/403: not in this session)
  const addFailed = useRef(new Map<string, number>());
  // The same set as `added`, up to date between renders, so a save queued behind another doesn't add them again
  const addedNow = useRef(new Set<string>());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [videoPaused, setVideoPaused] = useState(false);
  // Plays the video's sound while editing; saved clips carry it either way
  const [sound, setSound] = useState(false);
  const [duration, setDuration] = useState(0);
  // Kept parts of the source video, in order. Splitting adds a boundary, deleting removes a part.
  const [segments, setSegments] = useState<TrimRange[]>([]);
  const [selectedClip, setSelectedClip] = useState<number | null>(null);
  const playhead = usePlayhead();
  const [exporting, setExporting] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"reject" | "schedule" | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // ── Live desk state ──
  const [busy, setBusy] = useState<null | "save" | "post" | "posted" | "copy" | "reject" | "claim" | "card">(null);
  // Phase 1 Copy & Mark Posted: copied but not marked (blocks until retried), or someone already posted the story
  const [notPosted, setNotPosted] = useState<string | null>(null);
  const [takenBy, setTakenBy] = useState<string | null>(null);
  // Someone saved the draft after it was opened: the server's version, until the operator picks a side
  const [stale, setStale] = useState<number | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  // The design that was last uploaded as this draft's card
  const [uploaded, setUploaded] = useState<{ layout: TemplateLayout; url: string } | null>(null);
  // Where the posted card comes from: the operator's X background or this editor's design. null follows the default.
  const [cardSource, setCardSource] = useState<"background" | "design" | null>(null);
  const [bgPick, setBgPick] = useState<string | null>(start.bgPick);
  // The background card last uploaded as this draft's card, by draft and drawing
  const [bgUploaded, setBgUploaded] = useState<{ id: string; key: string } | null>(null);
  // ── Keyboard and right-click ──
  // The person's own keys (profile): the handler reads them per key press, the hints re-render with them
  useKeyBindings();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Esc with unsaved work asks before closing
  const [leaving, setLeaving] = useState(false);
  // Posting that needs a second look: a too-close rewording, or demo Ctrl+Enter (no undo window)
  const [confirmPost, setConfirmPost] = useState<null | "tooClose" | "demo">(null);
  // Demo desk: what Save draft last stored, so Esc knows whether anything is unsaved
  const [mockSaved, setMockSaved] = useState<{ text: string; layout: TemplateLayout; hashtags: TagOption[]; mentions: TagOption[] } | null>(null);
  const cardMenu = useEditorMenu("Card options");
  // What the canvas found under the pointer on right-click; read by the stage's menu handler
  const menuTarget = useRef<Exclude<CanvasSelection, null> | null>(null);
  // The scroll area around the card: keys from inside it act on the card
  const stageAreaRef = useRef<HTMLDivElement>(null);

  // Switching stories swaps the story's state in place. The editor stays mounted, so the
  // screen does not flash and the feed, tool panel and zoom stay where the operator left them.
  if (start.id !== item.id) {
    const next = storyStart(item);
    setStart(next);
    setUploads([]);
    setMediaIndex(next.mediaIndex);
    setIgFormat(next.igFormat);
    setLayout(next.layout);
    setHistory({ stack: [{ layout: next.layout, text: next.text, hashtags: next.hashtags, mentions: next.mentions, mediaIndex: next.mediaIndex, cardSource: null }], index: 0 });
    setText(next.text);
    setHashtags(next.hashtags);
    setMentions(next.mentions);
    setSelection(null);
    setPreviewOpen(false);
    setVideoPaused(false);
    // The canvas only reports a length when the file changes, so a video shared with the last story keeps it
    const sameVideo = duration > 0 && item.media[next.mediaIndex]?.url === media.url;
    setDuration(sameVideo ? duration : 0);
    setSegments(sameVideo ? clipsFor(next.draft, media.fileName, duration) : []);
    setSelectedClip(null);
    playhead.set(0);
    setNotice("");
    setDialog(null);
    setSavedAt(null);
    setCopied(false);
    setStale(null);
    setLinkOpen(false);
    setUploaded(null);
    setCardSource(null);
    setBgPick(next.bgPick);
    setBgUploaded(null);
    setBusy(null);
    setLeaving(false);
    setMockSaved(null);
    setConfirmPost(null);
    setNotPosted(null);
    setTakenBy(null);
    setRefused(new Set());
  }

  // Any change from how the story opened, so switching stories only saves real work
  const edited = text !== start.text || layout !== start.layout || hashtags !== start.hashtags || mentions !== start.mentions;

  // Keep the frame fitted to the workspace
  useEffect(() => {
    if (!stageEl) return;
    const observer = new ResizeObserver(([entry]) => setStage({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(stageEl);
    return () => observer.disconnect();
  }, [stageEl]);

  // Uploaded files live as object URLs for as long as the editor is open
  const objectUrls = useRef<string[]>([]);
  useEffect(() => {
    const urls = objectUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const isVideo = media.kind === "video";

  // ── The operator's X background (Templates tab): X cards are drawn on it unless they design their own ──
  const cardTemplates = live && isX ? desk?.cardTemplate : undefined;
  const cardTemplate = cardTemplates?.data?.template ?? null;
  // The card on the draft was made elsewhere: it is shown and kept until the operator edits here or picks a source
  const cardTouched = layout !== start.layout || mediaIndex !== start.mediaIndex || uploads.length > 0;
  const serverView = !!live?.draft.card.custom && !!live.draft.card.url && start.serverCard && cardSource === null && !cardTouched;
  // The desk's shared designs (org-card-templates-contract.md) are the card's background in this editor: BIG
  // stories open on the one made for big_breaking, others on the one for breaking. None from the server: the
  // X background as before. `orgList` is null until the list has loaded.
  const orgPoll = live && isX ? desk?.orgCardTemplates : undefined;
  const orgList = orgPoll?.data ?? null;
  const orgTemplates = orgList ?? [];
  // Phase 1 breaking files: BIG in the file name is Big Breaking, every other one Breaking (as shared.storyTag)
  const liveStory = live?.draft.story;
  const tagNow = liveStory ? (liveStory.tags ? (liveStory.tags.big ? "big_breaking" : "breaking") : priorityTag(liveStory.priority)) : storyTag(item);
  const orgDefault = defaultOrgTemplate(orgTemplates, tagNow);
  const ownPicked = bgPick === "own" && !!cardTemplate;
  /** The design a story opens on: the one picked for it in this browser, else the one for its tag */
  const orgStart = orgTemplates.find((t) => t.slug === bgPick) ?? orgDefault;
  // The flat drawing on a background (live/backgroundCard.ts) is kept for the operator's own X background only
  const activeTemplate: DrawableCardTemplate | null = orgTemplates.length ? (ownPicked ? cardTemplate : null) : cardTemplate;
  /** How the card's design is named in sentences */
  const bgName = "your X background";
  const useBgLabel = "Use your X background";
  const cardChoices: CardChoice[] = orgTemplates.length
    ? [
        ...orgTemplates.map((t) => ({ key: t.slug, label: t.label, note: shapeNote(t), template: t, org: t })),
        ...(cardTemplate ? [{ key: "own", label: "Your X background", note: shapeNote(cardTemplate), template: cardTemplate }] : []),
      ]
    : [];
  const bgMode = !!activeTemplate && !serverView && (cardSource ?? (start.savedDesign || start.serverCard ? "design" : "background")) === "background";
  // The desk template the design is on, and whether the canvas shows it
  const orgTpl = layout.orgTemplate ? (orgTemplates.find((t) => t.slug === layout.orgTemplate) ?? null) : null;
  const orgMode = !!orgTpl && !bgMode && !serverView;
  // A design on a desk template whose list hasn't loaded yet: wait rather than flash the photo card
  const orgWaiting = !!layout.orgTemplate && !orgTpl && !bgMode && !serverView && !orgList;
  // The list's first load failed (server error, no access, offline): say so with a retry instead of waiting forever
  const orgFailed = orgWaiting && !!orgPoll?.error;
  const [orgRetrying, setOrgRetrying] = useState(false);
  const retryOrgList = () => {
    if (!orgPoll) return;
    setOrgRetrying(true);
    void orgPoll.refresh().finally(() => setOrgRetrying(false));
  };
  // The card's design was deleted and there is no other desk design to move it onto
  const orgGone = !!orgList && !!layout.orgTemplate && !orgTpl && !orgStart && !bgMode && !serverView;
  const activeKey = bgMode ? "own" : orgMode ? orgTpl.slug : null;

  // One decoded picture per template, shared with the Template tab and the feed; the canvas repaints only
  // when it arrives or the design changes, never on the desk's polls
  const orgImage = useTemplateImage(orgMode ? orgTpl.backgroundUrl : null);
  // Words go onto a desk template only once Mardoto and Mangal are in (or have failed), so they are measured in them
  const orgFontsIn = useOrgFontsReady();
  const orgW = orgMode ? orgTpl.width || orgImage.image?.naturalWidth || 1080 : 0;
  const orgH = orgMode ? orgTpl.height || orgImage.image?.naturalHeight || 1080 : 0;
  const orgPicture = orgImage.image;
  const backdrop = useBackdrop(orgW, orgH, orgPicture);

  /** Makes `next` the layout the story opened with: no undo step, not an edit */
  const adoptStartLayout = (next: TemplateLayout, flags: { dateStale?: boolean } = {}) => {
    setStart((s) => ({ ...s, ...flags, layout: next }));
    setLayout(next);
    setHistory({ stack: [{ layout: next, text, hashtags, mentions, mediaIndex, cardSource }], index: 0 });
  };
  // Opening a story (or the list arriving): an untouched card moves onto its desk template; a design whose
  // template was deleted moves onto the default one; a design from another day shows today's date
  if (orgList?.length && orgStart && orgFontsIn && !start.noOrg && layout === start.layout) {
    if (!layout.orgTemplate && !start.savedDesign) adoptStartLayout(orgLayout(orgStart, { headline: layout.headline, body: item.body }, layout));
    else if (layout.orgTemplate && !orgTpl) adoptStartLayout(switchOrgTemplate(layout, null, orgStart, item.body));
    else if (orgTpl && !start.dateStale) {
      const dated = refreshOrgDate(layout, orgTpl);
      if (dated !== layout) adoptStartLayout(dated, { dateStale: true });
    }
  } else if (orgList && orgStart && orgFontsIn && layout.orgTemplate && !orgTpl && !serverView) {
    // Its template was deleted while the card was being edited: onto the default design too, edits kept
    setLayout(switchOrgTemplate(layout, null, orgStart, item.body));
  }

  // The Video tab only exists for video stories; a desk template is a still card
  const panel: Tool = tool === "video" && (!isVideo || phase1 || orgMode) ? "background" : tool;
  const frame = backdrop ?? TEMPLATE_FORMATS[format];
  const fit = Math.max(0.05, Math.min(stage.w / frame.w, stage.h / frame.h));
  const frameWidth = Math.round(frame.w * fit * zoom);

  /** Template tab thumbnail: lay the open story out on that design, and remember it for this draft in this browser. */
  const pickCardDesign = (key: string, picked?: OrgCardTemplate) => {
    setBgPick(key);
    if (live) {
      choiceStore.write(live.draft.id, { template: key });
      // The FTP feed's thumbnail of this story follows the new design
      cardChoiceChanged(live.draft.id);
    }
    if (key === "own") {
      setCardSource("background");
      return;
    }
    const to = picked ?? orgTemplates.find((t) => t.slug === key);
    if (!to) return;
    setCardSource("design");
    setSelection(null);
    // The words and their styling move to the new design (orgCanvas.switchOrgTemplate says how)
    setLayout((l) => (l.orgTemplate === to.slug ? l : switchOrgTemplate(l, orgTemplates.find((t) => t.slug === l.orgTemplate) ?? null, to, item.body)));
  };
  /** The Template tab's designs: pick one, upload one, look after one */
  const orgPickerProps = {
    choices: cardChoices,
    current: activeKey,
    headline: plainCardText(layout.headline) || item.headline,
    body: orgBodyText(layout, item.body),
    disabled: !canEdit || !!busy,
    onPick: (key: string) => pickCardDesign(key),
    canUpload: !!live && can("draft.edit"),
    onChanged: desk?.orgCardTemplates.refresh,
    // A new design is ready: the open story moves onto it (only when the story can be changed here)
    onUploaded: (t: OrgCardTemplate) => canEdit && pickCardDesign(t.slug, t),
  };
  /** The operator's own X background: picked like a design when there are desk templates */
  const useOwnBackground = () => (orgTemplates.length ? pickCardDesign("own") : setCardSource("background"));
  // A click on the drawn card opens the headline for typing (the drawing itself can't take text)
  const headlineFieldRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const focusHeadline = useRef(false);
  const typeOnBgCard = () => {
    if (!canEdit) return;
    focusHeadline.current = true;
    setTool("text");
    leftPanel.setCollapsed(false);
  };
  useEffect(() => {
    if (!focusHeadline.current || !bgMode || tool !== "text") return;
    const field = headlineFieldRef.current;
    if (!field) return;
    focusHeadline.current = false;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  });
  // The story under the headline: the Body box's words once someone edits them, else the FTP body as before, so a
  // draft nobody edited keeps its background card's key (and is not drawn and uploaded again)
  const bgBody = layout.layers?.find((l) => l.id === ORG_BODY_ID)?.text ?? item.body;
  const bg = useBackgroundCard(bgMode ? activeTemplate : null, plainCardText(layout.headline) || item.headline, bgBody, CARD_MAX_BYTES, live?.draft.id ?? item.id);
  // The drawing is on the server already: uploaded in this session, or recorded for this draft and card URL
  const bgRecord = bgMode && live?.draft.card.custom ? bgStore.read(live.draft.id) : null;
  const bgSynced =
    bg.status === "ready" &&
    ((bgUploaded?.id === item.id && bgUploaded.key === bg.key) || (!!bgRecord && bgRecord.cardUrl === live?.draft.card.url && bgRecord.hash === keyHash(bg.key)));
  const bgFrame = { w: bg.card?.width ?? activeTemplate?.width ?? 1080, h: bg.card?.height ?? activeTemplate?.height ?? 1080 };
  const bgFrameWidth = Math.round(bgFrame.w * Math.max(0.05, Math.min(stage.w / bgFrame.w, stage.h / bgFrame.h)) * zoom);
  // Background cards and desk templates are still images, so a video story posts (and downloads) the card
  const exportsVideo = isVideo && !bgMode && !orgMode && !phase1;

  // The box is the post: its tag line is the hashtags and mentions, and what it reads as is what is copied,
  // counted, previewed and (split back into body and tags) saved.
  // The server takes a mention only when it was suggested for this draft or is a verified directory handle
  // (assertVerifiedMentions); the editor knows the suggestions, the handles the draft already carries, and the
  // handles this session added to the directory.
  const knownHandles = new Set(
    live ? [...live.draft.mentionSuggestions.map((m) => (m.handle.startsWith("@") ? m.handle : `@${m.handle}`)), ...live.draft.mentions, ...start.openMentions, ...added].map(tagKey) : [],
  );
  const accepts = (handle: string) => knownHandles.has(tagKey(handle)) && !refused.has(tagKey(handle));
  const readBox = (value: string, take: (handle: string) => boolean = accepts) => readPostBox(value, postFormat, { strict: !!live, accepts: live ? take : undefined });
  const pristine = start.pristine && text === start.pristine.text ? start.pristine : null;
  const postBox: PostBox = pristine
    ? { ...readBox(text), finalText: pristine.text, save: pristine.save, problem: null, overflow: false, unsavable: false }
    : readBox(text);
  const body = postBox.split.body;
  // The tags as saved (the server's own split while the box is untouched)
  const selectedHashtags = postBox.save.hashtags;
  const selectedMentions = postBox.save.mentions;
  // What the pickers show: the tag line as typed, a lone # or @ still being typed let through
  const shown = splitPost(text, { ...splitOpts, lenient: true });
  const hashtagRows = syncOptions(hashtags, shown.hashtags);
  const mentionRows = syncOptions(mentions, shown.mentions);
  const finalText = postBox.finalText;
  const used = countChars(finalText, platform);
  const overLimit = used > limits.text;
  // The live desk also keeps to what the server takes as tags
  const hashtagMax = live ? Math.min(limits.hashtags, SERVER_HASHTAGS_MAX) : limits.hashtags;
  const mentionMax = live ? Math.min(limits.mentions, SERVER_MENTIONS_MAX) : limits.mentions;
  const tooManyTags = postBox.overflow || selectedHashtags.length > hashtagMax || selectedMentions.length > mentionMax;
  const unsavable = !!live && postBox.unsavable;
  // Saving a post counts against the platform's daily cap
  const liveCap = desk?.counts.data?.cap ?? desk?.inbox.data?.cap;
  const cap = live && liveCap ? liveCap.cap : DAILY_CAP[platform];
  const today = new Date().toDateString();
  const postedToday = live ? (liveCap?.used ?? 0) : socialPosts.filter((p) => p.platform === platform && p.status !== "recalled" && new Date(p.postedAt).toDateString() === today).length;
  // Phase 1 has no daily cap, only a count of what was posted
  const capReached = !phase1 && postedToday >= cap;
  const alreadyPosted = !live && isLiveOn(socialPosts, item.id, platform);

  // Links multiply the cost of an X post, so the X formatter refuses them outright
  const url = isX ? findUrl(finalText) : null;
  const bgFailed = bgMode && bg.status === "error";
  const orgLoading = orgMode && !orgPicture;
  const canPost = canEdit && !busy && stale === null && !overLimit && !tooManyTags && !url && !capReached && !bgFailed && !orgLoading && !orgWaiting && !orgGone && !unsavable && body.trim().length > 0 && layout.headline.trim().length > 0;

  let blockedReason = "";
  if (takenBy) blockedReason = "Already posted";
  else if (live?.lease.kind === "held") blockedReason = `${live.lease.name} is working on this story`;
  else if (live?.lease.kind === "lost") blockedReason = "Claim the story again to post it";
  else if (live && stale !== null) blockedReason = "Someone else saved this story. Choose whose version to keep first";
  else if (!canEdit) blockedReason = "Your role can view posts but not publish them";
  else if (!body.trim()) blockedReason = `Write the ${meta.postNoun} first`;
  else if (!layout.headline.trim()) blockedReason = "The template needs a headline";
  else if (overLimit) blockedReason = `${used - limits.text} characters over the ${meta.short} limit`;
  else if (tooManyTags) blockedReason = "Too many hashtags or mentions selected";
  else if (unsavable) blockedReason = "The post is too long to save";
  else if (url) blockedReason = `Remove the link "${url}" first`;
  else if (capReached) blockedReason = `Today's ${meta.short} cap of ${cap} posts is reached`;
  else if (orgLoading) blockedReason = orgImage.error ? `${orgTpl.label} didn't load. Try again from the card` : `${orgTpl.label} is still loading`;
  else if (orgWaiting) blockedReason = orgFailed ? "The card designs didn't load. Retry from the card" : "The card design is still loading";
  else if (orgGone) blockedReason = "This card's design was deleted. Pick another design first";
  else if (bgFailed) blockedReason = `The card on ${bgName} didn't draw. Use the automatic card instead`;

  const patch = (changes: Partial<TemplateLayout>) => setLayout((l) => ({ ...l, ...changes }));

  // ── Undo and redo: the card design, post text, hashtags, mentions, photo and card source together ──
  // A version is kept once nothing has changed for a moment, so a run of arrow presses is one step
  const sameAs = (a: Snapshot) =>
    a.layout === layout && a.text === text && a.hashtags === hashtags && a.mentions === mentions && a.mediaIndex === mediaIndex && a.cardSource === cardSource;
  useEffect(() => {
    const timer = setTimeout(() => {
      setHistory((h) => {
        const top = h.stack[h.index];
        if (top.layout === layout && top.text === text && top.hashtags === hashtags && top.mentions === mentions && top.mediaIndex === mediaIndex && top.cardSource === cardSource) return h;
        const stack = [...h.stack.slice(0, h.index + 1), { layout, text, hashtags, mentions, mediaIndex, cardSource }].slice(-80);
        return { stack, index: stack.length - 1 };
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [layout, text, hashtags, mentions, mediaIndex, cardSource]);
  const current = history.stack[history.index];
  const pendingChange = !sameAs(current);
  const canUndo = pendingChange || history.index > 0;
  const canRedo = !pendingChange && history.index < history.stack.length - 1;
  const restore = (snap: Snapshot) => {
    setLayout(snap.layout);
    setText(snap.text);
    setHashtags(snap.hashtags);
    setMentions(snap.mentions);
    setCardSource(snap.cardSource);
    if (snap.mediaIndex !== mediaIndex) {
      // As choosing the photo: the new file reports its own length
      setMediaIndex(snap.mediaIndex);
      setDuration(0);
      setSegments([]);
      setSelectedClip(null);
      playhead.set(0);
    }
  };
  const undo = () => {
    if (pendingChange) {
      // Keep the change not yet recorded so redo can bring it back
      setHistory((h) => ({ stack: [...h.stack.slice(0, h.index + 1), { layout, text, hashtags, mentions, mediaIndex, cardSource }], index: h.index }));
      restore(current);
    } else if (history.index > 0) {
      setHistory((h) => ({ ...h, index: h.index - 1 }));
      restore(history.stack[history.index - 1]);
    }
  };
  const redo = () => {
    if (!canRedo) return;
    setHistory((h) => ({ ...h, index: h.index + 1 }));
    restore(history.stack[history.index + 1]);
  };

  // ── Text: the headline or one of the extra text boxes ──
  const accent = accentFor(layout, item.tag);
  const layerId = selection?.startsWith("layer:") ? selection.slice(6) : null;
  const activeLayer = layerId ? layout.layers?.find((l) => l.id === layerId) : undefined;
  const headlineStyle = resolveHeadlineStyle(layout, item.tag);
  const textStyle = activeLayer ? resolveLayerStyle(activeLayer) : headlineStyle;

  const patchLayer = (id: string, changes: Partial<CardTextLayer>) => setLayout((l) => ({ ...l, layers: (l.layers ?? []).map((x) => (x.id === id ? { ...x, ...changes } : x)) }));

  /** Applies a style change to whichever text is being edited. Headline alignment and colour live on the layout itself. */
  const styleText = (changes: Partial<CardTextStyle>) => {
    if (activeLayer) {
      patchLayer(activeLayer.id, { style: { ...activeLayer.style, ...changes } });
      return;
    }
    const { align, color, ...rest } = changes;
    setLayout((l) => ({ ...l, ...(align ? { align } : {}), ...(color ? { color } : {}), headlineStyle: { ...l.headlineStyle, ...rest } }));
  };

  const textValue = activeLayer ? activeLayer.text : layout.headline;
  const setTextValue = (value: string) => (activeLayer ? patchLayer(activeLayer.id, { text: value }) : patch({ headline: value.slice(0, CARD_TEXT_MAX) }));

  const select = (next: CanvasSelection) => {
    setSelection(next);
    if (next === "headline" || next?.startsWith("layer:")) setTool("text");
    if (next === "background") setTool("background");
  };

  /** Types in the text right on the card (every word selected); the Text panel only shows its style, it never takes the focus */
  const editText = (target: CanvasSelection = "headline") => {
    select(target);
    const canvas = canvasRef.current;
    if (canvas && (target === "headline" || target?.startsWith("layer:"))) {
      canvas.editText(target as Exclude<CanvasSelection, "background" | null>, "all");
      return;
    }
    // No card drawn here (your X background): the panel's box is where the words are typed
    setTimeout(() => {
      headlineInputRef.current?.focus();
      headlineInputRef.current?.select();
    }, 0);
  };

  /** Wraps the words selected in the text box in ** so they take the highlight colour. */
  const highlightSelection = () => {
    const input = headlineInputRef.current;
    if (!input || input.selectionStart === input.selectionEnd) {
      setNotice("Select the words to highlight in the text box first.");
      return;
    }
    const { selectionStart: a, selectionEnd: b, value } = input;
    setTextValue(`${value.slice(0, a)}**${value.slice(a, b).replace(/\*\*/g, "")}**${value.slice(b)}`);
  };

  const addLayer = (preset: (typeof LAYER_PRESETS)[number]) => {
    const id = newLayerId();
    const count = layout.layers?.length ?? 0;
    const base: CardTextStyle = preset.id === "label" ? { ...preset.style, boxColor: accent, color: inkOn(accent) } : preset.style;
    // On a desk template a new text box starts in the card's face (Mardoto Bold), like the headline and story
    const style: CardTextStyle = layout.orgTemplate ? { ...base, font: ORG_CARD_FONT, weight: 700 } : base;
    const layer: CardTextLayer = { id, text: preset.text, x: 0.5, y: Math.min(0.85, 0.32 + count * 0.07), width: preset.width, size: preset.size, style };
    setLayout((l) => ({ ...l, layers: [...(l.layers ?? []), layer] }));
    editText(`layer:${id}`);
  };

  const removeLayer = (id: string) => {
    setLayout((l) => ({ ...l, layers: (l.layers ?? []).filter((x) => x.id !== id) }));
    setSelection(null);
  };

  const duplicateLayer = (id: string) => {
    const source = layout.layers?.find((x) => x.id === id);
    if (!source) return;
    const copy = { ...source, id: newLayerId(), x: Math.min(0.95, source.x + 0.03), y: Math.min(0.95, source.y + 0.03) };
    setLayout((l) => ({ ...l, layers: [...(l.layers ?? []), copy] }));
    setSelection(`layer:${copy.id}`);
  };

  /** Moves a text box one step up or down the stack */
  const restack = (id: string, step: 1 | -1) =>
    setLayout((l) => {
      const layers = [...(l.layers ?? [])];
      const i = layers.findIndex((x) => x.id === id);
      const j = i + step;
      if (i < 0 || j < 0 || j >= layers.length) return l;
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...l, layers };
    });

  const resetTextStyle = () => {
    // On a desk template the story and the headline go back to the template's own look
    if (orgMode && activeLayer?.id === ORG_BODY_ID) {
      patchLayer(activeLayer.id, { style: { ...BODY_STYLE, color: orgTpl.layout.body.color } });
      return;
    }
    if (orgMode && !activeLayer) {
      setLayout((l) => ({ ...l, headlineStyle: {}, color: orgTpl.layout.headline.color, align: "center" }));
      return;
    }
    if (activeLayer) {
      const preset = LAYER_PRESETS.find((p) => p.size === activeLayer.size) ?? LAYER_PRESETS[0];
      patchLayer(activeLayer.id, { style: preset.style });
    } else {
      const t = templateById(layout.template);
      setLayout((l) => ({ ...l, headlineStyle: {}, color: "auto", align: t.align ?? "left", fontScale: 1 }));
    }
  };

  const textSize = activeLayer
    ? { value: activeLayer.size, min: 16, max: 240, step: 1, format: (v: number) => `${v}`, onChange: (size: number) => patchLayer(activeLayer.id, { size }) }
    : { value: layout.fontScale, min: 0.5, max: 1.8, step: 0.01, format: (v: number) => `${Math.round(v * 100)}%`, onChange: (fontScale: number) => patch({ fontScale }) };
  const nudgeSize = (direction: 1 | -1) => textSize.onChange(steppedTextSize(textSize.value, direction, textSize.min, textSize.max, textSize.step));

  // ── Video: when each text shows, how it comes in, and the playhead ──
  const keptFrom = segments[0]?.start ?? 0;
  const keptTo = segments[segments.length - 1]?.end ?? duration;
  const seek = (t: number) => {
    canvasRef.current?.seek(t);
    playhead.set(t);
  };

  const setMotion = (key: string, changes: Partial<TextMotion>) =>
    setLayout((l) =>
      key === "headline"
        ? { ...l, headlineMotion: { ...l.headlineMotion, ...changes } }
        : { ...l, layers: (l.layers ?? []).map((x) => (`layer:${x.id}` === key ? { ...x, motion: { ...x.motion, ...changes } } : x)) },
    );

  const textKey = activeLayer ? `layer:${activeLayer.id}` : "headline";
  const textMotion = activeLayer ? activeLayer.motion : layout.headlineMotion;
  const textOnScreen = textSpan(textMotion, keptFrom, keptTo);

  /** Plays a text's entrance from the start so a new animation can be seen */
  const replayText = (motion: TextMotion | undefined) => {
    seek(textSpan(motion, keptFrom, keptTo).start);
    setVideoPaused(false);
  };

  const timelineTexts: TimelineText[] = [
    { key: "headline", label: layout.headline.replace(/\*\*/g, "").trim().slice(0, 48) || "Card text", motion: layout.headlineMotion },
    ...(layout.layers ?? []).map((l, i) => ({ key: `layer:${l.id}`, label: l.text.replace(/\*\*/g, "").trim().slice(0, 48) || `Text ${i + 1}`, motion: l.motion })),
  ];

  const selectTimelineText = (key: string) => {
    select(key as CanvasSelection);
    // Bring the text on screen if the playhead is outside its span
    const text = timelineTexts.find((t) => t.key === key);
    const span = textSpan(text?.motion, keptFrom, keptTo);
    const time = playhead.get();
    if (time < span.start || time > span.end) seek(Math.min(span.end, span.start + ENTER_SECONDS));
  };

  const adjust = layout.adjust ?? {};
  const setAdjust = (changes: Partial<MediaAdjust>) => setLayout((l) => ({ ...l, adjust: { ...l.adjust, ...changes } }));
  const adjusted = !!layout.flipX || (!!adjust.filter && adjust.filter !== "none") || ADJUSTMENTS.some((a) => adjust[a.key]);
  const lookThumb = media.posterUrl ?? (media.kind === "image" ? media.url : undefined);

  /** Moves the selected text box by a share of the card; a headline that follows its text moves only up and down */
  const nudgeSelected = (dx: number, dy: number) => {
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    if (activeLayer) patchLayer(activeLayer.id, { x: clamp(activeLayer.x + dx), y: clamp(activeLayer.y + dy) });
    else if (layout.textHeight !== undefined) patch(dx ? { textX: clamp((layout.textX ?? 0.5) + dx) } : { textY: clamp(layout.textY + dy) });
    else if (dy) patch({ textY: Math.max(0.05, Math.min(0.95, layout.textY + dy)) });
  };

  const chooseMedia = (index: number) => {
    setMediaIndex(index);
    setSelection("background");
    setDuration(0);
    setSegments([]);
    setSelectedClip(null);
    playhead.set(0);
    // On a desk template, choosing a photo puts it on the card
    patch({ bgZoom: 1, bgX: 0, bgY: 0, ...(orgMode && !layout.photoBox ? { photoBox: newPhotoBox() } : {}) });
  };

  // ── Desk template: the photo frame, and where the template puts the words ──
  const near = (a: number | undefined, b: number | undefined, tol = 0.002) => a !== undefined && b !== undefined && Math.abs(a - b) <= tol;
  /** A photo frame for a desk template: 60% of the card wide, 4:3, a little above the middle */
  const newPhotoBox = () => {
    const w = 0.6;
    const h = Math.min(0.6, (w * frame.w * 0.75) / frame.h);
    return { x: (1 - w) / 2, y: Math.max(0, 0.42 - h / 2), w, h };
  };
  const addPhoto = () => {
    setLayout((l) => (l.photoBox ? l : { ...l, photoBox: newPhotoBox(), bgZoom: 1, bgX: 0, bgY: 0 }));
    setSelection("background");
  };
  const removePhoto = () => {
    setLayout((l) => ({ ...l, photoBox: undefined }));
    setSelection(null);
  };
  /** Where the template puts the headline, story and date for the words on the card now */
  const orgHome = () =>
    orgTpl ? orgPlacement(orgTpl, { headline: layout.headline, body: orgBodyText(layout, item.body) }, { head: layout.headlineStyle?.font ?? ORG_CARD_FONT, body: layout.layers?.find((l) => l.id === ORG_BODY_ID)?.style.font, date: layout.layers?.find((l) => l.id === ORG_DATE_ID)?.style.font, headWeight: layout.headlineStyle?.weight, bodyWeight: layout.layers?.find((l) => l.id === ORG_BODY_ID)?.style.weight }) : null;

  const handleDuration = (seconds: number) => {
    setDuration(seconds);
    setSegments(clipsFor(draft, media.fileName, seconds));
  };

  const exportVideo = async (): Promise<boolean> => {
    if (!segments.length || exporting !== null) return false;
    setSelection(null);
    setVideoPaused(false);
    setExporting(0);
    const blob = await canvasRef.current?.record(segments, setExporting);
    setExporting(null);
    if (!blob) {
      setNotice("This browser or media file does not allow video export, so nothing was saved.");
      return false;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = downloadName(blob.type.includes("mp4") ? "mp4" : "webm", format);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
    if (!kind) {
      setNotice("Choose an image or a video file.");
      return;
    }
    const url = URL.createObjectURL(file);
    objectUrls.current.push(url);
    setUploads((prev) => [...prev, { kind, url, fileName: file.name }]);
    chooseMedia(mediaList.length);
  };

  // ── The post box: typing in it and the pickers keep each other in step ──
  // Typing only changes the text; the pickers' ticks (and rows for typed tags) are read from it.
  /** Leaving the box (or copying): an edited box takes the exact layout that is copied and saved */
  const settleBox = () => {
    if (!canEdit || pristine) return;
    if (text !== finalText) setText(finalText);
  };
  /** A picker tick or untick rewrites the tag line: tags already there keep their order, new ones go last */
  const pickTags = (kind: "#" | "@", options: TagOption[]) => {
    const ticked = checkedValues(options);
    const inBox = kind === "#" ? shown.hashtags : shown.mentions;
    const keep = new Set(ticked.map(tagKey));
    const kept = inBox.filter((v) => keep.has(tagKey(v)));
    const had = new Set(kept.map(tagKey));
    const next = [...kept, ...ticked.filter((v) => !had.has(tagKey(v)))];
    setText(postFormat(shown.body, kind === "#" ? next : shown.hashtags, kind === "@" ? next : shown.mentions));
    if (kind === "#") setHashtags(pickerRows(options));
    else setMentions(pickerRows(options));
  };

  /** Shortens the body only; the tag line stays exactly as it is */
  const makeCrisp = () => {
    const tagBudget = shown.tail ? countChars(shown.tail, platform) + 2 : 0;
    const budget = limits.text - tagBudget;
    const source = countChars(shown.body.trim(), platform) > budget ? shown.body : item.shortText;
    setText(withBody(text, shortenToFit(source, Math.min(budget, isX ? 200 : 400), platform), splitOpts));
  };


  const buildPayload = (): PostPayload => {
    const cover = item.media[0];
    return {
      newsId: item.id,
      platform,
      headline: item.headline,
      text: finalText,
      caption: body,
      hashtags: selectedHashtags,
      mentions: selectedMentions,
      mediaKind: media.kind,
      thumbUrl: canvasRef.current?.snapshot(320) ?? media.posterUrl ?? cover.posterUrl ?? cover.url,
      postedBy: roleLabel,
      format,
      mediaFile: media.fileName,
      layout,
      clipSegments: media.kind === "video" && segments.length ? segments : undefined,
    };
  };

  // Operators post by hand: Copy puts the post text on the clipboard, Save downloads the card or clip
  // and marks the story posted, which is what moves it to Published and counts against the cap.
  const copyText = async () => {
    settleBox();
    try {
      await navigator.clipboard.writeText(finalText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice("The browser blocked the clipboard. Select the text in the box and copy it by hand.");
    }
  };

  /** Saves the card on the canvas as an image ("saved", or why not) */
  const downloadCardImage = async (): Promise<CardExport> => (await canvasRef.current?.download(downloadName("png", format))) ?? "failed";

  /** Saves the card drawn on the operator's X background. */
  const downloadBackgroundCard = async () => {
    try {
      const { card } = await bg.whenReady();
      const link = document.createElement("a");
      link.href = card.url;
      link.download = downloadName("png");
      link.click();
      return true;
    } catch {
      return false;
    }
  };

  const saveAsPosted = async () => {
    if (!canPost || inFlight.current) return;
    inFlight.current = "posted";
    try {
      await saveAsPostedNow();
    } finally {
      inFlight.current = null;
    }
  };
  const saveAsPostedNow = async () => {
    // Live: the operator posts the downloaded card by hand, then gives the desk the post's link
    if (live) {
      const saved = exportsVideo ? await exportVideo() : bgMode ? await downloadBackgroundCard() : await downloadCardImage();
      if (saved !== true && saved !== "saved" && !exportsVideo) setNotice(saved === "failed" ? CARD_IMAGE_FAILED : "This media file does not allow image export from the browser. Download the card from Preview, or post with Post to X.");
      setLinkOpen(true);
      return;
    }
    const saved = isVideo ? await exportVideo() : await downloadCardImage();
    if (saved !== true && saved !== "saved") {
      if (!isVideo) setNotice(saved === "failed" ? CARD_IMAGE_FAILED : "This media file does not allow image export from the browser, so nothing was saved.");
      return;
    }
    publishSocialPost(buildPayload());
    setPreviewOpen(false);
    onSaved?.(`Saved. "${item.headline}" is marked as posted on ${meta.short}.`);
    onClose();
  };

  const stamp = () => setSavedAt(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }));

  const save = () => {
    if (inFlight.current) return;
    if (live) {
      void runLive("save", async () => {
        await flush();
        stamp();
      });
      return;
    }
    saveDraft(buildPayload());
    setMockSaved({ text, layout, hashtags, mentions });
    stamp();
  };

  // ── Live desk: every change goes to the server with the version it was based on ──
  const versionRef = useRef(live?.draft.version ?? 0);
  const liveVersion = live?.draft.version;
  useEffect(() => {
    if (liveVersion !== undefined) versionRef.current = liveVersion;
  }, [liveVersion]);
  const adopt = (d: DraftView) => {
    versionRef.current = d.version;
    draftRef.current = d;
    live?.onDraft(d);
  };

  /** Turns a failed call into the right status: a claim problem, a version clash, or a message. */
  const liveFail = (err: unknown) => {
    const code = errorCode(err);
    const data = (err as { data?: { current?: { version?: number }; heldBy?: string } }).data;
    if (code === "stale_version") setStale(typeof data?.current?.version === "number" ? data.current.version : versionRef.current);
    else if (code === "lease_lost") live?.onLeaseLost();
    else if (code === "held_by_other") live?.onHeldBy(String(data?.heldBy ?? "Someone"));
    else setNotice(code ? errorText(err) : err instanceof Error ? err.message : errorText(err));
  };

  // Text and headline as the server should have them
  const cardHeadline = plainCardText(layout.headline).slice(0, 400);
  const livePatch = live
    ? { ...postBox.save, cardHeadline: cardHeadline || draftCardHeadline(live.draft.cardHeadline, live.draft) }
    : null;
  const serverPatch = live ? { bodyText: live.draft.bodyText, cardHeadline: draftCardHeadline(live.draft.cardHeadline, live.draft), hashtags: live.draft.hashtags, mentions: live.draft.mentions } : null;
  const patchKey = JSON.stringify(livePatch);
  // Dirty when the post the server would assemble, or the headline, differs; the same words split another
  // way (a draft whose body already ends in tags) is not a change, so opening a story saves nothing
  const textDirty =
    !!livePatch &&
    !!serverPatch &&
    (livePatch.cardHeadline !== serverPatch.cardHeadline ||
      assemblePost(livePatch.bodyText, livePatch.hashtags, livePatch.mentions) !== assemblePost(serverPatch.bodyText, serverPatch.hashtags, serverPatch.mentions));

  // The card: the server's automatic card posts until the design here is changed, then this canvas does
  // On the X background the drawn card is always the one that posts; the design here does not apply
  // A desk template is always this editor's card; picking one counts as choosing it, like picking the X background
  const designEdited = !!live && !bgMode && (cardTouched || (orgMode && cardSource !== null));
  const cardSynced =
    (!!uploaded && uploaded.layout === layout && uploaded.url === media.url) ||
    // Reopened with the design this browser last sent, unchanged (and its date still today's)
    (orgMode && start.savedDesign && !start.dateStale && !cardTouched);
  const ownCard = bgMode || orgMode || designEdited || !!live?.draft.card.custom;
  // The card goes up only when the operator means it: Post, Save draft, Save as posted, or leaving after
  // changing the card here (its words or design, or picking the X background over a card made elsewhere)
  const cardChosen = cardTouched || cardSource !== null;
  const cardUnsent = bgMode ? cardChosen && !bgSynced : designEdited && !cardSynced;
  // The server's draft as of the last answer, for calls queued behind others
  const liveDraft = live?.draft;
  const draftRef = useRef(liveDraft);
  useEffect(() => {
    if (liveDraft) draftRef.current = liveDraft;
  }, [liveDraft]);

  // One server call at a time, in order, so versions never cross
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.current.then(fn, fn);
    chain.current = next.catch(() => undefined);
    return next;
  };

  /** Tag-line handles the directory doesn't have yet, once each (refused ones and recent failures left out) */
  const newHandles = () => {
    // Not during a version clash, and only handles typed here: one already on the server's tag line (kept as
    // plain text by an earlier save) is left alone, so opening a story and leaving adds nothing
    if (!live || postBox.overflow || stale !== null) return [];
    const onServer = new Set(splitPost(start.pristine?.text ?? start.text, splitOpts).mentions.map(tagKey));
    const fresh = new Map<string, string>();
    for (const m of postBox.split.mentions) {
      const k = tagKey(m);
      if (!accepts(m) && !onServer.has(k) && !addedNow.current.has(k) && !refused.has(k) && !addCoolingDown(addFailed.current, k)) fresh.set(k, m);
    }
    return [...fresh.values()];
  };

  /**
   * Adds handles to the handle directory, in parallel; resolves to the keys that went in. A failure is silent:
   * that handle stays plain text on the tag line, as before (400/403 not retried this session, others after a minute).
   */
  const addHandles = async (handles: string[]): Promise<Set<string>> => {
    const results = await Promise.all(
      handles.map(async (h) => {
        const k = tagKey(h);
        try {
          await socia.addDeskHandle(h);
          return k;
        } catch (err) {
          const status = (err as { status?: unknown }).status;
          addFailed.current.set(k, status === 400 || status === 403 ? Infinity : Date.now() + 60_000);
          return null;
        }
      }),
    );
    const ok = new Set(results.filter((k): k is string => k !== null));
    ok.forEach((k) => addedNow.current.add(k));
    if (ok.size) setAdded((prev) => new Set([...prev, ...ok]));
    return ok;
  };

  /**
   * `addNew`: a handle on the tag line that Socia doesn't know goes into the handle directory first, so the
   * post keeps it as a mention. Only on a deliberate save (Post, Save draft, leaving); the typing autosave
   * passes false so a half-typed handle never lands in the directory.
   */
  const saveText = async (addNew = true) => {
    if (!live || !canEdit || !livePatch) return;
    const fresh = addNew ? newHandles() : [];
    // Handles an earlier (or queued) save added count as known even before this render has them
    const inDirectory = (h: string) => addedNow.current.has(tagKey(h)) && !refused.has(tagKey(h));
    const lifts = () => postBox.split.mentions.some((m) => !accepts(m) && inDirectory(m));
    // The autosave may already have saved the tag line as plain text: still worth a save to make it mentions
    if (!textDirty && !fresh.length && !lifts()) return;
    // Never send what the API refuses; leaving or posting stops with this reason instead
    if (unsavable) throw new Error(postBox.problem ?? "The post is too long to save.");
    if (fresh.length) await addHandles(fresh);
    const take = (h: string) => accepts(h) || inDirectory(h);
    const lifted = !postBox.overflow && lifts();
    if (!textDirty && !lifted) return;
    const patch = lifted ? { ...readBox(text, take).save, cardHeadline: livePatch.cardHeadline } : livePatch;
    try {
      adopt(await socia.saveDraft(live.draft.id, { version: versionRef.current, ...patch }));
    } catch (err) {
      if (errorCode(err) !== "bad_mention" || !patch.mentions.length) throw err;
      // A handle the server doesn't take: keep the tag line as plain text (same post) and save again at once
      const named = (err as { data?: { handles?: unknown } }).data?.handles;
      const bad = Array.isArray(named) && named.length ? named.map((h) => tagKey(`@${String(h).replace(/^@/, "")}`)) : patch.mentions.map(tagKey);
      const nowRefused = new Set([...refused, ...bad]);
      setRefused(nowRefused);
      const plain = readBox(text, (h) => take(h) && !nowRefused.has(tagKey(h))).save;
      adopt(await socia.saveDraft(live.draft.id, { version: versionRef.current, ...plain, cardHeadline: livePatch.cardHeadline }));
    }
  };

  /**
   * Sends the card when it changed here. `always` (phase 1 Copy & Mark Posted) sends the card on screen even if
   * untouched, since phase 1 has no automatic card; it then resolves to the PNG for the operator's download
   * (null when the card already on the server is the one shown).
   */
  const uploadOwnCard = async (always = false): Promise<Blob | null> => {
    if (!live || !canEdit) return null;
    if (always && serverView) return null;
    if (bgMode) {
      const current = draftRef.current ?? live.draft;
      const id = current.id;
      // Only a drawing made for this draft may go up as its card
      const drawn = await bg.whenReady(id);
      const hash = keyHash(drawn.key);
      const record = bgStore.read(id);
      // Same drawing as the card already on the server: nothing to send
      if (current.card.custom && record?.hash === hash && record.cardUrl === current.card.url) return drawn.card.blob;
      const d = await socia.uploadCard(id, versionRef.current, drawn.card.blob);
      adopt(d);
      bgStore.write(id, { hash, cardUrl: d.card.url ?? "" });
      setBgUploaded({ id, key: drawn.key });
      // Reopening draws on the background again rather than restoring an older design
      designStore.write(d.id, null);
      return drawn.card.blob;
    }
    // A desk template goes up with Post or Save draft even untouched: the server's automatic card is another design
    if (!always && (orgMode ? cardSynced : !designEdited || cardSynced)) return null;
    // Never send a desk-template card drawn without its picture
    if (orgMode && !orgPicture) throw new Error(`${orgTpl.label} is still loading, so the card wasn't sent. Try again in a moment.`);
    // The design as exported, taken before any await so what is recorded is what was drawn
    const sent = { layout, url: media.url, mediaFile: media.fileName };
    const png = await canvasRef.current?.png(CARD_MAX_BYTES);
    if (!png) throw new Error(always ? "The browser couldn't export the card. Try another photo, or try again." : "The browser couldn't export your card, so the automatic card stays. Try another photo, or try again.");
    if (cardSynced) return png;
    const d = await socia.uploadCard(live.draft.id, versionRef.current, png);
    adopt(d);
    setUploaded({ layout: sent.layout, url: sent.url });
    designStore.write(d.id, { layout: sent.layout, mediaFile: sent.mediaFile, cardUrl: d.card.url });
    bgStore.write(d.id, null);
    return png;
  };

  /** Sends whatever is not on the server yet: text first, then the card (Post, Save draft, Save as posted). */
  const flush = () =>
    serial(async () => {
      await saveText();
      await uploadOwnCard();
    });

  /**
   * Leaving a story (close or switch): the text must save, or the operator stays. The card goes up only
   * if it was changed here, and a card that fails to draw or upload never keeps anyone in the story.
   * Resolves to a sentence about the card when it didn't go up, else null; throws when the text didn't save.
   */
  const flushForLeave = async (): Promise<string | null> => {
    await serial(saveText);
    if (!cardUnsent) return null;
    try {
      await serial(() => uploadOwnCard());
      return null;
    } catch (err) {
      const why = errorCode(err) ? errorText(err) : err instanceof Error ? err.message : errorText(err);
      return `Your text is saved, but the card didn't upload: ${why} Open the story again to send it.`;
    }
  };

  // The call running now, read synchronously: a held key or a double press can fire twice before `busy` renders
  const inFlight = useRef<string | null>(null);
  const runLive = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = kind;
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      liveFail(err);
    } finally {
      inFlight.current = null;
      setBusy(null);
    }
  };

  // Typing saves on its own after a pause (new handles wait for a deliberate save: they may be half-typed)
  useEffect(() => {
    if (!live || !canEdit || stale !== null || !textDirty || unsavable) return;
    const timer = setTimeout(() => void serial(() => saveText(false)).catch(liveFail), 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patchKey, canEdit, stale, textDirty, unsavable]);

  // The card drawn on the X background is not uploaded on its own: opening or reading a story changes
  // nothing on the server. It goes up with Post, Save draft or Save as posted, or on leaving after an edit.

  /** Approve: the server holds the post for its 10-second undo window, then the worker posts it. */
  const postLive = () =>
    runLive("post", async () => {
      if (!live || !canPost) return;
      await flush();
      let res: { jobId: string; sendAt: string } | null = null;
      for (let attempt = 0; !res; attempt++) {
        try {
          res = await socia.approveDraft(live.draft.id, versionRef.current);
        } catch (err) {
          // A new headline redraws the automatic card for a second or two
          if (errorCode(err) !== "card_not_ready" || attempt >= 6) throw err;
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      live.onFinished();
      desk?.addPending({ draftId: live.draft.id, jobId: res.jobId, sendAt: res.sendAt, headline: item.headline });
      setPreviewOpen(false);
      onClose();
    });

  // ── Phase 1: Copy & Mark Posted ──
  const canCopyPost = canPost && mayMarkPosted && !takenBy;

  /** Saves the posted card for the operator: the PNG just sent, else the card already on the server. */
  const downloadPostedCard = async (png: Blob | null): Promise<boolean> => {
    try {
      let blob = png;
      if (!blob) {
        const src = apiFileUrl((draftRef.current ?? live?.draft)?.card.url);
        if (!src) return false;
        const res = await fetch(src, { credentials: credentialsFor(src) });
        if (!res.ok) throw new Error(String(res.status));
        blob = await res.blob();
      }
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = downloadName("png");
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
      return true;
    } catch {
      return false;
    }
  };

  /**
   * Clipboard first, while the click still counts as the operator's; only once the text is on the clipboard
   * are the text and card sent and the story marked posted. A refused clipboard marks nothing.
   */
  const copyAndPost = async () => {
    if (!live || !copyMode || !canCopyPost || inFlight.current) return;
    inFlight.current = "copy";
    setBusy("copy");
    setNotPosted(null);
    const id = live.draft.id;
    const copiedText = finalText;
    settleBox();
    try {
      await navigator.clipboard.writeText(copiedText);
    } catch {
      inFlight.current = null;
      setBusy(null);
      setNotice("The browser blocked the clipboard. Select the text in the box and copy it by hand.");
      return;
    }
    try {
      const png = await serial(async () => {
        await saveText();
        return uploadOwnCard(true);
      });
      const res = await serial(() => socia.copyPosted(id, versionRef.current));
      // Both sides assemble the post the same way; say so if they ever differ rather than leave a wrong post
      if (res.text && res.text.trim() !== copiedText.trim()) onSaved?.("Marked posted, but the server's text differs from what was copied. Check the post on X.");
      const cardSaved = await downloadPostedCard(png);
      if (!cardSaved) onSaved?.("Posted, but the card didn't download. Open the story in Posted and save the card by hand.");
      live.onFinished();
      desk?.addCopied({ draftId: id, postId: res.postId, headline: item.headline, undoUntil: res.undoUntil, withCard: cardSaved });
      setPreviewOpen(false);
      // Stay in the studio: the next story in the queue's order (the posted one is now in Posted), stepping over
      // stories someone else is working on
      const after = onSwitch ? storyAfterPosted(workableOrder(queueOrder ?? desk?.queue ?? [], item.id, heldByOther), item.id) : undefined;
      if (after) {
        restApproveAfterAdvance();
        onSwitch?.(after);
      } else onClose();
    } catch (err) {
      // The clipboard holds a post the server didn't mark: empty it (best effort) and block with a banner. Not when
      // the server says this very draft was just posted from here: the clipboard then holds that good post.
      const justPostedHere = errorCode(err) === "already_posted" && !!desk?.pending.some((p) => p.copied && p.draftId === id);
      if (!justPostedHere) void navigator.clipboard?.writeText("").catch(() => undefined);
      if (errorCode(err) === "already_posted") {
        // 409 already_posted { postedBy, postedAt }; postedBy is the name (an object tolerated)
        const who = (err as { data?: { postedBy?: string | { name?: string } | null; postedAt?: string | null } }).data;
        const name = (typeof who?.postedBy === "string" ? who.postedBy : who?.postedBy?.name) || "someone";
        const at = who?.postedAt ? new Date(who.postedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
        setTakenBy(`Already posted by ${name}${at ? ` at ${at}` : ""}. Don't post it again.`);
        void desk?.refreshAll();
      } else {
        const code = errorCode(err);
        setNotPosted(code === "stale_version" ? "The post changed on the server before it was marked." : code ? errorText(err) : err instanceof Error ? err.message : errorText(err));
        liveFail(err);
      }
    } finally {
      inFlight.current = null;
      setBusy(null);
    }
  };

  /** Save as posted, live: records the link of a post made by hand. Resolves to an error for the dialog. */
  const markPostedLive = async (permalink: string): Promise<string | null> => {
    if (!live) return null;
    setBusy("posted");
    try {
      await flush();
      await socia.markPosted(live.draft.id, versionRef.current, permalink);
      live.onFinished();
      void desk?.refreshAll();
      setLinkOpen(false);
      setPreviewOpen(false);
      onSaved?.(`Saved. "${item.headline}" is marked as posted on ${meta.short}.`);
      onClose();
      return null;
    } catch (err) {
      const code = errorCode(err);
      if (code === "invalid" || code === "duplicate_post") return errorText(err);
      setLinkOpen(false);
      liveFail(err);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const rejectLive = (reason: RejectReason, note: string) =>
    runLive("reject", async () => {
      if (!live) return;
      await socia.rejectDraft(live.draft.id, reason, note || undefined);
      live.onFinished();
      void desk?.refreshAll();
      onSaved?.(rejectedNotice(item.headline));
      onClose();
    });

  /** Back to the server's automatic card. */
  const switchToAutoCard = () =>
    runLive("card", async () => {
      if (!live) return;
      // Decided inside the queue, on the draft as it is after any upload still in flight
      const d = await serial(async () => {
        const current = draftRef.current ?? live.draft;
        if (!current.card.custom) return current;
        const reset = await socia.resetCard(current.id, versionRef.current);
        adopt(reset);
        return reset;
      });
      designStore.write(d.id, null);
      bgStore.write(d.id, null);
      const fresh = defaultLayout(draftCardHeadline(d.cardHeadline, d), "x");
      setCardSource("design");
      setBgUploaded(null);
      // The automatic card stays: the design is not moved back onto a desk template
      setStart((s) => ({ ...s, layout: fresh, mediaIndex: 0, custom: false, noOrg: true }));
      setUploads([]);
      setMediaIndex(0);
      setLayout(fresh);
      setHistory({ stack: [{ layout: fresh, text, hashtags, mentions, mediaIndex: 0, cardSource: "design" }], index: 0 });
      setUploaded(null);
    });

  /** A version clash: take the server's draft as it is now, or keep this one and save over it. */
  const loadTheirs = () =>
    runLive("save", async () => {
      if (!live) return;
      const d = await socia.fetchDraft(live.draft.id);
      adopt(d);
      const box = openLive(d);
      setText(box.text);
      setHashtags(box.hashtags);
      setMentions(box.mentions);
      // Their text, untouched, is the server's own: nothing to save until it is edited
      setStart((s) => ({ ...s, pristine: box.pristine, openMentions: box.openMentions }));
      patch({ headline: draftCardHeadline(d.cardHeadline, d) });
      setStale(null);
    });
  const keepMine = () =>
    runLive("save", async () => {
      if (stale !== null) versionRef.current = stale;
      setStale(null);
      await flush();
    });

  const claimAgain = () => runLive("claim", async () => live?.claimAgain());

  /** Leaving the editor sends what is not saved yet, so nothing typed is lost. */
  const close = async () => {
    // New tag-line handles too: the autosave kept them as plain text until this deliberate save
    if (live && canEdit && (textDirty || cardUnsent || newHandles().length > 0)) {
      setBusy("save");
      let cardProblem: string | null = null;
      try {
        cardProblem = await flushForLeave();
      } catch (err) {
        setBusy(null);
        liveFail(err);
        return;
      }
      // The desk shows it after the editor closes
      if (cardProblem) onSaved?.(cardProblem);
    }
    onClose();
  };

  // ── Esc: close, asking first when something isn't saved ──
  const mockUnsaved = !live && edited && !(mockSaved && mockSaved.text === text && mockSaved.layout === layout && mockSaved.hashtags === hashtags && mockSaved.mentions === mentions);
  const unsaved = canEdit && (live ? textDirty || cardUnsent : mockUnsaved);
  const requestClose = () => {
    if (busy) return;
    if (unsaved) setLeaving(true);
    else void close();
  };
  const saveAndLeave = async () => {
    if (live) {
      // close() saves first, and stays open with the reason when the text didn't save
      await close();
      setLeaving(false);
      return;
    }
    saveDraft(buildPayload());
    onSaved?.(`Draft saved. "${item.headline}" is waiting in the queue.`);
    onClose();
  };
  const discardAndLeave = () => {
    setLeaving(false);
    onClose();
  };

  /**
   * Esc on the editor (MUI hands it over as the dialog's escapeKeyDown, after any dialog or menu on top has
   * taken its own). In a text box it only leaves the box, so the next Esc or an arrow reaches the editor.
   */
  const onEscape = (e: object) => {
    const event = e as Partial<KeyboardEvent>;
    event.preventDefault?.();
    const target = event.target ?? null;
    if (isTextEntryTarget(target)) {
      (target as HTMLElement).blur();
      return;
    }
    if (isEditorTypingTarget(target) || leaving || sheetOpen) return;
    requestClose();
  };

  // ── Posting that needs a second look asks first ──
  const tooClose = !!live?.draft.rewrite?.tooClose;
  const postNow = () => {
    setConfirmPost(null);
    // Live: approve, which holds the post for its 10-second undo window (phase 1: Copy & Mark Posted). Demo: Save as posted, the demo's post action.
    if (live && copyMode) void copyAndPost();
    else if (live) void postLive();
    else void saveAsPosted();
  };
  /** The Post button and Ctrl+Enter: a too-close rewording asks first; demo Ctrl+Enter (no undo window) always asks. */
  const requestPost = (via: "button" | "key") => {
    if (inFlight.current || approveResting()) return;
    if (tooClose) setConfirmPost("tooClose");
    else if (!live && via === "key") setConfirmPost("demo");
    else postNow();
  };

  // ── Ctrl+Enter: the Post button, with the same checks ──
  const approveByKey = () => {
    if (busy || exporting !== null || approveResting()) return;
    if (copyMode ? !mayMarkPosted : !mayPublish || (!live && !mayMarkPosted)) {
      setNotice(copyMode ? "Your role can't mark posts as posted." : "Your role can't post to the platforms.");
      return;
    }
    // Phase 1 without Copy & Mark Posted: nothing to post with from here
    if (live && !copyMode && !apiPosting) return;
    if (!(copyMode ? canCopyPost : canPost)) {
      setNotice(blockedReason ? `Not posted: ${blockedReason}.` : "This post can't go out right now.");
      return;
    }
    requestPost("key");
  };

  // ── Right-click on the card: options for what is under the pointer ──
  const hiddenLayers = (layout.layers ?? []).filter((l) => l.hidden);
  const showHidden: MenuEntry[] = hiddenLayers.length
    ? [{ label: `Show hidden text boxes (${hiddenLayers.length})`, icon: <Eye size={14} />, onSelect: () => setLayout((l) => ({ ...l, layers: (l.layers ?? []).map((x) => (x.hidden ? { ...x, hidden: undefined } : x)) })) }]
    : [];
  const generalEntries = (): MenuEntry[] => [
    { kind: "divider" },
    { label: "Undo", icon: <Undo2 size={14} />, hint: editorShortcut("edit.undo"), disabled: !canUndo, onSelect: undo },
    { label: "Redo", icon: <Redo2 size={14} />, hint: editorShortcut("edit.redo"), disabled: !canRedo, onSelect: redo },
    { kind: "divider" },
    { label: "Keyboard shortcuts", icon: <Keyboard size={14} />, hint: "?", onSelect: () => setSheetOpen(true) },
  ];
  const menuFor = (target: Exclude<CanvasSelection, null> | "stage"): MenuEntry[] => {
    const textOptions: MenuEntry[] = target === "headline" || target.startsWith("layer:") ? [
      ...(["left", "center", "right"] as const).map((align) => ({ label: `Align ${align}`, icon: ALIGN_ICONS[align], onSelect: () => styleText({ align }) })),
      { label: textStyle.uppercase ? "Normal case" : "Capitals", icon: <Type size={14} />, onSelect: () => styleText({ uppercase: !textStyle.uppercase }) },
      { kind: "divider" },
    ] : [];
    if (serverView) {
      const entries: MenuEntry[] = [];
      if (canEdit && (orgTemplates.length ? cardTemplate : activeTemplate)) entries.push({ label: useBgLabel, icon: <ImageIcon size={14} />, onSelect: useOwnBackground });
      if (canEdit) entries.push({ label: "Design the card here", icon: <Pencil size={14} />, onSelect: () => setCardSource("design") });
      return [...entries, ...generalEntries()];
    }
    if (bgMode) {
      const entries: MenuEntry[] = [{ label: "Change the headline", icon: <Type size={14} />, onSelect: () => setTool("text") }];
      if (canEdit) entries.push({ label: "Design the card here instead", icon: <Pencil size={14} />, disabled: !!busy, onSelect: () => void switchToAutoCard() });
      return [...entries, ...generalEntries()];
    }
    if (target.startsWith("layer:")) {
      const id = target.slice(6);
      const layers = layout.layers ?? [];
      const index = layers.findIndex((l) => l.id === id);
      const layer = layers[index];
      if (!layer) return menuFor("stage");
      const width = LAYER_PRESETS.find((p) => p.size === layer.size)?.width ?? 0.7;
      // The story and date boxes on a desk template go back to where the template puts them
      const placed = orgMode && (id === ORG_BODY_ID || id === ORG_DATE_ID) ? orgHome() : null;
      const home = placed ? (id === ORG_BODY_ID ? placed.body : placed.date) : null;
      return [
        { label: "Edit text", icon: <Pencil size={14} />, hint: "Click", onSelect: () => editText(`layer:${id}`) },
        ...textOptions,
        { kind: "divider" },
        { label: "Bring forward", icon: <ArrowUpToLine size={14} />, disabled: index >= layers.length - 1, onSelect: () => restack(id, 1) },
        { label: "Send backward", icon: <ArrowDownToLine size={14} />, disabled: index <= 0, onSelect: () => restack(id, -1) },
        { kind: "divider" },
        home
          ? { label: "Reset position", icon: <Move size={14} />, disabled: near(layer.x, home.x) && near(layer.y, home.y), onSelect: () => patchLayer(id, { x: home.x, y: home.y }) }
          : { label: "Reset position", icon: <Move size={14} />, disabled: layer.x === 0.5 && layer.y === 0.5, onSelect: () => patchLayer(id, { x: 0.5, y: 0.5 }) },
        home
          ? { label: "Reset size", icon: <Scaling size={14} />, disabled: near(layer.width, home.width) && near(layer.height, home.height) && near(layer.size, home.size, 0.5), onSelect: () => patchLayer(id, { width: home.width, height: home.height, size: home.size }) }
          : { label: "Reset size", icon: <Scaling size={14} />, disabled: layer.height === undefined && layer.width === width, onSelect: () => patchLayer(id, { width, height: undefined }) },
        {
          label: "Hide text box",
          icon: <EyeOff size={14} />,
          onSelect: () => {
            patchLayer(id, { hidden: true });
            setSelection(null);
          },
        },
        { label: "Duplicate", icon: <CopyPlus size={14} />, onSelect: () => duplicateLayer(id) },
        { label: "Delete text box", icon: <Trash2 size={14} />, hint: "Del", danger: true, onSelect: () => removeLayer(id) },
        ...generalEntries(),
      ];
    }
    if (target === "headline" && orgMode) {
      const home = orgHome()?.head;
      if (!home) return menuFor("stage");
      return [
        { label: "Edit text", icon: <Pencil size={14} />, hint: "Click", onSelect: () => editText("headline") },
        ...textOptions,
        { kind: "divider" },
        { label: "Reset position", icon: <Move size={14} />, disabled: near(layout.textX, home.textX) && near(layout.textY, home.textY), onSelect: () => patch({ textX: home.textX, textY: home.textY }) },
        { label: "Reset size", icon: <Scaling size={14} />, disabled: near(layout.textWidth, home.textWidth) && near(layout.textHeight, home.textHeight) && near(layout.fontScale, home.fontScale, 0.01), onSelect: () => patch({ textWidth: home.textWidth, textHeight: home.textHeight, fontScale: home.fontScale }) },
        ...generalEntries(),
      ];
    }
    if (target === "headline") {
      const home = templatePatch(templateById(layout.template), format).textY ?? DEFAULT_TEXT_Y[format];
      const sizedByHand = layout.textHeight !== undefined || layout.textWidth !== undefined;
      return [
        { label: "Edit text", icon: <Pencil size={14} />, hint: "Click", onSelect: () => editText("headline") },
        ...textOptions,
        { kind: "divider" },
        { label: "Reset position", icon: <Move size={14} />, disabled: layout.textY === home && layout.textX === undefined, onSelect: () => patch({ textY: home, textX: undefined }) },
        { label: "Reset size", icon: <Scaling size={14} />, disabled: !sizedByHand, onSelect: () => patch({ textWidth: undefined, textHeight: undefined, textX: undefined }) },
        ...generalEntries(),
      ];
    }
    if (target === "background") {
      const entries: MenuEntry[] = [
        { label: "Reset position", icon: <Move size={14} />, disabled: layout.bgZoom === 1 && !layout.bgX && !layout.bgY, onSelect: () => patch({ bgZoom: 1, bgX: 0, bgY: 0 }) },
        { label: layout.fit === "cover" ? "Show all of the picture" : "Fill the frame", icon: <Maximize size={14} />, onSelect: () => patch({ fit: layout.fit === "cover" ? "contain" : "cover", bgX: 0, bgY: 0 }) },
        { label: "Replace picture or video", icon: <Upload size={14} />, onSelect: () => fileInputRef.current?.click() },
      ];
      if (orgMode) entries.push({ label: "Remove photo from the card", icon: <Trash2 size={14} />, hint: "Del", danger: true, onSelect: removePhoto });
      if (showHidden.length) entries.push({ kind: "divider" }, ...showHidden);
      return [...entries, ...generalEntries()];
    }
    // The space around the card
    return [{ label: "Fit to screen", icon: <Maximize size={14} />, disabled: zoom === 1, onSelect: () => setZoom(1) }, ...showHidden, ...generalEntries()];
  };
  /** Shift+F10, the Menu key or the More button: the same menu, at the selected box (or the card) */
  const openCardMenuFromKeys = (from?: HTMLElement) => {
    const stage = stageAreaRef.current;
    const handle = stage?.querySelector<HTMLElement>('[data-handle="se"]');
    const frameEl = stage?.querySelector<HTMLElement>('[role="group"], img, canvas');
    const r = (from ?? handle ?? frameEl ?? stage)?.getBoundingClientRect();
    if (!r) return;
    const target: Exclude<CanvasSelection, null> | "stage" = bgMode || serverView ? "stage" : (selection ?? "stage");
    cardMenu.openAt(from ? { x: r.left, y: r.bottom + 4 } : handle ? { x: r.left, y: r.top } : { x: r.left + r.width / 2, y: r.top + r.height / 2 }, () => menuFor(target));
  };
  /** The stage's right-click: the canvas has already said what is under the pointer, else it is the space around the card */
  const openCardMenu = (e: React.MouseEvent) => {
    const target = menuTarget.current ?? "stage";
    menuTarget.current = null;
    cardMenu.open(e, () => menuFor(target));
  };

  // Prev / Next in the queue's order, for J / K below (set further down, where they are worked out)
  const storyNav = useRef<{ previousStory?: FtpNewsItem; nextStory?: FtpNewsItem; switchStory: (next: FtpNewsItem) => void } | null>(null);
  // ── Keyboard: one handler for every shortcut in editorKeys.ts ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const cmd = editorKeyFor(e);
      if (!cmd) return;
      // Another dialog, the preview or a menu on top owns the keyboard (MUI closes those with Esc itself)
      const covered = dialog !== null || linkOpen || sheetOpen || leaving || confirmPost !== null || previewOpen || cardMenu.isOpen;
      if (cmd.id === "post.save") {
        // Even while typing, and never the browser's "Save page"; a held key saves once
        e.preventDefault();
        if (!e.repeat && !covered && canEdit && !busy) save();
        return;
      }
      if (cmd.id === "post.approve") {
        e.preventDefault();
        if (!e.repeat && !covered) approveByKey();
        return;
      }
      // Undo and Redo also work from the text toolbar's buttons and menus, but a text box keeps its own undo
      const historyKey = (cmd.id === "edit.undo" || cmd.id === "edit.redo") && !isTextEntryTarget(e.target as HTMLElement);
      if ((isEditorTypingTarget(e.target) && !historyKey) || covered) return;
      // Delete, Backspace and the arrows act on the card only from the stage or from no control at all
      const onCanvas = !bgMode && !serverView && isCanvasKeyTarget(e.target, stageAreaRef.current);
      switch (cmd.id) {
        case "editor.close":
          // Focus outside the dialog (on the page body after a text box was left): MUI never saw this Esc
          onEscape(e);
          return;
        case "edit.undo":
          e.preventDefault();
          undo();
          return;
        case "edit.redo":
          e.preventDefault();
          redo();
          return;
        case "help.keys":
          e.preventDefault();
          setSheetOpen(true);
          return;
        case "story.next":
        case "story.prev": {
          // The queue's order, as Prev / Next; switching saves first
          const nav = storyNav.current;
          if (e.repeat || !nav) return;
          const target = cmd.id === "story.next" ? nav.nextStory : nav.previousStory;
          if (!target) return;
          e.preventDefault();
          nav.switchStory(target);
          return;
        }
        case "box.delete":
          if (onCanvas && orgMode && selection === "background" && layout.photoBox) {
            e.preventDefault();
            removePhoto();
            return;
          }
          if (!onCanvas || !layerId) return;
          e.preventDefault();
          removeLayer(layerId);
          return;
        case "box.menu":
          e.preventDefault();
          swallowNextContextMenu();
          openCardMenuFromKeys();
          return;
        case "box.nudge":
        case "box.nudgeBig": {
          if (!onCanvas || !(activeLayer || selection === "headline")) return;
          e.preventDefault();
          const step = cmd.id === "box.nudgeBig" ? NUDGE.big : NUDGE.small;
          const key = e.key.toLowerCase();
          nudgeSelected(key === "arrowleft" ? -step : key === "arrowright" ? step : 0, key === "arrowup" ? -step : key === "arrowdown" ? step : 0);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Below md the top bar is crowded (Instagram adds the format switch), so Copy
  // is icon-only and Save is shortened; full labels return from 900px
  const iconOnlyOnPhone = { flexShrink: 0, minWidth: { xs: 0, md: 64 }, "& .MuiButton-startIcon": { mr: { xs: 0, md: 1 }, ml: { xs: 0, md: -0.5 } } };
  const phoneLabel = (full: string, short?: string) => (
    <>
      <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>{full}</Box>
      {short && <Box component="span" sx={{ display: { xs: "inline", md: "none" } }}>{short}</Box>}
    </>
  );

  const postButton = (onDark: boolean) =>
    live && copyMode ? (
      <Tooltip title={!mayMarkPosted ? "Your role can't mark posts as posted" : blockedReason || `Copies the post, saves the card and moves the story to Posted${editorShortcutSuffix("post.approve")}`}>
        <span>
          <Button
            variant="contained"
            onClick={() => requestPost("button")}
            aria-label={busy === "copy" ? "Copying and marking posted" : "Copy & Mark Posted"}
            // "Post" on phones, where the full label doesn't fit the bar
            aria-keyshortcuts={ariaKeyShortcuts(keysById(EDITOR_KEYS, "post.approve"))}
            disabled={!canCopyPost}
            startIcon={busy === "copy" ? <CircularProgress size={14} sx={{ color: "#fff" }} /> : <ClipboardCopy size={16} />}
            sx={{ minHeight: 38, px: { xs: 1.25, md: 2 }, flexShrink: 0, fontSize: "0.875rem", fontWeight: 800, whiteSpace: "nowrap", backgroundColor: "#111", color: "#fff", border: onDark ? "2px solid #fff" : "2px solid #111", boxShadow: "0 0 0 3px rgba(255,255,255,0.12)", "&:hover": { backgroundColor: "#2a2a2a" }, "&.Mui-disabled": { backgroundColor: "rgba(17,17,17,0.35)", color: "rgba(255,255,255,0.7)", borderColor: "rgba(255,255,255,0.35)" } }}
          >
            {phoneLabel("Copy & Mark Posted", "Post")}
          </Button>
        </span>
      </Tooltip>
    ) : live && apiPosting ? (
      <Tooltip title={!mayPublish ? "Your role can't post to the platforms" : blockedReason || `Posts the card to ${meta.short} after a 10-second undo window${editorShortcutSuffix("post.approve")}`}>
        <span>
          <Button
            variant="contained"
            onClick={() => requestPost("button")}
            aria-label={busy === "post" ? "Posting" : `Post to ${meta.short}`}
            aria-keyshortcuts={ariaKeyShortcuts(keysById(EDITOR_KEYS, "post.approve"))}
            disabled={!canPost || !mayPublish}
            startIcon={busy === "post" ? <CircularProgress size={14} sx={{ color: "#fff" }} /> : <Send size={15} />}
            sx={{ minHeight: 34, fontWeight: 700, whiteSpace: "nowrap", backgroundColor: "#111", color: "#fff", "&:hover": { backgroundColor: "#333" }, "&.Mui-disabled": { backgroundColor: "rgba(17,17,17,0.35)", color: "rgba(255,255,255,0.7)" } }}
          >
            {onDark ? phoneLabel(`Post to ${meta.short}`, "Post") : `Post to ${meta.short}`}
          </Button>
        </span>
      </Tooltip>
    ) : null;

  // On the live desk Post to X is the main action, so Save as posted takes the quieter style of Copy
  const savePostedSx = { minHeight: 34, fontWeight: 700, whiteSpace: "nowrap", backgroundColor: "#111", color: "#fff", "&:hover": { backgroundColor: "#333" }, "&.Mui-disabled": { backgroundColor: "rgba(17,17,17,0.35)", color: "rgba(255,255,255,0.7)" } };

  const actionButtons = (onDark: boolean) => (
    <>
      <Tooltip title={copied ? "Copied" : `Copy the ${meta.postNoun} with hashtags and mentions`}>
        <Button onClick={copyText} aria-label={copied ? "Copied" : "Copy"} startIcon={copied ? <Check size={15} /> : <Copy size={15} />} sx={onDark ? { ...chromeButton, border: `1px solid ${BAR.border}`, ...iconOnlyOnPhone } : { minHeight: 34 }} variant={onDark ? "text" : "outlined"}>
          {onDark ? phoneLabel(copied ? "Copied" : "Copy") : copied ? "Copied" : "Copy"}
        </Button>
      </Tooltip>
      {!phase1 && (
      <Tooltip title={!mayMarkPosted ? "Your role can't save posts as posted" : blockedReason || (live ? `Downloads the ${exportsVideo ? "clip" : "card"} to post by hand, then asks for the post's link` : `Downloads the ${isVideo ? "clip" : "card"} and marks this story posted on ${meta.short}`)}>
        <span>
          <Button
            variant={live ? (onDark ? "text" : "outlined") : "contained"}
            onClick={saveAsPosted}
            aria-label={exporting !== null ? `Saving ${Math.round(exporting * 100)}%` : alreadyPosted ? "Save again" : "Save as posted"}
            disabled={!canPost || !mayMarkPosted || exporting !== null}
            startIcon={exporting !== null ? <CircularProgress size={14} sx={{ color: live ? "inherit" : "#fff" }} variant="determinate" value={Math.max(4, exporting * 100)} /> : <Save size={15} />}
            sx={live ? (onDark ? { ...chromeButton, border: `1px solid ${BAR.border}`, whiteSpace: "nowrap", "&.Mui-disabled": { color: "rgba(255,255,255,0.4)" } } : { minHeight: 34, whiteSpace: "nowrap" }) : savePostedSx}
          >
            {exporting !== null
              ? `${onDark ? "" : "Saving "}${Math.round(exporting * 100)}%`
              : onDark
                ? phoneLabel(alreadyPosted ? "Save again" : "Save as posted", alreadyPosted ? "Again" : "Save")
                : alreadyPosted
                  ? "Save again"
                  : "Save as posted"}
          </Button>
        </span>
      </Tooltip>
      )}
      {postButton(onDark)}
    </>
  );

  // The queue's order without the stories someone else is working on (the open one always stays in it)
  const navigationOrder = workableOrder(queueOrder ?? desk?.queue ?? [], item.id, heldByOther);
  const previousStory = adjacentStory(navigationOrder, item.id, -1);
  const nextStory = adjacentStory(navigationOrder, item.id, 1);
  const switchStory = (next: FtpNewsItem) => {
    if (!onSwitch || next.id === item.id || busy || exporting !== null) return;
    if (live) {
      if (!canEdit) return onSwitch(next);
      void runLive("save", async () => {
        const problem = await flushForLeave();
        onSwitch(next);
        if (problem) setTimeout(() => setNotice(problem), 0);
      });
      return;
    }
    if (edited && canEdit) saveDraft(buildPayload());
    onSwitch(next);
  };
  // J / K (or the person's own keys, editorKeys "story.next" / "story.prev"): read by the key handler above
  useEffect(() => {
    storyNav.current = { previousStory, nextStory, switchStory };
  });
  const bodyLayer = layout.layers?.find((layer) => layer.id === ORG_BODY_ID);

  // Top bar: the story's tag and category. Live, they come from the draft (Samvadia's priority and category)
  const headTag = live ? priorityTag(live.draft.story.priority) : item.tag;
  const headCategory = live?.draft.story.category?.trim() || null;

  return (
    <Dialog open fullScreen onClose={(e, reason) => (reason === "escapeKeyDown" ? onEscape(e) : requestClose())} transitionDuration={150} slotProps={{ paper: { sx: { borderRadius: 0, backgroundImage: "none", backgroundColor: "background.default", overflow: "hidden" } } }}>
      {/* Exactly one viewport tall; the columns scroll on their own and the dialog itself never scrolls */}
      <Box sx={{ position: "relative", display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
        {/* Top bar */}
        <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.5, sm: 1 }, px: { xs: 1, sm: 1.5 }, height: 54, flexShrink: 0, backgroundColor: BAR.bg, color: "#fff" }}>
          <Button onClick={requestClose} aria-label="Back to desk" disabled={busy === "save"} sx={{ ...chromeButton, minWidth: 0, flexShrink: 0, gap: 0.75 }}>
            {busy === "save" ? <CircularProgress size={14} sx={{ color: "#fff" }} /> : <ArrowLeft size={16} />}
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
              Desk
            </Box>
          </Button>
          {/* Prev / Next walk the queue's order; phones have no room for them in the bar and use the FTP feed instead */}
          <Button aria-label={`Prev${editorShortcutSuffix("story.prev")}, previous story`} aria-keyshortcuts={ariaKeyShortcuts(keysById(EDITOR_KEYS, "story.prev"))} disabled={!previousStory || !!busy || exporting !== null} onClick={() => previousStory && switchStory(previousStory)} sx={{ ...chromeButton, display: { xs: "none", sm: "inline-flex" }, minWidth: 0, flexShrink: 0, border: `1px solid ${BAR.border}`, ml: 0.5 }}>
            <ChevronLeft size={16} />
            {`Prev${editorShortcutSuffix("story.prev")}`}
          </Button>
          <Button aria-label={`Next${editorShortcutSuffix("story.next")}, next story`} aria-keyshortcuts={ariaKeyShortcuts(keysById(EDITOR_KEYS, "story.next"))} disabled={!nextStory || !!busy || exporting !== null} onClick={() => nextStory && switchStory(nextStory)} sx={{ ...chromeButton, display: { xs: "none", sm: "inline-flex" }, minWidth: 0, flexShrink: 0, border: `1px solid ${BAR.border}` }}>
            {`Next${editorShortcutSuffix("story.next")}`}
            <ChevronRight size={16} />
          </Button>
          <Box sx={{ display: { xs: "none", sm: "block" }, width: "1px", height: 22, backgroundColor: BAR.border, mx: 0.5 }} />
          <Box sx={{ display: { xs: "none", sm: "contents" } }}>
            <PlatformIcon platform={platform} size={16} />
          </Box>
          {/* The tint behind the headline carries the tag (yellow Big Breaking, red Breaking; none for a normal live story) */}
          <Typography sx={{ display: { xs: "none", sm: "block" }, flex: 1, minWidth: 0, px: 1, py: 0.5, borderRadius: "6px", background: headTag ? tagTint(headTag, "dark", 1.4) : "none", fontSize: "0.875rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {headTag && <Box component="span" sx={srOnly}>{TAG_TINT[headTag].label}: </Box>}
            {item.headline}
          </Typography>
          {headCategory && (
            <Box sx={{ display: { xs: "none", md: "flex" }, flexShrink: 1, minWidth: 0, maxWidth: 160 }}>
              <CategoryLabel category={headCategory} onDark />
            </Box>
          )}
          <Box sx={{ flex: { xs: 1, sm: 0 } }} />
          {!isX && (
            <Box role="group" aria-label="Format" sx={{ display: "flex", flexShrink: 0, border: `1px solid ${BAR.border}`, borderRadius: "8px", overflow: "hidden", mr: 0.5 }}>
              {(["ig_post", "ig_reel"] as const).map((f) => (
                <Box
                  key={f}
                  component="button"
                  aria-pressed={igFormat === f}
                  aria-label={TEMPLATE_FORMATS[f].label}
                  onClick={() => {
                    setIgFormat(f);
                    patch({ textY: DEFAULT_TEXT_Y[f], bgX: 0, bgY: 0 });
                  }}
                  sx={{ border: 0, px: 1.25, height: 32, fontFamily: "inherit", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", color: igFormat === f ? "#111" : BAR.text, backgroundColor: igFormat === f ? "#fff" : "transparent" }}
                >
                  {/* "Post 4:5" shows as "Post" on phones */}
                  {TEMPLATE_FORMATS[f].label.split(" ")[0]}
                  <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                    {" "}
                    {TEMPLATE_FORMATS[f].label.split(" ").slice(1).join(" ")}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
          <Button onClick={() => setPreviewOpen(true)} aria-label="See on X" sx={{ ...chromeButton, minWidth: 0, flexShrink: 0, gap: 0.75, border: `1px solid ${BAR.border}` }}>
            <Eye size={15} />
            <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>
              See on X
            </Box>
          </Button>
          <Tooltip title={phase1 ? `${meta.short} posts marked posted today` : `${meta.short} posts saved today against the daily cap`}>
            <Typography sx={{ display: { xs: "none", md: "block" }, px: 0.75, fontSize: "0.75rem", fontVariantNumeric: "tabular-nums", color: capReached ? "#FF8A80" : BAR.text, whiteSpace: "nowrap" }}>
              {phase1 ? `${postedToday} posted today` : `${postedToday} / ${cap} today`}
            </Typography>
          </Tooltip>
          {actionButtons(true)}
        </Box>

        <VolumeStrip name={meta.short} used={postedToday} cap={cap} />

        {/* Workspace */}
        <Box ref={measureWorkspace} sx={{ position: "relative", flex: 1, minHeight: 0, display: { xs: "flex", lg: "grid" }, flexDirection: "column", gridTemplateColumns: workspaceColumns, overflowY: { xs: "auto", lg: "hidden" } }}>
          {/* Tool rail */}
          <Box sx={{ order: { xs: 1, lg: 0 }, flexShrink: 0, display: "flex", flexDirection: { xs: "row", lg: "column" }, gap: 0.5, p: 0.75, backgroundColor: "background.paper", borderRight: { lg: "1px solid" }, borderTop: { xs: "1px solid", lg: "none" }, borderColor: "divider" }}>
            {/* Folds the panel beside the rail to a thin strip; a plain button, outside the tools' tab list */}
            <Tooltip title={leftFolded ? "Show the tool panel" : "Hide the tool panel"}>
              <IconButton aria-label={leftFolded ? "Show the tool panel" : "Hide the tool panel"} aria-expanded={!leftFolded} aria-controls="post-editor-tool-panel" onClick={() => leftPanel.setCollapsed(!leftPanel.collapsed)} sx={{ color: "text.primary", alignSelf: "center", flexShrink: 0 }}>
                {leftFolded ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              </IconButton>
            </Tooltip>
            <Box role="tablist" aria-label="Design tools" sx={{ display: "flex", flex: 1, minWidth: 0, flexDirection: { xs: "row", lg: "column" }, gap: 0.5 }}>
            {TOOLS.filter((t) => !t.videoOnly || (isVideo && !phase1 && !orgMode)).map((t) => (
              <Box
                key={t.id}
                component="button"
                role="tab"
                aria-selected={panel === t.id}
                aria-controls="post-editor-tool-panel"
                onClick={() => {
                  setTool(t.id);
                  leftPanel.setCollapsed(false);
                }}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 0.4,
                  flex: { xs: 1, lg: "none" },
                  py: 1,
                  border: 0,
                  borderRadius: "8px",
                  fontFamily: "inherit",
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  minWidth: 0,
                  color: panel === t.id ? "text.primary" : "text.secondary",
                  backgroundColor: panel === t.id ? "action.selected" : "transparent",
                  "&:hover": { backgroundColor: "action.hover", color: "text.primary" },
                }}
              >
                {t.icon}
                {t.label}
              </Box>
            ))}
            </Box>
          </Box>

          {/* Tool panel */}
          <Box id="post-editor-tool-panel" role="tabpanel" sx={{ order: { xs: 2, lg: 0 }, flexShrink: 0, p: 2, overflowY: { lg: "auto" }, backgroundColor: "background.paper", borderRight: { lg: "1px solid" }, borderColor: "divider", ...(leftFolded && (wide ? foldedPanelSx : { display: "none" })) }}>
            {panel === "ftp" && (
              <FtpFeedPanel
                platform={platform}
                currentId={item.id}
                onPick={switchStory}
              />
            )}

            {panel === "background" && !bgMode && (
              <>
                <Typography sx={panelTitle}>{orgMode ? "Photo" : "Background"}</Typography>
                {orgMode && (
                  <Box sx={{ mb: 2 }}>
                    <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mb: 1, lineHeight: 1.5 }}>
                      {layout.photoBox
                        ? "The photo sits in its own frame on the template. Drag it on the card and pull a handle to resize it; Alt-drag moves the picture inside the frame."
                        : `${orgTpl.label} is the card's background. Add a photo from the story on top of it.`}
                    </Typography>
                    {layout.photoBox ? (
                      <Button fullWidth variant="outlined" color="error" onClick={removePhoto} startIcon={<Trash2 size={15} />} disabled={!canEdit}>
                        Remove photo from the card
                      </Button>
                    ) : (
                      <Button fullWidth variant="contained" onClick={addPhoto} startIcon={<ImageIcon size={15} />} disabled={!canEdit}>
                        Add photo to the card
                      </Button>
                    )}
                  </Box>
                )}
                <Typography sx={{ ...sectionLabel, mb: 0.75 }}>From this story&apos;s FTP folder</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                  {mediaList.map((m, i) => (
                    <Box key={m.url} sx={{ minWidth: 0 }}>
                      <Box
                        component="button"
                        onClick={() => chooseMedia(i)}
                        aria-label={`Use ${m.fileName}`}
                        aria-pressed={i === mediaIndex}
                        sx={{ position: "relative", display: "block", width: "100%", aspectRatio: "4 / 3", p: 0, borderRadius: "8px", overflow: "hidden", cursor: "pointer", backgroundColor: "#111", border: `2px solid ${i === mediaIndex ? SELECT_BLUE : "transparent"}` }}
                      >
                        {(m.kind === "image" || m.posterUrl) && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={m.posterUrl ?? m.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        )}
                        {m.kind === "video" && (
                          <Box sx={{ position: "absolute", left: 5, bottom: 5, display: "flex", alignItems: "center", gap: 0.4, px: 0.6, py: 0.2, borderRadius: "4px", backgroundColor: "rgba(0,0,0,0.7)", color: "#fff", fontSize: "0.625rem", fontWeight: 700 }}>
                            <Film size={11} /> VIDEO
                          </Box>
                        )}
                      </Box>
                      <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", mt: 0.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.fileName}</Typography>
                    </Box>
                  ))}
                </Box>
                <Button fullWidth variant="outlined" onClick={() => fileInputRef.current?.click()} startIcon={<Upload size={15} />} sx={{ mt: 1.5, borderColor: "divider", color: "text.primary" }}>
                  Upload image or video
                </Button>

                <Typography sx={{ ...sectionLabel, mt: 2.5, mb: 0.75 }}>Crop</Typography>
                <Box sx={{ display: "flex", gap: 0.75 }}>
                  {([["cover", "Fill frame"], ["contain", "Show all"]] as const).map(([value, label]) => (
                    <Button key={value} variant="outlined" aria-pressed={layout.fit === value} onClick={() => patch({ fit: value, bgX: 0, bgY: 0 })} sx={{ flex: 1, color: "text.primary", borderColor: layout.fit === value ? "text.primary" : "divider" }}>
                      {label}
                    </Button>
                  ))}
                </Box>
                <Typography sx={{ ...sectionLabel, mt: 2 }}>Zoom</Typography>
                <Slider size="small" min={1} max={3} step={0.05} value={layout.bgZoom} onChange={(_, v) => patch({ bgZoom: v as number })} aria-label="Background zoom" sx={{ color: "text.primary" }} />
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Drag the {isVideo ? "video" : "picture"} on the frame to choose what stays in the crop.</Typography>

                {layout.fit === "contain" && (
                  <>
                    <Typography sx={{ ...sectionLabel, mt: 2.5, mb: 0.75 }}>Backdrop</Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      {BACKDROPS.map((value) => (
                        <Tooltip key={value} title={value === "blur" ? "Blurred copy" : value}>
                          <Box
                            component="button"
                            aria-label={value === "blur" ? "Blurred backdrop" : `Backdrop ${value}`}
                            aria-pressed={layout.backdrop === value}
                            onClick={() => patch({ backdrop: value })}
                            sx={{ width: 32, height: 32, borderRadius: "6px", cursor: "pointer", border: "1px solid", borderColor: "divider", background: value === "blur" ? "linear-gradient(135deg, #8a8f98, #2b2d31)" : value, outline: layout.backdrop === value ? `2px solid ${SELECT_BLUE}` : "none", outlineOffset: 2 }}
                          />
                        </Tooltip>
                      ))}
                      <Tooltip title="Custom colour">
                        <Box
                          component="input"
                          type="color"
                          aria-label="Custom backdrop colour"
                          value={layout.backdrop.startsWith("#") ? layout.backdrop : "#1a1a1a"}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ backdrop: e.target.value })}
                          sx={{ width: 32, height: 32, p: 0, border: "1px solid", borderColor: "divider", borderRadius: "6px", backgroundColor: "transparent", cursor: "pointer" }}
                        />
                      </Tooltip>
                    </Box>
                  </>
                )}
                <Button size="small" onClick={() => patch({ bgZoom: 1, bgX: 0, bgY: 0 })} startIcon={<RotateCcw size={13} />} sx={{ mt: 1, px: 0.5, color: "text.secondary", fontSize: "0.75rem" }}>
                  Reset position
                </Button>

                <Typography sx={{ ...sectionLabel, mt: 2.5, mb: 0.75 }}>Filters</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 0.75 }}>
                  {MEDIA_LOOKS.map((look) => {
                    const on = (adjust.filter ?? "none") === look.id;
                    const wash = mediaWarmth({ filter: look.id });
                    return (
                      <Box key={look.id} component="button" aria-pressed={on} onClick={() => setAdjust({ filter: look.id })} sx={{ p: 0, border: 0, background: "none", cursor: "pointer", color: "text.primary", fontFamily: "inherit", minWidth: 0 }}>
                        <Box sx={{ position: "relative", aspectRatio: "1", borderRadius: "6px", overflow: "hidden", backgroundColor: "#3a3a3f", outline: on ? `2px solid ${SELECT_BLUE}` : "1px solid", outlineColor: on ? SELECT_BLUE : "divider", outlineOffset: on ? 1 : -1 }}>
                          {lookThumb && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={lookThumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: mediaFilter({ filter: look.id }, 2) }} />
                          )}
                          {wash !== 0 && <Box sx={{ position: "absolute", inset: 0, backgroundColor: warmthColor(wash), mixBlendMode: "soft-light" }} />}
                        </Box>
                        <Typography sx={{ fontSize: "0.6875rem", mt: 0.4, fontWeight: on ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{look.label}</Typography>
                      </Box>
                    );
                  })}
                </Box>

                <Typography sx={{ ...sectionLabel, mt: 2.5, mb: 0.25 }}>Adjust</Typography>
                {ADJUSTMENTS.map((a) => (
                  <Box key={a.key} sx={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr) 34px", alignItems: "center", gap: 1 }}>
                    <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{a.label}</Typography>
                    <Slider
                      size="small"
                      min={a.min}
                      max={1}
                      step={0.05}
                      value={adjust[a.key] ?? 0}
                      track={a.min < 0 ? false : "normal"}
                      onChange={(_, v) => setAdjust({ [a.key]: v as number })}
                      aria-label={a.label}
                      sx={{ color: "text.primary" }}
                    />
                    <Typography sx={{ fontSize: "0.75rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.round((adjust[a.key] ?? 0) * 100)}</Typography>
                  </Box>
                ))}
                <Box sx={{ display: "flex", gap: 0.75, mt: 1 }}>
                  <Button size="small" variant="outlined" aria-pressed={!!layout.flipX} onClick={() => patch({ flipX: !layout.flipX })} startIcon={<FlipHorizontal2 size={14} />} sx={{ flex: 1, color: "text.primary", borderColor: layout.flipX ? "text.primary" : "divider" }}>
                    Flip
                  </Button>
                  <Button size="small" variant="outlined" disabled={!adjusted} onClick={() => patch({ adjust: undefined, flipX: undefined })} startIcon={<RotateCcw size={13} />} sx={{ flex: 1, color: "text.primary", borderColor: "divider" }}>
                    Reset
                  </Button>
                </Box>
              </>
            )}

            {panel === "video" && (
              <>
                <Typography sx={panelTitle}>Video</Typography>
                {live && (
                  <Alert severity="info" sx={{ mb: 2, py: 0, fontSize: "0.75rem", borderRadius: "8px" }}>
                    Video posting is not enabled yet. Post to {meta.short} sends the card only; use Save as posted to download the clip and post it by hand.
                  </Alert>
                )}
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mb: 2 }}>
                  Saved clip runs {clock(outputLength(segments))}. Cut and trim on the timeline below the frame.
                </Typography>

                <Typography sx={{ ...sectionLabel, mb: 0.25 }}>Sound in the saved clip</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <IconButton sx={toolbarIcon} aria-label={(layout.volume ?? 1) === 0 ? "Unmute the clip" : "Mute the clip"} onClick={() => patch({ volume: (layout.volume ?? 1) === 0 ? 1 : 0 })}>
                    {(layout.volume ?? 1) === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </IconButton>
                  <Slider size="small" min={0} max={1} step={0.05} value={layout.volume ?? 1} onChange={(_, v) => patch({ volume: v as number })} aria-label="Clip volume" sx={{ color: "text.primary" }} />
                  <Typography sx={{ fontSize: "0.75rem", width: 36, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.round((layout.volume ?? 1) * 100)}%</Typography>
                </Box>
                <Button size="small" onClick={() => setSound((v) => !v)} startIcon={sound ? <VolumeX size={13} /> : <Volume2 size={13} />} sx={{ px: 0.5, color: "text.secondary", fontSize: "0.75rem" }}>
                  {sound ? "Mute while editing" : "Hear it while editing"}
                </Button>

                <Typography sx={{ ...sectionLabel, mt: 2.5, mb: 0.75 }}>
                  Speed{selectedClip !== null && segments.length > 1 ? ` of clip ${selectedClip + 1}` : segments.length > 1 ? " of every clip" : ""}
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 0.75 }}>
                  {CLIP_SPEEDS.map((v) => {
                    const current = selectedClip !== null ? (segments[selectedClip]?.speed ?? 1) : segments.every((c) => (c.speed ?? 1) === v) ? v : null;
                    return (
                      <Button
                        key={v}
                        size="small"
                        variant="outlined"
                        aria-pressed={current === v}
                        onClick={() => setSegments((list) => list.map((c, i) => (selectedClip === null || i === selectedClip ? { ...c, speed: v === 1 ? undefined : v } : c)))}
                        sx={{ minWidth: 0, color: "text.primary", fontVariantNumeric: "tabular-nums", borderColor: current === v ? "text.primary" : "divider", fontWeight: current === v ? 700 : 500 }}
                      >
                        {v}×
                      </Button>
                    );
                  })}
                </Box>
                {segments.length > 1 && (
                  <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", mt: 0.5 }}>
                    {selectedClip === null ? "Select a clip on the timeline to change only that part." : "Click empty space on the timeline to change every clip."}
                  </Typography>
                )}

                <Typography sx={{ ...sectionLabel, mt: 2.5, mb: 0.25 }}>Fades</Typography>
                {([["fadeIn", "Fade in from black"], ["fadeOut", "Fade out to black"]] as const).map(([key, label]) => (
                  <Box key={key} component="label" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                    <Typography sx={{ fontSize: "0.8125rem" }}>{label}</Typography>
                    <Switch
                      size="small"
                      checked={!!layout[key]}
                      onChange={(e) => {
                        patch({ [key]: e.target.checked });
                        if (e.target.checked) seek(key === "fadeIn" ? keptFrom : Math.max(keptFrom, keptTo - 1.2));
                      }}
                    />
                  </Box>
                ))}

                <Typography sx={{ ...sectionLabel, mt: 2.5, mb: 0.5 }}>Text on the video</Typography>
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mb: 1 }}>Each text has a bar on the timeline. Drag it to change when the text shows; pick its animation in the Text tab.</Typography>
                <Box sx={{ display: "grid", gap: 0.5 }}>
                  {timelineTexts.map((t) => {
                    const span = textSpan(t.motion, keptFrom, keptTo);
                    const animation = TEXT_ANIMATIONS.find((a) => a.id === (t.motion?.animation ?? "none"))?.label;
                    return (
                      <Box key={t.key} component="button" onClick={() => selectTimelineText(t.key)} sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 1, alignItems: "center", textAlign: "left", px: 1, py: 0.75, border: "1px solid", borderColor: selection === t.key ? "text.primary" : "divider", borderRadius: "8px", background: "none", color: "text.primary", fontFamily: "inherit", cursor: "pointer", "&:hover": { backgroundColor: "action.hover" } }}>
                        <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</Typography>
                        <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                          {clock(span.start)}–{clock(span.end)} · {animation}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              </>
            )}

            {panel === "template" && !bgMode && (
              <>
              {cardChoices.length > 0 && <OrgTemplatePicker {...orgPickerProps} />}
              {/* The code-drawn photo cards; a card on a desk template comes back to them with "Use automatic card" */}
              {!orgMode && (
              <TemplatePicker
                layout={layout}
                media={media}
                format={format}
                tag={item.tag}
                handle={`@${meta.handle}`}
                onPick={(t) => patch(templatePatch(t, format))}
                onAccent={(value) => patch({ accent: value })}
              />
              )}
              </>
            )}

            {panel === "text" && !bgMode && (
              <>
                {/* Which text is being edited: the card headline or one of the extra boxes */}
                <Box role="group" aria-label="Text on the card" sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1.5 }}>
                  {[{ key: "headline" as CanvasSelection, label: orgMode ? "Headline" : "Card text" }, ...(layout.layers ?? []).map((l, i) => ({ key: `layer:${l.id}` as CanvasSelection, label: `${l.text.trim().slice(0, 14) || `Text ${i + 1}`}${l.hidden ? " (hidden)" : ""}` }))].map(({ key, label }) => {
                    const on = key === "headline" ? !activeLayer : selection === key;
                    return (
                      <Box key={key} component="button" aria-pressed={on} onClick={() => select(key)} sx={{ px: 1.1, py: 0.5, borderRadius: "999px", border: "1px solid", borderColor: on ? "text.primary" : "divider", backgroundColor: on ? "text.primary" : "transparent", color: on ? "background.paper" : "text.primary", fontFamily: "inherit", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {label}
                      </Box>
                    );
                  })}
                </Box>

                <TextField label="Headline" multiline minRows={3} maxRows={8} fullWidth size="small" value={layout.headline} inputRef={!activeLayer ? headlineInputRef : undefined} onFocus={() => setSelection("headline")} onChange={(e) => patch({ headline: e.target.value.slice(0, CARD_TEXT_MAX) })} slotProps={{ htmlInput: { maxLength: CARD_TEXT_MAX, readOnly: !canEdit, "aria-label": "Headline" } }} sx={{ ...fieldSx, mt: 1, "& textarea": { fontWeight: 600 } }} />
                {bodyLayer && <TextField label="Body" multiline minRows={4} maxRows={10} fullWidth size="small" value={bodyLayer.text} inputRef={activeLayer?.id === ORG_BODY_ID ? headlineInputRef : undefined} onFocus={() => setSelection(`layer:${ORG_BODY_ID}`)} onChange={(e) => patchLayer(ORG_BODY_ID, { text: e.target.value.slice(0, STORY_TEXT_MAX) })} slotProps={{ htmlInput: { maxLength: STORY_TEXT_MAX, readOnly: !canEdit, "aria-label": "Body" } }} sx={{ ...fieldSx, mt: 2 }} />}
                {activeLayer && activeLayer.id !== ORG_BODY_ID && <TextField label="Text box" multiline minRows={3} fullWidth size="small" value={textValue} inputRef={headlineInputRef} onChange={(e) => setTextValue(e.target.value)} slotProps={{ htmlInput: { maxLength: 300, readOnly: !canEdit } }} sx={{ ...fieldSx, mt: 2 }} />}
                <Box sx={{ display: "flex", gap: 0.5, mt: 0.5, flexWrap: "wrap" }}>
                  <Button size="small" onClick={highlightSelection} startIcon={<Highlighter size={13} />} sx={{ fontSize: "0.75rem", color: "text.primary" }}>
                    Add yellow highlight
                  </Button>
                  {textValue.includes("**") && (
                    <Button size="small" onClick={() => setTextValue(textValue.replace(/\*\*/g, ""))} sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                      Clear highlights
                    </Button>
                  )}
                </Box>

                <TextControls
                  style={textStyle}
                  onChange={styleText}
                  size={textSize}
                  autoColor={activeLayer || orgMode ? undefined : { active: layout.color === "auto", onPick: () => patch({ color: "auto" }) }}
                  onReset={resetTextStyle}
                  history={{ undo, redo, canUndo, canRedo }}
                />

                {isVideo && duration > 0 && (
                  <>
                    <Typography sx={{ ...sectionLabel, mt: 2.5, mb: 0.75 }}>Animation</Typography>
                    <Box role="group" aria-label="Animation" sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 0.75 }}>
                      {TEXT_ANIMATIONS.map((a) => {
                        const on = (textMotion?.animation ?? "none") === a.id;
                        return (
                          <Button
                            key={a.id}
                            size="small"
                            variant="outlined"
                            aria-pressed={on}
                            onClick={() => {
                              setMotion(textKey, { animation: a.id });
                              if (a.id !== "none") replayText(textMotion);
                            }}
                            sx={{ minWidth: 0, color: "text.primary", borderColor: on ? "text.primary" : "divider", fontWeight: on ? 700 : 500 }}
                          >
                            {a.label}
                          </Button>
                        );
                      })}
                    </Box>
                    <Typography sx={{ ...sectionLabel, mt: 2, mb: 0.25 }}>On screen</Typography>
                    <Typography sx={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}>
                      {clock(textOnScreen.start)} to {clock(textOnScreen.end)}
                    </Typography>
                    <AtPlayhead playhead={playhead}>
                      {(time) => (
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                          <Button size="small" variant="outlined" disabled={time >= textOnScreen.end - 0.3} onClick={() => setMotion(textKey, { start: Math.max(keptFrom, time) })} sx={{ color: "text.primary", borderColor: "divider", fontSize: "0.75rem" }}>
                            Start here
                          </Button>
                          <Button size="small" variant="outlined" disabled={time <= textOnScreen.start + 0.3} onClick={() => setMotion(textKey, { end: Math.min(keptTo, time) })} sx={{ color: "text.primary", borderColor: "divider", fontSize: "0.75rem" }}>
                            End here
                          </Button>
                          <Button size="small" disabled={textMotion?.start === undefined && textMotion?.end === undefined} onClick={() => setMotion(textKey, { start: undefined, end: undefined })} sx={{ color: "text.secondary", fontSize: "0.75rem" }}>
                            Whole video
                          </Button>
                        </Box>
                      )}
                    </AtPlayhead>
                    <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", mt: 0.5 }}>&ldquo;Here&rdquo; is the playhead. You can also drag the text&apos;s bar on the timeline.</Typography>
                  </>
                )}

                {activeLayer && (
                  <Box sx={{ display: "flex", gap: 0.75, mt: 1.5 }}>
                    <Button size="small" variant="outlined" onClick={() => duplicateLayer(activeLayer.id)} startIcon={<CopyPlus size={14} />} sx={{ flex: 1, borderColor: "divider", color: "text.primary" }}>
                      Duplicate
                    </Button>
                    <Button size="small" variant="outlined" color="error" onClick={() => removeLayer(activeLayer.id)} startIcon={<Trash2 size={14} />} sx={{ flex: 1 }}>
                      Delete
                    </Button>
                  </Box>
                )}

                <Typography sx={{ ...sectionLabel, mt: 3, mb: 0.75 }}>Add text</Typography>
                <Box sx={{ display: "grid", gap: 0.75 }}>
                  {LAYER_PRESETS.map((preset) => (
                    <Box
                      key={preset.id}
                      component="button"
                      onClick={() => addLayer(preset)}
                      sx={{ textAlign: "left", px: 1.25, py: 0.9, border: "1px solid", borderColor: "divider", borderRadius: "8px", backgroundColor: "transparent", color: "text.primary", fontFamily: "inherit", cursor: "pointer", fontWeight: preset.style.weight, fontSize: `${Math.max(0.75, Math.min(1.25, preset.size / 64))}rem`, textTransform: preset.style.uppercase ? "uppercase" : "none", "&:hover": { backgroundColor: "action.hover" } }}
                    >
                      Add {preset.label.toLowerCase()}
                    </Box>
                  ))}
                </Box>

                {!activeLayer && orgMode && (
                  <Button size="small" onClick={() => setLayout((l) => orgLayout(orgTpl, { headline: item.headline, body: item.body }, l))} startIcon={<RotateCcw size={13} />} sx={{ mt: 2, px: 0.5, color: "text.secondary", fontSize: "0.75rem" }}>
                    Reset the headline and story to the FTP story
                  </Button>
                )}
                {!activeLayer && !orgMode && (
                  <Button size="small" onClick={() => setLayout((l) => ({ ...defaultLayout(defaultCardText(item), format), ...templatePatch(templateById(l.template), format), accent: l.accent, layers: l.layers, fit: l.fit, backdrop: l.backdrop, bgZoom: l.bgZoom, bgX: l.bgX, bgY: l.bgY, adjust: l.adjust, flipX: l.flipX, volume: l.volume, fadeIn: l.fadeIn, fadeOut: l.fadeOut }))} startIcon={<RotateCcw size={13} />} sx={{ mt: 2, px: 0.5, color: "text.secondary", fontSize: "0.75rem" }}>
                    Reset card text to the FTP story
                  </Button>
                )}
              </>
            )}

            {bgMode && (panel === "text" || panel === "template" || panel === "background") && (
              <>
                {panel === "template" && cardChoices.length > 0 ? (
                  <OrgTemplatePicker {...orgPickerProps} />
                ) : (
                  <Typography sx={panelTitle}>{panel === "text" ? "Card headline" : panel === "template" ? "Template" : "Background"}</Typography>
                )}
                {panel === "text" ? (
                  <>
                    <TextField
                      label="Headline"
                      multiline
                      minRows={3}
                      maxRows={10}
                      slotProps={{ htmlInput: { maxLength: CARD_TEXT_MAX, "aria-label": "Headline", readOnly: !canEdit } }}
                      inputRef={headlineFieldRef}
                      helperText="Drawn in yellow above the story. The story under it comes from the FTP."
                      fullWidth
                      size="small"
                      value={layout.headline}
                      onChange={(e) => patch({ headline: e.target.value.slice(0, CARD_TEXT_MAX) })}
                      sx={{ ...fieldSx, "& textarea": { fontWeight: 600 } }}
                    />
                    <TextField label="Body" multiline minRows={4} maxRows={10} fullWidth size="small" value={orgBodyText(layout, item.body)} onChange={(e) => setLayout((current) => {
                      const value = e.target.value.slice(0, STORY_TEXT_MAX);
                      const layers = current.layers ?? [];
                      return { ...current, layers: layers.some((layer) => layer.id === ORG_BODY_ID) ? layers.map((layer) => layer.id === ORG_BODY_ID ? { ...layer, text: value } : layer) : [...layers, { id: ORG_BODY_ID, text: value, x: 0.5, y: 0.6, width: 0.8, size: 40, style: BODY_STYLE }] };
                    })} slotProps={{ htmlInput: { maxLength: STORY_TEXT_MAX, "aria-label": "Body", readOnly: !canEdit } }} sx={{ ...fieldSx, mt: 2 }} />
                    <Button size="small" disabled={!canEdit || plainCardText(layout.headline) === item.headline} onClick={() => patch({ headline: item.headline })} startIcon={<RotateCcw size={13} />} sx={{ mt: 1, px: 0.5, color: "text.secondary", fontSize: "0.75rem" }}>
                      Use the FTP headline
                    </Button>
                  </>
                ) : panel === "template" && cardChoices.length > 0 ? null : (
                  <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", lineHeight: 1.6 }}>
                    {"This card is drawn on your X background from Post Studio → Templates: today's date, the headline and the whole story."}
                  </Typography>
                )}
                <Alert
                  severity="info"
                  sx={{ mt: 2, fontSize: "0.75rem", borderRadius: "8px" }}
                  action={canEdit ? <Button color="inherit" size="small" onClick={() => (orgStart ? pickCardDesign(orgStart.slug) : void switchToAutoCard())} disabled={!!busy} sx={{ whiteSpace: "nowrap" }}>Design here</Button> : undefined}
                >
                  For a template, a photo or extra text, design the card here instead of using your background.
                </Alert>
              </>
            )}

            {panel === "story" && (
              <>
                <Typography sx={panelTitle}>Story from FTP</Typography>
                <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, lineHeight: 1.45 }}>{item.headline}</Typography>
                {phase1 ? (
                  <Typography lang="hi" sx={{ fontSize: "0.8125rem", lineHeight: 1.7, color: "text.secondary", mt: 1, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {live?.draft.story.sourceText?.trim() || item.body}
                  </Typography>
                ) : (
                  <Typography sx={{ fontSize: "0.8125rem", lineHeight: 1.7, color: "text.secondary", mt: 1 }}>{item.body}</Typography>
                )}
                <Typography sx={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono), monospace", color: "text.disabled", mt: 1.5, wordBreak: "break-all" }}>{item.ftpPath}</Typography>
              </>
            )}
          </Box>

          {/* Stage */}
          <Box sx={{ order: 0, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, flexShrink: 0 }}>
          <Box sx={{ position: "relative", flex: 1, minHeight: { xs: "52vh", lg: 0 }, backgroundColor: (t) => (t.palette.mode === "light" ? "#E9E9E6" : "#09090B") }}>
            <Box ref={stageAreaRef} onPointerDown={(e) => e.target === e.currentTarget && setSelection(null)} onContextMenu={openCardMenu} sx={{ position: "absolute", inset: 0, overflow: "auto", display: "flex", p: "64px 40px 56px" }}>
              {/* Measured box: the frame is fitted to this area */}
              <Box ref={setStageEl} onPointerDown={(e) => e.target === e.currentTarget && setSelection(null)} sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>
                {serverView && live?.draft.card.url ? (
                  <Box sx={{ m: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5, maxWidth: "100%" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={apiFileUrl(live.draft.card.url)}
                      alt={`Card already on this draft: ${live.draft.cardHeadline}`}
                      style={{ display: "block", maxWidth: "100%", maxHeight: Math.max(160, stage.h - 72), boxShadow: "0 8px 30px rgba(0,0,0,0.22)", backgroundColor: "#111" }}
                    />
                    <Box sx={{ ...floatingSx, display: "flex", alignItems: "center", flexWrap: "wrap", justifyContent: "center", gap: 1, px: 1.5, py: 1, borderRadius: "10px", maxWidth: 520 }}>
                      <Typography sx={{ fontSize: "0.75rem", flex: "1 1 220px", lineHeight: 1.5 }}>
                        A card for this story was already made on another screen. That card will go out with the post unless you make a new one here.
                      </Typography>
                      {canEdit && (
                        <Box sx={{ display: "flex", gap: 0.5 }}>
                          {(orgTemplates.length ? cardTemplate : activeTemplate) && (
                            <Button size="small" onClick={useOwnBackground} disabled={!!busy} sx={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                              {useBgLabel}
                            </Button>
                          )}
                          <Button size="small" onClick={() => setCardSource("design")} disabled={!!busy} sx={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                            Design here
                          </Button>
                        </Box>
                      )}
                    </Box>
                  </Box>
                ) : bgMode ? (
                  <Box
                    onClick={typeOnBgCard}
                    title={canEdit ? "Click to change the headline" : undefined}
                    sx={{ position: "relative", width: bgFrameWidth, aspectRatio: `${bgFrame.w} / ${bgFrame.h}`, flexShrink: 0, m: "auto", boxShadow: "0 8px 30px rgba(0,0,0,0.22)", backgroundColor: "#111", lineHeight: 0, cursor: canEdit ? "text" : "default" }}
                  >
                    {bg.card && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={bg.card.url} alt={`Card on ${bgName}: ${plainCardText(layout.headline) || item.headline}`} style={{ display: "block", width: "100%", height: "100%" }} />
                    )}
                    {(bg.status === "drawing" || bg.status === "error") && (
                      <Box role={bg.status === "error" ? "alert" : "status"} sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", p: 2, backgroundColor: bg.card ? "rgba(0,0,0,0.25)" : "transparent", lineHeight: 1.5 }}>
                        {bg.status === "drawing" ? (
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.25, py: 0.75, borderRadius: "8px", backgroundColor: "rgba(0,0,0,0.7)", color: "#fff" }}>
                            <CircularProgress size={14} sx={{ color: "#fff" }} />
                            <Typography sx={{ fontSize: "0.75rem" }}>Drawing on {bgName}</Typography>
                          </Box>
                        ) : (
                          <Alert severity="error" sx={{ maxWidth: 360, fontSize: "0.8125rem", borderRadius: "8px" }}>
                            {bg.error}
                          </Alert>
                        )}
                      </Box>
                    )}
                  </Box>
                ) : orgFailed ? (
                  <Alert
                    severity="error"
                    sx={{ m: "auto", maxWidth: 360, fontSize: "0.8125rem", borderRadius: "8px" }}
                    action={
                      <Button color="inherit" size="small" onClick={retryOrgList} disabled={orgRetrying} sx={{ whiteSpace: "nowrap" }}>
                        {orgRetrying ? "Retrying" : "Retry"}
                      </Button>
                    }
                  >
                    The card designs didn&apos;t load, so this card can&apos;t be shown yet.
                  </Alert>
                ) : orgWaiting ? (
                  <Box role="status" sx={{ m: "auto", display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 1, borderRadius: "8px", backgroundColor: "rgba(0,0,0,0.7)", color: "#fff" }}>
                    <CircularProgress size={14} sx={{ color: "#fff" }} />
                    <Typography sx={{ fontSize: "0.75rem" }}>Loading the card design</Typography>
                  </Box>
                ) : (
                <TemplateCanvas
                  ref={canvasRef}
                  backdrop={backdrop}
                  media={media}
                  format={format}
                  handle={`@${meta.handle}`}
                  tag={item.tag}
                  layout={layout}
                  onLayoutChange={setLayout}
                  selection={selection}
                  onSelect={select}
                  textLimits={{ headline: CARD_TEXT_MAX, layer: 300, byLayer: { [ORG_BODY_ID]: STORY_TEXT_MAX } }}
                  onContextTarget={(target) => {
                    menuTarget.current = target;
                  }}
                  paused={videoPaused}
                  sound={sound}
                  segments={segments.length ? segments : undefined}
                  onDuration={handleDuration}
                  onTime={playhead.set}
                  style={{ width: frameWidth, maxWidth: "none", maxHeight: "none", flexShrink: 0, margin: "auto", boxShadow: "0 8px 30px rgba(0,0,0,0.22)" }}
                />
                )}
              </Box>
            </Box>

            {/* Contextual toolbar */}
            <Box sx={{ ...floatingSx, position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", maxWidth: "calc(100% - 24px)", overflowX: "auto", display: "flex", alignItems: "center", gap: 0.5, px: 0.75, height: 42, borderRadius: "10px", whiteSpace: "nowrap" }}>
              {(selection === "headline" || activeLayer) && (
                <>
                  <FontSelect compact value={textStyle.font} onChange={(id) => styleText({ font: id, weight: nearestWeight(fontById(id), textStyle.weight) })} />
              <Tooltip title={withEditorShortcut("Undo", "edit.undo")}>
                <span>
                  <IconButton sx={toolbarIcon} aria-label="Undo" disabled={!canUndo} onClick={undo}>
                    <Undo2 size={14} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={withEditorShortcut("Redo", "edit.redo")}>
                <span>
                  <IconButton sx={toolbarIcon} aria-label="Redo" disabled={!canRedo} onClick={redo}>
                    <Redo2 size={14} />
                  </IconButton>
                </span>
              </Tooltip>
                  {toolbarDivider}
                  <IconButton sx={toolbarIcon} aria-label="Smaller text" onClick={() => nudgeSize(-1)}>
                    <Minus size={15} />
                  </IconButton>
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, width: 38, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{textSize.format(textSize.value)}</Typography>
                  <IconButton sx={toolbarIcon} aria-label="Larger text" onClick={() => nudgeSize(1)}>
                    <Plus size={15} />
                  </IconButton>
                  {toolbarDivider}
                  <IconButton sx={{ ...toolbarIcon, backgroundColor: textStyle.weight >= 700 ? "action.selected" : "transparent" }} aria-label="Bold" aria-pressed={textStyle.weight >= 700} onClick={() => styleText({ weight: nearestWeight(fontById(textStyle.font), textStyle.weight >= 700 ? 400 : 700) })}>
                    <Bold size={15} />
                  </IconButton>
                  <IconButton sx={{ ...toolbarIcon, backgroundColor: textStyle.italic ? "action.selected" : "transparent" }} aria-label="Italic" aria-pressed={textStyle.italic} onClick={() => styleText({ italic: !textStyle.italic })}>
                    <Italic size={15} />
                  </IconButton>
                  <IconButton sx={{ ...toolbarIcon, backgroundColor: textStyle.underline ? "action.selected" : "transparent" }} aria-label="Underline" aria-pressed={textStyle.underline} onClick={() => styleText({ underline: !textStyle.underline })}>
                    <Underline size={15} />
                  </IconButton>
                  <Tooltip title="Text colour">
                    <Box
                      component="input"
                      type="color"
                      aria-label="Text colour"
                      value={/^#[0-9a-f]{6}$/i.test(textStyle.color) ? textStyle.color : "#ffffff"}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => styleText({ color: e.target.value })}
                      sx={{ width: 24, height: 24, mx: 0.5, p: 0, flexShrink: 0, border: "1px solid", borderColor: "divider", borderRadius: "50%", overflow: "hidden", cursor: "pointer", backgroundColor: "transparent", "&::-webkit-color-swatch-wrapper": { p: 0 }, "&::-webkit-color-swatch": { border: 0, borderRadius: "50%" } }}
                    />
                  </Tooltip>
                  {activeLayer && (
                    <>
                      {toolbarDivider}
                      <Tooltip title="Bring forward">
                        <IconButton sx={toolbarIcon} aria-label="Bring forward" onClick={() => restack(activeLayer.id, 1)}>
                          <ArrowUpToLine size={15} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Send backward">
                        <IconButton sx={toolbarIcon} aria-label="Send backward" onClick={() => restack(activeLayer.id, -1)}>
                          <ArrowDownToLine size={15} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={activeLayer.hidden ? "Show on the card" : "Hide from the card"}>
                        <IconButton sx={{ ...toolbarIcon, backgroundColor: activeLayer.hidden ? "action.selected" : "transparent" }} aria-label={activeLayer.hidden ? "Show text box" : "Hide text box"} aria-pressed={!!activeLayer.hidden} onClick={() => patchLayer(activeLayer.id, { hidden: activeLayer.hidden ? undefined : true })}>
                          {activeLayer.hidden ? <Eye size={15} /> : <EyeOff size={15} />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Duplicate">
                        <IconButton sx={toolbarIcon} aria-label="Duplicate text box" onClick={() => duplicateLayer(activeLayer.id)}>
                          <CopyPlus size={15} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete (Del) or right-click for more">
                        <IconButton sx={{ ...toolbarIcon, color: "error.main" }} aria-label="Delete text box" onClick={() => removeLayer(activeLayer.id)}>
                          <Trash2 size={15} />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                  {toolbarDivider}
                  <Button size="small" onClick={() => editText(selection)} startIcon={<Pencil size={13} />} sx={{ minHeight: 30, fontSize: "0.75rem", color: "text.primary" }}>
                    Edit text
                  </Button>
                  <Tooltip title={`More options (${editorShortcut("box.menu")})`}>
                    <IconButton sx={toolbarIcon} aria-label="More options for the selected text" aria-haspopup="menu" aria-keyshortcuts="Shift+F10" onClick={(e) => openCardMenuFromKeys(e.currentTarget)}>
                      <MoreHorizontal size={15} />
                    </IconButton>
                  </Tooltip>
                </>
              )}
              {selection === "background" && (
                <>
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, px: 0.75 }}>Zoom</Typography>
                  <Slider size="small" min={1} max={3} step={0.05} value={layout.bgZoom} onChange={(_, v) => patch({ bgZoom: v as number })} aria-label="Background zoom" sx={{ width: 120, mx: 1, color: "text.primary" }} />
                  <Button size="small" onClick={() => patch({ bgZoom: 1, bgX: 0, bgY: 0 })} sx={{ minHeight: 30, fontSize: "0.75rem", color: "text.primary" }}>
                    Reset
                  </Button>
                  <Button size="small" onClick={() => fileInputRef.current?.click()} startIcon={<Upload size={13} />} sx={{ minHeight: 30, fontSize: "0.75rem", color: "text.primary" }}>
                    Replace
                  </Button>
                  {toolbarDivider}
                  <Button size="small" onClick={() => patch({ fit: layout.fit === "cover" ? "contain" : "cover", bgX: 0, bgY: 0 })} sx={{ minHeight: 30, fontSize: "0.75rem", color: "text.primary" }}>
                    {layout.fit === "cover" ? "Show all" : "Fill frame"}
                  </Button>
                  {orgMode && (
                    <Tooltip title="Remove the photo (Del)">
                      <IconButton sx={{ ...toolbarIcon, color: "error.main" }} aria-label="Remove photo from the card" onClick={removePhoto}>
                        <Trash2 size={15} />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title={`More options (${editorShortcut("box.menu")})`}>
                    <IconButton sx={toolbarIcon} aria-label="More options for the picture" aria-haspopup="menu" aria-keyshortcuts="Shift+F10" onClick={(e) => openCardMenuFromKeys(e.currentTarget)}>
                      <MoreHorizontal size={15} />
                    </IconButton>
                  </Tooltip>
                </>
              )}
              {!selection && orgMode && canEdit && (
                <>
                  <Button size="small" onClick={() => addLayer(LAYER_PRESETS[1])} startIcon={<Type size={13} />} sx={{ minHeight: 30, fontSize: "0.75rem", color: "text.primary" }}>
                    Add text
                  </Button>
                  {!layout.photoBox && (
                    <Button size="small" onClick={addPhoto} startIcon={<ImageIcon size={13} />} sx={{ minHeight: 30, fontSize: "0.75rem", color: "text.primary" }}>
                      Add photo
                    </Button>
                  )}
                  {toolbarDivider}
                </>
              )}
              {!selection && (
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", px: 1 }}>
                  {bgMode ? `Drawn on ${bgName}. Click the card to change the headline.` : orgMode ? "Click any text to type in it. Drag to move, pull a handle to resize." : "Click any text to type in it, or the picture to edit it. Drag to move."}
                </Typography>
              )}
            </Box>

            {orgMode && !orgImage.image && (
              <Box role={orgImage.error ? "alert" : "status"} sx={{ ...floatingSx, position: "absolute", left: 12, bottom: 12, display: "flex", alignItems: "center", gap: 1, px: 1.25, height: 36, borderRadius: "8px", fontSize: "0.75rem" }}>
                {orgImage.error ? (
                  <>
                    {orgImage.error}
                    <Button size="small" onClick={orgImage.retry} sx={{ minHeight: 28, fontSize: "0.75rem" }}>Try again</Button>
                  </>
                ) : (
                  <>
                    <CircularProgress size={13} /> Loading {orgTpl.label}
                  </>
                )}
              </Box>
            )}

            {/* View zoom */}
            <Box sx={{ ...floatingSx, position: "absolute", right: 12, bottom: 12, display: "flex", alignItems: "center", px: 0.5, height: 36, borderRadius: "8px" }}>
              {/* Undo / Redo stay here for any selection (the text toolbar repeats them beside the font) */}
              <Tooltip title={withEditorShortcut("Undo", "edit.undo")}>
                <span>
                  <IconButton sx={toolbarIcon} aria-label="Undo" disabled={!canUndo} onClick={undo}>
                    <Undo2 size={14} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={withEditorShortcut("Redo", "edit.redo")}>
                <span>
                  <IconButton sx={toolbarIcon} aria-label="Redo" disabled={!canRedo} onClick={redo}>
                    <Redo2 size={14} />
                  </IconButton>
                </span>
              </Tooltip>
              {toolbarDivider}
              <IconButton sx={toolbarIcon} aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}>
                <Minus size={14} />
              </IconButton>
              <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, width: 42, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{Math.round(zoom * 100)}%</Typography>
              <IconButton sx={toolbarIcon} aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))}>
                <Plus size={14} />
              </IconButton>
              <Tooltip title="Fit to screen">
                <IconButton sx={toolbarIcon} aria-label="Fit to screen" onClick={() => setZoom(1)}>
                  <Maximize size={14} />
                </IconButton>
              </Tooltip>
              {toolbarDivider}
              <Tooltip title={withEditorShortcut("Keyboard shortcuts", "help.keys")}>
                <IconButton sx={toolbarIcon} aria-label="Keyboard shortcuts" aria-keyshortcuts={ariaKeyShortcuts(keysById(EDITOR_KEYS, "help.keys"))} onClick={() => setSheetOpen(true)}>
                  <Keyboard size={14} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
            {isVideo && !phase1 && !orgMode && duration > 0 && segments.length > 0 && (
              <VideoTimeline
                media={media}
                duration={duration}
                playhead={playhead}
                segments={segments}
                selected={selectedClip}
                onSelect={setSelectedClip}
                onSegmentsChange={setSegments}
                onSeek={seek}
                paused={videoPaused}
                onTogglePlay={() => setVideoPaused((p) => !p)}
                texts={timelineTexts}
                selectedText={selection === "headline" || selection?.startsWith("layer:") ? selection : null}
                onSelectText={selectTimelineText}
                onTextTiming={(key, span) => setMotion(key, span)}
                sound={sound}
                onToggleSound={() => setSound((v) => !v)}
              />
            )}
          </Box>

          {/* Post panel */}
          <Box id="post-editor-post-panel" sx={{ order: { xs: 3, lg: 0 }, flexShrink: 0, p: 2, overflowY: { lg: "auto" }, display: "flex", flexDirection: "column", gap: 2.5, backgroundColor: "background.paper", borderLeft: { lg: "1px solid" }, borderColor: "divider", ...(rightFolded && foldedPanelSx) }}>
            {phase1 && live && (
              <Phase1Checks
                story={live.draft.story}
                takenBy={takenBy}
                notPosted={notPosted}
                retry={
                  <Button color="inherit" size="small" variant="outlined" onClick={() => requestPost("button")} disabled={!canCopyPost} sx={{ whiteSpace: "nowrap", borderColor: "rgba(255,255,255,0.7)" }}>
                    Retry
                  </Button>
                }
              />
            )}
            {live && (live.lease.kind !== "mine" || stale !== null || (exportsVideo && isX)) && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {live.lease.kind === "held" && (
                  <Alert severity="info" sx={{ fontSize: "0.8125rem", borderRadius: "8px" }} action={desk?.canAct ? <Button color="inherit" size="small" onClick={() => void claimAgain()} disabled={!!busy}>Try again</Button> : undefined}>
                    {live.lease.name} is working on this story. You can look, but not change it.
                  </Alert>
                )}
                {live.lease.kind === "lost" && (
                  <Alert severity="warning" sx={{ fontSize: "0.8125rem", borderRadius: "8px" }} action={<Button color="inherit" size="small" onClick={() => void claimAgain()} disabled={!!busy}>Claim again</Button>}>
                    You no longer hold this story, so changes aren&apos;t being saved. Claim it again to carry on.
                  </Alert>
                )}
                {live.lease.kind === "read" && (
                  <Alert severity="info" sx={{ fontSize: "0.8125rem", borderRadius: "8px" }}>
                    {desk?.canAct ? "This story can't be edited right now." : "Your role can view posts but not publish them."}
                  </Alert>
                )}
                {stale !== null && (
                  <Alert severity="warning" sx={{ fontSize: "0.8125rem", borderRadius: "8px" }}>
                    Someone else saved this story after you opened it. Load their version, or keep yours and save over it.
                    <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                      <Button size="small" variant="outlined" color="inherit" onClick={() => void loadTheirs()} disabled={!!busy}>Load theirs</Button>
                      <Button size="small" color="inherit" onClick={() => void keepMine()} disabled={!!busy}>Keep mine</Button>
                    </Box>
                  </Alert>
                )}
                {exportsVideo && isX && (
                  <Alert severity="info" sx={{ fontSize: "0.8125rem", borderRadius: "8px" }}>
                    Video posting is not enabled yet. Post to {meta.short} sends the card only.
                  </Alert>
                )}
              </Box>
            )}
            <Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.75 }}>
                <Typography sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>{isX ? "Tweet" : platform === "Facebook" ? "Post text" : "Caption"}</Typography>
                <Box sx={{ display: "flex", gap: 0.25 }}>
                  <Button size="small" onClick={makeCrisp} startIcon={<Scissors size={13} />} sx={{ minHeight: 30, fontSize: "0.75rem" }}>
                    Fit to 280
                  </Button>
                  <Button size="small" onClick={() => setText(withBody(text, item.shortText, splitOpts))} sx={{ minHeight: 30, fontSize: "0.75rem", color: "text.secondary" }}>
                    Revert to original
                  </Button>
                </Box>
              </Box>
              {live?.draft.rewrite && <RewriteNotice rewrite={live.draft.rewrite} />}
              <TextField multiline minRows={isX ? 4 : 5} maxRows={10} fullWidth size="small" value={text} onChange={(e) => setText(e.target.value)} onBlur={settleBox} slotProps={{ htmlInput: { "aria-label": `${isX ? "Tweet" : platform === "Facebook" ? "Post" : "Caption"} text`, readOnly: !!live && !canEdit } }} sx={fieldSx} />
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mt: 0.75 }}>
                <LinearProgress variant="determinate" value={Math.min(100, (used / limits.text) * 100)} color={counterTone(used, limits.text, isX)} sx={{ flex: 1, height: 4, borderRadius: 2 }} />
                <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: `${counterTone(used, limits.text, isX)}.main` }}>
                  {used} / {limits.text}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", mt: 0.25 }}>
                This is the post exactly as it is copied. Hashtags and mentions on its last line are the ones ticked below.
              </Typography>
              {postBox.problem && (
                <Alert severity="warning" sx={{ mt: 1, py: 0, fontSize: "0.75rem", borderRadius: "8px" }}>
                  {postBox.problem}
                </Alert>
              )}
              {url && (
                <Alert severity="error" sx={{ mt: 1, py: 0, fontSize: "0.75rem", borderRadius: "8px" }}>
                  X posts can&apos;t carry links. &ldquo;{url}&rdquo; would make this post cost about 13 times more (roughly $0.20 instead of $0.015). Remove it to post.
                </Alert>
              )}
            </Box>
            <TagPicker label="Hashtags" prefix="#" options={hashtagRows} max={hashtagMax} onChange={(o) => pickTags("#", o)} disabled={!!live && !canEdit} />
            <TagPicker label="Mentions" prefix="@" options={mentionRows} max={mentionMax} onChange={(o) => pickTags("@", o)} disabled={!!live && !canEdit} />
            {live && (
              <Box>
                {(ownCard && canEdit) || busy === "card" || (bgMode && bg.status === "drawing") ? (
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 1 }}>
                    {(busy === "card" || (bgMode && bg.status === "drawing")) && <CircularProgress size={12} aria-label="Working" />}
                    {ownCard && canEdit && (
                      <Button size="small" onClick={() => void switchToAutoCard()} disabled={!!busy} startIcon={<RotateCcw size={13} />} sx={{ minHeight: 30, fontSize: "0.75rem", color: "text.secondary", whiteSpace: "nowrap" }}>
                        Use automatic card
                      </Button>
                    )}
                  </Box>
                ) : null}
                {bgMode && bg.status === "ready" && bg.card?.cut && (
                  <Alert severity="warning" sx={{ mt: 1, py: 0, fontSize: "0.75rem", borderRadius: "8px" }}>
                    The story is too long for the box even at the smallest size, so its end is cut. Shorten the headline, or design the card here.
                  </Alert>
                )}
                {!bgMode && !serverView && (orgTemplates.length ? cardTemplate : activeTemplate) && canEdit && (
                  <Button size="small" onClick={useOwnBackground} disabled={!!busy} startIcon={<ImageIcon size={13} />} sx={{ mt: 0.5, minHeight: 30, px: 0.5, fontSize: "0.75rem" }}>
                    {useBgLabel}
                  </Button>
                )}
                {isX && cardTemplates?.data && !cardTemplate && !orgTemplates.length && (
                  <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", mt: 0.75 }}>
                    Upload your X background in Templates to have every card drawn on it.
                  </Typography>
                )}
              </Box>
            )}

            <Box sx={{ position: { lg: "sticky" }, bottom: { lg: -16 }, mt: "auto", mx: -2, mb: -2, px: 2, py: 1.25, backgroundColor: "background.paper", borderTop: "1px solid", borderColor: "divider" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                {phase1 && live && (live.draft.story.needsCheck as readonly string[] | undefined)?.includes("resaved") && (
                  <Tooltip title={needsCheckHint("resaved")}>
                    <Box component="span" role="note" sx={{ flexShrink: 1, minWidth: 0, px: 0.75, py: 0.25, borderRadius: "6px", border: "1px solid", borderColor: "warning.main", color: "warning.dark", fontSize: "0.6875rem", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {needsCheckLabel("resaved")}
                    </Box>
                  </Tooltip>
                )}
                <Button color="error" onClick={() => setDialog("reject")} disabled={!canEdit || !mayReject || !!busy} startIcon={<Ban size={14} />} sx={{ minHeight: 34, minWidth: 0, px: 1 }}>
                  Reject
                </Button>
                <Box sx={{ flex: 1 }} />
                <Button variant="outlined" onClick={save} disabled={!canEdit || !!busy} aria-keyshortcuts={ariaKeyShortcuts(keysById(EDITOR_KEYS, "post.save"))} startIcon={busy === "save" ? <CircularProgress size={13} color="inherit" /> : <Save size={14} />} sx={{ minHeight: 34, minWidth: 0, px: 1.25, whiteSpace: "nowrap" }}>
                  Save draft
                </Button>
                <Tooltip title={live ? "Scheduling isn't available on the live desk yet" : blockedReason}>
                  <span>
                    <Button variant="outlined" onClick={() => setDialog("schedule")} disabled={!canPost || !mayPublish || !!live} startIcon={<CalendarClock size={14} />} sx={{ minHeight: 34, minWidth: 0, px: 1.25 }}>
                      Schedule
                    </Button>
                  </span>
                </Tooltip>
              </Box>
              {savedAt && (
                <Typography sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.4, mt: 0.5, fontSize: "0.6875rem", color: "text.secondary" }}>
                  <Check size={12} /> Draft saved at {savedAt}
                </Typography>
              )}
            </Box>
          </Box>

          {/* Panel edges: drag to resize, buttons to fold (desktop only) */}
          {wide && (
            <>
              <PanelResizeHandle panel={leftPanel} offset={EDITOR_PANELS.leftFixed + leftPanel.width} label="tool panel" controls="post-editor-tool-panel" />
              {!rightPanel.collapsed && <PanelResizeHandle panel={rightPanel} offset={rightPanel.width} label="post panel" controls="post-editor-post-panel" />}
              <FoldedPanelStrip panel={rightPanel} label="post panel" title={isX ? "Tweet" : platform === "Facebook" ? "Post text" : "Caption"} controls="post-editor-post-panel" />
            </>
          )}
        </Box>
      </Box>

      <input ref={fileInputRef} type="file" accept="image/*,video/*" hidden onChange={handleUpload} />

      {/* Preview */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: "14px", backgroundImage: "none" } } }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2.5, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
          <Eye size={17} />
          <Typography sx={{ fontWeight: 700, fontSize: "1rem" }}>How it will look on {meta.short}</Typography>
          <IconButton size="small" onClick={() => setPreviewOpen(false)} aria-label="Close preview" sx={{ ml: "auto" }}>
            <CloseIcon size={18} />
          </IconButton>
        </Box>
        <Box sx={{ p: 2.5, backgroundColor: "action.hover", overflowY: "auto" }}>
          <Box sx={{ maxWidth: isX ? 520 : 380, mx: "auto" }}>
            <PostMock platform={platform} text={finalText}>
              {previewOpen && bgMode && bg.card && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={bg.card.url} alt={`Card on ${bgName}`} style={{ display: "block", width: `min(100%, calc(58vh * ${bgFrame.w} / ${bgFrame.h}))` }} />
              )}
              {previewOpen && !bgMode && <TemplateCanvas backdrop={backdrop} media={media} format={format} handle={`@${meta.handle}`} tag={item.tag} layout={layout} style={{ width: `min(100%, calc(58vh * ${frame.w} / ${frame.h}))` }} />}
            </PostMock>
          </Box>
        </Box>
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, px: 2.5, py: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
          <Button onClick={() => setPreviewOpen(false)}>Back to editing</Button>
          {actionButtons(false)}
        </Box>
      </Dialog>

      {dialog === "reject" && (
        <RejectDialog
          open
          headline={item.headline}
          onClose={() => setDialog(null)}
          onConfirm={(reason, note) => {
            if (live) {
              setDialog(null);
              void rejectLive(reason, note);
              return;
            }
            rejectDraft(buildPayload(), reason, note);
            onClose();
          }}
        />
      )}
      {dialog === "schedule" && (
        <ScheduleDialog
          open
          headline={item.headline}
          initial={draft?.status === "scheduled" ? draft.scheduledFor : undefined}
          onClose={() => setDialog(null)}
          onConfirm={(when) => {
            scheduleDraft(buildPayload(), when);
            onClose();
          }}
        />
      )}

      {cardMenu.element}
      <EditorShortcutsSheet open={sheetOpen} onClose={() => setSheetOpen(false)} copyPosted={copyMode} />
      <ConfirmPostDialog
        open={confirmPost !== null}
        title={confirmPost === "demo" ? "Save this story as posted?" : "This text is too close to the source. Post anyway?"}
        text={
          confirmPost === "demo"
            ? `This downloads the ${isVideo ? "clip" : "card"} and marks the story posted on ${meta.short}. There is no undo.`
            : `The reworded text still repeats much of what the publishers wrote. Reword it before posting, or post it to ${meta.short} as it is.`
        }
        confirmLabel={confirmPost === "demo" ? "Save as posted" : copyMode ? "Copy & Mark Posted anyway" : "Post anyway"}
        onConfirm={postNow}
        onCancel={() => setConfirmPost(null)}
      />
      <LeaveEditorDialog open={leaving} busy={busy === "save"} onSave={() => void saveAndLeave()} onDiscard={discardAndLeave} onStay={() => setLeaving(false)} />

      {linkOpen && <PostedLinkDialog open headline={item.headline} platformName={meta.short} busy={busy === "posted"} onClose={() => setLinkOpen(false)} onConfirm={markPostedLive} />}

      <Snackbar open={!!notice} autoHideDuration={5000} onClose={() => setNotice("")} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity="warning" onClose={() => setNotice("")} sx={{ fontSize: "0.8125rem" }}>
          {notice}
        </Alert>
      </Snackbar>
    </Dialog>
  );
}

/**
 * Phase 1, above the post: the file's badges, why it needs a second look (an update of a posted story among
 * them), and the Copy & Mark Posted banners (already posted by someone, or copied but not marked).
 */
function Phase1Checks({ story, takenBy, notPosted, retry }: { story: DraftView["story"]; takenBy: string | null; notPosted: string | null; retry: React.ReactNode }) {
  // "File re-saved" sits beside Reject in the action row instead
  const reasons = shownNeedsCheck(story.needsCheck).filter((r) => r !== "resaved");
  // The BIG / UPDATE tags are no longer shown in the studio, so only the reasons and the banners need room
  if (!reasons.length && !takenBy && !notPosted) return null;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {takenBy && (
        <Alert severity="error" variant="filled" role="alert" sx={{ fontSize: "0.8125rem", borderRadius: "8px" }}>
          {takenBy}
        </Alert>
      )}
      {notPosted && !takenBy && (
        <Alert severity="error" variant="filled" role="alert" action={retry} sx={{ fontSize: "0.8125rem", borderRadius: "8px", alignItems: "center" }}>
          <b>NOT marked as posted. Do not paste this.</b> {notPosted} The clipboard was emptied where the browser allowed it.
        </Alert>
      )}

      {reasons.length > 0 && (
        <Alert severity="warning" sx={{ fontSize: "0.8125rem", borderRadius: "8px", "& .MuiAlert-message": { width: "100%" } }}>
          <Box component="ul" sx={{ m: 0, pl: 2, display: "flex", flexDirection: "column", gap: 0.5 }}>
            {reasons.map((r) => (
              <li key={r}>
                <b>{needsCheckLabel(r)}.</b> {needsCheckHint(r)}
              </li>
            ))}
          </Box>
        </Alert>
      )}
    </Box>
  );
}
