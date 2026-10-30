"use client";

// Phase 1's editor: a breaking file turned into a ready X post. The file as the desk wrote it sits beside the
// post (read-only, to check facts); the post can be edited, and one button, Copy & Posted, puts the text on
// the clipboard and moves the story to Posted (phase1-contract.md §3). Most posts go without a picture, so the
// card is off until "Add card" asks the server for one (§4); then Copy & Posted saves the card as well.
// Opened by LiveEditor in place of PostEditor when the server says phase 1; claim and heartbeat stay there.

import React, { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Dialog, FormControlLabel, IconButton, Snackbar, Switch, TextField, Tooltip, Typography } from "@mui/material";
import { ArrowLeft, Ban, Check, ClipboardCopy, FileText, Keyboard, Plus, RotateCw, X as CloseIcon } from "lucide-react";
import * as socia from "@/lib/socia/api";
import { POLL_MS } from "@/lib/socia/config";
import type { DraftView } from "@/lib/socia/types";
import { usePermissions } from "@/lib/access/usePermissions";
import type { FtpNewsItem, RejectReason } from "@/types/newsroom";
import { countChars, findUrl, normaliseTag, X_LIMIT } from "../socialText";
import { RejectDialog } from "../actionDialogs";
import { EditorShortcutsSheet } from "../EditorShortcutsSheet";
import { isEditorTypingTarget, isTextEntryTarget, phase1KeyFor, phase1Shortcut } from "../editorKeys";
import { PlatformIcon, rejectedNotice, srOnly, TAG_TINT, tagTint } from "../shared";
import { BREAKING_RED } from "../cardRender";
import { credentialsFor, errorCode, errorText, fileUrl, useLiveDesk } from "../live/LiveDesk";
import type { LiveEditing } from "../live/LiveEditor";
import XPostPreview, { XCountRing, X_COLORS } from "./XPostPreview";
import { Badge, needsCheckHint, needsCheckLabel, Phase1Badges } from "./badges";

const BAR = { bg: "#0E0E10", text: "rgba(255,255,255,0.7)", border: "rgba(255,255,255,0.14)" };
const chromeButton = { color: "#fff", borderRadius: "8px", minHeight: 34, px: 1.25, fontSize: "0.8125rem", "&:hover": { backgroundColor: "rgba(255,255,255,0.1)" } };
const panelHead = { fontSize: "0.8125rem", fontWeight: 700, color: "text.secondary" } as const;

/** The post as X will get it: the text, a blank line, then hashtags and handles on one line (the server's assemblePostText). */
export function assemblePost(body: string, hashtags: string[], mentions: string[]): string {
  const tags = [...hashtags, ...mentions].join(" ");
  return [body.trim(), tags].filter(Boolean).join("\n\n");
}

const code2text = (err: unknown) => (errorCode(err) ? errorText(err) : err instanceof Error ? err.message : errorText(err));

/** The words the server keeps for a post (PATCH /drafts/:id) */
type TextPatch = { bodyText: string; hashtags: string[]; mentions: string[] };

/** The tags with one more "#tag" or "@handle" typed by the operator (unchanged if empty or already there). */
function withTag(hashtags: string[], mentions: string[], raw: string): { hashtags: string[]; mentions: string[] } {
  const value = normaliseTag(raw, raw.trim().startsWith("@") ? "@" : "#");
  if (!value) return { hashtags, mentions };
  const has = (list: string[]) => list.some((t) => t.toLowerCase() === value.toLowerCase());
  if (value.startsWith("@")) return { hashtags, mentions: has(mentions) ? mentions : [...mentions, value] };
  return { hashtags: has(hashtags) ? hashtags : [...hashtags, value], mentions };
}

const clock = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "");

interface Phase1EditorProps {
  item: FtpNewsItem;
  onClose: () => void;
  onSaved?: (message: string) => void;
  live: LiveEditing;
}

