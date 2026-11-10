import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  absentGateTypes,
  absentTargets,
  allAddresses,
  amplitude,
  clampInt,
  configFromDraft,
  copyModesFor,
  defaultDraft,
  defaultNoise,
  dialAngle,
  draftFromConfig,
  draftIssues,
  duplicateAddresses,
  fillMemory,
  firstUnusedAddress,
  formatAmplitude,
  formatMemoryText,
  formatState,
  hasCoherent,
  isAddress,
  isValidSeed,
  normalise,
  normaliseTargets,
  NOISE_LOCATIONS,
  NOISE_MODELS,
  NOISE_PHASES,
  noiseAnchor,
  noiseChannelIssues,
  modelsFor,
  noiseDraftFromEntry,
  noiseEntryFromDraft,
  noiseIssues,
  noiseModel,
  paramRange,
  parseMemoryText,
  presetTerms,
  PROB_SLIDER_MAX,
  probToSlider,
  pruning,
  pruningIssues,
  randomSeed,
  resizeBits,
  resizeMemory,
  resizeTerms,
  SEED_MAX,
  sliderToProb,
  snapPhase,
  termIssues,
  toggleBit,
  toggleListItem,
  toggleTarget,
  variantInfo,
  VARIANTS,
  withM,
  withN,
  wrapDeg,
  type NoiseDraft,
  type Rng,
  type SetupDraft,
  type TermDraft,
} from "../src/components/setup/configModel";
import { checkTrajectory, type RunConfigJSON } from "../src/model/types";

/** Deterministic RNG cycling through the given values. */
function seq(...values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length]!;
}

const term = (bits: string, modulus = 1, phaseDeg = 0): TermDraft => ({ bits, modulus, phaseDeg });

const E1 = checkTrajectory(JSON.parse(readFileSync(new URL("../../engine/tests/golden/E1.traj.json", import.meta.url), "utf-8")));
const E2 = checkTrajectory(JSON.parse(readFileSync(new URL("./fixtures/E2.traj.json", import.meta.url), "utf-8")));

describe("angles and amplitudes", () => {
  it("wraps angles into [0, 360)", () => {
    expect(wrapDeg(0)).toBe(0);
    expect(wrapDeg(360)).toBe(0);
    expect(wrapDeg(-90)).toBe(270);
    expect(wrapDeg(725)).toBe(5);
    expect(Object.is(wrapDeg(-0), 0)).toBe(true);
  });

  it("snaps phases to multiples of 45° unless free", () => {
    expect(snapPhase(10, true)).toBe(0);
    expect(snapPhase(30, true)).toBe(45);
    expect(snapPhase(350, true)).toBe(0);
    expect(snapPhase(-100, true)).toBe(270);
    expect(snapPhase(123.4, false)).toBe(123);
    expect(snapPhase(359.7, false)).toBe(0);
  });

  it("measures dial angles counter-clockwise from +x with screen y pointing down", () => {
    expect(dialAngle(1, 0)).toBe(0);
    expect(dialAngle(0, -1)).toBe(90);
    expect(dialAngle(-1, 0)).toBe(180);
    expect(dialAngle(0, 1)).toBe(270);
    expect(dialAngle(1, -1)).toBeCloseTo(45, 12);
    expect(dialAngle(0, 0)).toBe(0);
  });

  it("builds amplitudes exactly at multiples of 45°", () => {
    expect(amplitude(1, 0)).toEqual([1, 0]);
    expect(amplitude(0.5, 90)).toEqual([0, 0.5]);
    expect(amplitude(2, 180)).toEqual([-2, 0]);
    expect(amplitude(1, 270)).toEqual([0, -1]);
    expect(amplitude(1, 45)).toEqual([Math.SQRT1_2, Math.SQRT1_2]);
    expect(amplitude(1, 405)).toEqual(amplitude(1, 45));
    const [re, im] = amplitude(1, 30);
    expect(re).toBeCloseTo(Math.sqrt(3) / 2, 15);
    expect(im).toBeCloseTo(0.5, 15);
  });

  it("clamps integers", () => {
    expect(clampInt(9, 1, 6)).toBe(6);
    expect(clampInt(0, 1, 6)).toBe(1);
    expect(clampInt(3.7, 1, 6)).toBe(3);
    expect(clampInt(Number.NaN, 1, 6)).toBe(1);
  });
});

describe("addresses", () => {
  it("lists addresses in cell order", () => {
    expect(allAddresses(1)).toEqual(["0", "1"]);
    expect(allAddresses(2)).toEqual(["00", "01", "10", "11"]);
    expect(allAddresses(6)).toHaveLength(64);
  });

  it("validates, toggles and resizes bit strings", () => {
    expect(isAddress("101", 3)).toBe(true);
    expect(isAddress("10", 3)).toBe(false);
    expect(isAddress("1a1", 3)).toBe(false);
    expect(toggleBit("100", 0)).toBe("000");
    expect(toggleBit("100", 2)).toBe("101");
    expect(toggleBit("100", 5)).toBe("100");
    expect(resizeBits("10", 4)).toBe("1000");
    expect(resizeBits("1011", 2)).toBe("10");
    expect(resizeBits("10", 2)).toBe("10");
  });

  it("resizes terms keeping every row", () => {
    const terms = [term("10", 0.5, 90), term("11")];
    expect(resizeTerms(terms, 3)).toEqual([term("100", 0.5, 90), term("110")]);
    expect(resizeTerms(terms, 1)).toEqual([term("1", 0.5, 90), term("1")]);
  });

  it("finds duplicates and the first unused address", () => {
    expect(duplicateAddresses([term("11"), term("01"), term("11"), term("01"), term("10")])).toEqual(["01", "11"]);
    expect(duplicateAddresses([term("00"), term("01")])).toEqual([]);
    expect(firstUnusedAddress([term("00"), term("10")], 2)).toBe("01");
    expect(firstUnusedAddress(allAddresses(2).map((a) => term(a)), 2)).toBeNull();
    expect(firstUnusedAddress([], 3)).toBe("000");
  });
});

