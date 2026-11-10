// Application shell: top bar, tree canvas with train strip and playback controls,
// right column of panels, setup drawer and user guide.
import { useEffect, useState } from "react";
import { usePlayback } from "./playback/store";
import { TreeCanvas } from "./components/TreeCanvas";
import { Controls } from "./components/Controls";
import { TrainStrip } from "./components/TrainStrip";
import { HelpPanel } from "./components/HelpPanel";
import { InfoButton } from "./components/Panel";
import { SetupDrawer } from "./components/setup/SetupDrawer";
import { ComparePane } from "./components/ComparePane";
import { KetPanel } from "./components/panels/KetPanel";
import { PhasorPanel } from "./components/panels/PhasorPanel";
import { Narration } from "./components/panels/Narration";
import { EventLog } from "./components/panels/EventLog";
import { MetricsPanel } from "./components/panels/MetricsPanel";
import { ResourcesPanel } from "./components/panels/ResourcesPanel";
import { Legend } from "./components/panels/Legend";

const QUICK_PRESETS = ["E1", "E2", "E1-switch", "E3", "E4", "demo-uniform", "qudit-short", "dualrail"];
const TABS = ["Phasors", "Metrics", "Resources", "Events", "Legend"] as const;
type Tab = (typeof TABS)[number];
let booted = false;

function usePlaybackLoop() {
  const playing = usePlayback((s) => s.playing);
  const tick = usePlayback((s) => s.tick);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      tick(Math.min(0.1, (now - last) / 1000));
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, tick]);
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      const s = usePlayback.getState();
      if (e.key === " ") {
        e.preventDefault();
        s.togglePlay();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const mode = s.stepMode;
        if (e.shiftKey) s.setStepMode("level");
        s.step(e.key === "ArrowRight" ? 1 : -1);
        if (e.shiftKey) s.setStepMode(mode);
      } else if (e.key === "Home") s.seek(0);
      else if (e.key === "End") s.seek(s.traj ? s.traj.frames.length - 1 : 0);
      else if (e.key === "?") s.openHelp("ui-keyboard");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function TopBar() {
  const s = usePlayback();
  const runPreset = (name: string) => {
    const p = s.presets.find((x) => x.name === name);
    if (p) void s.run(p.config);
  };
  const v = s.view;
  return (
    <header className="topbar">
      <button className="btn primary" title="Choose the architecture, the input superposition, the memory and the noise, then run the engine" data-testid="open-setup" onClick={() => s.setSetupOpen(true)}>
        ☰ Setup
      </button>
      <strong className="brand" title="Quantum-walker quantum RAM simulator">
        qram-walkers
      </strong>
      <span className="muted presets-label">Examples:</span>
      {QUICK_PRESETS.map((name) => {
        const p = s.presets.find((x) => x.name === name);
        return (
          <button
            key={name}
            className="btn"
            disabled={!p || s.busy}
            title={p ? `${p.title}. ${p.description}` : "Preset not available (engine not reachable?)"}
            data-testid={`preset-${name}`}
            onClick={() => runPreset(name)}
          >
            {name}
          </button>
        );
      })}
      <span className="spacer" />
      <label className="field" title="Show slot labels (A₁, D₀, …) next to the walkers">
        <input type="checkbox" checked={v.labels} onChange={(e) => s.setView({ labels: e.target.checked })} />
        labels
      </label>
      <label className="field" title="Draw empty slots (|∅⟩) as dashed ghosts; ghosts never affect the physics">
        <input type="checkbox" checked={v.ghosts} onChange={(e) => s.setView({ ghosts: e.target.checked })} />
        ghosts
      </label>
      <label className="field" title="Draw the paths already travelled by the address walkers, to see where the dispersed ones went">
        <input type="checkbox" checked={v.traces} onChange={(e) => s.setView({ traces: e.target.checked })} />
        traces
      </label>
      <label className="field" title="Cell lens: a box showing the inside of the cell the train has reached (its lane, the memory qubits, the copy). It opens by itself when the first walker enters; close it with ×, or click a lit cell to look inside">
        <input
          type="checkbox"
          checked={v.lens}
          data-testid="lens-toggle"
          onChange={(e) => {
            s.setView({ lens: e.target.checked });
            if (e.target.checked) s.setLensClosed(false);
          }}
        />
        cell lens
      </label>
      <label className="field" title="Unfolded view: draw the return trip on a mirrored output tree (the paper's figures). Off: the physical single tree">
        <input type="checkbox" checked={v.mirror} onChange={(e) => s.setView({ mirror: e.target.checked })} />
        unfolded
      </label>
      <label className="field" title="Paper figure mode: (d,l) labels on the edges, kets near the train, |ψ_in⟩ and |ψ_out⟩ at the ports, no flashes. Useful before exporting">
        <input type="checkbox" checked={v.figure} data-testid="figure-mode" onChange={(e) => s.setView({ figure: e.target.checked })} />
        figure
      </label>
      <label className="field" title="Orientation of the tree: root on the left, or on top like Fig. 1 of the letter">
        <select value={v.orientation} data-testid="orientation" onChange={(e) => s.setView({ orientation: e.target.value as "horizontal" | "vertical" })}>
          <option value="horizontal">horizontal</option>
          <option value="vertical">vertical</option>
        </select>
      </label>
      <label className="field" title="Edge lengths: proportional to the number of sites, or all levels equally long">
        <select value={v.spacing} onChange={(e) => s.setView({ spacing: e.target.value as "proportional" | "uniform" })}>
          <option value="proportional">proportional</option>
          <option value="uniform">uniform</option>
        </select>
      </label>
      <label className="field" title="Branch opacity proportional to |α|² (probability) or |α|">
        <select value={v.opacity} onChange={(e) => s.setView({ opacity: e.target.value as "prob" | "amp" })}>
          <option value="prob">opacity ∝ |α|²</option>
          <option value="amp">opacity ∝ |α|</option>
        </select>
      </label>
      <button
        className="btn"
        title="Switch between the light 'paper' theme and the dark 'talk' theme"
        data-testid="theme-toggle"
        onClick={() => s.setView({ theme: v.theme === "paper" ? "talk" : "paper" })}
      >
        {v.theme === "paper" ? "☾ talk" : "☀ paper"}
      </button>
      <button
        className="btn"
        title="Run the same input and memory on another variant and watch the two side by side, on one clock"
        data-testid="open-compare"
        disabled={!s.traj}
        onClick={() => s.setCompareOpen(true)}
      >
        Compare
      </button>
      <button className="btn" title="Open the user guide (?)" data-testid="open-help" onClick={() => s.openHelp(null)}>
        ? Guide
      </button>
    </header>
  );
}

