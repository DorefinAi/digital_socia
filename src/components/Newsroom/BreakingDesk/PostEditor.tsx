"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Typography, Button, TextField, Dialog, IconButton, Slider, Tooltip, LinearProgress, Alert, Snackbar, CircularProgress } from "@mui/material";
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
  CalendarClock,
  Save,
  Ban,
  Image as ImageIcon,
  Type,
  FileText,
  Upload,
  AlignLeft,
  AlignCenter,
  Maximize,
  Pencil,
} from "lucide-react";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { FtpMedia, FtpNewsItem, PostPayload, ROLE_LABELS, SocialPlatform } from "@/types/newsroom";
import TemplateCanvas, {
  BREAKING_RED,
  CanvasSelection,
  DEFAULT_TEXT_Y,
  HEADLINE_COLORS,
  TEMPLATE_FORMATS,
  TemplateCanvasHandle,
  TemplateFormat,
  TemplateLayout,
  TrimRange,
  defaultLayout,
} from "./TemplateCanvas";
import { PLATFORM_LIMITS, TagSuggestion, composePostText, countChars, findUrl, shortenToFit, suggestHashtags, suggestMentions } from "./socialText";
import { RejectDialog, ScheduleDialog } from "./actionDialogs";
import { PLATFORM_META, PlatformIcon, TagChip } from "./shared";
import { PostMock, TagOption, TagPicker, fieldSx, sectionLabel } from "./composerParts";
import VideoTimeline from "./VideoTimeline";

type Tool = "background" | "text" | "story";

const TOOLS: { id: Tool; label: string; icon: React.ReactNode }[] = [
  { id: "background", label: "Background", icon: <ImageIcon size={19} /> },
  { id: "text", label: "Text", icon: <Type size={19} /> },
  { id: "story", label: "Story", icon: <FileText size={19} /> },
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
}

