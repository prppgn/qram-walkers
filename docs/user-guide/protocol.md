# The protocol

How the quantum-walker qRAM of De Riso, Catalano, Lloyd, Giovannetti and De Santis
(arXiv:2508.02855) works, as this simulator implements it. Paper references point to the
technical paper unless they say "arXiv appendix".

## Overview {#overview}

A qRAM with $N = 2^n$ cells stores $m$ classical bits $b^{(a)} = b_1 \dots b_m$ at each
address $a = a_1 \dots a_n$ ($a_1$ is the most significant bit). For any amplitudes
$\alpha_a$ it must implement (technical paper, Eq. (generalqRAM))

$$\sum_a \alpha_a \ket{a}_A \ket{0}_D \;\xrightarrow{\text{qRAM}}\; \sum_a \alpha_a \ket{a}_A \ket{b^{(a)}}_D . \qquad (1)$$

Both registers are carried by *quantum walkers*: particles with a two-level internal
"colour", red $\ket{R}$ or blue $\ket{B}$, travelling as an ordered train through one
binary tree of depth $n$ whose $2^n$ leaves are the memory cells. Every bifurcation hosts
a block of two gates: an address-transmission gate $\hat U^{(d)}$ on the edge writes the
address bit $a_d$ into the colour of every walker behind $A_d$, then a passive scattering
gate $\hat S$ at the node sends red walkers left and blue walkers right. After $n$ levels
the data walkers stand in the addressed cell(s), the memory content is copied into them,
and the train is routed back to the port.

The simulator is exact: ideal gates are permutations of the computational basis, the
state is a sparse superposition of basis configurations (*branches*), and every gate
fires on a global clock. For the basic variant the output equals the right-hand side of
Eq. (1) with fidelity 1, for every address, memory content and superposition.

Paper: technical paper, §General functioning of our qRAM, Algorithm 1, Fig. (binarytree).

## The walker train {#train}

The train is a fixed ordered sequence of slots $k = 0, \dots, K-1$, one site apart
($\Delta x = 1$). Slot 0 is the front (it enters first), slot $K-1$ the tail. All walkers
move one site per tick, so order and spacing never change.

| slot $k$ | name | role |
|---|---|---|
| $i-1$ | $A_i$, $i = 1..n$ | address walker for bit $a_i$ |
| $n$ | $D_0$ | flag walker: triggers the copy in the addressed cell |
| $n+j$ | $D_j$, $j = 1..m$ | data walker for bit $b_j$ |
| $n+m+1$ | $D_{m+1}$ | delimiter: switches the cell off (cell-switch copy only) |

So $K = n + m + 1$, plus one in cell-switch mode; $A = \{A_1, \dots, A_n\}$ and
$D = \{D_0, \dots, D_m\}$ (plus $D_{m+1}$). A slot is a *time bin*: it exists even when it
holds no walker. The paper writes kets from tail to front, with $A_1$ rightmost.

## Encoding {#encoding}

Each slot carries a local state in $\{\varnothing, R, B\}$, where $\varnothing$ means "no
walker". The address is encoded by presence (technical paper, Eq. (addressencoding)), and $D_0$, every
$D_j$ (and $D_{m+1}$) start red:

$$a_i = 0 \mapsto \ket{\varnothing}_{A_i}, \quad a_i = 1 \mapsto \ket{R}_{A_i}, \qquad \ket{\psi_{in}} = \sum_a \alpha_a \ket{R}_D^{\otimes (m+1)} \ket{a}_A .$$

The all-red data register plays the role of $\ket{0}_D$ in Eq. (1). After the query $D_j$
is $\ket{R}$ where $b_j = 1$ and $\ket{\varnothing}$ where $b_j = 0$, the same convention
as the address, so the expected output is

$$\ket{\psi_{out}} = \sum_a \alpha_a \ket{R}_{D_0} \bigotimes_{j=1}^{m} \ket{b^{(a)}_j}_{D_j} \ket{a}_A , \qquad \ket{0} \equiv \ket{\varnothing},\ \ket{1} \equiv \ket{R} .$$

Because a 0 is the absence of a walker, the number of walkers depends on the branch (the
address $00\dots0$ sends no address walker). Example, $a = 101$, $m = 2$:
$\ket{R}_{D_2}\ket{R}_{D_1}\ket{R}_{D_0}\ket{R}_{A_3}\ket{\varnothing}_{A_2}\ket{R}_{A_1}$.

## The tree {#tree}

* **Edge $(d,l)$**, $d = 1..n$, $l = 1..2^{d-1}$, ends at bifurcation $(d,l)$, whose
  children are $(d+1, 2l-1)$ (left, bit 0) and $(d+1, 2l)$ (right, bit 1). Edge $(1,1)$ is
  the entry edge; the port is its first site.