describe("normalised preview (engine `normalised_terms`)", () => {
  it("normalises equal moduli", () => {
    const out = normalise([term("00"), term("11", 1, 90)]);
    expect(out.map((t) => t.address)).toEqual(["00", "11"]);
    expect(out[0]!.re).toBeCloseTo(Math.SQRT1_2, 15);
    expect(out[0]!.im).toBe(0);
    expect(out[1]!.re).toBe(0);
    expect(out[1]!.im).toBeCloseTo(Math.SQRT1_2, 15);
  });

  it("merges duplicates by summing complex amplitudes, in first-appearance order", () => {
    const out = normalise([term("10", 0.3), term("01", 0.8), term("10", 0.3)]);
    expect(out.map((t) => t.address)).toEqual(["10", "01"]);
    expect(out[0]!.re).toBeCloseTo(0.6, 15);
    expect(out[1]!.re).toBeCloseTo(0.8, 15);
  });

  it("drops amplitudes that cancel and returns [] for the zero vector", () => {
    expect(normalise([term("10", 0.5, 45), term("10", 0.5, 225), term("11", 2)])).toEqual([
      { address: "11", re: 1, im: 0 },
    ]);
    expect(normalise([term("10", 0), term("01", 0)])).toEqual([]);
    expect(normalise([term("10", 1), term("10", 1, 180)])).toEqual([]);
    expect(normalise([])).toEqual([]);
  });

  it("formats amplitudes and states like the ket panel", () => {
    expect(formatAmplitude(Math.SQRT1_2, 0)).toBe("0.7071");
    expect(formatAmplitude(-0.5, 0)).toBe("−0.5000");
    expect(formatAmplitude(0, 0.5)).toBe("0.5000·e^{i90°}");
    expect(formatAmplitude(Math.cos(-1e-9), Math.sin(-1e-9))).toBe("1.0000");
    expect(formatState(normalise([term("00"), term("11", 1, 90)]))).toBe("0.7071 |00⟩ + 0.7071·e^{i90°} |11⟩");
    expect(formatState(normalise([term("00"), term("11", 1, 180)]))).toBe("0.7071 |00⟩ − 0.7071 |11⟩");
    expect(formatState(normalise([term("1", 1, 180)]))).toBe("−1.0000 |1⟩");
    expect(formatState([])).toBe("");
  });
});

describe("input presets (engine `input_terms`)", () => {
  const rng = seq(0.5);
  it("single, uniform, GHZ and W", () => {
    expect(presetTerms("single", 3, rng)).toEqual([term("000")]);
    expect(presetTerms("uniform", 2, rng)).toEqual(["00", "01", "10", "11"].map((a) => term(a)));
    expect(presetTerms("ghz", 3, rng)).toEqual([term("000"), term("111")]);
    expect(presetTerms("w", 3, rng)).toEqual([term("001"), term("010"), term("100")]);
    expect(presetTerms("w", 1, rng)).toEqual([term("1")]);
  });

  it("random k: distinct sorted addresses, modulus in [0.2, 1], whole-degree phases", () => {
    const out = presetTerms("random", 3, seq(0.99, 0.1, 0.5, 0.0, 0.75, 0.25, 0.3, 0.6, 0.9), 3);
    expect(out).toHaveLength(3);
    const addresses = out.map((t) => t.bits);
    expect(new Set(addresses).size).toBe(3);
    expect([...addresses].sort()).toEqual(addresses);
    for (const t of out) {
      expect(isAddress(t.bits, 3)).toBe(true);
      expect(t.modulus).toBeGreaterThanOrEqual(0.2);
      expect(t.modulus).toBeLessThanOrEqual(1);
      expect(Number.isInteger(t.phaseDeg)).toBe(true);
      expect(t.phaseDeg).toBeGreaterThanOrEqual(0);
      expect(t.phaseDeg).toBeLessThan(360);
    }
  });

  it("random k is deterministic for a given RNG and clamps k to [1, 2^n]", () => {
    const a = presetTerms("random", 4, seq(0.1, 0.7, 0.3, 0.9, 0.5), 5);
    const b = presetTerms("random", 4, seq(0.1, 0.7, 0.3, 0.9, 0.5), 5);
    expect(a).toEqual(b);
    expect(presetTerms("random", 2, seq(0.3), 10)).toHaveLength(4);
    expect(presetTerms("random", 2, seq(0.3), 0)).toHaveLength(1);
    // An RNG returning 1 (out of contract) still yields valid addresses.
    expect(presetTerms("random", 2, seq(1), 2).every((t) => isAddress(t.bits, 2))).toBe(true);
  });
});

describe("memory", () => {
  it("fills like the engine", () => {
    expect(fillMemory("zeros", 1, 2, Math.random)).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(fillMemory("ones", 1, 1, Math.random)).toEqual([[1], [1]]);
    expect(fillMemory("identity", 2, 1, Math.random)).toEqual([[0], [1], [0], [1]]);
    expect(fillMemory("identity", 2, 2, Math.random)).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
    // m > n: zero-padded on the left.
    expect(fillMemory("identity", 2, 3, Math.random)).toEqual([
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 0],
      [0, 1, 1],
    ]);
    // m < n: least significant bits.
    expect(fillMemory("identity", 3, 2, Math.random).map((r) => r.join(""))).toEqual([
      "00", "01", "10", "11", "00", "01", "10", "11",
    ]);
    expect(fillMemory("random", 1, 2, seq(0.1, 0.9, 0.6, 0.4))).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });

  it("resizes along tree paths and pads new data bits with 0", () => {
    const e1 = [[0], [0], [1], [0]];
    // Growing n: cell a′ inherits from its prefix, so |10⟩ → |100⟩ still reads 1.
    expect(resizeMemory(e1, 3, 1)).toEqual([[0], [0], [0], [0], [1], [1], [0], [0]]);
    // Shrinking n: cell a′ takes the cell a′0…0.
    expect(resizeMemory(e1, 1, 1)).toEqual([[0], [1]]);
    expect(resizeMemory(e1, 2, 3)).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [1, 0, 0],
      [0, 0, 0],
    ]);
    expect(
      resizeMemory(
        [
          [1, 1],
          [0, 1],
        ],
        1,
        1,
      ),
    ).toEqual([[1], [0]]);
    const spec = { fill: "random", seed: 7 };
    expect(resizeMemory(spec, 4, 3)).toBe(spec);
  });

  it("formats and parses the text format", () => {
    const bits = [
      [0, 1],
      [1, 1],
    ];
    expect(formatMemoryText(bits, 1)).toBe("0,01\n1,11");
    expect(parseMemoryText(formatMemoryText(bits, 1), 1, 2)).toEqual({ bits });
    expect(parseMemoryText("01\n11\n", 1, 2)).toEqual({ bits });
    expect(parseMemoryText("  # cell 0\n0 1\r\n\n1, 11  # cell 1", 1, 2)).toEqual({ bits });
    expect(parseMemoryText("00,0\n01,1\n10;1\n11\t0", 2, 1)).toEqual({ bits: [[0], [1], [1], [0]] });
  });

  it("reports parse errors with line numbers", () => {
    const err = (text: string, n: number, m: number) => {
      const r = parseMemoryText(text, n, m);
      return "error" in r ? r.error : null;
    };
    expect(err("01\n1", 1, 2)).toMatch(/^line 2: "1" is not 2 bits/);
    expect(err("0\n2", 1, 1)).toMatch(/^line 2: "2" is not 1 bit /);
    expect(err("0\n1\n0", 1, 1)).toMatch(/^line 3: too many lines/);
    expect(err("0", 1, 1)).toBe("expected 2 lines (one per cell), found 1");
    expect(err("1,0\n0,1", 1, 1)).toMatch(/^line 1: address 1 out of order \(expected 0/);
    expect(err("101,0", 2, 1)).toMatch(/^line 1: "101" is not an 2-bit address/);
    expect(err("0,0,0", 1, 1)).toMatch(/^line 1: expected "bits" or "address,bits"/);
    expect(err("", 1, 1)).toBe("expected 2 lines (one per cell), found 0");
  });
});

