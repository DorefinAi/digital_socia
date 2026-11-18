"use client";

import { useEffect, useState } from "react";

/**
 * Date.now(), moving once a minute on the minute. The rows' "3 min ago" and age dots only change per minute,
 * so ticking on the minute boundary re-renders a long list at most once a minute and never shows a stale minute
 * for most of one (a plain 60 s interval started at 12:00:59 would).
 */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      // A few ms past the boundary, so the new minute has really started when it fires
      const wait = 60_000 - (Date.now() % 60_000) + 20;
      timer = setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, wait);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return now;
}
