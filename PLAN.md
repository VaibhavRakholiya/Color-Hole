# Color Hole — Web Game Plan

A browser clone of **Catdom: Color Hole** (XGame Global, `com.drop.cat.color.hole.puzzle`).

## Reference material

Mechanics below come from screenshots of the real game (levels 1 and 4, the win screen, and
the Play Store shots of levels 5, 10, 66, 80). Early-level rules are confirmed; a few
later-level systems are still marked ❓.

The app is installed on the `Pixel_9_Pro` AVD but **does not run there** — the only system
image on this machine is `android-37.2/google_apis_playstore_ps16k/arm64-v8a` (16 KB page
size) and this Unity build isn't 16 KB compatible, so it burns CPU on the splash and dies back
to the launcher. Playing it locally would need a standard 4 KB-page image (~1.5 GB download)
and a new AVD. Not required for the build — the screenshots cover it.

## Confirmed mechanics

**Board** — a plain rectangular grid, no edge furniture in early levels. Level 1 is 4×5,
level 4 is 5×6. The grid grows with level number.

**Kitties** — 1×1 colored tiles. Static; they never move on their own. Yellow, red, green,
blue, orange, purple, pink, teal.

**Holes** — colored polyominoes (2×2 square, L-tromino, L-tetromino, 1×2 bar, plus/cross)
each carrying a capacity number. You **drag a hole in any direction** — early holes are not
axis-locked. It slides across the grid, and kitties of the **matching color** that it reaches
fall in, decrementing the counter. At 0 the hole is consumed and vanishes, freeing its cells.

**Capacity equals the cat count.** In every level checked, each hole's number is exactly the
number of kitties of its color on the board. Level 1: four yellow cats, one yellow 2×2 hole
marked 4. Level 4: red L marked 3 with 3 red cats, green 2×2 marked 4 with 4 green cats,
yellow 2×2 marked 4 with 4 yellow cats, blue L marked 3 with 3 blue cats. So there is no
slack — every hole must eat exactly its own color, and the win condition is simply **board
cleared**.

**Level 1 is the tutorial case**: four yellow cats in a 2×2 clump top-left, a yellow 2×2 hole
top-right, nothing else. Drag the hole left across them, done.

**HUD** — level number, 5:00 countdown, undo, pause, coin balance. Win screen is *"Well Done!"*
with a coin reward (x40 observed) and a Continue button. Booster slots along the bottom unlock
at LV 8, 12, 16 and 21.

## Still open ❓

- **Movement restriction glyphs.** Levels 10/66/80 show holes bearing `↔`, `↕` and a one-way
  `⋘`. Those holes are presumably locked to that axis or direction. Early levels have no
  glyph and appear free to move in all four directions.
- **Edge trays.** Levels 10/66/80 have small trays *outside* the board edges holding a cat and
  a count (2–7). Absent from levels 1 and 4. Either per-color goal quotas or queues that feed
  fresh kitties onto the board as space frees. Needs one more screenshot of a level with trays,
  before and after a move.
- **Cages and keys.** Level 66 has crosshatched holes with a padlock + number, and kitties
  drawn holding a golden key. Presumably clearing the key cats opens the cages.
- **Blocking rule.** Does a sliding hole stop when it meets a *non*-matching cat, or pass over
  it? Almost certainly stops — that's what makes the puzzle — but worth confirming.

*(Corrected from the earlier draft: there are no ice cells — the blue tint in the level 5 shot
is a motion trail from the block that had just slid. And exit trays are not a core mechanic;
they're a later-level addition.)*

## What to build

Single-page web game, portrait-first, mouse + touch. No framework, no build step — plain
ES modules served statically, so it opens with `python3 -m http.server`.

```
Color Hole/
  index.html
  styles.css
  src/
    main.js        bootstrap, game loop
    grid.js        board model: cells, occupancy, polyomino placement
    entities.js    Kitty, Hole
    rules.js       slide resolution, absorption, win/lose checks
    input.js       pointer drag -> slide with cell snapping
    render.js      canvas 2D draw: board, kitties, holes, counters, FX
    levels.js      level definitions + a generator for endless levels
    ui.js          HUD, win/fail overlays, undo
    audio.js       WebAudio blips (no asset files)
  levels/
    levels.json    hand-authored level data
```

Canvas 2D for the board (smooth slide + absorb animation, particle pops), DOM for HUD and
overlays. Cats drawn as simple vector shapes in code — no third-party art, so nothing is
copied from the original.

## Milestones

Agreed scope: **cats, 20-level demo.**

**M1 — Core loop. Done.** Grid model, cat + hole entities, free-direction drag with cell
snapping, collision against walls, other holes and non-matching cats, absorption on contact,
hole removal at 0, win when the board is clear. Levels 1 and 4 ported exactly.

**M2 — Game feel. Done.** Eased slide, suck-and-shrink on absorb, counter pop, blocked-move
thud, particle burst when a hole fills, confetti-free but faithful "Well Done!" screen.
Synthesised sound throughout — no audio files.

**M3 — Level content. Done.** 20 levels. Levels 1 and 4 transcribed from the real game, the
other 18 built by reverse construction and BFS-verified. See README for the method.

**M4 — Meta. Partly done.** Level select, `localStorage` progress, 5:00 timer, undo and coin
rewards are in. The later-level systems (axis-locked holes, edge trays, cages/keys) are not —
they depend on the ❓ items above.

**M5 — Polish. Partly done.** Responsive to narrow phones, reduced-motion respected in both
CSS and canvas, and every colour carries a distinct glyph so the board is not colour-only.
Keyboard control is not implemented.

## What would come next

1. Resolve the ❓ items from a few more screenshots, then build the later-level systems.
2. Keyboard control — currently the game cannot be played without a pointer.
3. Deadlock detection: if no legal move remains, the player has to notice for themselves.
