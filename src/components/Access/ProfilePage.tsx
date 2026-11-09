"use client";

// Your profile: a header card with who you are, quick links on the left, and section cards on the right (basic
// details, sign-in & security, keyboard shortcuts, what your role allows, this browser).

import React, { useCallback, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Snackbar, Typography } from "@mui/material";
import { Eraser, Keyboard, ListChecks, Monitor, ShieldCheck, UserRound } from "lucide-react";
import { usePermissions } from "@/lib/access/usePermissions";
import { tidyBrowserStorage } from "@/lib/browserTidy";
import { AllowedMark, ConfirmDialog, SectionHeading, groupCatalogue } from "./shared";
import ProfileHeader from "./profile/ProfileHeader";
import QuickLinks, { jumpTo, type QuickLink } from "./profile/QuickLinks";
import BasicDetails from "./profile/BasicDetails";
import SecuritySection from "./profile/SecuritySection";
import KeyboardShortcuts from "./profile/KeyboardShortcuts";
import { SectionCard } from "./profile/parts";

const LINKS: QuickLink[] = [
  { id: "basic-details", label: "Basic details", icon: <UserRound size={16} aria-hidden /> },
  { id: "sign-in-security", label: "Sign-in & security", icon: <ShieldCheck size={16} aria-hidden /> },
  { id: "keyboard-shortcuts", label: "Keyboard shortcuts", icon: <Keyboard size={16} aria-hidden /> },
  { id: "what-you-can-do", label: "What you can do", icon: <ListChecks size={16} aria-hidden /> },
  { id: "this-browser", label: "This browser", icon: <Monitor size={16} aria-hidden /> },
];

/** Removes the editor's saved per-draft data from this browser now; sign-in, theme and layout stay. */
function ClearBrowserCache() {
  const [cleared, setCleared] = useState<number | null>(null);
  const [asking, setAsking] = useState(false);
  const clear = () => {
    setAsking(false);
    setCleared(tidyBrowserStorage({ force: true }));
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", py: 1 }}>
      <Button variant="outlined" startIcon={<Eraser size={15} />} onClick={() => setAsking(true)} sx={{ borderColor: "divider", color: "text.primary", borderRadius: "10px" }}>
        Clear this browser&apos;s cache
      </Button>
      <ConfirmDialog open={asking} title="Clear this browser's cache?" confirmLabel="Clear cache" danger onConfirm={clear} onClose={() => setAsking(false)}>
        This removes what the editor saved in this browser for each story: card designs and template picks, uploaded X-background cards, and
        unfinished video projects (except ones saved in the last 10 minutes). It can&apos;t be undone. Your sign-in, theme and layout stay.
      </ConfirmDialog>
      <Typography role="status" sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
        {cleared === null ? "" : cleared === 0 ? "Nothing saved to clear." : `Cleared ${cleared} saved ${cleared === 1 ? "item" : "items"}.`}
      </Typography>
    </Box>
  );
}

