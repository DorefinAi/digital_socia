"use client";

// "Add hashtag" / "Add handle" under the tag lists: what is typed is searched in the directory (the breaking desk's
// tagSearch hook, here over the demo directory), Enter or a click adds the highlighted result, or what was typed.

import React, { useId, useState } from "react";
import { Box, Typography } from "@mui/material";
import { Plus } from "lucide-react";
import type { HandleSearchItem } from "@/lib/socia/types";
import { XV_TAG_DIRECTORY } from "../data/xVideosData";
import { moveHighlight, searchTerm, useTagSearch, type TagSearchFn } from "../../../components/Newsroom/BreakingDesk/tagSearch";
import { cleanTag } from "./xvTitle";

/** The demo directory, searched like GET /handles?mode=prefix: from the start of the handle or a name */
const demoSearch: TagSearchFn = (q, kind) => {
  const prefix = kind === "mention" ? "@" : "#";
  const term = q.toLowerCase();
  const items: HandleSearchItem[] = XV_TAG_DIRECTORY.filter(
    (e) => e.value.startsWith(prefix) && (e.value.slice(1).toLowerCase().startsWith(term) || e.name.toLowerCase().startsWith(term) || (e.nameHi ?? "").startsWith(q)),
  )
    .slice(0, 6)
    .map((e) => ({ ...e, source: "directory" as const }));
  return Promise.resolve({ items });
};

export default function TagAdder({ prefix, label, onAdd }: { prefix: "#" | "@"; label: string; onAdd: (value: string) => void }) {
  const [draft, setDraft] = useState("");
  const [hi, setHi] = useState(-1);
  const results = useTagSearch(draft, prefix, demoSearch);
  const listId = useId();
  const open = results.length > 0 && !!searchTerm(draft);

  const add = (value: string) => {
    const tag = cleanTag(value, prefix);
    if (!tag) return;
    onAdd(tag);
    setDraft("");
    setHi(-1);
  };

  return (
    <Box sx={{ position: "relative" }}>
      <Box sx={{ display: "flex", alignItems: "center", px: 1.25 }}>
        <Box
          component="input"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && hi >= 0 ? `${listId}-${hi}` : undefined}
          placeholder={label}
          value={draft}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setDraft(e.target.value);
            setHi(-1);
          }}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setHi((h) => moveHighlight(h, results.length, e.key as "ArrowDown" | "ArrowUp"));
            } else if (e.key === "Enter") {
              e.preventDefault();
              add(open && hi >= 0 ? results[hi].value : draft);
            } else if (e.key === "Escape" && draft) {
              e.stopPropagation();
              setDraft("");
            }
          }}
          sx={{ flex: 1, minWidth: 0, height: 34, border: 0, outline: 0, background: "none", font: "inherit", fontSize: "0.8125rem", color: "text.primary", "&::placeholder": { color: "text.disabled" } }}
        />
        <Box
          component="button"
          type="button"
          onClick={() => add(draft)}
          disabled={!cleanTag(draft, prefix)}
          aria-label={`${label}: add what is typed`}
          sx={{ display: "grid", placeItems: "center", width: 28, height: 28, border: 0, borderRadius: "6px", background: "none", color: "text.secondary", cursor: "pointer", "&:disabled": { opacity: 0.4, cursor: "default" }, "&:hover:not(:disabled)": { backgroundColor: "action.hover" } }}
        >
          <Plus size={15} />
        </Box>
      </Box>
      {open && (
        <Box id={listId} role="listbox" aria-label={`${label} results`} sx={{ position: "absolute", zIndex: 3, left: 0, right: 0, top: "100%", mt: 0.25, backgroundColor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden" }}>
          {results.map((r, i) => (
            <Box
              key={r.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === hi}
              onMouseDown={(e: React.MouseEvent) => {
                e.preventDefault();
                add(r.value);
              }}
              onMouseEnter={() => setHi(i)}
              sx={{ px: 1.25, py: 0.75, cursor: "pointer", backgroundColor: i === hi ? "action.selected" : "transparent" }}
            >
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>{r.value}</Typography>
              <Typography lang="hi" sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>
                {[r.name, r.nameHi].filter(Boolean).join(" · ")}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
