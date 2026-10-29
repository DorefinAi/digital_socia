"use client";

import { useEffect, useRef, useState } from "react";
import type { Project } from "../model";

// The project JSON per draft, in this browser, until the backend has a field for it. Files imported from the
// computer are blob: links that die with the tab; a restored project keeps their clips and asks for the files again.

export const studioKey = (platform: string, draftId: string) => `studio:${platform}:${draftId}`;

interface Saved {
  v: 1;
  savedAt: string;
  project: Project;
}

export function readSaved(key: string): { project: Project; savedAt: string } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as Saved;
    if (data?.v !== 1 || data.project?.version !== 1 || !Array.isArray(data.project.tracks)) return null;
    return { project: data.project, savedAt: data.savedAt };
  } catch {
    return null;
  }
}

export function clearSaved(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage blocked: nothing to clear */
  }
}

export type SaveState = { kind: "idle" } | { kind: "saved"; at: Date } | { kind: "failed" };

const DEBOUNCE_MS = 800;

/** Saves `project` under `key` a moment after it stops changing. Pass enabled=false until the first load is done. */
export function useAutosave(key: string, project: Project, enabled: boolean): SaveState {
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const first = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    // The project as loaded is already saved (or is the story's starting point): no write until an edit
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => {
      try {
        const data: Saved = { v: 1, savedAt: new Date().toISOString(), project };
        localStorage.setItem(key, JSON.stringify(data));
        setState({ kind: "saved", at: new Date() });
      } catch {
        // Quota or private mode: say so instead of pretending
        setState({ kind: "failed" });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, project, enabled]);

  return state;
}
