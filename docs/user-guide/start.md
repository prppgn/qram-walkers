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

The program opens in **Simple** mode on the example **E1**: a classical address, $a = 10$,
and one stored bit per cell. On the left of the tree the train waits at the input port.
The [tutorial](#start-tutorial) shows the same things on the screen itself; or, by hand:

1. Press **Space** (or ▶). The train enters, the walkers change colour, the train splits at
   the bifurcations. Playback stops at the key moments (the end of each level, the query,
   the return, the end) with a note under the tree; **Space** continues. The data walker
   reaches cell $10$, reads the stored bit and everything comes back.
2. The **Narration** log on the right keeps every sentence so far, under the headers
   **Level 1**, **Level 2**, **Query**, **Return**. Click a line to go back to that tick;
   **Explain** opens the definition of that gate here in the guide.
3. Press **←** and **→**: each step goes to the previous or next gate that acted.
   **Details** → **State** shows the quantum state of the walkers, in the paper's notation.
4. In **Examples** choose **E2**: now the address is $(\ket{00} + \ket{11})/\sqrt2$. Each
   branch is drawn separately.
5. Open **☰ Setup** and change anything: the variant, the address bits, the memory, the noise.
   **Run** at the bottom computes it.
6. Switch to **Advanced** in the top bar to see every panel at once, the step modes and
   **Compare**, which plays the same input on another variant, on one clock.

Every number and position you see is computed by the simulation engine; the interface only
draws them.

## The tutorial {#start-tutorial}

A guided tour of the interface in eight steps, on the example E1: the tree and its ports,
the train and its colours, the scattering gate $\hat S$, the address-transmission gate
$\hat U^{(d)}$, the memory cells and the lens, the caption and the narration, the playback
controls, and where to go next. Each step dims the window except the part it talks about
and moves the run to the moment it describes. **Got it**, at the end, plays E1 from the
start with pauses at the key moments.

It is offered by itself on the first visit; afterwards **Tutorial** in the top bar, in
either mode, or this link takes it again: [take the tutorial](#start-tutorial). It runs in
Simple mode and loads E1. The [Controls](controls.md#controls-tutorial) page lists its
buttons and keys.

## How to get help {#start-help}

* **Hover** over any control: a tooltip says what it does.
* **ⓘ** next to a panel or a control opens the guide at the right place.
* **Explain** in the Narration log opens the definition of what just happened.
* [Simple and Advanced](ui.md#ui-modes) explains the two modes of the interface.
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
