// Pure game model. No DOM in here — tools/ imports this under Node to verify levels.

export const DIRS = {
  left:  [-1, 0],
  right: [ 1, 0],
  up:    [ 0, -1],
  down:  [ 0, 1],
};

export const COLORS = ['yellow', 'red', 'green', 'blue', 'orange', 'purple', 'pink', 'teal'];

const key = (x, y) => y * 1000 + x;

export function createState(level) {
  return {
    w: level.w,
    h: level.h,
    cats: level.cats.map((c, i) => ({ id: i, color: c.color, x: c.x, y: c.y })),
    holes: level.holes.map((h, i) => ({
      id: i,
      color: h.color,
      x: h.x,
      y: h.y,
      cells: h.cells.map(([dx, dy]) => [dx, dy]),
      cap: h.cap,
      dead: false,
    })),
  };
}

export function cloneState(s) {
  return {
    w: s.w,
    h: s.h,
    cats: s.cats.map(c => ({ ...c })),
    holes: s.holes.map(h => ({ ...h, cells: h.cells })), // cells never mutate
  };
}

export function holeCells(hole) {
  return hole.cells.map(([dx, dy]) => [hole.x + dx, hole.y + dy]);
}

function holeCovers(hole, x, y) {
  if (hole.dead) return false;
  for (const [dx, dy] of hole.cells) {
    if (hole.x + dx === x && hole.y + dy === y) return true;
  }
  return false;
}

export function catAt(state, x, y) {
  return state.cats.find(c => c.x === x && c.y === y);
}

export function holeAt(state, x, y) {
  return state.holes.find(h => holeCovers(h, x, y));
}

/**
 * Move one hole a single cell. Returns null if the move is blocked, otherwise
 * { absorbed: Cat[], cleared: boolean } and the state is mutated.
 *
 * A step is blocked by the wall, by another hole, and by any cat that does not
 * match the hole's color. A matching cat is swallowed instead of blocking.
 */
export function stepHole(state, holeId, dx, dy) {
  const hole = state.holes.find(h => h.id === holeId);
  if (!hole || hole.dead) return null;

  const own = new Set(holeCells(hole).map(([x, y]) => key(x, y)));
  const entering = holeCells(hole)
    .map(([x, y]) => [x + dx, y + dy])
    .filter(([x, y]) => !own.has(key(x, y)));

  const absorbed = [];
  for (const [x, y] of entering) {
    if (x < 0 || y < 0 || x >= state.w || y >= state.h) return null;

    for (const other of state.holes) {
      if (other.id !== hole.id && holeCovers(other, x, y)) return null;
    }

    const cat = catAt(state, x, y);
    if (cat) {
      if (cat.color !== hole.color) return null;
      if (absorbed.length >= hole.cap) return null; // would overfill
      absorbed.push(cat);
    }
  }

  hole.x += dx;
  hole.y += dy;
  for (const cat of absorbed) {
    state.cats.splice(state.cats.indexOf(cat), 1);
  }
  hole.cap -= absorbed.length;

  const cleared = hole.cap <= 0;
  if (cleared) hole.dead = true;

  return { absorbed, cleared, hole };
}

export function isWon(state) {
  return state.cats.length === 0;
}

/** Stable identity of a position, for the solver's visited set. */
export function stateKey(state) {
  const holes = state.holes
    .map(h => (h.dead ? 'x' : `${h.id}:${h.x},${h.y},${h.cap}`))
    .join('|');
  const cats = state.cats.map(c => c.id).sort((a, b) => a - b).join(',');
  return holes + '#' + cats;
}

/** Every legal single-cell move from here, as [holeId, dx, dy]. */
export function legalMoves(state) {
  const out = [];
  for (const hole of state.holes) {
    if (hole.dead) continue;
    for (const [dx, dy] of Object.values(DIRS)) {
      const probe = cloneState(state);
      if (stepHole(probe, hole.id, dx, dy)) out.push([hole.id, dx, dy]);
    }
  }
  return out;
}
