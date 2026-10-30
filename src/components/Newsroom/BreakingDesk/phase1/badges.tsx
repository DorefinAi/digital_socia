"use client";

// Phase 1 badges, shared by the queue rows and the editor's source panel: what the file name said (BIG,
// UPDATE) and why a ready post needs a second look (phase1-contract.md §1 needs-check codes).

import React from "react";
import { Box } from "@mui/material";
import { AlertTriangle } from "lucide-react";
import type { FileTags, NeedsCheckCode } from "@/lib/socia/types";
import { BIG_BREAKING_YELLOW } from "../cardRender";

const NEEDS_CHECK_LABEL: Record<string, string> = {
  empty: "Empty file",
  no_hindi: "No Hindi text",
  very_long: "Very long file",
  no_district: "No district, check",
  desk_note: "Desk note removed",
  headline_cut: "Headline cut to fit",
  no_headline: "No headline",
  resaved: "File re-saved, check text",
  update_of_posted: "Update of a posted story",
};

/** What a needs-check reason means, in the desk's words */
const NEEDS_CHECK_HINT: Record<string, string> = {
  empty: "The file has no text to post.",
  no_hindi: "The file has no Hindi text. It may be in a legacy font or the wrong file.",
  very_long: "The file is over 25 lines. Check that the post kept the main points.",
  no_district: "No district was found, so the post has no #District tag. Add one if the story is local.",
  desk_note: "A desk instruction (नोट) was taken out of the text. Check that nothing else went with it.",
  headline_cut: "The headline alone was too long for 280 and was cut.",
  no_headline: "No headline line was found.",
  resaved: "The desk saved this file again with new text, and the post was rewritten from it. Check it against the source.",
  update_of_posted: "This file was re-saved after its story was posted. Post it only if the change is news.",
};

export const needsCheckLabel = (code: NeedsCheckCode) => NEEDS_CHECK_LABEL[code] ?? code.replace(/_/g, " ");
export const needsCheckHint = (code: NeedsCheckCode) => NEEDS_CHECK_HINT[code] ?? null;

type Tone = "big" | "update" | "warn" | "plain";

const toneSx: Record<Tone, object> = {
  big: { backgroundColor: BIG_BREAKING_YELLOW, color: "#111", borderColor: "transparent", fontWeight: 800, letterSpacing: "0.04em" },
  update: { backgroundColor: "rgba(29, 155, 240, 0.12)", color: "#0B6BB0", borderColor: "rgba(29, 155, 240, 0.35)", fontWeight: 700 },
  warn: { backgroundColor: "rgba(237, 108, 2, 0.1)", color: "warning.dark", borderColor: "rgba(237, 108, 2, 0.35)", fontWeight: 600 },
  plain: { backgroundColor: "transparent", color: "text.secondary", borderColor: "divider", fontWeight: 600 },
};

export function Badge({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  return (
    <Box
      component="span"
      title={title}
      sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, px: 0.75, py: "1px", border: "1px solid", borderRadius: "4px", fontSize: "0.6875rem", lineHeight: 1.5, whiteSpace: "nowrap", ...toneSx[tone] }}
    >
      {children}
    </Box>
  );
}

interface Phase1BadgesProps {
  tags?: FileTags | null;
  needsCheck?: NeedsCheckCode[];
  deskNoteRemoved?: boolean;
}

/** BIG, UPDATE, then each needs-check reason (the desk note once, whichever way the server sent it). */
export function Phase1Badges({ tags, needsCheck = [], deskNoteRemoved }: Phase1BadgesProps) {
  const reasons = [...needsCheck];
  if (deskNoteRemoved && !reasons.includes("desk_note")) reasons.push("desk_note");
  if (!tags?.big && !tags?.update && !tags?.exclusive && !reasons.length) return null;
  return (
    <>
      {tags?.big && <Badge tone="big">BIG</Badge>}
      {tags?.update && <Badge tone="update">UPDATE</Badge>}
      {tags?.exclusive && <Badge tone="plain">Exclusive</Badge>}
      {reasons.map((r) => (
        <Badge key={r} tone="warn" title={needsCheckHint(r) ?? undefined}>
          <AlertTriangle size={11} aria-hidden />
          {needsCheckLabel(r)}
        </Badge>
      ))}
    </>
  );
}
