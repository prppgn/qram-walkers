# The interface

The viewer shows trajectories computed by the Python engine (`qramsim`). Every number,
colour and position you see comes from the engine; the viewer only draws and
interpolates them. A run is chosen in **Setup**, computed by the engine, and then played
back tick by tick.

## The tree view {#ui-canvas}

The centre of the screen is the binary tree in the **unfolded "H" layout**:

* the **input port** is on the far left; walkers waiting to enter queue on the port
  line in front of it;
* the tree grows to the right, one column of edges per level $d = 1, \dots, n$; every
  edge $(d,l)$ is a row of sites (small dots) ending at a bifurcation, drawn as an
  $\hat S$ node;
* after level $n$ the edges end in the column of **memory cells**, one box per address
  $a_1 \dots a_n$. Each cell holds its memory lane, which the tree does not draw: a
  walker that reaches its cell slides behind the face of the box and disappears, one per
  tick, front first. The small squares in the box are the memory qubits $M_j$ (filled =
  stored bit 1, i.e. $\ket{R}$; empty = 0, i.e. $\ket{\varnothing}$); the
  [cell lens](#ui-lens) shows the inside of a cell;
* to the right of the cells the tree is drawn again as a **mirror image**: the output
  tree, with $\hat S^\dagger$ nodes and levels $d'$, ending at the **output port**.

Physically the train returns through the *same* tree it came from and leaves through
the input port (inverse routing is the exact time reversal of routing).
The unfolded view draws a walker moving backward at the mirror image of its position,
so the train flows left to right throughout and the picture matches the paper's
figures: the train disappears into the left face of its cell and, after the turn, comes
out of the right face, tail first, onto the mirrored tree. The [cell lens](#ui-lens)
shows the physical lane, where the train goes back the way it came. Untick **unfolded**
in the top bar to see the physical single tree instead.

The green bands are the windows of the address-transmission gates $\hat U^{(d)}$: the
whole edge, with the control site (where $A_d$ stands when the gate fires) circled.
When a gate fires the band flashes: bright where the control was red and the gate
acted, grey when it fired on the clock with no walker to control it.

A cell **lights up** as the first walker of a train slides into it, as brightly as the
weight $|\alpha|^2$ of the branches whose train it holds, and a badge counts the walkers
inside; it goes dark as the last one leaves. A cell that only dispersed address walkers
reach is shaded faintly in grey. The cell is outlined, pulsing, while a copy gate acts
in it; in cell-switch mode a lamp on the cell shows the switch $F$ (brightness =
probability that it is on). Click a lit cell to look inside it with the lens.

Walkers are discs: red $\ket{R}$, blue $\ket{B}$, with the letter inside for readers
who do not distinguish the colours. Empty slots ($\ket{\varnothing}$) are dashed grey
**ghosts**: they show where a walker *would* be and never influence the physics (toggle
**ghosts**). With several branches each branch is drawn separately, with opacity
proportional to $|\alpha|^2$ (or $|\alpha|$, top-bar menu), slightly offset, and with a
coloured **phase ring** whose hue is $\arg\alpha$. Click a branch in the ket panel or the
train strip to highlight it and dim the others.

In the backup variant the backups $\tilde A_i$, $\tilde D_j$ are smaller discs with a
white dot, and each 4-site edge shows the window of $\hat U_{in}$ (sites 3–2, orange) and
of $\hat U_B$ (sites 4–2, green); with the pipelining, windows of different levels flash
in the same tick. Tick **traces** to draw the paths already travelled by the address
walkers and see where the dispersed ones went.

In noisy runs a lost walker turns into a ghost at the tick of the loss, a stray walker
(created by a copy on an empty site) has a dashed ring in the noise colour, and a
collided branch is drawn grey with a ✕ where two walkers met; noise events appear in the
narration and the event log in the same colour.

Zoom with the mouse wheel, pan by dragging, double-click or **Fit** to see everything.
Edge lengths are proportional to the number of sites, or uniform (top-bar menu).

## The cell lens {#ui-lens}

When the train reaches a memory cell a box opens below the tree (beside it, if the
drawing is taller than wide), tied to the lit cell by a dashed line: the **cell lens**,
the inside of the cell drawn like the paper's figures of the copy.

* The lane runs left to right with its sites at the scale of the tree, from the entrance
  (on the left, towards the tree) to its end. Each walker arrives at the entrance in the
  tick in which it disappears into the cell on the tree.
* Below the lane sit the memory qubits $M_j$, each beside the site where $D_j$ rests
  during the query, with the stored state written inside; in cell-switch mode the switch
  $F$ sits beside the flag $D_0$, lit with the probability that it is on.
* Each copy flashes on its window and joins the memory qubit to the walker it acts on;
  the gate is named at the bottom of the lens. Where $b_j = 0$ the data walker $D_j$
  becomes an empty slot, drawn as a ghost (with **ghosts** ticked).
* After the turn the lens shows the physical lane: the train goes back the way it came
  and leaves through the entrance, tail first ([why](faq.md#faq-tail-first)), while the
  unfolded tree draws it leaving through the right face of the cell.
* In a superposition the lens shows the cell of the heaviest branches, with a tab for
  each cell reached (up to three), labelled with its weight $|\alpha|^2$. Click a tab, or
  highlight a branch in the ket panel, to look inside its cell. Branches whose trains
  are in the same cell share the lens; address walkers of other branches dispersed into
  the cell are drawn faint.
* Dual-rail cells have three rows: the $\uparrow$ lane, the auxiliary rail and the
  $\downarrow$ lane, where the data arrive and the
  [output circuit](variants.md#dualrail-output) moves the walkers that read 0. Qudit
  memory qubits read ○R or ●R.

Close the lens with its ×, or untick **cell lens** in the top bar; tick it again, or click
a lit cell, to bring it back. Drag the lens to move it; in figure mode the handle in its
corner resizes it. **Fit** frames the tree and the lens together, the SVG and PNG
exports include the lens when it is open, and the videos keep room for it throughout.

## Qudit walkers {#ui-qudit}

In the [qudit variants](variants.md#qudit) every slot holds a walker in every branch, so
there are no ghosts. The disc shows both components of the qudit:

* a **filled disc** is a logical 1 ($\bullet$), a **hollow disc** with a thick outline is
  a logical 0 ($\circ$);
* the colour, red or blue (fill or outline), is the routing colour, with the same meaning
  as in the other variants: a hollow blue disc is $\ket{\circ B}$, a filled red disc
  $\ket{\bullet R}$.

The kets and the train strip print the four states as ○R, ○B, ●R, ●B (the paper draws
them as hollow and filled circles in the routing colour). Two things to watch: in
`qudit_long`, the flash of $\hat U^{(d)}$ recolours only the walkers that share the logical
value of $A_d$; in a cell that stores 0, the copy turns the data walker from filled to
hollow without changing its colour ($\hat X^L$). The memory qubits are drawn as in the
other variants (filled square = bit 1); their tooltip and the
[cell lens](#ui-lens) give the stored state, $\circ R$ for 0 and $\bullet R$ for 1.

## Dual-rail trees {#ui-dualrail}

The [dual-rail variants](variants.md#dualrail) have two trees, drawn stacked: the
$\uparrow$ tree (logical 0) on top and the $\downarrow$ tree (logical 1) below, sharing the
column of memory cells. A walker is drawn on the tree of its rail, so the address bits
can be read off the picture: a walker on the upper tree is a 0, on the lower tree a 1.
Gate windows are drawn on both trees, and a window flashes on the tree where its gate
acted.

* The memory qubits are drawn in the $\downarrow$ cells: they sit beside the $\downarrow$
  lane, where the data arrive and the copy acts (filled square = bit 1; the tooltip gives
  the stored colour, $R$ for 0 and $B$ for 1).
* During the query a data walker that read 0 turns blue, hops to the auxiliary rail of
  the [output circuit](variants.md#dualrail-output) and one tick later lands on the
  $\uparrow$ lane, first blue and then red after $\hat X_c$. On the tree it moves from the
  $\downarrow$ cell to the $\uparrow$ one; the [cell lens](#ui-lens) shows the three rows.
* In `dualrail_backup` the backups are the small discs with a white dot, as in the backup
  variant; the two backups of a carrier stand at the same position on the two trees.

The kets print the rail before the colour, ↑R, ↓B, and the backup names carry their
tree, $\tilde A_1^\uparrow$, $\tilde A_1^\downarrow$.

## Playback {#ui-playback}

The engine simulates at tick resolution. A **tick** is one clock period: during routing
the clock-scheduled gates fire and then every walker moves one site (crossing a
bifurcation through $\hat S$); during the query nothing moves and the copy gates fire;
during inverse routing the motion is undone first (crossings through $\hat S^\dagger$)
and then the gates fire again. Between two frames the viewer interpolates positions and
shows colour changes at the moment they happen within the tick.

**Step by** chooses what one step means:

| mode | a step goes to |
|---|---|
| Tick | the next tick |
| Gate | the next tick in which a gate acted (tick **idle gates** to also stop where a gate fired with an absent control) |
| Level | the next time the leading walker crosses a bifurcation (the front slot during routing, the tail during inverse routing) |
| Phase | the start of the next phase |

The phase buttons jump to the start of routing, query and inverse routing; the counter
shows the tick of the current frame (frame "input" is the state before tick 0).

## Timeline {#ui-timeline}

The bar under the controls spans the whole run. Coloured bands are the phases (input,
routing, query, inverse routing); the dark ticks mark the gates that acted. Click or drag
to jump.

## Train strip {#ui-train}

The train strip shows the slots in a line, independent of the tree: one row per branch
(at most eight; with more branches click a ket to choose which one to show), in the
paper's order tail → front or in train order front → tail (the ket-order switch). It
makes long-range flips visible at a glance: after $\hat U^{(1)}$ fires with a red
$A_1$, every slot behind it changes colour at once even though the train spans the
whole first edge.

## Ket panel {#ui-kets}

The current state written in the paper's notation, one line per branch: amplitude,
then one ket per slot, $\ket{R^{d,l}}_{A_1}$ for a walker on edge $(d,l)$,
$\ket{\varnothing^{d}}$ for an empty slot (the level of its ghost; the vacuum has no
branch index), a prime $d'$ in the inverse phase, and `in` / `out` on the port line.
The order is the paper's (tail on the left, $A_1$ rightmost) or the train's; positions
can be hidden.

Below, **Paper checkpoints** lists the kets $\psi_{in}, \psi_1, \dots, \psi_Q, \dots, \psi_{out}$ exactly as the paper writes them. The paper describes the train as if it sat
on one level at a time; in the clocked simulation it spans several levels, so these are
*level-synchronous* states (each walker taken when it is on the level in question).
"Show" jumps to a tick where the checkpoint is visible.

## Export {#ui-export}

The **Export** button of the tree view saves what you see:

* **SVG**, paper or talk theme: the current frame as a vector image. The file carries its
  own styles, so it opens the same anywhere, whatever the theme of the page;
* **PNG**, paper or talk theme: the same image as a bitmap, three times the drawing size;
* **TikZ (.tex)**: the current frame as a standalone LaTeX file (`pdflatex` compiles it) with
  the tree, the gate windows, the cells (shaded where the train is) and the walkers on
  the tree, ready to edit for a paper; it has no lens;
* **Trajectory (.json)** and **Events (.csv)**: the whole run as data, in the formats of
  `qramsim run --out` and `qramsim export --format csv-events`.

From the command line, without opening the viewer, for any configuration `qramsim run`
accepts:

```bash
uv run qramsim figure --preset E2 --tick 5 --figure-mode --out fig.svg    # .svg, .png or .tex
uv run qramsim video --preset E2 --theme talk --duration 20 --out e2.mp4  # .mp4 or .gif
```

The video shows the tree, the phase bar, the current sentence and the kets, with the ticks
evenly spread over the duration and a pause on the first and last frame (`--hold`). Both
commands need a source checkout with the viewer's dependencies, Node, a browser (Chrome on
macOS) and, for videos, ffmpeg; they rebuild the viewer if its sources changed.

## Figure mode {#ui-figure}

The **figure** box prepares the drawing for a paper or a slide: every edge gets its label
$(d,l)$ (with $d'$ on the output tree), the ports become $|\psi_{in}\rangle$ and
$|\psi_{out}\rangle$, each branch (up to four) gets its ket next to its data walkers, the
gate flashes disappear, and the phase rings stay only if the branches have different
phases. The kets follow the order and the $(d,l)$ option of the ket panel. The
[cell lens](#ui-lens) stays: drag it where you want it and resize it from its corner.

The **orientation** menu draws the root on the left (default) or on top, like Fig. 1 of
the letter; the left child stays on the left. Dual-rail trees then stand side by side.

## Compare {#ui-compare}

**Compare** runs the same input and the same memory on another variant and draws the two
runs side by side, on one clock: at tick $t$ both show their state at tick $t$. Since the
variants have different depths, one finishes first and waits at the output, which shows
the difference at a glance; the badge of each side says when it finished. Each side also
shows its train length $K$, its total ticks and its fidelity. The current run stays as
it is; the comparison has its own clock and closes with **Close** or Esc. The noise of the
current run comes along: presence dephasing becomes logical dephasing on the qudit and
dual-rail variants, and a logical flip, which does not exist on the bosonic ones, is
dropped there, as the pane says.

## Without a server {#ui-static}

The viewer normally asks `qramsim serve` for the physics. The static site (`pnpm
build:static`, the folder `viewer/dist-static`) needs no server: the same Python engine
runs in your browser, in a background thread, through [Pyodide](https://pyodide.org). The
first visit downloads Python and numpy from Pyodide's public CDN (about 20 MB, then
cached) and shows its progress; so it needs a connection at least the first time. Results
are those of the installed engine; long runs and ensembles are slower.

## Phasors {#ui-phasors}

One disc per branch: the radius is $|\alpha|$, the arrow points at $\arg\alpha$. Ideal
gates are permutations, so amplitudes never change during a run: the phasors show the
input superposition carried by the walkers.

## Narration {#ui-narration}

Every event of the current tick explained in one sentence: which gate fired, on which
edges, in which branches it acted and on which walkers; which walker crossed which
bifurcation and where it went; injections, exits, phase changes. **Explain** opens the
guide at the definition of the gate or phase.

## Side panels {#ui-panels}

* **Phasors** — see above.
* **Metrics** — fidelity with the ideal qRAM output (Eq. 1), success, consistency,
  entanglement entropy, collided weight, and the readout of every output branch. In a
  noisy run: a summary of the noise (channels, seed, flipped memory bits, jittered gates)
  and the **ensemble** mode, which asks the engine for many trajectories and shows mean
  and standard error ([ensembles](noise.md#noise-ensembles)).
* **Resources** — what this run used (walkers, sites, gate activations, crossings,
  ticks) next to the paper's formulas for the variant.
* **Events** — the full event log, filterable; click a row to jump there.
* **Legend** — the glyphs used in the tree view.

## Event log {#ui-events}

All events of the run in a table (frame, tick, phase, kind, gate, branches, sentence).
Filter by kind, keep only gates that acted, or search the text; clicking a row moves
playback to that frame.

## Legend {#ui-legend}

The legend panel repeats the visual vocabulary: walker colours, ghosts, phase rings,
gate windows and flashes, $\hat S$ / $\hat S^\dagger$ nodes, memory qubits, cell
switches and the two ports.

## Setup {#ui-setup}

Open **Setup** (top left) to choose:

* the **variant** (*basic*, *backup*, *qudit short* and *long*, *dual-rail basic* and
  *backup*; see [Variants](variants.md#comparison)), the tree depth $n$ (address bits, up
  to 6 in the viewer) and the word length $m$ (up to 4), and the **copy mode** (basic,
  qudit and dual-rail basic: global copy controlled by $D_0$, or cell switch; backup and
  dual-rail backup: the backup copy, with the option to drop the backup(s) of the last
  data walker $D_m$);
* the **input superposition** with clickable bit boxes: one row per term, a modulus and
  a phase dial (snaps to multiples of $45^\circ$; hold Alt for free angles). Under each
  bit the encoding is shown: bit 0 is an empty slot $\ket{\varnothing}$, bit 1 a red
  walker $\ket{R}$ (qudit: $\ket{\circ R}$ / $\ket{\bullet R}$; dual-rail: $\ket{\uparrow, R}$ / $\ket{\downarrow, R}$). The normalised state is shown live; the engine merges repeated
  addresses and normalises. Quick presets: single address, uniform, GHZ, W, random;
* the **memory** (below);
* the **noise**: one card per channel with its probability, locations, targets and
  phases, plus the run seed and a re-roll button (see the [Noise](noise.md#noise-locations)
  page);
* options: staggered copies, skipping the query (routing immediately followed by the
  inverse — the output must equal the input), strict invariant checks, ghosts.

**Run** sends the configuration to the engine and loads the new trajectory. The
examples in the top bar (E1, E2, …) are the worked examples of the paper's appendix.

## Memory grid {#ui-memory}

A $2^n \times m$ grid of toggles: row $a$ holds the classical word $b^{(a)} = b_1 \dots b_m$ stored in cell $a$. Fill presets: zeros, ones, random, identity (cell $a$ stores
the $m$ least significant bits of $a$). You can also paste one word per line (`01`, or
`10,01` with the address first).

## Themes {#ui-themes}

**paper** is a light theme close to the paper's figures; **talk** is a dark,
high-contrast theme for projectors, with glowing flashes. The choice is remembered in
this browser.

## Keyboard {#ui-keyboard}

| key | action |
|---|---|
| Space | play / pause |
| → / ← | step forward / back in the current step mode |
| Shift + → / ← | step by level |
| Home / End | input / output state |
| ? | open this page |
| Esc | close the guide or the setup drawer |
