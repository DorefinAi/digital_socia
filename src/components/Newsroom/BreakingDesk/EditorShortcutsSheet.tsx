"use client";

// The X editor's "Keyboard shortcuts" sheet ("?"), and the ask-before-leaving dialog that Esc opens.
// Both read editorKeys.ts, so what they list is what the editor's key handler does.

import React, { useRef } from "react";
import { Box, Button, CircularProgress, Dialog, IconButton, Typography } from "@mui/material";
import { X as CloseIcon } from "lucide-react";
import { EDITOR_KEYS, EDITOR_POINTER_KEYS, type EditorKeySection, editorKeyLabel, editorKeyName } from "./editorKeys";

const SECTIONS: EditorKeySection[] = ["Post", "Edit", "Text box", "Help"];

function Keys({ keys }: { keys: string[] }) {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 0.5 }}>
      {keys.map((k, i) => (
        <React.Fragment key={k}>
          {i > 0 && (
            <Typography component="span" sx={{ fontSize: "0.6875rem", color: "text.secondary", alignSelf: "center" }}>
              or
            </Typography>
          )}
          <Box
            component="kbd"
            aria-label={editorKeyName(k)}
            sx={{
              px: 0.75,
              minWidth: 22,
              height: 22,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "5px",
              border: "1px solid",
              borderColor: "divider",
              borderBottomWidth: 2,
              backgroundColor: "background.default",
              fontFamily: "inherit",
              fontSize: "0.75rem",
              fontWeight: 600,
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {editorKeyLabel(k)}
          </Box>
        </React.Fragment>
      ))}
    </Box>
  );
}

const rowSx = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: 1.5, py: 0.6 } as const;
const headSx = { fontSize: "0.75rem", fontWeight: 700, color: "text.secondary", mt: 2, mb: 0.25 } as const;

export function EditorShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="x-editor-keys-title" slotProps={{ paper: { sx: { borderRadius: "14px", backgroundImage: "none" } } }}>
      <Box sx={{ display: "flex", alignItems: "center", px: 2.5, pt: 2, pb: 0.5 }}>
        <Typography id="x-editor-keys-title" component="h2" sx={{ fontWeight: 700, fontSize: "1rem", flex: 1 }}>
          Keyboard shortcuts
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label="Close shortcuts" sx={{ mr: -0.75 }}>
          <CloseIcon size={18} />
        </IconButton>
      </Box>
      <Box sx={{ px: 2.5, pb: 2.5, overflowY: "auto" }}>
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", lineHeight: 1.5 }}>
          While you type in a box, only Save and Post work; Esc leaves the box first. Undo covers the card, the post
          text, hashtags, mentions, the photo and which card posts.
        </Typography>
        {SECTIONS.map((section) => (
          <Box key={section} component="section" aria-label={section}>
            <Typography component="h3" sx={headSx}>
              {section}
            </Typography>
            {EDITOR_KEYS.filter((k) => k.section === section).map((k) => (
              <Box key={k.id} sx={rowSx}>
                <Typography sx={{ fontSize: "0.8125rem" }}>{k.label}</Typography>
                <Keys keys={k.show ?? k.keys} />
              </Box>
            ))}
          </Box>
        ))}
        <Typography component="h3" sx={headSx}>
          Mouse
        </Typography>
        {EDITOR_POINTER_KEYS.map((k) => (
          <Box key={k.keys} sx={rowSx}>
            <Typography sx={{ fontSize: "0.8125rem" }}>{k.label}</Typography>
            <Keys keys={[k.keys]} />
          </Box>
        ))}
      </Box>
    </Dialog>
  );
}

/** Esc with unsaved work: save and close, close without the unsaved part, or stay. */
export function LeaveEditorDialog({ open, busy, onSave, onDiscard, onStay }: { open: boolean; busy: boolean; onSave: () => void; onDiscard: () => void; onStay: () => void }) {
  return (
    <Dialog open={open} onClose={onStay} maxWidth="xs" fullWidth aria-labelledby="x-editor-leave-title" aria-describedby="x-editor-leave-text" slotProps={{ paper: { role: "alertdialog", sx: { borderRadius: "14px", backgroundImage: "none" } } }}>
      <Box sx={{ p: 2.5 }}>
        <Typography id="x-editor-leave-title" component="h2" sx={{ fontWeight: 700, fontSize: "1rem" }}>
          Keep your changes?
        </Typography>
        <Typography id="x-editor-leave-text" sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.75, lineHeight: 1.55 }}>
          Some changes to this post aren&apos;t saved yet. Save them before closing, or close and lose them.
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 1, mt: 2.5 }}>
          <Button onClick={onStay} disabled={busy} sx={{ color: "text.secondary" }}>
            Keep editing
          </Button>
          <Button color="error" onClick={onDiscard} disabled={busy}>
            Discard changes
          </Button>
          <Button variant="contained" onClick={onSave} disabled={busy} autoFocus startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
            Save and close
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}

/**
 * Asked before a post goes out when it needs a second look: the reworded text is still too close to its
 * source, or (demo desk) Ctrl+Enter would save as posted with no undo window. Cancel has the focus.
 */
export function ConfirmPostDialog({ open, title, text, confirmLabel, onConfirm, onCancel }: { open: boolean; title: string; text: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
      aria-labelledby="x-editor-confirm-title"
      aria-describedby="x-editor-confirm-text"
      slotProps={{
        paper: { role: "alertdialog", sx: { borderRadius: "14px", backgroundImage: "none" } },
        // The safe choice has the focus, so a held or repeated Enter never posts
        transition: { onEntering: () => cancelRef.current?.focus() },
      }}
    >
      <Box sx={{ p: 2.5 }}>
        <Typography id="x-editor-confirm-title" component="h2" sx={{ fontWeight: 700, fontSize: "1rem" }}>
          {title}
        </Typography>
        <Typography id="x-editor-confirm-text" sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.75, lineHeight: 1.55 }}>
          {text}
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 1, mt: 2.5 }}>
          <Button ref={cancelRef} variant="outlined" onClick={onCancel} autoFocus>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}
