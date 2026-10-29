"use client";

import React from "react";
import { Box, Button, Switch, Tooltip, Typography } from "@mui/material";
import { Lock } from "lucide-react";
import type { Permission } from "@/lib/access/catalogue";
import { groupCatalogue, SectionHeading, type PermissionSection } from "./shared";

interface Props {
  catalogue: Permission[];
  value: ReadonlySet<string>;
  onChange: (keys: string[], on: boolean) => void;
  /** Always on and cannot be switched off (Admin's users.manage and roles.manage) */
  locked?: ReadonlySet<string>;
  lockedNote?: string;
  disabled?: boolean;
}

function Section({ title, items, value, onChange, locked, lockedNote, disabled, level }: Omit<Props, "catalogue"> & PermissionSection & { level: "h3" | "h4" }) {
  const free = items.filter((p) => !locked?.has(p.key));
  const onCount = items.filter((p) => value.has(p.key)).length;
  const allOn = free.every((p) => value.has(p.key));
  return (
    <Box sx={{ mb: level === "h3" ? 2 : 1.5 }}>
      {level === "h3" ? (
        <SectionHeading
          aside={
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{onCount} of {items.length} on</Typography>
              {free.length > 1 && (
                <Button size="small" disabled={disabled} onClick={() => onChange(free.map((p) => p.key), !allOn)} sx={{ minHeight: 28, px: 1, fontSize: "0.75rem", color: "text.primary" }}>
                  {allOn ? "Turn all off" : "Turn all on"}
                </Button>
              )}
            </Box>
          }
        >
          {title}
        </SectionHeading>
      ) : (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mt: 1 }}>
          <Typography component="h4" sx={{ fontSize: "0.75rem", fontWeight: 600, color: "text.secondary" }}>
            {title}
          </Typography>
          {free.length > 1 && (
            <Button size="small" disabled={disabled} onClick={() => onChange(free.map((p) => p.key), !allOn)} sx={{ minHeight: 26, px: 1, fontSize: "0.6875rem", color: "text.secondary" }}>
              {allOn ? "All off" : "All on"}
            </Button>
          )}
        </Box>
      )}
      <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
        {items.map((p) => {
          const isLocked = !!locked?.has(p.key);
          const on = isLocked || value.has(p.key);
          const id = `perm-${p.key.replace(/\./g, "-")}`;
          return (
            <Box component="li" key={p.key} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 0.75, borderTop: "1px solid", borderColor: "divider", "&:first-of-type": { borderTop: "none" } }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography component="label" htmlFor={id} sx={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, cursor: isLocked || disabled ? "default" : "pointer" }}>
                  {p.label}
                </Typography>
                <Typography id={`${id}-desc`} sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                  {isLocked && lockedNote ? lockedNote : p.description}
                </Typography>
              </Box>
              {isLocked ? (
                <Tooltip title={lockedNote ?? "Always on"}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}>
                    <Lock size={14} aria-hidden />
                    <Switch id={id} checked disabled size="small" slotProps={{ input: { "aria-describedby": `${id}-desc` } }} />
                  </Box>
                </Tooltip>
              ) : (
                <Switch id={id} checked={on} disabled={disabled} size="small" onChange={(e) => onChange([p.key], e.target.checked)} slotProps={{ input: { "aria-describedby": `${id}-desc` } }} />
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/** Every permission as a switch, Pages first and Actions in smaller sections. */
export default function PermissionMatrix({ catalogue, ...rest }: Props) {
  const { pages, actions } = groupCatalogue(catalogue);
  const actionItems = actions.flatMap((s) => s.items);
  return (
    <Box>
      <Section title="Pages" items={pages} level="h3" {...rest} />
      <SectionHeading aside={<Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{actionItems.filter((p) => rest.value.has(p.key) || rest.locked?.has(p.key)).length} of {actionItems.length} on</Typography>}>
        Actions
      </SectionHeading>
      {actions.map((s) => (
        <Section key={s.title} title={s.title} items={s.items} level="h4" {...rest} />
      ))}
    </Box>
  );
}
