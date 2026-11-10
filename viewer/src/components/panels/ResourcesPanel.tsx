// Resources panel (DESIGN.md §7.5): the engine's counters for this run beside the
// paper's closed formulas for the variant (engine/src/qramsim/resources.py). The notes
// explain the constant differences (DECISIONS D3, D13).
import { usePlayback } from "../../playback/store";
import { InfoButton, Panel } from "../Panel";
import { resourceRows, VARIANT_COMPARISON, type EngineResources, type ResourceRow } from "./helpAnchors";
import { Scripted } from "./KetPanel";
import "./panels.css";

function PaperCell({ row }: { row: ResourceRow }) {
  if (!row.paper && !row.formula) return <span className="muted">—</span>;
  return (
    <>
      {row.paper && <div className="mono">{row.paper}</div>}
      {row.formula && <Scripted text={row.formula} className="pn-formula pn-formula-block" />}
    </>
  );
}

export function ResourcesPanel() {
  const traj = usePlayback((s) => s.traj);

  if (!traj) {
    return (
      <Panel title="Resources" help="resources" helpTopic="the resource counters" testId="resources-panel">
        <p className="muted pn-empty">No trajectory loaded.</p>
      </Panel>
    );
  }
  const res = traj.final.resources as EngineResources;
  const rows = resourceRows(res, traj.meta);
  const { meta } = traj;

  return (
    <Panel title="Resources" help="resources" helpTopic="the resource counters" testId="resources-panel">
      <p className="muted pn-res-head">
        {meta.variant} variant, {meta.copy_mode.replace("_", " ")} copy · n = {meta.n}, m = {meta.m}
      </p>
      <div className="pn-table-wrap">
        <table className="grid pn-res" data-testid="resources">
          <thead>
            <tr>
              <th>quantity</th>
              <th title="Counted by the engine for this run">this run (engine)</th>
              <th title={res.paper?.source ? `From ${res.paper.source}` : "Closed formula of the paper for this variant"}>
                paper formula
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} title={r.title}>
                <td>
                  <Scripted text={r.label} />
                  {r.help && <InfoButton anchor={r.help} topic="timing (ticks)" />}
                </td>
                <td className="mono">
                  <Scripted text={r.engine} />
                </td>
                <td>
                  <PaperCell row={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {res.paper?.source && <p className="muted pn-caption">Paper column: {res.paper.source}.</p>}
      <h4 className="pn-subhead">
        The six variants (comparison table of the technical paper)
        <InfoButton anchor="comparison" topic="the comparison of the variants" />
      </h4>
      <div className="pn-table-wrap">
        <table className="grid pn-res pn-compare" data-testid="variant-comparison">
          <thead>
            <tr>
              <th>variant</th>
              <th title="Information carriers (walkers), up to O(1) flag walkers">carriers</th>
              <th title="Binary trees">trees</th>
              <th title="Stationary routing gates">gates</th>
              <th title="Sites along a root-to-cell path">path</th>
              <th title="The paper's depth (pass-through memory cell)">depth (paper)</th>
              <th title="T_total measured with the engine (memory lane hosting the train)">T_total (engine)</th>
            </tr>
          </thead>
          <tbody>
            {VARIANT_COMPARISON.map((r) => (
              <tr key={r.variant} className={r.variant === meta.variant ? "current" : undefined}>
                <td>{r.label}</td>
                <td className="mono">{r.carriers}</td>
                <td className="mono">{r.trees}</td>
                <td className="mono">{r.gates}</td>
                <td className="mono">{r.path}</td>
                <td className="mono">{r.depth}</td>
                <td className="mono">{r.engine}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {res.notes && res.notes.length > 0 && (
        <ol className="pn-notes muted">
          {res.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
          <li>
            Why the depth differs from the paper's formula:
            <InfoButton anchor="faq-depth" topic="engine depth vs paper formula" />
          </li>
        </ol>
      )}
    </Panel>
  );
}
