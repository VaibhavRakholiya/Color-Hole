// Canvas drawing: board, cats, holes, and the little bits of juice.
// All art is drawn procedurally — no image assets.

export const PALETTE = {
  yellow: { rim: '#F2B22E', lit: '#FFD15A', body: '#F7BE33', belly: '#FFF1CE', dark: '#3A2A08' },
  red:    { rim: '#E23B36', lit: '#FF6B63', body: '#E84B44', belly: '#FFE0DB', dark: '#3C0F0C' },
  green:  { rim: '#4FB63A', lit: '#7BD663', body: '#5CC244', belly: '#E6FBDD', dark: '#13300C' },
  blue:   { rim: '#3B92E4', lit: '#6DB6F8', body: '#4C9FEA', belly: '#E0F1FF', dark: '#0C2340' },
  orange: { rim: '#EA7A1E', lit: '#FF9C42', body: '#EE8528', belly: '#FFE9D2', dark: '#3C1F05' },
  purple: { rim: '#8D5BDC', lit: '#AE87ED', body: '#9A6BE2', belly: '#F0E6FF', dark: '#24113F' },
  pink:   { rim: '#EA62AE', lit: '#FF91C8', body: '#ED74B8', belly: '#FFE4F3', dark: '#3E0E2B' },
  teal:   { rim: '#2FB8AE', lit: '#5FDBD1', body: '#3CC3B9', belly: '#DDFAF7', dark: '#06322E' },
};

// Each colour also gets a glyph, so the board is readable without relying on hue.
const GLYPH = {
  yellow: 'circle', red: 'heart', green: 'leaf', blue: 'drop',
  orange: 'star', purple: 'diamond', pink: 'flower', teal: 'square',
};

const hasCell = (cells, x, y) => cells.some(c => c[0] === x && c[1] === y);

export function computeLayout(canvas, state) {
  const pad = 16;
  const avail = { w: canvas.clientWidth, h: canvas.clientHeight };
  const cell = Math.floor(Math.min((avail.w - pad * 2) / state.w, (avail.h - pad * 2) / state.h));
  const boardW = cell * state.w;
  const boardH = cell * state.h;
  return {
    cell,
    ox: Math.round((avail.w - boardW) / 2),
    oy: Math.round((avail.h - boardH) / 2),
    boardW, boardH,
  };
}

// ---------------------------------------------------------------- shapes

/**
 * Fill a polyomino as one merged shape. Cells share edges with no inset, so
 * neighbours weld together; only outer corners get rounded.
 */
