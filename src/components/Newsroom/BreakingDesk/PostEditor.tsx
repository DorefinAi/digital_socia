"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Typography, Button, TextField, Dialog, IconButton, Slider, Switch, Tooltip, LinearProgress, Alert, Snackbar, CircularProgress } from "@mui/material";
import {
  X as CloseIcon,
  ArrowLeft,
  Eye,
  Send,
  Download,
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
} from "lucide-react";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { Playhead, usePlayhead, usePlayheadTime } from "@/hooks/usePlayhead";
import { CardTextLayer, CardTextStyle, FtpMedia, FtpNewsItem, MediaAdjust, PostPayload, ROLE_LABELS, SocialPlatform, TextMotion } from "@/types/newsroom";
import TemplateCanvas, {
  BREAKING_RED,
  CanvasSelection,
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
import { PLATFORM_META, PlatformIcon, srOnly, TAG_TINT, tagTint } from "./shared";
import { PostMock, TagOption, TagPicker, fieldSx, sectionLabel } from "./composerParts";
import VideoTimeline, { CLIP_SPEEDS, TimelineText, clock, outputLength } from "./VideoTimeline";
import TextControls, { ALIGN_ICONS, FontSelect } from "./TextControls";
import TemplatePicker from "./TemplatePicker";
import { ENTER_SECONDS, MEDIA_LOOKS, TEXT_ANIMATIONS, accentFor, inkOn, mediaFilter, mediaWarmth, resolveHeadlineStyle, resolveLayerStyle, templateById, templatePatch, textSpan, warmthColor } from "./cardRender";
import { fontById, nearestWeight } from "./templateFonts";
import FtpFeedPanel from "./FtpFeedPanel";
import { DAILY_CAP, isLiveOn } from "@/data/socialDesk";

type Tool = "ftp" | "template" | "background" | "text" | "video" | "story";

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
const BACKDROPS = ["blur", "#000000", "#FFFFFF", BREAKING_RED] as const;


const chromeButton = {
  color: "#fff",
  borderRadius: "8px",
  minHeight: 34,
  px: 1.25,
  fontSize: "0.8125rem",
  "&:hover": { backgroundColor: "rgba(255,255,255,0.1)" },
};

const toolbarIcon = { borderRadius: "6px", width: 30, height: 30, color: "text.primary" };
const toolbarDivider = <Box sx={{ width: "1px", height: 20, backgroundColor: "divider", mx: 0.5 }} />;
const panelTitle = { fontSize: "0.9375rem", fontWeight: 700, mb: 1.5 };
const floatingSx = { backgroundColor: "background.paper", border: "1px solid", borderColor: "divider", boxShadow: "0 4px 14px rgba(0,0,0,0.08)" };

/** Longest text the card template takes; the font shrinks to fit anything up to this. */
const CARD_TEXT_MAX = 500;

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
  item: FtpNewsItem;
  platform: SocialPlatform;
  onClose: () => void;
  /** Opens another FTP story in the editor */
  onSwitch?: (item: FtpNewsItem) => void;
  /** Lets the desk confirm what happened after the editor closes */
  onSaved?: (message: string) => void;
}

