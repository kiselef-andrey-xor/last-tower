/* =========================================================
   RENDER: вся отрисовка (canvas 2D, без внешних ресурсов)
   ========================================================= */
'use strict';

/* Кэш спрайтов свечения */
const _glow = new Map();
function glowSprite(color) {
  let c = _glow.get(color);
  if (c) return c;
  const S = 64;
  c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, hexA(color, 1));
  gr.addColorStop(0.35, hexA(color, 0.45));
  gr.addColorStop(1, hexA(color, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  _glow.set(color, c);
  return c;
}
function hexA(hex, a) {
  if (hex.startsWith('rgba') || hex.startsWith('rgb(')) return hex;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function glow(x, y, r, color, alpha = 0.8) {
  const s = glowSprite(color);
  ctx.globalAlpha = alpha;
  ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

/* Звёздный фон (кэш) */
let _stars = null, _starsKey = '';
function starLayer() {
  const key = W + 'x' + H;
  if (_stars && _starsKey === key) return _stars;
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.floor(W * 0.5)); c.height = Math.max(2, Math.floor(H * 0.5));
  const g = c.getContext('2d');
  g.fillStyle = '#070b14';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * c.width, y = Math.random() * c.height;
    const r = Math.random() * 1.3 + 0.25;
    const a = Math.random() * 0.5 + 0.15;
    g.fillStyle = `rgba(${180 + Math.random() * 60 | 0},${200 + Math.random() * 50 | 0},255,${a})`;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  // туманности
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * c.width, y = Math.random() * c.height;
    const r = 90 + Math.random() * 180;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const col = ['#2a3f7a', '#4a2a6a', '#1e5a63', '#6a2a3f'][(Math.random() * 4) | 0];
    gr.addColorStop(0, hexA(col, 0.16));
    gr.addColorStop(1, hexA(col, 0));
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  _stars = c; _starsKey = key;
  return c;
}

let menuT = 0;
function renderMenuBg(dt) {
  menuT += (dt || frameDt || 0.016);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const s = starLayer();
  ctx.drawImage(s, 0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H * 0.52);
  const sc = Math.min(W, H) / 900;
  ctx.scale(sc, sc);
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = hexA('#3d6ea5', 0.25 - i * 0.05);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 200 + i * 90, menuT * (0.1 + i * 0.05), menuT * (0.1 + i * 0.05) + 4.2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // декоративная башня
  const fake = { x: 0, y: 0, r: 30, angle: menuT * 0.5, recoil: 0, hitFlash: 0, pulse: (Math.sin(menuT * 2) + 1) / 2, hp: 100, maxHp: 100, shield: 0 };
  drawTowerShape(fake, { projectiles: 2, orbitals: 0, range: 0, slowAura: 0, burnAura: 0, auraRadius: 0 }, menuT);
  ctx.restore();
}

/* ============ ОСНОВНАЯ ОТРИСОВКА ============ */
function render() {
  if (!G) { renderMenuBg(frameDt); return; }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.drawImage(starLayer(), 0, 0, W, H);

  const v = G.view;
  const sh = G.shake;
  const ox = sh ? rand(-sh, sh) * 0.5 : 0;
  const oy = sh ? rand(-sh, sh) * 0.5 : 0;

  ctx.save();
  ctx.translate(v.cx + ox, v.cy + oy);
  ctx.scale(v.scale, v.scale);

  drawArena();
  drawRanges();
  drawStructs();
  drawPickups();
  drawEnemies();
  drawBullets();
  drawTower();
  drawOrbitals();
  drawParticles();
  drawArcs();
  drawTexts();
  drawGhost();
  drawStrikeAim();

  ctx.restore();

  drawOverlay();
  if (typeof UI !== 'undefined' && UI.bossTick) UI.bossTick();
}

function drawArena() {
  const t = G.time;
  // зона спавна (тёмное кольцо)
  ctx.fillStyle = 'rgba(10,14,24,0.72)';
  ctx.beginPath(); ctx.arc(0, 0, SPAWN_R + 70, 0, TAU); ctx.fill();

  // пол арены
  const gr = ctx.createRadialGradient(0, 0, 40, 0, 0, ARENA_R);
  gr.addColorStop(0, '#1b2740');
  gr.addColorStop(0.65, '#141d31');
  gr.addColorStop(1, '#0e1526');
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(0, 0, ARENA_R, 0, TAU); ctx.fill();

  // сетка
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, ARENA_R, 0, TAU); ctx.clip();
  ctx.strokeStyle = 'rgba(120,170,220,0.07)';
  ctx.lineWidth = 1;
  for (let r = 80; r < ARENA_R; r += 80) { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * ARENA_R, Math.sin(a) * ARENA_R); ctx.stroke();
  }
  // плитки-акценты
  ctx.fillStyle = 'rgba(120,180,240,0.03)';
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + 0.12, r = 150 + (i % 4) * 80;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 26, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // граница арены
  ctx.strokeStyle = hexA('#4f8fd6', 0.55 + Math.sin(t * 1.6) * 0.12);
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, ARENA_R, 0, TAU); ctx.stroke();
  ctx.strokeStyle = hexA('#8ff0ff', 0.12);
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(0, 0, ARENA_R + 6, 0, TAU); ctx.stroke();

  // ворота спавна
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + t * 0.03;
    const x = Math.cos(a) * SPAWN_R, y = Math.sin(a) * SPAWN_R;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a);
    ctx.strokeStyle = hexA('#ff6b7a', 0.28 + Math.sin(t * 2 + i) * 0.1);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 26, -0.9, 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 34, -0.6, 0.6); ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(255,107,122,0.13)';
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 12]);
  ctx.beginPath(); ctx.arc(0, 0, SPAWN_R, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
}

