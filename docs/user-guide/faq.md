# Frequently asked questions

## Why do the address walkers end up in cells other than the addressed one? {#faq-dispersed}

Each address walker steers only the walkers behind it. $\hat U^{(d)}$ flips the colour of
the followers of $A_d$, never of $A_d$ itself: when $a_d = 1$ the followers turn blue and
$\hat S$ sends them right, while $A_d$, still red, goes left. From then on $A_d$ is ahead
of every later control, so no gate targets it again; it stays red, takes the left branch
at every following node and comes to rest in the cell $a_1 \dots a_{d-1} 0 \dots 0$. Only
the data group is guaranteed to reach the addressed cell (technical paper, §General functioning).
Nothing is lost: on the way back $A_d$ retraces its path and meets its former followers
again at level $d$, where it controls $\hat U^{(d)}$ once more
([recollection](protocol.md#inverse)). In preset E1 ($a = 10$) the data reach cell $10$
while $A_1$ rests in cell $00$.

## Why does the train come back tail-first? {#faq-tail-first}

Because inverse routing is the exact adjoint of routing: the simulator
replays the forward dynamics backwards in time, like a film run in reverse, so the last
walker in is the first one out, every walker retraces its own path and meets the same
gates at the same sites in reverse order. This makes the recollection of the dispersed
address walkers automatic, and it is the reading that also works for the short-range
variants, where a front-first replay of the decomposed gates would leave the data walkers
blue. The output port is therefore the input port. The
[cell lens](ui.md#ui-lens) shows it inside the cell: after the turn the train goes back
along its lane and leaves through the entrance, the last walker in first.

## Is the output tree on the right a second tree? {#faq-mirrored-tree}

No. The paper's figures draw the return trip on a mirror image of the input tree, and the
viewer's default unfolded "H" layout does the same so that the pictures match: during the
inverse phase every walker is drawn at the mirror image of its real position. Physically
there is a single tree and the walkers come back through the sites they used on the way
in. Switch to the single-tree layout to see the physical picture.

## What are the grey dashed circles? {#faq-ghosts}

Ghosts of empty slots. An address bit 0, or a data bit erased by the copy, is a slot with
no walker; the ghost marks where that slot's walker would be: it moves with the clock and
is flipped and scattered as a walker in that slot would be. Ghosts are for display only:
they never act as controls, and branches that differ only in ghost data are the same
branch. They can be hidden ([details](protocol.md#ghosts)).

## Why is ∅ a logical state? {#faq-vacuum}

In the basic variant a 0 is encoded by the absence of a walker in its slot
(technical paper, Eq. (addressencoding)): $a_i = 0 \mapsto \ket{\varnothing}$, $a_i = 1 \mapsto \ket{R}$,
and a data bit 0 is produced by the copy erasing the data walker. The slot (a time bin of
the train) exists either way, and $\ket{\varnothing}$ is a basis state of its Fock space
that can be superposed with $\ket{R}$. Consequences:

* $\hat U^{(d)}$ with an empty control is the identity, so "no walker" is a definite
  instruction: the followers stay red and go left (bit 0);
* a superposition of addresses is a superposition of different particle numbers, which
  the paper notes as demanding for experiments and as a motivation for the
  particle-conserving dual-rail and qudit variants;
* losing a walker turns a logical 1 into a valid-looking logical 0.

## Why is there a flag walker D₀ (and a delimiter Dₘ₊₁)? {#faq-flag}

The copy gates sit in every cell and fire on the clock, because the hardware does not
know which cells the input addresses. They must act only where the data walkers arrived.
$D_0$ travels with the data and always arrives in the lane red, so "red $D_0$ on the
control site" holds exactly in the addressed lane(s); the dispersed address walkers rest
in other lanes and at other sites, so they cannot trigger a copy. In the cell-switch mode
$D_0$ switches the cell on and $D_{m+1}$, at the tail, switches it off again
([global copy](variants.md#copy-global), [cell switch](variants.md#copy-cell-switch)).

## Why do walkers turn blue on the way back? {#faq-blue}

$\hat S^\dagger$ merges the two child edges into the parent and records which one a
walker came from: red from the left child, blue from the right one. This record is
exactly the colour the walkers had on the way in, between $\hat U^{(d)}$ and $\hat S$. The
gate $\hat U^{(d)}$ that follows, controlled by the recollected $A_d$, erases it; if it
stayed, the colours would remain correlated with the address and the output would not be
the state of Eq. (1).

## Why do the kets in the panel differ from the paper's ψ₁, ψ₂, …? {#faq-kets}

The paper writes one ket per level, as if the whole train sat on one level. In the
clocked model the train is longer than an edge and spans several levels at once, so the
panel's instantaneous state mixes levels. The paper's kets are *level-synchronous
checkpoints*: each slot is taken at the tick when it stands on the level in question.
`qramsim run --preset E1 --print-kets` prints them, and they coincide
with the arXiv appendix ([kets](protocol.md#kets)).

## Why does the engine's depth differ from the paper's formula? {#faq-depth}

Two modelling choices change the constants, not the scaling. The
memory lane has $K$ sites and hosts the whole train at rest, so the query is a pause
between routing and its exact time reversal and $T_{total} = 2T_{fwd} + T_q$, while the
paper's cell is traversed by the train. Edges hold $A_d$ plus every walker behind it,
$K - d + 1$ sites instead of $n + m - d$. Each engine tick is one layer of gates plus a
one-site shift. Both counts are quadratic in $n$, as the paper's $\mathcal{O}(n(n+m))$;
the resources panel shows them side by side ([timing](metrics.md#timing)).

## Why is the fidelity always 1? {#faq-fidelity}

Because without noise every variant implements Eq. (1) exactly: every gate is a basis
permutation, and the test suite checks fidelity $1 - 10^{-12}$ for all addresses, random
memories and random superpositions. The metrics become informative with
[noise](noise.md#noise), or with geometry overrides that make an edge shorter than the train
([metrics](metrics.md#fidelity)).

## Why does the backup variant need twice as many walkers? {#faq-backup}

Short-range gates cannot reach every walker behind $A_d$ at once, so the bit of $A_d$ is
passed along the train in steps. A backup next to each walker holds the bit while the
train moves two sites, then controls the next step. The backups cost a factor two in
walkers, but every gate involves at most three neighbours, the edges can be 4 sites long
and the depth becomes linear ([backup variant](variants.md#backup)).

## How can gates of different levels fire in the same tick? {#faq-pipelining}

They act on different walkers. With 4-site edges the front of the train is already on
level $d+1$ while its tail is still on level $d$; the gates of each level fire when the
clock brings their control onto their control site, so the two levels work in parallel
([pipelining](variants.md#pipelining)).


## Why does the long-range qudit Ŝ differ from the paper's table? {#faq-qudit-orientation}

The simulator gives the long-range qudit $\hat S$ the orientation of the dual-rail
scattering gates, through $\circ \leftrightarrow\ \uparrow$, $\bullet \leftrightarrow\ \downarrow$
($\hat S^{(\uparrow)} = \hat S \hat X$): $\circ R \to$ right, $\circ B \to$ left,
$\bullet R \to$ left, $\bullet B \to$ right. With the same-subspace
$\hat U^{(d)} = \hat U_\circ \oplus \hat U_\bullet$ the followers of $A_d$ then go left for
$a_d = 0$ and right for $a_d = 1$, in both logical subspaces, as in every other variant, so
all six variants share one cell numbering. The qudit table of the arXiv appendix lists the
mirror-image orientation; with it the followers turn the other way and the data reach the
cell of the complemented address $\bar a$. Both orientations make a working qRAM, up to the
relabelling of the cells $a \mapsto \bar a$ ([qudit Ŝ](gates.md#gate-qudit-S)).
