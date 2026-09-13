# Gomulda Zero research engine

## Scope and objective

Gomulda is a deterministic, perfect-information, finite, alternating, zero-sum game during pairing. There are initially 300 unordered pair actions and only 12 decisions per round. The completed board's minimum colouring penalty can be computed exactly. Consequently, a useful AlphaZero-style formulation trains on pairing and uses exact optimal colouring as terminal reward. White maximizes that penalty; Black minimizes it.

This implementation learns the numerical round score, not the probability of winning a two-round match conditional on an earlier score. The value target is `sign(player-to-move) * terminalPenalty / 10`. This linear scaling preserves the score objective; nonlinear clipping or replacing penalties with win/loss thresholds would change the training objective. No human examples or policy labels from the Search engine are used in training. Search can now act as a fixed opponent during training as well as evaluation.

## Implemented learning loop

1. A shared neural network outputs a policy over all 300 unordered cell pairs and a numerical value for the player to move.
2. PUCT combines legal-move-masked policy priors and signed value estimates; terminal nodes use exact colour penalties. Values are stored in White's perspective in the tree, with the sign applied during action selection.
3. Self-play uses 25% Dirichlet root exploration noise (concentration 10 spread over legal actions), temperature 1 during the first eight plies and 0.25 thereafter.
4. Each Zero decision stores its own search visit distribution as the policy target and the appropriately signed final score as its value target. Self-play supplies 12 examples per round. Against Search, only Zero’s six decisions enter replay; Search’s moves are never copied as policy targets.
5. A bounded replay buffer holds 4,096 positions. Random dihedral transformations of the board and policy augment sampled batches.
6. Eight 32-position minibatch updates follow each round. Adam uses learning rate 0.001, cross-entropy policy loss, Huber value loss, gradient norm clipping at 5, and small decoupled weight decay.
7. Training weights feed the next round's PUCT search. Checkpoints include replay and optimizer state so a run can continue.

The small network has 327 sparse inputs: 25 empty-cell flags, 300 same-country pair flags, a dedicated player-to-move sign at input 325 (White +1, Black −1), and normalized ply at input 326. Country names therefore do not affect the input. A 64-unit shared ReLU layer feeds a 300-action policy head and a linear value head (40,557 parameters). It runs without dependencies in a browser worker or Node. It is deliberately a compact research baseline, not an implementation at the scale of DeepMind's deep residual networks.

## Engine separation

`dist/engine.js` is the original Gomulda Search engine. `dist/learning.js` is Gomulda Zero. The dispatcher `dist/worker.js` selects the requested engine explicitly. Zero never calls Search for its moves or its self-play targets. Opponent training and the benchmark call both engines as independent opponents; neither changes the implementation or weights used by the other engine. Shared rules, legal moves and exact final-colouring evaluation avoid disagreements about the game itself.

Models are independent of match scores and stored once per running match. Training a new local model leaves an existing match's checkpoint fixed. Engine choices are associated with players, so the same selected engine continues when White/Black roles reverse.

## Training against fixed Search

Choose **Learning lab → Training opponent → Gomulda Search · alternate roles**. Search has a selectable 50, 150, 500 or 1,500 ms thinking budget; Zero has its own simulation budget. Training budgets need not be equal. Separate arena tests use equal time per move.

Zero alternates White and Black, starting with the less-used role. Per-role counts travel with the model, including model-only exports. An odd run, a stop, an import, or intervening self-play does not restart the alternation. Existing checkpoints from the self-play-only release are migrated as self-play rounds. Counters distinguish self-play, Zero-as-White against Search, and Zero-as-Black against Search.

This is an opponent-training variation, not pure AlphaZero self-play. Search stays fixed. Zero still generates its own policy targets with neural PUCT, using exploration noise and temperature only for its own played moves. Its value targets reflect the outcomes against Search. The shared replay can contain both modes when users switch; training uniformly samples retained examples. The PUCT opponent inside Zero’s search still uses Zero’s network, not calls to Search. This mismatch and the risk of specializing to a single opponent make independent evaluation essential. Training against a stronger opponent can expose weaknesses, but improvement is an experimental question.

