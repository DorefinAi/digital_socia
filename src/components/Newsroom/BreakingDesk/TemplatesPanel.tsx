"use client";

import React, { useState } from "react";
import { Box, Typography, Button, IconButton, Dialog, TextField, Tooltip } from "@mui/material";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { usePermissions } from "@/lib/access/usePermissions";
import { HandleEntry, HashtagRule } from "@/types/newsroom";
import { normaliseTag } from "./socialText";
import { formatStamp, listFrameSx } from "./shared";

const fieldSx = { "& .MuiOutlinedInput-root": { borderRadius: "8px", fontSize: "0.875rem" } };
const headSx = { display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 };
const rowSx = (i: number) => ({ display: "flex", alignItems: "center", gap: 1, px: 1.25, py: 0.9, borderTop: i ? "1px solid" : "none", borderColor: "divider" });

function FormDialog({ title, open, canSave, onClose, onSave, children }: { title: string; open: boolean; canSave: boolean; onClose: () => void; onSave: () => void; children: React.ReactNode }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: "14px", backgroundImage: "none" } } }}>
      <Box component="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); if (canSave) onSave(); }} sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
        {children}
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!canSave}>Save</Button>
        </Box>
      </Box>
    </Dialog>
  );
}

// ─── Hashtag rules ───────────────────────────────────────────────────────────
function RuleEditor({ rule, onClose }: { rule: Partial<HashtagRule>; onClose: () => void }) {
  const { saveHashtagRule } = useNewsroom();
  const [area, setArea] = useState(rule.area ?? "");
  const [tags, setTags] = useState((rule.hashtags ?? []).join(" "));
  const hashtags = Array.from(new Set(tags.split(/[\s,]+/).map((t) => normaliseTag(t, "#")).filter(Boolean)));

  return (
    <FormDialog
      title={rule.id ? "Edit hashtag rule" : "Add hashtag rule"}
      open
      canSave={!!area.trim() && hashtags.length > 0}
      onClose={onClose}
      onSave={() => {
        saveHashtagRule({ id: rule.id, area: area.trim(), hashtags });
        onClose();
      }}
    >
      <TextField size="small" label="City or district (as written on the FTP story)" value={area} onChange={(e) => setArea(e.target.value)} sx={fieldSx} autoFocus />
      <TextField size="small" label="Hashtags" helperText={hashtags.length ? hashtags.join("  ") : "Separate with spaces, e.g. #Jaipur #JaipurNews"} value={tags} onChange={(e) => setTags(e.target.value)} sx={fieldSx} />
    </FormDialog>
  );
}

// ─── Handle directory ────────────────────────────────────────────────────────
function HandleEditor({ entry, onClose }: { entry: Partial<HandleEntry>; onClose: () => void }) {
  const { saveHandle } = useNewsroom();
  const [entity, setEntity] = useState(entry.entity ?? "");
  const [x, setX] = useState(entry.x ?? "");
  const [instagram, setInstagram] = useState(entry.instagram ?? "");

  return (
    <FormDialog
      title={entry.id ? "Edit handle" : "Add handle"}
      open
      canSave={!!entity.trim() && (!!normaliseTag(x, "@") || !!normaliseTag(instagram, "@"))}
      onClose={onClose}
      onSave={() => {
        saveHandle({ id: entry.id, entity: entity.trim(), x: normaliseTag(x, "@"), instagram: normaliseTag(instagram, "@") });
        onClose();
      }}
    >
      <TextField size="small" label="Person or organisation (as named in stories)" value={entity} onChange={(e) => setEntity(e.target.value)} sx={fieldSx} autoFocus />
      <TextField size="small" label="X handle" placeholder="@handle" value={x} onChange={(e) => setX(e.target.value)} sx={fieldSx} />
      <TextField size="small" label="Instagram handle" placeholder="@handle" value={instagram} onChange={(e) => setInstagram(e.target.value)} sx={fieldSx} />
      <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Saving marks the handle as verified today. Check it on the platform first: a wrong political handle is a public mistake.</Typography>
    </FormDialog>
  );
}

export default function TemplatesPanel() {
  const { hashtagRules, handleDirectory, deleteHashtagRule, deleteHandle } = useNewsroom();
  const { can } = usePermissions();
  const [rule, setRule] = useState<Partial<HashtagRule> | null>(null);
  const [handle, setHandle] = useState<Partial<HandleEntry> | null>(null);
  const canEdit = can("draft.edit");

  const iconBtn = { width: 30, height: 30, borderRadius: "6px" };

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "1fr 1fr" }, gap: 2.5, alignItems: "start" }}>
      <Box>
        <Box sx={headSx}>
          <Box>
            <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>Hashtag rules</Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Applied automatically when a story&apos;s area matches.</Typography>
          </Box>
          {canEdit && <Button size="small" variant="outlined" startIcon={<Plus size={14} />} onClick={() => setRule({})}>Add rule</Button>}
        </Box>
        <Box sx={listFrameSx}>
          {hashtagRules.map((r, i) => (
            <Box key={r.id} sx={rowSx(i)}>
              <Typography sx={{ width: 110, flexShrink: 0, fontSize: "0.8125rem", fontWeight: 600 }}>{r.area}</Typography>
              <Typography sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem", color: "#1D9BF0" }}>{r.hashtags.join("  ")}</Typography>
              {canEdit && (
                <>
                  <Tooltip title="Edit"><IconButton size="small" aria-label={`Edit ${r.area}`} onClick={() => setRule(r)} sx={iconBtn}><Pencil size={14} /></IconButton></Tooltip>
                  <Tooltip title="Delete"><IconButton size="small" aria-label={`Delete ${r.area}`} onClick={() => deleteHashtagRule(r.id)} sx={iconBtn}><Trash2 size={14} /></IconButton></Tooltip>
                </>
              )}
            </Box>
          ))}
          {!hashtagRules.length && <Typography sx={{ p: 2, fontSize: "0.8125rem", color: "text.secondary" }}>No rules yet.</Typography>}
        </Box>
      </Box>

      <Box>
        <Box sx={headSx}>
          <Box>
            <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>Handle directory</Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Verified handles are tagged without asking; anything else needs a click.</Typography>
          </Box>
          {canEdit && <Button size="small" variant="outlined" startIcon={<Plus size={14} />} onClick={() => setHandle({})}>Add handle</Button>}
        </Box>
        <Box sx={listFrameSx}>
          {handleDirectory.map((h, i) => (
            <Box key={h.id} sx={rowSx(i)}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>{h.entity}</Typography>
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  X {h.x || "–"} · IG {h.instagram || "–"} · verified {formatStamp(h.verifiedAt)}
                </Typography>
              </Box>
              {canEdit && (
                <>
                  <Tooltip title="Edit"><IconButton size="small" aria-label={`Edit ${h.entity}`} onClick={() => setHandle(h)} sx={iconBtn}><Pencil size={14} /></IconButton></Tooltip>
                  <Tooltip title="Delete"><IconButton size="small" aria-label={`Delete ${h.entity}`} onClick={() => deleteHandle(h.id)} sx={iconBtn}><Trash2 size={14} /></IconButton></Tooltip>
                </>
              )}
            </Box>
          ))}
          {!handleDirectory.length && <Typography sx={{ p: 2, fontSize: "0.8125rem", color: "text.secondary" }}>No handles yet.</Typography>}
        </Box>
      </Box>

      {rule && <RuleEditor rule={rule} onClose={() => setRule(null)} />}
      {handle && <HandleEditor entry={handle} onClose={() => setHandle(null)} />}
    </Box>
  );
}
