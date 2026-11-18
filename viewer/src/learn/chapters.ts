// The chapters of Learn: the protocol told in plain words, one idea at a time, for readers who
// know qubits, gates and superpositions but not the paper. Each chapter animates a run the
// engine computed (src/learn/traj, n ≤ 2) and can load it into the simulator. The texts
// restate the user guide; they add no physics. [[id|text]] marks a glossary term (terms.ts);
// symbols such as A₁, |R⟩, Û⁽ᵈ⁾ are typeset.

export interface Formula {
  /** KaTeX source; \ket and \bra are available. */
  tex: string;
  /** One line of words under it (symbols typeset). */
  note: string;
}

export interface Clip {
  /** File of src/learn/traj, without .json. */
  traj: string;
  /** Frames looped by the animation (inclusive). */
  from: number;
  to: number;
  /** Show the cell lens. */
  lens?: boolean;
}

export interface Chapter {
  id: string;
  title: string;
  /** Paragraphs, 150–300 words in all. */
  body: string[];
  formulas: Formula[];
  clip: Clip;
  /** What "Try it in the simulator" loads: the clip's run, under this preset name if it is one. */
  tryIt: { traj: string; preset: string | null };
  /** The page of the user guide that says more. */
  guide: string;
}

const EQ1 = "\\sum_a \\alpha_a \\ket{a}_A \\ket{0}_D \\;\\xrightarrow{\\text{qRAM}}\\; \\sum_a \\alpha_a \\ket{a}_A \\ket{b^{(a)}}_D";

