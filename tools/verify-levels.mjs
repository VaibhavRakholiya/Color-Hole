// Checks every shipped level against the REAL game engine.
//
// The solver (tools/solver.mjs) and the engine the game runs on (src/engine.js)
// are separate implementations of the same rules. If they ever drift apart, a
// level could be "verified" by the solver and still be unplayable. So here we
// ask the solver for an actual move list and replay it through src/engine.js,
// asserting the game reaches a win.
//
//   node tools/verify-levels.mjs

import { readFileSync } from 'node:fs';
import { createState, stepHole, isWon } from '../src/engine.js';
import { solvePath } from './solver.mjs';

const levels = JSON.parse(readFileSync(new URL('../levels/levels.json', import.meta.url), 'utf8'));

let failures = 0;

for (const level of levels) {
  const found = solvePath(level, 3000000);

  if (!found) {
    console.log(`FAIL level ${level.n}: solver could not find a solution`);
    failures++;
    continue;
  }

  if (found.depth !== level.moves) {
    console.log(`FAIL level ${level.n}: recorded ${level.moves} moves, solver found ${found.depth}`);
    failures++;
    continue;
  }

  // Replay through the shipped engine.
  const state = createState(level);
  let bad = null;

  for (const [holeIndex, dx, dy] of found.path) {
    const hole = state.holes[holeIndex];
    const res = stepHole(state, hole.id, dx, dy);
    if (!res) { bad = `engine rejected move on hole ${holeIndex} (${dx},${dy})`; break; }
  }

  if (bad) {
    console.log(`FAIL level ${level.n}: ${bad}`);
    failures++;
  } else if (!isWon(state)) {
    console.log(`FAIL level ${level.n}: replay finished with ${state.cats.length} cats left`);
    failures++;
  } else {
    const colors = new Set(level.holes.map(h => h.color)).size;
    console.log(
      `ok   level ${String(level.n).padStart(2)}  ${level.w}x${level.h}  ` +
      `${colors} colours  ${String(level.cats.length).padStart(2)} cats  ` +
      `${String(level.moves).padStart(2)} moves  (${level.source})`);
  }
}

console.log(failures
  ? `\n${failures} of ${levels.length} levels FAILED`
  : `\nall ${levels.length} levels verified against src/engine.js`);

process.exit(failures ? 1 : 0);