Completed rounds, role counts, replay and optimizer are persisted together. Stop takes effect after the current round. Each run is bounded; it does not automatically switch the playing engine or promote a checkpoint. Match-time Zero inference remains independent of Search.

## Run and continue training

No packages need to be installed. Run from the project directory:

```sh
node training/train.js --games 512 --simulations 128 --out training/runs/run-a --arena-matches 8 --arena-ms 150
node training/train.js --resume training/runs/run-a/resume.json --games 2048 --simulations 256 --out training/runs/run-b --arena-matches 8 --arena-ms 150
node training/train.js --resume training/runs/run-b/resume.json --mode search --search-ms 150 --games 100 --simulations 128 --out training/runs/against-search --arena-matches 8 --arena-ms 150
```

`--games` means additional training rounds. Each contains 12 pairing decisions and one exact colouring calculation. The CLI writes configuration, per-round losses, an inference-only `model.json`, a full `resume.json` and optional arena results. Exporting from the learning lab also produces a full checkpoint that the CLI can resume; importing a model-only file starts a new replay buffer and optimizer. Importing a full checkpoint retains them.

Weights/replay/optimizer validation rejects invalid dimensions, non-finite values and illegal replay policies. Self-play seeds are deterministic; floating-point details may vary across runtimes. Search uses a wall-clock budget, so opponent-training trajectories also vary with hardware and load. The trainer saves every 16 rounds and at completion. The browser saves after each completed round. A stopped/closed run retains its last saved checkpoint, not an unfinished round.

## Evaluation and present results

Each evaluation match consists of two rounds from the same two-pair opening, with the engines swapping roles. These seeded random openings are separate from training. Each engine receives the same nominal time per move and both always colour optimally. Time budgets do not imply equal node counts; efficiency is part of practical engine performance. Results vary with browser throttling and CPU contention.

The local UI tests eight matches. It reports scores and mean margin, with a conservative small-sample approximate interval internally. This is a diagnostic, not a validated statistical certification. Eight related positions are insufficient to establish expert strength. The CLI experiment reused a small validation set across checkpoints; a serious future comparison must use a fresh, larger test set after model selection. Repeatedly testing on the same set is not independent evidence.

| Training rounds | Updates | W / D / L vs Search | Mean Zero score margin |
|---|---:|---:|---:|
| 512 | 4,096 | 0 / 0 / 8 | −6.375 |
| 2,560 | 20,480 | 0 / 3 / 5 | −5.75 |

Both tests used 150 ms per move and six-colour cost 25. These results show that learning runs, but do **not** show that Zero is stronger than Search. Lower policy/value training loss is not an Elo rating and does not establish stronger play. The latest checkpoint is offered as experimental; Search remains the default. Tests cover gradients by finite differences, real weight updates, signed rewards, legal-action masks, symmetry transforms, persistence and unchanged core rules.

A first opponent-training smoke experiment started from the 2,560-round bundled **model-only** checkpoint (fresh replay/optimizer), then added 64 rounds at 128 Zero simulations per move and 150 ms for Search. Zero trained 32 rounds in each role and made 512 additional gradient updates. The resulting checkpoint lost all eight 150 ms validation matches (mean margin −9.25). Configuration and raw scores are in `training/reports/search-opponent-64-*.json`. This does not establish an improvement; the model was **not** promoted or bundled. The experiment also ran alongside browser acceptance work, so wall-clock results should not be treated as a controlled before/after comparison. The existing bundled pilot and users’ saved checkpoints remain available.

## Reaching a very high level

