"use client";

import React from "react";
import { Alert, Box, Button, Typography } from "@mui/material";
import { ApiError } from "@/lib/socia/client";
import type { CapUsage } from "@/lib/socia/types";

/** The sentence to show for any failed call: the API's own message, or a plain fallback. */
export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    const problems = err.data.problems;
    if (err.code === "post_invalid" && Array.isArray(problems) && problems.length > 1) return problems.join(" ");
    return err.message;
  }
  return "Something went wrong. Try again.";
}

export const errorCode = (err: unknown) => (err instanceof ApiError ? err.code : null);

export const tileSx = { backgroundColor: "background.paper", borderRadius: "12px", px: 2, py: 1.5, border: "1px solid", borderColor: "divider", boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.03)" };

export const capColor = (cap: CapUsage) => (cap.level === "full" || cap.level === "danger" ? "error" : cap.level === "warn" ? "warning" : "success");

/** "14:05", 24-hour, the desk's clock format. */
export const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

/** Lists of tags typed as "#Baran #Jaipur" or "Baran, Jaipur": trimmed, deduped, with the sigil added. */
export function parseTags(text: string, sigil: "#" | "@"): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,]+/)) {
    const t = raw.trim();
    if (!t) continue;
    const tag = t.startsWith(sigil) ? t : `${sigil}${t}`;
    if (!out.includes(tag)) out.push(tag);
  }
  return out;
}

/** Shown in place of a list when its request failed. */
export function LoadError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <Alert
      severity="error"
      action={
        <Button color="inherit" size="small" onClick={onRetry}>
          Try again
        </Button>
      }
      sx={{ borderRadius: "10px", fontSize: "0.8125rem" }}
    >
      {errorText(error)}
    </Alert>
  );
}

/** Placeholder rows while a list loads for the first time. */
export function LoadingRows({ rows = 3, height = 64 }: { rows?: number; height?: number }) {
  return (
    <Box aria-busy="true" aria-label="Loading" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {Array.from({ length: rows }, (_, i) => (
        <Box key={i} sx={{ height, borderRadius: "8px", backgroundColor: "action.hover" }} />
      ))}
    </Box>
  );
}

/** A card image from the API, or a dark frame when there is none yet. */
export function CardImage({ src, alt, dim, label }: { src: string | null | undefined; alt: string; dim?: boolean; label?: string }) {
  return (
    <Box sx={{ position: "relative", width: "100%", height: "100%", backgroundColor: "#111", opacity: dim ? 0.5 : 1 }}>
      {src ? (
        // Signed/local file URLs from the API; next/image would need every host configured
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <Typography sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#bbb", fontSize: "0.6875rem", textAlign: "center", px: 1 }}>
          {label ?? "Card is being drawn"}
        </Typography>
      )}
    </Box>
  );
}
