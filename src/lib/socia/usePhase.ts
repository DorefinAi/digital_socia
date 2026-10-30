"use client";

// The one phase switch lives on the backend (PHASE=1); the app reads it from /me (phase1-contract.md §0).
// The demo data and servers that don't send it are phase 2: everything as before. Until the first /me has
// answered the phase is unknown, and screens that differ by phase wait rather than flash the wrong one.

import { useSociaSession } from "@/providers/SociaSessionProvider";
import { USE_MOCKS } from "./config";
import type { SociaFeatures } from "./types";

export interface PhaseInfo {
  /** The phase has been read from the server (always true on the demo data) */
  known: boolean;
  /** Files to ready X posts with Copy & Posted; Video Studio, other platforms and X API posting hidden */
  phase1: boolean;
  features: SociaFeatures | null;
  /** Whether the desk shows this platform ("x", "instagram", ...); false while the phase is unknown */
  showsPlatform: (key: string) => boolean;
}

export function usePhase(): PhaseInfo {
  const { phase } = useSociaSession();
  const known = USE_MOCKS || phase !== null;
  const phase1 = !USE_MOCKS && phase?.phase === 1;
  const features = phase?.features ?? null;
  const platforms = features?.platforms?.map((p) => p.toLowerCase());
  return {
    known,
    phase1,
    features,
    showsPlatform: (key) => known && (!phase1 || !platforms || platforms.includes(key.toLowerCase())),
  };
}
