# Gates

All ideal gates are permutations of the computational basis: they map each
configuration of colours and positions to exactly one other, with no phase. A controlled
gate has the projector form $\sum_c \ket{c}\bra{c}_{\text{control}} \otimes \hat V_c$ and is
activated by a single control value. Scheduled gates fire on the global clock on every
edge of a level (or every memory lane) at once ([clock](protocol.md#clock)); the
scattering gates are passive and act on every crossing.

## Summary {#summary}

| gate | code name | activated by | acts on | where | fires at |
|---|---|---|---|---|---|
| $\hat X$ | — | — | colour of one walker | inside other gates | — |
| $\hat U^{(d)}$ | `U` | $A_d$ red | every walker behind $A_d$ | every edge of level $d$ | $t_d$ and $T_{total}-1-t_d$ |
| $\hat S$ | `S` | (passive) | each walker crossing a node | every node | forward crossings |
| $\hat S^\dagger$ | `S_dag` | (passive) | each walker crossing a node | every node | backward crossings |
| local copy | `copy_loc` | $M_j$ empty ($b_j = 0$) | $D_j$ | inside copy gates | — |
| global copy | `copy_global` | $D_0$ red | $D_j$ | every lane | $T_{fwd}+j-1$ |
| switch on | `cell_on` | $D_0$ red | switch $F$ | every lane | $T_{fwd}$ |
| switched copy | `copy_cell` | $F$ on | $D_j$ | every lane | $T_{fwd}+j$ |
| switch off | `cell_off` | $D_{m+1}$ red | switch $F$ | every lane | $T_{fwd}+m+1$ |
| backup init | `U_in` | $A_d$ red | $\tilde A_d$ | every edge of level $d$ (sites 3, 2) | $X(d,3) + k(A_d)$ |
| backup block | `U_B` | backup **blue** | next walker and its backup | every edge of level $d$ (sites 4, 3, 2) | $X(d,4) + k(\tilde W)$, every 2 ticks |
| backup copy | `copy_backup` | $\tilde D_{j-1}$ (or $\tilde A_n$) red | $D_j$ | every lane | $T_{fwd}+j-1$ |
| **qudit** NOTs $\hat X^C$, $\hat X^{C,0}$, $\hat X^{C,1}$, $\hat X^L$ | — | — | colour or logical bit of one qudit | inside the qudit gates | — |
| qudit $\hat U^{(d)} = \hat U_\circ \oplus \hat U_\bullet$ | `U` | $A_d$ in $\circ R$ or $\bullet R$ | colour of the followers in the subspace of $A_d$ | every edge of level $d$ (`qudit_long`) | as $\hat U^{(d)}$ |
| qudit $\hat S$ | `S` | (passive) | $\bullet$ as $\hat S$, $\circ$ as $\hat S \hat X^C$ | every node (`qudit_long`) | forward crossings ($\hat S^\dagger$ backward) |
| qudit $\hat U_{in}$ | `U_in` | $A_d$ in $\bullet$ (logical 1) | colour of $A_{d+1}$ | every edge of level $d$, sites 2, 1 (`qudit_short`) | $X(d,2) + d - 1$ |
| qudit $\hat U_B$ | `U_B` | walker **blue** | colour of the next walker | every edge of level $d$, sites 2, 1 (`qudit_short`) | $X(d,2) + k(W)$, every tick |
| $\hat S_{sr}$ | `S` | (passive) | colour only, logical bit kept | every node (`qudit_short`) | forward crossings |
| qudit copy | `copy_global`, `copy_cell` | $D_0 = \bullet R$ (or $F$ on) | logical bit of $D_j$ ($\hat X^L$) | every lane | as the basic copies |
| **dual-rail** $\hat U^{(d,r)}$ | `U` | $A_d$ red on tree $r$ | followers on tree $r$ | every edge of level $d$, both trees | as $\hat U^{(d)}$ |
| $\hat S^{(\downarrow)} = \hat S$, $\hat S^{(\uparrow)} = \hat S \hat X$ | `S` | (passive) | each walker crossing a node of its tree | every node, both trees | forward crossings (adjoints backward) |
| dual-rail copy | `copy_global`, `copy_cell` | $D_0 = (\downarrow, R)$ (or $F$ on) | colour of $D_j$ on $\downarrow$ | every lane | as the basic copies |
| output circuit $\hat S_M$, $\hat S_M^\dagger$, $\hat X_c$ | `S_M`, `S_M_dag`, `X_c` | (clocked) | rail and colour of the lane walkers ($\hat X_c$: data slots only) | every cell | three ticks after the copies |
| dual-rail $\hat U_{in}$, $\hat U_B$ | `U_in`, `U_B` | as in the backup variant, per tree | walkers of the same tree | every edge, both trees | as in the backup variant |
| dual-rail backup copy | `copy_backup` | $\tilde D_{j-1}^\downarrow$ (or $\tilde A_n^\downarrow$) in $(\downarrow, R)$ | colour of $D_j$ | every lane | $T_{fwd}+j-1$ |

Here $t_d = X(d, n_{\text{sites}}(d)) + d - 1$ and the query ticks are those of the
default staggered query. The qudit and dual-rail gates are tables on the
four-state alphabets of those variants ([qudit](variants.md#qudit),
[dual-rail](variants.md#dualrail)); they are still basis permutations.

## Colour NOT X̂ {#gate-X}

$$\hat X = \ket{B}\bra{R} + \ket{R}\bra{B} + \ket{\varnothing}\bra{\varnothing} .$$

**Parameters.** None. **Where.** Never scheduled alone: it is the target operation of
$\hat U^{(d)}$, and the colour changes inside $\hat S$ (blue reset to red on the right
output) and $\hat S^\dagger$ (red turned blue from the right child) are $\hat X$ applied
together with the routing. **Intuition.** It flips the routing instruction a walker
carries without creating or removing a walker: an empty slot stays empty.

Paper: technical paper, §Address-transmission gate, text after Eq. (targetOp).

## Address transmission Û⁽ᵈ⁾ {#gate-U}

**Definition** (technical paper, Eqs. (WalkerSets), (infoTransm), (targetOp)). With
$P_d = \{A_i : i < d\}$ the walkers ahead of $A_d$ and $T_d = D \cup \{A_i : i > d\}$ the
walkers behind it,

$$\hat U^{(d)}(T_d \vert A_d) = \sum_{c \in \{\varnothing, R, B\}} \hat V^{(T_d)}_c \otimes \ket{c}\bra{c}_{A_d}, \qquad \hat V^{(T_d)}_R = \bigotimes_{j \in T_d} \hat X_j, \quad \hat V^{(T_d)}_B = \hat V^{(T_d)}_\varnothing = \hat I .$$

A red $A_d$ flips the colour of every walker behind it; an absent (or blue) $A_d$ does
nothing. $P_d$ is never touched.

**Parameters.** Level $d = 1..n$; control $A_d$; targets $T_d$, which has $K - d$ slots
($n - d + m + 1$ with the global copy, one more with the cell switch). One gate per edge,
$2^n - 1$ in total.

**Where and when.** Window on every edge $(d,l)$ of level $d$: control on the last site
$n_{\text{sites}}(d)$, targets on sites $1, \dots, n_{\text{sites}}(d) - 1$, i.e. the whole
edge (long range). It fires at $t_d = X(d, n_{\text{sites}}(d)) + d - 1$, when $A_d$
stands on the control site and its followers fill the rest of the edge, and again at
$T_{total} - 1 - t_d$ in the inverse routing. Since $\hat X^2 = \hat I$ the gate is its own
adjoint, so the inverse routing uses the same table. Ghosts on target sites are flipped
too (rendering only). Example, preset E1: $\hat U^{(1)}$ on sites 4–1 at ticks 4 and 18,
$\hat U^{(2)}$ on sites 3–1 at ticks 8 and 14.

**Intuition.** $A_d$ copies its bit into the colour of every follower, so that the
passive $\hat S$ at the end of the edge sends them all into branch $a_d$. On the way back
the same gate erases the colour that $\hat S^\dagger$ wrote.

Paper: technical paper, §Address-transmission gate, Fig. (ForwardRouting) (b); arXiv appendix
§Information transmission.

## Scattering Ŝ {#gate-S}

**Definition** (technical paper, Eq. (bosonicS), there with index order $(l,d)$). For a walker leaving
edge $(d,l)$ toward the cells,

$$\hat S \ket{R^{d,l}} = \ket{R^{d+1,\,2l-1}}, \qquad \hat S \ket{B^{d,l}} = \ket{R^{d+1,\,2l}}, \qquad \hat S \ket{\varnothing^{d}} = \ket{\varnothing^{d+1}} .$$

Red goes left and stays red; blue goes right and is reset to red; the vacuum carries no
routing information and simply passes. The arXiv appendix (Eq. (hatS)) completes
$\hat S$ to a permutation of the six single-walker modes of a node; the completion terms
concern walkers entering from a child port and never act in the forward dynamics.

**Parameters.** None: no control, no clock. One per node, $2^n - 1$ in total.

**Where and when.** At every bifurcation $(d,l)$, $d = 1..n$ (for $d = n$ the children are
memory lanes). It acts during the motion step of every routing tick on each walker that
leaves the last site of edge $(d,l)$; the walker lands on site 1 of the child edge. A
ghost is scattered with its ghost colour.

**Intuition.** A polarising beam splitter (the two colours as two polarisations) followed
by a half-wave plate on the right output, so both outputs leave red (technical paper,
§Scattering gate). The colour is a which-way instruction, consumed at the node.

Paper: technical paper, §Scattering gate Ŝ, Fig. (ForwardRouting) (c); arXiv appendix Eq. (hatS).

## Inverse scattering Ŝ† {#gate-S-dag}

**Definition.** The adjoint of $\hat S$, acting on walkers that move toward the root
(technical paper, §Inverse routing operations):

$$\hat S^\dagger \ket{R^{d+1,\,2l-1}} = \ket{R^{d,l}}, \qquad \hat S^\dagger \ket{R^{d+1,\,2l}} = \ket{B^{d,l}}, \qquad \hat S^\dagger \ket{\varnothing^{d+1}} = \ket{\varnothing^{d}},$$

compactly $\hat S^\dagger \ket{R^{d+1,j}} = \hat X^{\,j-2l+1} \ket{R^{d,l}}$ for
$j \in \{2l-1, 2l\}$. In the ideal protocol every walker arrives at every node red. The
completion terms send a *blue* walker arriving from a child down the sibling edge, red
and moving toward the cells again: it is effectively lost. This occurs only off the
ideal path; it is recorded as a bounce and strict mode reports it.

**Parameters.** None. One per node (the same physical element as $\hat S$).

**Where and when.** During the motion step of every inverse-routing tick (motion comes
before the gates), on each walker leaving site 1 of a child edge; it lands on the last
site of the parent edge $(d,l)$. Walkers leaving edge $(1,1)$ exit to the port line.

**Intuition.** The same beam splitter traversed backward merges the two child paths into
the parent; the colour now records which child the walker came from, and
$\hat U^{(d)}$, controlled by the recollected $A_d$, erases that record.

Paper: technical paper, §Inverse routing operations, Fig. (InversedRouting) (c); arXiv appendix
Eqs. (hatSout), (Sdagga).

## Local copy {#gate-copy-loc}

**Definition** (technical paper, Eqs. (copyMapping), (locCopy)). The memory qubit $M_j$ of a cell holds
$\ket{\varnothing}$ for $b_j = 0$ and $\ket{R}$ for $b_j = 1$; it is classical and never
changes.

$$\hat U^{loc}_{copy}(D_j \vert M_j) = \big(\ket{R}\bra{R} + \ket{B}\bra{B}\big)_{M_j} \otimes \hat I_{D_j} + \ket{\varnothing}\bra{\varnothing}_{M_j} \otimes \big(\ket{\varnothing}\bra{R} + \ket{R}\bra{\varnothing} + \ket{B}\bra{B}\big)_{D_j} .$$

| stored bit | $\ket{R}_{D_j} \to$ | $\ket{\varnothing}_{D_j} \to$ | $\ket{B}_{D_j} \to$ |
|---|---|---|---|
| $b_j = 1$ ($M_j = R$) | $\ket{R}$ | $\ket{\varnothing}$ | $\ket{B}$ |
| $b_j = 0$ ($M_j = \varnothing$) | $\ket{\varnothing}$ | $\ket{R}$ | $\ket{B}$ |

**Parameters.** Data index $j$; the stored bit $b_j$ of the cell. **Where.** Never
scheduled alone: the copy gates below apply it on lane site $K - n - j$, where $D_j$
rests; $M_j$ is drawn beside that site. **Intuition.** A red data walker is erased where
the stored bit is 0 and kept where it is 1, so $D_j$ ends up encoding $b_j$ with the same
presence convention as the address. The gate is its own inverse.

In the ideal protocol $D_j$ is always present when copied, so the
$\ket{\varnothing} \to \ket{R}$ entry never acts. Off the ideal path (e.g. after a loss)
the simulator applies it literally to the site: the copy creates a red walker in the time
bin of that site ([stray walkers](noise.md#noise-strays)).

## Global copy {#gate-copy-global}

**Definition** (technical paper, Eq. (GlobCopy)):

$$\hat U^{(a)}_{copy} = \ket{R}\bra{R}_{D_0} \otimes \bigotimes_{j=1}^{m} \hat U^{loc}_{copy}(D_j \vert M^{(a)}_j) + \big(\ket{\varnothing}\bra{\varnothing} + \ket{B}\bra{B}\big)_{D_0} \otimes \hat I .$$

**Parameters.** The cell $a$ (every lane has its own gate); control $D_0$; targets
$D_1, \dots, D_m$ with the memory qubits $M^{(a)}_j$.

**Where and when.** `copy_mode = global`. The gate is split into $m$ commuting instances
(`copy_D1`, …, `copy_Dm`): the one for $D_j$ has its control on lane site $K - n$ (where
$D_0$ rests) and its target on lane site $K - n - j$, and fires at tick $T_{fwd} + j - 1$.
Without stagger a single instance applies all $m$ local copies at $T_{fwd}$. The product
of the instances is the paper's gate.

**Intuition.** The flag is present and red only in the lane(s) the data walkers reached,
so the memory is read there and nowhere else.

Paper: technical paper, §Global Controlled COPY operation, Fig. (copy_standard) (a)–(d).

## Switch on {#gate-cell-on}

**Definition** (technical paper, Eq. (activeCellCopy)):

$$\hat U_{on}(F \vert D_0) = \ket{R}\bra{R}_{D_0} \otimes \big(\ket{\text{on}}\bra{\text{off}} + \ket{\text{off}}\bra{\text{on}}\big)_F + \big(\ket{\varnothing}\bra{\varnothing} + \ket{B}\bra{B}\big)_{D_0} \otimes \hat I_F .$$

**Parameters.** Control $D_0$; target the switch $F$ of the same cell, a two-level system
that is part of the quantum state. **Where and when.** `copy_mode = cell_switch`; control
on lane site $K - n$, tick $T_{fwd}$. It is a toggle; in the ideal protocol $F$ is off
before it fires. **Intuition.** The flag walker opens the cell it has reached.

Paper: technical paper, §COPY operation through memory cell activation, Fig. (copy_standard) (e)–(f).

## Switched copy {#gate-copy-cell}

**Definition** (technical paper, §COPY operation through memory cell activation, unnumbered equation):

$$\hat U_{copy}(F) = \ket{\text{on}}\bra{\text{on}}_F \otimes \bigotimes_{j=1}^{m} \hat U^{loc}_{copy}(D_j \vert M_j) + \ket{\text{off}}\bra{\text{off}}_F \otimes \hat I .$$

**Parameters.** Controlled by the switch $F$ (no walker control); targets $D_1, \dots, D_m$.
**Where and when.** One instance per data walker, target on lane site $K - n - j$, tick
$T_{fwd} + j$ (all at $T_{fwd} + 1$ without stagger). **Intuition.** An open cell copies
its bits into the data walkers resting beside it; a closed cell does nothing.

Paper: technical paper, §COPY operation through memory cell activation, Fig. (copy_standard) (g).

## Switch off {#gate-cell-off}

**Definition.** Same toggle as $\hat U_{on}$, controlled by the delimiter (technical paper, defined
"analogously to Eq. (activeCellCopy)"):

$$\hat U_{off}(F \vert D_{m+1}) = \ket{R}\bra{R}_{D_{m+1}} \otimes \big(\ket{\text{on}}\bra{\text{off}} + \ket{\text{off}}\bra{\text{on}}\big)_F + \big(\ket{\varnothing}\bra{\varnothing} + \ket{B}\bra{B}\big)_{D_{m+1}} \otimes \hat I_F .$$

**Parameters.** Control $D_{m+1}$ (the tail of the train); target $F$. **Where and when.**
Control on lane site 1, where $D_{m+1}$ rests; tick $T_{fwd} + m + 1$ ($T_{fwd} + 2$
without stagger). In the ideal protocol every switch is off again afterwards, in every
branch. **Intuition.** A switch left on would keep a record of which cell was read,
correlated with the address register; closing it removes that record.

Paper: technical paper, §COPY operation through memory cell activation, Fig. (copy_standard) (h).

## Backup initialisation Û_in {#gate-U-in}

**Definition** (technical paper, §Address-transmission gate decomposition, backup variant). A CNOT
from the address walker onto its backup, with the projector form of $\hat U^{(d)}$ and a
single target:
$$\hat U_{in}(\tilde A_d \vert A_d) = \sum_{c} \hat V^{(\tilde A_d)}_c \otimes \ket{c}\bra{c}_{A_d}, \qquad \hat V_R = \hat X_{\tilde A_d}, \quad \hat V_B = \hat V_\varnothing = \hat I .$$

**Parameters.** Level $d$; control $A_d$; target $\tilde A_d$. One gate per edge,
$2^n - 1$ in total. **Where and when.** Backup variant, every edge $(d,l)$: control on
site 3, target on site 2; it fires at $X(d,3) + k(A_d)$, when $A_d$ stands on site 3 (and
again at the mirrored tick in the inverse routing, last among the gates of its level).
**Intuition.** The address bit is copied into a red backup that will carry it down the
train.

## Backup block Û_B {#gate-U-B}

**Definition** (technical paper, §Address-transmission gate decomposition; arXiv appendix
§BackupGates). A controlled-NOT-NOT on a triplet: control the backup $\tilde W_i$,
targets the next carrier $W_{i+1}$ and its backup $\tilde W_{i+1}$,
$$\hat U_B(W_{i+1}, \tilde W_{i+1} \vert \tilde W_i) = \sum_{c} \hat V^{(W_{i+1}, \tilde W_{i+1})}_c \otimes \ket{c}\bra{c}_{\tilde W_i}, \qquad \hat V_B = \hat X \otimes \hat X, \quad \hat V_R = \hat V_\varnothing = \hat I .$$
It is the only gate of the paper activated by a **blue** control. An empty target stays
empty.

**Parameters.** Level $d$; the control backup $\tilde W_i \in \{\tilde A_d, \dots, \tilde A_n, \tilde D_1, \dots, \tilde D_{m-1}\}$: $n + m - d$ instances per level,
all on the same window. **Where and when.** Every edge of level $d$: control on site
4, targets on sites 3 and 2; the instance controlled by $\tilde W$ fires at
$X(d,4) + k(\tilde W)$. Consecutive instances are two ticks apart: after each one the train
has moved two sites and the freshly flipped backup stands on site 4. **Intuition.** A
bucket brigade: each blue backup hands the bit to the next pair, so the information of
$A_d$ reaches the tail with nearest-neighbour gates only.

Paper: technical paper, Fig. (backupscheme) (b)–(c), §Depth reduction.

## Backup copy {#gate-copy-backup}

**Definition** (technical paper, Eq. (backup_copy)):
$$\hat U_{copy}(D_j, M_j \vert \tilde D_{j-1}) = \ket{R}\bra{R}_{\tilde D_{j-1}} \otimes \hat U^{loc}_{copy}(D_j, M_j) + \big(\ket{\varnothing}\bra{\varnothing} + \ket{B}\bra{B}\big)_{\tilde D_{j-1}} \otimes \hat I ,$$
with $\tilde A_n$ in place of $\tilde D_0$ for $j = 1$.

**Parameters.** Data index $j$; control the backup in front of $D_j$; the stored bit
$b_j$. **Where and when.** `copy_mode = backup`: control on the lane site where the
backup rests, target on the lane site of $D_j$ (beside $M_j$); tick $T_{fwd} + j - 1$
(all at $T_{fwd}$ without stagger). **Intuition.** The backup right in front of each data
walker plays the role of the flag $D_0$, locally: it is present only in the lane the
train reached.

## Qudit NOTs X̂ᶜ and X̂ᴸ {#gate-qudit-X}

**Definition** (technical paper, §Qudit variant). The qudit is a pair (logical bit, routing colour),
and four single-qudit permutations act on one component or the other:

| in | $\hat X^C$ | $\hat X^{C,0}$ | $\hat X^{C,1}$ | $\hat X^L$ |
|---|---|---|---|---|
| $\circ R$ | $\circ B$ | $\circ B$ | $\circ R$ | $\bullet R$ |
| $\circ B$ | $\circ R$ | $\circ R$ | $\circ B$ | $\bullet B$ |
| $\bullet R$ | $\bullet B$ | $\bullet R$ | $\bullet B$ | $\circ R$ |
| $\bullet B$ | $\bullet R$ | $\bullet B$ | $\bullet R$ | $\circ B$ |

$\hat X^C$ is the colour NOT, which keeps the logical bit. $\hat X^{C,0}$ and $\hat X^{C,1}$
flip the colour only in the logical subspace 0 or 1 and are the identity on the other
one, so $\hat X^C = \hat X^{C,0} \hat X^{C,1}$. $\hat X^L$ is the logical NOT, which keeps
the colour: $\hat X^L \ket{\circ c} = \ket{\bullet c}$, $\hat X^L \ket{\bullet c} = \ket{\circ c}$.

**Where.** Never scheduled alone: $\hat X^{C,0}$ and $\hat X^{C,1}$ are the target
operations of the long-range [qudit Û⁽ᵈ⁾](gates.md#gate-qudit-U), $\hat X^C$ of the
[short-range gates](gates.md#gate-qudit-short), $\hat X^L$ of the
[qudit copy](gates.md#gate-qudit-copy). **Intuition.** The routing gates touch only the
colour, the memory touches only the logical bit; the two never interfere.

## Qudit address transmission Û⁽ᵈ⁾ {#gate-qudit-U}

**Definition** (technical paper, §Qudit variant, Long-range routing operations). A direct sum over
the logical subspace of the control $A_d$, with $T_d$ the walkers behind $A_d$:

$$\hat U^{(d)} = \hat U^{(d)}_\circ \oplus \hat U^{(d)}_\bullet, \qquad \hat U^{(d)}_\circ = \sum_{a_d \in \{\circ R,\, \circ B\}} \hat\Pi^{(A_d)}_{a_d} \otimes \hat V^{(T_d)}_{a_d}, \qquad \hat U^{(d)}_\bullet = \sum_{a_d \in \{\bullet R,\, \bullet B\}} \hat\Pi^{(A_d)}_{a_d} \otimes \hat V^{(T_d)}_{a_d},$$

$$\hat V^{(T_d)}_{\circ R} = \bigotimes_{j \in T_d} \hat X^{C,0}_j, \qquad \hat V^{(T_d)}_{\bullet R} = \bigotimes_{j \in T_d} \hat X^{C,1}_j, \qquad \hat V^{(T_d)}_{\circ B} = \hat V^{(T_d)}_{\bullet B} = \hat I .$$

Since $\hat X^{C,0}$ is the identity on $\bullet$ walkers (and $\hat X^{C,1}$ on $\circ$
walkers), the tensor products can be taken over the whole of $T_d$:

| control $A_d$ | action on every target |
|---|---|
| $\circ R$ | $\hat X^{C,0}$: flip the colour of the $\circ$ targets, leave the $\bullet$ ones |
| $\bullet R$ | $\hat X^{C,1}$: flip the colour of the $\bullet$ targets, leave the $\circ$ ones |
| $\circ B$, $\bullet B$ | identity |

**Parameters, where and when.** As the basic [Û⁽ᵈ⁾](gates.md#gate-U), in `qudit_long`: one
gate per edge, window = the whole edge with the control on its last site, fired at $t_d$
and again at $T_{total} - 1 - t_d$. The gate is its own adjoint. In the ideal protocol the
control always arrives red (every node resets the colour), so the blue rows never act.

**Intuition.** $A_d$ writes its bit only into the walkers that share its logical value.
Together with the [qudit Ŝ](gates.md#gate-qudit-S), which scatters the two subspaces in
opposite ways, this sends every follower into branch $a_d$, whatever bit it carries
([level table](variants.md#qudit-long)).

## Qudit scattering Ŝ {#gate-qudit-S}

**Definition** (`qudit_long`). $\hat S = \hat S^{(\circ)} \oplus \hat S^{(\bullet)}$;
for a walker leaving edge $(d,l)$,

$$\hat S \ket{\bullet R^{d,l}} = \ket{\bullet R^{d+1,\,2l-1}}, \quad \hat S \ket{\bullet B^{d,l}} = \ket{\bullet R^{d+1,\,2l}}, \quad \hat S \ket{\circ R^{d,l}} = \ket{\circ R^{d+1,\,2l}}, \quad \hat S \ket{\circ B^{d,l}} = \ket{\circ R^{d+1,\,2l-1}} .$$

On the $\bullet$ subspace it is the bosonic $\hat S$ (red left, blue right); on the
$\circ$ subspace it is $\hat S \hat X^C$ (red right, blue left). Both reset the colour to
red and keep the logical bit. Backward crossings use the adjoint: $\hat S^\dagger$ on
$\bullet$, $(\hat S \hat X^C)^\dagger = \hat X^C \hat S^\dagger$ on $\circ$, so a $\circ$
walker arriving red continues red from the right child and blue from the left child.
Through $\circ \leftrightarrow\ \uparrow$, $\bullet \leftrightarrow\ \downarrow$ this is
exactly the dual-rail pair [Ŝ⁽↑⁾, Ŝ⁽↓⁾](gates.md#gate-dr-S).

**Orientation.** This is the orientation of the long-range dual-rail scattering, to which
the long-range qudit routing is equivalent. With the same-subspace $\hat U^{(d)}$ above,
the followers of $A_d$ go left for $a_d = 0$ and right for $a_d = 1$ in both logical
subspaces, as in every other variant, so the data reach the cell of $a$ and all variants
share one cell numbering ([FAQ](faq.md#faq-qudit-orientation)).

**Where and when.** At every node, passive, on every crossing, like the bosonic
[Ŝ](gates.md#gate-S); one per node, $2^n - 1$ in total.

## Qudit short-range gates {#gate-qudit-short}

`qudit_short` (technical paper, §Qudit variant, Short-range routing operations; Eq. (Uinqudit)). Three
gates replace $\hat U^{(d)}$ and the subspace-dependent $\hat S$; the windows are two
adjacent sites with the control in front.

**Initialisation**, controlled by the *logical value* of $A_d$ (either colour):

$$\hat U_{in}(A_{d+1} \vert A_d) = \sum_{a_d} \hat\Pi^{(A_d)}_{a_d} \otimes \hat V^{(A_{d+1})}_{a_d}, \qquad \hat V^{(A_{d+1})}_{a_d = \bullet} = \hat X^C_{A_{d+1}}, \quad \hat V^{(A_{d+1})}_{a_d = \circ} = \hat I_{A_{d+1}} .$$

The target's colour flips whatever its logical value; its logical value is kept.

**Block**, controlled by the *colour* of $W_i$ (either logical value), activated by blue
as the bosonic [Û_B](gates.md#gate-U-B):

$$\hat U_B(W_{i+1} \vert W_i) = \sum_{c \in \{R, B\}} \hat\Pi^{(W_i)}_c \otimes \hat V^{(W_{i+1})}_c, \qquad \hat V^{(W_{i+1})}_R = \hat I, \quad \hat V^{(W_{i+1})}_B = \hat X^C_{W_{i+1}} .$$

**Scattering** by colour only, the same rule in both subspaces:

$$\hat S_{sr} \ket{\circ R^{d,l}} = \ket{\circ R^{d+1,\,2l-1}}, \quad \hat S_{sr} \ket{\bullet R^{d,l}} = \ket{\bullet R^{d+1,\,2l-1}}, \quad \hat S_{sr} \ket{\circ B^{d,l}} = \ket{\circ R^{d+1,\,2l}}, \quad \hat S_{sr} \ket{\bullet B^{d,l}} = \ket{\bullet R^{d+1,\,2l}} .$$

Backward crossings use $\hat S_{sr}^\dagger$, the bosonic [Ŝ†](gates.md#gate-S-dag) on the
colour.

**Where and when.** Edges of 2 sites. $\hat U_{in}$: control on site 2, target on site 1,
at $X(d,2) + k(A_d)$ with $k(A_d) = d - 1$. $\hat U_B$: the same window, one instance per
control $W \in \{A_{d+1}, \dots, \text{the walker before the tail}\}$ at $X(d,2) + k(W)$,
on consecutive ticks: $K - d - 1$ instances per level (the technical paper's
$t_B = n + m - 2$ at $d = 1$, counted without the flag). One $\hat U_{in}$, one $\hat U_B$ and one $\hat S_{sr}$
per node: $3(2^n - 1)$ gates. In the inverse routing the same instances fire at
$T_{total} - 1 - t$, so the chain runs tail-first and $\hat U_{in}$ comes last;
$\hat U_{in}$ and $\hat U_B$ are their own adjoints.

**Intuition.** $\hat U_{in}$ turns the logical bit of $A_d$ into a colour; $\hat U_B$
hands the colour from walker to walker, one per tick, a bucket brigade that needs no
backups because no walker is ever missing; $\hat S_{sr}$ reads only the colour, so each
walker turns according to the instruction it received, not to the bit it carries.

## Qudit copy {#gate-qudit-copy}

**Definition** (technical paper, Eq. (quditloccopy)). The memory qudit $M_j$ is $\ket{\circ R}$ for
$b_j = 0$ and $\ket{\bullet R}$ for $b_j = 1$; it is classical and never changes.

$$\hat U^{loc}_{copy}(D_j \vert M_j) = \ket{\circ R}\bra{\circ R}_{M_j} \otimes \hat X^L_{D_j} + \ket{\bullet R}\bra{\bullet R}_{M_j} \otimes \hat I_{D_j} .$$

| stored bit | $\ket{\bullet R}_{D_j} \to$ | $\ket{\circ R}_{D_j} \to$ |
|---|---|---|
| $b_j = 1$ ($M_j = \bullet R$) | $\ket{\bullet R}$ | $\ket{\circ R}$ |
| $b_j = 0$ ($M_j = \circ R$) | $\ket{\circ R}$ | $\ket{\bullet R}$ |

The data walker arrives as $\bullet R$ and leaves carrying $b_j$; its colour is untouched.

**Where and when.** Inside the copy gates of the basic variant, with flags in
$\bullet R$:

$$\hat U^{(a)}_{copy} = \ket{\bullet R}\bra{\bullet R}_{D_0} \otimes \bigotimes_{j=1}^{m} \hat U^{loc}_{copy}(D_j \vert M^{(a)}_j) + \big(\hat I - \ket{\bullet R}\bra{\bullet R}\big)_{D_0} \otimes \hat I ,$$

and in cell-switch mode $\hat U_{on}(F \vert D_0)$, $\hat U_{off}(F \vert D_{m+1})$ toggle the
switch when their control is $\bullet R$. Windows and ticks are those of the
[global copy](gates.md#gate-copy-global), [switch on](gates.md#gate-cell-on),
[switched copy](gates.md#gate-copy-cell) and [switch off](gates.md#gate-cell-off).

**Intuition.** The memory changes the logical subspace of the data walker and leaves its
routing state alone: the walker stays red, ready for the inverse routing, and returns
through the $\hat S^\dagger$ of its new subspace (`qudit_long`) or the colour-only
$\hat S_{sr}^\dagger$ (`qudit_short`).

## Dual-rail address transmission Û⁽ᵈ⁾ {#gate-dr-U}

**Definition** (technical paper, Eq. (InfoTransmDual)). With $P_{d,r}$ the walkers ahead of $A_d$ on
rail $r$ and $T_{d,r}$ those behind it on rail $r$,

$$\hat U^{(d)} = \sum_{r,c} \hat I^{(P_{d,r})} \otimes \hat\Pi^{(A_d)}_{r,c} \otimes \hat V^{(T_{d,r})}_c = \hat U^{(d,\uparrow)} \oplus \hat U^{(d,\downarrow)}, \qquad \hat V^{(T_{d,r})}_R = \bigotimes_{j \in T_{d,r}} \hat X_j, \quad \hat V^{(T_{d,r})}_B = \hat I .$$

| control $A_d$ | action |
|---|---|
| $(r, R)$ | $\hat X$ on every walker behind $A_d$ on tree $r$; the walkers on the other tree are untouched |
| $(r, B)$, or no walker on the control site | identity |

**Where and when.** `dualrail_basic`. Two physical gates per edge, $\hat U^{(d,\uparrow)}$ on
the $\uparrow$ tree and $\hat U^{(d,\downarrow)}$ on the $\downarrow$ tree, each with the
window of the basic [Û⁽ᵈ⁾](gates.md#gate-U) (edge of $K - d + 1$ sites, control on the
last site), firing together at $t_d$ and $T_{total} - 1 - t_d$. Only the gate on the tree
of $A_d$ has a control; the other one finds its control site empty and does nothing. The
gate is its own adjoint.

**Intuition.** Each tree runs the bosonic $\hat U^{(d)}$ on its own walkers: on the
$\downarrow$ tree "$A_d$ present" means $a_d = 1$, on the $\uparrow$ tree $a_d = 0$.

## Dual-rail scattering Ŝ⁽↓⁾, Ŝ⁽↑⁾ {#gate-dr-S}

**Definition** (technical paper, Eqs. (ScattRail1), (ScattRail0); index order $(d,l)$ here):

$$\hat S^{(\downarrow)} \ket{\downarrow, c^{d,l}} = \ket{\downarrow} \otimes \hat S \ket{c^{d,l}} = \ket{\downarrow, R^{d+1,\,2l-\delta_{c,R}}}, \qquad \hat S^{(\uparrow)} \ket{\uparrow, c^{d,l}} = \ket{\uparrow} \otimes \hat S \hat X \ket{c^{d,l}} = \ket{\uparrow, R^{d+1,\,2l-\delta_{c,B}}} .$$

| in at $(d,l)$ | $\hat S^{(\downarrow)}$ on tree $\downarrow$ | $\hat S^{(\uparrow)}$ on tree $\uparrow$ |
|---|---|---|
| $R$ | left $(d+1, 2l-1)$, $R$ | right $(d+1, 2l)$, $R$ |
| $B$ | right $(d+1, 2l)$, $R$ | left $(d+1, 2l-1)$, $R$ |

Each gate acts only on its own tree and never changes the rail; the two differ by a
local colour flip.

**Backward crossings** use the adjoints, $\hat S^{(\downarrow)\dagger} = \hat S^\dagger$ and
$\hat S^{(\uparrow)\dagger} = (\hat S \hat X)^\dagger = \hat X \hat S^\dagger$. A red walker
arriving at a $\downarrow$ node continues red from the left child and blue from the right
child, as with the bosonic [Ŝ†](gates.md#gate-S-dag); at an $\uparrow$ node it is the other
way round, blue from the left child and red from the right one. In the ideal protocol
the following $\hat U^{(d,r)}$ resets the blue ones.

**Where and when.** At every node of both trees, passive: $2(2^n - 1)$ scattering gates.
**Intuition.** "Red = no instruction" sends $\downarrow$ walkers left and $\uparrow$ walkers
right; combined with $\hat U^{(d,r)}$, the followers of both trees take the same branch
([level table](variants.md#dualrail-basic)).

## Dual-rail copy {#gate-dr-copy}

**Definition** (technical paper, Eqs. (dual_rail_copy_mapping), (localmemorydualrail)). The data
arrive on $\downarrow$; the memory qubit stores the bit in a **colour**, $M_j = R$ for
$b_j = 0$ and $M_j = B$ for $b_j = 1$ (classical). Omitting the rail of $D_j$, which is
$\downarrow$:

$$\hat U^{loc}_{copy}(D_j \vert M_j) = \ket{R}\bra{R}_{M_j} \otimes \hat X_{D_j} + \ket{B}\bra{B}_{M_j} \otimes \hat I_{D_j} .$$

| stored bit | $\ket{\downarrow, R}_{D_j} \to$ |
|---|---|
| $b_j = 1$ ($M_j = B$) | $\ket{\downarrow, R}$ |
| $b_j = 0$ ($M_j = R$) | $\ket{\downarrow, B}$ |

**Where and when.** Inside the global copy (control $D_0 = (\downarrow, R)$ on its resting
site) or the cell switch ($\hat U_{on}$, $\hat U_{off}$ controlled by $(\downarrow, R)$), with
the windows and ticks of the basic variant, on the $\downarrow$ lane beside which the
memory qubits sit. Then the [output circuit](gates.md#gate-dr-out) fires.

**Intuition.** The copy does not move anything: it marks with a blue colour the data
walkers that must change rail, and the scattering stage of the cell does the moving.

## Output circuit Ŝ_M, Ŝ_M†, X̂_c {#gate-dr-out}

**Definition** (technical paper, §Memory operations of the dual-rail variant, Fig. (copy_dualrail)):

$$\hat S_M \ket{\downarrow, R} = \ket{\downarrow, R}, \quad \hat S_M \ket{\downarrow, B} = \ket{\mathrm{aux}, R}; \qquad \hat S_M^\dagger \ket{\uparrow, R} = \ket{\uparrow, R}, \quad \hat S_M^\dagger \ket{\mathrm{aux}, R} = \ket{\uparrow, B}; \qquad \hat X_c \ket{\uparrow, B} = \ket{\uparrow, R} .$$

| element | in | out |
|---|---|---|
| $\hat S_M$, on $\downarrow$ | $(\downarrow, R)$ / $(\downarrow, B)$ | $(\downarrow, R)$ / $(\mathrm{aux}, R)$ |
| $\hat S_M^\dagger$, merging $\uparrow$ and aux | $(\uparrow, R)$ / $(\mathrm{aux}, R)$ | $(\uparrow, R)$ / $(\uparrow, B)$ |
| $\hat X_c$, on $\uparrow$, data slots only | $(\uparrow, B)$ | $(\uparrow, R)$ |

Net effect on a data walker after the copy: bit 1, $(\downarrow, R) \to (\downarrow, R)$;
bit 0, $(\downarrow, B) \to (\mathrm{aux}, R) \to (\uparrow, B) \to (\uparrow, R)$. The engine
completes each element to a permutation ($\hat S_M$ swaps $(\downarrow, B) \leftrightarrow (\mathrm{aux}, R)$,
$\hat S_M^\dagger$ swaps $(\mathrm{aux}, R) \leftrightarrow (\uparrow, B)$, $\hat X_c$ swaps
$(\uparrow, B) \leftrightarrow (\uparrow, R)$); the extra terms never act in ideal runs.

**Where and when.** One circuit per cell, run during the query after the
copies (after the switch-off in cell-switch mode) as three clocked steps, one per tick:
$\hat S_M$, then $\hat S_M^\dagger$, both on every resting site of the lane, then $\hat X_c$
on the resting sites of the data slots only. Code names `S_M`, `S_M_dag`, `X_c`.

**Intuition.** $\hat S_M$, $\hat S_M^\dagger$ are a sorting and merging pair like the
node's $\hat S$, $\hat S^\dagger$: the first sorts by colour, the second merges two paths
and records in the colour which one the walker took. $\hat X_c$ erases that record; it
must be clocked so as to act only on the data walkers, because the other red $\uparrow$
walkers resting in the lane must not be flipped ([details](variants.md#dualrail-output)).

## Dual-rail backup gates {#gate-dr-backup}

**Definition** (technical paper, §Backup variant for dual-rail implementation). The gates of the
backup variant, placed on both trees and acting on the walkers of their own tree:

$$\hat U_{in}(\tilde A_d \vert A_d) = \sum_{r,c} \hat V^{(\tilde A_d^{(r)})}_c \otimes \hat\Pi^{(A_d)}_{r,c} = \hat U_{in}^{(\uparrow)} \oplus \hat U_{in}^{(\downarrow)}, \qquad \hat V_R = \hat X_{\tilde A_d^{(r)}}, \quad \hat V_B = \hat I ,$$

$$\hat U_B(\tilde W^{(r)}_{i+1}, W_{i+1} \vert \tilde W^{(r)}_i) = \sum_{c} \hat V^{(\tilde W^{(r)}_{i+1}, W_{i+1})}_c \otimes \hat\Pi^{(\tilde W^{(r)}_i)}_{r,c} = \hat U_B^{(\uparrow)} \oplus \hat U_B^{(\downarrow)}, \qquad \hat V_B = \hat X^{(r)}_{\tilde W^{(r)}_{i+1}} \otimes \hat X^{(r)}_{W_{i+1}}, \quad \hat V_R = \hat I .$$

$\hat X^{(r)}$ acts only on a walker of tree $r$: a carrier on the other tree is, seen from
$r$, an empty slot and is left alone, exactly as an empty slot in the bosonic
[Û_B](gates.md#gate-U-B). The backup copy is the analogue of the bosonic one (technical
paper, Eq. (backup_copy)), with the [dual-rail local copy](gates.md#gate-dr-copy):

$$\hat U_{copy}(D_j, M_j \vert \tilde D_{j-1}^\downarrow) = \ket{\downarrow, R}\bra{\downarrow, R}_{\tilde D_{j-1}^\downarrow} \otimes \hat U^{loc}_{copy}(D_j \vert M_j) + \big(\hat I - \ket{\downarrow, R}\bra{\downarrow, R}\big)_{\tilde D_{j-1}^\downarrow} \otimes \hat I ,$$

with $\tilde A_n^\downarrow$ in place of $\tilde D_0^\downarrow$ for $j = 1$.

| gate | control | targets | action |
|---|---|---|---|
| $\hat U_{in}$ | $A_d$ on tree $r$ | $\tilde A_d^{(r)}$ | control $R$: $\hat X$ |
| $\hat U_B$ | $\tilde W_i^{(r)}$ | $W_{i+1}$ (if on tree $r$), $\tilde W_{i+1}^{(r)}$ | control $B$: $\hat X \otimes \hat X$ |
| backup copy | $\tilde D_{j-1}^\downarrow$ ($\tilde A_n^\downarrow$ for $j = 1$) | $D_j$ | control $(\downarrow, R)$: local copy |

**Where and when.** `dualrail_backup`, 4-site edges on both trees. The two backups of a
carrier stand one site behind it on the two trees, so the windows are those of the
backup variant: $\hat U_{in}$ with control on site 3 and target on site 2 (one backup per
tree), at $X(d,3)$ plus the path offset $2(d-1)$ of $A_d$; $\hat U_B$ with control on site
4 and targets on sites 3 (the next carrier) and 2 (its backups), every two ticks, for the
controls $\tilde A_d, \dots, \tilde A_n, \tilde D_1, \dots, \tilde D_{m-1}$. Each fires on both
trees; the gate on the tree without an active control does nothing. One $\hat U_{in}$,
one $\hat U_B$ and one $\hat S^{(r)}$ per node and tree: $6(2^n - 1)$ gates. The backup copy
has its control on the resting site of the $\downarrow$ backup and its target on that of
$D_j$, at $T_{fwd} + j - 1$ (all at $T_{fwd}$ without stagger), and is followed by the
[output circuit](gates.md#gate-dr-out).

**Intuition.** Two copies of the backup protocol, one per tree, run side by side without
ever interacting; between them they carry the bit of $A_d$ to every follower, whichever
tree it is on. Only the $\downarrow$ backups control the copy, because the data arrive on
$\downarrow$.
