# Variants

The paper proposes six variants that share the same routing logic (an address walker
steers the walkers behind it, a passive scattering gate routes them) and differ in the
carriers, the interaction range and the memory access. The simulator runs all six: the
**basic** variant with its two copy modes, the **backup** variant, the two **qudit**
variants and the two **dual-rail** variants. A [resource comparison](variants.md#comparison)
and the list of what is [not simulated](variants.md#other-variants) close the page.

## Basic variant {#basic}

The pedagogical baseline of the paper: bosonic walkers (for instance single photons),
one tree, long-range address transmission.

| item | basic variant |
|---|---|
| local states | $\varnothing$ (no walker), $R$, $B$ |
| train, front to tail | $A_1 \dots A_n,\ D_0,\ D_1 \dots D_m$ (+ $D_{m+1}$ in cell-switch mode) |
| slots | $K = n + m + 1$ (+1) |
| encoding | $a_i = 1 \mapsto \ket{R}$, $a_i = 0 \mapsto \ket{\varnothing}$; $D_0$, $D_j$, $D_{m+1}$ start $\ket{R}$ |
| edges | $n_{\text{sites}}(d) = K - d + 1$; memory lanes of $K$ sites |
| routing gates | $\hat U^{(d)}$ on every edge of level $d$, $\hat S$ at every node |
| inverse routing | $\hat S^\dagger$ at every node, the same $\hat U^{(d)}$ gates |
| memory access | global copy or cell switch (below) |

**Definition.** Routing applies, for $d = 1, \dots, n$, the
[address-transmission gate](gates.md#gate-U) $\hat U^{(d)}(T_d \vert A_d)$, which flips
the colour of every walker behind $A_d$ when $A_d$ is red, followed by the
[scattering gate](gates.md#gate-S) $\hat S$. The query copies $b^{(a)}$ into the data
walkers; the inverse routing is the exact time reversal of the routing
([protocol](protocol.md#inverse)). The ideal output is Eq. (1),

$$\sum_a \alpha_a \ket{a}_A \ket{b^{(a)}}_D , \qquad \ket{0} \equiv \ket{\varnothing},\ \ket{1} \equiv \ket{R},$$

with $D_0$ (and $D_{m+1}$) red and every walker back on the port line in its slot order.

**Parameters.** $n$ (address bits, tree depth), $m$ (bits per cell), the copy mode, the
input superposition $\{\alpha_a\}$ and the memory content $\{b^{(a)}\}$.

**Timing.** $\hat U^{(d)}$ fires at $t_d = X(d, n_{\text{sites}}(d)) + d - 1$, when $A_d$
stands on the last site of its edge, and again at $T_{total} - 1 - t_d$ in the inverse
routing; the copy gates fire during the query (see the copy modes below).

**Intuition.** Each address walker hands its bit to every walker behind it in one shot;
the simplest way to see the whole mechanism, at the price of a gate acting on up to
$K - 1$ walkers at once (in optics, a highly nonlinear interaction between photons;
technical paper, §Address-transmission gate).

**Resources quoted by the paper** (technical paper, §Basic variant, Resource scaling): at most
$n + m + 1$ walkers, $2(2^n - 1)$ gates, $n_{\text{sites}}^d = n + m - d$, path extent
$\sum_d (n + m - d) = (n^2 + n(2m-1))/2$ (Eq. (StandardSitesScaling)), depth
$\mathcal{O}(n(n+m))$. The simulator's counts are compared in [metrics](metrics.md#resources).
Because a 0 is encoded by the absence of a walker, the particle number differs between
branches of a superposition.

Paper: technical paper, §Basic variant (Encoding and initialization, Routing operations, Memory
Operations, Inverse routing, Resource scaling); arXiv main text and appendix §Technical
description of the qRAM.

### Options {#options}

* **Query stagger** (default on): the copies fire one data walker per tick. Off: all
  copies fire in one tick; they commute, so the result is the same.
* **Query** (default on): off skips the query. The run is then routing followed
  immediately by its time reversal, and the output must equal the input with every
  walker leaving the tree (a test of the time reversal).
* **Edge lengths**: `n_sites` can be overridden per level and for the lanes. A lane must
  have at least $K$ sites. An edge shorter than $K - d + 1$ makes $\hat U^{(d)}$ miss the
  last slots; the engine warns that Eq. (1) is then not expected to hold.
* **Strict mode** checks the runtime invariants of the ideal protocol: slot timing
  $x = t - k$, at most one walker per site, walkers red before $\hat U^{(d)}$ in routing
  and after it in inverse routing, no blue walker in a lane, dispersed address walkers
  never targeted again, cell switches off after the query.
* **Memory fill**: zeros, ones, random (seeded), identity (cell $a$ stores the $m$ least
  significant bits of $a$), or explicit bits per cell.
* **Presets**: E1 and E2 (arXiv appendix examples), E1b ($b^{(10)} = 0$), E1-switch
  (E1 with the cell switch), demo-uniform ($n = 3$, $m = 2$, all eight addresses).

## Global copy {#copy-global}

`copy_mode = global` (default). The flag walker $D_0$ controls one gate per cell that
applies the [local copy](gates.md#gate-copy-loc) to every data walker
(technical paper, Eq. (GlobCopy)):

$$\hat U^{(a)}_{copy} = \ket{R}\bra{R}_{D_0} \otimes \bigotimes_{j=1}^{m} \hat U^{loc}_{copy}(D_j \vert M^{(a)}_j) + \big(\ket{\varnothing}\bra{\varnothing} + \ket{B}\bra{B}\big)_{D_0} \otimes \hat I .$$

**In the simulator.** The gate is placed in every memory lane and split into $m$ commuting
instances, one per data walker ([gate details](gates.md#gate-copy-global)): the instance
for $D_j$ fires at tick $T_{fwd} + j - 1$, with control on the resting site of $D_0$
(lane site $K - n$) and target on the resting site of $D_j$ (lane site $K - n - j$).
Their product is the paper's single gate. $T_q = m$ (1 without stagger).

**Intuition.** $D_0$ is red exactly in the lane(s) reached by the data walkers; it is the
key that unlocks the memory there and nowhere else.

**Cost.** One walker more than the address and data bits; one gate per cell, acting on
$m+1$ walkers at once (long range).

Paper: technical paper, §Memory Operations, Global Controlled COPY operation, Eqs. (copyMapping),
(GlobCopy), Fig. (copy_standard) (a)–(d).

## Cell-switch copy {#copy-cell-switch}

`copy_mode = cell_switch`. Each cell has a two-level switch $F \in \{\text{off}, \text{on}\}$,
initially off and part of the quantum state, and the train gains a delimiter walker
$D_{m+1}$ at its tail. Three gates act in sequence (technical paper, Eq. (activeCellCopy)
and the unnumbered equations after it):

1. [$\hat U_{on}(F \vert D_0)$](gates.md#gate-cell-on): if $D_0$ is red, toggle $F$
   (off $\to$ on). Tick $T_{fwd}$.
2. [$\hat U_{copy}(F)$](gates.md#gate-copy-cell): while $F$ is on, apply
   $\hat U^{loc}_{copy}(D_j \vert M_j)$. One instance per data walker, tick $T_{fwd} + j$.
3. [$\hat U_{off}(F \vert D_{m+1})$](gates.md#gate-cell-off): if $D_{m+1}$ is red, toggle
   $F$ (on $\to$ off). Tick $T_{fwd} + m + 1$.

$T_q = m + 2$ (3 without stagger). In the ideal protocol every switch is off again at the
end of the query, in every branch; a branch with a switch left on is not well formed
([success](metrics.md#success)).

**Intuition.** Instead of one controlled gate spanning $m+1$ walkers, each gate couples a
single walker to its cell: $D_0$ opens the cell, the data walkers are copied one by one,
$D_{m+1}$ closes it so that the cell keeps no record of the query.

| | global copy | cell switch |
|---|---|---|
| extra walkers | $D_0$ | $D_0$, $D_{m+1}$ |
| $K$ | $n + m + 1$ | $n + m + 2$ |
| $T_q$ (staggered / not) | $m$ / 1 | $m + 2$ / 3 |
| gates per cell | 1 (on $m+1$ walkers) | 3 kinds, one walker each, plus the switch |

Paper: technical paper, §Memory Operations, COPY operation through memory cell activation,
Eq. (activeCellCopy), Fig. (copy_standard) (e)–(h).

## Backup variant {#backup}

`variant = backup` (technical paper, §Backup variant; arXiv appendix C). The long-range gate
$\hat U^{(d)}$ of the basic variant needs an interaction between $A_d$ and every walker
behind it. The backup variant replaces it with gates acting on at most three
neighbouring walkers, at the price of doubling the train.

**Train.** Every walker is followed by a *backup*:
$$A_1, \tilde A_1, A_2, \tilde A_2, \dots, A_n, \tilde A_n, D_1, \tilde D_1, \dots, D_m, \tilde D_m ,$$
$K = 2(n+m)$ slots (front first). The address walkers are encoded as in the basic
variant ($a_i = 1 \to \ket{R}$, $a_i = 0 \to \ket{\varnothing}$); every backup and every
data walker starts red. There is no flag walker. The last data backup $\tilde D_m$ never
controls anything and can be dropped (option **last data backup** off,
`include_last_backup = false`): $K = 2(n+m) - 1$, the count of the arXiv appendix.

**Edges.** Every edge has 4 sites, at every level (technical paper, §Depth reduction);
memory lanes have $K$ sites as in the basic variant.

**Routing at level $d$.** Two short-range gates replace $\hat U^{(d)}$:

1. [$\hat U_{in}(\tilde A_d \vert A_d)$](gates.md#gate-U-in), once: when $A_d$ stands on
   site 3 and its backup on site 2, a red $A_d$ flips $\tilde A_d$ to blue.
2. [$\hat U_B(W_{i+1}, \tilde W_{i+1} \vert \tilde W_i)$](gates.md#gate-U-B), every two
   ticks: the backup on site 4, if **blue**, flips the walker and the backup on sites 3
   and 2. The new blue backup reaches site 4 two ticks later and repeats the step. The
   controls are $\tilde A_d, \dots, \tilde A_n, \tilde D_1, \dots, \tilde D_{m-1}$:
   $n + m - d$ firings in all.

After the chain every walker behind $A_d$ carries the colour $\hat U^{(d)}$ would have
given it, and $\hat S$ routes the train exactly as in the basic variant. Example
(preset E3, $a = 10$, level 1): $\hat U_{in}$ turns $\tilde A_1$ blue; $\hat U_B$ with
control $\tilde A_1$ turns $\tilde A_2$ blue ($A_2$ is empty and stays empty); with control
$\tilde A_2$ it turns $D_1, \tilde D_1$ blue; with control $\tilde D_1$ it turns $D_2$ blue.

**Inverse routing** is the exact time reversal: at each level the $\hat U_B$
fire again tail-first and $\hat U_{in}$ last, which resets every backup. A front-first
replay would fail: $\hat U_{in}$ would turn $\tilde A_d$ red before it controls the first
$\hat U_B$, and followers would stay blue where $a_d = 1$.

| | basic | backup |
|---|---|---|
| walkers | $n + m + 1$ | $2(n+m)$ |
| gates per node | $\hat U^{(d)}$, $\hat S$ | $\hat U_{in}$, $\hat U_B$, $\hat S$ |
| interaction range | whole edge | 3 neighbouring walkers |
| sites per edge | $K - d + 1$ (paper $n + m - d$) | 4 |
| routing ticks $T_{fwd}$ | $n^2/2 + nm + \mathcal{O}(n+m)$ | $6n + 2m$ |

Paper: technical paper, §Backup variant (Encoding and initialization, Address-transmission gate
decomposition, Memory operations, Depth reduction, Resource scalings).

### Pipelining {#pipelining}

Because the edges are short and every gate touches at most three walkers, the train is
spread over several levels at once and the gates of consecutive levels fire in the same
ticks. In the simulator this is not scheduled separately: each gate fires when the clock
says its control stands on its control site, and the overlap follows. The bullets of the
technical paper, §Depth reduction, are reproduced literally (test E4): when $\hat U_{in}$ fires at level
$d$, $A_d$, $\tilde A_d$, $A_{d+1}$ stand on sites 3, 2, 1; two ticks later $\hat U_B$
acts on $(A_{d+1}, \tilde A_{d+1} \vert \tilde A_d)$ while $A_d$ enters level $d+1$;
six ticks after $\hat U_{in}$ at level $d$, $\hat U_B$ at level $d$ and $\hat U_{in}$ at
level $d+1$ fire together, and from then on the $\hat U_B$ of both levels run in
parallel. Watch it with preset E4 and step mode *Gate*: several windows flash in the
same tick.

The result is a depth linear in $n$ and $m$: the engine's routing takes
$T_{fwd} = 4n + K = 6n + 2m$ ticks, exactly the paper's $T_{\text{parallel}}$.

## Backup copy {#copy-backup}

`copy_mode = backup`, the only copy mode of the backup variant (technical paper, Eq. (backup_copy)).
Each data walker is copied under the control of the backup in front of it:
[$\hat U_{copy}(D_j, M_j \vert \tilde D_{j-1})$](gates.md#gate-copy-backup), with
$\tilde A_n$ as the control of $D_1$. All walkers arrive red in the lanes, but the backups
are present only in the lane(s) the train reached, so the copy happens there and nowhere
else, with nearest-neighbour gates and no flag walker. One instance per data walker,
tick $T_{fwd} + j - 1$; $T_q = m$ (1 without stagger).

## Qudit walkers {#qudit}

The two qudit variants (technical paper, §Qudit variant) and the two dual-rail variants are
*particle conserving*: a 0 is no longer the absence of a walker but an internal state of
a walker that is always there. In the qudit variants every slot holds a four-level walker
whose states are a **logical bit** times the **routing colour**,

$$\mathcal H_S = \mathcal H_S^{(\circ)} \oplus \mathcal H_S^{(\bullet)}, \qquad \mathcal H_S^{(\circ)} = \mathrm{span}\{\ket{\circ R}, \ket{\circ B}\}, \quad \mathcal H_S^{(\bullet)} = \mathrm{span}\{\ket{\bullet R}, \ket{\bullet B}\},$$

with $\circ$ (hollow) a logical 0 and $\bullet$ (filled) a logical 1; the technical paper labels the
four states $\ket{1}, \dots, \ket{4}$ and draws them as hollow and filled circles in the
routing colour. The colour keeps the meaning it has in the bosonic variants, a which-way
instruction written by the address-transmission gates and consumed (reset to red) by the
scattering gate. The logical bit takes over the role of presence: it is the information
carried.

| item | qudit variants |
|---|---|
| local states | ○R, ○B, ●R, ●B (in the trajectory files `oR`, `oB`, `fR`, `fB`) |
| train, front to tail | $A_1 \dots A_n,\ D_0,\ D_1 \dots D_m$ (+ $D_{m+1}$ in cell-switch mode), as in the basic variant |
| slots | $K = n + m + 1$ (+1); every slot holds a walker in every branch |
| encoding | $a_i = 0 \mapsto \ket{\circ R}$, $a_i = 1 \mapsto \ket{\bullet R}$; $D_j$, $D_0$, $D_{m+1}$ start in $\ket{\bullet R}$ |
| memory | $M_j = \ket{\circ R}$ for $b_j = 0$, $\ket{\bullet R}$ for $b_j = 1$ (classical) |
| copy | the [logical NOT](gates.md#gate-qudit-copy) $\hat X^L$ on $D_j$ where $M_j = \circ R$ |
| copy modes | global (flag $D_0 = \bullet R$) or cell switch ($D_0$, $D_{m+1}$ in $\bullet R$ toggle $F$) |
| ideal output | $\sum_a \alpha_a \ket{a}_A \ket{b^{(a)}}_D$ with $0 \equiv \ket{\circ R}$, $1 \equiv \ket{\bullet R}$; flags back in $\ket{\bullet R}$ |

The copy modes are those of the basic variant ([global](variants.md#copy-global),
[cell switch](variants.md#copy-cell-switch)) with "red flag" read as "flag in
$\ket{\bullet R}$"; the technical paper triggers the copy "by an additional flag qudit or by the
activation of the cell degree of freedom". The data walkers start as logical 1 and the
copy turns them into logical 0 where the cell stores 0, exactly as in the basic variant
with $\varnothing$ replaced by $\circ$.

Since no slot is ever empty, every branch of a superposition carries the same number of
walkers, there are no ghosts, and a lost walker can no longer pass for a valid 0. The technical paper
maps the qudit one to one onto the dual-rail encoding: $\circ \leftrightarrow\ \uparrow$,
$\bullet \leftrightarrow\ \downarrow$, same colour. The qudit variants are the dual-rail
variants folded onto a single tree, with the rail turned into an internal degree of
freedom. A walker can still be lost: see the [noise models on these
alphabets](noise.md#noise-families).

## Qudit, long range {#qudit-long}

`variant = qudit_long` (technical paper, §Qudit variant, Long-range routing operations). The direct
transcription of the basic variant: edges of $K - d + 1$ sites, one long-range
address-transmission gate per edge, one scattering gate per node, memory lanes of $K$
sites.

**Routing at level $d$.** The [address-transmission gate](gates.md#gate-qudit-U)
$\hat U^{(d)} = \hat U^{(d)}_\circ \oplus \hat U^{(d)}_\bullet$: a red $A_d$ flips the colour
of every follower **in its own logical subspace** and leaves the followers of the other
subspace alone. Then the [subspace-dependent scattering gate](gates.md#gate-qudit-S) routes
$\bullet$ walkers like the bosonic $\hat S$ (red left, blue right) and $\circ$ walkers
mirrored (red right, blue left), resetting the colour to red in both subspaces:

| | $a_d = 0$: $A_d = \circ R$ | $a_d = 1$: $A_d = \bullet R$ |
|---|---|---|
| $\hat U^{(d)}$ | $\circ$ followers $\to \circ B$; $\bullet$ followers stay $\bullet R$ | $\bullet$ followers $\to \bullet B$; $\circ$ followers stay $\circ R$ |
| $\hat S$ on the followers | $\circ B \to$ left, $\bullet R \to$ left | $\bullet B \to$ right, $\circ R \to$ right |
| $\hat S$ on $A_d$ | $\circ R \to$ right | $\bullet R \to$ left |

**Why it works.** Whatever logical value a follower carries, it takes branch $a_d$: the
two subspaces receive opposite instructions and scatter in opposite ways, and the two
inversions cancel. The control always takes the other branch and leaves the train, as a
red $A_d$ does in the basic variant; since nothing targets it afterwards it keeps turning
the same way and
rests in cell $a_1 \dots a_{d-1}$ followed by $n - d + 1$ copies of $\bar a_d$. On the
way back, a data walker whose logical value the copy has changed returns through the
$\hat S^\dagger$ of its new subspace, which writes exactly the colour that the following
$\hat U^{(d)}$ erases: after it every follower is red again, and the address register is
recollected as in the basic variant.

The orientation of $\hat S$ is that of the dual-rail scattering gates, through
$\circ \leftrightarrow\ \uparrow$, $\bullet \leftrightarrow\ \downarrow$, so that the followers
take branch $a_d$ as in every other variant ([FAQ](faq.md#faq-qudit-orientation)).

**Worked example** (preset `qudit-long`): $(\ket{00} + \ket{11})/\sqrt2$, $n = 2$,
$m = 1$, $b^{(00)} = 1$, $b^{(11)} = 0$, the input of preset E2.

* Branch $00$, $A_1 = A_2 = \circ R$. $\hat U^{(1)}$ turns $A_2$ into $\circ B$ and leaves
  $D_0$, $D_1$ ($\bullet R$) alone; $\hat S$ sends $A_1$ right and $A_2$, $D_0$, $D_1$
  left. At level 2 no follower of $A_2$ is in $\circ$: nothing flips; $A_2$ goes right,
  $D_0$, $D_1$ left into cell $00$. The cell stores 1: $D_1$ stays $\bullet R$.
* Branch $11$, $A_1 = A_2 = \bullet R$. $\hat U^{(1)}$ turns $A_2$, $D_0$, $D_1$ blue;
  $\hat S$ sends $A_1$ left, the rest right. $\hat U^{(2)}$ turns $D_0$, $D_1$ blue again;
  $A_2$ goes left, the data right into cell $11$. The cell stores 0: $\hat X^L$ turns
  $D_1$ into $\circ R$.
* Output (tail to front):
  $\big(\ket{\bullet R}_{D_1} \ket{\bullet R}_{D_0} \ket{\circ R}_{A_2} \ket{\circ R}_{A_1} + \ket{\circ R}_{D_1} \ket{\bullet R}_{D_0} \ket{\bullet R}_{A_2} \ket{\bullet R}_{A_1}\big)/\sqrt2$,
  the output of E2 with $\varnothing$ replaced by $\circ$ and $R$ by $\bullet R$.

**Resources quoted by the paper** (technical paper, §Qudit variant, Resource scalings): $n + m$
walkers (+ flags), $2(2^n - 1)$ gates, path extent $n(n+m) - n(n+1)/2$, depth
$\mathcal{O}(n(n+m))$. The engine's timing is that of the basic variant:
$T_{total} = n^2 + 2nm + 5n + 3m + 2$ with the staggered global copy.

## Qudit, short range {#qudit-short}

`variant = qudit_short` (technical paper, §Qudit variant, Short-range routing operations). The larger
alphabet lets the address bit travel down the train with nearest-neighbour gates and
**without backups**: the train keeps $K = n + m + 1$ slots (+1 with the cell switch) and
every edge has 2 sites.

**Routing at level $d$** ([gate details](gates.md#gate-qudit-short)):

1. $\hat U_{in}(A_{d+1} \vert A_d)$, once: control on site 2, target on site 1. If $A_d$
   carries a logical 1 ($\bullet$, either colour), the colour of $A_{d+1}$ is flipped,
   whatever its logical value; if $A_d$ is $\circ$ nothing happens. The logical bit of
   $A_d$ becomes a colour on its follower.
2. $\hat U_B(W_{i+1} \vert W_i)$, once per tick on the same window: if the walker on site
   2 is **blue** (either logical value), the colour of the walker on site 1 is flipped.
   The train moves one site per tick, so the next pair is in the window at the next tick;
   the controls run from $A_{d+1}$ to the walker before the tail, $K - d - 1$ firings
   (the technical paper's $t_B = n + m - 2$ at $d = 1$, counted without the flag).
3. $\hat S_{sr}$ routes by colour only: red left, blue right (reset to red), logical value
   kept.

After step 2 every walker behind $A_d$ is blue exactly when $a_d = 1$, so the train
behind $A_d$ takes branch $a_d$. $A_d$ itself is never flipped: it stays red and turns
left, at this node and at every later one.

**Why no backups are needed.** In the bosonic backup variant a 0 is an empty slot, and
an empty slot cannot control the next step of a nearest-neighbour chain: the chain would
break at the first 0, which is why every carrier there is escorted by an always-present
backup. Here every walker is always present and carries the routing instruction in its
colour independently of its logical value, so each walker can pass the instruction to
the next one: the $\hat U_B$ chain never meets a gap. The price is a control on a
four-level system ($\hat U_{in}$ reads the logical value, $\hat U_B$ the colour). Since
the target keeps its logical value, $A_{d+1}$ can act as the first link of the chain of
level $d$ and still carry $a_{d+1}$ to level $d+1$.

**Pipelining and depth.** As in the backup variant, the train spans several 2-site edges
and the gates of consecutive levels fire in the same ticks. The engine's routing takes
$T_{fwd} = 2n + K = 3n + m + 1$ ticks and $T_{total} = 6n + 3m + 2$ (staggered global
copy); the paper's $T_{\text{parallel}} = 5n + 2m$ assumes a memory cell the train passes
through, while here the train rests in the lane. This is the most economical variant of
the paper: no carrier overhead and range-1 gates only.

**Worked example** (preset `qudit-short`): $n = 2$, $m = 1$, $a = 10$, $b^{(10)} = 1$.
The train is $A_1 = \bullet R$, $A_2 = \circ R$, $D_0 = D_1 = \bullet R$.

* Level 1. $A_1$ is $\bullet$, so $\hat U_{in}$ turns $A_2$ into $\circ B$ (still a 0,
  now blue). $\hat U_B$ with control $A_2$ turns $D_0$ into $\bullet B$, then with control
  $D_0$ turns $D_1$ into $\bullet B$. $\hat S_{sr}$: $A_1$ (red) goes left, $A_2$, $D_0$,
  $D_1$ (blue) go right and are reset to red.
* Level 2. $A_2$ is $\circ$, so $\hat U_{in}$ does nothing and $D_0$ stays red: the
  chain does nothing. $\hat S_{sr}$ sends $A_2$, $D_0$, $D_1$ left, into lane $(3,3)$:
  cell $\ket{10}$.
* Query. $D_0 = \bullet R$ enables the copy; $M_1 = \bullet R$ (bit 1), so $D_1$ stays
  $\bullet R$. Output: $\ket{\bullet R}_{D_1} \ket{\bullet R}_{D_0} \ket{\circ R}_{A_2} \ket{\bullet R}_{A_1}$.

Compare with preset E1: the same route, with $A_2$ a $\circ$ walker travelling with the
data instead of an empty slot.

## Dual-rail walkers {#dualrail}

The dual-rail variants (technical paper, §Dual-rail implementations) use two identical binary trees,
the rails: $\uparrow$ for logical 0 and $\downarrow$ for logical 1. A walker's local state
$\ket{r, c}$ is its rail $r$, i.e. the tree it moves on, and its routing colour $c$. Every
walker is always present on exactly one tree, so the bit is encoded in *where* the walker
is, not in *whether* it is there.

| item | dual-rail variants |
|---|---|
| local states | $(\uparrow, R)$, $(\uparrow, B)$, $(\downarrow, R)$, $(\downarrow, B)$ (files: `uR`, `uB`, `dR`, `dB`), plus $(\mathrm{aux}, R)$ for one tick in the cell output circuit |
| encoding | $a_i = 0 \mapsto \ket{\uparrow, R}$, $a_i = 1 \mapsto \ket{\downarrow, R}$; data (and flags) start in $\ket{\downarrow, R}$ |
| memory | $M_j = R$ for $b_j = 0$, $B$ for $b_j = 1$: a colour, beside the $\downarrow$ lane |
| gates | on both trees, each acting only on the walkers of its own tree; $\hat S^{(\downarrow)} = \hat S$, $\hat S^{(\uparrow)} = \hat S \hat X$ |
| coupling of the trees | only the [output circuit](variants.md#dualrail-output) of the cells |
| ideal output | $\sum_a \alpha_a \ket{a}_A \ket{b^{(a)}}_D$ with $0 \equiv \ket{\uparrow, R}$, $1 \equiv \ket{\downarrow, R}$ |

**Photographic negatives.** Read the $\downarrow$ tree alone: a 1 is a walker present on
it, a 0 a walker absent from it, and its gates are those of the bosonic variant. The
$\downarrow$ tree runs exactly the basic (or backup) protocol. The $\uparrow$ tree runs the
same protocol with presence complemented (a walker on $\uparrow$ is a 0) and with the
scattering mirrored, $\hat S^{(\uparrow)} = \hat S \hat X$: red goes right. With these two
choices, "no instruction" (a red follower on a tree where $A_d$ is absent) sends the
follower to the same branch as "instruction" on the other tree, and the two trees always
agree on where the train goes. The technical paper calls them "photographic negatives" of each other.

**Correspondence with the qudit variants.** $(\uparrow, c) \leftrightarrow \circ c$,
$(\downarrow, c) \leftrightarrow \bullet c$; $\hat U^{(d,\uparrow)}$, $\hat U^{(d,\downarrow)}$
are $\hat U^{(d)}_\circ$, $\hat U^{(d)}_\bullet$, and $\hat S^{(\uparrow)}$, $\hat S^{(\downarrow)}$
are the two blocks of the qudit $\hat S$. The difference is physical: here the logical
subspace is a spatial mode, so the copy has to move a walker from one tree to the other.

The paper prepares the walkers on a single input rail and splits them onto the two trees
with a scattering gate $\hat S^{(in)}$; the simulator starts with the walkers already on
their rails (see [not simulated](variants.md#other-variants)). For the noise
models on these variants see [the three alphabets](noise.md#noise-families).

## Dual-rail, basic {#dualrail-basic}

`variant = dualrail_basic` (technical paper, §Dual-rail implementations; Eqs. (InfoTransmDual),
(ScattRail1), (ScattRail0)). The basic variant on two trees, with long-range gates.

**Train and geometry.** $A_1 \dots A_n,\ D_0,\ D_1 \dots D_m$ (+ $D_{m+1}$ in cell-switch
mode), $K = n + m + 1$ (+1), every slot always occupied; edges of $K - d + 1$ sites and
lanes of $K$ sites on both trees.

**Routing at level $d$.** On each tree $r$, the
[address-transmission gate](gates.md#gate-dr-U) $\hat U^{(d,r)}$ with the window of the
basic $\hat U^{(d)}$: a red $A_d$ on tree $r$ flips the colour of every follower on tree
$r$. The gate of the other tree has no control and does nothing. Then the
[scattering gates](gates.md#gate-dr-S) $\hat S^{(r)}$:

| | $a_d = 0$: $A_d = (\uparrow, R)$ | $a_d = 1$: $A_d = (\downarrow, R)$ |
|---|---|---|
| $\hat U^{(d)}$ | $\uparrow$ followers $\to (\uparrow, B)$; $\downarrow$ followers untouched | $\downarrow$ followers $\to (\downarrow, B)$; $\uparrow$ followers untouched |
| $\hat S$ on the followers | $(\uparrow, B) \to$ left, $(\downarrow, R) \to$ left | $(\downarrow, B) \to$ right, $(\uparrow, R) \to$ right |
| $\hat S$ on $A_d$ | $(\uparrow, R) \to$ right | $(\downarrow, R) \to$ left |

The followers of both trees take branch $a_d$ in step; the train reaches the same cell
on both trees.

**Query.** The data arrive on the $\downarrow$ lane of the addressed cell. The copy is the
basic one, global (flag $D_0 = (\downarrow, R)$) or cell switch, with the dual-rail
[local copy](gates.md#gate-dr-copy): $D_j$ turns blue where the cell stores 0. The
[output circuit](variants.md#dualrail-output) then moves the blue data walkers onto the
$\uparrow$ tree. $T_q = m + 3$ with the staggered global copy ($m + 5$ with the cell
switch).

**Inverse routing** is the exact time reversal on both trees. A data walker that changed
rail in the cell comes back on $\uparrow$: through $(\hat S \hat X)^\dagger = \hat X \hat S^\dagger$
it arrives at each level with the colour that $\hat U^{(d,\uparrow)}$ expects, and if no
$\uparrow$ address walker is there to control it, it arrives red and passes untouched.

**Worked example** (preset `dualrail`): the input and memory of the qudit example,
$(\ket{00} + \ket{11})/\sqrt2$, $b^{(00)} = 1$, $b^{(11)} = 0$.

* Branch $00$: $A_1 = A_2 = (\uparrow, R)$, data on $\downarrow$. $\hat U^{(1,\uparrow)}$
  turns $A_2$ blue; the $\downarrow$ walkers are untouched. $\hat S^{(\uparrow)}$ sends
  $A_1$ right and $A_2$ left, $\hat S^{(\downarrow)}$ sends $D_0$, $D_1$ left. At level 2
  $A_2$ has no follower on $\uparrow$: it goes right, the data go left into cell $00$,
  which stores 1: $D_1$ stays $(\downarrow, R)$.
* Branch $11$: every walker is on $\downarrow$, which runs the basic protocol with all
  bits 1; the data reach cell $11$. The stored 0 turns $D_1$ blue and the output circuit
  moves it to the $\uparrow$ tree, red. It returns on $\uparrow$, where there is no
  address walker in this branch: it arrives red at every level and passes untouched.
* Output: $\big(\ket{\downarrow R}_{D_1} \ket{\downarrow R}_{D_0} \ket{\uparrow R}_{A_2} \ket{\uparrow R}_{A_1} + \ket{\uparrow R}_{D_1} \ket{\downarrow R}_{D_0} \ket{\downarrow R}_{A_2} \ket{\downarrow R}_{A_1}\big)/\sqrt2$.

**Resources quoted by the paper** (technical paper, §Dual-rail, Resource scaling): $n + m + 1$
walkers, two trees, $4(2^n - 1)$ gates, path extent per tree $(n^2 + 2nm - n)/2$, depth
$T_{serial} = T_{prep} + T_{rout} = (n^2 + 2nm + n + 2m)/2$. Engine:
$T_{total} = n^2 + 2nm + 5n + 3m + 5$, the basic count plus the three ticks of the
output circuit.

## Output circuit of the cells {#dualrail-output}

In both dual-rail variants the data walkers arrive at the cell on $\downarrow$, red. After
the copy $D_j$ is $(\downarrow, R)$ where $b_j = 1$ and $(\downarrow, B)$ where $b_j = 0$;
the dual-rail encoding of the result wants the 0s on $\uparrow$, red. Each cell has a small
circuit that does this (technical paper, §Memory operations of the dual-rail variant,
Fig. (copy_dualrail)):

1. [$\hat S_M$](gates.md#gate-dr-out) on the $\downarrow$ lane, a scattering gate:
   $(\downarrow, R)$ stays on $\downarrow$; $(\downarrow, B)$ is diverted to an auxiliary
   rail and reset to red, $(\mathrm{aux}, R)$.
2. $\hat S_M^\dagger$ merges $\uparrow$ and the auxiliary rail into $\uparrow$:
   $(\uparrow, R)$ stays as it is, $(\mathrm{aux}, R)$ joins $\uparrow$ as
   $(\uparrow, B)$, the colour recording where it came from (like $\hat S^\dagger$ at a node).
3. $\hat X_c$ on $\uparrow$, a clocked colour flip that fires only in the time slots of
   the data walkers: $(\uparrow, B) \to (\uparrow, R)$.

Net effect on a data walker: $b_j = 1 \mapsto (\downarrow, R)$, $b_j = 0 \mapsto (\uparrow, R)$.
The copy exchanges rails, and every walker leaves the cell red, ready for the inverse
routing.

**Why $\hat X_c$ fires only in the data slots.** Other walkers on $\uparrow$ can rest in
a lane: dispersed address walkers and, in `dualrail_backup`, the $\uparrow$ backups. They
are red and must stay red; a colour flip applied to every $\uparrow$ walker would turn
them blue. $\hat S_M$ and $\hat S_M^\dagger$ instead may act on every walker of the lane:
after the copy only data walkers can be blue on $\downarrow$, and nothing is on the
auxiliary rail before $\hat S_M$.

**In the simulator.** The paper's circuit is traversed by the moving
train; here the walkers rest in the lane during the query, so the circuit
runs as three clocked steps after the copies, one tick each: $\hat S_M$ and
$\hat S_M^\dagger$ on every resting site of the lane, then $\hat X_c$ on the resting sites
of the data slots. They add 3 ticks to $T_q$. A walker is on the auxiliary rail only
between the first two steps; the viewer draws it there with a dashed outline
([interface](ui.md#ui-dualrail)).

## Dual-rail, backup {#dualrail-backup}

`variant = dualrail_backup` (technical paper, §Backup variant for dual-rail implementation). The
short-range dual-rail scheme: each tree runs the single-tree
[backup variant](variants.md#backup).

**Why two backups per carrier.** The technical paper first considers one backup per carrier, all on
the rail of the data. That passes the address bit along when the address walker sits on
the same rail, but it fails at the output stage: after the copy the data walkers are on
different rails depending on the stored bits, gaps appear in the sequence of backups, and
the $\hat U_B$ steps, which need a backup present between successive applications,
cannot recollect the data coherently. The fix is to escort every carrier with one backup
on each tree. On a given tree $r$ the layout is then exactly the one of the backup
variant: carriers present on $r$ or absent from it (the bit, as seen from $r$), backups
always present.

**Train.**
$$A_1, \tilde A_1^\uparrow, \tilde A_1^\downarrow, A_2, \dots, A_n, \tilde A_n^\uparrow, \tilde A_n^\downarrow, D_1, \tilde D_1^\uparrow, \tilde D_1^\downarrow, \dots, D_m, \tilde D_m^\uparrow, \tilde D_m^\downarrow ,$$
$K = 3(n+m)$ walkers. The two backups of a carrier share one path coordinate, one site
behind the carrier, on the two trees, so the spacing on each tree is that of the backup
variant (path offsets $0 \dots 2(n+m) - 1$). Carriers are encoded as in `dualrail_basic`;
$\tilde W^\uparrow$ starts in $(\uparrow, R)$ and $\tilde W^\downarrow$ in $(\downarrow, R)$.
There is no flag walker $D_0$; option **last data backup** off drops
$\tilde D_m^\uparrow$, $\tilde D_m^\downarrow$. Edges have 4 sites on both trees, lanes
$2(n+m)$ sites.

**Routing at level $d$.** On each tree $r$ the [backup gates](gates.md#gate-dr-backup)
act on the walkers of that tree: $\hat U_{in}(\tilde A_d^{(r)} \vert A_d)$ flips
$\tilde A_d^{(r)}$ if $A_d$ is red on $r$; the chain
$\hat U_B(\tilde W_{i+1}^{(r)}, W_{i+1} \vert \tilde W_i^{(r)})$, activated by a blue backup,
flips the next carrier (if it is on $r$) and its $r$ backup. The tree that does not hold
$A_d$ sees no control and its walkers stay red. The scattering gates $\hat S^{(r)}$ then
route as in `dualrail_basic`. Pipelining is that of the backup variant:
$T_{fwd} = 6n + 2m$.

**Query.** The [backup copy](gates.md#gate-dr-backup) of $D_j$ is controlled by
$\tilde D_{j-1}^\downarrow$ ($\tilde A_n^\downarrow$ for $D_1$), red on the $\downarrow$
lane only where the train arrived, so no flag is needed. Then the
[output circuit](variants.md#dualrail-output): a data walker that read 0 lands on
$\uparrow$ between the $\uparrow$ backups, one site from each. $T_q = m + 3$.

**Inverse routing** is the exact time reversal: on each tree the $\hat U_B$ fire again
tail-first and $\hat U_{in}$ last. A data walker that moved to $\uparrow$ is now a carrier
of the $\uparrow$ chain, and the $\uparrow$ backups around it are what lets that chain
reset it: this is where the second row of backups is needed.

**Worked example** (preset `dualrail-backup`): $n = 2$, $m = 2$, $a = 10$, memory
$b^{(00)} = 00$, $b^{(01)} = 11$, $b^{(10)} = 01$, $b^{(11)} = 10$. Here
$A_1 = (\downarrow, R)$, $A_2 = (\uparrow, R)$.

* Level 1, $A_1$ on $\downarrow$. On $\downarrow$, $\hat U_{in}$ turns $\tilde A_1^\downarrow$
  blue and the chain (controls $\tilde A_1^\downarrow$, $\tilde A_2^\downarrow$,
  $\tilde D_1^\downarrow$) turns $\tilde A_2^\downarrow$, $D_1$, $\tilde D_1^\downarrow$,
  $D_2$, $\tilde D_2^\downarrow$ blue. $A_2$ is on $\uparrow$: seen from $\downarrow$ it is
  an empty slot, skipped as $A_2$ in preset E3. Nothing happens on $\uparrow$.
  $\hat S^{(\downarrow)}$ sends $A_1$ left and the blue $\downarrow$ walkers right;
  $\hat S^{(\uparrow)}$ sends the red $\uparrow$ walkers ($A_2$ and the $\uparrow$
  backups) right too.
* Level 2, $A_2$ on $\uparrow$. On $\uparrow$, $\hat U_{in}$ turns $\tilde A_2^\uparrow$ blue
  and the chain turns $\tilde D_1^\uparrow$, $\tilde D_2^\uparrow$ blue ($D_1$, $D_2$ are on
  $\downarrow$ and are skipped). $\hat S^{(\uparrow)}$ sends $A_2$ right and the blue
  $\uparrow$ backups left; $\hat S^{(\downarrow)}$ sends the red $\downarrow$ walkers left:
  the train reaches cell $\ket{10}$. The backups of $A_1$ are not in the chain of level 2
  and follow the default of their tree: $\tilde A_1^\downarrow$ goes left with the train,
  $\tilde A_1^\uparrow$ right, into cell $11$; they are recollected on the way back like
  the address walkers.
* Query. The copy of $D_1$ (control $\tilde A_2^\downarrow$) reads $b_1 = 0$ and turns
  $D_1$ blue; the copy of $D_2$ (control $\tilde D_1^\downarrow$) reads $b_2 = 1$ and does
  nothing. The output circuit moves $D_1$ to $(\uparrow, R)$.
* Output: $D_1$ on $\uparrow$ (bit 0), $D_2$ on $\downarrow$ (bit 1), every backup back on
  its own tree, red: the readout is $\ket{10} \to 01$.

**Resources quoted by the paper** (technical paper, §Backup variant for dual-rail,
Resource scalings): $3(n+m)$ walkers, two trees, $6(2^n - 1)$ gates, path extent $4n$ per tree,
depth $T_{\text{parallel}} = T_{prep} + T_{rout} = 3(n+m) + 10n + 4m = 13n + 7m$. Engine:
$T_{fwd} = 6n + 2m$ (as in the backup variant), $T_{total} = 12n + 5m + 3$.

## Resource comparison {#comparison}

The technical paper compares its six variants in Table (resource_comparison). The paper's columns are
reproduced below; the last column is the total depth the engine measures,
$T_{total} = 2T_{fwd} + T_q$, with the default options (staggered copies; global copy for
basic, qudit and `dualrail_basic`).

| variant (technical paper) | engine | carriers | trees | gates | path extent | depth (paper) | $T_{total}$ (engine) |
|---|---|---|---|---|---|---|---|
| Basic, long range | `basic` | $\le n+m$ | 1 | $2(2^n-1)$ | $n^2/2+nm+\mathcal{O}(n)$ | $n^2/2+nm+\mathcal{O}(n+m)$ | $n^2+2nm+5n+3m+2$ |
| Basic, short range | `backup` | $\le 2(n+m)$ | 1 | $3(2^n-1)$ | $4n$ | $10n+4m$ | $12n+5m$ |
| Dual-rail, long range | `dualrail_basic` | $n+m$ | 2 | $4(2^n-1)$ | $n^2/2+nm+\mathcal{O}(n)$ | $n^2/2+nm+\mathcal{O}(n+m)$ | $n^2+2nm+5n+3m+5$ |
| Dual-rail, short range | `dualrail_backup` | $3(n+m)$ | 2 | $6(2^n-1)$ | $4n$ | $13n+7m$ | $12n+5m+3$ |
| Qudit, long range | `qudit_long` | $n+m$ | 1 | $2(2^n-1)$ | $n^2/2+nm+\mathcal{O}(n)$ | $n^2/2+nm+\mathcal{O}(n+m)$ | $n^2+2nm+5n+3m+2$ |
| Qudit, short range | `qudit_short` | $n+m$ | 1 | $3(2^n-1)$ | $2n$ | $5n+2m$ | $6n+3m+2$ |

**Reading the table.**

* **Carriers** are quoted up to $\mathcal{O}(1)$ terms: the flag walkers depend on the
  copy mechanism. The engine's train has $K = n + m + 1$ slots (basic, qudit,
  `dualrail_basic`; +1 with the cell switch), $2(n+m)$ (backup) and $3(n+m)$
  (`dualrail_backup`). The basic short-range count includes the always-present backups;
  "$\le$" because the 0s of the bosonic variants carry no walker.
* **Gates** are the routing gates of the tree, one address-transmission gate (or the
  pair $\hat U_{in}$, $\hat U_B$) and one $\hat S$ per node, per tree; the copy gates and
  the output circuits of the cells come on top.
* **Path extent** is the number of sites from the root to a cell (per tree).
* **Active elements**, the last columns of the technical paper's table, are $\mathcal{O}(n)$ for a
  sparse (classical) query and $\mathcal{O}(2^n)$ for a full superposition in every
  variant: gates activate only along the paths the address superposition actually
  uses. The `activations_expected` counter of the [resources panel](metrics.md#resources)
  measures this.
* **Depth.** The engine's constants differ from the paper's for two reasons. The memory
  lane hosts the whole train at rest, so the query is a pause and the inverse routing
  replays the whole routing ($2T_{fwd}$), whereas the paper's train streams through a cell
  of a few sites. The dual-rail depths of the paper include the
  preparation time $T_{prep}$ ($n + m$, or $3(n+m)$ for the backup version), which the
  engine does not simulate. The routing alone agrees: $T_{fwd} = 6n + 2m$
  for both backup variants is the paper's routing time, and the long-range $T_{fwd}$ has
  the paper's leading term $n^2/2 + nm$. Compare scalings: linear in $n$ and $m$ for the
  short-range rows, quadratic for the long-range ones.

**Trade-offs** (technical paper, §Comparison between our variants). The particle-conserving variants
avoid superpositions of different particle numbers at the price of a second tree
(dual-rail) or of four-level carriers (qudit). The short-range versions reach the optimal
linear depth with gates on at most three neighbouring walkers, at the price of backups:
twice the carriers in the basic case, three times in the dual-rail case. The qudit short
range variant needs no backups at all and only nearest-neighbour gates, and has the
smallest depth of the six. The technical paper's table also lists the bucket brigade and the ASY
architectures, which the simulator does not run.

## Not simulated (yet) {#other-variants}

* **Dual-rail preparation.** The paper prepares the dual-rail train on a single input
  rail, with the bits in the colour ($a_i = 0 \to R$, $a_i = 1 \to B$, data $B$), and splits
  it onto the two trees with the scattering gate $\hat S^{(in)}$: $(in, R) \to (\uparrow, R)$,
  $(in, B) \to (\downarrow, R)$, in $T_{prep} = n + m$ steps. The backup version also needs a
  buffering stage that realigns the triples carrier–backup–backup, $T_{prep} = 3(n+m)$.
  Both dual-rail variants of the simulator start with the walkers already on their rails;
  $T_{prep}$ only enters the paper's depth shown in the resources panel.
