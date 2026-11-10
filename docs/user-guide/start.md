# Getting started

This program simulates the **quantum-walker quantum RAM** of De Riso, Catalano, Lloyd,
Giovannetti and De Santis (arXiv:2508.02855), and shows it working, one clock tick at a time.
A train of walkers carries a superposition of addresses down a binary tree, picks up the
stored bits at the memory cells and comes back coherently. You need to know quantum
information, not the paper: the [Protocol](protocol.md#overview) page explains the rest.

The guide cites two papers: the letter arXiv:2508.02855, as *the paper*, and a longer
companion with the gate tables of every variant, the *technical paper* (in preparation), as
"technical paper, §Section" or "technical paper, Eq. (label)".

## A two-minute tour {#start-tour}

1. Click **E1** in the top bar: a classical address, $a = 10$. On the left of the tree the train
   waits at the input port.
2. Press **Space**. The train enters, the walkers change colour, the train splits at the
   bifurcations, the data walker reaches cell $10$, reads the stored bit and everything comes
   back. Press Space again to pause.
3. Press **Home** and then **→** a few times: each step stops at the next gate that acted, and
   the **Narration** panel says in words what happened. **Explain** opens the definition of
   that gate here in the guide. The **State** panel shows the ket, in the paper's notation.
4. Click **E2**: now the address is $(\ket{00} + \ket{11})/\sqrt2$. Each branch is drawn separately;
   click a line in the State panel to highlight one branch and dim the other.
5. Open **☰ Setup** and change anything: the variant, the address bits, the memory, the noise.
   **Run** at the bottom computes it.
6. Click **Compare** to watch the same input on another variant, on one clock.

Every number and position you see is computed by the simulation engine; the interface only
draws them.

## How to get help {#start-help}

* **Hover** over any control: a tooltip says what it does.
* **ⓘ** next to a panel or a control opens the guide at the right place.
* **Explain** in the Narration panel opens the definition of what just happened.
* The [Controls](controls.md#controls) page describes every button, field and menu.

## I want to… {#start-tasks}

| I want to… | go to |
|---|---|
| understand the protocol | [Protocol](protocol.md#overview) |
| know what a gate does | [Gates](gates.md#summary) |
| see how the six variants differ | [Variants](variants.md#comparison) |
| set my own address superposition | Setup, [input superposition](controls.md#controls-input) |
| set the contents of the memory | Setup, [memory](controls.md#controls-memory) |
| add noise, and average over many runs | Setup, [noise](controls.md#controls-noise), then [ensembles](noise.md#noise-ensembles) |
| read the results | [Metrics](metrics.md#fidelity) |
| compare two variants | [Compare](ui.md#ui-compare) |
| save a figure for a paper or a talk | [Export](ui.md#ui-export) and [figure mode](ui.md#ui-figure) |
| make a video, or run many simulations | [Command line](cli.md#cli) |
| understand a surprising result | [FAQ](faq.md) |