export default function Phase1Editor({ item, onClose, onSaved, live }: Phase1EditorProps) {
  const desk = useLiveDesk();
  const { can } = usePermissions();
  const d = live.draft;
  const canEdit = live.lease.kind === "mine" && !!desk?.canAct && can("draft.edit");
  const mayCopyPosted = can("post.mark_posted");
  const mayReject = can("draft.reject") || can("post.publish");
  const mayCard = can("draft.card") || can("draft.edit");

  // ── The story's text, kept here while the operator edits. LiveEditor keys this editor by draft id, so
  //    another story is a fresh editor: no state, queue or timer carries over from the last one ──
  const [text, setText] = useState(d.bodyText);
  const [hashtags, setHashtags] = useState<string[]>(d.hashtags);
  const [mentions, setMentions] = useState<string[]>(d.mentions);
  const [tagDraft, setTagDraft] = useState("");
  const [addCard, setAddCard] = useState(() => !!d.card.requested || d.card.state === "rendering" || d.card.state === "ready");
  const [busy, setBusy] = useState<null | "save" | "copy" | "reject" | "card" | "claim">(null);
  const [stale, setStale] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  // The browser refused the clipboard: say so and offer to mark it posted after copying by hand
  const [blocked, setBlocked] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // Autosave failed: the reason, shown with Retry; it also retries by itself with a growing wait
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const retries = useRef(0);
  // Copy & Posted copied the text but the server didn't mark it: a blocking state until retried or edited
  const [notPosted, setNotPosted] = useState<string | null>(null);
  // Someone already posted this story (409 already_posted)
  const [alreadyPosted, setAlreadyPosted] = useState<string | null>(null);
  // "Add card" after a failed draw may be refused for a while (429 retryAfter): the time it opens again
  const [cardWaitUntil, setCardWaitUntil] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const finalText = assemblePost(text, hashtags, mentions);
  const used = countChars(finalText, "X (Twitter)");
  const over = used > X_LIMIT;
  const url = findUrl(finalText);
  const cardState = d.card.state ?? (d.card.ready && d.card.url ? "ready" : "none");
  const cardReady = cardState === "ready" && !!d.card.url;

  // ── Saving: every change goes up with the version it was based on, one call at a time ──
  const versionRef = useRef(d.version);
  useEffect(() => {
    versionRef.current = d.version;
  }, [d.version]);
  const onDraftStable = live.onDraft;
  const adopt = (next: DraftView) => {
    versionRef.current = next.version;
    live.onDraft(next);
  };
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.current.then(fn, fn);
    chain.current = next.catch(() => undefined);
    return next;
  };
  const patch: TextPatch = { bodyText: text, hashtags, mentions };
  const patchKey = JSON.stringify(patch);
  const serverKey = JSON.stringify({ bodyText: d.bodyText, hashtags: d.hashtags, mentions: d.mentions });
  const dirty = patchKey !== serverKey;
  // The server's words the local edits started from. When the server's words change without this editor
  // saving them (the file was re-saved, someone else edited), the post reloads if nothing was typed here,
  // and otherwise asks whose version to keep: new text is never overwritten with the old by itself.
  const [baseKey, setBaseKey] = useState(serverKey);
  if (serverKey !== baseKey) {
    setBaseKey(serverKey);
    if (patchKey === baseKey) {
      setText(d.bodyText);
      setHashtags(d.hashtags);
      setMentions(d.mentions);
      setNotice("The file changed on the server. The post was reloaded with the new text.");
    } else setStale(d.version);
  }
  // What the server holds now, read when a queued save runs (a save queued behind another may have nothing left to send)
  const serverKeyRef = useRef(serverKey);
  // Unmounted (closed, or another story opened): late answers are dropped
  const alive = useRef(true);
  useEffect(() => {
    serverKeyRef.current = serverKey;
  }, [serverKey]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  /**
   * Saves exactly `snap`, to the draft it was taken from. The id and words are fixed when the save is
   * scheduled, never read later, so a save can't carry one story's text to another.
   */
  const saveSnapshot = async (snap: { id: string; patch: TextPatch }) => {
    if (!canEdit || snap.id !== d.id || JSON.stringify(snap.patch) === serverKeyRef.current) return;
    const saved = await socia.saveDraft(snap.id, { version: versionRef.current, ...snap.patch });
    if (!alive.current) return;
    const savedKey = JSON.stringify({ bodyText: saved.bodyText, hashtags: saved.hashtags, mentions: saved.mentions });
    serverKeyRef.current = savedKey;
    // Our own save: not an outside change
    setBaseKey(savedKey);
    adopt(saved);
    setSavedAt(clock(new Date().toISOString()));
    setSaveError(null);
    retries.current = 0;
  };
  const snapshot = (p: TextPatch = patch) => ({ id: d.id, patch: p });

  /** A failed call becomes the right state: a claim problem, a version clash, or a message. */
  const fail = (err: unknown) => {
    const code = errorCode(err);
    const data = (err as { data?: { current?: { version?: number }; heldBy?: string; problems?: string[] } }).data;
    if (code === "already_posted") {
      // 409 already_posted { postedBy, postedAt } (phase1-contract.md §3); postedBy is the name (an object tolerated)
      const who = (err as { data?: { postedBy?: string | { name?: string } | null; postedAt?: string | null } }).data;
      const name = (typeof who?.postedBy === "string" ? who.postedBy : who?.postedBy?.name) || "someone";
      const at = who?.postedAt;
      setAlreadyPosted(`Already posted by ${name}${at ? ` at ${clock(at)}` : ""}. Don't post it again.`);
      void desk?.refreshAll();
      return;
    }
    // 429 cooldown { retryAfter, renderError }: Add card again too soon after a failed render
    if (code === "cooldown" || (err as { status?: number }).status === 429) {
      const after = Number((err as { data?: { retryAfter?: number } }).data?.retryAfter ?? 30);
      setCardWaitUntil(Date.now() + Math.max(1, after) * 1000);
      return;
    }
    if (code === "stale_version") setStale(typeof data?.current?.version === "number" ? data.current.version : versionRef.current);
    else if (code === "lease_lost") live.onLeaseLost();
    else if (code === "held_by_other") live.onHeldBy(String(data?.heldBy ?? "Someone"));
    else if (code === "post_invalid" && data?.problems?.length) setNotice(`X would refuse this post: ${data.problems.join("; ")}`);
    else setNotice(code ? errorText(err) : err instanceof Error ? err.message : errorText(err));
  };

  const inFlight = useRef<string | null>(null);
  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = kind;
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      fail(err);
    } finally {
      inFlight.current = null;
      setBusy(null);
    }
  };

  // Typing saves by itself after a pause. A failed save (network, server) tries again after 2, 4, 8... up to
  // 30 seconds and shows Retry; a version clash or a lost claim goes to its own message instead.
  const autosaveFailed = (err: unknown) => {
    const code = errorCode(err);
    if (code === "stale_version" || code === "lease_lost" || code === "held_by_other" || code === "post_invalid") {
      fail(err);
      return;
    }
    if (!alive.current) return;
    setSaveError(code ? errorText(err) : err instanceof Error ? err.message : errorText(err));
    const wait = Math.min(30_000, 2000 * 2 ** retries.current);
    retries.current += 1;
    retryTimer.current = setTimeout(() => setRetryTick((t) => t + 1), wait);
  };
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(retryTimer.current), []);
  useEffect(() => {
    if (!canEdit || stale !== null || !dirty) return;
    const snap = snapshot();
    const timer = setTimeout(() => void serial(() => saveSnapshot(snap)).catch(autosaveFailed), retryTick && saveError ? 0 : 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patchKey, canEdit, stale, dirty, retryTick]);
  const retrySave = () => {
    clearTimeout(retryTimer.current);
    retries.current = 0;
    void run("save", () => serial(() => saveSnapshot(snapshot())));
  };

  const loadTheirs = () =>
    run("save", async () => {
      const fresh = await socia.fetchDraft(d.id);
      setBaseKey(JSON.stringify({ bodyText: fresh.bodyText, hashtags: fresh.hashtags, mentions: fresh.mentions }));
      adopt(fresh);
      setText(fresh.bodyText);
      setHashtags(fresh.hashtags);
      setMentions(fresh.mentions);
      setStale(null);
    });
  const keepMine = () =>
    run("save", async () => {
      if (stale !== null) versionRef.current = stale;
      setStale(null);
      await serial(() => saveSnapshot(snapshot()));
    });

  // A re-saved file can change the draft while it is open: look every 15 s and take the server's draft when
  // its version moved on (the render check above then reloads or asks, never overwriting the new words)
  useEffect(() => {
    const id = d.id;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const look = async () => {
      try {
        const fresh = await socia.fetchDraft(id);
        if (!cancelled && fresh.version > versionRef.current && !inFlight.current) {
          versionRef.current = fresh.version;
          onDraftStable(fresh);
        }
      } catch {
        // Missed look; the next one tries again
      }
      if (!cancelled) timer = setTimeout(look, 15_000);
    };
    timer = setTimeout(look, 15_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [d.id, onDraftStable]);

  // ── Add card: the server draws it on request; follow the draft until it is ready ──
  const requestCard = () =>
    run("card", async () => {
      adopt(await socia.renderCard(d.id));
    });
  const rendering = addCard && cardState === "rendering";
  const onDraft = live.onDraft;
  useEffect(() => {
    if (!rendering) return;
    const id = d.id;
    // One request at a time: the next look is scheduled only after the last answer; stopped on switch or close
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const look = async () => {
      try {
        const fresh = await socia.fetchDraft(id);
        if (cancelled) return;
        if (fresh.card.state !== "rendering") {
          onDraft(fresh);
          return;
        }
      } catch {
        // A missed look; the next one tries again
      }
      if (!cancelled) timer = setTimeout(look, POLL_MS.cardRender);
    };
    timer = setTimeout(look, POLL_MS.cardRender);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rendering, d.id, onDraft]);
  const cardWait = cardWaitUntil && cardWaitUntil > nowTick ? Math.ceil((cardWaitUntil - nowTick) / 1000) : 0;
  useEffect(() => {
    if (!cardWaitUntil) return;
    const t = setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      if (now >= cardWaitUntil) setCardWaitUntil(null);
    }, 1000);
    return () => clearInterval(t);
  }, [cardWaitUntil]);
  const toggleCard = (on: boolean) => {
    setAddCard(on);
    if (on && !cardWait && (cardState === "none" || cardState === "failed")) void requestCard();
  };

  /** Saves the card next to the post; false when the browser couldn't. */
  const downloadCard = async (): Promise<boolean> => {
    if (!d.card.url) return false;
    const name = `${d.story.slug || d.id}-card.png`;
    try {
      const src = fileUrl(d.card.url);
      const res = await fetch(src, { credentials: credentialsFor(src) });
      if (!res.ok) throw new Error(String(res.status));
      const href = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
      return true;
    } catch {
      return false;
    }
  };

  // ── Copy & Posted ──
  let blockedReason = "";
  if (alreadyPosted) blockedReason = "Already posted";
  else if (live.lease.kind === "held") blockedReason = `${live.lease.name} is working on this story`;
  else if (live.lease.kind === "lost") blockedReason = "Claim the story again first";
  else if (stale !== null) blockedReason = "Someone else saved this story. Choose whose version to keep first";
  else if (!canEdit || !mayCopyPosted) blockedReason = "Your role can't mark posts as posted";
  else if (!text.trim()) blockedReason = "The post is empty";
  else if (over) blockedReason = `${used - X_LIMIT} characters over X's 280`;
  else if (url) blockedReason = `Remove the link "${url}" first`;
  else if (addCard && !cardReady) blockedReason = cardState === "failed" ? "The card didn't draw. Try again or turn Add card off" : "The card is still being drawn";
  const canCopy = !blockedReason && !busy;

  /**
   * Marks the story posted with exactly the words that were copied: `snap` is saved first (the server then
   * holds what is on the clipboard), then copy-posted, and only after that succeeds is the card downloaded.
   * The caller already holds the lock (inFlight and busy "copy").
   */
  const markPostedNow = async (snap: { id: string; patch: TextPatch }, copiedText: string) => {
    try {
      await serial(() => saveSnapshot(snap));
      const res = await socia.copyPosted(snap.id, versionRef.current);
      if (res.text && res.text.trim() !== copiedText.trim()) {
        // Should not happen (both sides assemble the same way); say so rather than leave a wrong post on the clipboard
        onSaved?.("Marked posted, but the server's text differs from what was copied. Check the post on X.");
      }
      let cardSaved = false;
      if (addCard && cardReady) {
        cardSaved = await downloadCard();
        if (!cardSaved) onSaved?.("Posted, but the card didn't download. Open the story in Posted and save the card by hand.");
      }
      live.onFinished();
      desk?.addCopied({ draftId: snap.id, postId: res.postId, headline: item.headline, undoUntil: res.undoUntil, withCard: cardSaved });
      onClose();
    } catch (err) {
      // The clipboard already holds the post, but the server didn't mark it: empty the clipboard (best effort;
      // the browser may refuse outside a click) and block with a banner rather than a passing message
      void navigator.clipboard?.writeText("").catch(() => undefined);
      if (alive.current && errorCode(err) !== "already_posted") {
        setNotPosted(errorCode(err) === "stale_version" ? "The post changed on the server before it was marked." : code2text(err));
      }
      fail(err);
    }
  };
  const lock = () => {
    if (inFlight.current) return false;
    inFlight.current = "copy";
    setBusy("copy");
    return true;
  };
  const unlock = () => {
    inFlight.current = null;
    if (alive.current) setBusy(null);
  };

  /** The post as it stands, with a hashtag or handle still typed in the add box taken in (Ctrl+Enter mid-tag). */
  const settled = (): TextPatch => {
    const pending = tagDraft.trim() ? withTag(hashtags, mentions, tagDraft) : null;
    if (pending) {
      setHashtags(pending.hashtags);
      setMentions(pending.mentions);
      setTagDraft("");
    }
    return { bodyText: text, hashtags: pending?.hashtags ?? hashtags, mentions: pending?.mentions ?? mentions };
  };

  const copyAndPost = async () => {
    if (!canCopy || !lock()) return;
    setNotPosted(null);
    const p = settled();
    const copiedText = assemblePost(p.bodyText, p.hashtags, p.mentions);
    if (countChars(copiedText, "X (Twitter)") > X_LIMIT) {
      unlock();
      setNotice(`With that tag the post is over X's ${X_LIMIT}. Shorten it first.`);
      return;
    }
    // Copy first, while the click still counts as the operator's: browsers refuse the clipboard after a wait.
    // The text box is read-only from here until the story is posted or the attempt fails.
    try {
      await navigator.clipboard.writeText(copiedText);
    } catch {
      unlock();
      setBlocked(true);
      setNotice("The browser blocked the clipboard. Select the text in the box and copy it by hand.");
      return;
    }
    setBlocked(false);
    await markPostedNow(snapshot(p), copiedText);
    unlock();
  };
  /** The clipboard was refused and the operator copied the post by hand: mark what is on screen now. */
  const markCopiedByHand = async () => {
    if (!canCopy || !lock()) return;
    setNotice("");
    setBlocked(false);
    const p = settled();
    await markPostedNow(snapshot(p), assemblePost(p.bodyText, p.hashtags, p.mentions));
    unlock();
  };

  // ── Hashtags and handles ──
  const tagsOn = [...hashtags, ...mentions];
  const suggestions = d.mentionSuggestions
    .map((s) => ({ value: s.handle.startsWith("@") ? s.handle : `@${s.handle}`, entity: s.entity }))
    .filter((s) => !mentions.some((m) => m.toLowerCase() === s.value.toLowerCase()));
  const removeTag = (tag: string) => {
    if (tag.startsWith("@")) setMentions((list) => list.filter((m) => m !== tag));
    else setHashtags((list) => list.filter((h) => h !== tag));
  };
  const addTag = (raw: string) => {
    const next = withTag(hashtags, mentions, raw);
    setHashtags(next.hashtags);
    setMentions(next.mentions);
  };

  // ── Leaving: the text must save first, so nothing typed is lost ──
  const close = async () => {
    if (canEdit && dirty) {
      setBusy("save");
      try {
        await serial(() => saveSnapshot(snapshot(settled())));
      } catch (err) {
        setBusy(null);
        fail(err);
        return;
      }
    }
    onClose();
  };
  const reject = (reason: RejectReason, note: string) =>
    run("reject", async () => {
      await socia.rejectDraft(d.id, reason, note || undefined);
      live.onFinished();
      void desk?.refreshAll();
      onSaved?.(rejectedNotice(item.headline));
      onClose();
    });

  // ── Keyboard: phase 1's shortcuts (editorKeys.PHASE1_KEYS) ──
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const cmd = phase1KeyFor(e);
      if (!cmd || sheetOpen || rejecting) return;
      if (cmd.id === "post.copyPosted") {
        e.preventDefault();
        if (!e.repeat) void copyAndPost();
        return;
      }
      if (cmd.id === "post.save") {
        e.preventDefault();
        if (!e.repeat && canEdit && !busy) void run("save", () => serial(() => saveSnapshot(snapshot())));
        return;
      }
      if (isEditorTypingTarget(e.target)) return;
      if (cmd.id === "help.keys") {
        e.preventDefault();
        setSheetOpen(true);
      } else if (cmd.id === "editor.close") {
        e.preventDefault();
        if (!busy) void close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const onEscape = (e: object) => {
    const target = (e as Partial<KeyboardEvent>).target ?? null;
    // Esc in a box leaves the box first
    if (isTextEntryTarget(target)) {
      (target as HTMLElement).blur();
      return;
    }
    if (!busy) void close();
  };

  const story = d.story;
  const big = !!story.tags?.big;
  const headTag = story.tags ? (big ? "big_breaking" : "breaking") : null;
  const reasons = [...(story.needsCheck ?? [])];
  if (story.deskNoteRemoved && !reasons.includes("desk_note")) reasons.push("desk_note");
  const liveCap = desk?.counts.data?.cap ?? desk?.inbox.data?.cap;
  const shortcut = phase1Shortcut("post.copyPosted");

  const card = (() => {
    if (!addCard) return null;
    if (cardReady)
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fileUrl(d.card.url)} alt={`Card for: ${item.headline}`} style={{ display: "block", width: "100%", height: "auto" }} />
      );
    return (
      <Box role="status" sx={{ aspectRatio: "1 / 1", display: "grid", placeItems: "center", backgroundColor: "#F7F9F9", color: X_COLORS.muted, p: 2, textAlign: "center", lineHeight: 1.5 }}>
        {cardState === "failed" ? (
          <Box>
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: X_COLORS.text }}>The card didn&apos;t draw</Typography>
            <Typography sx={{ fontSize: "0.8125rem", mt: 0.5 }}>{d.card.error ?? "Try again, or post without a card."}</Typography>
            <Button size="small" onClick={() => void requestCard()} disabled={!!busy || !canEdit || cardWait > 0} startIcon={<RotateCw size={14} />} sx={{ mt: 1 }}>
              {cardWait > 0 ? `Try again in ${cardWait}s` : "Try again"}
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CircularProgress size={18} sx={{ color: X_COLORS.blue }} />
            <Typography sx={{ fontSize: "0.875rem" }}>Drawing the card</Typography>
          </Box>
        )}
      </Box>
    );
  })();

  return (
    <Dialog open fullScreen onClose={(e, reason) => (reason === "escapeKeyDown" ? onEscape(e) : void close())} transitionDuration={150} slotProps={{ paper: { sx: { borderRadius: 0, backgroundImage: "none", backgroundColor: "background.default", overflow: "hidden" } } }}>
      <Box sx={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
        {/* Top bar */}
        <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.5, sm: 1 }, px: { xs: 1, sm: 1.5 }, height: 54, flexShrink: 0, backgroundColor: BAR.bg, color: "#fff" }}>
          <Button onClick={() => void close()} aria-label="Back to desk" disabled={busy === "save" || busy === "copy"} sx={{ ...chromeButton, minWidth: 0, flexShrink: 0, gap: 0.75 }}>
            {busy === "save" ? <CircularProgress size={14} sx={{ color: "#fff" }} /> : <ArrowLeft size={16} />}
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
              Desk
            </Box>
          </Button>
          <Box sx={{ display: { xs: "none", sm: "block" }, width: "1px", height: 22, backgroundColor: BAR.border, mx: 0.5 }} />
          <Box sx={{ display: { xs: "none", sm: "contents" } }}>
            <PlatformIcon platform="X (Twitter)" size={16} />
          </Box>
          <Typography component="h1" sx={{ flex: 1, minWidth: 0, px: 1, py: 0.5, borderRadius: "6px", background: headTag ? tagTint(headTag, "dark", 1.4) : "none", fontSize: "0.875rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {headTag && <Box component="span" sx={srOnly}>{TAG_TINT[headTag].label}: </Box>}
            {item.headline || story.fileName || "Untitled file"}
          </Typography>
          {liveCap && (
            <Tooltip title="X posts marked today against the daily plan">
              <Typography sx={{ display: { xs: "none", md: "block" }, px: 0.75, fontSize: "0.75rem", fontVariantNumeric: "tabular-nums", color: BAR.text, whiteSpace: "nowrap" }}>
                {liveCap.used} / {liveCap.cap} today
              </Typography>
            </Tooltip>
          )}
          <Tooltip title="Keyboard shortcuts (?)">
            <IconButton onClick={() => setSheetOpen(true)} aria-label="Keyboard shortcuts" sx={{ color: "#fff", borderRadius: "8px", flexShrink: 0 }}>
              <Keyboard size={17} />
            </IconButton>
          </Tooltip>
          {mayReject && (
            <Button onClick={() => setRejecting(true)} disabled={!canEdit || !!busy} startIcon={<Ban size={14} />} sx={{ ...chromeButton, flexShrink: 0, color: "#FF8A80", "&.Mui-disabled": { color: "rgba(255,255,255,0.35)" } }}>
              Reject
            </Button>
          )}
        </Box>

        {/* Workspace: the post first on phones, the source beside it from lg */}
        <Box sx={{ flex: 1, minHeight: 0, display: { xs: "flex", lg: "grid" }, flexDirection: "column", gridTemplateColumns: "minmax(0, 5fr) minmax(0, 6fr)", overflowY: { xs: "auto", lg: "hidden" } }}>
          {/* Source file */}
          <Box component="section" aria-labelledby="p1-source-title" sx={{ order: { xs: 2, lg: 0 }, flexShrink: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 1.5, p: { xs: 2, md: 3 }, overflowY: { lg: "auto" }, borderRight: { lg: "1px solid" }, borderTop: { xs: "1px solid", lg: 0 }, borderColor: "divider", backgroundColor: "background.paper" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <FileText size={15} aria-hidden />
              <Typography id="p1-source-title" component="h2" sx={panelHead}>
                Source file
              </Typography>
              <Typography sx={{ ml: "auto", fontSize: "0.75rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{clock(story.receivedAt)}</Typography>
            </Box>
            {story.fileName && (
              <Typography sx={{ fontSize: "0.75rem", fontFamily: "var(--font-mono), monospace", color: "text.secondary", overflowWrap: "anywhere", lineHeight: 1.5 }}>{story.fileName}</Typography>
            )}
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, alignItems: "center" }}>
              <Phase1Badges tags={story.tags} needsCheck={story.needsCheck} deskNoteRemoved={story.deskNoteRemoved} />
              {story.district && <Badge tone="plain">{story.district}{story.town ? ` · ${story.town}` : ""}</Badge>}
              {story.desk && <Badge tone="plain" title="Desk / shift">Desk {story.desk}</Badge>}
              {story.reporter && <Badge tone="plain" title="Reporter">{story.reporter}</Badge>}
            </Box>
            {reasons.length > 0 && (
              <Alert severity="warning" sx={{ fontSize: "0.8125rem", borderRadius: "8px", "& .MuiAlert-message": { width: "100%" } }}>
                <Box component="ul" sx={{ m: 0, pl: 2, display: "flex", flexDirection: "column", gap: 0.5 }}>
                  {reasons.map((r) => (
                    <li key={r}>
                      <b>{needsCheckLabel(r)}.</b> {needsCheckHint(r)}
                    </li>
                  ))}
                </Box>
                {story.deskNote && (
                  <Box sx={{ mt: 1, pl: 1.25, borderLeft: "3px solid", borderColor: "warning.main" }}>
                    <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Removed from the post:</Typography>
                    <Typography lang="hi" sx={{ fontSize: "0.8125rem", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{story.deskNote}</Typography>
                  </Box>
                )}
              </Alert>
            )}
            <Box
              role="region"
              aria-label="The file as the desk wrote it"
              tabIndex={0}
              lang="hi"
              sx={{ flex: { lg: 1 }, minHeight: 160, p: 2, borderRadius: "10px", border: "1px solid", borderColor: "divider", backgroundColor: "background.default", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "0.9375rem", lineHeight: 1.75, overflowY: "auto", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } }}
            >
              {story.sourceText?.trim() || story.body || "The server sent no source text for this file."}
            </Box>
          </Box>

          {/* Post */}
          <Box component="section" aria-labelledby="p1-post-title" sx={{ order: { xs: 1, lg: 0 }, flexShrink: 0, minHeight: 0, overflowY: { lg: "auto" }, p: { xs: 2, md: 3 } }}>
            <Box sx={{ maxWidth: 600, mx: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
              {alreadyPosted && (
                <Alert severity="error" variant="filled" role="alert" sx={{ fontSize: "0.875rem", borderRadius: "8px" }}>
                  {alreadyPosted}
                </Alert>
              )}
              {notPosted && !alreadyPosted && (
                <Alert
                  severity="error"
                  variant="filled"
                  role="alert"
                  sx={{ fontSize: "0.875rem", borderRadius: "8px", alignItems: "center" }}
                  action={
                    <Button color="inherit" size="small" variant="outlined" onClick={() => void copyAndPost()} disabled={!canCopy} sx={{ whiteSpace: "nowrap", borderColor: "rgba(255,255,255,0.7)" }}>
                      Retry
                    </Button>
                  }
                >
                  <b>NOT marked as posted. Do not paste this.</b> {notPosted} The clipboard was emptied where the browser allowed it.
                </Alert>
              )}
              {(live.lease.kind !== "mine" || stale !== null) && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {live.lease.kind === "held" && (
                    <Alert severity="info" sx={{ fontSize: "0.8125rem", borderRadius: "8px" }} action={desk?.canAct ? <Button color="inherit" size="small" onClick={() => void run("claim", live.claimAgain)} disabled={!!busy}>Try again</Button> : undefined}>
                      {live.lease.name} is working on this story. You can read it, but not change it.
                    </Alert>
                  )}
                  {live.lease.kind === "lost" && (
                    <Alert severity="warning" sx={{ fontSize: "0.8125rem", borderRadius: "8px" }} action={<Button color="inherit" size="small" onClick={() => void run("claim", live.claimAgain)} disabled={!!busy}>Claim again</Button>}>
                      You no longer hold this story, so changes aren&apos;t being saved. Claim it again to carry on.
                    </Alert>
                  )}
                  {live.lease.kind === "read" && (
                    <Alert severity="info" sx={{ fontSize: "0.8125rem", borderRadius: "8px" }}>
                      {d.posted ? `Already in Posted (${d.posted.by.name}, ${clock(d.posted.at)}).` : desk?.canAct ? "This story can't be edited right now." : "Your role can read posts but not mark them posted."}
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
                </Box>
              )}

              <Box>
                <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", mb: 0.75 }}>
                  <Typography id="p1-post-title" component="h2" sx={panelHead}>
                    Post text
                  </Typography>
                  {saveError ? (
                    <Box role="alert" sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
                      <Typography sx={{ fontSize: "0.6875rem", color: "error.main", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={saveError}>
                        Not saved: {saveError}
                      </Typography>
                      <Button size="small" onClick={retrySave} disabled={!!busy} sx={{ minHeight: 24, py: 0, fontSize: "0.6875rem", flexShrink: 0 }}>
                        Retry
                      </Button>
                    </Box>
                  ) : (
                    <Typography aria-live="polite" sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>
                      {busy === "save" ? "Saving" : dirty && canEdit ? "Saves when you pause" : savedAt ? `Saved ${savedAt}` : ""}
                    </Typography>
                  )}
                </Box>
                <TextField
                  inputRef={textRef}
                  multiline
                  minRows={4}
                  maxRows={12}
                  fullWidth
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  slotProps={{ htmlInput: { "aria-label": "Post text: headline line, then the points", "aria-describedby": "p1-text-hint", readOnly: !canEdit || busy === "copy", lang: "hi" } }}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: "0.9375rem", lineHeight: 1.6, alignItems: "flex-start" } }}
                />
                <Typography id="p1-text-hint" sx={{ fontSize: "0.6875rem", color: "text.secondary", mt: 0.5 }}>
                  The first line is the headline with its #District. Hashtags and handles go on the last line, below.
                </Typography>
              </Box>

              <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
                <Typography component="legend" sx={{ ...panelHead, mb: 0.75 }}>
                  Hashtags and handles
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, alignItems: "center" }}>
                  {tagsOn.map((t) => (
                    <Box key={t} component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.25, pl: 1, pr: canEdit ? 0.25 : 1, height: 30, borderRadius: "15px", border: "1px solid", borderColor: "divider", fontSize: "0.8125rem", color: X_COLORS.blue, backgroundColor: "background.paper" }}>
                      {t}
                      {canEdit && (
                        <IconButton size="small" onClick={() => removeTag(t)} aria-label={`Remove ${t}`} sx={{ width: 24, height: 24, color: "text.secondary" }}>
                          <CloseIcon size={13} />
                        </IconButton>
                      )}
                    </Box>
                  ))}
                  {canEdit && (
                    <TextField
                      size="small"
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => {
                        // Ctrl/Cmd+Enter is Copy & Posted (it takes the typed tag in itself)
                        if (e.ctrlKey || e.metaKey) return;
                        if (e.key === "Enter" || e.key === "," || e.key === " ") {
                          if (!tagDraft.trim()) return;
                          e.preventDefault();
                          addTag(tagDraft);
                          setTagDraft("");
                        }
                      }}
                      onBlur={() => {
                        if (tagDraft.trim()) addTag(tagDraft);
                        setTagDraft("");
                      }}
                      placeholder="#tag or @handle"
                      slotProps={{ htmlInput: { "aria-label": "Add a hashtag or handle, then press Enter" } }}
                      sx={{ width: 170, "& .MuiOutlinedInput-root": { height: 30, borderRadius: "15px", fontSize: "0.8125rem" } }}
                    />
                  )}
                </Box>
                {canEdit && suggestions.length > 0 && (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, alignItems: "center", mt: 1 }}>
                    <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Suggested:</Typography>
                    {suggestions.map((s) => (
                      <Button key={s.value} size="small" variant="outlined" onClick={() => addTag(s.value)} startIcon={<Plus size={13} />} title={`Handle for ${s.entity}`} sx={{ minHeight: 30, borderRadius: "15px", borderStyle: "dashed", fontSize: "0.75rem", textTransform: "none" }}>
                        {s.value}
                      </Button>
                    ))}
                  </Box>
                )}
              </Box>

              <Box>
                <Typography component="h2" sx={{ ...panelHead, mb: 0.75 }}>
                  On X
                </Typography>
                <XPostPreview
                  text={finalText}
                  used={used}
                  media={card}
                  footer={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                      <XCountRing used={used} />
                      <FormControlLabel
                        control={<Switch size="small" checked={addCard} onChange={(e) => toggleCard(e.target.checked)} disabled={!canEdit || !mayCard || busy === "card" || (cardWait > 0 && !addCard)} />}
                        label="Add card"
                        sx={{ m: 0, gap: 0.5, "& .MuiFormControlLabel-label": { fontSize: "0.8125rem", color: X_COLORS.muted } }}
                      />
                      <Box sx={{ flex: 1 }} />
                      <Tooltip title={blockedReason || `Copies the post${addCard ? ", saves the card" : ""} and moves it to Posted (${shortcut})`}>
                        <span>
                          <Button
                            variant="contained"
                            onClick={() => void copyAndPost()}
                            disabled={!canCopy}
                            aria-keyshortcuts="Control+Enter Meta+Enter"
                            startIcon={busy === "copy" ? <CircularProgress size={14} sx={{ color: "#fff" }} /> : <ClipboardCopy size={15} />}
                            sx={{ minHeight: 38, px: 2, borderRadius: "19px", fontWeight: 700, textTransform: "none", whiteSpace: "nowrap", backgroundColor: BREAKING_RED, color: "#fff", boxShadow: "none", "&:hover": { backgroundColor: "#B50F14", boxShadow: "none" }, "&.Mui-disabled": { backgroundColor: "rgba(215,20,26,0.35)", color: "rgba(255,255,255,0.8)" } }}
                          >
                            Copy &amp; Posted
                          </Button>
                        </span>
                      </Tooltip>
                    </Box>
                  }
                />
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 1, lineHeight: 1.5 }}>
                  {blockedReason && !busy ? (
                    <Box component="span" sx={{ color: over || url ? "error.main" : "text.secondary" }}>{blockedReason}.</Box>
                  ) : (
                    <>Paste it into X and attach a photo there if the story needs one. {shortcut} does the same as the button.</>
                  )}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>

      <EditorShortcutsSheet open={sheetOpen} onClose={() => setSheetOpen(false)} phase1 />
      {rejecting && (
        <RejectDialog
          open
          headline={item.headline}
          onClose={() => setRejecting(false)}
          onConfirm={(reason, note) => {
            setRejecting(false);
            void reject(reason, note);
          }}
        />
      )}
      <Snackbar open={!!notice} autoHideDuration={blocked ? null : 6000} onClose={(_, why) => why !== "clickaway" && setNotice("")} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert
          severity="warning"
          onClose={() => setNotice("")}
          sx={{ fontSize: "0.8125rem", alignItems: "center" }}
          action={
            blocked ? (
              <Button color="inherit" size="small" startIcon={<Check size={14} />} disabled={!canCopy} onClick={() => void markCopiedByHand()} sx={{ whiteSpace: "nowrap" }}>
                I copied it, mark posted
              </Button>
            ) : undefined
          }
        >
          {notice}
        </Alert>
      </Snackbar>
    </Dialog>
  );
}
