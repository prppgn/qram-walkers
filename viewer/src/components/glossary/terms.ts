// The glossary: the words of the protocol a reader meets first, each with a short plain
// definition and the place of the user guide that explains it. Shown as popovers wherever
// a term appears in plain text (captions, the tutorial, Learn, metric descriptions) and as
// a list in Learn. The definitions restate the guide; they add no physics.

export interface Term {
  id: string;
  /** How the popover names it. */
  label: string;
  /** Words that mean it in running text (lower case; matched as whole words, plurals too). */
  words: string[];
  /** Not after these words (e.g. "left branch" is a branch of the tree, not of the state). */
  notAfter?: string[];
  /** Symbols that mean it, matched against the source of a typeset symbol (e.g. "Ŝ"). */
  symbols?: RegExp;
  /** One or two plain sentences; symbols such as A_d or |R⟩ are typeset. */
  text: string;
  /** Anchor of the user guide. */
  anchor: string;
}

export const TERMS: Term[] = [
  {
    id: "qram",
    label: "Quantum RAM (qRAM)",
    words: ["quantum ram", "qram"],
    text: "A memory that can be read at a superposition of addresses: from Σ_a α_a |a⟩ it makes Σ_a α_a |a⟩|b^(a)⟩, each address together with the data stored there.",
    anchor: "overview",
  },
  {
    id: "walker",
    label: "Walker",
    words: ["walker", "walkers"],
    text: "A particle that moves through the tree one site per clock tick. Its internal two-level state, the colour, is red |R⟩ or blue |B⟩.",
    anchor: "train",
  },
  {
    id: "train",
    label: "Train",
    words: ["train"],
    text: "The row of walkers that travels through the tree: the address walkers in front, then the flag and the data walkers. Their order and spacing never change.",
    anchor: "train",
  },
  {
    id: "address-walker",
    label: "Address walker",
    words: ["address walker", "address walkers"],
    text: "A walker A_i that carries one bit of the address, written by presence: present and red for 1, absent (|∅⟩) for 0. At level d, A_d steers the walkers behind it.",
    anchor: "encoding",
  },
  {
    id: "data-walker",
    label: "Data walker",
    words: ["data walker", "data walkers"],
    text: "A walker D_j (j ≥ 1) that starts red and reads one stored bit: it stays red for 1 and is removed for 0.",
    anchor: "encoding",
  },
  {
    id: "flag",
    label: "Flag walker D₀",
    words: ["flag"],
    text: "The walker D₀, right behind the address. It marks the cell the train has reached: the copy acts only where D₀ is.",
    anchor: "train",
  },
  {
    id: "colour",
    label: "Colour",
    words: ["colour", "colours", "red", "blue"],
    text: "The two-level internal state of a walker, red |R⟩ or blue |B⟩. At a bifurcation it decides the way: red goes left (bit 0), blue goes right (bit 1).",
    anchor: "encoding",
  },
  {
    id: "empty",
    label: "Empty place |∅⟩",
    words: ["empty", "absent"],
    symbols: /^\|∅⟩$/,
    text: "A place of the train with no walker. A 0 in the address, and a data bit 0 after the query, are written as an empty place.",
    anchor: "encoding",
  },
  {
    id: "tree",
    label: "Binary tree",
    words: ["binary tree", "tree"],
    text: "The paths the walkers can take: n levels of bifurcations, whose 2ⁿ leaves are the memory cells.",
    anchor: "tree",
  },
  {
    id: "bifurcation",
    label: "Bifurcation",
    words: ["bifurcation", "bifurcations", "node", "nodes"],
    text: "A point of the tree where a path splits in two: the left branch is bit 0, the right branch bit 1. The scattering gate Ŝ sits there.",
    anchor: "tree",
  },
  {
    id: "level",
    label: "Level",
    words: ["level", "levels"],
    text: "Level d is the set of edges at depth d of the tree. The gate Û^(d) acts on all of them at once, controlled by the address walker A_d.",
    anchor: "tree",
  },
  {
    id: "S",
    label: "Scattering gate Ŝ",
    words: ["scattering gate"],
    symbols: /^Ŝ/,
    text: "The gate at every bifurcation: a red walker goes left, a blue walker goes right and turns red again. It needs no control and no clock. On the way back Ŝ† merges the paths.",
    anchor: "gate-S",
  },
  {
    id: "U",
    label: "Address-transmission gate Û",
    words: ["address-transmission gate"],
    symbols: /^Û(⁽|\^\(|$)/,
    text: "The gate Û^(d) on the edges of level d: if A_d is red (bit 1) it flips the colour of every walker behind it, so they turn right at the next bifurcation; if A_d is absent (bit 0) it does nothing.",
    anchor: "gate-U",
  },
  {
    id: "clock",
    label: "Global clock",
    words: ["clock", "tick", "ticks"],
    text: "Every gate fires at a fixed tick of one classical clock, on every edge of its level and in every branch at once; the walkers move one site per tick.",
    anchor: "clock",
  },
  {
    id: "cell",
    label: "Memory cell",
    words: ["memory cell", "memory cells", "cell", "cells"],
    text: "A leaf of the tree. The cell of address a stores m classical bits, b^(a); the data walkers that reach it read them.",
    anchor: "tree",
  },
  {
    id: "routing",
    label: "Routing",
    words: ["routing"],
    text: "The first phase: the train enters the tree and the address walkers steer the data walkers down to the cell of the address.",
    anchor: "routing",
  },
  {
    id: "query",
    label: "Query",
    words: ["query"],
    text: "The middle phase: the train rests in the cells, nothing moves, and the copy gates write the stored bits into the data walkers.",
    anchor: "query",
  },
  {
    id: "copy",
    label: "Copy",
    words: ["copy", "copy gate", "copy gates"],
    text: "The gate that reads a memory cell. Where the flag D₀ is, it removes the data walker D_j if the stored bit b_j is 0 and leaves it red if b_j is 1.",
    anchor: "gate-copy-loc",
  },
  {
    id: "return",
    label: "Return trip (inverse routing)",
    words: ["inverse routing", "return trip", "time reversal", "way back"],
    text: "The last phase: the exact time reversal of the routing. Every gate is undone in reverse order and the walkers leave by the port, the tree as they found it.",
    anchor: "inverse",
  },
  {
    id: "branch",
    label: "Branch",
    words: ["branch", "branches"],
    notAfter: ["left", "right", "other"],
    text: "One term of the superposition, labelled by its input address. The simulator follows every branch exactly, and the tree shows them all at once.",
    anchor: "kets",
  },
  {
    id: "superposition",
    label: "Superposition of addresses",
    words: ["superposition", "superpositions"],
    text: "A state Σ_a α_a |a⟩ that holds several addresses at once, with amplitudes α_a. The qRAM reads all of them in a single run.",
    anchor: "overview",
  },
  {
    id: "port",
    label: "Port",
    words: ["input port", "output port", "port"],
    text: "The entry of the tree, at its root: the train enters there and, at the end, leaves by the same way. The unfolded drawing shows it twice, as input and output port.",
    anchor: "tree",
  },
  {
    id: "fidelity",
    label: "Fidelity",
    words: ["fidelity"],
    text: "How close the output is to what an ideal qRAM returns, |⟨ψ_ideal|ψ_out⟩|². 1 means the run was exact.",
    anchor: "fidelity",
  },
  {
    id: "lens",
    label: "Cell lens",
    words: ["lens"],
    text: "A box beside the tree that shows the inside of the cell the train has reached: where the walkers rest and the memory bits beside them.",
    anchor: "ui-lens",
  },
  {
    id: "noise",
    label: "Noise",
    words: ["noise", "noisy"],
    text: "Errors of a real device: a walker lost, a colour flipped, a wrong turn, a gate that fails. Each is a quantum channel, sampled one run at a time (quantum jumps).",
    anchor: "noise-quantum-jumps",
  },
  {
    id: "loss",
    label: "Loss",
    words: ["loss", "lost"],
    text: "A walker leaks out of the device. Its place is left empty, which in the basic encoding reads like a 0; dual-rail variants can tell a loss from a 0.",
    anchor: "noise-loss",
  },
  {
    id: "variant",
    label: "Variant",
    words: ["variant", "variants"],
    text: "One way to build the qRAM: basic and backup, qudit short and long range, dual-rail basic and backup. They differ in their walkers and in the reach of their gates.",
    anchor: "comparison",
  },
  {
    id: "backup",
    label: "Backup walker",
    words: ["backup walker", "backup walkers", "backup"],
    text: "Extra walkers (Ã_i, D̃_j) that travel in the train so that every gate acts only on neighbouring sites: the short-range way to pass the address down the train.",
    anchor: "backup",
  },
  {
    id: "qudit",
    label: "Qudit walker",
    words: ["qudit", "qudits"],
    text: "A walker with four internal states: a logical value, ○ or ●, besides the colour. Every place of the train holds a walker, so a 0 is never an empty place.",
    anchor: "qudit-short",
  },
  {
    id: "dualrail",
    label: "Dual-rail",
    words: ["dual-rail"],
    text: "Variants with two trees, one for the logical 0 and one for 1: each walker is always present, on one tree or the other, so a lost walker can be noticed.",
    anchor: "dualrail-basic",
  },
  {
    id: "ghost",
    label: "Ghost",
    words: ["ghost", "ghosts", "dashed circle"],
    text: "The dashed circle drawn where an empty place of the train is. It is a drawing aid only and never takes part in the physics.",
    anchor: "ghosts",
  },
];

export const TERM_BY_ID: Record<string, Term> = Object.fromEntries(TERMS.map((t) => [t.id, t]));

interface WordRule {
  id: string;
  re: RegExp;
}

/** Word rules, longest phrase first so "address walker" wins over "walker". */
const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RULES: WordRule[] = TERMS.flatMap((t) => t.words.map((w) => ({ t, w })))
  .sort((a, b) => b.w.length - a.w.length)
  .map(({ t, w }) => {
    const not = t.notAfter?.length ? `(?<!\\b(?:${t.notAfter.join("|")}) )` : "";
    return { id: t.id, re: new RegExp(`${not}(?<![\\p{L}\\p{N}_-])${escape(w)}(?![\\p{L}\\p{N}_-])`, "iu") };
  });

export interface GlossPiece {
  text: string;
  term?: string;
}

/** Split plain text at the terms it mentions; each term at most once (`seen` is shared by the
 *  pieces of one block, so a sentence underlines a word only the first time). */
export function glossPieces(text: string, seen: Set<string>): GlossPiece[] {
  let best: { at: number; len: number; id: string } | null = null;
  for (const r of RULES) {
    if (seen.has(r.id)) continue;
    const m = r.re.exec(text);
    if (m && (best === null || m.index < best.at || (m.index === best.at && m[0].length > best.len))) {
      best = { at: m.index, len: m[0].length, id: r.id };
    }
  }
  if (!best) return text ? [{ text }] : [];
  seen.add(best.id);
  const out: GlossPiece[] = [];
  if (best.at > 0) out.push({ text: text.slice(0, best.at) });
  out.push({ text: text.slice(best.at, best.at + best.len), term: best.id });
  out.push(...glossPieces(text.slice(best.at + best.len), seen));
  return out;
}

/** The term a typeset symbol stands for (Ŝ, Û⁽¹⁾, |∅⟩ …), if any. */
export function termOfSymbol(src: string): string | undefined {
  return TERMS.find((t) => t.symbols?.test(src))?.id;
}
