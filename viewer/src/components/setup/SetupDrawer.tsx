// Setup drawer (DESIGN.md §7.5, D9): architecture, input superposition, memory, noise and
// seed, presets and options; builds a qramsim.run/1 configuration and asks the engine to run it.
// The form lives in local state (it survives closing the drawer) and is re-initialised
// whenever the store's configuration changes (a trajectory was loaded or run).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePlayback } from "../../playback/store";
import type { PresetJSON, RunConfigJSON } from "../../model/types";
import { InfoButton } from "../Panel";
import { AddressEditor } from "./AddressEditor";
import { MemoryGrid } from "./MemoryGrid";
import { NoisePanel, SeedField } from "./NoisePanel";
import {
  configFromDraft,
  copyModesFor,
  defaultDraft,
  draftFromConfig,
  draftIssues,
  M_RANGE,
  N_RANGE,
  pruning,
  variantInfo,
  VARIANTS,
  withM,
  withN,
  type OptionsDraft,
  type SetupDraft,
} from "./configModel";
import "./setup.css";

const COPY_MODE_INFO: Record<string, { label: string; tip: string }> = {
  global: {
    label: "global copy",
    tip: "Global copy: in each cell one gate, controlled by the flag walker D₀, copies the stored bits onto the data walkers",
  },
  cell_switch: {
    label: "cell switch",
    tip: "Cell switch: D₀ switches its cell on, the data walkers are copied while it is on, the delimiter walker D_{m+1} switches it off",
  },
  backup: {
    label: "backup copy",
    tip: "Backup copy: each data walker D_j is copied under the control of the backup in front of it (Ã_n for D₁, D̃_{j−1} for D_j); local, no flag walker",
  },
};

const OPTIONS: { key: keyof OptionsDraft; label: string; tip: string; invert?: boolean }[] = [
  {
    key: "queryStagger",
    label: "staggered copies",
    tip: "Copy the m data bits one per clock tick (off: all copies in the same tick)",
  },
  {
    key: "query",
    label: "skip the query (routing + inverse only)",
    tip: "Run routing immediately followed by inverse routing: the output must equal the input exactly",
    invert: true,
  },
  {
    key: "strict",
    label: "strict (assert invariants)",
    tip: "Make the engine check the runtime invariants at every tick and fail loudly if one breaks",
  },
  {
    key: "ghosts",
    label: "record ghosts",
    tip: "Record where empty slots (|∅⟩) would be, so the viewer can draw them as dashed ghosts",
  },
];

function Section(props: { title: string; info: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="setup-section" data-testid={props.testId}>
      <h3 className="setup-h">
        {props.title}
        {props.info}
      </h3>
      {props.children}
    </section>
  );
}

