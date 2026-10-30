"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { USE_MOCKS } from "@/lib/socia/config";
import { fetchMe, logout } from "@/lib/socia/api";
import { ApiError, onSignedOut } from "@/lib/socia/client";
import type { Me, SociaFeatures, SociaPhase } from "@/lib/socia/types";

type SessionStatus = "mock" | "loading" | "signed_in" | "needs_second_step" | "signed_out" | "offline";

interface SociaSession {
  status: SessionStatus;
  me: Me | null;
  /** Reloads /me, e.g. right after sign-in */
  refresh: () => Promise<Me | null>;
  signOut: () => Promise<void>;
  /** The live backend is in use (not the demo data) */
  live: boolean;
  /**
   * The server's phase switch from the last /me that answered (phase1-contract.md §0); null until one has.
   * Kept through a failed refresh, so a network blip never flips the desk back to phase 2.
   */
  phase: { phase: SociaPhase; features: SociaFeatures | null } | null;
}

const SessionContext = createContext<SociaSession | null>(null);

export function SociaSessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>(USE_MOCKS ? "mock" : "loading");
  const [me, setMe] = useState<Me | null>(null);
  const [phase, setPhase] = useState<SociaSession["phase"]>(null);

  const apply = useCallback((next: Me) => {
    setMe(next);
    setPhase({ phase: next.phase === 1 ? 1 : 2, features: next.features ?? null });
    setStatus(next.verified ? "signed_in" : "needs_second_step");
    return next;
  }, []);
  const applyError = useCallback((err: unknown) => {
    setMe(null);
    setStatus(err instanceof ApiError && err.code === "offline" ? "offline" : "signed_out");
    return null;
  }, []);

  const refresh = useCallback(async () => {
    if (USE_MOCKS) return null;
    return fetchMe().then(apply, applyError);
  }, [apply, applyError]);

  const signOut = useCallback(async () => {
    if (USE_MOCKS) return;
    try {
      await logout();
    } catch {
      // Already signed out on the server; the local state is cleared either way
    }
    setMe(null);
    setStatus("signed_out");
  }, []);

  useEffect(() => {
    if (USE_MOCKS) return;
    // The state updates land after /me answers, not during the effect
    fetchMe().then(apply, applyError);
    return onSignedOut(() => {
      setMe(null);
      setStatus("signed_out");
    });
  }, [apply, applyError]);

  const value = useMemo(() => ({ status, me, refresh, signOut, live: !USE_MOCKS, phase }), [status, me, refresh, signOut, phase]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSociaSession(): SociaSession {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSociaSession must be used inside SociaSessionProvider");
  return ctx;
}
