// Fast BFS solver used to prove every shipped level is finishable.
//
// Because a hole's capacity is always exactly the number of live cats of its
// color, capacity is derived rather than stored. That collapses a position to
// just (hole origins, alive-cat bitmask), which is small enough to BFS directly
// and gives a true minimum move count.

export function compile(level) {
  const { w, h } = level;
  const n = w * h;

  const cats = level.cats.map((c, i) => ({ ...c, bit: i }));
  if (cats.length > 30) throw new Error('solver supports at most 30 cats per level');

  const catAt = new Int8Array(n).fill(-1);
  for (const c of cats) catAt[c.y * w + c.x] = c.bit;

  const holes = level.holes.map(hl => ({
    color: hl.color,
    cells: hl.cells.map(([dx, dy]) => [dx, dy]),
    start: hl.y * w + hl.x,
    // bitmask of every cat this hole is allowed to eat
    edible: cats.reduce((m, c) => (c.color === hl.color ? m | (1 << c.bit) : m), 0),
  }));

  return { w, h, n, cats, catAt, holes, fullMask: (1 << cats.length) - 1 };
}

const packPositions = pos => pos.reduce((acc, p, i) => acc + p * Math.pow(64, i), 0);

/**
 * Apply one single-cell move. Returns the new cell index for the hole and the
 * new alive mask, or null when the move is blocked.
 */
function step(cx, pos, alive, hi, dx, dy) {
  const { w, h, catAt } = cx;
  const hole = cx.holes[hi];
  const ox = pos[hi] % w, oy = (pos[hi] / w) | 0;

  const nx = ox + dx, ny = oy + dy;
  let newAlive = alive;

  for (const [sx, sy] of hole.cells) {
    const x = nx + sx, y = ny + sy;
    if (x < 0 || y < 0 || x >= w || y >= h) return null;

    // still inside the hole's own footprint? then it is not "entering" anything
    const wasOwn = hole.cells.some(([ax, ay]) => ox + ax === x && oy + ay === y);
    if (wasOwn) continue;

    const cell = y * w + x;

    for (let j = 0; j < cx.holes.length; j++) {
      if (j === hi) continue;
      if (!isLive(cx, alive, j)) continue;
      const jx = pos[j] % w, jy = (pos[j] / w) | 0;
      if (cx.holes[j].cells.some(([ax, ay]) => jx + ax === x && jy + ay === y)) return null;
    }

    const bit = catAt[cell];
    if (bit >= 0 && (newAlive >> bit) & 1) {
      if (!((hole.edible >> bit) & 1)) return null; // wrong color blocks
      newAlive &= ~(1 << bit);
    }
  }

  return [ny * w + nx, newAlive];
}

/** A hole is gone once no cat of its color is left. */
function isLive(cx, alive, hi) {
  return (cx.holes[hi].edible & alive) !== 0;
}

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** Minimum number of single-cell moves to clear the board, or null. */
export function solve(level, limit = 1500000) {
  const r = search(level, limit, false);
  return r === null ? null : r.depth;
}

/**
 * Same search, but also returns the move list as [holeIndex, dx, dy] triples.
 * Used to replay a solution through the real game engine.
 */
export function solvePath(level, limit = 1500000) {
  return search(level, limit, true);
}

function search(level, limit, wantPath) {
  const cx = compile(level);
  const startPos = cx.holes.map(hl => hl.start);
  if (cx.fullMask === 0) return { depth: 0, path: [] };

  const startKey = packPositions(startPos) + ':' + cx.fullMask;
  const seen = new Set([startKey]);
  // key -> [parentKey, holeIndex, dx, dy]; only built when a path is wanted
  const from = wantPath ? new Map() : null;

  let frontier = [[startPos, cx.fullMask, startKey]];
  let depth = 0;
  let visited = 1;

  while (frontier.length && visited < limit) {
    const next = [];
    depth++;

    for (const [pos, alive, parentKey] of frontier) {
      for (let hi = 0; hi < cx.holes.length; hi++) {
        if (!isLive(cx, alive, hi)) continue;

        for (const [dx, dy] of DIRS) {
          const res = step(cx, pos, alive, hi, dx, dy);
          if (!res) continue;
          const [cell, newAlive] = res;

          const newPos = pos.slice();
          newPos[hi] = cell;
          const key = packPositions(newPos) + ':' + newAlive;

          if (newAlive === 0) {
            if (!wantPath) return { depth, path: null };
            from.set(key, [parentKey, hi, dx, dy]);
            return { depth, path: unwind(from, key, startKey) };
          }

          if (seen.has(key)) continue;
          seen.add(key);
          if (wantPath) from.set(key, [parentKey, hi, dx, dy]);
          visited++;
          next.push([newPos, newAlive, key]);
        }
      }
    }
    frontier = next;
  }

  return null;
}

function unwind(from, endKey, startKey) {
  const path = [];
  let key = endKey;
  while (key !== startKey) {
    const [parentKey, hi, dx, dy] = from.get(key);
    path.push([hi, dx, dy]);
    key = parentKey;
  }
  return path.reverse();
}
