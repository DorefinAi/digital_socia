"use client";

// The shell's view of the studio store (video/store.ts, Agent A): the few reads and edits the panels need, as
// plain functions. The playhead is read on demand (getPlayhead) so panels do not re-render 60 times a second
// during playback; a panel that shows it subscribes itself with useStudio((s) => s.playhead).

import { useMemo } from "react";
import type { Aspect, Asset, CaptionClip, CaptionStyle, Clip, Project, Track, TrackKind, Transition } from "../model";
import { useHistoryFlags, useStudio, useStudioStore } from "../store";
import { detachAudio as detachAudioPure } from "../audio/detach";
import { newId } from "../model";

export interface ClipRef {
  track: Track;
  clip: Clip;
}

export interface StudioApi {
  project: Project;
  selectedClipId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  getPlayhead(): number;
  undo(): void;
  redo(): void;
  /** Replaces the whole project and clears history (open, restore, start over) */
  load(project: Project): void;
  setAspect(aspect: Aspect): void;
  setProject(patch: Partial<Pick<Project, "fps" | "background">>, group?: string): void;
  addAsset(asset: Asset): void;
  /** Swaps an asset's file or records what loading learned; not an undo step */
  updateAsset(id: string, patch: Partial<Omit<Asset, "id">>): void;
  /** Puts a clip on the first track of that kind with room for it (a new track when none has room); selects it */
  addClip(kind: TrackKind, clip: Clip): void;
  /** Changes one clip. Edits sharing a `group` key in quick succession (one slider drag) are one undo step. */
  updateClip(clipId: string, patch: Partial<Clip>, group?: string): void;
  removeClip(clipId: string): void;
  setTransition(clipId: string, transition: Transition | null): void;
  setCaptionStyle(patch: Partial<CaptionStyle>, group?: string): void;
  /** Replaces every clip on the first caption track (SRT import) */
  replaceCaptions(clips: CaptionClip[]): void;
  /** Moves a video clip's sound to its own audio clip (one undo step) */
  detachAudio(clipId: string): void;
  select(clipId: string | null): void;
  seek(t: number): void;
}

export function findClip(project: Project, clipId: string | null): ClipRef | null {
  if (!clipId) return null;
  for (const track of project.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

/** True when [start, start + duration) does not overlap any clip on the track */
export function hasRoom(track: Track, start: number, duration: number): boolean {
  return track.clips.every((c) => start + duration <= c.start + 1e-6 || start >= c.start + c.duration - 1e-6);
}

const selectProject = (s: { project: Project }) => s.project;
const selectFirstSelected = (s: { selection: string[] }) => s.selection[0] ?? null;

export function useStudioApi(): StudioApi {
  const store = useStudioStore();
  const project = useStudio(selectProject);
  const selectedClipId = useStudio(selectFirstSelected);
  const { canUndo, canRedo } = useHistoryFlags();

  const actions = useMemo(() => {
    const d = store.dispatch;
    return {
      getPlayhead: () => store.getState().playhead,
      undo: () => d({ type: "history/undo" }),
      redo: () => d({ type: "history/redo" }),
      load: (p: Project) => d({ type: "project/replace", project: p }),
      setAspect: (aspect: Aspect) => d({ type: "project/set", patch: { aspect } }),
      setProject: (patch: Partial<Pick<Project, "fps" | "background">>, group?: string) => d({ type: "project/set", patch, group }),
      addAsset: (asset: Asset) => d({ type: "assets/add", assets: [asset] }),
      updateAsset: (id: string, patch: Partial<Omit<Asset, "id">>) => d({ type: "assets/update", assetId: id, patch }),
      addClip: (kind: TrackKind, clip: Clip) => d({ type: "clip/add", clip, kind, select: true }),
      updateClip: (clipId: string, patch: Partial<Clip>, group?: string) => d({ type: "clip/update", clipId, patch, group: group && `${clipId}:${group}` }),
      removeClip: (clipId: string) => d({ type: "clip/delete", clipIds: [clipId] }),
      setTransition: (clipId: string, transition: Transition | null) => d({ type: "clip/setTransition", clipId, transition, group: `${clipId}:transition` }),
      setCaptionStyle: (patch: Partial<CaptionStyle>, group?: string) => d({ type: "project/set", patch: { captionStyle: patch }, group: group && `caption:${group}` }),
      replaceCaptions: (clips: CaptionClip[]) => d({ type: "captions/replace", clips }),
      detachAudio: (clipId: string) => {
        const id = newId("clip");
        d({ type: "project/edit", edit: (p) => detachAudioPure(p, clipId, id), select: [id] });
      },
      select: (clipId: string | null) => d({ type: "select", clipIds: clipId ? [clipId] : [] }),
      seek: (t: number) => d({ type: "seek", time: t }),
    };
  }, [store]);

  return useMemo(() => ({ ...actions, project, selectedClipId, canUndo, canRedo }), [actions, project, selectedClipId, canUndo, canRedo]);
}