function drawRanges() {
  const S = G.S;
  // радиус стрельбы
  ctx.save();
  ctx.strokeStyle = hexA('#8ff0ff', 0.16);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([9, 9]);
  ctx.beginPath(); ctx.arc(0, 0, S.range, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  if (S.slowAura > 0 || S.burnAura > 0) {
    ctx.fillStyle = S.burnAura > 0 ? 'rgba(255,120,60,0.05)' : 'rgba(120,200,255,0.05)';
    ctx.beginPath(); ctx.arc(0, 0, S.auraRadius, 0, TAU); ctx.fill();
    ctx.strokeStyle = S.burnAura > 0 ? 'rgba(255,140,80,0.2)' : 'rgba(140,210,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, S.auraRadius, 0, TAU); ctx.stroke();
  }
}

function drawOrbitals() {
  const S = G.S;
  {
    ctx.strokeStyle = 'rgba(191,244,255,0.12)';
    ctx.lineWidth = 1;
    if (S.orbitals > 0) { ctx.beginPath(); ctx.arc(0, 0, S.orbitalRadius, 0, TAU); ctx.stroke(); }
    for (let i = 0; i < S.orbitals; i++) {
      const a = G.orbitCd + (i / S.orbitals) * TAU;
      const x = Math.cos(a) * S.orbitalRadius, y = Math.sin(a) * S.orbitalRadius;
      ctx.save();
      ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
      ctx.globalCompositeOperation = 'lighter';
      glow(0, 0, 16, '#8ff0ff', 0.5);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#dff6ff';
      ctx.beginPath();
      ctx.moveTo(0, -13); ctx.lineTo(4.5, 4); ctx.lineTo(0, 11); ctx.lineTo(-4.5, 4);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
}

/* ---------- БАШНЯ ---------- */
function drawTowerShape(T, S, t) {
  const hpFrac = T.maxHp ? T.hp / T.maxHp : 1;
  // платформа
  ctx.save();
  ctx.rotate(Math.PI / 8);
  ctx.fillStyle = '#2c3d5e';
  ctx.strokeStyle = '#7d9cc8';
  ctx.lineWidth = 3.2;
  poly(0, 0, T.r + 13, 8);
  ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#1d2a44';
  ctx.beginPath(); ctx.arc(0, 0, T.r + 4, 0, TAU); ctx.fill();
  // болты
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    ctx.fillStyle = '#4a6288';
    ctx.beginPath(); ctx.arc(Math.cos(a) * (T.r + 9), Math.sin(a) * (T.r + 9), 2.2, 0, TAU); ctx.fill();
  }

  // кольцо прочности
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.beginPath(); ctx.arc(0, 0, T.r + 17, 0, TAU); ctx.stroke();
  const col = hpFrac > 0.55 ? '#5ee08a' : hpFrac > 0.25 ? '#ffcc55' : '#ff5566';
  ctx.strokeStyle = col;
  ctx.beginPath(); ctx.arc(0, 0, T.r + 17, -Math.PI / 2, -Math.PI / 2 + TAU * hpFrac); ctx.stroke();
  if (T.shield > 0) {
    ctx.strokeStyle = hexA('#59c8ff', 0.75);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, T.r + 23, 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    glow(0, 0, T.r + 30, '#59c8ff', 0.25);
    ctx.globalCompositeOperation = 'source-over';
  }

  // турель
  ctx.save();
  ctx.rotate(T.angle);
  const rec = T.recoil ? -T.recoil * 5 : 0;
  const barrels = Math.max(1, Math.min(5, Math.round(S.projectiles || 1)));
  ctx.fillStyle = '#46628f';
  ctx.strokeStyle = '#9cc0ea';
  ctx.lineWidth = 2;
  for (let i = 0; i < barrels; i++) {
    const off = (i - (barrels - 1) / 2) * 8.5;
    ctx.save();
    ctx.translate(rec, off);
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(T.r - 12, -3.6, 30, 7.2, 3) : ctx.rect(T.r - 12, -3.6, 30, 7.2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c8ecff';
    ctx.fillRect(T.r + 14, -2.2, 4, 4.4);
    ctx.fillStyle = '#46628f';
    ctx.restore();
  }
  // корпус турели
  ctx.fillStyle = '#33496f';
  ctx.strokeStyle = '#8fb4e0';
  poly(0, 0, T.r, 6);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#243350';
  ctx.beginPath(); ctx.arc(0, 0, T.r * 0.6, 0, TAU); ctx.fill();
  ctx.restore();
  // вращающееся энергокольцо платформы
  ctx.strokeStyle = hexA('#8ff0ff', 0.3);
  ctx.lineWidth = 1.6;
  ctx.setLineDash([6, 10]);
  ctx.beginPath(); ctx.arc(0, 0, T.r + 8, t * 0.8, t * 0.8 + TAU); ctx.stroke();
  ctx.setLineDash([]);

  // ядро
  const pulse = 0.75 + Math.sin(t * 3) * 0.12 + (T.pulse || 0) * 0.4;
  ctx.globalCompositeOperation = 'lighter';
  glow(0, 0, T.r * 1.5 * pulse, T.hitFlash > 0 ? '#ff5566' : '#8ff0ff', 0.55);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = T.hitFlash > 0 ? '#ffd0d6' : '#dff6ff';
  ctx.beginPath(); ctx.arc(0, 0, T.r * 0.32 * (1 + (T.pulse || 0) * 0.25), 0, TAU); ctx.fill();
  if (T.hitFlash > 0) {
    ctx.fillStyle = hexA('#ff5566', T.hitFlash * 2);
    ctx.beginPath(); ctx.arc(0, 0, T.r + 6, 0, TAU); ctx.fill();
  }
}

function drawTower() {
  const T = G.tower;
  ctx.save();
  ctx.translate(T.x, T.y);
  drawTowerShape(T, G.S, G.time);
  ctx.restore();
  if (T.pulse > 0) T.pulse = Math.max(0, T.pulse - 0.06);
}

/* ---------- ПОСТРОЙКИ ---------- */
function drawStructs() {
  for (const s of G.structs) {
    ctx.save();
    ctx.translate(s.x, s.y);
    const def = s.def;
    const dmgFrac = s.hp / s.maxHp;
    if (s.key === 'turret') {
      ctx.fillStyle = '#2a3a58'; ctx.strokeStyle = '#5c7ba8'; ctx.lineWidth = 2;
      poly(0, 0, s.r, 4); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.rotate(s.ang || 0);
      ctx.fillStyle = '#3d5578';
      ctx.fillRect(0, -3, s.r + 8, 6);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(s.r + 5, -2, 3, 4);
      ctx.restore();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; glow(0, 0, 22, '#ffd23f', 0.18); ctx.globalCompositeOperation = 'source-over';
    } else if (s.key === 'mine') {
      const blink = 0.5 + Math.sin(G.time * 6 + s.born) * 0.5;
      ctx.fillStyle = '#3a2a2a'; ctx.strokeStyle = '#8a5a4a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, s.r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = hexA('#ff5566', 0.4 + blink * 0.6);
      ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = hexA('#ff5566', 0.12);
      ctx.setLineDash([5, 7]);
      ctx.beginPath(); ctx.arc(0, 0, def.trigR, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    } else if (s.key === 'cryo') {
      ctx.fillStyle = 'rgba(120,200,255,0.07)';
      ctx.beginPath(); ctx.arc(0, 0, def.range, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(140,215,255,0.3)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, def.range, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#22405e'; ctx.strokeStyle = '#7fd8ff'; ctx.lineWidth = 2;
      poly(0, 0, s.r, 6); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.rotate(G.time * 0.8);
      ctx.strokeStyle = '#bff4ff'; ctx.lineWidth = 2.2;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(-Math.cos(a) * 9, -Math.sin(a) * 9);
        ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter'; glow(0, 0, 26, '#7fd8ff', 0.25); ctx.globalCompositeOperation = 'source-over';
    } else if (s.key === 'wall') {
      ctx.fillStyle = '#3a3f4d'; ctx.strokeStyle = '#6b7385'; ctx.lineWidth = 2.5;
      poly(0, 0, s.r, 6); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1.5;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(-s.r * 0.7, i * 7); ctx.lineTo(s.r * 0.7, i * 7); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(0, -s.r * 0.8); ctx.lineTo(0, s.r * 0.8); ctx.stroke();
    } else if (s.key === 'farm') {
      ctx.fillStyle = '#3d3524'; ctx.strokeStyle = '#c9a44a'; ctx.lineWidth = 2;
      poly(0, 0, s.r, 4); ctx.fill(); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      glow(0, 0, 24, '#ffd23f', 0.22 + Math.sin(G.time * 3 + s.born) * 0.08);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ffd23f';
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + G.time * 0.6;
        ctx.beginPath(); ctx.arc(Math.cos(a) * 7, Math.sin(a) * 7, 3, 0, TAU); ctx.fill();
      }
    }
    // полоска прочности
    if (dmgFrac < 0.999) {
      const w = s.r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-w / 2, -s.r - 11, w, 4);
      ctx.fillStyle = dmgFrac > 0.5 ? '#5ee08a' : dmgFrac > 0.25 ? '#ffcc55' : '#ff5566';
      ctx.fillRect(-w / 2, -s.r - 11, w * clamp(dmgFrac, 0, 1), 4);
    }
    if (s.flash > 0) {
      ctx.fillStyle = hexA('#ffffff', s.flash * 2.5);
      ctx.beginPath(); ctx.arc(0, 0, s.r + 3, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

/* ---------- ВРАГИ ---------- */
function poly(x, y, r, n, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawEnemies() {
  for (const e of G.enemies) {
    if (e.dead) continue;
    const spawnK = e.spawnT > 0 ? clamp(1 - e.spawnT / (e.boss ? 1 : 0.45), 0.3, 1) : 1;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(spawnK, spawnK);
    drawEnemyShape(e);
    ctx.restore();

    // полоска HP
    if (e.hp < e.maxHp && !e.boss) {
      const w = Math.max(18, e.r * 2.1);
      const y = -e.r - 9;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(e.x - w / 2, y, w, 3.6);
      ctx.fillStyle = e.hp / e.maxHp > 0.5 ? '#7bd948' : e.hp / e.maxHp > 0.22 ? '#ffcc55' : '#ff5566';
      ctx.fillRect(e.x - w / 2, y, w * clamp(e.hp / e.maxHp, 0, 1), 3.6);
      if (e.shieldMax > 0 && e.shieldHp > 0) {
        ctx.fillStyle = 'rgba(255,214,130,0.85)';
        ctx.fillRect(e.x - w / 2, y - 3.4, w * clamp(e.shieldHp / e.shieldMax, 0, 1), 2.6);
      }
    }
    if (G.focus === e) {
      const pu = 0.6 + Math.sin(G.time * 8) * 0.4;
      ctx.strokeStyle = hexA('#ff5566', 0.5 + pu * 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 7, 0, TAU); ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        ctx.moveTo(e.x + Math.cos(a) * (e.r + 3), e.y + Math.sin(a) * (e.r + 3));
        ctx.lineTo(e.x + Math.cos(a) * (e.r + 12), e.y + Math.sin(a) * (e.r + 12));
      }
      ctx.stroke();
    }
    if (e.burnT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(e.x, e.y, e.r * 2, '#ff7a2f', 0.3);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (e.slowT > 0 || e.fieldSlow > 0) {
      ctx.strokeStyle = hexA('#8fd8ff', 0.5);
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3, 0, TAU); ctx.stroke();
    }
  }
}

function drawEnemyShape(e) {
  const d = e.def, t = G.time;
  const c = d.color;
  const body = e.flash > 0 ? '#ffffff' : c;
  ctx.rotate(e.ang + Math.PI / 2);
  ctx.globalCompositeOperation = 'lighter';
  glow(0, 0, e.r * (e.boss ? 2.6 : 1.9), c, e.boss ? 0.4 : 0.22);
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = 2;
  ctx.strokeStyle = hexA('#000000', 0.45);

  switch (d.shape) {
    case 'blob': {
      ctx.fillStyle = body;
      ctx.beginPath();
      for (let i = 0; i <= 14; i++) {
        const a = (i / 14) * TAU;
        const rr = e.r * (1 + Math.sin(a * 3 + t * 6 + e.wob) * 0.09);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      eyes(e.r * 0.42, e.r * 0.3);
      break;
    }
    case 'dart': {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(0, -e.r * 1.5); ctx.lineTo(e.r * 0.9, e.r); ctx.lineTo(0, e.r * 0.45); ctx.lineTo(-e.r * 0.9, e.r);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = hexA('#000', 0.35);
      ctx.beginPath(); ctx.arc(0, -e.r * 0.2, e.r * 0.32, 0, TAU); ctx.fill();
      break;
    }
    case 'hex': {
      ctx.fillStyle = body;
      poly(0, 0, e.r, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = hexA('#ffffff', 0.14);
      poly(0, -e.r * 0.15, e.r * 0.62, 6); ctx.fill();
      ctx.strokeStyle = hexA('#000', 0.3);
      ctx.beginPath(); ctx.moveTo(-e.r * 0.6, e.r * 0.3); ctx.lineTo(e.r * 0.6, e.r * 0.3); ctx.stroke();
      eyes(e.r * 0.4, e.r * 0.1, '#ff5566');
      break;
    }
    case 'spit': {
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = hexA('#2a0f3d', 0.8);
      ctx.beginPath(); ctx.ellipse(0, -e.r * 0.55, e.r * 0.45, e.r * 0.3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffe066';
      ctx.beginPath(); ctx.arc(0, e.r * 0.2, e.r * 0.35, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a0a22';
      ctx.beginPath(); ctx.arc(0, e.r * 0.2, e.r * 0.16, 0, TAU); ctx.fill();
      break;
    }
    case 'bomb': {
      const blink = 0.5 + Math.sin(t * 14 + e.wob) * 0.5;
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#c9a44a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -e.r * 0.9); ctx.quadraticCurveTo(e.r * 0.5, -e.r * 1.5, e.r * 0.2, -e.r * 1.8); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      glow(e.r * 0.2, -e.r * 1.85, 10 + blink * 6, '#ffcc55', 0.8);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = hexA('#ff5566', 0.35 + blink * 0.5);
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.55, 0, TAU); ctx.fill();
      break;
    }
    case 'square': {
      ctx.fillStyle = body;
      poly(0, 0, e.r * 1.15, 4, Math.PI / 4 + Math.sin(t * 2 + e.wob) * 0.2);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = hexA('#ffffff', 0.35); ctx.lineWidth = 1.6;
      poly(0, 0, e.r * 0.6, 4, Math.PI / 4); ctx.stroke();
      break;
    }
    case 'fly': {
      const flap = Math.sin(t * 22 + e.wob) * 0.5;
      ctx.fillStyle = hexA(c, 0.45);
      ctx.save(); ctx.rotate(flap);
      ctx.beginPath(); ctx.ellipse(-e.r * 0.9, 0, e.r * 1.1, e.r * 0.42, -0.4, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.rotate(-flap);
      ctx.beginPath(); ctx.ellipse(e.r * 0.9, 0, e.r * 1.1, e.r * 0.42, 0.4, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(0, -e.r * 1.2); ctx.lineTo(e.r * 0.55, e.r * 0.7); ctx.lineTo(-e.r * 0.55, e.r * 0.7);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#dff6ff';
      ctx.beginPath(); ctx.arc(0, -e.r * 0.35, e.r * 0.22, 0, TAU); ctx.fill();
      break;
    }
    case 'shield': {
      ctx.fillStyle = body;
      poly(0, 0, e.r, 5); ctx.fill(); ctx.stroke();
      eyes(e.r * 0.4, e.r * 0.15);
      if (e.shieldHp > 0) {
        const f = e.shieldHp / e.shieldMax;
        ctx.strokeStyle = hexA('#ffd76b', 0.35 + f * 0.55);
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, e.r + 6, -Math.PI / 2 - 1.1 * f, -Math.PI / 2 + 1.1 * f); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, e.r + 6, Math.PI / 2 - 1.1 * f, Math.PI / 2 + 1.1 * f); ctx.stroke();
      }
      break;
    }
    case 'diamond': {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(0, -e.r * 1.4); ctx.lineTo(e.r * 0.85, 0); ctx.lineTo(0, e.r * 1.4); ctx.lineTo(-e.r * 0.85, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      glow(0, 0, e.r * 1.4, '#ff5ea8', 0.3 + Math.sin(t * 4) * 0.15);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ffe0f0';
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.28, 0, TAU); ctx.fill();
      break;
    }
    case 'healer': {
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#eafff0';
      ctx.fillRect(-e.r * 0.22, -e.r * 0.6, e.r * 0.44, e.r * 1.2);
      ctx.fillRect(-e.r * 0.6, -e.r * 0.22, e.r * 1.2, e.r * 0.44);
      ctx.globalCompositeOperation = 'lighter';
      glow(0, 0, e.r * 2.4, '#9dff8a', 0.18 + Math.sin(t * 3 + e.wob) * 0.1);
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'boss1': { // Крушитель
      ctx.fillStyle = body;
      poly(0, 0, e.r, 6, t * 0.2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = hexA('#ffffff', 0.1);
      poly(0, 0, e.r * 0.7, 6, t * 0.2); ctx.fill();
      ctx.fillStyle = '#8a1f2b';
      for (let i = 0; i < 6; i++) {
        const a = t * 0.2 + (i / 6) * TAU;
        ctx.save(); ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(e.r * 0.85, -7); ctx.lineTo(e.r * 1.3, 0); ctx.lineTo(e.r * 0.85, 7);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(-e.r * 0.25, -e.r * 0.15, 6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(e.r * 0.25, -e.r * 0.15, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a0a0f';
      ctx.beginPath(); ctx.arc(-e.r * 0.25, -e.r * 0.15, 2.6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(e.r * 0.25, -e.r * 0.15, 2.6, 0, TAU); ctx.fill();
      if (e.chargeT > 0) {
        ctx.globalCompositeOperation = 'lighter';
        glow(0, 0, e.r * 2.2, '#ff5566', 0.45);
        ctx.globalCompositeOperation = 'source-over';
      }
      break;
    }
    case 'boss2': { // Матка
      ctx.fillStyle = body;
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) {
        const a = (i / 20) * TAU;
        const rr = e.r * (1 + Math.sin(a * 4 + t * 3) * 0.12);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = hexA('#ffe0ff', 0.35);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + t * 0.4;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * e.r * 0.5, Math.sin(a) * e.r * 0.5, 7 + Math.sin(t * 3 + i) * 2, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#2a0a2f';
      ctx.beginPath(); ctx.ellipse(0, -e.r * 0.1, e.r * 0.3, e.r * 0.2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff5ea8';
      ctx.beginPath(); ctx.arc(0, -e.r * 0.1, e.r * 0.12, 0, TAU); ctx.fill();
      break;
    }
    case 'boss3': { // Повелитель бури
      const flap = Math.sin(t * 12) * 0.35;
      ctx.fillStyle = hexA(c, 0.5);
      ctx.save(); ctx.rotate(flap);
      ctx.beginPath(); ctx.ellipse(-e.r, 0, e.r * 1.5, e.r * 0.5, -0.35, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.rotate(-flap);
      ctx.beginPath(); ctx.ellipse(e.r, 0, e.r * 1.5, e.r * 0.5, 0.35, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(0, -e.r * 1.3); ctx.lineTo(e.r * 0.8, e.r * 0.8); ctx.lineTo(0, e.r * 0.35); ctx.lineTo(-e.r * 0.8, e.r * 0.8);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      glow(0, 0, e.r * 1.8, '#9fe8ff', 0.35 + Math.sin(t * 8) * 0.15);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#dff6ff'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const a = t * 5 + i * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * e.r * 0.4, Math.sin(a) * e.r * 0.4);
        ctx.lineTo(Math.cos(a + 0.6) * e.r * 1.1, Math.sin(a + 0.6) * e.r * 1.1);
        ctx.stroke();
      }
      break;
    }
  }

  if (e.flash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = hexA('#ffffff', clamp(e.flash * 3, 0, 0.7));
    ctx.beginPath(); ctx.arc(0, 0, e.r * 1.05, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
}

function eyes(spread, yOff, color = '#0d1220') {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(-spread * 0.6, -yOff, 3.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(spread * 0.6, -yOff, 3.4, 0, TAU); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(-spread * 0.6, -yOff - 0.8, 1.7, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(spread * 0.6, -yOff - 0.8, 1.7, 0, TAU); ctx.fill();
}

/* ---------- СНАРЯДЫ ---------- */
function drawBullets() {
  ctx.globalCompositeOperation = 'lighter';
  for (const b of G.bullets) {
    const tx = b.x - b.vx * 0.028, ty = b.y - b.vy * 0.028;
    const col = b.color;
    glow(b.x, b.y, b.r * (b.crit ? 3.4 : 2.6), col, 0.6);
    ctx.strokeStyle = hexA(col, 0.55);
    ctx.lineWidth = b.r * 1.1;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.55, 0, TAU); ctx.fill();
    if (b.kind === 'missile') {
      ctx.save();
      ctx.translate(b.x, b.y); ctx.rotate(b.ang);
      ctx.fillStyle = '#ffd0a0';
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, 3.4); ctx.lineTo(-4, -3.4); ctx.closePath(); ctx.fill();
      ctx.restore();
      glow(b.x - b.vx * 0.03, b.y - b.vy * 0.03, 10, '#ff7a2f', 0.5);
    }
  }
  for (const b of G.eBullets) {
    glow(b.x, b.y, b.r * 2.6, b.color, 0.55);
    ctx.fillStyle = hexA(b.color, 0.9);
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.75, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.3, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- ПИКАПЫ ---------- */
function drawPickups() {
  ctx.globalCompositeOperation = 'lighter';
  for (const p of G.pickups) {
    if (p.kind === 'coin') {
      const sq = Math.abs(Math.cos(p.spin));
      glow(p.x, p.y, 12, '#ffd23f', 0.45);
      ctx.fillStyle = '#ffe066';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * (0.35 + sq * 0.65), p.r, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c9922a';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 0.4 * (0.35 + sq * 0.65), p.r * 0.45, 0, 0, TAU); ctx.fill();
    } else {
      glow(p.x, p.y, 18, '#7bd948', 0.5);
      ctx.fillStyle = '#eafff0';
      ctx.fillRect(p.x - 3, p.y - 8, 6, 16);
      ctx.fillRect(p.x - 8, p.y - 3, 16, 6);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- ЧАСТИЦЫ ---------- */
function drawParticles() {
  ctx.globalCompositeOperation = 'lighter';
  for (const p of G.parts) {
    const k = clamp(p.life / p.max, 0, 1);
    if (p.kind === 'spark') {
      ctx.fillStyle = hexA(p.color, k);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.4 + k * 0.6), 0, TAU); ctx.fill();
    } else if (p.kind === 'smoke') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = hexA(p.color, k * 0.22);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
    } else if (p.kind === 'ring') {
      ctx.strokeStyle = hexA(p.color, k * 0.75);
      ctx.lineWidth = 2 + k * 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.25 - k * 0.25), 0, TAU); ctx.stroke();
    } else if (p.kind === 'strikeWarn') {
      ctx.globalCompositeOperation = 'source-over';
      const pulse = 0.5 + Math.sin(G.time * 22) * 0.5;
      ctx.strokeStyle = hexA('#ff5566', 0.5 + pulse * 0.5);
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - k * 0.15), 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = hexA('#ff5566', 0.12 + pulse * 0.1);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = hexA('#ff5566', 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - p.r * 1.3, p.y); ctx.lineTo(p.x + p.r * 1.3, p.y);
      ctx.moveTo(p.x, p.y - p.r * 1.3); ctx.lineTo(p.x, p.y + p.r * 1.3);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
    } else if (p.kind === 'beam') {
      glow(p.x, p.y, p.r * (0.6 + (1 - k) * 0.6), '#ffe6b0', k * 0.9);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawArcs() {
  ctx.globalCompositeOperation = 'lighter';
  for (const a of G.arcs) {
    const k = a.life / a.max;
    ctx.strokeStyle = hexA('#9fe8ff', k);
    ctx.lineWidth = 2 + k * 2;
    ctx.beginPath();
    const segs = 5;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = lerp(a.x1, a.x2, t) + (i && i < segs ? rand(-9, 9) : 0);
      const y = lerp(a.y1, a.y2, t) + (i && i < segs ? rand(-9, 9) : 0);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawTexts() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of G.texts) {
    const k = clamp(t.life / t.max, 0, 1);
    ctx.globalAlpha = k;
    ctx.font = `bold ${t.size}px system-ui, sans-serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

/* ---------- ПРИЗРАК ПОСТРОЙКИ / ПРИЦЕЛ ---------- */
function drawGhost() {
  if (!G.placing) return;
  const def = STRUCTS[G.placing];
  const x = G.mouse.wx, y = G.mouse.wy;
  const ok = canPlaceAt(x, y);
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = ok ? hexA(def.id === 'mine' ? '#ff8866' : '#8ff0ff', 0.3) : 'rgba(255,80,90,0.3)';
  ctx.strokeStyle = ok ? '#dff6ff' : '#ff5566';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, def.r, 0, TAU); ctx.fill(); ctx.stroke();
  if (def.range) {
    ctx.strokeStyle = hexA('#8ff0ff', 0.4);
    ctx.setLineDash([7, 7]);
    ctx.beginPath(); ctx.arc(0, 0, def.range, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (def.trigR) {
    ctx.strokeStyle = hexA('#ff8866', 0.4);
    ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.arc(0, 0, def.trigR + 20, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawStrikeAim() {
  if (!G.strike.aiming) return;
  const r = G.S.strikeRadius;
  const x = G.strike.x, y = G.strike.y;
  ctx.save();
  ctx.strokeStyle = hexA('#ff5566', 0.9);
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 8]);
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,85,102,0.1)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - r - 14, y); ctx.lineTo(x - r + 6, y);
  ctx.moveTo(x + r - 6, y); ctx.lineTo(x + r + 14, y);
  ctx.moveTo(x, y - r - 14); ctx.lineTo(x, y - r + 6);
  ctx.moveTo(x, y + r - 6); ctx.lineTo(x, y + r + 14);
  ctx.stroke();
  ctx.fillStyle = '#ff8899';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('УДАР — клик / ESC для отмены', x, y - r - 24);
  ctx.textAlign = 'left';
  ctx.restore();
}

/* ---------- ЭКРАННЫЕ ЭФФЕКТЫ ---------- */
function drawOverlay() {
  if (G.flash > 0) {
    ctx.fillStyle = hexA(G.flashColor || '#fff', G.flash * 0.5);
    ctx.fillRect(0, 0, W, H);
  }
  const hpFrac = G.tower.maxHp ? G.tower.hp / G.tower.maxHp : 1;
  if (hpFrac < 0.35 && G.state !== 'dead') {
    const a = (0.35 - hpFrac) / 0.35;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.62);
    g.addColorStop(0, 'rgba(255,40,60,0)');
    g.addColorStop(1, `rgba(255,40,60,${0.35 * a * (0.7 + Math.sin(G.time * 5) * 0.3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}