export function App() {
  const theme = usePlayback((s) => s.view.theme);
  const error = usePlayback((s) => s.error);
  const busy = usePlayback((s) => s.busy);
  const traj = usePlayback((s) => s.traj);
  const engineStatus = usePlayback((s) => s.engineStatus);
  const compareOpen = usePlayback((s) => s.compareOpen);
  const [tab, setTab] = useState<Tab>("Metrics");
  usePlaybackLoop();
  useKeyboard();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (booted) return; // StrictMode runs effects twice in development
    booted = true;
    const s = usePlayback.getState();
    void s.loadPresets().then(() => {
      const st = usePlayback.getState();
      const e1 = st.presets.find((p) => p.name === "E1");
      if (e1 && !st.traj) void st.run(e1.config);
    });
  }, []);

  return (
    <div className="app">
      <TopBar />
      {error && (
        <div className="error-banner" role="alert" data-testid="error">
          {error}
          <button className="btn" title="Dismiss" onClick={() => usePlayback.setState({ error: null })}>
            dismiss
          </button>
        </div>
      )}
      {traj && traj.meta.warnings.length > 0 && (
        <div className="warn-banner">{traj.meta.warnings.join(" · ")}</div>
      )}
      <main className="main">
        <section className="stage">
          <TreeCanvas />
          <TrainStrip />
          <Controls />
        </section>
        <aside className="side">
          <Narration />
          <KetPanel />
          <section className="panel tabs-panel">
            <header className="panel-head tabs">
              {TABS.map((t) => (
                <button key={t} className={`btn ${tab === t ? "active" : ""}`} title={`Show the ${t} panel`} data-testid={`tab-${t}`} onClick={() => setTab(t)}>
                  {t}
                </button>
              ))}
              <span className="spacer" />
              <InfoButton anchor="ui-panels" topic="the side panels" />
            </header>
            <div className="tab-body">
              {tab === "Phasors" && <PhasorPanel />}
              {tab === "Metrics" && <MetricsPanel />}
              {tab === "Resources" && <ResourcesPanel />}
              {tab === "Events" && <EventLog />}
              {tab === "Legend" && <Legend />}
            </div>
          </section>
        </aside>
      </main>
      {engineStatus && (
        <div className="busy" aria-live="polite" data-testid="engine-status">
          {engineStatus}
        </div>
      )}
      {busy && !engineStatus && <div className="busy" aria-live="polite">running the engine…</div>}
      <SetupDrawer />
      {compareOpen && <ComparePane />}
      <HelpPanel />
    </div>
  );
}
