import { createState, cloneState, stepHole, isWon, holeCells } from './engine.js';
import { PALETTE, computeLayout, drawBoard, drawHole, drawCat } from './render.js';
import { sfx } from './audio.js';

const SAVE_KEY = 'colorhole.save.v1';

const el = id => document.getElementById(id);
const canvas = el('board');
const ctx = canvas.getContext('2d');

let LEVELS = [];
let level = null;      // raw level data
let state = null;      // live engine state
let layout = null;
let undoStack = [];

let timeLeft = 0;
let running = false;
let finished = false;
let lastTick = 0;

// render-side animation
const anim = {
  holes: new Map(),    // id -> { rx, ry, pop }
  flying: [],          // cats being swallowed
  bursts: [],          // particle puffs
};

let drag = null;
let time = 0;

// CSS handles the overlays; the canvas has to opt out by itself.
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const calm = () => !!reduceMotion?.matches;

const save = {
  unlocked: 1,
  coins: 0,
  cleared: [],
  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
      this.unlocked = raw.unlocked || 1;
      this.coins = raw.coins || 0;
      this.cleared = raw.cleared || [];
    } catch { /* first run, or storage blocked */ }
  },
  write() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        unlocked: this.unlocked, coins: this.coins, cleared: this.cleared,
      }));
    } catch { /* private mode — progress just won't persist */ }
  },
};

// ---------------------------------------------------------------- setup

async function boot() {
  save.load();
  try {
    const res = await fetch('levels/levels.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    LEVELS = await res.json();
    if (!Array.isArray(LEVELS) || !LEVELS.length) throw new Error('no levels in file');
  } catch (err) {
    // Opening index.html as a file:// URL is the usual cause.
    el('hint').textContent = `Could not load levels (${err.message}). Serve this folder over HTTP.`;
    return;
  }

  el('undoBtn').addEventListener('click', undo);
  el('menuBtn').addEventListener('click', openMenu);
  el('closeMenuBtn').addEventListener('click', () => el('menuOverlay').hidden = true);
  el('continueBtn').addEventListener('click', () => {
    el('winOverlay').hidden = true;
    const next = level.n + 1;
    if (next > LEVELS.length) openMenu(); else load(next);
  });
  el('retryBtn').addEventListener('click', () => {
    el('failOverlay').hidden = true;
    load(level.n);
  });
  el('failMenuBtn').addEventListener('click', () => {
    el('failOverlay').hidden = true;
    openMenu();
  });

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  window.addEventListener('resize', resize);
  // Pause while the tab is in the background, and pick back up on return —
  // but never resume into a finished level or behind an open overlay.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { running = false; return; }
    lastTick = performance.now();
    running = !finished && !anyOverlayOpen();
  });

  // Test hook: lets the browser harness drive the game directly.
  window.__game = {
    get state() { return state; },
    get level() { return level; },
    get layout() { return layout; },
    get timeLeft() { return timeLeft; },
    load,
  };

  drawMascot();
  load(Math.min(save.unlocked, LEVELS.length));
  requestAnimationFrame(frame);
}

function load(n) {
  level = LEVELS.find(l => l.n === n) || LEVELS[0];
  state = createState(level);
  undoStack = [];
  timeLeft = level.time ?? 300;
  finished = false;
  running = true;
  lastTick = performance.now();

  anim.holes.clear();
  anim.flying.length = 0;
  anim.bursts.length = 0;
  for (const h of state.holes) anim.holes.set(h.id, { rx: h.x, ry: h.y, pop: 0 });

  el('levelLabel').textContent = `Level ${level.n}`;
  el('hint').textContent = n === 1
    ? 'Drag the yellow hole onto the cats.'
    : 'Drag a hole onto cats of its own colour.';
  updateCoins();
  updateUndo();
  resize();
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  layout = computeLayout(canvas, state);
}

// ---------------------------------------------------------------- input

function pointerCell(ev) {
  const rect = canvas.getBoundingClientRect();
  return {
    px: ev.clientX - rect.left,
    py: ev.clientY - rect.top,
  };
}

