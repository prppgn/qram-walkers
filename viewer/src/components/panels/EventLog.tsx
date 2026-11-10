// Event log (DESIGN.md §7.5): every event of the trajectory in a filterable table;
// clicking a row jumps to its frame, the rows of the current frame are highlighted.
// Noise-related rows (noise, strays, collisions, absorptions) are tinted and carry an ⓘ.
import { useEffect, useMemo, useRef, useState } from "react";
import { branchLabel } from "../../layout/kets";
import { usePlayback } from "../../playback/store";
import { Panel } from "../Panel";
import {
  anchorForEvent,
  DEFAULT_FILTER,
  eventBranches,
  eventGateId,
  eventKindLabel,
  eventKindTitle,
  filterEvents,
  flattenEvents,
  isIdleGate,
  isNoiseEvent,
  phaseName,
  type EventFilter,
  type KindFilter,
} from "./helpAnchors";
import { Scripted } from "./KetPanel";
import "./panels.css";

const PAGE = 400;
const MAX_LISTED_BRANCHES = 2;

const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "all kinds" },
  { value: "gate", label: "gates" },
  { value: "scatter", label: "Ŝ / Ŝ†" },
  { value: "port", label: "inject + exit" },
  { value: "phase", label: "phase + turn" },
  { value: "noise", label: "noise (+ stray, collision, absorb)" },
];

const PHASE_LETTER: Record<string, string> = { init: "–", routing: "R", query: "Q", inverse: "I" };

export function EventLog() {
  const traj = usePlayback((s) => s.traj);
  const frame = usePlayback((s) => s.frame);
  const seek = usePlayback((s) => s.seek);
  const openHelp = usePlayback((s) => s.openHelp);
  const variant = traj?.meta.variant;
  const [filter, setFilter] = useState<EventFilter>(DEFAULT_FILTER);
  const [limit, setLimit] = useState(PAGE);
  const [follow, setFollow] = useState(true);
  const box = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => (traj ? flattenEvents(traj) : []), [traj]);
  const shown = useMemo(() => filterEvents(rows, filter), [rows, filter]);
  const visible = shown.slice(0, limit);

  useEffect(() => setLimit(PAGE), [filter, traj]);

  // Keep the current frame's rows in view, scrolling only the table (never the page).
  useEffect(() => {
    const el = box.current;
    if (!follow || !el) return;
    const row = el.querySelector<HTMLElement>("tr.current");
    if (!row) return;
    const head = el.querySelector<HTMLElement>("thead")?.offsetHeight ?? 0;
    const top = row.offsetTop - head;
    const bottom = row.offsetTop + row.offsetHeight;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
  }, [frame, follow, visible.length]);

  const update = (patch: Partial<EventFilter>) => setFilter((f) => ({ ...f, ...patch }));

  if (!traj) {
    return (
      <Panel title="Event log" help="ui-events" helpTopic="the event log" testId="event-log">
        <p className="muted pn-empty">No trajectory loaded.</p>
      </Panel>
    );
  }
  const inputs = traj.meta.input_normalised;
  const nBranches = traj.frames[0]?.branches.length ?? 0;

  return (
    <Panel title="Event log" help="ui-events" helpTopic="the event log" testId="event-log">
      <div className="pn-filters">
        <select
          value={filter.kind}
          title="Show only one kind of event"
          aria-label="Event kind"
          onChange={(e) => update({ kind: e.target.value as KindFilter })}
        >
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label title="Hide gate instances whose control was absent (∅) in every branch, i.e. that acted as the identity">
          <input type="checkbox" checked={filter.actedOnly} onChange={(e) => update({ actedOnly: e.target.checked })} />
          only gates that acted
        </label>
        <label title="Scroll the table to follow the current frame during playback">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          follow
        </label>
        <input
          type="search"
          value={filter.search}
          placeholder="search text, gate, tick…"
          title="Filter by text: event sentence, gate id (e.g. U1, copy_D1), kind, phase or 'tick 5'"
          aria-label="Search events"
          onChange={(e) => update({ search: e.target.value })}
        />
      </div>
      <div className="pn-log" ref={box}>
        <table className="grid">
          <thead>
            <tr>
              <th title="Frame index (frame i = end of tick i − 1)">#</th>
              <th title="Tick of the global clock">t</th>
              <th title="Phase: R = routing, Q = query, I = inverse routing">ph</th>
              <th title="Event kind">kind</th>
              <th title="Gate id (gate events only)">gate</th>
              <th title="Branches involved, labelled by their input address">br.</th>
              <th>text</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const e = r.event;
              const br = eventBranches(e);
              const brLabels = br.map((b) => branchLabel(b, inputs, traj.meta.branch_labels));
              const brText =
                br.length === 0
                  ? ""
                  : nBranches > 1 && br.length === nBranches
                    ? "all"
                    : br.length > MAX_LISTED_BRANCHES
                      ? `${br.length}`
                      : brLabels.join(" ");
              const noisy = isNoiseEvent(e);
              return (
                <tr
                  key={`${r.frame}-${r.index}`}
                  className={`pn-log-row ${r.frame === frame ? "current" : ""} ${isIdleGate(e) ? "idle" : ""} ${noisy ? "noise" : ""}`}
                  title={`Jump to frame ${r.frame} (end of tick ${r.t})`}
                  onClick={() => seek(r.frame)}
                >
                  <td className="num">{r.frame}</td>
                  <td className="num">{r.t}</td>
                  <td>
                    <span className={`pn-ph ph-${r.phase}`} title={phaseName(r.phase)}>
                      {PHASE_LETTER[r.phase] ?? r.phase.slice(0, 1).toUpperCase()}
                    </span>
                  </td>
                  <td className="pn-log-kind">
                    <span className={`badge k-${e.kind}`} title={eventKindTitle(e)}>
                      {eventKindLabel(e)}
                    </span>
                    {noisy && (
                      <button
                        className="info-btn"
                        title="Explain this event: open the user guide"
                        aria-label={`Explain this ${eventKindLabel(e)} event`}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          openHelp(anchorForEvent(e, variant));
                        }}
                      >
                        ⓘ
                      </button>
                    )}
                  </td>
                  <td className="mono">{eventGateId(e)}</td>
                  <td className="mono" title={brLabels.join(", ")}>
                    {brText}
                  </td>
                  <td>
                    <Scripted text={e.text} />
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No event matches the filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pn-log-foot muted">
        <span>
          {shown.length === rows.length ? `${rows.length} events` : `${shown.length} of ${rows.length} events`}
          {visible.length < shown.length ? ` · showing ${visible.length}` : ""}
        </span>
        {visible.length < shown.length && (
          <button className="btn pn-btn-sm" title={`Show ${PAGE} more rows`} onClick={() => setLimit(limit + PAGE)}>
            show more
          </button>
        )}
        {(filter.kind !== "all" || filter.actedOnly || filter.search !== "") && (
          <button className="btn pn-btn-sm" title="Clear every filter" onClick={() => setFilter(DEFAULT_FILTER)}>
            reset filters
          </button>
        )}
      </div>
    </Panel>
  );
}