export function SetupDrawer() {
  const open = usePlayback((s) => s.setupOpen);
  const setOpen = usePlayback((s) => s.setSetupOpen);
  const config = usePlayback((s) => s.config);
  const presets = usePlayback((s) => s.presets);
  const loadPresets = usePlayback((s) => s.loadPresets);
  const run = usePlayback((s) => s.run);
  const busy = usePlayback((s) => s.busy);
  const error = usePlayback((s) => s.error);

  const [draft, setDraft] = useState<SetupDraft>(() => (config ? draftFromConfig(config) : defaultDraft()));
  const [loaded, setLoaded] = useState<string | null>(null);
  const synced = useRef(config);
  const closeBtn = useRef<HTMLButtonElement>(null);

  // Follow the store: a new trajectory (or a run) replaces the form.
  useEffect(() => {
    if (config && config !== synced.current) {
      synced.current = config;
      setDraft(draftFromConfig(config));
      setLoaded(null);
    }
  }, [config]);

  useEffect(() => {
    if (usePlayback.getState().presets.length === 0) void loadPresets();
  }, [loadPresets]);

  // Escape closes the drawer (but lets an open user guide close first).
  useEffect(() => {
    if (!open) return undefined;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !usePlayback.getState().helpOpen) setOpen(false);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [open, setOpen]);

  const issues = draftIssues(draft);
  const canRun = issues.errors.length === 0;
  const family = variantInfo(draft.variant)?.family ?? "bosonic";
  const queried = useMemo(() => new Set(draft.terms.map((t) => t.bits)), [draft.terms]);
  const prune = pruning(draft);

  const update = (patch: Partial<SetupDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const runConfig = async (cfg: RunConfigJSON) => {
    await run(cfg);
    if (!usePlayback.getState().error) setOpen(false);
  };

  const loadPreset = (p: PresetJSON) => {
    setDraft(draftFromConfig(p.config));
    setLoaded(p.name);
  };

  return (
    <aside
      className={`setup-drawer${open ? " open" : ""}`}
      data-testid="setup-drawer"
      aria-label="Setup"
      aria-hidden={!open}
    >
      <header className="setup-head">
        <strong>Setup</strong>
        <span className="muted">architecture, input, memory, noise</span>
        <span className="spacer" />
        <button
          ref={closeBtn}
          type="button"
          className="btn icon"
          data-testid="setup-close"
          aria-label="Close the setup drawer"
          title="Close the setup drawer (Esc); your edits are kept"
          onClick={() => setOpen(false)}
        >
          ✕
        </button>
      </header>

      <div className="setup-body">
        <Section title="Architecture" info={<InfoButton anchor="ui-setup" topic="the setup drawer" />}>
          <label className="field setup-field" title="Encoding of the walkers and gate set (variant of the paper)">
            <span>Variant</span>
            <select
              value={draft.variant}
              data-testid="setup-variant"
              onChange={(e) => {
                const variant = e.target.value;
                const modes = copyModesFor(variant);
                update({ variant, copyMode: modes.includes(draft.copyMode) ? draft.copyMode : modes[0]! });
              }}
            >
              {VARIANTS.map((v) => (
                <option key={v.id} value={v.id} disabled={!v.enabled} title={v.tip}>
                  {v.label}
                  {v.enabled ? "" : ` (Phase ${v.phase})`}
                </option>
              ))}
            </select>
          </label>
          <div className="setup-row">
            <label className="field" title={`Tree depth n = number of address bits (${N_RANGE.min}–${N_RANGE.max}); the memory has 2^n cells`}>
              <span>n</span>
              <input
                type="number"
                min={N_RANGE.min}
                max={N_RANGE.max}
                value={draft.n}
                data-testid="setup-n"
                onChange={(e) => {
                  const v = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(v)) setDraft((d) => withN(d, v));
                }}
              />
            </label>
            <label className="field" title={`Word length m = data bits per memory cell (${M_RANGE.min}–${M_RANGE.max})`}>
              <span>m</span>
              <input
                type="number"
                min={M_RANGE.min}
                max={M_RANGE.max}
                value={draft.m}
                data-testid="setup-m"
                onChange={(e) => {
                  const v = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(v)) setDraft((d) => withM(d, v));
                }}
              />
            </label>
            <span className="muted">
              {1 << draft.n} cells × {draft.m} bit{draft.m > 1 ? "s" : ""}
            </span>
          </div>
          <div className="setup-copy" role="radiogroup" aria-label="Copy mode">
            <span className="setup-copy-label">
              Copy mode
              {draft.copyMode === "backup" ? (
                <InfoButton anchor="gate-copy-backup" topic="the backup copy" />
              ) : (
                <>
                  <InfoButton anchor="copy-global" topic="the global copy" />
                  <InfoButton anchor="copy-cell-switch" topic="the cell-switch copy" />
                </>
              )}
            </span>
            {copyModesFor(draft.variant).map((mode) => (
              <label key={mode} className="field" title={COPY_MODE_INFO[mode]?.tip ?? mode}>
                <input
                  type="radio"
                  name="setup-copy-mode"
                  value={mode}
                  checked={draft.copyMode === mode}
                  data-testid={`copy-mode-${mode}`}
                  onChange={() => update({ copyMode: mode })}
                />
                {COPY_MODE_INFO[mode]?.label ?? mode}
              </label>
            ))}
          </div>
        </Section>

        <Section
          title="Input superposition"
          info={<InfoButton anchor="encoding" topic="the address encoding" />}
          testId="setup-addresses"
        >
          <AddressEditor
            n={draft.n}
            showGlyphs
            family={family}
            terms={draft.terms}
            onChange={(terms) => update({ terms })}
          />
        </Section>

        <Section title="Memory" info={<InfoButton anchor="ui-memory" topic="the memory grid" />} testId="setup-memory">
          <MemoryGrid
            n={draft.n}
            m={draft.m}
            memory={draft.memory}
            queried={queried}
            onChange={(memory) => update({ memory })}
          />
        </Section>

        <Section
          title="Noise"
          info={<InfoButton anchor="noise-quantum-jumps" topic="noise and quantum-jump trajectories" />}
          testId="setup-noise"
        >
          <NoisePanel
            noise={draft.noise}
            variant={draft.variant}
            pruneEps={prune.pruneEps}
            maxBranches={prune.maxBranches}
            onChange={(noise) => update({ noise })}
          />
          <SeedField seed={draft.seed} onChange={(seed) => update({ seed })} />
        </Section>

        <Section title="Options" info={<InfoButton anchor="ui-setup" topic="the run options" />}>
          {(draft.variant === "backup" || draft.variant === "dualrail_backup") && (
            <label
              className="field setup-check"
              title={
                draft.variant === "backup"
                  ? "Include the last data backup D̃_m (the technical paper's count 2(n+m)); off: the arXiv count 2(n+m) − 1. The protocol works either way"
                  : "Include the two backups D̃_m↑, D̃_m↓ of the last data walker (the technical paper's count 3(n+m)); they carry no information. The protocol works either way"
              }
            >
              <input
                type="checkbox"
                checked={draft.extraOptions.include_last_backup !== false}
                data-testid="option-include_last_backup"
                onChange={(e) =>
                  update({ extraOptions: { ...draft.extraOptions, include_last_backup: e.target.checked } })
                }
              />
              last data backup D̃<sub>m</sub>
            </label>
          )}
          {OPTIONS.map((o) => (
            <label key={o.key} className="field setup-check" title={o.tip}>
              <input
                type="checkbox"
                checked={o.invert ? !draft.options[o.key] : draft.options[o.key]}
                data-testid={`option-${o.key}`}
                onChange={(e) =>
                  update({ options: { ...draft.options, [o.key]: o.invert ? !e.target.checked : e.target.checked } })
                }
              />
              {o.label}
            </label>
          ))}
          <div className="setup-row wrap">
            <label
              className="field"
              title="Coherent errors: branches with |α|² below this threshold are dropped after every step (engine default 1e−10); the dropped weight is reported as discarded"
            >
              <span>prune |α|² &lt;</span>
              <input
                type="number"
                min={0}
                step="any"
                className="setup-num-wide"
                value={prune.pruneEps}
                data-testid="option-prune_eps"
                onChange={(e) => {
                  const v = Number.parseFloat(e.target.value);
                  if (Number.isFinite(v)) update({ extraOptions: { ...draft.extraOptions, prune_eps: v } });
                }}
              />
            </label>
            <label
              className="field"
              title="Coherent errors: keep at most this many branches (largest weights first, engine default 2048); the rest is dropped and reported as discarded"
            >
              <span>max branches</span>
              <input
                type="number"
                min={1}
                step={1}
                className="setup-num-wide"
                value={prune.maxBranches}
                data-testid="option-max_branches"
                onChange={(e) => {
                  const v = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(v)) update({ extraOptions: { ...draft.extraOptions, max_branches: v } });
                }}
              />
            </label>
            <InfoButton anchor="noise-pruning" topic="pruning and discarded weight" />
          </div>
        </Section>

        <Section title="Presets" info={<InfoButton anchor="ui-setup" topic="the presets" />} testId="setup-presets">
          {presets.length === 0 ? (
            <div className="setup-note">
              No presets loaded. Is the engine running (<span className="mono">uv run qramsim serve</span>)?{" "}
              <button type="button" className="btn" title="Ask the engine for its presets again" onClick={() => void loadPresets()}>
                Retry
              </button>
            </div>
          ) : (
            <ul className="setup-presets">
              {presets.map((p) => (
                <li key={p.name} className={loaded === p.name ? "loaded" : undefined}>
                  <div className="setup-preset-head">
                    <span className="badge">{p.name}</span>
                    <strong>{p.title}</strong>
                  </div>
                  <p className="muted">{p.description}</p>
                  <div className="setup-row">
                    <button
                      type="button"
                      className="btn"
                      data-testid={`preset-load-${p.name}`}
                      title="Fill the form with this preset so you can edit it before running"
                      onClick={() => loadPreset(p)}
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      className="btn"
                      data-testid={`preset-run-${p.name}`}
                      title="Run this preset now, as it is"
                      disabled={busy}
                      onClick={() => void runConfig(p.config)}
                    >
                      Run
                    </button>
                    {loaded === p.name && <span className="muted">loaded into the form</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <footer className="setup-foot">
        {issues.errors.map((e) => (
          <div key={e} className="setup-warning" role="status">
            {e}
          </div>
        ))}
        {error && (
          <div className="setup-error" role="alert" data-testid="setup-error">
            {error}
          </div>
        )}
        <div className="setup-row">
          <button
            type="button"
            className="btn primary"
            data-testid="setup-run"
            disabled={!canRun || busy}
            title={canRun ? "Send this configuration to the engine and load the new trajectory" : issues.errors[0]}
            onClick={() => void runConfig(configFromDraft(draft))}
          >
            {busy ? "Running…" : "Run"}
          </button>
          {busy && <span className="muted">the engine is simulating…</span>}
        </div>
      </footer>
    </aside>
  );
}