/** What the role (and any exceptions an admin set) allows, page by page and action by action */
function WhatYouCanDo({ id }: { id: string }) {
  const { roleLabel, catalogue, overrides, can } = usePermissions();
  const [show, setShow] = useState<"all" | "allowed">("all");
  const groups = groupCatalogue(catalogue);
  const exception = (key: string) => overrides.find((o) => o.permission === key);
  const pagesAllowed = groups.pages.filter((p) => can(p.key)).length;
  const actionItems = groups.actions.flatMap((s) => s.items);
  const actionsAllowed = actionItems.filter((p) => can(p.key)).length;

  const rows = (items: typeof catalogue) =>
    items
      .filter((p) => show === "all" || can(p.key))
      .map((p) => (
        <Box component="li" key={p.key} sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, py: 1.25, borderTop: "1px solid", borderColor: "divider", "&:first-of-type": { borderTop: "none" } }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: can(p.key) ? "text.primary" : "text.secondary" }}>{p.label}</Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{p.description}</Typography>
            {exception(p.key) && <Chip size="small" variant="outlined" label="Set for you by an admin" sx={{ mt: 0.5, height: 20, fontSize: "0.6875rem", borderColor: "divider" }} />}
          </Box>
          <AllowedMark allowed={can(p.key)} />
        </Box>
      ));

  return (
    <SectionCard
      id={id}
      icon={<ListChecks size={18} />}
      title="What you can do"
      description={`${pagesAllowed} of ${groups.pages.length} pages and ${actionsAllowed} of ${actionItems.length} actions, from the ${roleLabel} role${overrides.length ? " and your exceptions" : ""}.`}
      action={
        <Box role="group" aria-label="Show" sx={{ display: "inline-flex", border: "1px solid", borderColor: "divider", borderRadius: "10px", p: "2px" }}>
          {(["all", "allowed"] as const).map((v) => (
            <Box
              key={v}
              component="button"
              type="button"
              aria-pressed={show === v}
              onClick={() => setShow(v)}
              sx={{
                border: "none",
                borderRadius: "8px",
                px: 1.25,
                minHeight: 30,
                fontFamily: "inherit",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                backgroundColor: show === v ? "text.primary" : "transparent",
                color: show === v ? "background.paper" : "text.secondary",
                "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: 1 },
              }}
            >
              {v === "all" ? "Everything" : "Only allowed"}
            </Box>
          ))}
        </Box>
      }
    >
      <Box sx={{ pt: 1 }}>
        <SectionHeading aside={<Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{pagesAllowed} of {groups.pages.length}</Typography>}>Pages</SectionHeading>
        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, mb: 2 }}>
          {rows(groups.pages)}
        </Box>
        <SectionHeading aside={<Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{actionsAllowed} of {actionItems.length}</Typography>}>Actions</SectionHeading>
        {groups.actions.map((section) => {
          const items = rows(section.items);
          if (!items.length) return null;
          return (
            <Box key={section.title} sx={{ mb: 1.5 }}>
              <Typography component="h4" sx={{ fontSize: "0.75rem", fontWeight: 600, color: "text.secondary", mt: 1 }}>
                {section.title}
              </Typography>
              <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
                {items}
              </Box>
            </Box>
          );
        })}
      </Box>
    </SectionCard>
  );
}

export default function ProfilePage() {
  const { ready, user, roleLabel, can } = usePermissions();
  const [editingName, setEditingName] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const notify = useCallback((text: string) => setToast(text), []);

  if (!ready || !user) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
        <CircularProgress size={26} aria-label="Loading your profile" />
      </Box>
    );
  }

  const showCardLink = can("card_template.own") && can("page.post_studio.x");

  return (
    <Box sx={{ maxWidth: 1100, mx: "auto", mt: 2, display: "flex", flexDirection: "column", gap: 2.5 }}>
      <ProfileHeader
        user={user}
        roleLabel={roleLabel}
        onEditName={() => {
          setEditingName(true);
          jumpTo("basic-details");
        }}
      />

      <Box sx={{ display: "grid", gap: 2.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "240px minmax(0, 1fr)" }, alignItems: "start" }}>
        <QuickLinks links={LINKS} />
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, minWidth: 0 }}>
          <BasicDetails id="basic-details" user={user} roleLabel={roleLabel} showCardLink={showCardLink} editing={editingName} setEditing={setEditingName} notify={notify} />
          <SecuritySection id="sign-in-security" totpEnabled={user.totpEnabled} notify={notify} />
          <KeyboardShortcuts id="keyboard-shortcuts" notify={notify} />
          <WhatYouCanDo id="what-you-can-do" />
          <SectionCard
            id="this-browser"
            icon={<Monitor size={18} />}
            title="This browser"
            description="The editor remembers card designs and video projects here and clears ones older than two days every night. Clear them now if the editor feels slow. You stay signed in."
          >
            <ClearBrowserCache />
          </SectionCard>
        </Box>
      </Box>

      <Snackbar open={!!toast} autoHideDuration={3500} onClose={() => setToast(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity="success" variant="filled" onClose={() => setToast(null)} sx={{ fontSize: "0.8125rem", borderRadius: "10px" }}>
          {toast}
        </Alert>
      </Snackbar>
    </Box>
  );
}
