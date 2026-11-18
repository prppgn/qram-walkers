// Simple | Advanced: two layouts of the same run. The choice is remembered in this browser.
import { usePlayback, type Mode } from "../../playback/store";

const MODES: { mode: Mode; label: string; tip: string }[] = [
  { mode: "simple", label: "Simple", tip: "Simple: the tree, a caption, the narration and the essential controls; the other panels are under Details" },
  { mode: "advanced", label: "Advanced", tip: "Advanced: every panel and control at once" },
];

export function ModeSwitch() {
  const mode = usePlayback((s) => s.mode);
  const setMode = usePlayback((s) => s.setMode);
  return (
    <div className="segmented" role="group" aria-label="Interface mode" data-testid="mode-switch">
      {MODES.map((m) => (
        <button
          key={m.mode}
          className={`btn${mode === m.mode ? " active" : ""}`}
          aria-pressed={mode === m.mode}
          title={m.tip}
          data-testid={`mode-${m.mode}`}
          onClick={() => setMode(m.mode)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
