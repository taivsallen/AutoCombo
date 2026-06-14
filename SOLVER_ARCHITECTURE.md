# ComboAuto Solver Architecture

## Goal

Build a deterministic, constraint-aware, anytime search portfolio for the 5x6
drag-orb puzzle.

The solver must optimize in this order:

1. Path legality and N/X/Q constraints.
2. All configured rule requirements and shield requirements.
3. Requested combo target.
4. User-selected primary objective: combo or steps.
5. Secondary objective: steps or combo.
6. Cleared orbs, stability, diversity, and learned estimates.

Heuristics may guide exploration, but they must never redefine success or rank
ahead of verified hard objectives.

## Verified Core

There must be one terminal verifier shared by every search arm:

```txt
verify(board, path, config) -> {
  legal,
  requirementSatisfied,
  specialSatisfied,
  initialCombo,
  skyfallCombo,
  totalCombo,
  cleared,
  steps,
  trace
}
```

Every returned solution is replayed through this verifier. Search-local
estimates are never trusted as final output.

The physical transposition state is:

```txt
packed board
held orb
cursor / hole
row0 phase
previous direction if a move restriction depends on it
constraint state that changes legal future actions
```

Human-plan history and neural values are metadata, not state identity.

## Online Portfolio

Run multiple bounded search arms under one node budget. Each arm owns its
visited frontier, while all arms share a verified incumbent archive.

### 1. Constraint Beam

Primary arm for requirement-heavy requests.

Ranking:

```txt
legal
requirement completion tuple
special completion tuple
combo target reached
primary objective
secondary objective
symbolic potential
learned value
```

Keep requirement elites, near-feasible states, and a small deterministic
diversity quota.

### 2. Combo Frontier Beam

Primary arm for ordinary high-combo requests.

Maintain a bounded Pareto frontier over:

```txt
reachable combo upper bound
verified current combo
cleared orbs
steps
cursor/path family
```

Use deterministic hash-based tie breaking. Do not use unseeded randomness.

### 3. Target-Guided Beam

Enable only when the target generator understands every active rule.

Generate 8-32 target boards using orb stock, min-clear rules, exact-size
requirements, shapes, X/N/Q cells, and row0 behavior. Rank targets by verified
terminal quality before using them as guides.

Target distance is a heuristic only. A raw cell Hamming distance must not rank
ahead of real requirement/combo progress.

### 4. Repair Search

Spend the final 10-20% of the budget on incumbents.

Use:

- Weighted A* for short target-board repair.
- IDA* when the estimated remaining depth is small.
- Path-prefix and loop removal for step compression.
- Local mutations around the defect region for "missing one group" cases.

Once combo quality is fixed, repair optimizes steps without sacrificing hard
requirements.

## Budget Coordinator

Use node quotas rather than wall-clock-only scheduling so results remain
reproducible.

Suggested balanced allocation:

```txt
constraint beam       35%
combo frontier beam   35%
target-guided beam    15%
repair / shortening   15%
```

Reallocate an arm's unused budget when it is inapplicable. Publish verified
incumbents immediately so every arm can tighten its pruning bounds.

## Performance Representation

Move the complete orchestrator to a module Worker. The React thread should only
send inputs and receive progress/incumbents.

Use:

- Flat `Uint8Array` or packed integer boards.
- Parent arena indices instead of one JS object per path node.
- Incremental Zobrist hashing.
- Apply/unapply moves instead of cloning a 2D board for every child.
- Scalar/mask evaluation records instead of nested group objects.
- Cheap local delta evaluation before full cascade simulation.
- Batched full evaluation and batched ONNX inference.

Only shortlisted candidates should compute complete cascade traces, shape cell
lists, or result presentation data.

## Neural Guidance

The simulator is already exact, so MuZero-style learned dynamics are
unnecessary.

The first production model should predict:

