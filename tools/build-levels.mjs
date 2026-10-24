// Builds levels/levels.json.
//
// Levels 1 and 4 are transcribed cell-for-cell from screenshots of the real game.
// The rest are built by REVERSE construction: start from a cleared board and play
// moves backwards, spawning cats into the cells each hole vacates. Every level is
// therefore solvable by construction, and the forward solution is the reverse of
// the build sequence. We then BFS for the true minimum move count where that is
// cheap enough, and fall back to the construction length as an upper bound.
//
//   node tools/build-levels.mjs

import { writeFileSync } from 'node:fs';
import { solve } from './solver.mjs';

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

const SHAPES = {
  bar2h:  [[0, 0], [1, 0]],
  bar2v:  [[0, 0], [0, 1]],
  bar3h:  [[0, 0], [1, 0], [2, 0]],
  bar3v:  [[0, 0], [0, 1], [0, 2]],
  square: [[0, 0], [1, 0], [0, 1], [1, 1]],
  elbowA: [[0, 0], [0, 1], [1, 1]],
  elbowB: [[1, 0], [0, 1], [1, 1]],
  elbowC: [[0, 0], [1, 0], [0, 1]],
  elbowD: [[0, 0], [1, 0], [1, 1]],
  jay:    [[0, 0], [0, 1], [1, 1], [2, 1]],
  ell:    [[0, 0], [1, 0], [2, 0], [0, 1]],
  tee:    [[0, 0], [1, 0], [2, 0], [1, 1]],
};

const extent = cells => [
  Math.max(...cells.map(c => c[0])) + 1,
  Math.max(...cells.map(c => c[1])) + 1,
];

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, a) => a[Math.floor(rng() * a.length)];
const shuffled = (rng, a) => a.map(v => [rng(), v]).sort((p, q) => p[0] - q[0]).map(p => p[1]);

// ---------------------------------------------------------------- hand-authored

// Level 1: the real game's tutorial. One 2x2 hole, four cats, drag left twice.
const LEVEL_1 = {
  w: 4, h: 5,
  cats: [
    { color: 'yellow', x: 0, y: 0 }, { color: 'yellow', x: 1, y: 0 },
    { color: 'yellow', x: 0, y: 1 }, { color: 'yellow', x: 1, y: 1 },
  ],
  holes: [{ color: 'yellow', x: 2, y: 0, cells: SHAPES.square, cap: 4 }],
};

// Level 4: transcribed from the screenshot. 6x6, four colors, solves in 16 moves.
const LEVEL_4 = {
  w: 6, h: 6,
  cats: [
    { color: 'green',  x: 0, y: 0 }, { color: 'green',  x: 1, y: 0 },
    { color: 'red',    x: 3, y: 1 },
    { color: 'red',    x: 1, y: 2 }, { color: 'red',    x: 2, y: 2 },
    { color: 'green',  x: 4, y: 2 }, { color: 'green',  x: 5, y: 2 },
    { color: 'yellow', x: 0, y: 3 }, { color: 'yellow', x: 1, y: 3 },
    { color: 'blue',   x: 3, y: 3 }, { color: 'blue',   x: 4, y: 3 },
    { color: 'blue',   x: 2, y: 4 },
    { color: 'yellow', x: 4, y: 5 }, { color: 'yellow', x: 5, y: 5 },
  ],
  holes: [
    { color: 'red',    x: 0, y: 0, cells: [[2, 0], [0, 1], [1, 1], [2, 1]], cap: 3 },
    { color: 'green',  x: 4, y: 0, cells: SHAPES.square, cap: 4 },
    { color: 'yellow', x: 0, y: 4, cells: SHAPES.square, cap: 4 },
    { color: 'blue',   x: 3, y: 4, cells: [[0, 0], [1, 0], [2, 0], [0, 1]], cap: 3 },
  ],
};

// ---------------------------------------------------------------- reverse build

