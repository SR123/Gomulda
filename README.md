# Gomulda

A playable browser implementation of **Cristoffer Crone’s Gomulda**, based on the rules provided by Søren Riis on 12 September 2026.

**[Play Gomulda](https://sr123.github.io/Gomulda/)** · **[Read the history](https://sr123.github.io/Gomulda/#history)**

Open the game in a modern browser on a computer, tablet or phone. No account is needed. On iPhone, open the game in Safari and use **Share → Add to Home Screen** for an icon on your Home Screen.

Play against the AI, share the screen with another person, or watch two AIs. The game includes both phases, two rounds with reversed roles, tentative planning colours, undo, suggestions, an optimal-colouring assistant, keyboard navigation and automatic device-local save/resume. No API key or server computation is required; AI runs in a Web Worker.

## Rules

White and Black alternately pair any two unused cells of a 5×5 board, starting with country 0. Countries 0–11 have two cells; the final cell becomes country 12. Adjacent cells of the same country do not create a self-conflict. Different countries touching along a side must have different colours. Diagonal contact does not count.

Only Black colours the finished map. Both cells in a country always share a colour. Blue, green and yellow cost 0; red costs 1 per cell; black costs 5 per cell. The total penalty is White’s score. After two rounds with reversed roles, the higher score wins. Planning colours never affect the final colouring or its score.

**Fixed rule, confirmed by Søren Riis on 13 September 2026:** violet, the sixth colour, costs 25 per cell (50 per paired country, 25 for the singleton). Additional colours cost five times the preceding colour. The costs are not configurable. Test data contains a concrete six-country clique, proving that five colours do not always suffice on a legal paired board.

## AI

- **Colouring:** exact weighted graph colouring using DSATUR variable ordering, branch-and-bound, admissible lower bounds and symmetry reduction for equal-cost colours. The solver provides a legal colouring and the globally minimum penalty. With only 13 vertices, tested boards solve quickly.
- **Early pairing:** time-limited adversarial Monte Carlo tree search with alternating maximising/minimising UCB, progressive widening, symmetry reduction at the root, and random-completion rollouts scored by the exact colouring solver. Estimates are explicitly labelled as estimates.
- **Late pairing:** exact alpha-beta minimax with transposition bounds, board dihedral symmetry and country-label canonicalisation, attempted from four pairs remaining. An incomplete search falls back to MCTS. The interface claims exact endgame values only when established.
- **Limitations:** the early game is not solved. A random opponent is a weak baseline, and the measured performance does not establish expert human strength. Time-limited results vary with hardware and browser load. Gomulda Search has no learned policy or LLM. Gomulda Zero is a separate engine; see the learning section below.

### Search levels and depth

The **AI thinking time** controls is visible beside the board and in the new-match dialog. Quick / Thoughtful / Deep / Extended give nominal budgets of **0.8 / 3 / 10 / 30 seconds per move**, independently for each player and that player’s hints. Both choices are saved with the match and stay with the engines across role swaps, reloads and the next self-play match. Training and arena budgets remain independent. Active searches keep the budget with which they started.

These engines use adaptive trees, so a time level is not a fixed number of moves ahead. The UI reports actual elapsed time, search work and the deepest branch visited. For Search, MCTS tree depth excludes random-completion rollouts, which reach the completed map; exact-minimax depth is tracked separately and the display uses the greater visited depth. For Zero, depth counts PUCT edges from the current board. One depth unit means one player's pair assignment, not a White-and-Black turn pair. A deep branch does not prove every branch was searched to that depth. Only a completed exact minimax result is called solved. Final colouring stays exact at every level.

Budgets are approximate: root coverage and indivisible colouring/symmetry calculations can overrun, while solved endgames may finish early. Longer budgets do not guarantee a better individual move or a particular depth. Zero's checkpoint weights are unchanged by choosing a level.

### Explicit neural role input

Input **325** is a dedicated signed role feature: **White = +1**, **Black = −1**. It has been present since the initial model; named constants and tests now document that contract. Input 326 encodes the ply. Role is derived from the current round's pairing turn, not the player's permanent seat, so it follows the role reversal in round two. The training target is `roleSign * terminalPenalty / 10`; tree selection maximizes the White-perspective value on White's moves and minimizes it on Black's moves. The learning lab explains both objectives and this encoding. Existing checkpoints retain their original dimensions and meaning.

## Validation

Run `npm test` (Node 20+). No package installation is necessary. Tests cover borders, arbitrary pairs, singleton weighting, red/black/extra colour costs, invalid moves, colouring legality, scoring, role swaps, undo, saving and tentative notes. The weighted solver agrees with an independent exhaustive oracle on 120 small random graphs. A further 2,000 valid random game boards were checked for legality and recomputed score; those checks alone do not independently prove optimality. Exact endgame decisions agree with independent exhaustive minimax on 12 late positions.

`node tests/benchmark.js 16 150` plays 16 two-round matches against uniform random pairing; both sides colour optimally. The saved run in `tests/benchmark-results.json` recorded **16 AI wins, 0 draws, 0 losses**. The average AI White score was 25.25; random White scored 0. This is a simple strength sanity check, not an Elo estimate. `tests/selfplay-results.json` records four 400 ms-per-move AI-versus-AI rounds, each ending with a minimum penalty of 2.

`tests/six-colour-witness.json` records a completed board where countries **0, 2, 4, 5, 6, 8** are pairwise adjacent. Therefore at least six colours are required. This fixture is intentionally separate from claims about typical play.

Browser QA covers selecting pairs, rejecting occupied cells, phase transition, country colouring, invalid/conflicting/incomplete submissions, optimal assistance, role swaps, device-local persistence, automatic AI play, responsive layout, and WebMCP actions.

## Run locally

Run `npm start`, then open http://localhost:4179. Modules and workers need HTTP rather than opening the HTML as a file. The app uses only static assets in `dist/`; optional Google Fonts have system-font fallbacks.

## Files

- `dist/engine.js`: rules, graph representation, exact solver and pairing search.
- `dist/game.js`: match state and validated transitions.
- `dist/worker.js`: background AI worker.
- `dist/app.js`: interface, local save and optional WebMCP tools.
- `dist/index.html`, `dist/style.css`: responsive interface.
- `tests/`: independent checks, benchmarks and explicit witnesses.

## Website publishing

The public website is hosted by **GitHub Pages** at https://sr123.github.io/Gomulda/.
The workflow in `.github/workflows/pages.yml` runs the game tests and checks the
static assets before publishing `dist/`. Pushing to `main` publishes an update
automatically; pull requests run the checks without publishing. The workflow can
also be started manually from the repository's Actions tab.

All asset, module, worker and model paths are relative, so the app works under
the `/Gomulda/` project path. No API key, package installation or build step is
needed. Run `npm run check:site` to check the static files before publishing.

The social preview is `dist/og.png`, referenced by absolute Open Graph and
X card URLs in `dist/index.html`. After changing the preview, use
[LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) with the
live website URL to refresh LinkedIn's cached preview. Existing profile media
may need to be added again to retrieve the updated image.

Matches, learned checkpoints and opening-book additions stay in the visitor's
browser. The GitHub Pages address has separate storage from other hosted copies
of Gomulda. Use the Learning lab and Opening book export/import controls to
transfer that work between addresses or devices.

## Contributing

Issues and pull requests are welcome for interface improvements, engine
experiments and mathematical analysis. Run `npm test` and `npm run check:site`
before proposing a change. Include reproducible positions, settings and results
for engine changes, and distinguish experimental evidence from proofs.


## Two separate engines and self-play learning

**Gomulda Search** remains the original engine and the default. Its original pairing algorithm in `dist/engine.js` is retained, with depth and work counters added for display. **Gomulda Zero** is independently implemented in `dist/learning.js`: it uses its own learned priors, value prediction and PUCT search, without Search's rollouts or exact pairing-endgame substitution. Both engines share the exact colouring solver and game rules.

Use **Self-play** to select an engine and thinking-time budget for each player, watch a bounded series of matches, pause, or advance one move. Roles and boards reset automatically. Watching a series does not train. Each match freezes its Zero checkpoint so concurrent learning cannot silently change its player.

Use **Learning lab** to train Zero, test a frozen model against Search, export a checkpoint, or import one. Choose **Gomulda Search · alternate roles** to train against the fixed Search engine as both White and Black, or retain **Gomulda Zero · self-play**. Search’s thinking time is adjustable. Role counts are saved with the model, so stopping after an odd number of rounds and resuming continues with the other role. Only Zero’s own decisions and the final game scores become new training data; test games never enter replay or update weights. Training sessions are stored in IndexedDB on the current browser/device, including model weights, replay and Adam optimizer. They do not train a shared cloud model, do not run after the page is closed, and do not alter Search. A checkpoint is tied to its sixth-colour cost; incompatible game costs are rejected. Device-local checkpoints take precedence over the bundled experimental model after future site updates.

The shipped experimental model has **2,560 self-play training rounds and 20,480 gradient updates**. In an eight-match role-balanced test at 150 ms per move it achieved **0 wins, 3 draws and 5 losses** against Search, mean score margin **−5.75**. An earlier 512-round model lost all eight matches. These small, hardware-dependent validation sets do not establish a statistically reliable improvement or high-level strength. Detailed scores and configurations are in `training/reports/`. Search remains the default; there is no automatic promotion.

See `training/RESEARCH.md` for representation, learning algorithm, checkpoint formats, evaluation limitations, and the path to a stronger engine.


## Opening book and solved positions

Use **Opening book** to browse the 49 distinct first-pair choices, follow stored suggestions, inspect a solved example, analyse the current match position, or grow more lines. The initial seed has 1,043 canonical positions, including 530 solved pairing positions and 421 solved final maps. The initial value remains unproved. Rotations, reflections and pairing order share entries; moves are mapped back to the actual board.

Choose **Gomulda Search + book** in a new match to use the book. Proven entries supply exact moves and saved endgame values; estimates are clearly labelled and deeper requested levels trigger fresh search when needed. Original Search and Zero remain separate. Book work is saved locally and can be exported/imported with proof recomputation. See `research/BOOK.md` for bounds, validation, growth limits and the command-line workflow.

## History

The History section presents Søren Riis’s first-person recollections of Cristoffer Crone,
the invention around 1974, other Gomulda games, Dansk Gomulda Laug and its
approximately 20 members, including his rating around 93, the other players’
ratings from the low 60s to the high 70s, and the inventor’s low rating.
It explains the original rating system and the
80-versus-70 draw example (new ratings 79 and 71). Biography dates remain
explicitly unconfirmed. Personal character descriptions and other people’s
psychiatric speculation are attributed to recollection, not presented as a
verified diagnosis. The spelling Cristoffer was confirmed by Søren on
13 September 2026. The note on “laug” gives its English meaning: guild or association.
