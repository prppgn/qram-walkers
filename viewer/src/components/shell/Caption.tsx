// The caption under the tree: one sentence on what is happening now; at a key moment of
// guided playback, a highlighted note that waits for space or a click.
import { captionAt } from "../../export/video";
import { usePlayback } from "../../playback/store";
import { Scripted } from "../panels/KetPanel";

export function Caption({ always }: { always: boolean }) {
  const traj = usePlayback((s) => s.traj);
  const frame = usePlayback((s) => s.frame);
  const pausedAt = usePlayback((s) => s.pausedAt);
  const togglePlay = usePlayback((s) => s.togglePlay);
  if (!traj) return null;
  if (pausedAt) {
    const end = pausedAt.kind === "exit";
    return (
      <button className="caption key-moment" data-testid="key-moment" data-kind={pausedAt.kind} title={end ? "Play again (space)" : "Continue (space)"} onClick={togglePlay}>
        <strong>{pausedAt.title}.</strong> <Scripted text={pausedAt.text} />
        <span className="caption-go">{end ? "↻ Play again" : "▶ Continue"} <kbd>space</kbd></span>
      </button>
    );
  }
  if (!always) return null;
  return (
    <p className="caption" data-testid="caption" aria-live="polite">
      <Scripted text={captionAt(traj, frame)} />
    </p>
  );
}