describe("draft edits and issues", () => {
  it("changes n and m with resizing and clamping (D12)", () => {
    const d = defaultDraft();
    const d3 = withN(d, 3);
    expect(d3.n).toBe(3);
    expect(d3.terms).toEqual([term("100")]);
    expect(d3.memory).toEqual([[0], [0], [0], [0], [1], [1], [0], [0]]);
    expect(withN(d, 99).n).toBe(6);
    expect(withN(d, 0).n).toBe(1);
    expect(withN(d, 2)).toBe(d);
    const m3 = withM(d, 3);
    expect(m3.memory).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [1, 0, 0],
      [0, 0, 0],
    ]);
    expect(withM(d, 9).m).toBe(4);
  });

  it("knows the variants and copy modes", () => {
    expect(VARIANTS.map((v) => v.id)).toEqual([
      "basic",
      "backup",
      "qudit_short",
      "qudit_long",
      "dualrail_basic",
      "dualrail_backup",
    ]);
    expect(VARIANTS.every((v) => v.enabled)).toBe(true);
    expect(variantInfo("qudit_short")?.family).toBe("qudit");
    expect(variantInfo("dualrail_backup")?.family).toBe("dualrail");
    expect(variantInfo("nope")).toBeUndefined();
    expect(copyModesFor("basic")).toEqual(["global", "cell_switch"]);
    expect(copyModesFor("backup")).toEqual(["backup"]);
    expect(copyModesFor("qudit_long")).toEqual(["global", "cell_switch"]);
    expect(copyModesFor("dualrail_backup")).toEqual(["backup"]);
  });

  it("reports blocking errors and warnings", () => {
    const d = defaultDraft();
    expect(draftIssues(d)).toEqual({ errors: [], warnings: [] });
    const dup = draftIssues({ ...d, terms: [term("10"), term("10", 0.5)] });
    expect(dup.errors).toEqual([]);
    expect(dup.warnings[0]).toMatch(/\|10⟩.*merges/);
    expect(draftIssues({ ...d, terms: [term("10", 0)] }).errors[0]).toMatch(/zero norm/);
    expect(draftIssues({ ...d, terms: [] }).errors[0]).toMatch(/at least one/);
    expect(draftIssues({ ...d, variant: "qudit_short" })).toEqual({ errors: [], warnings: [] });
    const noisy = { ...d, noise: [defaultNoise("loss")] };
    expect(draftIssues({ ...noisy, variant: "dualrail_basic" }).errors).toEqual([]);
    expect(draftIssues({ ...noisy, variant: "dualrail_backup", copyMode: "backup" }).errors).toEqual([]);
    expect(draftIssues(noisy).errors).toEqual([]);
    expect(draftIssues({ ...d, variant: "backup", copyMode: "backup" })).toEqual({ errors: [], warnings: [] });
    expect(draftIssues({ ...d, copyMode: "backup" }).errors[0]).toMatch(/not valid/);
    expect(draftIssues({ ...d, terms: [term("1")] }).errors[0]).toMatch(/Invalid address/);
  });

  it("reports the issues of the superposition alone", () => {
    expect(termIssues([term("01")], 2)).toEqual({ errors: [], warnings: [] });
    expect(termIssues([term("01", 0), term("10", 0)], 2).errors).toEqual([
      "All moduli are 0: the state has zero norm and cannot be run.",
    ]);
    expect(termIssues([term("01"), term("11"), term("01", 0.2)], 2).warnings).toEqual([
      "Several rows share the address |01⟩: the engine merges them by adding their amplitudes.",
    ]);
  });
});

