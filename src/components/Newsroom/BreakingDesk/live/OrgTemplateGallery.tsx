"use client";

// Post Studio → Templates (X tab), live desk: the desk's shared X card templates (GET /card-templates) as a grid. Anyone who
// edits drafts uploads; the uploader or an admin renames one or moves its text area (the "⋮" menu); only an
// admin sets the defaults per story tag or deletes. The server says what each user may do per template
// (canEdit / canSetDefault / canDelete), the same flags the editor's picker reads.

import React, { useState } from "react";
import { Alert, Box, Button, CircularProgress, IconButton, Tooltip, Typography } from "@mui/material";
import { ImageUp, Trash2 } from "lucide-react";
import * as socia from "@/lib/socia/api";
import type { OrgCardTemplate, OrgTemplateTag } from "@/lib/socia/types";
import { LoadError, LoadingRows } from "@/components/Newsroom/SociaDesk/liveShared";
import { EmptyState, TAG_TINT } from "../shared";
import { errorText, useLiveDesk } from "./LiveDesk";
import { DeleteTemplateDialog, SAMPLE, TemplateOptions, toggledDefaults, UploadTemplateDialog } from "./OrgTemplateManager";
import { Thumb } from "./OrgTemplatePicker";

const TAGS: OrgTemplateTag[] = ["big_breaking", "breaking"];

const shapeNote = (t: { width: number; height: number }) =>
  `${t.width === t.height ? "Square" : t.height > t.width ? "Portrait" : "Landscape"}, ${t.width} × ${t.height}`;

/** The tag's colour as a small dot: yellow for Big breaking, red for Breaking */
const TagDot = ({ tag }: { tag: OrgTemplateTag }) => (
  <Box component="span" aria-hidden sx={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, backgroundColor: `rgb(${TAG_TINT[tag].rgb})`, boxShadow: "0 0 0 1px rgba(0,0,0,0.18)" }} />
);

const defaultChipSx = (tag: OrgTemplateTag, on: boolean) =>
  ({
    display: "inline-flex",
    alignItems: "center",
    gap: 0.6,
    minHeight: 30,
    px: 1,
    border: "1px solid",
    borderRadius: "6px",
    fontFamily: "inherit",
    fontSize: "0.6875rem",
    fontWeight: on ? 700 : 600,
    whiteSpace: "nowrap",
    color: on ? "text.primary" : "text.secondary",
    borderColor: on ? `rgba(${TAG_TINT[tag].rgb}, 0.7)` : "divider",
    backgroundColor: on ? `rgba(${TAG_TINT[tag].rgb}, 0.16)` : "transparent",
  }) as const;

interface CardProps {
  template: OrgCardTemplate;
  refresh: () => Promise<unknown>;
  onNotice: (text: string) => void;
}

