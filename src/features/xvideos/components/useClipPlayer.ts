"use client";

// The editor's playback: an HTML5 <video> when the clip's file is there; when it is missing, a stand-in clock, so
// the transcript still follows "playback" on the demo.

import { useCallback, useEffect, useRef, useState } from "react";

export interface ClipPlayer {
  /** Callback ref for the <video> */
  attach: (el: HTMLVideoElement | null) => void;
  time: number;
  duration: number;
  playing: boolean;
  missing: boolean;
  rate: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (t: number) => void;
  /** Jump by `by` seconds from where the video really is (quick repeated taps add up) */
  skip: (by: number) => void;
  setRate: (r: number) => void;
  /** Wire these to the <video> */
  videoProps: Record<"onTimeUpdate" | "onPlay" | "onPause" | "onError" | "onLoadedMetadata", (e: React.SyntheticEvent<HTMLVideoElement>) => void>;
}

/**
 * One player per clip (the editor body is keyed by clip). Playback stops at `end` (the trim's out point) and
 * starts again from `start` when play is pressed past it.
 */
export function useClipPlayer(src: string, knownDuration: number, range: { start: number; end: number }): ClipPlayer {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const attach = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
  }, []);
  const [time, setTime] = useState(range.start);
  const [playing, setPlaying] = useState(false);
  const [missing, setMissing] = useState(false);
  const [rate, setRateState] = useState(1);
  const [duration, setDuration] = useState(knownDuration);
  const rangeRef = useRef(range);
  const timeRef = useRef(time);
  useEffect(() => {
    rangeRef.current = range;
    timeRef.current = time;
  });

  // Stand-in clock while the file is missing
  useEffect(() => {
    if (!missing || !playing) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const step = ((now - last) / 1000) * rate;
      last = now;
      const next = timeRef.current + step;
      if (next >= rangeRef.current.end) {
        timeRef.current = rangeRef.current.end;
        setTime(rangeRef.current.end);
        setPlaying(false);
        return;
      }
      timeRef.current = next;
      setTime(next);
    }, 100);
    return () => clearInterval(timer);
  }, [missing, playing, rate]);

  const seek = useCallback(
    (t: number) => {
      const clamped = Math.max(0, Math.min(t, duration));
      setTime(clamped);
      const v = videoRef.current;
      if (v && !missing) v.currentTime = clamped;
    },
    [duration, missing],
  );

  const skip = useCallback(
    (by: number) => {
      const v = videoRef.current;
      const from = v && !missing ? v.currentTime : timeRef.current;
      timeRef.current = Math.max(0, Math.min(from + by, duration));
      seek(timeRef.current);
    },
    [seek, missing, duration],
  );

  const play = useCallback(() => {
    const { start, end } = rangeRef.current;
    const v = videoRef.current;
    const from = time < start || time >= end - 0.1 ? start : time;
    if (from !== time) seek(from);
    if (v && !missing) {
      v.playbackRate = rate;
      void v.play().catch(() => setPlaying(false));
    } else {
      setPlaying(true);
    }
  }, [time, seek, missing, rate]);

  const pause = useCallback(() => {
    const v = videoRef.current;
    if (v && !missing) v.pause();
    setPlaying(false);
  }, [missing]);

  const toggle = useCallback(() => (playing ? pause() : play()), [playing, play, pause]);

  const setRate = useCallback(
    (r: number) => {
      setRateState(r);
      const v = videoRef.current;
      if (v && !missing) v.playbackRate = r;
    },
    [missing],
  );

  // Events from a <video> that is no longer the clip shown (it was just swapped out) are ignored
  const current = (e: React.SyntheticEvent<HTMLVideoElement>) => (e.currentTarget === videoRef.current && e.currentTarget.getAttribute("src") === src ? e.currentTarget : null);
  const videoProps = {
    onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const v = current(e);
      if (!v) return;
      // Stop at the out point only while playing, so a seek past it while paused stays where it was put
      if (!v.paused && v.currentTime >= rangeRef.current.end) {
        v.pause();
        v.currentTime = rangeRef.current.end;
      }
      setTime(v.currentTime);
    },
    onPlay: (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const v = current(e);
      if (!v) return;
      // Played again from the end (the video's own button or Space): start over, or timeupdate would stop it at once
      const { start, end } = rangeRef.current;
      if (v.currentTime >= end - 0.1) v.currentTime = start;
      setPlaying(true);
    },
    onPause: (e: React.SyntheticEvent<HTMLVideoElement>) => current(e) && setPlaying(false),
    onError: (e: React.SyntheticEvent<HTMLVideoElement>) => {
      if (e.currentTarget.getAttribute("src") !== src) return;
      setMissing(true);
      setPlaying(false);
    },
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const v = current(e);
      if (!v) return;
      if (Number.isFinite(v.duration) && v.duration > 0) setDuration(v.duration);
      // Any seek hides the poster for the clip's first frame, which is black on TV cuts, so only seek when needed
      if (time > 0) v.currentTime = time;
    },
  };

  return { attach, time, duration, playing, missing, rate, play, pause, toggle, seek, skip, setRate, videoProps };
}
