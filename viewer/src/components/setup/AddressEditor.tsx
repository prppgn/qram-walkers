// AddressEditor (D9): the input superposition as rows of clickable bit boxes with a
// modulus and a phase per row; no ket typing. The live preview shows the normalised
// state the engine will run (duplicates merged, amplitudes normalised).
import { useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  clampInt,
  dialAngle,
  firstUnusedAddress,
  formatState,
  normalise,
  presetTerms,
  snapPhase,
  termIssues,
  toggleBit,
  wrapDeg,
  type InputPreset,
  type TermDraft,
} from "./configModel";

const PRESETS: { kind: InputPreset; label: (n: number) => string; tip: string }[] = [
  {
    kind: "single",
    label: (n) => `|${"0".repeat(n)}⟩`,
    tip: "A single classical address 0…0 (one term)",
  },
  {
    kind: "uniform",
    label: () => "Uniform",
    tip: "Equal superposition of all 2^n addresses: every memory cell is queried at once",
  },
  {
    kind: "ghz",
    label: () => "GHZ",
    tip: "GHZ-like superposition |0…0⟩ + |1…1⟩ of the two extreme addresses",
  },
  {
    kind: "w",
    label: () => "W",
    tip: "W-like superposition of the n addresses with exactly one bit equal to 1",
  },
];

const sub = (i: number) => String(i).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]!);

function PhaseDial({ value, onChange }: { value: number; onChange: (deg: number) => void }) {
  const R = 11;
  const c = 14;
  const rad = (value * Math.PI) / 180;
  const tip: [number, number] = [c + R * Math.cos(rad), c - R * Math.sin(rad)];
  const setFrom = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    onChange(snapPhase(dialAngle(dx, dy), !e.altKey));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = e.altKey ? 1 : 45;
    let next: number | null = null;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") next = value + step;
    if (e.key === "ArrowDown" || e.key === "ArrowLeft") next = value - step;
    if (e.key === "Home") next = 0;
    if (next === null) return;
    e.preventDefault();
    onChange(snapPhase(next, !e.altKey));
  };
  return (
    <svg
      className="phase-dial"
      width={28}
      height={28}
      viewBox="0 0 28 28"
      role="slider"
      tabIndex={0}
      aria-label="Phase of this term"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={value}
      aria-valuetext={`${value}°`}
      data-testid="phase-dial"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setFrom(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons & 1) setFrom(e);
      }}
      onKeyDown={onKey}
    >
      <title>
        Phase φ of the amplitude r·e^(iφ): click or drag (snaps to multiples of 45° = π/4; hold Alt for any angle).
        Arrow keys step by 45°.
      </title>
      <circle className="dial-ring" cx={c} cy={c} r={R} />
      {Array.from({ length: 8 }, (_, k) => {
        const a = (k * Math.PI) / 4;
        return <circle key={k} className="dial-tick" cx={c + R * Math.cos(a)} cy={c - R * Math.sin(a)} r={1} />;
      })}
      <line className="dial-hand" x1={c} y1={c} x2={tip[0]} y2={tip[1]} />
      <circle className="dial-tip" cx={tip[0]} cy={tip[1]} r={2.5} />
    </svg>
  );
}

/** Walker glyph encoding address bit `b` and its tooltip, per family (PROTOCOL.md §5). */
function bitGlyph(family: string, b: string, i: number): { glyph: string; cls: string; tip: string } {
  const a = `a${sub(i + 1)}`;
  const A = `A${sub(i + 1)}`;
  if (family === "qudit") {
    return b === "1"
      ? { glyph: "●R", cls: "g-R", tip: `${a} = 1: the qudit ${A} starts in |●R⟩ (logical 1, red)` }
      : { glyph: "○R", cls: "g-R", tip: `${a} = 0: the qudit ${A} starts in |○R⟩ (logical 0, red)` };
  }
  if (family === "dualrail") {
    return b === "1"
      ? { glyph: "↓R", cls: "g-R", tip: `${a} = 1: the walker ${A} starts on the ↓ tree, red` }
      : { glyph: "↑R", cls: "g-R", tip: `${a} = 0: the walker ${A} starts on the ↑ tree, red` };
  }
  return b === "1"
    ? { glyph: "R", cls: "g-R", tip: `${a} = 1: the address walker ${A} is present, in the red state |R⟩` }
    : { glyph: "∅", cls: "g-E", tip: `${a} = 0: the slot of ${A} is empty, |∅⟩` };
}

