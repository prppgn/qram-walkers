# Every control {#controls}

Every button, field and menu of the interface, by where it is. Each one also has a tooltip;
the [Interface](ui.md#ui-canvas) page explains what the drawings mean.

## Top bar {#controls-topbar}

| control | what it does |
|---|---|
| **☰ Setup** | opens the [setup drawer](#controls-setup): architecture, input, memory, noise, options |
| **E1**, **E2**, **E1-switch**, **E3**, **E4**, **demo-uniform**, **qudit-short**, **dualrail** | run that [example](#controls-presets) at once; the tooltip says what it shows |
| **labels** | shows the slot names ($A_1$, $D_0$, …) beside the walkers |
| **ghosts** | draws the empty slots $\ket{\varnothing}$ as dashed circles; they never affect the physics |
| **traces** | draws the paths the address walkers have travelled, to see where the dispersed ones went |
| **cell lens** | opens the [cell lens](ui.md#ui-lens) when the train reaches a memory cell: the inside of the cell, its memory qubits and the copy; off: the cells only light up |
| **unfolded** | draws the return trip on a mirrored output tree, as in the paper's figures; off: the physical single tree |
| **figure** | [figure mode](ui.md#ui-figure): $(d,l)$ labels, kets near the train, no flashes |
| **horizontal** / **vertical** | root of the tree on the left, or on top like Fig. 1 of the letter |
| **proportional** / **uniform** | edge lengths proportional to their number of sites, or all levels equally long |
| **opacity ∝ \|α\|²** / **opacity ∝ \|α\|** | how strongly a branch is drawn according to its amplitude |
| **talk** / **paper** | switches between the dark theme, for projectors, and the light one; the choice is remembered |
| **Compare** | opens the [comparison](#controls-compare) of two variants |
| **? Guide** | opens this guide |

## Tree view {#controls-tree}

| control | what it does |
|---|---|
| wheel, drag, double-click | zoom, pan, fit the whole tree |
| **+**, **−** | zoom in and out |
| **Fit** | fits the whole tree in the view, with the cell lens |
| click on a lit cell | opens the [cell lens](ui.md#ui-lens) on that cell |
| lens: drag, tabs, **×** | moves the lens; shows the cell of another branch; closes the lens |
| lens corner (figure mode) | resizes the lens |
| **Export** | opens the [export menu](#controls-export) |
| **ⓘ** | opens the guide on the tree view |

## Export menu {#controls-export}

| control | what it does |
|---|---|
| **SVG, paper theme**, **SVG, talk theme** | this frame as a vector image; the file carries its own styles |
| **PNG, paper theme**, **PNG, talk theme** | this frame as a bitmap, three times the drawing size |
| **TikZ (.tex)** | this frame as a standalone LaTeX file you can edit |
| **Trajectory (.json)** | the whole run as data, the format of `qramsim run --out` |
| **Events (.csv)** | every event of the run, the format of `qramsim export --format csv-events` |

## Playback {#controls-playback}

| control | key | what it does |
|---|---|---|
| ⏮ | Home | goes to the input state |
| ◀ | ← | steps back, by the chosen step |
| ▶ / ⏸ | Space | plays or pauses |
| ▶︎\| | → | steps forward, by the chosen step |
| ⏭ | End | goes to the output state |
| **Tick** | | a step is one clock tick |
| **Gate** | | a step goes to the next tick in which a gate acted |
| **Level** | Shift + ← or → | a step goes to the next time the leading walker crosses a bifurcation |
| **Phase** | | a step goes to the start of the next phase |
| **idle gates** | | in Gate mode, also stops at gates that fired with no control walker to act on (they do nothing) |
| **speed** | | clock ticks per second during playback |
| **routing**, **query**, **inverse routing** | | jump to the start of that phase |
| counter | | the current tick and phase |
| timeline | | click or drag to jump; the bands are the phases, the dark marks the gates that acted |

## Narration and state {#controls-state}

| control | what it does |
|---|---|
| **▾** / **▸** on a panel | collapses or opens the panel |
| **Explain** | opens the guide at the definition of that event |
| **tail → front** / **front → tail** | order of the factors in the kets: the paper's, or the train's |
| **(d,l)** | shows or hides the position superscripts of the kets |
| a line of the state | highlights that branch in every view and dims the others; click again to undo |
| **Paper checkpoints** | opens the list of the paper's states $\psi_{in} \dots \psi_{out}$ |
| **Show** on a checkpoint | jumps to a tick where that state is visible |
| train strip, a row | highlights that branch |

## Side panels {#controls-panels}

**Phasors**, **Metrics**, **Resources**, **Events** and **Legend** choose the panel on the right.

| panel | control | what it does |
|---|---|---|
| Phasors | a disc | highlights that branch |
| Metrics | **runs** | how many noisy runs the ensemble averages (1–2000) |
| Metrics | **Run ensemble** | asks the engine for that many runs and shows mean and standard error; it needs active noise |
| Metrics | a row of the readout | highlights that branch |
| Events | **all kinds**, **gates**, **Ŝ / Ŝ†**, **inject + exit**, **phase + turn**, **noise** | shows only one kind of event |
| Events | **only gates that acted** | hides gates that fired with no effect |
| Events | **follow** | scrolls the table with the current frame during playback |
| Events | search field | filters by text: the sentence, a gate such as `U1`, a kind, or `tick 5` |
| Events | a row | jumps to that frame |

## Setup drawer {#controls-setup}

Nothing changes until you press **Run** at the bottom, which sends the configuration to the
engine and loads the result. **✕** or Esc closes the drawer and keeps your edits.

### Architecture

| control | what it does |
|---|---|
| **Variant** | **basic**, **backup**, **qudit, short range**, **qudit, long range**, **dual-rail, basic**, **dual-rail, backup**: see [Variants](variants.md#comparison) |
| **n** | tree depth: address bits, 1 to 6; the memory has $2^n$ cells |
| **m** | data bits per cell, 1 to 4 |
| **global copy** | one gate per cell, controlled by the flag walker $D_0$, copies the stored bits |
| **cell switch** | $D_0$ switches its cell on, the data are copied, the delimiter switches it off |
| **backup copy** | each data walker is copied under the control of the backup in front of it (backup variants) |

### Input superposition {#controls-input}

| control | what it does |
|---|---|
| **Uniform**, **GHZ**, **W**, **Random** | fill in that superposition; the button with a ket, such as $\ket{00}$, sets a single address |
| number beside Random | how many random addresses |
| bit boxes | click to toggle a bit of the address of that term; the walker it stands for is shown below |
| modulus field and slider | relative modulus of the term; the state is normalised for you |
| phase dial and field | phase of the term; the dial snaps to multiples of 45°, hold Alt for free angles |
| **✕** on a term | deletes the term |
| **+ Add term** | adds a term with the first unused address |

### Memory {#controls-memory}

| control | what it does |
|---|---|
| **zeros**, **ones**, **random**, **identity** | fill the memory; identity stores in cell $a$ the $m$ least significant bits of $a$ |
| **Import text…** | paste the memory: one line per cell, optionally `address,bits` |
| a bit of the grid | click to toggle that stored bit |

### Noise {#controls-noise}

A run is ideal until you add a channel. Choose a model, press **+ Add channel**; several
channels combine. The [Noise](noise.md#noise-families) page defines every model.

| control | what it does |
|---|---|
| model menu | the models of this variant: **Loss**, **Colour flip**, **Colour dephasing**, **Presence dephasing** (bosonic), **Logical dephasing**, **Logical flip** (qudit, dual-rail), **Depolarising**, **Scatter flip**, **Gate failure**, **Clock jitter**, **Copy error**, **Memory bit flip**, **Over-rotation**, **Beam-splitter imbalance** |
| **✕** on a card | removes the channel |
| sliders and fields | the error strength: $p$, $p_{early}$, $p_{late}$, $\epsilon$, $\eta$, $\sigma$, according to the model |
| **propagation**, **gate**, **memory**, **scattering**, **idle** | [where](noise.md#noise-locations) the channel acts |
| **all**, **address**, **data**, **backup**, **flag** | [which walkers](noise.md#noise-targets) it acts on |
| **routing**, **query**, **inverse** | in which phases it acts |
| **U**, **U_in**, **U_B** | which gates an over-rotation affects |
| **vacuum phase** | over-rotation on the bosonic variants: also gives an empty target the phase $e^{-i\theta}$ |
| **backward** (**reciprocal**, **adjoint**) | imbalance: how a walker crosses a node on the way back |
| **acts on** (**colour**, **logical**, **both**) | depolarising on the qudit and dual-rail variants |
| **Seed** | seed of the random draws: the same seed and configuration give the same run |
| **⟳ Re-roll** | draws a new seed |

### Options {#controls-options}

| control | what it does |
|---|---|
| **last data backup** | backup variants: keeps the backup(s) of the last data walker, which carry no information |
| **staggered copies** | copies the $m$ bits one per tick; off: all in one tick |
| **skip the query** | routing immediately followed by inverse routing: the output must equal the input |
| **strict** | the engine checks its invariants at every tick and fails loudly if one breaks |
| **record ghosts** | records where the empty slots would be, so that they can be drawn |
| **prune** | coherent errors: drops branches below this weight; the weight dropped is reported |
| **max branches** | coherent errors: keeps at most this many branches |

### Presets {#controls-presets}

**Load** fills the form so that you can edit it first; **Run** runs the preset as it is.

| preset | what it shows |
|---|---|
| **E1**, **E1b** | classical address 10 with stored bit 1, then 0 (arXiv appendix) |
| **E2** | entangled address $(\ket{00} + \ket{11})/\sqrt2$ (arXiv appendix) |
| **E1-switch** | E1 with the cell-switch copy |
| **E3** | backup variant: the chain of $\hat U_{in}$ and $\hat U_B$ |
| **E4** | backup variant, $n = 4$: gates of different levels fire in the same ticks |
| **backup-ghz** | backup variant on a GHZ address |
| **qudit-short**, **qudit-long** | the two qudit variants |
| **dualrail**, **dualrail-backup** | the two dual-rail variants |
| **noise-loss**, **noise-scatter**, **noise-stray** | one error at a time on the basic variant: a lost walker, a misrouted one, a stray and a collision |
| **noise-demo** | weak loss and dephasing on a superposition |
| **noise-qudit**, **noise-dualrail** | noise on the new alphabets: a loss shows at the output |
| **coherent-demo** | E2 with over-rotation and imbalance: branches split instead of jumping |
| **demo-uniform** | all eight addresses at once, $n = 3$, $m = 2$ |

## Compare {#controls-compare}

| control | what it does |
|---|---|
| **with** | the variant to compare with the current run; it runs at once |
| ⏮, ▶ / ⏸ | back to the input, and play or pause the shared clock |
| slider | the shared clock: drag to any tick |
| **speed** | ticks per second |
| **Close** | back to the main view (also Esc); the current run is untouched |

## User guide {#controls-guide}

The tabs choose the page: **Start**, **Protocol**, **Variants**, **Gates**, **Metrics**,
**Noise**, **Interface**, **Controls**, **Command line**, **FAQ**. **✕** or Esc closes it. **?** on the
keyboard opens the [list of keys](ui.md#ui-keyboard).
