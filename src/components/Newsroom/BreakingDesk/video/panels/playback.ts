import { projectDuration } from "../model";
import type { AudioEngine } from "../audio/engine";
import type { StudioStore } from "../store";

/** Play from the playhead (from the start when parked at the end), or pause */
export function togglePlayback(engine: AudioEngine, store: StudioStore) {
  if (engine.playing) {
    engine.pause();
    // The store hears the time ~20x a second while playing; stop exactly where the sound stopped
    store.dispatch({ type: "seek", time: engine.clock() });
    return;
  }
  const s = store.getState();
  const length = projectDuration(s.project);
  void engine.play(s.playhead >= length - 0.05 ? 0 : s.playhead);
}