A longer research effort should first establish robust baselines at several equal-time budgets, fixed-simulation ablations, a diverse held-out opening suite, and late positions with known minimax values. Compare current and previous Zero checkpoints as well as Search; keep checkpoint selection separate from final testing. Use paired role reversal, report confidence intervals, and play expert humans.

The next model worth investigating is a residual network or message-passing network that represents both grid borders and the evolving pairing relation. A satellite relation is nonlocal, so a naive image encoding of country numbers is a poor representation. The present pair encoding avoids arbitrary country IDs but a small MLP may be capacity-limited.

Scale self-play through batched inference, replay diversity, stronger searches, multiple independent training seeds and accelerator-backed training. Inspect policy collapse, value calibration, rare expensive outcomes and role balance before simply adding more games. The current code is CPU-based and does not pretend to provide a GPU training cluster. No paid/cloud training job has been started.

An optional future hybrid could learn only the early game and use exact minimax in the closing moves, but that would be a third, explicitly named engine. It is deliberately absent here to preserve Search and Zero as separate engines as requested.

## Primary references

- [Google DeepMind: AlphaZero and MuZero](https://deepmind.google/research/alphazero-and-muzero/)
- [DeepMind OpenSpiel AlphaZero implementation notes](https://github.com/google-deepmind/open_spiel/blob/master/docs/alpha_zero.md): policy/value networks, PUCT, self-play actors, replay, checkpoints, and evaluation against MCTS. OpenSpiel also distinguishes illustrative implementations from large-scale superhuman systems.

## Browser acceptance checks for this release

The preview completed a two-match Zero-versus-Search series with automatic round and match transitions. Pause/one-move/resume were verified. Browser training increased a 512-round checkpoint to 517, persisted across reload, and then stopped a larger run cleanly after reaching 520. The already-running match retained its frozen 517-round checkpoint throughout. Invalid training sizes and engine names were rejected. The learning lab fit a 390-pixel viewport without horizontal overflow. Independent model tests and the complete original rules test suite passed.


## Search-opponent training acceptance checks

All 24 rules and learning tests passed. New tests check that Search actually occupies the opposite role on all six turns, that replay contains only Zero decisions with correctly signed exact rewards, that alternation continues through self-play and checkpoint round-trips, and that invalid settings and evaluation do not mutate training state. In the browser a legacy 520-round checkpoint trained five rounds against Search, reaching 3 White / 2 Black. After reload, a stopped continuation completed Black next, reaching 3 / 3 and preserving the checkpoint. Both training modes and the conditional Search budget control were verified. The new lab fits a 390-pixel viewport without horizontal overflow.


## Explicit roles and search-level reporting

Role features were already present in the original checkpoint architecture. `ROLE_INPUT`, `WHITE_ROLE` and `BLACK_ROLE` now name that stable input contract explicitly. A forward-pass probe isolates the role feature and checks that it affects the network on every move across a two-round match with swapped seats. A separate two-ply oracle test confirms that White PUCT seeks the largest penalty against a minimizing Black reply; the existing Black test verifies minimizing terminal penalties. These tests verify information flow and objectives, not that the trained model has learned a strong strategy in either role.

Match levels provide 800 / 3,000 / 10,000 / 30,000 ms budgets. The original Search algorithm and Zero's weights are retained. Both engines report the actual maximum depth visited; exact pairing proofs remain clearly distinguished from partially explored trees and complete random rollouts. Training simulations and opponent budgets are controlled independently in the lab.


Browser verification for the role/depth release: Search at 800 ms reported 32,816 simulations and maximum MCTS depth 5 from the empty board. Zero at 3,000 ms reported 201,123 simulations and maximum PUCT depth 9 from the next position. These are single local observations, not reproducible strength benchmarks. The active time budget reached the worker correctly for both engines, the 30,000 ms level was selectable, and the selected level and last-analysis report survived a reload. The legacy local 526-round learning checkpoint remained intact. Search controls fit a 390-pixel viewport without overflow. All 26 rules and learning tests passed.