export default function PostEditor({ item, platform, onClose }: PostEditorProps) {
  const { queuePost, saveDraft, scheduleDraft, rejectDraft, socialDrafts, hashtagRules, handleDirectory, permissions, currentRole } = useNewsroom();
  // Reopening a saved or scheduled story picks up where the operator left off
  const [draft] = useState(() => socialDrafts.find((d) => d.newsId === item.id && d.platform === platform && (d.status === "saved" || d.status === "scheduled")));
  const canvasRef = useRef<TemplateCanvasHandle>(null);
  // The dialog mounts its content after this component, so the stage is tracked as state
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const headlineInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isX = platform === "X (Twitter)";
  const meta = PLATFORM_META[platform];
  const limits = PLATFORM_LIMITS[platform];

  const [uploads, setUploads] = useState<FtpMedia[]>([]);
  const mediaList = useMemo(() => [...item.media, ...uploads], [item.media, uploads]);
  const [mediaIndex, setMediaIndex] = useState(() => Math.max(0, item.media.findIndex((m) => m.fileName === draft?.mediaFile)));
  const media = mediaList[mediaIndex] ?? mediaList[0];
  const [igFormat, setIgFormat] = useState<TemplateFormat>(() =>
    draft?.format === "ig_post" || draft?.format === "ig_reel" ? draft.format : item.media[0].kind === "video" ? "ig_reel" : "ig_post"
  );
  const format: TemplateFormat = isX ? "x" : igFormat;

  const [layout, setLayout] = useState<TemplateLayout>(() => draft?.layout ?? defaultLayout(draft?.headline ?? item.headline, format));
  const [tool, setTool] = useState<Tool>("background");
  const [selection, setSelection] = useState<CanvasSelection>(null);
  const [zoom, setZoom] = useState(1);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  const [text, setText] = useState(draft?.caption ?? item.shortText);
  const [hashtags, setHashtags] = useState<TagOption[]>(() => withDraftChoices(suggestHashtags(item, hashtagRules), draft?.hashtags));
  const [mentions, setMentions] = useState<TagOption[]>(() => withDraftChoices(suggestMentions(item, platform, handleDirectory), draft?.mentions));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [videoPaused, setVideoPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  // Kept parts of the source video, in order. Splitting adds a boundary, deleting removes a part.
  const [segments, setSegments] = useState<TrimRange[]>([]);
  const [selectedClip, setSelectedClip] = useState<number | null>(null);
  const [time, setTime] = useState(0);
  const [exporting, setExporting] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"reject" | "schedule" | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

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
  const frame = TEMPLATE_FORMATS[format];
  const fit = Math.max(0.05, Math.min(stage.w / frame.w, stage.h / frame.h));
  const frameWidth = Math.round(frame.w * fit * zoom);

  const selectedHashtags = useMemo(() => hashtags.filter((h) => h.checked).map((h) => h.value), [hashtags]);
  const selectedMentions = useMemo(() => mentions.filter((m) => m.checked).map((m) => m.value), [mentions]);
  const finalText = composePostText(text, selectedMentions, selectedHashtags);
  const used = countChars(finalText, platform);
  const overLimit = used > limits.text;
  const tooManyTags = selectedHashtags.length > limits.hashtags || selectedMentions.length > limits.mentions;
  // Links multiply the cost of an X post, so the X formatter refuses them outright
  const url = isX ? findUrl(finalText) : null;
  const canPost = permissions.canApproveSocialContent && !overLimit && !tooManyTags && !url && text.trim().length > 0 && layout.headline.trim().length > 0;

  let blockedReason = "";
  if (!permissions.canApproveSocialContent) blockedReason = "Your role can view posts but not publish them";
  else if (!text.trim()) blockedReason = `Write the ${meta.postNoun} first`;
  else if (!layout.headline.trim()) blockedReason = "The template needs a headline";
  else if (overLimit) blockedReason = `${used - limits.text} characters over the ${meta.short} limit`;
  else if (tooManyTags) blockedReason = "Too many hashtags or mentions selected";
  else if (url) blockedReason = `Remove the link "${url}" first`;

  const patch = (changes: Partial<TemplateLayout>) => setLayout((l) => ({ ...l, ...changes }));

  const select = (next: CanvasSelection) => {
    setSelection(next);
    if (next === "headline") setTool("text");
    if (next === "background") setTool("background");
  };

  const editHeadline = () => {
    select("headline");
    setTimeout(() => {
      headlineInputRef.current?.focus();
      headlineInputRef.current?.select();
    }, 0);
  };

  const chooseMedia = (index: number) => {
    setMediaIndex(index);
    setSelection("background");
    setDuration(0);
    setSegments([]);
    setSelectedClip(null);
    setTime(0);
    patch({ bgZoom: 1, bgX: 0, bgY: 0 });
  };

  const handleDuration = (seconds: number) => {
    setDuration(seconds);
    // Restore the saved cut when it belongs to this file, otherwise keep the whole video
    const saved = draft?.mediaFile === media.fileName ? draft?.clipSegments?.filter((c) => c.end <= seconds + 0.05) : undefined;
    setSegments(saved?.length ? saved : [{ start: 0, end: seconds }]);
  };

  const exportVideo = async () => {
    if (!segments.length || exporting !== null) return;
    setSelection(null);
    setVideoPaused(false);
    setExporting(0);
    const blob = await canvasRef.current?.record(segments, setExporting);
    setExporting(null);
    if (!blob) {
      setNotice("This browser or media file does not allow video export. The post itself is unaffected.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${item.id}-${format}.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
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

  const download = () => {
    const ok = canvasRef.current?.download(`${item.id}-${format}.png`) ?? false;
    if (!ok) setNotice("This media file does not allow image export from the browser. The post itself is unaffected.");
  };

  const buildPayload = (): PostPayload => {
    const cover = item.media[0];
    return {
      newsId: item.id,
      platform,
      headline: layout.headline.trim(),
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

  // The post waits out the undo window on the desk, so the editor can close straight away
  const publish = () => {
    if (!canPost) return;
    queuePost(buildPayload());
    setPreviewOpen(false);
    onClose();
  };

  const save = () => {
    saveDraft(buildPayload());
    setSavedAt(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }));
  };

  const postButton = (
    <Tooltip title={blockedReason}>
      <span>
        <Button
          variant="contained"
          onClick={publish}
          disabled={!canPost}
          startIcon={<Send size={15} />}
          sx={{ minHeight: 34, fontWeight: 700, whiteSpace: "nowrap", backgroundColor: BREAKING_RED, color: "#fff", "&:hover": { backgroundColor: "#B50F14" }, "&.Mui-disabled": { backgroundColor: "rgba(215,20,26,0.35)", color: "rgba(255,255,255,0.7)" } }}
        >
          Post to {meta.short}
        </Button>
      </span>
    </Tooltip>
  );

  return (
    <Dialog open fullScreen onClose={onClose} transitionDuration={150} slotProps={{ paper: { sx: { borderRadius: 0, backgroundImage: "none", backgroundColor: "background.default" } } }}>
      <Box sx={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
        {/* Top bar */}
        <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.5, sm: 1 }, px: { xs: 1, sm: 1.5 }, height: 54, flexShrink: 0, backgroundColor: BAR.bg, color: "#fff" }}>
          <Button onClick={onClose} aria-label="Back to desk" sx={{ ...chromeButton, minWidth: 0, gap: 0.75 }}>
            <ArrowLeft size={16} />
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
              Desk
            </Box>
          </Button>
          <Box sx={{ display: { xs: "none", sm: "block" }, width: "1px", height: 22, backgroundColor: BAR.border, mx: 0.5 }} />
          <PlatformIcon platform={platform} size={16} />
          <TagChip tag={item.tag} />
          <Typography sx={{ display: { xs: "none", sm: "block" }, flex: 1, minWidth: 0, fontSize: "0.875rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.headline}
          </Typography>
          <Box sx={{ flex: { xs: 1, sm: 0 } }} />
          {!isX && (
            <Box role="group" aria-label="Format" sx={{ display: "flex", border: `1px solid ${BAR.border}`, borderRadius: "8px", overflow: "hidden", mr: 0.5 }}>
              {(["ig_post", "ig_reel"] as const).map((f) => (
                <Box
                  key={f}
                  component="button"
                  aria-pressed={igFormat === f}
                  onClick={() => {
                    setIgFormat(f);
                    patch({ textY: DEFAULT_TEXT_Y[f], bgX: 0, bgY: 0 });
                  }}
                  sx={{ border: 0, px: 1.25, height: 32, fontFamily: "inherit", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", color: igFormat === f ? "#111" : BAR.text, backgroundColor: igFormat === f ? "#fff" : "transparent" }}
                >
                  {TEMPLATE_FORMATS[f].label}
                </Box>
              ))}
            </Box>
          )}
          <Tooltip title={isVideo ? "Export the edited video" : "Download image"}>
            <span>
              <Button onClick={isVideo ? exportVideo : download} disabled={exporting !== null} aria-label={isVideo ? "Export video" : "Download image"} sx={{ ...chromeButton, minWidth: 0, gap: 0.75, "&.Mui-disabled": { color: "rgba(255,255,255,0.7)" } }}>
                {exporting !== null ? <CircularProgress size={15} sx={{ color: "#fff" }} variant="determinate" value={Math.max(4, exporting * 100)} /> : <Download size={16} />}
                <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>
                  {exporting !== null ? `Exporting ${Math.round(exporting * 100)}%` : isVideo ? "Export" : "Download"}
                </Box>
              </Button>
            </span>
          </Tooltip>
          <Button onClick={() => setPreviewOpen(true)} aria-label="Preview" sx={{ ...chromeButton, minWidth: 0, gap: 0.75, border: `1px solid ${BAR.border}` }}>
            <Eye size={15} />
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
              Preview
            </Box>
          </Button>
          {postButton}
        </Box>

        {/* Workspace */}
        <Box sx={{ flex: 1, minHeight: 0, display: { xs: "flex", lg: "grid" }, flexDirection: "column", gridTemplateColumns: "72px 280px minmax(0, 1fr) 340px", overflowY: { xs: "auto", lg: "hidden" } }}>
          {/* Tool rail */}
          <Box role="tablist" aria-label="Design tools" sx={{ order: { xs: 1, lg: 0 }, flexShrink: 0, display: "flex", flexDirection: { xs: "row", lg: "column" }, gap: 0.5, p: 0.75, backgroundColor: "background.paper", borderRight: { lg: "1px solid" }, borderTop: { xs: "1px solid", lg: "none" }, borderColor: "divider" }}>
            {TOOLS.map((t) => (
              <Box
                key={t.id}
                component="button"
                role="tab"
                aria-selected={tool === t.id}
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
                  color: tool === t.id ? "text.primary" : "text.secondary",
                  backgroundColor: tool === t.id ? "action.selected" : "transparent",
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
            {tool === "background" && (
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
              </>
            )}

            {tool === "text" && (
              <>
                <Typography sx={panelTitle}>Headline</Typography>
                <TextField
                  multiline
                  minRows={3}
                  fullWidth
                  size="small"
                  value={layout.headline}
                  inputRef={headlineInputRef}
                  onFocus={() => setSelection("headline")}
                  onChange={(e) => patch({ headline: e.target.value })}
                  sx={{ ...fieldSx, "& textarea": { fontWeight: 600 } }}
                />
                <Typography sx={{ ...sectionLabel, mt: 2.5 }}>Size</Typography>
                <Slider size="small" min={0.6} max={1.6} step={0.05} value={layout.fontScale} onChange={(_, v) => patch({ fontScale: v as number })} aria-label="Headline size" sx={{ color: "text.primary" }} />
                <Typography sx={{ ...sectionLabel, mt: 1.5, mb: 0.75 }}>Alignment</Typography>
                <Box sx={{ display: "flex", gap: 0.75 }}>
                  {(["left", "center"] as const).map((a) => (
                    <Button key={a} variant="outlined" onClick={() => patch({ align: a })} startIcon={a === "left" ? <AlignLeft size={15} /> : <AlignCenter size={15} />} sx={{ flex: 1, textTransform: "capitalize", color: "text.primary", borderColor: layout.align === a ? "text.primary" : "divider" }}>
                      {a}
                    </Button>
                  ))}
                </Box>
                <Typography sx={{ ...sectionLabel, mt: 2.5, mb: 0.75 }}>Colour</Typography>
                <Box sx={{ display: "flex", gap: 1 }}>
                  {HEADLINE_COLORS.map((c) => (
                    <Box key={c} component="button" aria-label={`Headline colour ${c}`} aria-pressed={layout.color === c} onClick={() => patch({ color: c })} sx={{ width: 32, height: 32, borderRadius: "50%", cursor: "pointer", backgroundColor: c, border: "1px solid", borderColor: "divider", outline: layout.color === c ? `2px solid ${SELECT_BLUE}` : "none", outlineOffset: 2 }} />
                  ))}
                </Box>
                <Button size="small" onClick={() => setLayout((l) => ({ ...defaultLayout(item.headline, format), bgZoom: l.bgZoom, bgX: l.bgX, bgY: l.bgY }))} startIcon={<RotateCcw size={13} />} sx={{ mt: 2.5, px: 0.5, color: "text.secondary", fontSize: "0.75rem" }}>
                  Reset headline
                </Button>
              </>
            )}

            {tool === "story" && (
              <>
                <Typography sx={panelTitle}>Story from FTP</Typography>
                <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, lineHeight: 1.45 }}>{item.headline}</Typography>
                <Typography sx={{ fontSize: "0.8125rem", lineHeight: 1.7, color: "text.secondary", mt: 1 }}>{item.body}</Typography>
                <Typography sx={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono), ui-monospace, monospace", color: "text.disabled", mt: 1.5, wordBreak: "break-all" }}>{item.ftpPath}</Typography>
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
                  tag={item.tag}
                  layout={layout}
                  onLayoutChange={setLayout}
                  selection={selection}
                  onSelect={select}
                  onEditHeadline={editHeadline}
                  paused={videoPaused}
                  segments={segments.length ? segments : undefined}
                  onDuration={handleDuration}
                  onTime={setTime}
                  style={{ width: frameWidth, maxWidth: "none", maxHeight: "none", flexShrink: 0, margin: "auto", boxShadow: "0 8px 30px rgba(0,0,0,0.22)" }}
                />
              </Box>
            </Box>

            {/* Contextual toolbar */}
            <Box sx={{ ...floatingSx, position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", maxWidth: "calc(100% - 24px)", overflowX: "auto", display: "flex", alignItems: "center", gap: 0.5, px: 0.75, height: 42, borderRadius: "10px", whiteSpace: "nowrap" }}>
              {selection === "headline" && (
                <>
                  <IconButton sx={toolbarIcon} aria-label="Smaller text" onClick={() => patch({ fontScale: Math.max(0.6, +(layout.fontScale - 0.05).toFixed(2)) })}>
                    <Minus size={15} />
                  </IconButton>
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, width: 38, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{Math.round(layout.fontScale * 100)}%</Typography>
                  <IconButton sx={toolbarIcon} aria-label="Larger text" onClick={() => patch({ fontScale: Math.min(1.6, +(layout.fontScale + 0.05).toFixed(2)) })}>
                    <Plus size={15} />
                  </IconButton>
                  {toolbarDivider}
                  <IconButton sx={{ ...toolbarIcon, backgroundColor: layout.align === "left" ? "action.selected" : "transparent" }} aria-label="Align left" onClick={() => patch({ align: "left" })}>
                    <AlignLeft size={15} />
                  </IconButton>
                  <IconButton sx={{ ...toolbarIcon, backgroundColor: layout.align === "center" ? "action.selected" : "transparent" }} aria-label="Align centre" onClick={() => patch({ align: "center" })}>
                    <AlignCenter size={15} />
                  </IconButton>
                  {toolbarDivider}
                  {HEADLINE_COLORS.map((c) => (
                    <Box key={c} component="button" aria-label={`Colour ${c}`} onClick={() => patch({ color: c })} sx={{ width: 20, height: 20, mx: 0.25, flexShrink: 0, borderRadius: "50%", cursor: "pointer", backgroundColor: c, border: "1px solid", borderColor: "divider", outline: layout.color === c ? `2px solid ${SELECT_BLUE}` : "none", outlineOffset: 1 }} />
                  ))}
                  {toolbarDivider}
                  <Button size="small" onClick={editHeadline} startIcon={<Pencil size={13} />} sx={{ minHeight: 30, fontSize: "0.75rem", color: "text.primary" }}>
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
              {!selection && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", px: 1 }}>Click the headline or the background to edit it</Typography>}
            </Box>

            {/* View zoom */}
            <Box sx={{ ...floatingSx, position: "absolute", right: 12, bottom: 12, display: "flex", alignItems: "center", px: 0.5, height: 36, borderRadius: "8px" }}>
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
                time={time}
                segments={segments}
                selected={selectedClip}
                onSelect={setSelectedClip}
                onSegmentsChange={setSegments}
                onSeek={(t) => {
                  canvasRef.current?.seek(t);
                  setTime(t);
                }}
                paused={videoPaused}
                onTogglePlay={() => setVideoPaused((p) => !p)}
                headline={layout.headline}
                headlineSelected={selection === "headline"}
                onSelectHeadline={() => select("headline")}
              />
            )}
          </Box>

          {/* Post panel */}
          <Box sx={{ order: { xs: 3, lg: 0 }, flexShrink: 0, p: 2, overflowY: { lg: "auto" }, display: "flex", flexDirection: "column", gap: 2.5, backgroundColor: "background.paper", borderLeft: { lg: "1px solid" }, borderColor: "divider" }}>
            <Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.75 }}>
                <Typography sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>{isX ? "Tweet" : "Caption"}</Typography>
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
              {previewOpen && <TemplateCanvas media={media} format={format} tag={item.tag} layout={layout} style={{ width: `min(100%, calc(58vh * ${frame.w} / ${frame.h}))` }} />}
            </PostMock>
          </Box>
        </Box>
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, px: 2.5, py: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
          <Button onClick={() => setPreviewOpen(false)}>Back to editing</Button>
          {postButton}
        </Box>
      </Dialog>

      {dialog === "reject" && (
        <RejectDialog
          open
          headline={layout.headline}
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
          headline={layout.headline}
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