describe("RunConfig ⇄ draft", () => {
  it("starts from preset E1", () => {
    const cfg = configFromDraft(defaultDraft());
    expect(cfg).toEqual({
      schema: "qramsim.run/1",
      variant: "basic",
      n: 2,
      m: 1,
      copy_mode: "global",
      options: { query_stagger: true, query: true, strict: false },
      input: { terms: [{ address: "10", amp: [1, 0] }] },
      memory: { bits: [[0], [0], [1], [0]] },
      noise: [],
      seed: 0,
      record: { frames: true, ghosts: true, frame_metrics: false },
    });
  });

  it("round-trips the engine's E1 configuration exactly", () => {
    expect(configFromDraft(draftFromConfig(E1.config))).toEqual(E1.config);
  });

  it("reads E2 (normalised amplitudes) and previews the same state", () => {
    const d = draftFromConfig(E2.config);
    expect(d.terms).toEqual([term("00", 0.7071), term("11", 0.7071)]);
    expect(formatState(normalise(d.terms))).toBe("0.7071 |00⟩ + 0.7071 |11⟩");
    expect(d.memory).toEqual([[1], [0], [0], [0]]);
    expect(d.extraOptions).toEqual({ include_last_backup: true, inverse_mode: "time_reversal", n_sites: {} });
  });

  it("converts amplitudes to modulus and phase, rescaling moduli above 1", () => {
    const cfg: RunConfigJSON = {
      variant: "basic",
      n: 2,
      m: 1,
      copy_mode: "cell_switch",
      input: {
        terms: [
          { address: "01", amp: [0, 2] },
          { address: "10", amp: [-1, 0] },
          { address: "11", amp: [0.3, -0.3] },
        ],
      },
      memory: { fill: "identity" },
    };
    const d = draftFromConfig(cfg);
    expect(d.copyMode).toBe("cell_switch");
    expect(d.terms).toEqual([term("01", 1, 90), term("10", 0.5, 180), term("11", 0.2121, 315)]);
    expect(d.memory).toEqual([[0], [1], [0], [1]]);
    expect(d.options).toEqual({ queryStagger: true, query: true, strict: false, ghosts: true });
    expect(d.seed).toBe(0);
  });

  it("keeps a random fill as a rule for the engine", () => {
    const cfg: RunConfigJSON = {
      variant: "basic",
      n: 3,
      m: 2,
      copy_mode: "global",
      options: { query_stagger: false, query: false, strict: true },
      input: { terms: allAddresses(3).map((a) => ({ address: a, amp: [1, 0] })) },
      memory: { fill: "random", seed: 7 },
      record: { ghosts: false },
      seed: 5,
    };
    const d = draftFromConfig(cfg);
    expect(d.memory).toEqual({ fill: "random", seed: 7 });
    expect(d.options).toEqual({ queryStagger: false, query: false, strict: true, ghosts: false });
    const back = configFromDraft(d);
    expect(back.memory).toEqual({ fill: "random", seed: 7 });
    expect(back.options).toEqual({ query_stagger: false, query: false, strict: true });
    expect(back.record).toEqual({ frames: true, ghosts: false, frame_metrics: false });
    expect(back.seed).toBe(5);
    expect(back.input.terms).toHaveLength(8);
  });

  it("fixes addresses of the wrong length and missing memory", () => {
    const d = draftFromConfig({
      variant: "basic",
      n: 3,
      m: 1,
      copy_mode: "global",
      input: { terms: [{ address: "1", amp: [1, 0] }] },
      memory: { fill: "zeros" },
    });
    expect(d.terms).toEqual([term("100")]);
    expect(d.memory).toEqual(fillMemory("zeros", 3, 1, Math.random));
  });

  it("sends un-normalised amplitudes and leaves out rows with modulus 0", () => {
    const d: SetupDraft = {
      ...defaultDraft(),
      terms: [term("00", 0.5, 90), term("01", 0), term("11", 1, 180), term("00", 0.25)],
    };
    expect(configFromDraft(d).input.terms).toEqual([
      { address: "00", amp: [0, 0.5] },
      { address: "11", amp: [-1, 0] },
      { address: "00", amp: [0.25, 0] },
    ]);
  });

  it("does not share arrays with the draft", () => {
    const d = defaultDraft();
    const cfg = configFromDraft(d);
    (cfg.memory as { bits: number[][] }).bits[0]![0] = 1;
    expect((d.memory as number[][])[0]![0]).toBe(0);
  });
});

describe("noise models (engine noise.MODELS)", () => {
  it("lists the engine's models with their kinds and default locations", () => {
    expect(NOISE_MODELS.map((m) => m.name)).toEqual([
      "loss",
      "bit_flip",
      "colour_dephasing",
      "presence_dephasing",
      "logical_dephasing",
      "logical_flip",
      "depolarizing",
      "scatter_flip",
      "gate_failure",
      "clock_jitter",
      "copy_error",
      "memory_bit_flip",
      "overrotation",
      "beam_splitter_imbalance",
    ]);
    const kind = (k: string) => NOISE_MODELS.filter((m) => m.kind === k).map((m) => m.name);
    expect(kind("stochastic")).toEqual([
      "loss",
      "bit_flip",
      "colour_dephasing",
      "presence_dephasing",
      "logical_dephasing",
      "logical_flip",
      "depolarizing",
      "scatter_flip",
    ]);
    expect(kind("classical")).toEqual(["gate_failure", "clock_jitter", "copy_error", "memory_bit_flip"]);
    expect(kind("coherent")).toEqual(["overrotation", "beam_splitter_imbalance"]);
    const where = Object.fromEntries(NOISE_MODELS.map((m) => [m.name, m.defaultWhere]));
    expect(where).toEqual({
      loss: ["propagation"],
      bit_flip: ["gate"],
      colour_dephasing: ["propagation"],
      presence_dephasing: ["propagation"],
      logical_dephasing: ["propagation"],
      logical_flip: ["gate"],
      depolarizing: ["gate"],
      scatter_flip: ["scattering"],
      gate_failure: ["gate", "memory"],
      clock_jitter: ["gate", "memory"],
      copy_error: ["memory"],
      memory_bit_flip: [],
      overrotation: ["gate"],
      beam_splitter_imbalance: ["scattering"],
    });
    expect(NOISE_MODELS.filter((m) => m.fixedWhere).map((m) => m.name)).toEqual([
      "scatter_flip",
      "overrotation",
      "beam_splitter_imbalance",
    ]);
    expect(noiseModel("overrotation")?.params).toEqual(["epsilon", "sigma"]);
    expect(noiseModel("beam_splitter_imbalance")?.params).toEqual(["eta", "sigma"]);
    expect(noiseModel("clock_jitter")?.params).toEqual(["p_early", "p_late"]);
    expect(noiseModel("memory_bit_flip")?.phased).toBe(false);
    expect(noiseModel("nope")).toBeUndefined();
    for (const m of NOISE_MODELS) {
      expect(m.description.length).toBeGreaterThan(10);
      for (const param of m.params) expect(m.tips[param], `${m.name}.${param}`).toBeTruthy();
      for (const w of m.defaultWhere) expect(m.locations).toContain(w);
    }
  });

  it("offers each family its own models and options (D35)", () => {
    const names = (variant: string) => modelsFor(variant).map((m) => m.name);
    expect(names("basic")).toContain("presence_dephasing");
    expect(names("basic")).not.toContain("logical_flip");
    for (const v of ["qudit_short", "qudit_long", "dualrail_basic", "dualrail_backup"]) {
      expect(names(v)).toContain("logical_flip");
      expect(names(v)).toContain("logical_dephasing");
      expect(names(v)).not.toContain("presence_dephasing");
    }
    expect(names("backup")).toContain("logical_dephasing");
    const issue = (d: NoiseDraft, variant: string) => noiseChannelIssues(d, 0, variant).errors[0];
    expect(issue(defaultNoise("presence_dephasing"), "qudit_long")).toMatch(/logical dephasing/);
    expect(issue(defaultNoise("logical_flip"), "basic")).toMatch(/does not exist/);
    expect(issue({ ...defaultNoise("depolarizing"), on: "both" }, "backup")).toMatch(/only on the qudit/);
    expect(issue({ ...defaultNoise("depolarizing"), on: "both" }, "qudit_short")).toBeUndefined();
    expect(issue({ ...defaultNoise("overrotation"), vacuumPhase: true }, "dualrail_basic")).toMatch(/vacuum phase/);
    // the option travels to the engine only when it differs from the default
    expect(noiseEntryFromDraft(defaultNoise("depolarizing")).on).toBeUndefined();
    const both = noiseEntryFromDraft({ ...defaultNoise("depolarizing"), on: "both" });
    expect(both.on).toBe("both");
    expect(noiseDraftFromEntry(both).on).toBe("both");
    expect(noiseDraftFromEntry({ model: "depolarizing", p: 0.1 }).on).toBe("colour");
  });

  it("names the guide anchors", () => {
    expect(noiseAnchor("bit_flip")).toBe("noise-bit-flip");
    expect(noiseAnchor("logical_flip")).toBe("noise-logical-flip");
    expect(noiseAnchor("logical_dephasing")).toBe("noise-logical-dephasing");
    expect(noiseAnchor("loss")).toBe("noise-loss");
    expect(noiseAnchor("memory_bit_flip")).toBe("noise-memory-bit-flip");
    expect(noiseAnchor("overrotation")).toBe("noise-overrotation");
    expect(noiseAnchor("beam_splitter_imbalance")).toBe("noise-imbalance");
  });

  it("creates channels with the default locations, all targets and all phases", () => {
    expect(defaultNoise("loss")).toEqual({
      model: "loss",
      p: 0.01,
      pEarly: 0,
      pLate: 0,
      epsilon: 0,
      eta: 0,
      sigma: 0,
      backward: "reciprocal",
      vacuumPhase: false,
      on: "colour",
      where: ["propagation"],
      targets: ["all"],
      phases: ["routing", "query", "inverse"],
    });
    expect(defaultNoise("clock_jitter")).toMatchObject({ p: 0, pEarly: 0.01, pLate: 0.01, where: ["gate", "memory"] });
    expect(defaultNoise("memory_bit_flip").where).toEqual([]);
    expect(defaultNoise("overrotation")).toMatchObject({
      p: 0,
      epsilon: 0.05,
      sigma: 0,
      vacuumPhase: false,
      where: ["gate"],
      gates: ["U", "U_in", "U_B"],
    });
    expect(defaultNoise("beam_splitter_imbalance")).toMatchObject({ p: 0, eta: 0.05, sigma: 0, backward: "reciprocal" });
    expect(defaultNoise("beam_splitter_imbalance").gates).toBeUndefined();
    // Fresh arrays: editing one channel never changes another.
    const a = defaultNoise("gate_failure");
    a.where.push("idle");
    expect(defaultNoise("gate_failure").where).toEqual(["gate", "memory"]);
  });
});

