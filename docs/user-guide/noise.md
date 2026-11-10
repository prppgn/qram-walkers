# Noise {#noise}

The ideal protocol is a sequence of basis permutations and the output always has
fidelity 1. Noise models make the walkers, the gates or the memory imperfect. They are
chosen in **Setup → Noise**, each with its own probability, location, targets and
phases. A noisy run is *one* stochastic trajectory, fixed by
the run seed; averages come from the **ensemble** mode of the Metrics panel or from
`qramsim sweep`.

## Quantum-jump trajectories {#noise-quantum-jumps}

A stochastic channel is a set of Kraus operators $\{\hat K_i\}$ with
$\sum_i \hat K_i^\dagger \hat K_i = \hat I$, acting on the local state of one slot,
$\{\ket{\varnothing}, \ket{R}, \ket{B}\}$. The engine applies it with the Monte Carlo
wavefunction rule: it computes $\ket{\psi_i} = \hat K_i \ket{\psi}$ and
$p_i = \lVert \psi_i \rVert^2$, draws one $i$ with probability $p_i$, and continues with
$\ket{\psi_i}/\sqrt{p_i}$. Averaging many trajectories reproduces the density-matrix
evolution exactly.

Two consequences are visible in the viewer:

* a **jump** (any $i \neq 0$) is an event in the narration and the event log, drawn in
  the noise colour. A loss jump also *collapses* the superposition: $\hat K_1 = \sqrt{p}\,\ket{\varnothing}\bra{R}$ annihilates the branches where the slot was not red;
* **no jump** still changes the state (back-action). The no-loss operator
  $\hat K_0 = \ket{\varnothing}\bra{\varnothing} + \sqrt{1-p}\,(\ket{R}\bra{R} + \ket{B}\bra{B})$
  favours the branches where the slot is empty. This matters here because
  $\ket{\varnothing}$ is a logical state: with the address superposition
  $(\ket{0} + \ket{1})/\sqrt{2}$, not seeing a loss of $A_1$ makes $\ket{0}$ more likely.

All operators are *monomial*: each maps a basis state to at most one basis state. Noise
therefore never increases the number of branches. With $p = 0$ a channel is skipped, so
the run is identical, bit for bit, to the ideal one.

## Locations {#noise-locations}

| location | when the channel acts | on which slots |
|---|---|---|
| `propagation` | after every move (routing and inverse routing) | every slot inside the tree |
| `gate` | after a tree gate ($\hat U^{(d)}$, $\hat U_{in}$, $\hat U_B$) fires | slots on its window sites, on every edge of its level |
| `memory` | after a lane gate (copy, switch) fires | slots on its window sites |
| `scattering` | before every move | slots about to cross a bifurcation ($\hat S$ or $\hat S^\dagger$) |
| `idle` | every query tick | every slot resting in the lanes |

A present walker is located by its actual position. An empty slot is located by its
time bin, $x = \tau - k$, the position the clock assigns to slot $k$, never by its ghost.
Each channel can also be restricted to some **phases** (routing, query, inverse).

## Targets {#noise-targets}

`all`, `address` ($A_i$), `data` ($D_j$, $j \ge 1$), `backup` ($\tilde A_i$, $\tilde D_j$),
`flag` ($D_0$ and $D_{m+1}$), or a list of slot names. Stray walkers are not subject to
noise channels.

## The three alphabets {#noise-families}

The models below are written for the bosonic alphabet $\{\ket{\varnothing}, \ket{R}, \ket{B}\}$. On the qudit and dual-rail variants the walker carries two things, a routing colour and a logical value, and is always present, so each model has to say which of them it hits (these are modelling choices of this simulator):

