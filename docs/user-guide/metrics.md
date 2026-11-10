# Metrics and resources

At the end of a run the engine compares the output state with the ideal qRAM output,
decodes every branch, and counts the resources the run used. Metrics are computed on the
full basis configurations (colours, positions, directions and cell switches); ghost data
never enter them.

## Fidelity {#fidelity}

**Definition.**

$$F = \frac{\lvert \langle \psi_{\text{ideal}} \vert \psi_{\text{out}} \rangle \rvert^2}{\langle \psi_{\text{ideal}} \vert \psi_{\text{ideal}} \rangle \, \langle \psi_{\text{out}} \vert \psi_{\text{out}} \rangle}, \qquad \ket{\psi_{\text{ideal}}} = \sum_a \alpha_a \ket{a}_A \ket{b^{(a)}}_D ,$$

where in $\ket{\psi_{\text{ideal}}}$ every walker has left the tree and stands on the port
line in its slot position, $D_0$ (and $D_{m+1}$) are red, and $D_j$ is $\ket{R}$ for
$b_j = 1$, $\ket{\varnothing}$ for $b_j = 0$ (Eq. (1); technical paper, Eq. (generalqRAM)). The
amplitudes $\alpha_a$ are the normalised input amplitudes.

**When.** On the final state. **Intuition.** How well the run implemented the qRAM map,
phases included. Without noise every variant gives $F = 1$ up to $10^{-12}$ for every
input and memory: this is the engine's correctness test. The metric becomes informative
with [noise](noise.md#noise) or with geometry overrides that break the protocol.

**Norm.** The panel also reports $\langle \psi_{\text{out}} \vert \psi_{\text{out}} \rangle$,
which is 1 in ideal runs.

## Success probability {#success}

**Definition.**

$$P_{\text{succ}} = \sum_{\text{well-formed branches}} \lvert \text{amplitude} \rvert^2 .$$

A branch is *well formed* when every present walker has exited through the port into
its own slot position, moving away from the tree, and is red; the flag $D_0$ (and the
delimiter $D_{m+1}$) is present; and every cell switch is off. A well-formed branch is
decoded as

$$a_i = 1 \iff A_i \text{ present}, \qquad b_j = 1 \iff D_j \text{ present} .$$

**Intuition.** The probability that the device hands back an output it can read at all,
whatever the value. In ideal runs $P_{\text{succ}} = 1$.

## Consistency {#consistency}

**Definition.**

$$C = \frac{1}{P_{\text{succ}}} \sum_{\substack{\text{well-formed branches} \\ b = b^{(a)}}} \lvert \text{amplitude} \rvert^2 ,$$

the probability that a well-formed output carries the data stored at its own address,
given success ($C = 0$ when $P_{\text{succ}} = 0$).

**Intuition.** $P_{\text{succ}}$ says whether the output is readable, $C$ whether what is
read is right; $F$ also checks the coherence between branches, which neither of the two
sees. In ideal runs $C = 1$.

## Address–data entanglement {#entropy}

**Definition.** The entanglement entropy, in bits, of the address register against the
rest (engine key `entropy_AD`):

$$S = -\sum_k \lambda_k \log_2 \lambda_k ,$$

where $\lambda_k$ are the squared Schmidt coefficients of the pure state across the cut
$A \,\vert\, (D \cup F)$: $A$ is the slots $A_1, \dots, A_n$ (local states and positions),
$D$ the slots $D_0, \dots, D_m$ (and $D_{m+1}$) with their positions, $F$ the cell
switches. It is the von Neumann entropy of the reduced state of $A$, not the mutual
information (which for a pure state is twice as large).

For the ideal output, $S$ is the Shannon entropy of the retrieved data:

$$S = H(p), \qquad p(b) = \sum_{a :\, b^{(a)} = b} \lvert \alpha_a \rvert^2 ,$$

so $0 \le S \le \min(n, m)$ at the output. Examples: a classical address gives $S = 0$;
preset E2, $(\ket{00} + \ket{11})/\sqrt 2$ with $b^{(00)} = 1$, $b^{(11)} = 0$, gives
$S = 1$; a uniform superposition over a memory of zeros gives $S = 0$.

**When.** On the final state; with per-frame metrics enabled (`--frame-metrics`) also at
every tick. During routing the data walkers' positions depend on the address, so $S$
grows (for a uniform superposition, one bit per level); the query and the inverse
routing bring it to $H(p)$. **Intuition.** It shows that the output is a genuinely entangled
address–data state, and how much of that entanglement comes from the memory content
rather than from the routing.

## Resource counters {#resources}

The resources panel lists the engine's counts for the run next to the paper's formulas
for the variant (technical paper, §Basic variant, Resource scaling; Table (resource_comparison)).

| counter | meaning |
|---|---|
| `K` | slots in the train, $n + m + 1$ (+1 in cell-switch mode) |
| `walkers_input` | present walkers in the input: maximum over branches and probability-weighted mean (0s carry no walker) |
| `gate_locations` | physical gates: $2^n - 1$ for $\hat U$ and $2^n - 1$ for $\hat S$ (sum: the paper's $2(2^n - 1)$), copy gates per cell, $2^n$ cells |
| `gate_instances` | scheduled instances per phase and type (one instance = one gate on every edge of a level at one tick) |
| `activations` | instances whose control condition was met (e.g. $A_d$ red, $D_0$ red, $F$ on) in at least one branch, per phase and type |
| `activations_expected` | expected number of activated gate locations (instance $\times$ edge), weighted by branch probability |
| `S_crossings_expected` | expected number of walker crossings of a node, through $\hat S$ (routing) and $\hat S^\dagger$ (inverse) |
| `S_bounces_expected` | expected number of $\hat S^\dagger$ completion events (walker lost into a sibling edge); 0 in ideal runs |
| `sites_per_level` | $n_{\text{sites}}(d)$ for $d = 1..n$ and the lane length $K$ |
| `sites_path` | sites on one root-to-cell path, lane included (also without the lane) |
| `sites_total` | sites in the whole tree, lanes included |

**Paper formulas shown alongside** (basic variant): walkers $\le n + m + 1$ (+1 for
$D_{m+1}$), gates $2(2^n - 1)$, $n_{\text{sites}}^d = n + m - d$, path extent
$\sum_{d=1}^{n} (n + m - d) = (n^2 + n(2m-1))/2$ (technical paper, Eq. (StandardSitesScaling)),
depth $\mathcal{O}(n(n+m))$.

**Why the numbers differ.** The engine's edges hold $A_d$ plus every slot behind it,
$n_{\text{sites}}(d) = K - d + 1$, so the tree part of a path exceeds the paper's extent
by $2n$ sites (global copy) or $3n$ (cell switch); the lanes add $K$ sites each because
they host the whole train at rest. The scalings are the same.

**Active elements.** For a classical address $\hat U^{(d)}$ activates only where $a_d = 1$
along a single path, $\mathcal{O}(n)$ locations; a dense superposition activates
$\mathcal{O}(2^n)$ (technical paper, §Resource scaling). `activations_expected` measures this.

## Timing {#timing}

| quantity | engine value |
|---|---|
| $T_{fwd}$ | $\sum_{d=1}^{n} n_{\text{sites}}(d) + K$: the tail stands on site 1 of its lane |
| $T_q$ | $m$ (global copy) or $m + 2$ (cell switch); 1 or 3 without stagger |
| $T_{total}$ | $2T_{fwd} + T_q$ (routing, query, inverse routing) |
| max instances per tick | largest number of gate instances firing in one tick |
| max gate operations per tick | largest number of physical gate locations clocked in one tick |

One tick is one layer of gates plus a one-site shift of every walker. With the default
edges and the global copy, $T_{fwd} = n^2/2 + nm + 5n/2 + m + 1$, so $T_{total}$ grows
quadratically in $n$, as the paper's $\mathcal{O}(n(n+m))$.

| run | $T_{fwd}$ | $T_q$ | $T_{total}$ |
|---|---|---|---|
| E1: $n = 2$, $m = 1$, global copy | 11 | 1 | 23 |
| E1-switch: $n = 2$, $m = 1$, cell switch | 14 | 3 | 31 |
| $n = 6$, $m = 4$, global copy | 62 | 4 | 128 |

**Backup variant.** Edges have 4 sites, so $T_{fwd} = 4n + K = 6n + 2m$, exactly the
paper's routing time $T_{\text{parallel}}$, and $T_{total} = 2(4n + K) + T_q = 12n + 5m$
with staggered copies; the path extent is $4n$, as in the paper. The paper's total
$10n + 4m + t_Q$ assumes a memory cell the train passes through; here the train rests
in the lane during the query.

**Measured scalings.** `uv run qramsim scaling --variant basic` (or any other variant)
runs the engine for $n = 2..8$, $m = 1..4$ and fits the tick counts:

| variant | $T_{fwd}$ | $T_{total}$ | sites per path (tree) | paper |
|---|---|---|---|---|
| basic, global copy | $n^2/2 + nm + 5n/2 + m + 1$ | $n^2 + 2nm + 5n + 3m + 2$ | $n^2/2 + nm + 3n/2$ | $\mathcal{O}(n(n+m))$; path $n^2/2 + nm - n/2$ |
| backup | $6n + 2m$ | $12n + 5m$ | $4n$ | $10n + 4m + t_Q$; routing $6n + 2m$; path $4n$ |
| `qudit_long` | $n^2/2 + nm + 5n/2 + m + 1$ | $n^2 + 2nm + 5n + 3m + 2$ | $n^2/2 + nm + 3n/2$ | $\mathcal{O}(n(n+m))$; path $n(n+m) - n(n+1)/2$ |
| `qudit_short` | $3n + m + 1$ | $6n + 3m + 2$ | $2n$ | $5n + 2m$; path $2n$ |
| `dualrail_basic` | $n^2/2 + nm + 5n/2 + m + 1$ | $n^2 + 2nm + 5n + 3m + 5$ | $n^2/2 + nm + 3n/2$ | $(n^2 + 2nm + n + 2m)/2$ incl. $T_{prep}$ |
| `dualrail_backup` | $6n + 2m$ | $12n + 5m + 3$ | $4n$ | $13n + 7m$ incl. $T_{prep} = 3(n+m)$; path $4n$ |

The dual-rail totals include the three ticks of the cell output circuit; the six
variants are compared side by side in [Variants](variants.md#comparison).

**Comparison with the paper.** The technical paper gives the basic variant's depth as
$\mathcal{O}(n(n+m))$ and, in Table (resource_comparison), $n^2/2 + nm + \mathcal{O}(n+m)$;
the engine's $T_{fwd}$ alone has this leading term, and $T_{total}$ contains two such
passes plus the query. The constants also differ because the memory lane hosts the whole
train at rest, making the query a pause between routing and its exact time reversal,
whereas the paper's cell is traversed by the train. Compare
scalings, not constants.