describe("noise chips", () => {
  it("toggles locations and phases in canonical order", () => {
    expect(toggleListItem(["gate"], "propagation", NOISE_LOCATIONS)).toEqual(["propagation", "gate"]);
    expect(toggleListItem(["propagation", "gate"], "propagation", NOISE_LOCATIONS)).toEqual(["gate"]);
    expect(toggleListItem(["inverse"], "routing", NOISE_PHASES)).toEqual(["routing", "inverse"]);
    expect(toggleListItem(["routing"], "routing", NOISE_PHASES)).toEqual([]);
  });

  it("keeps `all` exclusive among the targets", () => {
    expect(toggleTarget(["all"], "data")).toEqual(["data"]);
    expect(toggleTarget(["data"], "address")).toEqual(["address", "data"]);
    expect(toggleTarget(["address", "data"], "all")).toEqual(["all"]);
    expect(toggleTarget(["all"], "all")).toEqual([]);
    expect(toggleTarget(["data", "D_1"], "D_1")).toEqual(["data"]);
    expect(toggleTarget(["D_1"], "flag")).toEqual(["flag", "D_1"]);
    expect(normaliseTargets(["data", "all", "flag"])).toEqual(["all"]);
    expect(normaliseTargets(["D_1", "flag", "address", "flag"])).toEqual(["address", "flag", "D_1"]);
  });

  it("knows the target groups that are empty in a variant", () => {
    expect(absentTargets(["all", "backup", "flag"], "basic")).toEqual(["backup"]);
    expect(absentTargets(["all", "backup", "flag"], "backup")).toEqual(["flag"]);
    expect(absentTargets(["flag"], "qudit_short")).toEqual([]);
  });
});

