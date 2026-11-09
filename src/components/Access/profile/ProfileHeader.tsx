"use client";

// The top card: who you are at a glance. Avatar, name with an edit pencil, email, role and platforms, and on the
// right the account facts (member since, last sign-in, two-step sign-in).

import React from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { CalendarDays, Clock, Mail, PencilLine, ShieldCheck, ShieldOff } from "lucide-react";
import { platformLabel } from "@/lib/access/catalogue";
import type { PermissionsUser } from "@/lib/access/usePermissions";
import { formatDate, formatDateTime } from "../shared";
import { TintedAvatar, cardSx } from "./parts";

const pillSx = { display: "inline-flex", alignItems: "center", gap: 0.5, height: 26, px: 1.25, borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700, whiteSpace: "nowrap" } as const;

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.25, minWidth: 0 }}>
      <Box aria-hidden sx={{ color: "text.secondary", mt: "2px", flexShrink: 0, display: "flex" }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{label}</Typography>
        <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }}>{value}</Typography>
      </Box>
    </Box>
  );
}

export default function ProfileHeader({ user, roleLabel, onEditName }: { user: PermissionsUser; roleLabel: string; onEditName: () => void }) {
  return (
    <Box
      component="header"
      sx={{
        ...cardSx,
        borderRadius: "20px",
        display: "grid",
        gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 1fr) 280px" },
        overflow: "hidden",
      }}
    >
      <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, alignItems: { xs: "flex-start", sm: "center" }, gap: { xs: 2, sm: 3 }, p: { xs: 2.5, sm: 3.5 }, minWidth: 0 }}>
        <TintedAvatar name={user.name} size={{ xs: 72, sm: 104 }} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
            <Typography component="h1" sx={{ fontWeight: 700, fontSize: { xs: "1.5rem", sm: "1.875rem" }, letterSpacing: "-0.02em", lineHeight: 1.15, overflowWrap: "anywhere" }}>
              {user.name}
            </Typography>
            <Tooltip title="Edit your name">
              <IconButton onClick={onEditName} aria-label="Edit your name" sx={{ color: "text.secondary", width: 40, height: 40, "&:hover": { color: "text.primary" } }}>
                <PencilLine size={18} />
              </IconButton>
            </Tooltip>
          </Box>
          <Typography sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.5, fontSize: "0.9375rem", color: "text.secondary", minWidth: 0 }}>
            <Mail size={15} aria-hidden style={{ flexShrink: 0 }} />
            <Box component="span" sx={{ overflowWrap: "anywhere" }}>
              {user.email}
            </Box>
          </Typography>
          <Box component="ul" aria-label="Role and platforms" sx={{ listStyle: "none", m: 0, p: 0, mt: 2, display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            <Box component="li" sx={{ ...pillSx, backgroundColor: "text.primary", color: "background.paper" }}>
              {roleLabel}
            </Box>
            {(user.platforms.length ? user.platforms : ["all"]).map((p) => (
              <Box key={p} component="li" sx={{ ...pillSx, fontWeight: 600, border: "1px solid", borderColor: "divider", color: "text.primary" }}>
                {p === "all" ? "All platforms" : platformLabel(p)}
              </Box>
            ))}
            {!user.active && (
              <Box component="li" sx={{ ...pillSx, backgroundColor: "action.hover", color: "text.secondary" }}>
                Inactive
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(auto-fit, minmax(150px, 1fr))", md: "minmax(0, 1fr)" },
          alignContent: "center",
          gap: 2,
          p: { xs: 2.5, sm: 3 },
          // Width and style apart from the colour, so the responsive values never reset it to the text colour
          borderStyle: "solid",
          borderColor: "divider",
          borderWidth: 0,
          borderTopWidth: { xs: 1, md: 0 },
          borderLeftWidth: { xs: 0, md: 1 },
          backgroundColor: (t) => (t.palette.mode === "light" ? "rgba(0,0,0,0.015)" : "rgba(255,255,255,0.02)"),
        }}
      >
        <Fact icon={<CalendarDays size={16} />} label="Member since" value={user.createdAt ? formatDate(user.createdAt) : "Not known"} />
        <Fact icon={<Clock size={16} />} label="Last sign-in" value={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Not known"} />
        {user.totpEnabled !== null && (
          <Fact icon={user.totpEnabled ? <ShieldCheck size={16} /> : <ShieldOff size={16} />} label="Two-step sign-in" value={user.totpEnabled ? "On" : "Off"} />
        )}
      </Box>
    </Box>
  );
}