```txt
legal-masked action logits
P(all requirements can be satisfied)
reachable combo estimate
remaining steps at the requested combo level
requirement progress/value vector
```

Inputs must include board, held orb, cursor, steps left, row0 state, diagonal
mode, skyfall mode, X/N/Q marks, rule requirements, and special requirements.

Initial deployment is reranking only:

```txt
symbolic hard tuple
symbolic heuristic
neural value
deterministic tie break
```

The model may participate in pruning only after it demonstrates either:

- At least +2 percentage points hard-goal success at the same node budget, or
- At least 25% fewer evaluated nodes at equal solution quality.

Levin Tree Search becomes useful after policy top-k recall is strong. MCTS is a
research arm, not the current production default.

## Self-Improvement Loop

1. Run the current portfolio on fixed training boards.
2. Verify and archive the Pareto-best solutions.
3. Mine failures by scenario and requirement type.
4. Generate adversarial boards around those failures.
5. Train policy/value heads from verified trajectories.
6. Run paired benchmark gates.
7. Promote only Pareto improvements.

Never train directly from an unverified heuristic score.

## Benchmark Gate

The App and benchmark must import the same pure solver implementation.

Required scenario strata:

```txt
target combo 6/7/8/9/theoretical-max
combo and steps priority
horizontal/vertical/free mode
diagonal on/off
skyfall on/off
row0 on/off
X1/X2, START/END, N1/N2
exact and at-least rule requirements
all special requirement types
ordinary, hard, adversarial, and provably small oracle boards
```

Hard gates:

```txt
runtime errors                    0
illegal returned paths            0
replay/result mismatches           0
false success reports              0
overall success regression         <= 0.5 percentage points
important-stratum regression       <= 2 percentage points
p95 latency regression             <= 10%
declared node-budget violations     0
```

A candidate is promoted only if it passes every hard gate and improves at least
one of:

```txt
hard-goal success by >= 1 percentage point
conditional median steps by >= 1
p95 latency by >= 10%
evaluated nodes by >= 15%
```

Report per-board paired deltas and Pareto fronts. Do not collapse correctness,
quality, and speed into one weighted score.

## Phase 1 Promoted Result

The first promoted optimization uses a two-stage move evaluator:

1. Rank generated moves with a clone-free local terminal-board estimate.
2. Fully evaluate a bounded shortlist.
3. Reserve 25% of the shortlist for the legacy heuristic.
4. Keep step-priority searches on the legacy budget and ranking.

Paired App benchmark, 6 fixed boards x 3 scenarios x 3 repetitions:

```txt
average latency          -20.0%
p95 latency              -17.5%
hard-goal success        22.2% -> 27.8%
average combo            5.389 -> 5.444
requirement satisfaction unchanged at 100%
step-priority outputs    identical in 18/18 cases
common-success steps     12.0 -> 11.5
```

The benchmark runs the real `App.jsx` solver with a fixed seed, warmup,
interleaved baseline/candidate order, and browser yielding disabled during
timing. The legacy configuration remains available through
`?solverBaseline=1`.

## Delivery Phases

### Phase 0: Correctness and Reproducibility

- One verifier and objective contract.
- Deterministic search seed.
- Correct transposition identity.
- Fixed browser benchmark suite.
- No false success reports.

### Phase 1: Fast Deterministic Portfolio

- Constraint and combo beam arms.
- Packed state and incremental hash.
- Shared incumbent archive.
- Repair/shortening pass.

### Phase 2: Constraint-Aware Targets

- Rule-aware target generation.
- Weighted A*/IDA* repair.
- Small-depth exhaustive oracle tests.

### Phase 3: Neural Reranking

- Unified dataset from verified portfolio traces.
- Policy/value ONNX model.
- Batched inference with a symbolic fallback quota.

### Phase 4: Learned Search

- Levin Tree Search arm.
- Adversarial self-training.
- Optional Gumbel sampling for diverse training trajectories.