function TermRow(props: {
  term: TermDraft;
  index: number;
  showGlyphs: boolean;
  family: string;
  canDelete: boolean;
  onChange: (t: TermDraft) => void;
  onDelete: () => void;
}) {
  const { term, index } = props;
  const set = (patch: Partial<TermDraft>) => props.onChange({ ...term, ...patch });
  const setModulus = (raw: string) => {
    const v = Number.parseFloat(raw);
    if (Number.isFinite(v)) set({ modulus: Math.max(0, Math.min(1, v)) });
  };
  return (
    <div className="term-row" data-testid="term-row">
      <div className="term-bits" role="group" aria-label={`Address of term ${index + 1}`}>
        {[...term.bits].map((b, i) => (
          <div key={i} className="bit-col">
            <button
              type="button"
              className={`bit-box${b === "1" ? " on" : ""}`}
              data-testid="bit-box"
              aria-pressed={b === "1"}
              aria-label={`a${i + 1} = ${b}`}
              title={`Address bit a${sub(i + 1)} (level ${i + 1}): click to toggle 0/1`}
              onClick={() => set({ bits: toggleBit(term.bits, i) })}
            >
              {b}
            </button>
            {props.showGlyphs &&
              (() => {
                const g = bitGlyph(props.family, b, i);
                return (
                  <span className={`bit-glyph ${g.cls}`} title={g.tip}>
                    {g.glyph}
                  </span>
                );
              })()}
          </div>
        ))}
      </div>
      <div className="term-amp">
        <input
          type="number"
          min={0}
          max={1}
          step={0.01}
          value={term.modulus}
          aria-label={`Modulus of term ${index + 1}`}
          title="Relative modulus r of this term (0–1); the state is normalised automatically"
          onChange={(e) => setModulus(e.target.value)}
        />
        <input
          type="range"
          className="term-range"
          min={0}
          max={1}
          step={0.01}
          value={term.modulus}
          aria-label={`Modulus slider of term ${index + 1}`}
          title="Relative modulus r of this term; drag to change"
          onChange={(e) => setModulus(e.target.value)}
        />
      </div>
      <div className="term-phase">
        <PhaseDial value={term.phaseDeg} onChange={(phaseDeg) => set({ phaseDeg })} />
        <input
          type="number"
          min={0}
          max={360}
          step={1}
          value={term.phaseDeg}
          aria-label={`Phase in degrees of term ${index + 1}`}
          title="Phase φ in degrees (0–360); the amplitude is r·e^(iφ)"
          onChange={(e) => {
            const v = Number.parseFloat(e.target.value);
            if (Number.isFinite(v)) set({ phaseDeg: wrapDeg(v) });
          }}
        />
        <span className="muted">°</span>
      </div>
      <button
        type="button"
        className="btn icon term-delete"
        aria-label={`Delete term ${index + 1}`}
        title={props.canDelete ? "Delete this term" : "The superposition needs at least one term"}
        disabled={!props.canDelete}
        onClick={props.onDelete}
      >
        ✕
      </button>
    </div>
  );
}

export function AddressEditor(props: {
  n: number;
  /** Show the walker glyphs under the bits (∅ / R, ○R / ●R, ↑R / ↓R). */
  showGlyphs: boolean;
  /** Walker family of the variant (default bosonic). */
  family?: string;
  terms: TermDraft[];
  onChange: (terms: TermDraft[]) => void;
}) {
  const { n, terms, onChange } = props;
  const [k, setK] = useState(3);
  const kk = clampInt(k, 1, 1 << n);
  const unused = firstUnusedAddress(terms, n);
  const normalised = normalise(terms);
  const { errors, warnings } = termIssues(terms, n);

  return (
    <div className="address-editor">
      <div className="setup-row wrap">
        <span className="muted">Presets:</span>
        {PRESETS.map((p) => (
          <button
            key={p.kind}
            type="button"
            className="btn"
            title={p.tip}
            data-testid={`input-preset-${p.kind}`}
            onClick={() => onChange(presetTerms(p.kind, n, Math.random))}
          >
            {p.label(n)}
          </button>
        ))}
        <span className="setup-random">
          <button
            type="button"
            className="btn"
            title="k random distinct addresses with random modulus in [0.2, 1] and random phase"
            data-testid="input-preset-random"
            onClick={() => onChange(presetTerms("random", n, Math.random, kk))}
          >
            Random
          </button>
          <input
            type="number"
            min={1}
            max={1 << n}
            value={kk}
            aria-label="Number of random terms k"
            title={`Number k of random addresses (1–${1 << n})`}
            onChange={(e) => {
              const v = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(v)) setK(v);
            }}
          />
        </span>
      </div>

      <div className="term-head muted">
        <span className="term-bits" title="Address bits a₁ … aₙ: a₁ steers the walkers at level 1, aₙ at level n">
          a₁…a{sub(n)}
        </span>
        <span className="term-amp" title="Relative modulus r of each term">
          modulus r
        </span>
        <span className="term-phase" title="Phase φ of each term">
          phase φ
        </span>
      </div>
      {terms.map((t, i) => (
        <TermRow
          key={i}
          term={t}
          index={i}
          showGlyphs={props.showGlyphs}
          family={props.family ?? "bosonic"}
          canDelete={terms.length > 1}
          onChange={(nt) => onChange(terms.map((x, j) => (j === i ? nt : x)))}
          onDelete={() => onChange(terms.filter((_, j) => j !== i))}
        />
      ))}
      <div className="setup-row">
        <button
          type="button"
          className="btn"
          data-testid="add-term"
          disabled={unused === null}
          title={
            unused === null
              ? "All 2^n addresses are already in the superposition"
              : `Add a term with the first unused address |${unused}⟩`
          }
          onClick={() => unused !== null && onChange([...terms, { bits: unused, modulus: 1, phaseDeg: 0 }])}
        >
          + Add term
        </button>
      </div>

      <div className="setup-state" title="The normalised input state |ψ_in⟩ the engine will run (duplicates merged)">
        <span className="muted">|ψ_in⟩ = </span>
        <span className="mono" data-testid="setup-state">
          {normalised.length ? formatState(normalised) : "0"}
        </span>
      </div>
      {[...errors, ...warnings].map((w) => (
        <div key={w} className="setup-warning" role="status" data-testid="term-warning">
          {w}
        </div>
      ))}
    </div>
  );
}
