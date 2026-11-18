// The Examples menu of Simple mode: the presets with a one-line description each.
import { usePlayback } from "../../playback/store";
import { Menu } from "./Menu";

/** Presets offered in Simple mode, with a plain one-line description. */
export const EXAMPLES: { name: string; line: string }[] = [
  { name: "E1", line: "one address, one stored bit" },
  { name: "E1b", line: "the same address, the stored bit is 0" },
  { name: "E2", line: "two addresses in superposition" },
  { name: "demo-uniform", line: "all eight addresses at once" },
  { name: "E1-switch", line: "E1 with a switch that turns the cell on and off" },
  { name: "E3", line: "backup walkers: only short-range gates" },
  { name: "qudit-short", line: "every walker is a qudit" },
  { name: "dualrail", line: "two trees, one for 0 and one for 1" },
  { name: "noise-loss", line: "a walker is lost on the way" },
  { name: "noise-scatter", line: "a walker takes a wrong turn" },
  { name: "coherent-demo", line: "small coherent errors split the branches" },
];

export function ExamplesMenu() {
  const presets = usePlayback((s) => s.presets);
  const busy = usePlayback((s) => s.busy);
  const runPreset = usePlayback((s) => s.runPreset);
  const current = usePlayback((s) => s.preset);
  return (
    <Menu label="Examples" title="Load a ready-made example and watch it" testId="examples">
      {(close) =>
        EXAMPLES.map(({ name, line }) => {
          const p = presets.find((x) => x.name === name);
          if (!p) return null;
          return (
            <button
              key={name}
              role="menuitem"
              className={`menu-item${current === name ? " active" : ""}`}
              disabled={busy}
              title={`${p.title}. ${p.description}`}
              data-testid={`preset-${name}`}
              onClick={() => {
                close();
                void runPreset(name);
              }}
            >
              <strong>{name}</strong> — {line}
            </button>
          );
        })
      }
    </Menu>
  );
}