| model | qudit | dual-rail |
|---|---|---|
| [loss](#noise-heralding) | $\circ R, \circ B, \bullet R, \bullet B \to \varnothing$ | $\uparrow R, \uparrow B, \downarrow R, \downarrow B \to \varnothing$ (no walker on either rail) |
| [colour flip](#noise-bit-flip), [scatter flip](#noise-scatter-flip) | $\hat X^C$ | $\hat X$ on the colour, same rail |
| [colour dephasing](#noise-colour-dephasing) | $\hat Z$ on the colour | $\hat Z$ on the colour |
| [depolarising](#noise-depolarizing) | the colour qubit; option `on = logical`, `both` | the same |
| [logical dephasing](#noise-logical-dephasing) | $\hat Z^L$, sign on $\circ$ | $\hat Z^L$, sign on $\uparrow$ |
| [logical flip](#noise-logical-flip) | $\hat X^L$ | rail exchange $\uparrow \leftrightarrow\ \downarrow$ |
| [gate failure](#noise-gate-failure), [clock jitter](#noise-clock-jitter) | as below | the copies and $\hat X_c$; not the passive $\hat S_M$, $\hat S_M^\dagger$ |
| [copy error](#noise-copy-error), [memory bit flip](#noise-memory-bit-flip) | as below | as below |
| [over-rotation](#noise-overrotation) | only the walkers the gate flips: its own subspace | only the walkers it flips: the tree of the control |
| [imbalance](#noise-imbalance) | as below | one independent node per tree |

## Loss {#noise-loss}

$$\hat K_0 = \ket{\varnothing}\bra{\varnothing} + \sqrt{1-p}\,\big(\ket{R}\bra{R} + \ket{B}\bra{B}\big), \quad \hat K_1 = \sqrt{p}\,\ket{\varnothing}\bra{R}, \quad \hat K_2 = \sqrt{p}\,\ket{\varnothing}\bra{B} .$$

The walker disappears; its slot becomes $\ket{\varnothing}$ and is drawn as a ghost from
then on. Default location: `propagation`. **What to expect:** in the bosonic encodings a
lost address walker reads as bit 0 and a lost data walker as stored bit 0, so the output
can still look well formed while it is wrong. The two loss operators are distinct
because the environment learns the colour of the lost photon, which is correlated with
the path: a loss jump collapses the address superposition. With $p = 1$ every walker is
lost.

## Heralded loss on qudit and dual-rail {#noise-heralding}

A qudit or dual-rail walker can still be lost: the slot then holds no walker, a state outside
the alphabet. With the same probability for every mode the channel is unique:

$$\hat K_0 = \ket{\varnothing}\bra{\varnothing} + \sqrt{1-p}\sum_s \ket{s}\bra{s}, \qquad \hat K_s = \sqrt{p}\,\ket{\varnothing}\bra{s},$$

with one jump per local state $s$. Two things change with respect to the bosonic encodings,
and both come from the walker being always present:

* **No back-action.** $\hat K_0$ is $\sqrt{1-p}\,\hat I$ on the states with a walker, so not
  seeing a loss tells nothing about the address: a run with no jump ends in the exact output.
  In the basic variant $\ket{\varnothing}$ and $\ket{R}$ are damped differently, and a
  superposition skews even when nothing is lost.
* **Every loss shows.** A missing walker is an output no valid state looks like, so the run
  counts as not well formed (the readout table says which walker is missing). In the basic
  variant a lost $D_j$ reads as a valid bit 0.

So the **heralded fidelity** $\langle F \rangle / \langle \text{success} \rangle$, the fidelity
given a well-formed output, stays exactly 1 under pure loss on these four variants, while
the success probability pays for the losses. Ensembles and sweeps report it for all six
variants (`--metric heralded_fidelity`). It says nothing about errors that keep the output
well formed: a [logical dephasing](#noise-logical-dephasing) lowers it as much as the fidelity.

## Colour flip {#noise-bit-flip}

$\{\sqrt{1-p}\,\hat I, \sqrt{p}\,\hat X\}$, $\hat X = \ket{B}\bra{R} + \ket{R}\bra{B} + \ket{\varnothing}\bra{\varnothing}$. Default location: `gate`. **What to expect:** a flipped
walker takes the wrong branch at the next bifurcation (or bounces on the way back).

## Colour dephasing {#noise-colour-dephasing}

$\{\sqrt{1-p}\,\hat I, \sqrt{p}\,\hat Z\}$, $\hat Z = \ket{R}\bra{R} - \ket{B}\bra{B} + \ket{\varnothing}\bra{\varnothing}$. Default location: `propagation`. **What to expect:**
a phase error only where a walker is blue, i.e. between an address-transmission gate and
the next bifurcation; the routing itself is unaffected, but the relative phases of the
branches can change, which lowers the fidelity of superpositions.

## Presence dephasing {#noise-presence-dephasing}

$\{\sqrt{1-p}\,\hat I, \sqrt{p}\,\hat Z'\}$, $\hat Z' = \ket{R}\bra{R} + \ket{B}\bra{B} - \ket{\varnothing}\bra{\varnothing}$. Default location: `propagation`. **What to expect:**
it decoheres the address superposition directly, since bit 0 is the vacuum: a
classical address is unaffected, the fidelity of a superposition drops. It exists only on
the bosonic variants: elsewhere a walker is always present and the role goes to the logical
dephasing.

## Logical dephasing {#noise-logical-dephasing}

$\{\sqrt{1-p}\,\hat I, \sqrt{p}\,\hat Z^L\}$, with $\hat Z^L$ giving a minus sign to the
logical 0: the $\circ$ states of a qudit, the $\uparrow$ rail of a dual-rail walker (physically,
a fluctuation of the path difference between the rails), and an empty slot is left alone. On
the bosonic variants the logical 0 is $\ket{\varnothing}$, so the name is a synonym of presence
dephasing and one noise specification runs on all six variants. Default location:
`propagation`. **What to expect:** it leaves a classical address alone and decoheres a
superposition; the output stays well formed, so nothing heralds it.

## Logical flip {#noise-logical-flip}

$\{\sqrt{1-p}\,\hat I, \sqrt{p}\,\hat X^L\}$: $\circ \leftrightarrow \bullet$ on a qudit, colour kept;
on dual-rail the walker jumps to the same site of the other tree, as cross-talk between the
rails would do. Not defined on the bosonic variants, where the logical value is the presence
of a walker. Default location: `gate`. **What to expect:** it changes the bit carried, and
on the variants that route by logical value (long-range qudit, dual-rail) it also changes the
gates the walker meets. In `dualrail_backup` the two backups of a carrier share a site on
the two trees, so a rail exchange of one of them is a [collision](#noise-collisions).

## Depolarising {#noise-depolarizing}

$\{\sqrt{1-3p/4}\,\hat I, \sqrt{p/4}\,\hat X, \sqrt{p/4}\,\hat Y, \sqrt{p/4}\,\hat Z\}$ on
$\mathrm{span}\{\ket{R}, \ket{B}\}$, identity on $\ket{\varnothing}$ ($\hat Y = i\ket{B}\bra{R} - i\ket{R}\bra{B}$). Default location: `gate`. **What to expect:** a mixture of colour
flips and phase errors. On the qudit and dual-rail variants this is the default too, on the
colour qubit; `on = logical` puts the same channel on the logical value, and `on = both` treats
the walker as one four-level system, with the 15 two-qubit Pauli errors at $p/16$ each.

## Scatter flip {#noise-scatter-flip}

A colour flip applied only at the `scattering` location, right before $\hat S$ or
$\hat S^\dagger$: the walker is routed into the wrong child, or on the way back is bounced
into the sibling edge. **What to expect:** misrouted data walkers can leave their flag
alone in a lane, where the copy creates a [stray walker](#noise-strays), and the
recombination can end in a [collision](#noise-collisions).

## Gate failure {#noise-gate-failure}

The gate silently does not fire: Kraus operators $\{\sqrt{1-p}\,\hat G, \sqrt{p}\,\hat I\}$.
The outcome probabilities do not depend on the state, so the engine draws, for every
firing and every edge (or lane) where the gate would act, whether it fails; all branches
see the same draw. Default locations: `gate` and `memory`. **What to expect:** with
$p = 1$ on the tree gates no address bit is ever transmitted: the train always goes left
and reads the cell $0\dots0$.

## Clock jitter {#noise-clock-jitter}

Each scheduled gate instance fires one tick early ($p_{early}$) or late ($p_{late}$),
drawn once per instance and run (the forward and the inverse instance independently).
The window then holds other walkers than intended: for example a late $\hat U^{(d)}$ is
controlled by $A_{d+1}$. The shifts are listed in the noise summary.

## Copy error {#noise-copy-error}

At a copy gate the stored bit is read inverted: $\{\sqrt{1-p}\,\hat U_{copy}(b), \sqrt{p}\,\hat U_{copy}(1-b)\}$, drawn per copy instance and lane. **What to expect:**
the output stays well formed but carries the wrong data: consistency drops, success
does not.

## Memory bit flip {#noise-memory-bit-flip}

Before the run every stored bit is flipped with probability $p$ (a classical error of
the memory). The copies read the flipped bits; fidelity and consistency are measured
against the intended memory. The flipped bits are listed in the noise summary.

## Over-rotation (coherent) {#noise-overrotation}

A systematic miscalibration of the controlled colour flips. Every $\hat X$ applied by an
*active* $\hat U^{(d)}$, $\hat U_{in}$ or $\hat U_B$ becomes
$$\hat X_\varepsilon = \cos\theta\,\hat X - i\sin\theta\,\hat I, \qquad \theta = \frac{\varepsilon\pi}{2},$$
which is unitary for every $\varepsilon$ ($\varepsilon = 1$ leaves the colour unchanged
up to a phase). Each flipped walker splits into the flipped term (amplitude
$\cos\theta$) and the unflipped one ($-i\sin\theta$), so the number of branches grows.
Parameters: `epsilon` in $[-1, 1]$; `sigma` spreads $\varepsilon$ with a Gaussian, one
value per gate and edge drawn once per run (a static miscalibration, used by the forward
and the inverse firing alike — the inverse applies $\hat X_\varepsilon$ again, not its
adjoint); `gates` restricts the gate types. By default only the colour of a present
walker is over-rotated; `vacuum_phase` on applies the literal formula to
the three-level target, which also gives an empty target the phase $e^{-i\theta}$. **What to expect:** for $n = 1$ and
a red $A_1$, each data walker meets $\hat X_\varepsilon$ twice and exits correctly with
amplitude $\cos(\pi\varepsilon)$, so the fidelity is $\cos^4(\pi\varepsilon)$ (a test of
the engine). Figure: `docs/figures/fidelity_vs_overrotation_n3_m2.png`.

## Beam-splitter imbalance (coherent) {#noise-imbalance}

An imperfect bifurcation: after $\hat S$ routes a walker, its two output ports are mixed
by the symmetric beam splitter
$$M_\varphi = \begin{pmatrix} \cos\varphi & i\sin\varphi \\ i\sin\varphi & \cos\varphi \end{pmatrix}, \qquad \varphi = \frac{\eta\pi}{2},$$
so a walker also enters the wrong child with amplitude $i\sin\varphi$. Parameters: `eta`
in $[-1, 1]$, `sigma` (one value per node), and `backward`, which fixes what happens when a
walker crosses the node on the way back:

* `reciprocal` (default): a passive reciprocal device traversed backward acts with the
  transpose, $\hat S^\dagger M_\varphi$, and the two mixings add up instead of
  cancelling;
* `adjoint`: the backward crossing is the adjoint of the forward one,
  $\hat S^\dagger M_\varphi^\dagger$, as for the ideal $\hat S^\dagger$. A walker that
  retraces its path undoes the mixing exactly; errors remain only where something
  happened in between (a copy, a gate, another walker).

**What to expect:** for $n = 1$, address 0 and no query, the fidelity is exactly 1 with
`adjoint` and $\cos^4(\pi\eta)$ with `reciprocal`. Figures:
`docs/figures/fidelity_vs_imbalance_adjoint_n3_m2.png` and
`…_reciprocal_n3_m2.png`.

## Pruning and discarded weight {#noise-pruning}

Coherent errors multiply the branches. Branches with $|\alpha|^2$ below `prune_eps`
(Setup → Options, default $10^{-10}$) are dropped, and at most `max_branches` (default 2048)
are kept. The dropped weight is reported (metric *discarded weight*, prune events in the
log) and the state is **not** renormalised: fidelity and success are then lower bounds.
The trajectory stores the largest-weight branches of each frame (64 by default); a note
on the tree says how many more there are. Metrics always use the full state.

## Stray walkers {#noise-strays}

The local copy $\hat U^{loc}_{copy}$ maps $\ket{\varnothing}_{D_j}\ket{\varnothing}_{M_j} \to \ket{R}_{D_j}$. In the ideal protocol $D_j$ always sits on its site when the copy
fires. Off the ideal path the flag (or the controlling backup) can be red in a lane
where the $D_j$ site is empty, and the copy creates a walker there. The
walker belongs to the site's time bin: if that slot is empty, it becomes the slot's
walker; if the slot holds a walker elsewhere, the new walker is a **stray**, drawn with
a dashed noise-coloured ring. A branch with a stray is not well formed.

## Collisions {#noise-collisions}

Two walkers on the same site are outside the single-occupancy regime of the paper. A
stray and the walker of its time bin, for instance, reconverge at their common
bifurcation on the way back. The branch is then **collided**: it is frozen (no motion,
gates or noise act on it any more), drawn grey with a ✕ on the site, and counted as a
failure; the metric *collided* reports its weight.

## Absorption at a lane end {#noise-absorb}

A walker bounced by $\hat S^\dagger$ travels toward the cells again and can run past the
end of a memory lane. The model has no site beyond it: the walker leaves the system at
the cell, which for a slot walker is a loss. The engine keeps a record of
the departure (slot, lane, tick, and the state the walker took away) in the branch, so that
branches with different histories stay orthogonal and the evolution remains unitary.

On the dual-rail variants a walker still on the auxiliary rail when the query ends leaves the
same way: it has no way back. Only noise can do this, by flipping its colour
between $\hat S_M$ and $\hat S_M^\dagger$.

## Ensembles and sweeps {#noise-ensembles}

One trajectory is one sample. The Metrics panel's **ensemble** mode asks the engine for
$N$ trajectories with consecutive seeds and shows the mean and standard error of every
metric. From the command line:

```
uv run qramsim sweep --variant basic,backup --n 3 --m 2 --input uniform \
    --noise loss:where=propagation --param p --values 0:0.02:0.001 --runs 200 \
    --plot fidelity_vs_loss.png
```

draws the mean fidelity against the loss probability for both variants
(`docs/figures/fidelity_vs_loss_n3_m2.png`). With a loss per walker per tick, what
matters is the number of walker-ticks in the tree: at $n = 3$, $m = 2$ the backup variant
carries 10 walkers for 46 ticks against 6 walkers for 44 ticks in the basic variant, so
it suffers more. Its advantage is the depth scaling, which wins at larger $n$.

The same comparison on all six variants is in `docs/figures/six_variants_*`. Under loss, the
heralded fidelity is exactly 1 on the qudit and dual-rail variants, at the price of the
success probability: at $n = 3$, $m = 2$ and $p = 0.01$ per tick about 30% of the runs survive
on `qudit_short` and 2% on `dualrail_backup`, which has the most walker-ticks. Without
post-selection the basic variant does better than the long-range qudit and dual-rail ones,
since its empty slots cannot be lost. These are results for one size and one error rate per
tick, not a general ranking.
