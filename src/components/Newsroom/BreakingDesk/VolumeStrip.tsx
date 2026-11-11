import { Box, LinearProgress, Typography } from "@mui/material";

/** Height of the strip, so sticky things below it (the new-posts pill) can sit clear of it */
export const VOLUME_STRIP_HEIGHT = 30;

/** "X volume today 12 / 800": a thin bar that stays at the top of the queue and the studio while they scroll. */
export default function VolumeStrip({ name, used, cap }: { name: string; used: number; cap: number }) {
  const share = cap > 0 ? used / cap : 0;
  const label = `${name} volume today`;
  return (
    <Box sx={{ position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 1.5, px: 1.5, height: VOLUME_STRIP_HEIGHT, flexShrink: 0, borderBottom: "1px solid", borderColor: "divider", backgroundColor: "background.paper" }}>
      <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", whiteSpace: "nowrap" }}>{label}</Typography>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, share * 100)}
        color={share >= 0.95 ? "error" : share >= 0.8 ? "warning" : "success"}
        aria-label={label}
        aria-valuetext={`${used} of ${cap}`}
        sx={{ flex: 1, height: 4, borderRadius: 2 }}
      />
      <Typography aria-hidden sx={{ fontSize: "0.75rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {used} / {cap}
      </Typography>
    </Box>
  );
}
