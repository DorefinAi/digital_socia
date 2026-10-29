import { DEFAULT_TEXT, type Aspect, type Box, type TextStyle, type TransitionType } from "../model";
import { lowerThirdBox } from "../projectFromStory";

export const TRANSITIONS: { type: TransitionType; label: string; /** Needs the clip before it on the same track */ needsPrevious: boolean }[] = [
  { type: "crossfade", label: "Crossfade", needsPrevious: true },
  { type: "fade-black", label: "Fade through black", needsPrevious: false },
  { type: "fade-white", label: "Fade through white", needsPrevious: false },
  { type: "slide-left", label: "Slide left", needsPrevious: true },
  { type: "slide-right", label: "Slide right", needsPrevious: true },
  { type: "wipe", label: "Wipe", needsPrevious: true },
];

export const transitionLabel = (t: TransitionType) => TRANSITIONS.find((x) => x.type === t)?.label ?? t;

export interface TextPreset {
  id: string;
  label: string;
  sample: string;
  style: TextStyle;
  box: (aspect: Aspect) => Box;
}

// The desk's on-air text, not generic titles: the lower third that carries the headline, a breaking strap,
// a name strap for whoever is speaking, a full-frame title, and a plain subtitle-like line.
export const TEXT_PRESETS: TextPreset[] = [
  {
    id: "lower-third",
    label: "Headline strap",
    sample: "जयपुर मेट्रो फेज 2 को मंजूरी",
    style: { ...DEFAULT_TEXT, size: 56, outlineColor: null, outlineWidth: 0, background: "rgba(176,18,24,0.92)" },
    box: lowerThirdBox,
  },
  {
    id: "breaking",
    label: "Breaking tag",
    sample: "BREAKING",
    style: { ...DEFAULT_TEXT, font: "Mangal", size: 44, outlineColor: null, outlineWidth: 0, color: "#1D1606", background: "#F2B53A", align: "left" },
    box: (a) => ({ x: a === "16:9" ? 0.16 : 0.26, y: a === "9:16" ? 0.64 : 0.74, w: a === "16:9" ? 0.24 : 0.44, h: 0.07, rotation: 0 }),
  },
  {
    id: "name-strap",
    label: "Name strap",
    sample: "अशोक गहलोत, पूर्व मुख्यमंत्री",
    style: { ...DEFAULT_TEXT, size: 40, weight: 400, outlineColor: null, outlineWidth: 0, background: "rgba(10,12,16,0.78)", align: "left" },
    box: (a) => ({ x: a === "16:9" ? 0.3 : 0.45, y: a === "9:16" ? 0.6 : 0.68, w: a === "16:9" ? 0.5 : 0.82, h: 0.08, rotation: 0 }),
  },
  {
    id: "title",
    label: "Full-frame title",
    sample: "राजस्थान बजट 2026",
    style: { ...DEFAULT_TEXT, size: 110 },
    box: () => ({ x: 0.5, y: 0.5, w: 0.86, h: 0.3, rotation: 0 }),
  },
  {
    id: "plain",
    label: "Plain line",
    sample: "Add a line of text",
    style: { ...DEFAULT_TEXT, size: 52, weight: 400, outlineWidth: 3 },
    box: () => ({ x: 0.5, y: 0.2, w: 0.8, h: 0.12, rotation: 0 }),
  },
];

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];

/** Drag type for an asset dragged from "Your media" onto the timeline (value: asset id) */
export const ASSET_DRAG_TYPE = "application/x-studio-asset";
