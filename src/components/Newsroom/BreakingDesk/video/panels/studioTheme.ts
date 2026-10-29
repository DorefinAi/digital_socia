import { createTheme } from "@mui/material";

// The studio is always dark, whatever the desk's theme: footage reads truest against neutral grey, and the
// edit bay convention is dark. One warm accent (the "on air" amber of a studio tally) marks what is selected,
// the playhead and the one primary action (Export). Everything else stays grey.
export const S = {
  stage: "#121418",
  chrome: "#1A1D23",
  panel: "#20242B",
  raised: "#2A2F37",
  hover: "#323843",
  line: "#363C46",
  text: "#ECEEF2",
  muted: "#A3AAB6",
  faint: "#6F7784",
  accent: "#F2B53A",
  onAccent: "#1D1606",
  danger: "#EF6A62",
  /** Clip colours on the timeline, by track kind */
  clip: { video: "#3B6EA8", overlay: "#6A5AA8", text: "#A8803B", caption: "#3B8F7A", audio: "#2F8A5B" },
} as const;

export const studioTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: S.accent, contrastText: S.onAccent },
    error: { main: S.danger },
    background: { default: S.stage, paper: S.panel },
    text: { primary: S.text, secondary: S.muted },
    divider: S.line,
  },
  typography: {
    fontFamily: "var(--font-roboto), var(--font-devanagari), 'Nirmala UI', system-ui, sans-serif",
    fontSize: 13,
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 6 },
  components: {
    MuiButtonBase: { defaultProps: { disableRipple: true } },
    MuiButton: { styleOverrides: { root: { boxShadow: "none", "&:hover": { boxShadow: "none" } } } },
    MuiTooltip: { defaultProps: { arrow: true, enterDelay: 400 } },
    MuiSlider: { defaultProps: { size: "small" } },
    MuiTextField: { defaultProps: { size: "small" } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
  },
});

/** Seconds as m:ss.t for labels (tabular digits) */
export function timecode(t: number): string {
  const v = Math.max(0, t);
  const m = Math.floor(v / 60);
  const s = v - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
}