export const CHAPTERS: Chapter[] = [
  {
    id: "why",
    title: "Why a quantum RAM",
    body: [
      "A classical memory takes an address and returns the bits stored there. Many quantum algorithms, from database search to quantum machine learning, need more: they must read the memory at a superposition of addresses. Given the state Σ_a α_a |a⟩, a [[qram|quantum RAM]] has to return Σ_a α_a |a⟩|b⁽ᵃ⁾⟩, every address paired with its own data, in one go and without learning which address was asked. The memory content itself is classical; only the address and the answer are quantum.",
      "Building such a device is hard. The best-known design, the bucket brigade, needs a number of active nodes that grows exponentially with the number n of address bits. The design simulated here, proposed in arXiv:2508.02855, uses instead a few quantum particles, the walkers, whose number grows only linearly with n and with the number m of bits per cell. The walkers travel through a single binary tree whose leaves are the memory cells: they carry the address down, pick up the stored bits and bring them back.",
      "The animation shows the example E2. The address is a superposition of two addresses, 00 and 11, so the train of walkers splits and reads two cells at once; at the end the two branches leave the tree together, each carrying the bit of its own cell. Every colour and every number you see comes from an exact simulation of the protocol. The next chapters take the run apart, one idea at a time.",
    ],
    formulas: [
      { tex: EQ1, note: "What a qRAM does, Eq. (1): N = 2ⁿ cells, addresses a = a₁ … aₙ, m classical bits b⁽ᵃ⁾ in each cell." },
      {
        tex: "\\tfrac{1}{\\sqrt 2}\\big(\\ket{00} + \\ket{11}\\big)_A \\ket{0}_D \\;\\to\\; \\tfrac{1}{\\sqrt 2}\\big(\\ket{00}_A \\ket{1}_D + \\ket{11}_A \\ket{0}_D\\big)",
        note: "The example E2: cell 00 stores 1, cell 11 stores 0.",
      },
    ],
    clip: { traj: "E2", from: 0, to: 23 },
    tryIt: { traj: "E2", preset: "E2" },
    guide: "overview",
  },
  {
    id: "walkers",
    title: "Walkers on a tree",
    body: [
      "The memory has 2ⁿ cells, the leaves of a [[tree|binary tree]] with n levels, and each cell stores m classical bits. Particles called [[walker|walkers]] enter the tree at its root, the [[port|input port]], and move one site per tick of a global clock. Each walker has an internal two-level state, its [[colour]]: red |R⟩ or blue |B⟩.",
      "The walkers travel as a [[train]] in a fixed order. In front come the n [[address-walker|address walkers]] A₁ … Aₙ, one per address bit. The address is written by presence: if aᵢ = 1, Aᵢ is a red walker; if aᵢ = 0, its place in the train is [[empty]], |∅⟩. Behind them come the [[flag]] D₀ and the m [[data-walker|data walkers]] D₁ … Dₘ, all red: they are the blank page on which the memory will write its answer.",
      "So the train has n + m + 1 places, and how many walkers it carries depends on the address: the address 00 … 0 sends no address walker at all. All the walkers move together, so their order and spacing never change. In the drawing an empty place is a dashed circle, a [[ghost]], which only keeps the empty place visible; it plays no part in the physics.",
      "The animation shows the example E1, with n = 2 and m = 1. The address is a = 10: A₁ is red, A₂ is empty, then come D₀ and D₁. Watch the train enter the tree from the input port on the left, one site per tick.",
    ],
    formulas: [
      { tex: "a_i = 0 \\mapsto \\ket{\\varnothing}_{A_i}, \\qquad a_i = 1 \\mapsto \\ket{R}_{A_i}", note: "The address is written by presence." },
      {
        tex: "\\ket{\\psi_{in}} = \\sum_a \\alpha_a \\ket{R}_D^{\\otimes (m+1)} \\ket{a}_A, \\qquad K = n + m + 1",
        note: "The input: D₀ … Dₘ all red, the |0⟩_D of Eq. (1); K places in the train.",
      },
      { tex: "\\ket{R}_{D_1}\\ket{R}_{D_0}\\ket{\\varnothing}_{A_2}\\ket{R}_{A_1}", note: "The input of E1, written from the tail to the front as in the paper." },
    ],
    clip: { traj: "E1", from: 0, to: 6 },
    tryIt: { traj: "E1", preset: "E1" },
    guide: "train",
  },
  {
    id: "turn",
    title: "Colour decides the turn",
    body: [
      "At every [[bifurcation]] of the tree sits the same passive device, the [[S|scattering gate Ŝ]]. It reads the colour of each walker that crosses: a red walker goes into the left branch, which stands for bit 0; a blue walker goes into the right branch, bit 1, and is turned red again on the way. In the drawing the left branch is drawn above and the right branch below.",
      "Ŝ has no control and no clock. It acts on every walker that leaves an edge, whatever the other walkers are doing. With light it would be a polarising beam splitter, the two colours being two polarisations, followed by a wave plate on the right output so that both outputs leave red. The colour is therefore a one-time instruction: it says which way to turn at the next bifurcation and is used up there.",
      "An empty place has no colour and simply passes; its ghost is drawn along the path a red walker would take. Since every walker leaves a bifurcation red, a walker that must turn right at the next level has to be made blue again before it gets there. That is the job of the address walkers, the subject of the next chapter.",
      "In the animation (E1) the red address walker A₁ reaches the first bifurcation and goes left. The flag D₀ and the data walker D₁ arrive blue, go right and turn red; at the second bifurcation they are red and go left, into the cell of address 10.",
    ],
    formulas: [
      {
        tex: "\\hat S \\ket{R^{d,l}} = \\ket{R^{d+1,\\,2l-1}}, \\qquad \\hat S \\ket{B^{d,l}} = \\ket{R^{d+1,\\,2l}}, \\qquad \\hat S \\ket{\\varnothing^{d}} = \\ket{\\varnothing^{d+1}}",
        note: "Edge (d,l) ends at bifurcation (d,l); its children are (d+1, 2l − 1), the left branch, and (d+1, 2l), the right branch.",
      },
    ],
    clip: { traj: "E1", from: 4, to: 11 },
    tryIt: { traj: "E1", preset: "E1" },
    guide: "gate-S",
  },
  {
    id: "instruct",
    title: "The address walker instructs the others",
    body: [
      "Ŝ only reads colours, so the address must be turned into colours. This is done by the [[U|address-transmission gate Û⁽ᵈ⁾]], which sits on every edge of [[level]] d of the tree. A global [[clock]] fires it at a fixed tick, on all the edges of its level at once, when the address walker A_d has reached the end of its edge and every walker behind it is on the same edge.",
      "The rule is simple. If A_d is red, that is a_d = 1, Û⁽ᵈ⁾ flips the colour of every walker behind it: red becomes blue, and Ŝ will send them into the right branch. If A_d is absent, a_d = 0, the gate does nothing: the walkers stay red and turn left. The walkers ahead of A_d are never touched. Either way, the group that carries the data turns right exactly where the address has a 1.",
      "After n levels the data walkers stand in the cell whose address is a. And the address walkers? A red A_d is not flipped by its own gate, so it turns left at its bifurcation and keeps going left, since no later gate is meant for it. It ends up resting in another cell, its job done, and is picked up again on the way back.",
      "In the animation (E1) A₁ is red: when Û⁽¹⁾ fires, D₀ and D₁ turn blue and then take the right branch. A₂ is empty, so Û⁽²⁾ does nothing and they take the left branch: right, then left, spells 10, the address.",
    ],
    formulas: [
      {
        tex: "\\hat U^{(d)}(T_d \\vert A_d) = \\sum_{c \\in \\{\\varnothing, R, B\\}} \\hat V^{(T_d)}_c \\otimes \\ket{c}\\bra{c}_{A_d}, \\qquad \\hat V^{(T_d)}_R = \\bigotimes_{j \\in T_d} \\hat X_j, \\quad \\hat V^{(T_d)}_B = \\hat V^{(T_d)}_\\varnothing = \\hat I",
        note: "T_d is the set of walkers behind A_d; X̂ swaps red and blue.",
      },
      {
        tex: "l = 1 + \\sum_{i=1}^{n} a_i\\, 2^{\\,n-i}",
        note: "The cell the data walkers reach: cell 1 is 00 … 0; for n = 2 the address 10 is cell 3.",
      },
    ],
    clip: { traj: "E1", from: 3, to: 10 },
    tryIt: { traj: "E1", preset: "E1" },
    guide: "gate-U",
  },
  {
    id: "read",
    title: "Reading a memory cell",
    body: [
      "When the routing ends the train stops: nothing moves during the [[query]]. The flag D₀ and the data walkers rest in the cell of the address, each next to one stored bit; any address walker that turned left rests in some other cell. Each [[cell]] keeps its bits b₁ … bₘ in classical memory elements, which never change.",
      "The [[copy|copy gates]] now fire in every cell at once, but they act only where the flag D₀ is present and red. That confines the reading to the addressed cell: in a cell that holds only an address walker, the places of D₀ and of the data walkers are empty and nothing happens. Where D₀ is, the copy reads one bit per tick: if b_j = 1 the data walker D_j stays red; if b_j = 0 it is erased, and its place becomes empty, |∅⟩.",
      "So after the query the data walkers spell the stored bits with the same convention as the address: a red walker for 1, an empty place for 0. The copy fires in every cell at once, so it works just as well on a superposition: in each branch it reads the cell that branch reached.",
      "The animation shows the example E1b, the same address 10 with the stored bit 0. The [[lens]] beside the tree shows the inside of the cell: when the copy fires, D₁ disappears and leaves a ghost. In E1, where the stored bit is 1, D₁ stays red.",
    ],
    formulas: [
      {
        tex: "\\hat U^{(a)}_{copy} = \\ket{R}\\bra{R}_{D_0} \\otimes \\bigotimes_{j=1}^{m} \\hat U^{loc}_{copy}(D_j \\vert M^{(a)}_j) + \\big(\\ket{\\varnothing}\\bra{\\varnothing} + \\ket{B}\\bra{B}\\big)_{D_0} \\otimes \\hat I",
        note: "The copy in cell a: it acts only where the flag D₀ is red.",
      },
      {
        tex: "b_j = 1:\\ \\ket{R}_{D_j} \\mapsto \\ket{R}_{D_j}, \\qquad b_j = 0:\\ \\ket{R}_{D_j} \\mapsto \\ket{\\varnothing}_{D_j}",
        note: "The local copy on a red data walker: kept for 1, erased for 0. The gate is its own inverse.",
      },
    ],
    clip: { traj: "E1b", from: 10, to: 14, lens: true },
    tryIt: { traj: "E1b", preset: "E1b" },
    guide: "query",
  },
  {
    id: "return",
    title: "Coming back: time reversal",
    body: [
      "The data walkers now hold the answer, but they are still in the tree, and where they are still depends on the address. To hand the answer back, the qRAM runs the routing backwards: the [[return|inverse routing]] is its exact time reversal. Every walker reverses its direction and every gate is undone in the reverse order, so the train comes back tail first along the very same path.",
      "On the way back the bifurcations act as Ŝ†: they merge the two branches into their parent edge, and a walker that comes from the right branch turns blue. The address-transmission gates fire again, at the mirror-image ticks. When an address walker A_d that had turned left reaches the end of its edge, its former followers, now blue, arrive behind it at the same moment; Û⁽ᵈ⁾ turns them red again and the train is whole once more. Nobody has to collect the address walkers: they are picked up automatically.",
      "At the end every walker leaves by the port, in its place in the train, and the tree is empty again. Only the data walkers have changed: they carry the stored bits, the answer of the qRAM.",
      "The drawing shows the way back on a mirror image of the tree, ending at the output port on the right, as in the paper's figures; physically there is one tree, and the output port is the input port. In the animation (E1) D₁ and D₀ come back from the right branch, turn blue at the first bifurcation, and turn red again when A₁ arrives.",
    ],
    formulas: [
      {
        tex: "\\hat S^\\dagger \\ket{R^{d+1,\\,2l-1}} = \\ket{R^{d,l}}, \\qquad \\hat S^\\dagger \\ket{R^{d+1,\\,2l}} = \\ket{B^{d,l}}",
        note: "Ŝ† merges the branches; the colour records that the walker came from the right branch.",
      },
      {
        tex: "\\text{inverse tick } \\tau \\text{ undoes forward tick } t = T_{fwd} - 1 - \\tau, \\qquad \\hat U^{(d)\\dagger} = \\hat U^{(d)}",
        note: "The routing is replayed backwards; Û⁽ᵈ⁾ is its own inverse.",
      },
      { tex: "T_{total} = 2\\,T_{fwd} + T_q", note: "The whole run: routing, query, return." },
    ],
    clip: { traj: "E1", from: 12, to: 23 },
    tryIt: { traj: "E1", preset: "E1" },
    guide: "inverse",
  },
  {
    id: "superposition",
    title: "Superpositions of addresses",
    body: [
      "So far the address was a single one. The real use of a qRAM is a [[superposition]] of addresses, Σ_a α_a |a⟩. Nothing in the protocol changes: every gate is a fixed operation that does not depend on the address, so by linearity the run acts on each term of the superposition separately and adds up the results.",
      "Each term is a [[branch]] of the state, labelled by its address. In the branch of address a the train goes to cell a, reads b⁽ᵃ⁾ and comes back; all the branches move on the same clock, through the same tree, at the same time. The drawing overlays them: a cell lights up for every address of the superposition, and a walker is drawn more or less opaque according to the weight |α_a|² of the branches it belongs to.",
      "At the end the branches come back together at the port, and the output is Σ_a α_a |a⟩|b⁽ᵃ⁾⟩: each address paired with its own data, with the original amplitudes. This is Eq. (1). The simulator follows every branch exactly and compares the output with Eq. (1): without noise the fidelity is 1 for every input and every memory content.",
      "The animation runs the four addresses 00, 01, 10 and 11 with equal amplitudes, with n = 2 and one bit per cell (the cells store 1, 0, 1, 1). The train splits at the first bifurcation and again at the second, reaches all four cells at once, and recombines on the way back.",
    ],
    formulas: [
      {
        tex: "\\ket{\\psi_{out}} = \\sum_a \\alpha_a \\ket{R}_{D_0} \\bigotimes_{j=1}^{m} \\ket{b^{(a)}_j}_{D_j} \\ket{a}_A, \\qquad \\ket{0} \\equiv \\ket{\\varnothing},\\ \\ket{1} \\equiv \\ket{R}",
        note: "The ideal output in the walkers' encoding.",
      },
      {
        tex: "F = \\lvert \\langle \\psi_{ideal} \\vert \\psi_{out} \\rangle \\rvert^2",
        note: "The fidelity, for normalised states: 1 in every ideal run.",
      },
      {
        tex: "\\tfrac12 \\sum_{a} \\ket{a}_A \\ket{0}_D \\;\\to\\; \\tfrac12 \\sum_{a} \\ket{a}_A \\ket{b^{(a)}}_D, \\qquad a \\in \\{00, 01, 10, 11\\}",
        note: "The input and output of the animation.",
      },
    ],
    clip: { traj: "uniform-n2", from: 0, to: 23 },
    tryIt: { traj: "uniform-n2", preset: null },
    guide: "kets",
  },
  {
    id: "noise",
    title: "When things go wrong: noise",
    body: [
      "A real device is not perfect. A photon can be absorbed, a colour can flip, a bifurcation can send a walker the wrong way, a gate can fail. In the simulator each of these imperfections is a [[noise]] model: a quantum channel acting on one walker at a time, with a probability p that you choose in Setup, at the places and in the phases you choose.",
      "A noisy run is simulated one random history at a time, the method of quantum jumps. At every opportunity the engine draws whether the error happens; when it does, the event appears in the narration in the noise colour. Averaging many runs, the ensemble mode, reproduces the full noisy evolution. Even when no jump happens the state changes a little, because not seeing an error is also information.",
      "The animation shows the simplest case, the example noise-loss: E1 with the data walker D₁ certainly [[loss|lost]] at its first bifurcation. Its place becomes empty, drawn as a ghost from then on. In the cell the stored bit is 1, but the copy finds D₁ missing, and at the output its empty place reads 0. The output looks well formed but is wrong, and the fidelity drops to 0.",
      "This is the weak point of writing a 0 as an empty place: a lost walker and a 0 look the same. The variants of the next chapter that keep a walker in every place, qudits and dual-rail, can notice a loss.",
    ],
    formulas: [
      {
        tex: "\\hat K_0 = \\ket{\\varnothing}\\bra{\\varnothing} + \\sqrt{1-p}\\,\\big(\\ket{R}\\bra{R} + \\ket{B}\\bra{B}\\big), \\quad \\hat K_1 = \\sqrt{p}\\,\\ket{\\varnothing}\\bra{R}, \\quad \\hat K_2 = \\sqrt{p}\\,\\ket{\\varnothing}\\bra{B}",
        note: "The loss of one walker, with probability p; Σᵢ K̂ᵢ†K̂ᵢ = Î.",
      },
      {
        tex: "p_i = \\lVert \\hat K_i \\ket{\\psi} \\rVert^2, \\qquad \\ket{\\psi} \\to \\hat K_i \\ket{\\psi} / \\sqrt{p_i}",
        note: "A quantum jump: the outcome i is drawn with probability pᵢ.",
      },
    ],
    clip: { traj: "noise-loss", from: 0, to: 23 },
    tryIt: { traj: "noise-loss", preset: "noise-loss" },
    guide: "noise",
  },
  {
    id: "variants",
    title: "Six ways to build it: the variants",
    body: [
      "The paper proposes six [[variant|variants]] that share the routing idea: an address walker steers the walkers behind it, and a passive gate routes them by colour. They differ along two lines.",
      "The first is the reach of the gates. In the long-range variants Û⁽ᵈ⁾ couples A_d to every walker behind it at once, a gate with many targets. The short-range variants break it into gates on at most three neighbouring walkers. The basic short-range variant does it with [[backup|backup walkers]]: each walker is followed by a backup, and a blue backup flips the next walker and its backup, which two ticks later does the same: the bit hops down the train two walkers at a time. The train is twice as long, but every gate is local, and the time of a query grows only linearly with n and m, which is optimal.",
      "The second is what carries a 0. In the bosonic variants a 0 is an empty place. The [[qudit]] variants use four-level walkers, with a logical value ○ or ● besides the colour; the [[dualrail|dual-rail]] variants use two trees, one for 0 and one for 1. In both a walker is always present, so a loss can be detected, at the price of richer walkers or of a second tree. The qudit short-range variant needs no backups at all.",
      "That makes six: basic and backup, qudit long and short range, dual-rail basic and backup. The animation shows E3, the backup variant with a = 10: watch the blue colour hop down the train two walkers at a time.",
    ],
    formulas: [
      {
        tex: "\\begin{array}{lll} \\text{variant} & \\text{walkers} & \\text{depth} \\\\ \\hline \\text{basic, long range} & \\le n+m & n^2/2 + nm + \\mathcal O(n+m) \\\\ \\text{basic, short range (backup)} & \\le 2(n+m) & 10n + 4m \\\\ \\text{qudit, long range} & n+m & n^2/2 + nm + \\mathcal O(n+m) \\\\ \\text{qudit, short range} & n+m & 5n + 2m \\\\ \\text{dual-rail, long range} & n+m & n^2/2 + nm + \\mathcal O(n+m) \\\\ \\text{dual-rail, short range} & 3(n+m) & 13n + 7m \\end{array}",
        note: "The paper's comparison of the six variants (walkers up to constant terms).",
      },
      {
        tex: "\\hat U_{in}(\\tilde A_d \\vert A_d), \\qquad \\hat U_B(W_{i+1}, \\tilde W_{i+1} \\vert \\tilde W_i)",
        note: "The two short-range gates of the backup variant: a red A_d turns its backup blue, and a blue backup flips the next walker and its backup.",
      },
    ],
    clip: { traj: "E3", from: 0, to: 32 },
    tryIt: { traj: "E3", preset: "E3" },
    guide: "comparison",
  },
  {
    id: "next",
    title: "Where to go next",
    body: [
      "You have seen the whole protocol: the address written in walkers, Ŝ and Û⁽ᵈ⁾ steering the train, the copy in the cell, the way back, and what noise does to it. The simulator lets you try all of it.",
      "Examples, in the top bar, holds ready-made runs, each described in one line. Setup chooses the variant, the sizes n and m, the amplitudes of the addresses, the memory content and the noise; Run computes the run. In Advanced mode the state is written as kets, branch by branch, and the panels show the [[fidelity]], the resources and every event; Compare runs the same input on another variant beside the first, on one clock. Export saves the current frame as SVG, PNG or TikZ, and the whole run as JSON or as a table of events.",
      "The Guide explains every gate, variant, noise model and metric, with the formulas in the paper's notation. Any underlined word, here and in the simulator, shows a short definition; a click on it opens the guide where it is defined. The paper, arXiv:2508.02855, gives the derivations and the full resource analysis.",
      "The animation shows E2 on the dual-rail variant: two trees, ↑ for 0 and ↓ for 1, with every walker on one of them. In cell 11 the stored bit is 0, so the data walker moves from the ↓ tree to the ↑ tree and comes back on it. Try it, then switch to Advanced and press Compare to watch it beside another variant.",
    ],
    formulas: [
      {
        tex: "F = \\frac{\\lvert \\langle \\psi_{ideal} \\vert \\psi_{out} \\rangle \\rvert^2}{\\langle \\psi_{ideal} \\vert \\psi_{ideal} \\rangle \\, \\langle \\psi_{out} \\vert \\psi_{out} \\rangle}",
        note: "The fidelity the Metrics panel reports.",
      },
      {
        tex: "a_i = 0 \\mapsto \\ket{\\uparrow, R}_{A_i}, \\qquad a_i = 1 \\mapsto \\ket{\\downarrow, R}_{A_i}",
        note: "The dual-rail encoding: the bit is the tree a walker is on.",
      },
    ],
    clip: { traj: "dualrail", from: 0, to: 26 },
    tryIt: { traj: "dualrail", preset: "dualrail" },
    guide: "dualrail",
  },
];

export const CHAPTER_BY_ID: Record<string, Chapter> = Object.fromEntries(CHAPTERS.map((c) => [c.id, c]));

/** The page that lists the glossary, beside the chapters. */
export const GLOSSARY_PAGE = "glossary";