describe("probability slider", () => {
  it("steps through 0, round values per decade from 1e-4, and 1", () => {
    expect(PROB_SLIDER_MAX).toBe(41);
    expect(sliderToProb(0)).toBe(0);
    expect(sliderToProb(-5)).toBe(0);
    expect(sliderToProb(PROB_SLIDER_MAX)).toBe(1);
    expect(sliderToProb(999)).toBe(1);
    expect(Array.from({ length: 11 }, (_, i) => sliderToProb(i + 1))).toEqual([
      1e-4, 1.2e-4, 1.5e-4, 2e-4, 2.5e-4, 3e-4, 4e-4, 5e-4, 6e-4, 8e-4, 1e-3,
    ]);
    expect(sliderToProb(21)).toBe(0.01);
    expect(sliderToProb(31)).toBe(0.1);
    expect(sliderToProb(40)).toBe(0.8);
    let prev = -1;
    for (let s = 0; s <= PROB_SLIDER_MAX; s++) {
      const p = sliderToProb(s);
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
  });

  it("inverts the mapping exactly and never sends p > 0 to the p = 0 end", () => {
    for (let s = 0; s <= PROB_SLIDER_MAX; s++) expect(probToSlider(sliderToProb(s))).toBe(s);
    expect(probToSlider(0)).toBe(0);
    expect(probToSlider(Number.NaN)).toBe(0);
    expect(probToSlider(1e-9)).toBe(1);
    expect(probToSlider(3)).toBe(PROB_SLIDER_MAX);
    expect(probToSlider(0.0105)).toBe(21);
    expect(probToSlider(0.011)).toBe(22); // nearer to 0.012 than to 0.01 in log
    expect(probToSlider(0.0175)).toBe(24); // nearest in log: 0.02
    expect(probToSlider(0.95)).toBe(PROB_SLIDER_MAX);
  });
});

describe("noise entries ⇄ drafts", () => {
  it("sends the model, its probabilities and the applicable fields explicitly", () => {
    expect(noiseEntryFromDraft(defaultNoise("loss"))).toEqual({
      model: "loss",
      p: 0.01,
      where: ["propagation"],
      targets: ["all"],
      phases: ["routing", "query", "inverse"],
    });
    expect(noiseEntryFromDraft(defaultNoise("gate_failure"))).toEqual({
      model: "gate_failure",
      p: 0.01,
      where: ["gate", "memory"],
      phases: ["routing", "query", "inverse"],
    });
    expect(noiseEntryFromDraft(defaultNoise("clock_jitter"))).toEqual({
      model: "clock_jitter",
      p_early: 0.01,
      p_late: 0.01,
      where: ["gate", "memory"],
      phases: ["routing", "query", "inverse"],
    });
    expect(noiseEntryFromDraft(defaultNoise("memory_bit_flip"))).toEqual({ model: "memory_bit_flip", p: 0.01 });
  });

  it("always sends the fixed location of scatter_flip and canonical lists", () => {
    const d: NoiseDraft = { ...defaultNoise("scatter_flip"), where: ["gate"] };
    expect(noiseEntryFromDraft(d).where).toEqual(["scattering"]);
    const e = noiseEntryFromDraft({
      ...defaultNoise("bit_flip"),
      where: ["idle", "gate"],
      targets: ["data", "address"],
      phases: ["inverse", "routing"],
    });
    expect(e).toEqual({
      model: "bit_flip",
      p: 0.01,
      where: ["gate", "idle"],
      targets: ["address", "data"],
      phases: ["routing", "inverse"],
    });
  });

  it("reads entries with the engine's defaults for missing fields", () => {
    expect(noiseDraftFromEntry({ model: "loss", p: 0.2 })).toEqual({ ...defaultNoise("loss"), p: 0.2 });
    expect(noiseDraftFromEntry({ model: "gate_failure" })).toEqual({ ...defaultNoise("gate_failure"), p: 0 });
    expect(noiseDraftFromEntry({ model: "clock_jitter", p_late: 0.3 })).toMatchObject({ p: 0, pEarly: 0, pLate: 0.3 });
    // A single target given as a string, slot names kept, `all` exclusive.
    expect(noiseDraftFromEntry({ model: "loss", targets: "data" }).targets).toEqual(["data"]);
    expect(noiseDraftFromEntry({ model: "loss", targets: ["D_1"] }).targets).toEqual(["D_1"]);
    expect(noiseDraftFromEntry({ model: "loss", targets: ["data", "all"] }).targets).toEqual(["all"]);
    // scatter_flip ignores `where` (engine `fixed_where`).
    expect(noiseDraftFromEntry({ model: "scatter_flip", where: ["gate"] }).where).toEqual(["scattering"]);
    // Gate restrictions pass through untouched.
    const g = noiseDraftFromEntry({ model: "bit_flip", p: 0.1, gates: ["copy_global"] });
    expect(g.gates).toEqual(["copy_global"]);
    expect(noiseEntryFromDraft(g).gates).toEqual(["copy_global"]);
  });

  it("round-trips the configurations echoed by the engine (noise fixtures)", () => {
    const loss = checkTrajectory(JSON.parse(readFileSync(new URL("./fixtures/noise-loss.traj.json", import.meta.url), "utf-8")));
    const stray = checkTrajectory(JSON.parse(readFileSync(new URL("./fixtures/noise-stray.traj.json", import.meta.url), "utf-8")));
    const d = draftFromConfig(loss.config);
    expect(d.seed).toBe(4);
    expect(d.noise.map((c) => c.model)).toEqual(["loss", "memory_bit_flip", "gate_failure"]);
    const back = configFromDraft(d);
    expect(back.seed).toBe(4);
    expect(back.noise).toEqual([
      { model: "loss", p: 1, where: ["scattering"], targets: ["D_1"], phases: ["routing"] },
      { model: "memory_bit_flip", p: 0.5 },
      // Explicit: the engine defaults of the original entry are written out.
      { model: "gate_failure", p: 0, where: ["gate", "memory"], phases: ["routing", "query", "inverse"] },
    ]);
    // What the engine resolved (meta.noise) matches what the form sends.
    for (const [i, ch] of loss.meta.noise!.channels.entries()) {
      const e = back.noise![i]!;
      expect(e.where ?? []).toEqual([...ch.where].sort((a, b) => NOISE_LOCATIONS.indexOf(a as never) - NOISE_LOCATIONS.indexOf(b as never)));
      expect(e.p ?? 0).toBe(ch.p);
    }
    expect(configFromDraft(draftFromConfig(stray.config)).noise).toEqual([
      { model: "scatter_flip", p: 1, where: ["scattering"], targets: ["D_1"], phases: ["routing"] },
    ]);
  });

  it("does not share arrays with the draft", () => {
    const d = defaultNoise("loss");
    const e = noiseEntryFromDraft(d);
    e.where!.push("idle");
    (e.phases as string[]).length = 0;
    expect(d.where).toEqual(["propagation"]);
    expect(d.phases).toEqual(["routing", "query", "inverse"]);
  });
});

describe("noise issues", () => {
  it("accepts the default channels", () => {
    for (const m of NOISE_MODELS) expect(noiseChannelIssues(defaultNoise(m.name), 0)).toEqual({ errors: [], warnings: [] });
  });

  it("rejects probabilities outside [0, 1]", () => {
    expect(noiseChannelIssues({ ...defaultNoise("loss"), p: 1.5 }, 0).errors).toEqual([
      "Noise channel 1 (loss): p = 1.5 is outside [0, 1].",
    ]);
    expect(noiseChannelIssues({ ...defaultNoise("loss"), p: -0.1 }, 2).errors[0]).toMatch(/^Noise channel 3 \(loss\): p = -0.1/);
    expect(noiseChannelIssues({ ...defaultNoise("loss"), p: Number.NaN }, 0).errors[0]).toMatch(/outside/);
    expect(noiseChannelIssues({ ...defaultNoise("clock_jitter"), pLate: 2 }, 0).errors[0]).toMatch(/p_late = 2 is outside/);
    expect(noiseChannelIssues({ ...defaultNoise("clock_jitter"), pEarly: 0.7, pLate: 0.6 }, 0).errors).toEqual([
      "Noise channel 1 (clock_jitter): p_early + p_late = 1.3 exceeds 1.",
    ]);
    expect(noiseChannelIssues({ ...defaultNoise("clock_jitter"), pEarly: 0.5, pLate: 0.5 }, 0).errors).toEqual([]);
    // clock_jitter has no p: a stray p is ignored.
    expect(noiseChannelIssues({ ...defaultNoise("clock_jitter"), p: 7 }, 0).errors).toEqual([]);
  });

  it("requires a location and a target for the stochastic channels", () => {
    expect(noiseChannelIssues({ ...defaultNoise("loss"), where: [] }, 0).errors).toEqual([
      "Noise channel 1 (loss) has no location: choose where it acts.",
    ]);
    expect(noiseChannelIssues({ ...defaultNoise("loss"), targets: [] }, 0).errors).toEqual([
      "Noise channel 1 (loss) has no target: choose which slots it acts on.",
    ]);
    // scatter_flip's location is fixed; classical channels have no targets.
    expect(noiseChannelIssues({ ...defaultNoise("scatter_flip"), where: [] }, 0).errors).toEqual([]);
    expect(noiseChannelIssues({ ...defaultNoise("copy_error"), targets: [] }, 0).errors).toEqual([]);
    expect(noiseChannelIssues({ ...defaultNoise("memory_bit_flip"), where: [], phases: [] }, 0).errors).toEqual([]);
    expect(noiseChannelIssues({ ...defaultNoise("gate_failure"), where: [] }, 0).errors[0]).toMatch(/no location/);
    expect(noiseChannelIssues({ ...defaultNoise("loss"), phases: [] }, 0).errors[0]).toMatch(/no phase/);
    expect(noiseChannelIssues({ ...defaultNoise("loss"), where: ["tree"] }, 0).errors[0]).toMatch(/unknown location tree/);
    expect(noiseChannelIssues({ ...defaultNoise("loss"), model: "walker_delay" }, 0).errors[0]).toMatch(/unknown model/);
  });

  it("warns about channels without effect", () => {
    expect(noiseChannelIssues({ ...defaultNoise("loss"), p: 0 }, 0)).toEqual({
      errors: [],
      warnings: ["Noise channel 1 (loss) has p = 0: it has no effect."],
    });
    expect(noiseChannelIssues({ ...defaultNoise("clock_jitter"), pEarly: 0, pLate: 0 }, 0).warnings).toEqual([
      "Noise channel 1 (clock_jitter) has p_early = p_late = 0: it has no effect.",
    ]);
    expect(noiseChannelIssues({ ...defaultNoise("clock_jitter"), pEarly: 0 }, 0).warnings).toEqual([]);
    expect(noiseChannelIssues({ ...defaultNoise("gate_failure"), where: ["gate", "propagation"] }, 0).warnings).toEqual([
      "Noise channel 1 (gate_failure) acts only at gate and memory: the location propagation has no effect.",
    ]);
    expect(noiseChannelIssues({ ...defaultNoise("loss"), targets: ["flag"] }, 0, "backup").warnings).toEqual([
      "Noise channel 1 (loss) targets no slot: the backup variant has no flag walkers.",
    ]);
    expect(noiseChannelIssues({ ...defaultNoise("loss"), targets: ["flag", "data"] }, 0, "backup").warnings).toEqual([]);
  });

  it("feeds the draft issues (errors block the run, warnings do not)", () => {
    const d = defaultDraft();
    expect(noiseIssues([])).toEqual({ errors: [], warnings: [] });
    const noisy: SetupDraft = { ...d, noise: [defaultNoise("loss"), { ...defaultNoise("bit_flip"), p: 0 }] };
    expect(draftIssues(noisy)).toEqual({
      errors: [],
      warnings: ["Noise channel 2 (bit_flip) has p = 0: it has no effect."],
    });
    const bad: SetupDraft = { ...d, noise: [{ ...defaultNoise("loss"), p: 2 }] };
    expect(draftIssues(bad).errors).toEqual(["Noise channel 1 (loss): p = 2 is outside [0, 1]."]);
    expect(draftIssues({ ...d, noise: [{ ...defaultNoise("loss"), targets: ["backup"] }] }).warnings[0]).toMatch(
      /basic variant has no backup walkers/,
    );
  });
});

describe("run seed", () => {
  it("is sent and read back", () => {
    const d: SetupDraft = { ...defaultDraft(), seed: 1234, noise: [defaultNoise("loss")] };
    const cfg = configFromDraft(d);
    expect(cfg.seed).toBe(1234);
    expect(cfg.noise).toEqual([noiseEntryFromDraft(defaultNoise("loss"))]);
    const back = draftFromConfig(cfg);
    expect(back.seed).toBe(1234);
    expect(back.noise).toEqual([defaultNoise("loss")]);
  });

  it("re-rolls to a different integer in [0, SEED_MAX)", () => {
    expect(randomSeed(seq(0.5))).toBe(500000);
    expect(randomSeed(seq(0))).toBe(0);
    expect(randomSeed(seq(0.999999999))).toBe(SEED_MAX - 1);
    expect(randomSeed(seq(1))).toBe(SEED_MAX - 1);
    expect(randomSeed(seq(0.5), 500000)).toBe(500001);
    expect(randomSeed(seq(0.999999999), SEED_MAX - 1)).toBe(0);
  });

  it("must be a non-negative integer", () => {
    expect(isValidSeed(0)).toBe(true);
    expect(isValidSeed(42)).toBe(true);
    expect(isValidSeed(-1)).toBe(false);
    expect(isValidSeed(1.5)).toBe(false);
    expect(isValidSeed(Number.NaN)).toBe(false);
    expect(draftIssues({ ...defaultDraft(), seed: -3 }).errors).toEqual([
      "The seed must be a non-negative integer (got -3).",
    ]);
  });
});

describe("coherent errors (D30)", () => {
  it("sends ε, σ, the gate types and the vacuum switch of an over-rotation", () => {
    expect(noiseEntryFromDraft(defaultNoise("overrotation"))).toEqual({
      model: "overrotation",
      epsilon: 0.05,
      sigma: 0,
      where: ["gate"],
      phases: ["routing", "query", "inverse"],
      gates: ["U", "U_in", "U_B"],
      vacuum_phase: false,
    });
    const d: NoiseDraft = { ...defaultNoise("overrotation"), gates: ["U_B", "U"], vacuumPhase: true, sigma: 0.02 };
    expect(noiseEntryFromDraft(d)).toMatchObject({ gates: ["U", "U_B"], vacuum_phase: true, sigma: 0.02 });
  });

  it("sends η, σ and the backward convention of an imbalance", () => {
    expect(noiseEntryFromDraft({ ...defaultNoise("beam_splitter_imbalance"), backward: "reciprocal" })).toEqual({
      model: "beam_splitter_imbalance",
      eta: 0.05,
      sigma: 0,
      where: ["scattering"],
      phases: ["routing", "query", "inverse"],
      backward: "reciprocal",
    });
  });

  it("reads coherent entries with the engine defaults", () => {
    const o = noiseDraftFromEntry({ model: "overrotation", epsilon: -0.1 });
    expect(o).toMatchObject({ epsilon: -0.1, sigma: 0, vacuumPhase: false, gates: ["U", "U_in", "U_B"], where: ["gate"] });
    expect(noiseDraftFromEntry({ model: "overrotation", gates: ["U_B", "U"], vacuum_phase: true })).toMatchObject({
      gates: ["U", "U_B"],
      vacuumPhase: true,
    });
    const b = noiseDraftFromEntry({ model: "beam_splitter_imbalance", eta: 0.2, sigma: 0.01, where: ["gate"] });
    expect(b).toMatchObject({ eta: 0.2, sigma: 0.01, backward: "reciprocal", where: ["scattering"] });
    for (const entry of [
      noiseEntryFromDraft(o),
      noiseEntryFromDraft(b),
      noiseEntryFromDraft({ ...b, backward: "adjoint" }),
    ]) {
      expect(noiseEntryFromDraft(noiseDraftFromEntry(entry))).toEqual(entry);
    }
  });

  it("knows the parameter ranges", () => {
    expect(paramRange("p")).toEqual({ min: 0, max: 1 });
    expect(paramRange("epsilon")).toEqual({ min: -1, max: 1 });
    expect(paramRange("eta")).toEqual({ min: -1, max: 1 });
    expect(paramRange("sigma")).toEqual({ min: 0, max: Number.POSITIVE_INFINITY });
  });

  it("validates ε, η, σ, the gate types and the backward convention", () => {
    const o = defaultNoise("overrotation");
    const b = defaultNoise("beam_splitter_imbalance");
    expect(noiseChannelIssues({ ...o, epsilon: 1.5 }, 0).errors).toEqual([
      "Noise channel 1 (overrotation): epsilon = 1.5 is outside [−1, 1].",
    ]);
    expect(noiseChannelIssues({ ...o, epsilon: -1 }, 0).errors).toEqual([]);
    expect(noiseChannelIssues({ ...b, eta: -2 }, 1).errors).toEqual([
      "Noise channel 2 (beam_splitter_imbalance): eta = -2 is outside [−1, 1].",
    ]);
    expect(noiseChannelIssues({ ...b, sigma: -0.1 }, 0).errors).toEqual([
      "Noise channel 1 (beam_splitter_imbalance): sigma = -0.1 must be a non-negative number.",
    ]);
    expect(noiseChannelIssues({ ...b, sigma: 3 }, 0).errors).toEqual([]);
    expect(noiseChannelIssues({ ...o, gates: [] }, 0).errors).toEqual([
      "Noise channel 1 (overrotation) acts on no gate type: choose at least one.",
    ]);
    expect(noiseChannelIssues({ ...b, backward: "forward" as never }, 0).errors).toEqual([
      "Noise channel 1 (beam_splitter_imbalance): backward = forward must be adjoint or reciprocal.",
    ]);
  });

  it("warns about coherent channels without effect", () => {
    const o = defaultNoise("overrotation");
    expect(noiseChannelIssues({ ...o, epsilon: 0 }, 0)).toEqual({
      errors: [],
      warnings: ["Noise channel 1 (overrotation) has epsilon = sigma = 0: it has no effect."],
    });
    expect(noiseChannelIssues({ ...o, epsilon: 0, sigma: 0.02 }, 0).warnings).toEqual([]);
    expect(noiseChannelIssues({ ...defaultNoise("beam_splitter_imbalance"), eta: 0 }, 0).warnings).toEqual([
      "Noise channel 1 (beam_splitter_imbalance) has eta = sigma = 0: it has no effect.",
    ]);
    expect(noiseChannelIssues({ ...o, gates: ["U_in", "U_B"] }, 0, "basic").warnings).toEqual([
      "Noise channel 1 (overrotation) acts on no gate: the basic variant has no U_in or U_B gates.",
    ]);
    expect(noiseChannelIssues({ ...o, gates: ["U"] }, 0, "backup").warnings[0]).toMatch(/backup variant has no U gates/);
    expect(noiseChannelIssues(o, 0, "basic").warnings).toEqual([]);
    expect(absentGateTypes(["U", "U_in", "U_B"], "basic")).toEqual(["U_in", "U_B"]);
    expect(absentGateTypes(["U", "U_in", "U_B"], "backup")).toEqual(["U"]);
  });

  it("detects coherent channels", () => {
    expect(hasCoherent([])).toBe(false);
    expect(hasCoherent([defaultNoise("loss"), defaultNoise("gate_failure")])).toBe(false);
    expect(hasCoherent([defaultNoise("loss"), defaultNoise("beam_splitter_imbalance")])).toBe(true);
  });
});

describe("pruning options", () => {
  it("uses the engine defaults until set, and sends them only when set", () => {
    const d = defaultDraft();
    expect(pruning(d)).toEqual({ pruneEps: 1e-10, maxBranches: 2048 });
    expect(configFromDraft(d).options).toEqual({ query_stagger: true, query: true, strict: false });
    const set: SetupDraft = { ...d, extraOptions: { prune_eps: 1e-8, max_branches: 512 } };
    expect(pruning(set)).toEqual({ pruneEps: 1e-8, maxBranches: 512 });
    expect(configFromDraft(set).options).toMatchObject({ prune_eps: 1e-8, max_branches: 512 });
  });

  it("is preserved from loaded configurations, with the record options", () => {
    const d = draftFromConfig(E1.config);
    expect(d.extraOptions).toMatchObject({ prune_eps: 1e-10, max_branches: 2048 });
    expect(d.extraRecord).toEqual({ max_frame_branches: 64 });
    expect(configFromDraft(d).record).toEqual({ frames: true, ghosts: true, frame_metrics: false, max_frame_branches: 64 });
  });

  it("validates the values that are set", () => {
    expect(pruningIssues(defaultDraft())).toEqual([]);
    expect(pruningIssues({ extraOptions: { prune_eps: 0, max_branches: 1 } })).toEqual([]);
    expect(pruningIssues({ extraOptions: { prune_eps: -1e-9 } })[0]).toMatch(/^prune_eps = -1e-9 must be in \[0, 1\)/);
    expect(pruningIssues({ extraOptions: { prune_eps: 1 } })).toHaveLength(1);
    expect(pruningIssues({ extraOptions: { max_branches: 0 } })).toEqual(["max_branches = 0 must be a positive integer."]);
    expect(pruningIssues({ extraOptions: { max_branches: 2.5 } })).toHaveLength(1);
    expect(draftIssues({ ...defaultDraft(), extraOptions: { max_branches: 0 } }).errors).toEqual([
      "max_branches = 0 must be a positive integer.",
    ]);
  });
});
