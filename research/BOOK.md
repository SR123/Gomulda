# Gomulda opening book and proof graph

The book is a separate layer over Gomulda Search. Select **Gomulda Search + book** to use it in a match. Original Search and Gomulda Zero remain available, and Zero training/evaluation still uses the original Search opponent. Using the book does not update neural weights.

## Position identity

Each entry stores a canonical board under the eight square symmetries and a first-occurrence renaming of pair labels. The singleton retains label 12. Move coordinates are transformed into canonical coordinates for storage and mapped back on lookup. Pair ownership and pairing order are irrelevant; the number of completed pairs determines the role to move. Book identity includes its sixth-colour cost. The sixth-colour cost is fixed at 25; imports using older custom costs are rejected.

The initial 300 unordered pairs become 49 child positions. All 49 have initial Search analysis. General graph isomorphism beyond board symmetry is not implemented.

## Estimates and exact information

An estimate stores a suggested pair, a White-perspective value, a simulation count and its nominal Search time. It is never used as a proof bound. The initial suggestion was searched for 3 seconds, and the first survey of all 49 openings used 150 ms per position. These different searches need not give mutually consistent estimates.

Every entry also has sound derived bounds. Its base lower bound is the exact minimum colouring cost of the already formed countries: their adjacency graph is an induced subgraph of every future completed country graph, and their weights remain two. A universal upper bound comes from assigning distinct available colours to all countries, with the singleton assigned the most expensive colour. Both bounds are independent of estimates.

For each distinct legal child with interval [L, U], White combines children with max L / max U, and Black combines them with min L / min U. Missing children use the parent's base lower bound and the universal upper bound. When both bounds meet, the position is exact. A move witness must attain the required bound. This can prove a Black position with one optimal child plus lower bounds on the alternatives, for example; it never assumes that an unexplored alternative has the estimated value of a played line.

`solveIntoBook` explores a bounded part of the proof graph and then propagates bounds from later positions to earlier ones. A time/node limit leaves partial work and an interval, never a fabricated exact value. Already solved descendants are reused on subsequent runs. The optional solved-position callback in `choosePair` supplies exact minimax values to endgame search and MCTS leaf evaluation only for Search + book. Original Search does not pass this callback.

## Initial contents and growth

The bundled seed contains **1,043** canonical positions: **530 solved pairing positions**, **421 exact final maps**, and **92 estimated unsolved positions**. It includes the initial position, all 49 distinct first-pair choices, and six explored lines with solved late continuations. The initial position remains unsolved. Solved counts include the intermediate positions of the endgame proof graph, not just six sampled outcomes.

The browser can analyse the studied position or explore 1, 5 or 20 further lines. Growth cycles through all 49 openings; each line uses Search for subsequent moves and attempts to solve the reached position with three pair moves remaining. Analysing a chosen position begins proof expansion with four or fewer pair moves remaining. Earlier positions receive Search estimates. This first version explores representative Search lines, not every response from every opening.

In play, Search + book immediately uses a known proven optimal pair. An estimated book move is used only when its recorded time budget is at least the selected match level; a higher requested level triggers fresh Search. Fresh late-game proof work and Search analysis are saved back to the book. Original Search and Zero never consult the book. No improvement in playing strength is claimed from these features alone.

## Persistence, transfer and limits

The browser stores one book in IndexedDB on the current device. Work runs only while the page is open. Completed lines are saved; Stop finishes the active line or bounded position analysis. Book updates from playing and exploring are merged, preserving deeper-budget estimates and all stored proof positions. Reloads preserve the saved local book instead of overwriting it with the seed.

Exports contain canonical boards and estimates, not trusted exact flags. On loading or importing, final colourings are recomputed and all bounds/proof witnesses are derived afresh. Fake imported exact flags cannot influence the result. Illegal positions, keys, moves, counts and non-finite estimates are rejected. Import explicitly replaces the device's book after verification. At 50,000 positions growth stops; this is a browser research tool, not a full initial-position solver.

Run a bounded build from the project directory:

```sh
npm run book -- --lines 6 --ms 150 --out research/runs/book.json
npm run book -- --resume research/runs/book.json --lines 20 --ms 800 --out research/runs/continued.json
```

The CLI accepts the same full book exports. It saves after each complete line. Wall-clock Search makes trajectories hardware-dependent even with fixed seeds.

## Validation

Tests compare solved positions and their move witnesses with an independent exhaustive minimax traversal, across both roles, all eight symmetries and the fixed colour costs. They verify label/order invariance, singleton preservation, bound propagation from one solved child without falsely solving its parent, rejection of fake imported proof flags, leaf recomputation, book-assisted exact search, fresh-search fallback at higher levels, and verification of the shipped seed. The original rules and neural learning tests remain in the same suite.


Browser acceptance: the local book grew from the seed and was observed at 1,097 positions / 8 lines; those counts survived reload. A solved three-move endgame displayed value 2 and following its proven move led to a two-move position also proved at 2. This browsing left the existing match at 2 of 12 pairs. The book fit a 390-pixel viewport without horizontal overflow. Automatic approval review blocked a watched-game test that would have replaced the existing match. Instead, isolated Node worker tests ran the actual browser worker module through both roles against original Search, exercising cached estimates, fresh search, proof generation, saved exact moves and book updates without touching browser match state. Their nominal 40 ms moves were functional checks, not a fair strength benchmark against previously cached longer searches. All 35 automated tests passed.