function build(rng, spec) {
  const { w, h, colors, shapes, caps, steps } = spec;

  const cats = [];
  const catGrid = Array.from({ length: h }, () => Array(w).fill(false));
  const holes = colors.map(color => ({
    color,
    cells: SHAPES[pick(rng, shapes)],
    x: 0, y: 0,
    active: false,
    want: caps[Math.floor(rng() * caps.length)],
    got: 0,
  }));

  const footprint = (hole, x, y) => hole.cells.map(([dx, dy]) => [x + dx, y + dy]);
  const inBounds = ([x, y]) => x >= 0 && y >= 0 && x < w && y < h;

  const blocked = (cellList, self) => cellList.some(([x, y]) => {
    if (!inBounds([x, y])) return true;
    if (catGrid[y][x]) return true;
    return holes.some(o => o !== self && o.active &&
      footprint(o, o.x, o.y).some(([ox, oy]) => ox === x && oy === y));
  });

  // Activate a hole: its first reverse move is its last forward move, so it must
  // swallow at least one cat there — otherwise it would already be gone.
  function activate(hole) {
    const [sw, sh] = extent(hole.cells);
    for (let attempt = 0; attempt < 400; attempt++) {
      const bx = Math.floor(rng() * (w - sw + 1));
      const by = Math.floor(rng() * (h - sh + 1));
      const at = footprint(hole, bx, by);
      if (blocked(at, hole)) continue;

      const [dx, dy] = pick(rng, DIRS);
      const ax = bx - dx, ay = by - dy;
      const to = footprint(hole, ax, ay);
      if (to.some(c => !inBounds(c))) continue;

      const stays = new Set(to.map(([x, y]) => `${x},${y}`));
      const entering = to.filter(([x, y]) => !at.some(([ox, oy]) => ox === x && oy === y));
      if (blocked(entering, hole)) continue;

      const vacated = at.filter(([x, y]) => !stays.has(`${x},${y}`));
      if (!vacated.length) continue;

      const n = 1 + Math.floor(rng() * Math.min(vacated.length, hole.want));
      for (const [x, y] of shuffled(rng, vacated).slice(0, n)) {
        catGrid[y][x] = true;
        cats.push({ color: hole.color, x, y });
        hole.got++;
      }
      hole.x = ax; hole.y = ay; hole.active = true;
      return true;
    }
    return false;
  }

  function reverseMove(hole) {
    const [dx, dy] = pick(rng, DIRS);
    const ax = hole.x - dx, ay = hole.y - dy;
    const from = footprint(hole, hole.x, hole.y);
    const to = footprint(hole, ax, ay);
    if (to.some(c => !inBounds(c))) return false;

    const entering = to.filter(([x, y]) => !from.some(([ox, oy]) => ox === x && oy === y));
    if (blocked(entering, hole)) return false;

    const stays = new Set(to.map(([x, y]) => `${x},${y}`));
    const vacated = from.filter(([x, y]) => !stays.has(`${x},${y}`));

    hole.x = ax; hole.y = ay;

    const room = hole.want - hole.got;
    if (room > 0 && vacated.length && rng() < 0.55) {
      const n = 1 + Math.floor(rng() * Math.min(vacated.length, room));
      for (const [x, y] of shuffled(rng, vacated).slice(0, n)) {
        catGrid[y][x] = true;
        cats.push({ color: hole.color, x, y });
        hole.got++;
      }
    }
    return true;
  }

  for (const hole of shuffled(rng, holes)) {
    if (!activate(hole)) return null;
  }

  let made = holes.length;
  for (let i = 0; i < steps * 6 && made < steps; i++) {
    const hole = pick(rng, holes);
    if (reverseMove(hole)) made++;
  }

  if (holes.some(hl => hl.got === 0)) return null;
  if (cats.length > 26) return null;

  let empty = w * h - cats.length - holes.reduce((s, hl) => s + hl.cells.length, 0);
  if (empty < 3) return null;

  return {
    level: {
      w, h, cats,
      holes: holes.map(hl => ({ color: hl.color, x: hl.x, y: hl.y, cells: hl.cells, cap: hl.got })),
    },
    built: made,
  };
}

// Difficulty ramp. `target` is the wanted minimum-move count; `steps` is how many
// reverse moves to lay down (kept above target so there is room to find one).
// Level 4 is the real game's and sits at 16, so level 5 dips below it — that is
// the original's own pacing, not a generation artefact.
const SPECS = [
  { n: 2,  w: 5, h: 5, colors: ['yellow', 'red'],                     shapes: ['square', 'bar2h', 'bar2v'],            caps: [2, 3], target: 4,  steps: 10 },
  { n: 3,  w: 5, h: 6, colors: ['blue', 'green'],                     shapes: ['square', 'elbowA', 'elbowC'],          caps: [3, 4], target: 6,  steps: 16 },
  { n: 5,  w: 5, h: 6, colors: ['red', 'yellow', 'green'],            shapes: ['square', 'elbowA', 'elbowB', 'bar2h'], caps: [3, 4], target: 8, steps: 20 },
  { n: 6,  w: 6, h: 6, colors: ['blue', 'orange', 'green'],           shapes: ['square', 'elbowC', 'elbowD', 'bar3h'], caps: [3, 4], target: 10, steps: 24 },
  { n: 7,  w: 6, h: 6, colors: ['purple', 'yellow', 'red'],           shapes: ['square', 'jay', 'elbowA'],             caps: [3, 4], target: 11, steps: 26 },
  { n: 8,  w: 6, h: 6, colors: ['teal', 'pink', 'blue'],              shapes: ['square', 'ell', 'bar2v'],              caps: [3, 4], target: 12, steps: 28 },
  { n: 9,  w: 6, h: 7, colors: ['green', 'red', 'orange'],            shapes: ['square', 'tee', 'elbowB'],             caps: [4, 5], target: 13, steps: 30 },
  { n: 10, w: 6, h: 7, colors: ['yellow', 'blue', 'purple', 'red'],   shapes: ['square', 'elbowA', 'elbowD', 'bar2h'], caps: [3, 4], target: 14, steps: 32 },
  { n: 11, w: 6, h: 7, colors: ['pink', 'green', 'teal', 'orange'],   shapes: ['square', 'jay', 'elbowC'],             caps: [3, 4], target: 15, steps: 34 },
  { n: 12, w: 6, h: 7, colors: ['red', 'blue', 'yellow', 'green'],    shapes: ['square', 'ell', 'elbowB', 'bar3v'],    caps: [3, 4], target: 16, steps: 36 },
  { n: 13, w: 7, h: 7, colors: ['orange', 'purple', 'teal', 'blue'],  shapes: ['square', 'tee', 'elbowA'],             caps: [3, 4], target: 17, steps: 38 },
  { n: 14, w: 7, h: 7, colors: ['green', 'pink', 'red', 'yellow'],    shapes: ['square', 'jay', 'ell'],                caps: [3, 4], target: 18, steps: 40 },
  { n: 15, w: 7, h: 7, colors: ['blue', 'orange', 'green', 'purple'], shapes: ['square', 'elbowB', 'elbowD', 'bar3h'], caps: [3, 4], target: 19, steps: 42 },
  { n: 16, w: 7, h: 7, colors: ['teal', 'red', 'yellow', 'pink'],     shapes: ['square', 'tee', 'jay'],                caps: [3, 4], target: 20, steps: 44 },
  { n: 17, w: 7, h: 7, colors: ['purple', 'green', 'blue', 'orange'], shapes: ['square', 'ell', 'elbowA'],             caps: [3, 4], target: 19, steps: 46 },
  { n: 18, w: 7, h: 7, colors: ['red', 'teal', 'pink', 'yellow'],     shapes: ['square', 'jay', 'elbowC'],             caps: [3, 4], target: 20, steps: 48 },
  { n: 19, w: 7, h: 7, colors: ['blue', 'purple', 'orange', 'red'],   shapes: ['square', 'tee', 'elbowD'],             caps: [4, 5], target: 20, steps: 52 },
  { n: 20, w: 7, h: 7, colors: ['green', 'yellow', 'pink', 'blue'],   shapes: ['square', 'ell', 'jay'],                caps: [4, 5], target: 21, steps: 56 },
];

