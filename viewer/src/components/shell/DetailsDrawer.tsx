// Details (Simple mode): the panels of Advanced mode in a side drawer, one tab at a time.
import { useEffect } from "react";
import { usePlayback, type DetailsTab } from "../../playback/store";
import { KetPanel } from "../panels/KetPanel";
import { MetricsPanel } from "../panels/MetricsPanel";
import { ResourcesPanel } from "../panels/ResourcesPanel";
import { EventLog } from "../panels/EventLog";
import { PhasorPanel } from "../panels/PhasorPanel";
import { Legend } from "../panels/Legend";
import { TrainStrip } from "../TrainStrip";

const TABS: { tab: DetailsTab; tip: string }[] = [
  { tab: "State", tip: "The quantum state of the walkers now: one ket per branch" },
  { tab: "Metrics", tip: "Fidelity, success probability and the other figures of merit" },
  { tab: "Resources", tip: "Walkers, gates and time of this run beside the paper's formulas" },
  { tab: "Events", tip: "Every event of the run in a table" },
  { tab: "Phasors", tip: "Amplitude and phase of each branch" },
  { tab: "Legend", tip: "What every shape and colour of the tree means" },
  { tab: "Train", tip: "The train of walkers in slot order, as it waits at the port" },
];

export function DetailsButton() {
  const open = usePlayback((s) => s.detailsOpen);
  const setDetails = usePlayback((s) => s.setDetails);
  return (
    <button
      className={`btn${open ? " active" : ""}`}
      title="Show the detailed panels: state, metrics, resources, events, phasors, legend, train"
      aria-expanded={open}
      data-testid="open-details"
      onClick={() => setDetails(!open)}
    >
      Details
    </button>
  );
}

export function DetailsDrawer() {
  const open = usePlayback((s) => s.detailsOpen);
  const tab = usePlayback((s) => s.detailsTab);
  const setDetails = usePlayback((s) => s.setDetails);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetails(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setDetails]);
  if (!open) return null;
  return (
    <aside className="details-drawer" aria-label="Details" data-testid="details-drawer">
      <header className="details-head">
        <div className="details-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.tab}
              role="tab"
              aria-selected={tab === t.tab}
              className={`btn${tab === t.tab ? " active" : ""}`}
              title={t.tip}
              data-testid={`details-${t.tab}`}
              onClick={() => setDetails(true, t.tab)}
            >
              {t.tab}
            </button>
          ))}
        </div>
        <button className="btn icon" title="Close the details (Esc)" aria-label="Close details" data-testid="details-close" onClick={() => setDetails(false)}>
          ×
        </button>
      </header>
      <div className="details-body" role="tabpanel">
        {tab === "State" && <KetPanel />}
        {tab === "Metrics" && <MetricsPanel />}
        {tab === "Resources" && <ResourcesPanel />}
        {tab === "Events" && <EventLog />}
        {tab === "Phasors" && <PhasorPanel />}
        {tab === "Legend" && <Legend />}
        {tab === "Train" && <TrainStrip />}
      </div>
    </aside>
  );
}