* **Memory lane $(n+1, l)$**, $l = 1..2^n$, enters cell $l$; the memory qubits
  $M_1, \dots, M_m$ sit beside it, $M_j$ next to the site where $D_j$ rests. Cell $l$ has
  address $a$ with $l = 1 + \sum_i a_i 2^{n-i}$ (cell 1 is $00\dots0$; for $n = 2$,
  address $10$ is cell 3).
* **Sites**: an edge at level $d$ has $n_{\text{sites}}(d) = K - d + 1$ sites, numbered
  toward the cells: room for $A_d$ and every slot behind it. A lane has $K$ sites and holds
  the whole train at rest. The paper counts $n_{\text{sites}}^d = n + m - d$
  and a cell traversed by the train; see [Timing](metrics.md#timing).
* **Path coordinate**: site $s$ of level $d$ has $X(d,s) = \sum_{d' < d} n_{\text{sites}}(d') + s$.
* **Port line**: outside the tree (level 0, $x \le 0$) slot $k$ waits at $x = -k$ before
  entering and ends at $x = -k$ after leaving.

The technical paper writes positions as $(l,d)$ with depths from 0; the arXiv appendix and the
simulator write $(d,l)$, with $d = 1$ the entry edge and $d = n+1$ the lanes.

## The global clock {#clock}

Time advances in ticks $t = 0, 1, 2, \dots$ In a routing tick the scheduled gates fire,
then every walker moves one site; a walker leaving the last site of an edge crosses the
node through $\hat S$. In an inverse-routing tick motion comes first, then gates. Nothing
moves during the query.

Ideally slot $k$ is at path coordinate $x = t - k$ at the start of tick $t$, so it stands
on site $s$ of level $d$ at tick $t = X(d,s) + k$. The schedule follows from this rule:
a *gate instance* is a gate on a fixed window of sites, placed on every edge of one level
(or every lane), fired at one tick (the paper's "global classical clock"). Hence:

* controlled gates fire on the clock, not on the arrival of a walker; an empty control
  site means "control $= \varnothing$" and the gate acts as the identity;
* an instance fires on all edges of its level and in all branches at once;
* $\hat S$ and $\hat S^\dagger$ are passive: they act on every crossing walker, with no
  control and no clock;
* walkers are moved individually; the ideal timing only builds the schedule.

The viewer steps by tick, gate event, level or phase.

## Phases {#phases}

| phase | ticks | what happens |
|---|---|---|
| routing | $0 \dots T_{fwd}-1$ | the train enters; $\hat U^{(d)}$ and $\hat S$ level by level |
| query | $T_{fwd} \dots T_{fwd}+T_q-1$ | no motion; copy gates fire in the lanes |
| inverse routing | $T_{fwd}+T_q \dots T_{total}-1$ | exact time reversal of routing; exit through the port |
| done | — | the output is read and the metrics computed |

Routing ends when the tail stands on site 1 of its lane,
$T_{fwd} = \sum_{d=1}^{n} n_{\text{sites}}(d) + K$; $T_q = m$ (global copy) or $m+2$ (cell
switch); $T_{total} = 2T_{fwd} + T_q$. At the end of the query every walker reverses
direction. Frame $t = -1$ is the input; frame $t \ge 0$ is the state at the end of tick
$t$, with that tick's events. The train spans several levels at once, so the paper's
"level by level" picture is a wavefront, not an instant (see [kets](#kets)).

## Routing {#routing}

At level $d$ (technical paper, Fig. (ForwardRouting)):

1. When $A_d$ stands on the last site of edge $(d,l)$, every walker behind it,
   $T_d = D \cup \{A_i : i > d\}$, is on the same edge. [$\hat U^{(d)}$](gates.md#gate-U)
   fires on every edge of level $d$: a red $A_d$ turns all of them blue; an absent $A_d$
   does nothing. Walkers ahead of $A_d$ are untouched.
2. The walkers cross the node one per tick: [$\hat S$](gates.md#gate-S) sends red left
   and blue right, resetting blue to red.

The walkers behind $A_d$ thus go right exactly when $a_d = 1$: the group containing the
data spells out the address and ends in lane $l = 1 + \sum_i a_i 2^{n-i}$. A red $A_d$
goes left instead; no later gate targets it, so it keeps going left and rests in the cell
$a_1 \dots a_{d-1} 0 \dots 0$. It is *dispersed* and is recollected on the way back.
A walker is blue only between $\hat U^{(d)}$ and the next $\hat S$ on the way in, and
between $\hat S^\dagger$ and the matching $\hat U^{(d)}$ on the way back; never in a lane.

## Query {#query}

At $T_{fwd}$ slot $k$ rests at site $K - k$ of its lane: the data group in the addressed
lane, each dispersed address walker in another lane. Copy gates fire on the clock in
every lane, on the resting sites of $D_0$, $D_j$ (and $D_{m+1}$). In a lane holding only a
dispersed address walker those sites are empty and nothing happens: the flag walker
confines memory access to the addressed cell(s). Two mechanisms exist, the
[global copy](variants.md#copy-global) and the [cell switch](variants.md#copy-cell-switch);
both apply the [local copy](gates.md#gate-copy-loc), which erases $D_j$ where $b_j = 0$
and keeps it where $b_j = 1$, one data walker per tick.

## Inverse routing {#inverse}

Inverse routing is the exact adjoint of routing. After the query every
direction flips and the forward schedule is replayed backwards: inverse tick
$\tau = 0, \dots, T_{fwd}-1$ undoes forward tick $t = T_{fwd} - 1 - \tau$ by (1) moving
every walker one site back, crossing nodes through [$\hat S^\dagger$](gates.md#gate-S-dag)
and leaving through the port from edge $(1,1)$; then (2) firing the gates of tick $t$
again in reverse order (they are self-adjoint), i.e. at tick $T_{total} - 1 - t$.

* The train comes back **tail-first** through the same sites; the output port is the
  input port.
* A dispersed $A_d$ retraces its path and reaches the control site of the same
  $\hat U^{(d)}$ window exactly when its former followers, back from the right child and
  turned blue by $\hat S^\dagger$, fill the target sites; $\hat U^{(d)}$ turns them red and
  the merged train moves on. Recollection is automatic (technical paper, §Recollection of walkers).
* Within a level the order is $\hat S^\dagger$ then $\hat U^{(d)}$, as in Algorithm 1.

The paper draws the return on a mirror-image output tree traversed front-first, with
$A_n$ the first control after the cells (arXiv appendix §Inverse routing). For the basic
variant both readings give Eq. (1); the time-reversed one also works for the short-range
variants. The viewer draws the inverse phase on a mirrored output tree by default
(unfolded "H" layout) to match the paper's figures; physically there is one tree, as the
single-tree layout shows.

## Ghosts: empty slots {#ghosts}

An empty slot has no particle and no position. For rendering only it keeps a *ghost*
(position, direction, colour), initialised like a red walker at injection: it moves with
the clock, is flipped by $\hat X$ on a target site of $\hat U^{(d)}$, and is scattered by
$\hat S$, $\hat S^\dagger$ according to its ghost colour. A data walker erased by the copy
leaves a ghost with its last colour. Ghosts never affect the physics: a ghost on a
control site counts as $\varnothing$, and two branches that differ only in their ghosts
are the same branch (their amplitudes add). The viewer draws ghosts as dashed grey
circles (toggle); they keep visible the time bins, including those carrying a logical 0.

## Reading the kets {#kets}

The ket panel shows the instantaneous state, one line per branch with its amplitude.

* $\ket{R^{d,l}}_{A_1}$: slot $A_1$ holds a red walker on edge $(d,l)$ (lane: $d = n+1$).
* $\ket{\varnothing^{d}}_{A_2}$: an empty slot; the vacuum carries no branch index (technical
  paper, §Encoding and initialization), $d$ is the level of its ghost.
* Inverse phase: primed level, e.g. $\ket{R^{2',2}}$ (arXiv convention); on the port line
  the superscript is "in" or "out"; a switch that is on adds $\otimes F_{on}\{l\}$.
* Default order tail to front, as in the paper ($A_1$ rightmost); front to tail on request.

The paper's $\psi_1 = \hat U^{(1)}\psi_{in}$, $\psi_2 = \hat S\psi_1$, … treat the train
as if it sat on one level. In the clocked model they are *level-synchronous
checkpoints*: each slot is taken when it stands on the level in question.
`qramsim run --preset E1 --print-kets` prints them; they match the arXiv appendix.

## Worked example {#example}

Preset **E1** (arXiv appendix, Fig. rout_qram_cl): $n = 2$, $m = 1$, $a = 10$,
$b^{(10)} = 1$; $K = 4$, edges of 4 and 3 sites, $T_{fwd} = 11$, $T_q = 1$,
$T_{total} = 23$. Input $\ket{R}_{D_1}\ket{R}_{D_0}\ket{\varnothing}_{A_2}\ket{R}_{A_1}$.

* Tick 4: $\hat U^{(1)}$, $A_1$ red: $D_0$, $D_1$ turn blue; $A_1$ goes left at node $(1,1)$.
* Ticks 6–7: $D_0$, $D_1$ go right at $(1,1)$, reset to red. Tick 8: $\hat U^{(2)}$, $A_2$
  absent: identity. Ticks 9–10: they go left into lane $(3,3)$, cell $10$; $A_1$ rests in
  lane $(3,1)$, cell $00$.
* Tick 11: copy, $D_0$ red and $b_1 = 1$: $D_1$ stays red. Directions flip.
* Ticks 15–16: $D_1$, $D_0$ reach node $(1,1)$ from the right child and turn blue.
  Tick 18: $A_1$ arrives from the left, still red; $\hat U^{(1)}$ turns them red again.
* Ticks 19–22: exit tail-first ($D_1$, $D_0$, $A_1$). The output has the same colours as
  the input; with
  $b^{(10)} = 0$ (preset E1b) the copy erases $D_1$ and the output has
  $\ket{\varnothing}_{D_1}$.