function TemplateCard({ template: t, refresh, onNotice }: CardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
      setConfirmDelete(false);
      onNotice(done);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleDefault = (tag: OrgTemplateTag) => {
    const on = t.defaultFor.includes(tag);
    void run(
      () => socia.updateOrgCardTemplate(t.slug, { defaultFor: toggledDefaults(t, tag) }),
      on ? `${t.label} is no longer the ${TAG_TINT[tag].label} default` : `${t.label} is now the ${TAG_TINT[tag].label} default`,
    );
  };

  const shownDefaults = t.canSetDefault ? TAGS : TAGS.filter((tag) => t.defaultFor.includes(tag));

  return (
    <Box component="li" sx={{ listStyle: "none", minWidth: 0, display: "flex", flexDirection: "column", gap: 0.75 }}>
      <Box sx={{ position: "relative", borderRadius: "8px", overflow: "hidden", outline: "1px solid", outlineColor: "divider", backgroundColor: "#0B0B0D", opacity: busy ? 0.6 : 1 }}>
        <Thumb template={t} headline={SAMPLE.headline} body={SAMPLE.body} label={t.label} ariaLabel={`${t.label} with a sample story`} />
        <Box sx={{ position: "absolute", top: 6, right: 6 }}>
          <TemplateOptions template={t} onChanged={refresh} disabled={busy} editOnly />
        </Box>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography component="h3" lang="hi" sx={{ fontSize: "0.8125rem", fontWeight: 700, overflowWrap: "anywhere" }}>
          {t.label}
        </Typography>
        <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", lineHeight: 1.4 }}>
          {shapeNote(t)}
          {t.createdBy?.name ? `. Added by ${t.createdBy.name}` : ""}
        </Typography>
      </Box>
      {(shownDefaults.length > 0 || t.canDelete) && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
          {shownDefaults.length > 0 && (
            <Box role="group" aria-label={t.canSetDefault ? `Make ${t.label} the default for` : `${t.label} is the default for`} sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap", minWidth: 0 }}>
              <Typography component="span" sx={{ fontSize: "0.6875rem", color: "text.secondary", mr: 0.25 }}>
                Default for
              </Typography>
              {shownDefaults.map((tag) => {
                const on = t.defaultFor.includes(tag);
                return t.canSetDefault ? (
                  <Box
                    key={tag}
                    component="button"
                    type="button"
                    aria-pressed={on}
                    disabled={busy}
                    onClick={() => toggleDefault(tag)}
                    sx={{ ...defaultChipSx(tag, on), cursor: busy ? "default" : "pointer", "&:hover": { color: "text.primary", borderColor: `rgba(${TAG_TINT[tag].rgb}, 0.9)` }, "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: "1px" } }}
                  >
                    <TagDot tag={tag} />
                    {TAG_TINT[tag].label}
                  </Box>
                ) : (
                  <Box key={tag} component="span" sx={defaultChipSx(tag, true)}>
                    <TagDot tag={tag} />
                    {TAG_TINT[tag].label}
                  </Box>
                );
              })}
            </Box>
          )}
          {t.canDelete && (
            <Tooltip title="Delete template">
              <span style={{ marginLeft: "auto" }}>
                <IconButton
                  size="small"
                  aria-label={`Delete ${t.label}`}
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    setConfirmDelete(true);
                  }}
                  sx={{ width: 34, height: 34, borderRadius: "8px", color: "text.secondary", "&:hover": { color: "error.main" } }}
                >
                  {busy && !confirmDelete ? <CircularProgress size={14} color="inherit" /> : <Trash2 size={15} />}
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Box>
      )}
      {error && !confirmDelete && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ py: 0, fontSize: "0.75rem" }}>
          {error}
        </Alert>
      )}
      <DeleteTemplateDialog
        template={t}
        open={confirmDelete}
        busy={busy}
        error={confirmDelete ? error : null}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void run(() => socia.deleteOrgCardTemplate(t.slug), `Deleted ${t.label}`)}
      />
    </Box>
  );
}

/** The desk's shared card templates, with upload, defaults and delete where the server allows them. */
export default function OrgTemplateGallery({ onNotice }: { onNotice: (text: string) => void }) {
  const desk = useLiveDesk();
  const [uploadOpen, setUploadOpen] = useState(false);
  if (!desk) return null;
  const polled = desk.orgCardTemplates;
  const templates = polled.data;
  const canUpload = desk.canAct;
  const isAdmin = !!templates?.some((t) => t.canSetDefault || t.canDelete);

  return (
    <Box component="section" aria-labelledby="desk-templates-title" sx={{ backgroundColor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "12px", p: { xs: 2, md: 2.5 } }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
        <Box sx={{ minWidth: 0, flex: "1 1 260px" }}>
          <Typography id="desk-templates-title" component="h2" sx={{ fontWeight: 700, fontSize: "1rem" }}>
            Desk card templates
          </Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.5, maxWidth: "62ch", lineHeight: 1.6 }}>
            Shared by everyone on the X desk. A story opens on the default for its tag, and the editor can switch it to any other design here.
            {templates && templates.length > 0 && !isAdmin ? " Only an admin can change the defaults or delete a template." : ""}
          </Typography>
        </Box>
        {canUpload && (
          <Button variant="outlined" startIcon={<ImageUp size={15} />} onClick={() => setUploadOpen(true)} sx={{ flexShrink: 0, whiteSpace: "nowrap", color: "text.primary", borderColor: "divider", textTransform: "none", fontWeight: 600 }}>
            Upload template
          </Button>
        )}
      </Box>

      {!templates ? (
        polled.error ? <LoadError error={polled.error} onRetry={() => void polled.refresh()} /> : <LoadingRows rows={2} height={140} />
      ) : templates.length === 0 ? (
        <EmptyState
          title="No desk templates yet"
          hint={canUpload ? "Upload a PNG or JPG design and every X card on the desk can use it." : "When someone uploads a design it shows up here for the whole desk."}
        />
      ) : (
        <Box component="ul" aria-label="Desk card templates" sx={{ m: 0, p: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: { xs: 1.5, md: 2 }, alignItems: "start" }}>
          {templates.map((t) => (
            <TemplateCard key={t.slug} template={t} refresh={polled.refresh} onNotice={onNotice} />
          ))}
        </Box>
      )}

      {canUpload && (
        <UploadTemplateDialog
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onDone={(t) => {
            setUploadOpen(false);
            void polled.refresh().then(() => onNotice(`Uploaded ${t.label}`));
          }}
        />
      )}
    </Box>
  );
}
