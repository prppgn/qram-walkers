// The View menu of Simple mode: how the tree is drawn (never what is computed).
import { usePlayback, type ViewOptions } from "../../playback/store";
import { Menu } from "./Menu";

function Check({ label, title, value, set, testId }: { label: string; title: string; value: boolean; set: (v: boolean) => void; testId?: string }) {
  return (
    <label className="menu-row" title={title}>
      <input type="checkbox" checked={value} data-testid={testId} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  );
}

export function ViewMenu() {
  const v = usePlayback((s) => s.view);
  const setView = usePlayback((s) => s.setView);
  const setLensClosed = usePlayback((s) => s.setLensClosed);
  const put = (patch: Partial<ViewOptions>) => setView(patch);
  return (
    <Menu label="View" title="How the tree is drawn: labels, traces, the cell lens, orientation…" testId="view" align="right">
      {() => (
        <>
          <Check label="labels" title="Show slot labels (A₁, D₀, …) next to the walkers" value={v.labels} set={(x) => put({ labels: x })} />
          <Check label="ghosts" title="Draw empty slots (|∅⟩) as dashed ghosts; ghosts never affect the physics" value={v.ghosts} set={(x) => put({ ghosts: x })} />
          <Check label="traces" title="Draw the paths already travelled by the address walkers, to see where the dispersed ones went" value={v.traces} set={(x) => put({ traces: x })} />
          <Check
            label="cell lens"
            title="Cell lens: a box showing the inside of the cell the train has reached (its lane, the memory qubits, the copy)"
            value={v.lens}
            testId="lens-toggle"
            set={(x) => {
              put({ lens: x });
              if (x) setLensClosed(false);
            }}
          />
          <Check label="unfolded" title="Unfolded view: draw the return trip on a mirrored output tree (the paper's figures). Off: the physical single tree" value={v.mirror} set={(x) => put({ mirror: x })} />
          <Check label="figure" title="Paper figure mode: (d,l) labels on the edges, kets near the train, |ψ_in⟩ and |ψ_out⟩ at the ports, no flashes" value={v.figure} testId="figure-mode" set={(x) => put({ figure: x })} />
          <label className="menu-row" title="Orientation of the tree: root on the left, or on top like Fig. 1 of the letter">
            orientation
            <select value={v.orientation} data-testid="orientation" onChange={(e) => put({ orientation: e.target.value as ViewOptions["orientation"] })}>
              <option value="horizontal">horizontal</option>
              <option value="vertical">vertical</option>
            </select>
          </label>
          <label className="menu-row" title="Edge lengths: proportional to the number of sites, or all levels equally long">
            spacing
            <select value={v.spacing} onChange={(e) => put({ spacing: e.target.value as ViewOptions["spacing"] })}>
              <option value="proportional">proportional</option>
              <option value="uniform">uniform</option>
            </select>
          </label>
          <label className="menu-row" title="Branch opacity proportional to |α|² (probability) or |α|">
            opacity
            <select value={v.opacity} onChange={(e) => put({ opacity: e.target.value as ViewOptions["opacity"] })}>
              <option value="prob">∝ |α|²</option>
              <option value="amp">∝ |α|</option>
            </select>
          </label>
        </>
      )}
    </Menu>
  );
}
