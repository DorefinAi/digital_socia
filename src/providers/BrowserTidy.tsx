"use client";

import { useBrowserTidy } from "@/lib/browserTidy";

/** Daily clean-up of this browser's storage and the 04:30 IST reload (lib/browserTidy). Renders nothing. */
export function BrowserTidy() {
  useBrowserTidy();
  return null;
}
