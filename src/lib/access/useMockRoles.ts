"use client";

import { useSyncExternalStore } from "react";
import { USE_MOCKS } from "@/lib/socia/config";
import { getMockAccess, getMockAccessServer, subscribeMockAccess } from "./mockStore";

const noop = () => () => {};

/** The demo's roles (built-in and custom), for the header's demo role switcher. Empty live. */
export function useMockRoles() {
  const s = useSyncExternalStore(USE_MOCKS ? subscribeMockAccess : noop, getMockAccess, getMockAccessServer);
  return USE_MOCKS ? s.roles : [];
}