function holeUnder(px, py) {
  const { cell, ox, oy } = layout;
  const gx = Math.floor((px - ox) / cell);
  const gy = Math.floor((py - oy) / cell);
  for (const h of state.holes) {
    if (h.dead) continue;
    if (holeCells(h).some(([x, y]) => x === gx && y === gy)) return h;
  }
  return null;
}

function onDown(ev) {
  if (!running || finished) return;
  const { px, py } = pointerCell(ev);
  const hole = holeUnder(px, py);
  if (!hole) return;

  // Capture keeps the drag alive if the pointer leaves the canvas. It throws for
  // synthetic or already-released pointers, which must not abort the drag.
  try { canvas.setPointerCapture(ev.pointerId); } catch { /* not capturable */ }
  drag = {
    id: hole.id,
    startPx: px, startPy: py,
    originX: hole.x, originY: hole.y,
    moved: false,
    snapshot: cloneState(state),
  };
}

function onMove(ev) {
  if (!drag) return;
  const { px, py } = pointerCell(ev);
  const { cell } = layout;

  const wantX = drag.originX + Math.round((px - drag.startPx) / cell);
  const wantY = drag.originY + Math.round((py - drag.startPy) / cell);

  // Walk toward the pointer one cell at a time, greedily taking the axis with
  // the most ground left to cover. Stop when both axes are blocked.
  for (let guard = 0; guard < 40; guard++) {
    const hole = state.holes.find(h => h.id === drag.id);
    if (!hole || hole.dead) break;

    const dx = Math.sign(wantX - hole.x);
    const dy = Math.sign(wantY - hole.y);
    if (!dx && !dy) break;

    const order = Math.abs(wantX - hole.x) >= Math.abs(wantY - hole.y)
      ? [[dx, 0], [0, dy]]
      : [[0, dy], [dx, 0]];

    let stepped = false;
    for (const [sx, sy] of order) {
      if (!sx && !sy) continue;
      const res = stepHole(state, drag.id, sx, sy);
      if (!res) continue;

      onStepped(hole, res);
      stepped = true;
      break;
    }
    if (!stepped) {
      if (!drag.bumped) { sfx.blocked(); drag.bumped = true; }
      break;
    }
    drag.bumped = false;
  }
}

function onStepped(hole, res) {
  drag.moved = true;
  const a = anim.holes.get(hole.id);

  res.absorbed.forEach((cat, i) => {
    anim.flying.push({
      color: cat.color,
      x: cat.x, y: cat.y,
      tx: hole.x + hole.cells[0][0], ty: hole.y + hole.cells[0][1],
      t: 0,
    });
    sfx.absorb(i);
  });
  if (res.absorbed.length && a) a.pop = 1;

  if (res.cleared) {
    sfx.clear();
    burst(hole.x + 0.5, hole.y + 0.5, PALETTE[hole.color].lit, 22);
  }
  if (isWon(state)) win();
}

function onUp(ev) {
  if (!drag) return;
  if (drag.moved) {
    undoStack.push(drag.snapshot);
    if (undoStack.length > 60) undoStack.shift();
    updateUndo();
  }
  drag = null;
}

function undo() {
  if (!undoStack.length || finished) return;
  state = undoStack.pop();
  for (const h of state.holes) {
    if (!anim.holes.has(h.id)) anim.holes.set(h.id, { rx: h.x, ry: h.y, pop: 0 });
  }
  anim.flying.length = 0;
  updateUndo();
}

function updateUndo() {
  el('undoBtn').disabled = undoStack.length === 0;
}

// ---------------------------------------------------------------- outcomes

function win() {
  if (finished) return;
  finished = true;
  running = false;

  const reward = 40;
  save.coins += reward;
  if (!save.cleared.includes(level.n)) save.cleared.push(level.n);
  save.unlocked = Math.max(save.unlocked, Math.min(level.n + 1, LEVELS.length));
  save.write();

  sfx.win();
  el('rewardText').textContent = String(reward);
  setTimeout(() => {
    el('winOverlay').hidden = false;
    updateCoins();
  }, 620);
}

function fail() {
  if (finished) return;
  finished = true;
  running = false;
  sfx.fail();
  el('failOverlay').hidden = false;
}

function anyOverlayOpen() {
  return ['winOverlay', 'failOverlay', 'menuOverlay'].some(id => !el(id).hidden);
}