function fillPoly(ctx, cells, ox, oy, cell, inset, radius) {
  for (const [cx, cy] of cells) {
    const L = !hasCell(cells, cx - 1, cy);
    const R = !hasCell(cells, cx + 1, cy);
    const U = !hasCell(cells, cx, cy - 1);
    const D = !hasCell(cells, cx, cy + 1);

    const x = ox + cx * cell + (L ? inset : 0);
    const y = oy + cy * cell + (U ? inset : 0);
    const w = cell - (L ? inset : 0) - (R ? inset : 0);
    const h = cell - (U ? inset : 0) - (D ? inset : 0);

    ctx.beginPath();
    ctx.roundRect(x, y, w, h, [
      L && U ? radius : 0,
      R && U ? radius : 0,
      R && D ? radius : 0,
      L && D ? radius : 0,
    ]);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- board

export function drawBoard(ctx, state, L) {
  const { cell, ox, oy, boardW, boardH } = L;
  const lip = Math.round(cell * 0.3);

  // outer frame
  ctx.fillStyle = '#864a26';
  ctx.beginPath();
  ctx.roundRect(ox - lip, oy - lip, boardW + lip * 2, boardH + lip * 2, lip);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(ox - lip + 2, oy - lip + 2, boardW + lip * 2 - 4, boardH + lip * 2 - 4, lip - 2);
  ctx.stroke();

  // recessed well
  ctx.fillStyle = '#5d3318';
  ctx.beginPath();
  ctx.roundRect(ox - 5, oy - 5, boardW + 10, boardH + 10, 12);
  ctx.fill();

  // cells
  const gap = Math.max(2, Math.round(cell * 0.045));
  for (let y = 0; y < state.h; y++) {
    for (let x = 0; x < state.w; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#7b4725' : '#73411f';
      ctx.beginPath();
      ctx.roundRect(ox + x * cell + gap, oy + y * cell + gap, cell - gap * 2, cell - gap * 2, cell * 0.16);
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- holes

export function drawHole(ctx, hole, L, opts = {}) {
  const { cell, ox, oy } = L;
  const pal = PALETTE[hole.color];
  const scale = opts.scale ?? 1;
  const px = ox + (opts.x ?? hole.x) * cell;
  const py = oy + (opts.y ?? hole.y) * cell;

  const [w, h] = extent(hole.cells);
  const cxp = px + (w * cell) / 2;
  const cyp = py + (h * cell) / 2;

  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  if (scale !== 1) {
    ctx.translate(cxp, cyp);
    ctx.scale(scale, scale);
    ctx.translate(-cxp, -cyp);
  }

  const rim = Math.max(5, Math.round(cell * 0.14));
  const radius = cell * 0.22;

  // drop shadow
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  fillPoly(ctx, hole.cells, px, py + rim * 0.5, cell, 2, radius);

  // coloured rim
  ctx.fillStyle = pal.rim;
  fillPoly(ctx, hole.cells, px, py, cell, 2, radius);

  // highlight along the top of the rim
  ctx.fillStyle = pal.lit;
  fillPoly(ctx, hole.cells, px, py, cell, 2, radius);
  ctx.fillStyle = pal.rim;
  fillPoly(ctx, hole.cells, px, py + 3, cell, 2, radius);

  // the hole itself
  ctx.fillStyle = pal.dark;
  fillPoly(ctx, hole.cells, px, py, cell, rim, radius * 0.7);

  // inner shading so it reads as depth, not a flat patch
  const g = ctx.createLinearGradient(px, py, px, py + h * cell);
  g.addColorStop(0, 'rgba(0,0,0,.55)');
  g.addColorStop(1, 'rgba(255,255,255,.07)');
  ctx.fillStyle = g;
  fillPoly(ctx, hole.cells, px, py, cell, rim, radius * 0.7);

  if (opts.selected) {
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 3;
    ctx.save();
    ctx.setLineDash([7, 6]);
    ctx.lineDashOffset = -(opts.time ?? 0) * 0.02;
    for (const [cx, cy] of hole.cells) {
      const L2 = !hasCell(hole.cells, cx - 1, cy), R2 = !hasCell(hole.cells, cx + 1, cy);
      const U2 = !hasCell(hole.cells, cx, cy - 1), D2 = !hasCell(hole.cells, cx, cy + 1);
      const x0 = px + cx * cell, y0 = py + cy * cell;
      ctx.beginPath();
      if (U2) { ctx.moveTo(x0, y0); ctx.lineTo(x0 + cell, y0); }
      if (D2) { ctx.moveTo(x0, y0 + cell); ctx.lineTo(x0 + cell, y0 + cell); }
      if (L2) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + cell); }
      if (R2) { ctx.moveTo(x0 + cell, y0); ctx.lineTo(x0 + cell, y0 + cell); }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBadge(ctx, hole, px, py, cell, pal, opts.badgePop ?? 0);
  ctx.restore();
}

function extent(cells) {
  return [
    Math.max(...cells.map(c => c[0])) + 1,
    Math.max(...cells.map(c => c[1])) + 1,
  ];
}

function drawBadge(ctx, hole, px, py, cell, pal, pop) {
  // sit the counter on the bottom-right-most cell, like the original
  let best = hole.cells[0];
  for (const c of hole.cells) {
    if (c[1] > best[1] || (c[1] === best[1] && c[0] > best[0])) best = c;
  }
  const r = cell * 0.2 * (1 + pop * 0.5);
  const bx = px + best[0] * cell + cell - r * 0.85;
  const by = py + best[1] * cell + cell - r * 0.85;

  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = Math.max(2, cell * 0.035);
  ctx.strokeStyle = pal.rim;
  ctx.stroke();

  ctx.fillStyle = pal.dark;
  ctx.font = `800 ${Math.round(r * 1.5)}px Nunito, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(hole.cap), bx, by + r * 0.06);
}

// ---------------------------------------------------------------- cats

export function drawCat(ctx, px, py, cell, color, opts = {}) {
  const pal = PALETTE[color];
  const cx = px + cell / 2;
  const cy = py + cell / 2;

  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.translate(cx, cy);
  if (opts.scale !== undefined && opts.scale !== 1) ctx.scale(opts.scale, opts.scale);
  const u = cell / 100; // design the cat on a 100-unit grid

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath();
  ctx.ellipse(0, 36 * u, 30 * u, 7 * u, 0, 0, Math.PI * 2);
  ctx.fill();

  // tail
  ctx.strokeStyle = pal.body;
  ctx.lineWidth = 9 * u;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(26 * u, 26 * u);
  ctx.quadraticCurveTo(44 * u, 20 * u, 38 * u, 2 * u);
  ctx.stroke();

  // body
  ctx.fillStyle = pal.body;
  ctx.beginPath();
  ctx.moveTo(-26 * u, 34 * u);
  ctx.quadraticCurveTo(-30 * u, 2 * u, 0, 2 * u);
  ctx.quadraticCurveTo(30 * u, 2 * u, 26 * u, 34 * u);
  ctx.quadraticCurveTo(0, 40 * u, -26 * u, 34 * u);
  ctx.fill();

  // belly
  ctx.fillStyle = pal.belly;
  ctx.beginPath();
  ctx.ellipse(0, 22 * u, 14 * u, 13 * u, 0, 0, Math.PI * 2);
  ctx.fill();

  // paws
  ctx.fillStyle = pal.belly;
  for (const dx of [-14, 14]) {
    ctx.beginPath();
    ctx.ellipse(dx * u, 33 * u, 8 * u, 5.5 * u, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ears
  ctx.fillStyle = pal.body;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * 13 * u, -30 * u);
    ctx.lineTo(dir * 30 * u, -40 * u);
    ctx.lineTo(dir * 27 * u, -18 * u);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = pal.belly;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * 17 * u, -28 * u);
    ctx.lineTo(dir * 26 * u, -34 * u);
    ctx.lineTo(dir * 24 * u, -22 * u);
    ctx.closePath();
    ctx.fill();
  }

  // head
  ctx.fillStyle = pal.body;
  ctx.beginPath();
  ctx.ellipse(0, -12 * u, 30 * u, 26 * u, 0, 0, Math.PI * 2);
  ctx.fill();

  // stripes
  ctx.strokeStyle = 'rgba(0,0,0,.12)';
  ctx.lineWidth = 3 * u;
  for (const dx of [-9, 0, 9]) {
    ctx.beginPath();
    ctx.moveTo(dx * u, -36 * u);
    ctx.lineTo(dx * u, -29 * u);
    ctx.stroke();
  }

  // eyes
  const blink = opts.blink ?? 1;
  ctx.fillStyle = '#3a2412';
  for (const dx of [-11, 11]) {
    ctx.beginPath();
    ctx.ellipse(dx * u, -14 * u, 5.5 * u, 7 * u * blink, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (blink > 0.5) {
    ctx.fillStyle = '#fff';
    for (const dx of [-9, 13]) {
      ctx.beginPath();
      ctx.arc(dx * u, -17 * u, 2 * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // muzzle
  ctx.fillStyle = pal.belly;
  ctx.beginPath();
  ctx.ellipse(-6 * u, -1 * u, 8 * u, 6 * u, 0, 0, Math.PI * 2);
  ctx.ellipse(6 * u, -1 * u, 8 * u, 6 * u, 0, 0, Math.PI * 2);
  ctx.fill();

  // nose
  ctx.fillStyle = '#e8737f';
  ctx.beginPath();
  ctx.moveTo(0, -6 * u);
  ctx.lineTo(4 * u, -2 * u);
  ctx.lineTo(-4 * u, -2 * u);
  ctx.closePath();
  ctx.fill();

  // colour glyph on the belly — keeps the board readable without hue
  drawGlyph(ctx, GLYPH[color], 0, 22 * u, 7 * u, pal.rim);

  ctx.restore();
}

function drawGlyph(ctx, kind, x, y, r, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  switch (kind) {
    case 'circle':
      ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2);
      break;
    case 'square':
      ctx.roundRect(-r * 0.65, -r * 0.65, r * 1.3, r * 1.3, r * 0.25);
      break;
    case 'diamond':
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.8, 0); ctx.closePath();
      break;
    case 'heart':
      ctx.moveTo(0, r * 0.8);
      ctx.bezierCurveTo(-r * 1.4, -r * 0.2, -r * 0.5, -r * 1.1, 0, -r * 0.35);
      ctx.bezierCurveTo(r * 0.5, -r * 1.1, r * 1.4, -r * 0.2, 0, r * 0.8);
      break;
    case 'drop':
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.9, -r * 0.1, r * 0.7, r * 0.9, 0, r * 0.9);
      ctx.bezierCurveTo(-r * 0.7, r * 0.9, -r * 0.9, -r * 0.1, 0, -r);
      break;
    case 'leaf':
      ctx.moveTo(-r * 0.8, r * 0.7);
      ctx.quadraticCurveTo(-r * 0.2, -r, r * 0.8, -r * 0.7);
      ctx.quadraticCurveTo(r * 0.2, r, -r * 0.8, r * 0.7);
      break;
    case 'star':
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        const b = a + Math.PI / 5;
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
        ctx.lineTo(Math.cos(b) * r * 0.45, Math.sin(b) * r * 0.45);
      }
      ctx.closePath();
      break;
    case 'flower':
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        ctx.moveTo(0, 0);
        ctx.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.45, 0, Math.PI * 2);
      }
      break;
  }
  ctx.fill();
  ctx.restore();
}