export default function PostEditor({ item, platform, onClose, onSwitch, onSaved }: PostEditorProps) {
  const { publishSocialPost, saveDraft, scheduleDraft, rejectDraft, socialDrafts, socialPosts, hashtagRules, handleDirectory, permissions, currentRole } = useNewsroom();
  const isX = platform === "X (Twitter)";

  // Everything that belongs to one story. Reopening a saved or scheduled story picks up where the operator left off.
  const storyStart = (story: FtpNewsItem) => {
    const draft = socialDrafts.find((d) => d.newsId === story.id && d.platform === platform && (d.status === "saved" || d.status === "scheduled"));
    const igFormat: TemplateFormat = draft?.format === "ig_post" || draft?.format === "ig_reel" ? draft.format : story.media[0].kind === "video" ? "ig_reel" : "ig_post";
    return {
      id: story.id,
      draft,
      igFormat,
      mediaIndex: Math.max(0, story.media.findIndex((m) => m.fileName === draft?.mediaFile)),
      layout: draft?.layout ?? defaultLayout(defaultCardText(story), isX ? "x" : igFormat),
      text: draft?.caption ?? story.shortText,
      hashtags: withDraftChoices(suggestHashtags(story, hashtagRules), draft?.hashtags),
      mentions: withDraftChoices(suggestMentions(story, platform, handleDirectory), draft?.mentions),
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

  const [layout, setLayout] = useState<TemplateLayout>(start.layout);
  // Card versions for undo and redo; a version is kept once the card has been still for a moment
  const [history, setHistory] = useState({ stack: [start.layout], index: 0 });
  const [tool, setTool] = useState<Tool>("ftp");
  const [selection, setSelection] = useState<CanvasSelection>(null);
  const [zoom, setZoom] = useState(1);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  const [text, setText] = useState(start.text);
  const [hashtags, setHashtags] = useState<TagOption[]>(start.hashtags);
  const [mentions, setMentions] = useState<TagOption[]>(start.mentions);
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

  // Switching stories swaps the story's state in place. The editor stays mounted, so the
  // screen does not flash and the feed, tool panel and zoom stay where the operator left them.
  if (start.id !== item.id) {
    const next = storyStart(item);
    setStart(next);
    setUploads([]);
    setMediaIndex(next.mediaIndex);
    setIgFormat(next.igFormat);
    setLayout(next.layout);
    setHistory({ stack: [next.layout], index: 0 });
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
  // The Video tab only exists for video stories
  const panel: Tool = tool === "video" && !isVideo ? "background" : tool;
  const frame = TEMPLATE_FORMATS[format];
  const fit = Math.max(0.05, Math.min(stage.w / frame.w, stage.h / frame.h));
  const frameWidth = Math.round(frame.w * fit * zoom);

  const selectedHashtags = useMemo(() => hashtags.filter((h) => h.checked).map((h) => h.value), [hashtags]);
  const selectedMentions = useMemo(() => mentions.filter((m) => m.checked).map((m) => m.value), [mentions]);
  const finalText = composePostText(text, selectedMentions, selectedHashtags);
  const used = countChars(finalText, platform);
  const overLimit = used > limits.text;
  const tooManyTags = selectedHashtags.length > limits.hashtags || selectedMentions.length > limits.mentions;
  // Saving a post counts against the platform's daily cap
  const cap = DAILY_CAP[platform];
  const today = new Date().toDateString();
  const postedToday = socialPosts.filter((p) => p.platform === platform && p.status !== "recalled" && new Date(p.postedAt).toDateString() === today).length;
  const capReached = postedToday >= cap;
  const alreadyPosted = isLiveOn(socialPosts, item.id, platform);

  // Links multiply the cost of an X post, so the X formatter refuses them outright
  const url = isX ? findUrl(finalText) : null;
  const canPost = permissions.canApproveSocialContent && !overLimit && !tooManyTags && !url && !capReached && text.trim().length > 0 && layout.headline.trim().length > 0;

  let blockedReason = "";
  if (!permissions.canApproveSocialContent) blockedReason = "Your role can view posts but not publish them";
  else if (!text.trim()) blockedReason = `Write the ${meta.postNoun} first`;
  else if (!layout.headline.trim()) blockedReason = "The template needs a headline";
  else if (overLimit) blockedReason = `${used - limits.text} characters over the ${meta.short} limit`;
  else if (tooManyTags) blockedReason = "Too many hashtags or mentions selected";
  else if (url) blockedReason = `Remove the link "${url}" first`;
  else if (capReached) blockedReason = `Today's ${meta.short} cap of ${cap} posts is reached`;

  const patch = (changes: Partial<TemplateLayout>) => setLayout((l) => ({ ...l, ...changes }));

  // ── Undo and redo ──
  useEffect(() => {
    const timer = setTimeout(() => {
      setHistory((h) => {
        if (h.stack[h.index] === layout) return h;
        const stack = [...h.stack.slice(0, h.index + 1), layout].slice(-80);
        return { stack, index: stack.length - 1 };
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [layout]);
  const pendingChange = layout !== history.stack[history.index];
  const canUndo = pendingChange || history.index > 0;
  const canRedo = !pendingChange && history.index < history.stack.length - 1;
  const undo = () => {
    if (pendingChange) {
      // Keep the unsaved change so redo can bring it back
      setHistory((h) => ({ stack: [...h.stack.slice(0, h.index + 1), layout], index: h.index }));
      setLayout(history.stack[history.index]);
    } else if (history.index > 0) {
      setHistory((h) => ({ ...h, index: h.index - 1 }));
      setLayout(history.stack[history.index - 1]);
    }
  };
  const redo = () => {
    if (!canRedo) return;
    setHistory((h) => ({ ...h, index: h.index + 1 }));
    setLayout(history.stack[history.index + 1]);
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

  const editText = (target: CanvasSelection = "headline") => {
    select(target);
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
    const style: CardTextStyle = preset.id === "label" ? { ...preset.style, boxColor: accent, color: inkOn(accent) } : preset.style;
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
    : { value: layout.fontScale, min: 0.5, max: 1.8, step: 0.05, format: (v: number) => `${Math.round(v * 100)}%`, onChange: (fontScale: number) => patch({ fontScale }) };
  const nudgeSize = (direction: 1 | -1) => textSize.onChange(+Math.max(textSize.min, Math.min(textSize.max, textSize.value + direction * (activeLayer ? 4 : 0.05))).toFixed(2));

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

  // Shortcuts on the canvas: undo, redo, delete a text box, nudge with the arrow keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || previewOpen) return;
      const typing = (e.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']");
      if (typing) return;
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.metaKey || e.ctrlKey) && key === "y") {
        e.preventDefault();
        redo();
      } else if (layerId && (key === "delete" || key === "backspace")) {
        e.preventDefault();
        removeLayer(layerId);
      } else if (key.startsWith("arrow") && (layerId || selection === "headline")) {
        e.preventDefault();
        const step = e.shiftKey ? 0.02 : 0.005;
        const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
        const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
        if (activeLayer) patchLayer(activeLayer.id, { x: Math.max(0, Math.min(1, activeLayer.x + dx)), y: Math.max(0, Math.min(1, activeLayer.y + dy)) });
        else patch({ textY: Math.max(0.05, Math.min(0.95, layout.textY + dy)) });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const chooseMedia = (index: number) => {
    setMediaIndex(index);
    setSelection("background");
    setDuration(0);
    setSegments([]);
    setSelectedClip(null);
    playhead.set(0);
    patch({ bgZoom: 1, bgX: 0, bgY: 0 });
  };

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
    link.download = `${item.id}-${format}.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
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

  const makeCrisp = () => {
    const tagBudget = countChars(composePostText("", selectedMentions, selectedHashtags), platform);
    const budget = limits.text - tagBudget - (tagBudget ? 2 : 0);
    const source = countChars(text.trim(), platform) > budget ? text : item.shortText;
    setText(shortenToFit(source, Math.min(budget, isX ? 200 : 400), platform));
  };


  const buildPayload = (): PostPayload => {
    const cover = item.media[0];
    return {
      newsId: item.id,
      platform,
      headline: item.headline,
      text: finalText,
      caption: text,
      hashtags: selectedHashtags,
      mentions: selectedMentions,
      mediaKind: media.kind,
      thumbUrl: canvasRef.current?.snapshot(320) ?? media.posterUrl ?? cover.posterUrl ?? cover.url,
      postedBy: ROLE_LABELS[currentRole],
      format,
      mediaFile: media.fileName,
      layout,
      clipSegments: media.kind === "video" && segments.length ? segments : undefined,
    };
  };

  // Operators post by hand: Copy puts the post text on the clipboard, Save downloads the card or clip
  // and marks the story posted, which is what moves it to Published and counts against the cap.
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(finalText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice("The browser blocked the clipboard. Select the text in the box and copy it by hand.");
    }
  };

  const saveAsPosted = async () => {
    if (!canPost) return;
    const ok = isVideo ? await exportVideo() : canvasRef.current?.download(`${item.id}-${format}.png`) ?? false;
    if (!ok) {
      if (!isVideo) setNotice("This media file does not allow image export from the browser, so nothing was saved.");
      return;
    }
    publishSocialPost(buildPayload());
    setPreviewOpen(false);
    onSaved?.(`Saved. "${item.headline}" is marked as posted on ${meta.short}.`);
    onClose();
  };

  const save = () => {
    saveDraft(buildPayload());
    setSavedAt(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }));
  };

  // Below md the top bar is crowded (Instagram adds the format switch), so Copy
  // is icon-only and Save is shortened; full labels return from 900px
  const iconOnlyOnPhone = { flexShrink: 0, minWidth: { xs: 0, md: 64 }, "& .MuiButton-startIcon": { mr: { xs: 0, md: 1 }, ml: { xs: 0, md: -0.5 } } };
  const phoneLabel = (full: string, short?: string) => (
    <>
      <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>{full}</Box>
      {short && <Box component="span" sx={{ display: { xs: "inline", md: "none" } }}>{short}</Box>}
    </>
  );

  const actionButtons = (onDark: boolean) => (
    <>
      <Tooltip title={copied ? "Copied" : `Copy the ${meta.postNoun} with hashtags and mentions`}>
        <Button onClick={copyText} aria-label={copied ? "Copied" : "Copy"} startIcon={copied ? <Check size={15} /> : <Copy size={15} />} sx={onDark ? { ...chromeButton, border: `1px solid ${BAR.border}`, ...iconOnlyOnPhone } : { minHeight: 34 }} variant={onDark ? "text" : "outlined"}>
          {onDark ? phoneLabel(copied ? "Copied" : "Copy") : copied ? "Copied" : "Copy"}
        </Button>
      </Tooltip>
      <Tooltip title={blockedReason || `Downloads the ${isVideo ? "clip" : "card"} and marks this story posted on ${meta.short}`}>
        <span>
          <Button
            variant="contained"
            onClick={saveAsPosted}
            aria-label={exporting !== null ? `Saving ${Math.round(exporting * 100)}%` : alreadyPosted ? "Save again" : "Save as posted"}
            disabled={!canPost || exporting !== null}
            startIcon={exporting !== null ? <CircularProgress size={14} sx={{ color: "#fff" }} variant="determinate" value={Math.max(4, exporting * 100)} /> : <Save size={15} />}
            sx={{ minHeight: 34, fontWeight: 700, whiteSpace: "nowrap", backgroundColor: BREAKING_RED, color: "#fff", "&:hover": { backgroundColor: "#B50F14" }, "&.Mui-disabled": { backgroundColor: "rgba(215,20,26,0.35)", color: "rgba(255,255,255,0.7)" } }}
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
    </>
  );

  return (
    <Dialog open fullScreen onClose={onClose} transitionDuration={150} slotProps={{ paper: { sx: { borderRadius: 0, backgroundImage: "none", backgroundColor: "background.default" } } }}>
      <Box sx={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
        {/* Top bar */}
        <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.5, sm: 1 }, px: { xs: 1, sm: 1.5 }, height: 54, flexShrink: 0, backgroundColor: BAR.bg, color: "#fff" }}>
          <Button onClick={onClose} aria-label="Back to desk" sx={{ ...chromeButton, minWidth: 0, flexShrink: 0, gap: 0.75 }}>
            <ArrowLeft size={16} />
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
              Desk
            </Box>
          </Button>
          <Box sx={{ display: { xs: "none", sm: "block" }, width: "1px", height: 22, backgroundColor: BAR.border, mx: 0.5 }} />
          <Box sx={{ display: { xs: "none", sm: "contents" } }}>
            <PlatformIcon platform={platform} size={16} />
          </Box>
          {/* The tint behind the headline carries the tag (yellow Big Breaking, red Breaking) */}
          <Typography sx={{ display: { xs: "none", sm: "block" }, flex: 1, minWidth: 0, px: 1, py: 0.5, borderRadius: "6px", background: tagTint(item.tag, "dark", 1.4), fontSize: "0.875rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <Box component="span" sx={srOnly}>{TAG_TINT[item.tag].label}: </Box>
            {item.headline}
          </Typography>
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
          <Button onClick={() => setPreviewOpen(true)} aria-label="Preview" sx={{ ...chromeButton, minWidth: 0, flexShrink: 0, gap: 0.75, border: `1px solid ${BAR.border}` }}>
            <Eye size={15} />
            <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>
              Preview
            </Box>
          </Button>
          <Tooltip title={`${meta.short} posts saved today against the daily cap`}>
            <Typography sx={{ display: { xs: "none", md: "block" }, px: 0.75, fontSize: "0.75rem", fontVariantNumeric: "tabular-nums", color: capReached ? "#FF8A80" : BAR.text, whiteSpace: "nowrap" }}>
              {postedToday} / {cap} today
            </Typography>
          </Tooltip>
          {actionButtons(true)}
        </Box>

        {/* Workspace */}
        <Box sx={{ flex: 1, minHeight: 0, display: { xs: "flex", lg: "grid" }, flexDirection: "column", gridTemplateColumns: "72px 280px minmax(0, 1fr) 340px", overflowY: { xs: "auto", lg: "hidden" } }}>
          {/* Tool rail */}
          <Box role="tablist" aria-label="Design tools" sx={{ order: { xs: 1, lg: 0 }, flexShrink: 0, display: "flex", flexDirection: { xs: "row", lg: "column" }, gap: 0.5, p: 0.75, backgroundColor: "background.paper", borderRight: { lg: "1px solid" }, borderTop: { xs: "1px solid", lg: "none" }, borderColor: "divider" }}>
            {TOOLS.filter((t) => !t.videoOnly || isVideo).map((t) => (
              <Box
                key={t.id}
                component="button"
                role="tab"
                aria-selected={panel === t.id}
                onClick={() => setTool(t.id)}
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

          {/* Tool panel */}
          <Box role="tabpanel" sx={{ order: { xs: 2, lg: 0 }, flexShrink: 0, p: 2, overflowY: { lg: "auto" }, backgroundColor: "background.paper", borderRight: { lg: "1px solid" }, borderColor: "divider" }}>
            {panel === "ftp" && (
              <FtpFeedPanel
                platform={platform}
                currentId={item.id}
                onPick={(next) => {
                  // Keep the operator's work before switching stories
                  // A clip export in progress belongs to the current story
                  if (exporting !== null) return;
                  if (edited && permissions.canApproveSocialContent) saveDraft(buildPayload());
                  onSwitch?.(next);
                }}
              />
            )}

            {panel === "background" && (
              <>
                <Typography sx={panelTitle}>Background</Typography>
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

            {panel === "template" && (
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

            {panel === "text" && (
              <>
                {/* Which text is being edited: the card headline or one of the extra boxes */}
                <Box role="group" aria-label="Text on the card" sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1.5 }}>
                  {[{ key: "headline" as CanvasSelection, label: "Card text" }, ...(layout.layers ?? []).map((l, i) => ({ key: `layer:${l.id}` as CanvasSelection, label: l.text.trim().slice(0, 14) || `Text ${i + 1}` }))].map(({ key, label }) => {
                    const on = key === "headline" ? !activeLayer : selection === key;
                    return (
                      <Box key={key} component="button" aria-pressed={on} onClick={() => select(key)} sx={{ px: 1.1, py: 0.5, borderRadius: "999px", border: "1px solid", borderColor: on ? "text.primary" : "divider", backgroundColor: on ? "text.primary" : "transparent", color: on ? "background.paper" : "text.primary", fontFamily: "inherit", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {label}
                      </Box>
                    );
                  })}
                </Box>

                <TextField
                  multiline
                  minRows={activeLayer ? 3 : 6}
                  maxRows={14}
                  slotProps={{ htmlInput: { maxLength: activeLayer ? 300 : CARD_TEXT_MAX, "aria-label": activeLayer ? "Text box words" : "Card text" } }}
                  helperText={activeLayer ? "Drag the box on the card to place it." : `${layout.headline.length} / ${CARD_TEXT_MAX} characters. The text shrinks to fit the card.`}
                  fullWidth
                  size="small"
                  value={textValue}
                  inputRef={headlineInputRef}
                  onFocus={() => !activeLayer && setSelection("headline")}
                  onChange={(e) => setTextValue(e.target.value)}
                  sx={{ ...fieldSx, "& textarea": { fontWeight: 600 } }}
                />
                <Box sx={{ display: "flex", gap: 0.5, mt: 0.5, flexWrap: "wrap" }}>
                  <Button size="small" onClick={highlightSelection} startIcon={<Highlighter size={13} />} sx={{ fontSize: "0.75rem", color: "text.primary" }}>
                    Highlight selected words
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
                  autoColor={activeLayer ? undefined : { active: layout.color === "auto", onPick: () => patch({ color: "auto" }) }}
                  onReset={resetTextStyle}
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

                {!activeLayer && (
                  <Button size="small" onClick={() => setLayout((l) => ({ ...defaultLayout(defaultCardText(item), format), ...templatePatch(templateById(l.template), format), accent: l.accent, layers: l.layers, fit: l.fit, backdrop: l.backdrop, bgZoom: l.bgZoom, bgX: l.bgX, bgY: l.bgY, adjust: l.adjust, flipX: l.flipX, volume: l.volume, fadeIn: l.fadeIn, fadeOut: l.fadeOut }))} startIcon={<RotateCcw size={13} />} sx={{ mt: 2, px: 0.5, color: "text.secondary", fontSize: "0.75rem" }}>
                    Reset card text to the FTP story
                  </Button>
                )}
              </>
            )}

            {panel === "story" && (
              <>
                <Typography sx={panelTitle}>Story from FTP</Typography>
                <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, lineHeight: 1.45 }}>{item.headline}</Typography>
                <Typography sx={{ fontSize: "0.8125rem", lineHeight: 1.7, color: "text.secondary", mt: 1 }}>{item.body}</Typography>
                <Typography sx={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono), monospace", color: "text.disabled", mt: 1.5, wordBreak: "break-all" }}>{item.ftpPath}</Typography>
              </>
            )}
          </Box>

          {/* Stage */}
          <Box sx={{ order: 0, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, flexShrink: 0 }}>
          <Box sx={{ position: "relative", flex: 1, minHeight: { xs: "52vh", lg: 0 }, backgroundColor: (t) => (t.palette.mode === "light" ? "#E9E9E6" : "#09090B") }}>
            <Box onPointerDown={(e) => e.target === e.currentTarget && setSelection(null)} sx={{ position: "absolute", inset: 0, overflow: "auto", display: "flex", p: "64px 40px 56px" }}>
              {/* Measured box: the frame is fitted to this area */}
              <Box ref={setStageEl} onPointerDown={(e) => e.target === e.currentTarget && setSelection(null)} sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>
                <TemplateCanvas
                  ref={canvasRef}
                  media={media}
                  format={format}
                  handle={`@${meta.handle}`}
                  tag={item.tag}
                  layout={layout}
                  onLayoutChange={setLayout}
                  selection={selection}
                  onSelect={select}
                  onEditText={editText}
                  paused={videoPaused}
                  sound={sound}
                  segments={segments.length ? segments : undefined}
                  onDuration={handleDuration}
                  onTime={playhead.set}
                  style={{ width: frameWidth, maxWidth: "none", maxHeight: "none", flexShrink: 0, margin: "auto", boxShadow: "0 8px 30px rgba(0,0,0,0.22)" }}
                />
              </Box>
            </Box>

            {/* Contextual toolbar */}
            <Box sx={{ ...floatingSx, position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", maxWidth: "calc(100% - 24px)", overflowX: "auto", display: "flex", alignItems: "center", gap: 0.5, px: 0.75, height: 42, borderRadius: "10px", whiteSpace: "nowrap" }}>
              {(selection === "headline" || activeLayer) && (
                <>
                  <FontSelect compact value={textStyle.font} onChange={(id) => styleText({ font: id, weight: nearestWeight(fontById(id), textStyle.weight) })} />
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
                  {/* One button cycles left, centre, right */}
                  <IconButton sx={toolbarIcon} aria-label={`Alignment: ${textStyle.align}. Change`} onClick={() => styleText({ align: textStyle.align === "left" ? "center" : textStyle.align === "center" ? "right" : "left" })}>
                    {ALIGN_ICONS[textStyle.align]}
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
                      <Tooltip title="Duplicate">
                        <IconButton sx={toolbarIcon} aria-label="Duplicate text box" onClick={() => duplicateLayer(activeLayer.id)}>
                          <CopyPlus size={15} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete (Del)">
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
                </>
              )}
              {!selection && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", px: 1 }}>Click any text or the picture to edit it. Double-click text to type.</Typography>}
            </Box>

            {/* View zoom */}
            <Box sx={{ ...floatingSx, position: "absolute", right: 12, bottom: 12, display: "flex", alignItems: "center", px: 0.5, height: 36, borderRadius: "8px" }}>
              <Tooltip title="Undo (Ctrl+Z)">
                <span>
                  <IconButton sx={toolbarIcon} aria-label="Undo" disabled={!canUndo} onClick={undo}>
                    <Undo2 size={14} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Redo (Ctrl+Shift+Z)">
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
            </Box>
          </Box>
            {isVideo && duration > 0 && segments.length > 0 && (
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
          <Box sx={{ order: { xs: 3, lg: 0 }, flexShrink: 0, p: 2, overflowY: { lg: "auto" }, display: "flex", flexDirection: "column", gap: 2.5, backgroundColor: "background.paper", borderLeft: { lg: "1px solid" }, borderColor: "divider" }}>
            <Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.75 }}>
                <Typography sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>{isX ? "Tweet" : platform === "Facebook" ? "Post text" : "Caption"}</Typography>
                <Box sx={{ display: "flex", gap: 0.25 }}>
                  <Button size="small" onClick={makeCrisp} startIcon={<Scissors size={13} />} sx={{ minHeight: 30, fontSize: "0.75rem" }}>
                    Make it crisp
                  </Button>
                  <Button size="small" onClick={() => setText(item.shortText)} sx={{ minHeight: 30, fontSize: "0.75rem", color: "text.secondary" }}>
                    Use draft
                  </Button>
                </Box>
              </Box>
              <TextField multiline minRows={isX ? 4 : 5} maxRows={10} fullWidth size="small" value={text} onChange={(e) => setText(e.target.value)} sx={fieldSx} />
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mt: 0.75 }}>
                <LinearProgress variant="determinate" value={Math.min(100, (used / limits.text) * 100)} color={overLimit ? "error" : "inherit"} sx={{ flex: 1, height: 4, borderRadius: 2 }} />
                <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: overLimit ? "error.main" : "text.secondary" }}>
                  {used} / {limits.text}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", mt: 0.25 }}>Count includes the selected mentions and hashtags.</Typography>
              {url && (
                <Alert severity="error" sx={{ mt: 1, py: 0, fontSize: "0.75rem", borderRadius: "8px" }}>
                  X posts can&apos;t carry links. &ldquo;{url}&rdquo; would make this post cost about 13 times more (roughly $0.20 instead of $0.015). Remove it to post.
                </Alert>
              )}
            </Box>
            <TagPicker label="Hashtags" prefix="#" options={hashtags} max={limits.hashtags} onChange={setHashtags} />
            <TagPicker label="Mentions" prefix="@" options={mentions} max={limits.mentions} onChange={setMentions} />

            <Box sx={{ position: { lg: "sticky" }, bottom: { lg: -16 }, mt: "auto", mx: -2, mb: -2, px: 2, py: 1.25, backgroundColor: "background.paper", borderTop: "1px solid", borderColor: "divider" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Button color="error" onClick={() => setDialog("reject")} disabled={!permissions.canApproveSocialContent} startIcon={<Ban size={14} />} sx={{ minHeight: 34, minWidth: 0, px: 1 }}>
                  Reject
                </Button>
                <Box sx={{ flex: 1 }} />
                <Button variant="outlined" onClick={save} disabled={!permissions.canApproveSocialContent} startIcon={<Save size={14} />} sx={{ minHeight: 34, minWidth: 0, px: 1.25, whiteSpace: "nowrap" }}>
                  Save draft
                </Button>
                <Tooltip title={blockedReason}>
                  <span>
                    <Button variant="outlined" onClick={() => setDialog("schedule")} disabled={!canPost} startIcon={<CalendarClock size={14} />} sx={{ minHeight: 34, minWidth: 0, px: 1.25 }}>
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
              {previewOpen && <TemplateCanvas media={media} format={format} handle={`@${meta.handle}`} tag={item.tag} layout={layout} style={{ width: `min(100%, calc(58vh * ${frame.w} / ${frame.h}))` }} />}
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

      <Snackbar open={!!notice} autoHideDuration={5000} onClose={() => setNotice("")} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity="warning" onClose={() => setNotice("")} sx={{ fontSize: "0.8125rem" }}>
          {notice}
        </Alert>
      </Snackbar>
    </Dialog>
  );
}
