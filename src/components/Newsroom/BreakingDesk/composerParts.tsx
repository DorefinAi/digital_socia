"use client";

import React, { useState } from "react";
import { Box, Typography, IconButton, Checkbox } from "@mui/material";
import { Send, Plus, Heart, MessageCircle, Repeat2, Bookmark, BarChart2 } from "lucide-react";
import { SocialPlatform } from "@/types/newsroom";
import { CHANNEL } from "@/constants";
import { BREAKING_RED } from "./TemplateCanvas";
import { TagSuggestion, normaliseTag } from "./socialText";
import { RichPostText } from "./shared";

export interface TagOption extends TagSuggestion {
  checked: boolean;
}

export const sectionLabel = {
  fontSize: "0.6875rem",
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase" as const,
  color: "text.secondary",
};

export const fieldSx = { "& .MuiOutlinedInput-root": { borderRadius: "8px", fontSize: "0.875rem", lineHeight: 1.55 } };

export function TagPicker({
  label,
  prefix,
  options,
  max,
  onChange,
}: {
  label: string;
  prefix: "#" | "@";
  options: TagOption[];
  max: number;
  onChange: (options: TagOption[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const selected = options.filter((o) => o.checked).length;

  const add = () => {
    const value = normaliseTag(draft, prefix);
    setDraft("");
    if (!value) return;
    const existing = options.find((o) => o.value.toLowerCase() === value.toLowerCase());
    if (existing) onChange(options.map((o) => (o === existing ? { ...o, checked: true } : o)));
    else onChange([...options, { value, reason: "Added by editor", checked: true }]);
  };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 0.75 }}>
        <Typography sx={sectionLabel}>{label}</Typography>
        <Typography sx={{ fontSize: "0.6875rem", color: selected > max ? "error.main" : "text.secondary" }}>
          {selected} selected{selected > max ? ` · max ${max}` : ""}
        </Typography>
      </Box>
      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: "8px", overflow: "hidden" }}>
        {options.length === 0 && (
          <Typography sx={{ px: 1.25, py: 1, fontSize: "0.8125rem", color: "text.secondary" }}>
            No automatic match for this story. Add one below.
          </Typography>
        )}
        {options.map((option, i) => (
          <Box
            key={option.value}
            component="label"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              pr: 1.25,
              cursor: "pointer",
              borderTop: i === 0 ? "none" : "1px solid",
              borderColor: "divider",
              "&:hover": { backgroundColor: "action.hover" },
            }}
          >
            <Checkbox
              size="small"
              checked={option.checked}
              onChange={(e) => onChange(options.map((o) => (o === option ? { ...o, checked: e.target.checked } : o)))}
              sx={{ p: 0.75 }}
            />
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              {option.value}
            </Typography>
            <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", whiteSpace: "nowrap" }}>{option.reason}</Typography>
          </Box>
        ))}
        <Box sx={{ display: "flex", borderTop: options.length ? "1px solid" : "none", borderColor: "divider" }}>
          <Box
            component="input"
            value={draft}
            placeholder={prefix === "#" ? "Add hashtag" : "Add handle"}
            aria-label={prefix === "#" ? "Add hashtag" : "Add handle"}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            sx={{
              flex: 1,
              minWidth: 0,
              border: 0,
              outline: 0,
              px: 1.25,
              py: 0.9,
              fontSize: "0.8125rem",
              fontFamily: "inherit",
              color: "text.primary",
              backgroundColor: "transparent",
              "&:focus-visible": { backgroundColor: "action.hover" },
            }}
          />
          <IconButton size="small" onClick={add} disabled={!draft.trim()} aria-label="Add" sx={{ borderRadius: 0, px: 1.25 }}>
            <Plus size={15} />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}

// ─── Platform mock used by the preview ─────────────────────────────────────────
export function PostMock({ platform, text, children }: { platform: SocialPlatform; text: string; children: React.ReactNode }) {
  const isX = platform === "X (Twitter)";
  const avatar = (
    <Box sx={{ width: 40, height: 40, flexShrink: 0, borderRadius: "50%", backgroundColor: BREAKING_RED, color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: "0.8125rem" }}>
      1st
    </Box>
  );

  if (isX) {
    return (
      <Box sx={{ display: "flex", gap: 1.25, p: 2, backgroundColor: "#fff", color: "#0F1419", borderRadius: "12px", border: "1px solid #EFF3F4" }}>
        {avatar}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: "0.9375rem", lineHeight: 1.3 }}>
            <b>First India News</b> <span style={{ color: "#536471" }}>@{CHANNEL.xHandle} · now</span>
          </Typography>
          <Typography sx={{ fontSize: "0.9375rem", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", mt: 0.25 }}>
            <RichPostText text={text} linkColor="#1D9BF0" />
          </Typography>
          <Box sx={{ mt: 1.25, borderRadius: "14px", overflow: "hidden", border: "1px solid #CFD9DE", lineHeight: 0 }}>{children}</Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1.25, color: "#536471", maxWidth: 380 }}>
            <MessageCircle size={17} />
            <Repeat2 size={17} />
            <Heart size={17} />
            <BarChart2 size={17} />
            <Bookmark size={17} />
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ backgroundColor: "#fff", color: "#111", borderRadius: "12px", border: "1px solid #DBDBDB", overflow: "hidden" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.25 }}>
        <Box sx={{ transform: "scale(0.8)", transformOrigin: "left center", width: 32 }}>{avatar}</Box>
        <Typography sx={{ fontSize: "0.875rem", fontWeight: 700 }}>{CHANNEL.instagramHandle}</Typography>
      </Box>
      <Box sx={{ lineHeight: 0, backgroundColor: "#000", display: "flex", justifyContent: "center" }}>{children}</Box>
      <Box sx={{ display: "flex", gap: 1.5, px: 1.5, pt: 1.25 }}>
        <Heart size={22} />
        <MessageCircle size={22} />
        <Send size={22} />
        <Box sx={{ ml: "auto", display: "flex" }}>
          <Bookmark size={22} />
        </Box>
      </Box>
      <Typography sx={{ fontSize: "0.875rem", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", p: 1.5, pt: 1 }}>
        <b>{CHANNEL.instagramHandle}</b> <RichPostText text={text} linkColor="#00376B" />
      </Typography>
    </Box>
  );
}
