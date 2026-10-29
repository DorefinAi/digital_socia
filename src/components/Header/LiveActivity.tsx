"use client";

// Recent activity on the live desk. There is no newsroom activity feed on the API, so this shows the
// access history (GET /admin/audit) to people allowed to see it, and an empty state to everyone else.

import React, { useEffect, useState } from "react";
import { Box, Button, List, ListItem, ListItemText, Skeleton, Typography } from "@mui/material";
import { Clock } from "lucide-react";
import Link from "next/link";
import { describe } from "@/components/Access/HistoryTab";
import { fallbackRoleLabel } from "@/lib/access/catalogue";
import { accessService } from "@/lib/access/service";
import { usePermissions } from "@/lib/access/usePermissions";
import type { AuditEntry } from "@/lib/access/types";

export function HeaderEmpty({ title, text }: { title: string; text: string }) {
  return (
    <Box sx={{ px: 2, py: 3, textAlign: "center" }}>
      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>{title}</Typography>
      <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.5, lineHeight: 1.5 }}>{text}</Typography>
    </Box>
  );
}

export default function LiveActivity({ formatTime, onNavigate }: { formatTime: (iso: string) => string; onNavigate: () => void }) {
  const { can, catalogue } = usePermissions();
  const allowed = can("audit.view");
  const [items, setItems] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState(false);

  // Loaded each time the panel opens (this component mounts with it)
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    accessService
      .listAudit(null, 10)
      .then((page) => !cancelled && setItems(page.items))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  if (!allowed) return <HeaderEmpty title="No recent activity to show" text="The desk's activity feed isn't available yet. Posts and rejections are listed under Published and Rejected news." />;
  if (error) return <HeaderEmpty title="Activity didn't load" text="Close this panel and open it again to retry." />;
  if (!items)
    return (
      <Box role="status" aria-label="Loading activity" sx={{ p: 2, display: "grid", gap: 1 }}>
        {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={34} />)}
      </Box>
    );
  if (!items.length) return <HeaderEmpty title="No recent activity" text="Changes to roles and people will show here." />;

  return (
    <>
      <List sx={{ py: 0, maxHeight: 320, overflowY: "auto" }}>
        {items.map((e) => (
          <ListItem key={e.id} sx={{ py: 1, alignItems: "flex-start", gap: 1.25 }}>
            <Box sx={{ mt: 0.4, color: "text.secondary", display: "flex" }} aria-hidden>
              <Clock size={14} />
            </Box>
            <ListItemText
              primary={
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 500, lineHeight: 1.4 }}>
                  <strong>{e.actorName ?? "Someone"}</strong> {describe(e, fallbackRoleLabel, () => "a user", catalogue)}
                </Typography>
              }
              secondary={<Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{formatTime(e.at)}</Typography>}
            />
          </ListItem>
        ))}
      </List>
      <Box sx={{ px: 2, py: 1, borderTop: "1px solid", borderColor: "divider" }}>
        <Button component={Link} href="/settings/access?tab=history" size="small" onClick={onNavigate} sx={{ fontSize: "0.75rem", px: 0.5 }}>
          See all access history
        </Button>
      </Box>
    </>
  );
}