function updateCoins() {
  el('coinText').textContent = String(save.coins);
}

function openMenu() {
  const grid = el('levelGrid');
  grid.textContent = '';
  for (const lv of LEVELS) {
    const b = document.createElement('button');
    b.className = 'lvl';
    b.textContent = String(lv.n);
    if (save.cleared.includes(lv.n)) b.classList.add('done');
    if (lv.n > save.unlocked) {
      b.classList.add('locked');
      b.disabled = true;
      b.setAttribute('aria-label', `Level ${lv.n}, locked`);
    } else {
      b.addEventListener('click', () => {
        el('menuOverlay').hidden = true;
        load(lv.n);
      });
    }
    grid.appendChild(b);
  }
  el('menuOverlay').hidden = false;
}

// ---------------------------------------------------------------- animation

function burst(gx, gy, color, n) {
  if (calm()) return;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random();
    const sp = 0.03 + Math.random() * 0.07;
    anim.bursts.push({
      x: gx, y: gy,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.02,
      life: 1, color,
    });
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastTick) / 1000);
  lastTick = now;
  time = now;

  if (running && !finished) {
    const before = Math.ceil(timeLeft);
    timeLeft -= dt;
    const after = Math.ceil(timeLeft);
    if (after !== before && after <= 5 && after > 0) sfx.tick();
    if (timeLeft <= 0) { timeLeft = 0; fail(); }
    updateTimer();
  }

  // ease holes toward their grid cell
  const ease = calm() ? 1 : Math.min(1, dt * 22);
  for (const h of state.holes) {
    const a = anim.holes.get(h.id);
    if (!a) continue;
    a.rx += (h.x - a.rx) * ease;
    a.ry += (h.y - a.ry) * ease;
    a.pop = Math.max(0, a.pop - dt * 4);
  }

  for (let i = anim.flying.length - 1; i >= 0; i--) {
    const f = anim.flying[i];
    f.t += dt * 3.4;
    if (f.t >= 1) anim.flying.splice(i, 1);
  }

  for (let i = anim.bursts.length - 1; i >= 0; i--) {
    const p = anim.bursts[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.004;
    p.life -= dt * 1.6;
    if (p.life <= 0) anim.bursts.splice(i, 1);
  }

  draw();
  requestAnimationFrame(frame);
}

function updateTimer() {
  const t = Math.max(0, Math.ceil(timeLeft));
  const m = String(Math.floor(t / 60)).padStart(2, '0');
  const s = String(t % 60).padStart(2, '0');
  el('timeText').textContent = `${m}:${s}`;
  el('timer').classList.toggle('low', t <= 20);
}

function draw() {
  if (!layout) return;
  const { cell, ox, oy } = layout;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawBoard(ctx, state, layout);

  // cats still on the board
  const blink = (Math.sin(time * 0.0012) > 0.995) ? 0.15 : 1;
  for (const cat of state.cats) {
    drawCat(ctx, ox + cat.x * cell, oy + cat.y * cell, cell, cat.color, { blink });
  }

  // cats mid-swallow
  for (const f of anim.flying) {
    const e = f.t * f.t;
    const x = f.x + (f.tx - f.x) * e;
    const y = f.y + (f.ty - f.y) * e;
    drawCat(ctx, ox + x * cell, oy + y * cell, cell, f.color, {
      scale: 1 - f.t * 0.9,
      alpha: 1 - f.t * 0.8,
    });
  }

  // holes last, so cats appear to drop in behind the rim
  for (const h of state.holes) {
    if (h.dead) continue;
    const a = anim.holes.get(h.id) || { rx: h.x, ry: h.y, pop: 0 };
    drawHole(ctx, h, layout, {
      x: a.rx, y: a.ry,
      selected: drag?.id === h.id,
      badgePop: a.pop,
      time,
    });
  }

  for (const p of anim.bursts) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    const r = cell * 0.09 * p.life;
    ctx.beginPath();
    ctx.arc(ox + p.x * cell, oy + p.y * cell, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawMascot() {
  const c = el('mascot');
  const g = c.getContext('2d');
  g.clearRect(0, 0, 96, 96);
  g.save();
  g.translate(0, 6);
  drawCat(g, 0, 0, 96, 'orange', {});
  g.restore();
}

boot();