// Reverse construction guarantees solvability but tends to leave shortcuts, so a
// long build often has a short true solution. We therefore generate many
// candidates per slot and keep the one with the DEEPEST proven minimum, stopping
// early once a slot reaches its target. Only exact (BFS-proven) minimums ship, so
// every number in levels.json is the real shortest solution.
const EXACT_LIMIT = 400000;
const levels = [];

for (let n = 1; n <= 20; n++) {
  if (n === 1 || n === 4) {
    const lv = n === 1 ? LEVEL_1 : LEVEL_4;
    const min = solve(lv, 4000000);
    if (min === null) { console.error(`Level ${n} transcription is not solvable`); process.exit(1); }
    levels.push({ ...lv, moves: min, exact: true, source: 'screenshot' });
    process.stderr.write(`  level ${n}: ${min} moves (from screenshot)\n`);
    continue;
  }

  const spec = SPECS.find(s => s.n === n);
  let chosen = null;

  for (let seed = 1; seed <= 150; seed++) {
    const made = build(mulberry32(seed * 7919 + n * 104729), spec);
    if (!made) continue;

    const min = solve(made.level, EXACT_LIMIT);
    if (min === null) continue;               // too deep to prove — skip it

    if (spec.target <= 8) {
      // Early levels are a tutorial, so overshooting is worse than undershooting:
      // take the candidate nearest the target rather than the hardest one.
      const score = Math.abs(min - spec.target);
      if (!chosen || score < Math.abs(chosen.moves - spec.target)) {
        chosen = { ...made.level, moves: min, exact: true, source: 'generated' };
        if (score <= 1) break;
      }
    } else if (!chosen || min > chosen.moves) {
      chosen = { ...made.level, moves: min, exact: true, source: 'generated' };
      if (min >= spec.target) break;
    }
  }

  if (!chosen) { console.error(`Level ${n}: reverse build failed`); process.exit(1); }
  process.stderr.write(`  level ${n}: ${chosen.moves} moves (target ${spec.target})\n`);
  levels.push(chosen);
}

const out = levels.map((lv, i) => ({
  n: i + 1,
  w: lv.w,
  h: lv.h,
  time: 300,
  moves: lv.moves,
  exact: lv.exact,
  source: lv.source,
  cats: lv.cats,
  holes: lv.holes,
}));

writeFileSync(new URL('../levels/levels.json', import.meta.url), JSON.stringify(out, null, 1));

console.log('lvl   size  colors  cats  holecells  solution  source');
for (const lv of out) {
  const colors = new Set(lv.holes.map(hl => hl.color)).size;
  const hc = lv.holes.reduce((s, hl) => s + hl.cells.length, 0);
  console.log(
    String(lv.n).padStart(3),
    `${lv.w}x${lv.h}`.padStart(6),
    String(colors).padStart(7),
    String(lv.cats.length).padStart(5),
    String(hc).padStart(10),
    (String(lv.moves) + (lv.exact ? '' : '+')).padStart(9),
    ' ' + lv.source,
  );
}
