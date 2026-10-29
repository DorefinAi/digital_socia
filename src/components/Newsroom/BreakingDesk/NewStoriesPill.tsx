"use client";

import React from "react";
import { Box } from "@mui/material";
import { ArrowUp } from "lucide-react";
import { srOnly } from "../ui/controls";

/** What the pill counts, singular and plural */
export type PillNoun = [one: string, many: string];
const countLabel = (count: number, [one, many]: PillNoun) => `${count} new ${count === 1 ? one : many}`;

/**
 * "↑ 3 new stories": stories that came in while the operator was working wait behind this pill instead of
 * pushing the list down. It floats at the top of its list (sticky, taking no room); click to show them.
 * The live region announces the count politely, also while the pill is hidden.
 */
export default function NewStoriesPill({ count, onShow, top = 8, noun = ["story", "stories"] }: { count: number; onShow: () => void; top?: number; noun?: PillNoun }) {
  return (
    <>
      <Box role="status" aria-live="polite" sx={srOnly}>
        {count > 0 ? countLabel(count, noun) : ""}
      </Box>
      {count > 0 && (
        <Box sx={{ position: "sticky", top, zIndex: 3, height: 0, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <Box
            component="button"
            type="button"
            onClick={onShow}
            aria-label={`Show ${countLabel(count, noun)}`}
            sx={{
              pointerEvents: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 0.75,
              height: 34,
              px: 1.75,
              border: 0,
              borderRadius: "999px",
              backgroundColor: "#1D9BF0",
              color: "#fff",
              fontFamily: "inherit",
              fontSize: "0.8125rem",
              fontWeight: 700,
              whiteSpace: "nowrap",
              cursor: "pointer",
              boxShadow: "0 6px 18px rgba(0, 0, 0, 0.22)",
              "&:hover": { backgroundColor: "#1A8CD8" },
              "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: "2px" },
              "@media (prefers-reduced-motion: no-preference)": { animation: "newPillIn 180ms ease-out" },
              "@keyframes newPillIn": { from: { opacity: 0, transform: "translateY(-6px)" }, to: { opacity: 1, transform: "none" } },
            }}
          >
            <ArrowUp size={15} />
            {countLabel(count, noun)}
          </Box>
        </Box>
      )}
    </>
  );
}

/** Background for a story that has just been shown: a brief tint that fades out over about two seconds. */
export const freshHighlightSx = {
  "@keyframes freshFade": { from: { boxShadow: "inset 0 0 0 999px rgba(29, 155, 240, 0.16)" }, to: { boxShadow: "inset 0 0 0 999px rgba(29, 155, 240, 0)" } },
  animation: "freshFade 2.2s ease-out",
} as const;
