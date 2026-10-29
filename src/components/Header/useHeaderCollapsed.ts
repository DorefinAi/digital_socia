"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether the shared desk header is folded away. Remembered per browser; storage can be
 * blocked (private mode, disabled site data), so every read and write is guarded and the
 * header simply falls back to expanded.
 */
const STORAGE_KEY = "desk.header.collapsed";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function write(value: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Storage unavailable: the choice still applies for this page view via the memory fallback.
  }
  memory = value;
  listeners.forEach((l) => l());
}

// Mirrors the stored value so the toggle still works when storage throws.
let memory: boolean | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Keep tabs in sync when the header is folded in another tab.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      memory = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const getSnapshot = () => (memory ??= read());
const getServerSnapshot = () => false;

export function useHeaderCollapsed() {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setCollapsed = useCallback((value: boolean) => write(value), []);
  return [collapsed, setCollapsed] as const;
}
