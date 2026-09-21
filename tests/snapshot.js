/* =========================================================
   SNAPSHOT: записывает вызовы canvas в примитивы (device space)
   и отдаёт JSON для растеризации в Pillow
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------- матрицы ---------- */
const M = {
  id: () => [1, 0, 0, 1, 0, 0],
  mul(m, n) { // m * n
    const [a, b, c, d, e, f] = m, [A, B, C, D, E, F] = n;
    return [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f];
  },
  pt(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; },
  sc(m) { return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])); }
};

/* ---------- записывающий контекст ---------- */
function makeRecorder(out) {
  const grad = (stops) => ({ _grad: true, stops, addColorStop(o, c) { stops.push([o, c]); } });
  let m = M.id();
  const stack = [];
  const st = {
    fillStyle: '#fff', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    globalCompositeOperation: 'source-over', font: '10px sans-serif', lineCap: 'butt',
    textAlign: 'left', textBaseline: 'alphabetic'
  };
  let path = [];
  const push = (o) => out.push(Object.assign({ comp: st.globalCompositeOperation, alpha: st.globalAlpha }, o));

  const ctx = {
    canvas: null,
    save() { stack.push([m.slice(), Object.assign({}, st)]); },
    restore() { const s = stack.pop(); if (s) { m = s[0]; Object.assign(st, s[1]); } },
    setTransform(a, b, c, d, e, f) { m = [a, b, c, d, e, f]; },
    transform(a, b, c, d, e, f) { m = M.mul(m, [a, b, c, d, e, f]); },
    translate(x, y) { m = M.mul(m, [1, 0, 0, 1, x, y]); },
    scale(x, y) { m = M.mul(m, [x, 0, 0, y, 0, 0]); },
    rotate(r) { const c = Math.cos(r), s = Math.sin(r); m = M.mul(m, [c, s, -s, c, 0, 0]); },
    beginPath() { path = []; },
    closePath() { if (path.length) path.push(['z']); },
    moveTo(x, y) { path.push(['m', ...M.pt(m, x, y)]); },
    lineTo(x, y) { path.push(['l', ...M.pt(m, x, y)]); },
    quadraticCurveTo(cx, cy, x, y) { path.push(['q', ...M.pt(m, cx, cy), ...M.pt(m, x, y)]); },
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) { path.push(['c', ...M.pt(m, c1x, c1y), ...M.pt(m, c2x, c2y), ...M.pt(m, x, y)]); },
    rect(x, y, w, h) {
      const p1 = M.pt(m, x, y), p2 = M.pt(m, x + w, y + h);
      path.push(['m', p1[0], p1[1]], ['l', p2[0], p1[1]], ['l', p2[0], p2[1]], ['l', p1[0], p2[1]], ['z']);
    },
    roundRect(x, y, w, h) { ctx.rect(x, y, w, h); },
    arc(x, y, r, a0, a1, ccw) {
      const c = M.pt(m, x, y);
      const k = M.sc(m);
      const rot = Math.atan2(m[1], m[0]);
      path.push(['a', c[0], c[1], Math.max(0.1, r * k), a0 + rot, a1 + rot, ccw ? 1 : 0, Math.abs(a1 - a0) >= Math.PI * 2 - 1e-6 ? 1 : 0]);
    },
    ellipse(x, y, rx, ry, rot, a0, a1) {
      const c = M.pt(m, x, y);
      const k = M.sc(m);
      const mr = Math.atan2(m[1], m[0]);
      path.push(['e', c[0], c[1], Math.max(0.1, rx * k), Math.max(0.1, ry * k), rot + mr, a0, a1]);
    },
    fill() { push({ t: 'fill', style: normStyle(st.fillStyle), path: path.map(p => p.slice()) }); },
    stroke() { push({ t: 'stroke', style: normStyle(st.strokeStyle), w: Math.max(0.4, st.lineWidth * M.sc(m)), path: path.map(p => p.slice()), dash: ctx._dash ? ctx._dash.slice() : null }); },
    fillRect(x, y, w, h) { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.fill(); },
    strokeRect(x, y, w, h) { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.stroke(); },
    clearRect() { },
    fillText(txt, x, y) { const p = M.pt(m, x, y); push({ t: 'text', txt: String(txt), x: p[0], y: p[1], size: fontSize(st.font) * M.sc(m), style: normStyle(st.fillStyle), align: st.textAlign }); },
    strokeText(txt, x, y) { const p = M.pt(m, x, y); push({ t: 'textstroke', txt: String(txt), x: p[0], y: p[1], size: fontSize(st.font) * M.sc(m), style: normStyle(st.strokeStyle), w: st.lineWidth * M.sc(m), align: st.textAlign }); },
    measureText(t) { return { width: String(t).length * 6 * M.sc(m) }; },
    drawImage(img, a, b, c, d) {
      let x = a, y = b, w = c, h = d;
      if (c === undefined) { w = img.width || 64; h = img.height || 64; }
      const p = M.pt(m, x, y);
      const k = M.sc(m);
      let glowColor = null, isStars = false;
      if (img && img._rec) {
        if (img._rec.length > 40) isStars = true;
        else { const g = img._rec.find(o => o.t === 'fill' && String(o.style).indexOf('rgba') === 0); if (g) glowColor = g.style; }
      }
      push({ t: 'image', x: p[0], y: p[1], w: w * k, h: h * k, glow: glowColor, bg: isStars });
    },
    createRadialGradient(x0, y0, r0, x1, y1, r1) { return grad([]); },
    createLinearGradient() { return grad([]); },
    createPattern() { return null; },
    setLineDash(d) { ctx._dash = d && d.length ? d.map(v => v * M.sc(m)) : null; },
    getLineDash() { return ctx._dash || []; },
    getImageData() { return { data: new Uint8ClampedArray(4) }; },
    putImageData() { },
    clip() { },
    _dash: null
  };
  ['fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'globalCompositeOperation', 'font', 'lineCap', 'textAlign', 'textBaseline', 'shadowBlur', 'shadowColor'].forEach(k => {
    Object.defineProperty(ctx, k, { get: () => st[k], set: v => { st[k] = v; }, configurable: true });
  });
  return ctx;
}

function fontSize(f) { const m = /([0-9.]+)px/.exec(String(f || "")); return m ? parseFloat(m[1]) : 12; }
function normStyle(s) {
  if (typeof s === 'string') return s;
  if (s && s._grad && s.stops.length) return s.stops[0][1];
  return '#fff';
}

/* ---------- фейковый DOM (минимальный, только чтобы игра запустилась) ---------- */
class Stub {
  constructor(tag = 'div', id = '') {
    this.tagName = (tag || 'div').toUpperCase(); this.id = id; this.children = [];
    this.style = {}; this.dataset = {}; this._html = ''; this.textContent = '';
    this.disabled = false; this.offsetWidth = 100; this.onclick = null;
    this.classList = { _s: new Set(), add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); }, toggle(c, f) { const on = f === undefined ? !this._s.has(c) : !!f; on ? this._s.add(c) : this._s.delete(c); return on; }, contains(c) { return this._s.has(c); } };
    if (this.tagName === 'CANVAS') { this.width = 1440; this.height = 860; }
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = v; if (v === '') this.children.length = 0; }
  get firstChild() { return this.children[0] || null; }
  get firstElementChild() { return this.children[0] || null; }
  getContext() { return this._ctx; }
  setContext(c) { this._ctx = c; }
  appendChild(c) { c._parent = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); return c; }
  remove() { if (this._parent) this._parent.removeChild(this); }
  setAttribute() { } getAttribute() { return null; }
  addEventListener() { } removeEventListener() { }
  querySelector() { return getStub('q'); } querySelectorAll() { return []; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1440, height: 860 }; }
}
const _stubs = new Map();
function getStub(sel) { if (!_stubs.has(sel)) _stubs.set(sel, new Stub('div', sel)); return _stubs.get(sel); }

const out = [];
const recCtx = makeRecorder(out);
const canvasStub = new Stub('canvas', 'cv');
canvasStub.setContext(recCtx);
recCtx.canvas = canvasStub;

const memStore = (() => { let m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })();
let rafQueue = [];
const windowStub = {
  innerWidth: 1440, innerHeight: 860, devicePixelRatio: 1,
  addEventListener() { }, removeEventListener() { }, localStorage: memStore,
  requestAnimationFrame: cb => { rafQueue.push(cb); return rafQueue.length; }
};
const documentStub = {
  readyState: 'complete', hidden: false, body: new Stub('body'), documentElement: new Stub('html'),
  querySelector: sel => (sel === '#cv' ? canvasStub : getStub(sel)),
  getElementById: id => (id === 'cv' ? canvasStub : getStub('#' + id)),
  querySelectorAll: () => [],
  createElement: tag => {
    const s = new Stub(tag);
    if (tag === 'canvas') {
      const sub = [];
      const c2 = makeRecorder(sub);
      c2.canvas = s;
      s.setContext(c2);
      s._rec = sub;
      // определяем «что это» по содержимому: спрайт свечения или звёзды
      setTimeout(() => {
        const hasStars = sub.some(o => o.t === 'fill' && sub.length > 40);
        if (hasStars) s._isStars = true;
        else {
          const g = sub.find(o => o.t === 'fill' && String(o.style).startsWith('rgba'));
          if (g) s._glowColor = g.style;
        }
      }, 0);
    }
    return s;
  },
  addEventListener() { }, removeEventListener() { }
};

const SRC = path.join(__dirname, '..', 'src');
let code = ['core.js', 'data.js', 'yandex.js', 'game.js', 'render.js', 'ui.js', 'boot.js']
  .map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n\n');
code += `
;globalThis.__api = { get G(){return G}, get SAVE(){return SAVE}, set SAVE(v){SAVE=v},
  newRun, startWave, buyStruct, placeStruct, tryStrike, spawnEnemy, spawnBoss, computeStats,
  SHOP, META, ENEMIES, BOSSES, STRUCTS, DIFFS, resize, UI, recomputeStats, burst, ring, spark,
  floatText, render, get frameDt(){return frameDt} };`;

const sandbox = {
  console, document: documentStub, window: windowStub,
  requestAnimationFrame: windowStub.requestAnimationFrame, cancelAnimationFrame: () => { },
  setTimeout, clearTimeout, setInterval, clearInterval, Math, JSON, Date,
  performance: { now: () => Date.now() }, confirm: () => true, devicePixelRatio: 1,
  Uint8ClampedArray, Map, Set, Array, Object, Number, String, Boolean, Error, isNaN, parseInt, parseFloat, Infinity, NaN
};
sandbox.globalThis = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'bundle.js' });
const api = sandbox.__api;

let ts = 0;
function step(n = 1, dt = 1 / 60) {
  for (let i = 0; i < n; i++) {
    ts += dt * 1000;
    const q = rafQueue; rafQueue = [];
    for (const cb of q) cb(ts);
  }
}

/* ---------- собираем кадр ---------- */
const WHICH = process.argv[2] || 'mid';
api.SAVE.coins = 5000;
api.SAVE.meta = { m_multi: 1, m_hp: 3 };
api.newRun();
const G = api.G;
// богатый билд для красивой картинки
// (уровни ×2 к прежним: после ребаланса лавки один этап вдвое слабее —
//  суммарная мощность этих билдов не изменилась, кадры сопоставимы со старыми)
const build = WHICH === 'rich'
  ? { dmg: 16, rate: 12, multi: 6, pierce: 6, crit: 10, critdmg: 6, explode: 4, chain: 4, split: 4, rico: 4, orbit: 6, missile: 4, shock: 4, slow: 4, burn: 6, aura: 4, scorch: 4, hp: 8, armor: 6, regen: 4, knock: 4, strike: 6 }
  : { dmg: 6, rate: 4, pierce: 2 };
G.levels = build;
api.recomputeStats(true);
G.wave = WHICH === 'rich' ? 14 : 6;
G.state = 'wave';
G.waveCount = 40; G.waveKilled = 12;
G.strike.cd = 6;

// постройки
const spots = [[150, -90], [-170, 60], [60, 180], [-80, -190], [230, 120], [-250, -140], [10, 260], [-300, 40], [300, -60], [-140, 240]];
['turret', 'turret', 'wall', 'wall', 'mine', 'mine', 'cryo', 'farm', 'turret', 'wall'].forEach((k, i) => {
  G.inv[k] = (G.inv[k] || 0) + 1;
  api.placeStruct(k, spots[i][0], spots[i][1]);
});
if (WHICH === 'rich') G.structs.forEach(s => { s.hp = s.maxHp * (0.4 + Math.random() * 0.6); });

// враги разных типов вокруг башни
const layout = WHICH === 'rich'
  ? [['crawler', 300, 40], ['crawler', 330, 90], ['runner', -260, 180], ['runner', -300, 150], ['tank', 180, -260],
     ['spitter', -330, -120], ['bomber', 60, 320], ['splitter', -120, 300], ['flyer', 250, 220], ['flyer', 200, 260],
     ['shielder', -200, -230], ['summoner', 380, -180], ['healer', -380, 60], ['crawler', 420, 120], ['runner', 460, -60],
     ['tank', -440, -200], ['crawler', 100, -380], ['mini', -90, -330]]
  : [['crawler', 280, 30], ['crawler', -250, 120], ['runner', 120, -280], ['spitter', -300, -140], ['tank', 200, 200]];
layout.forEach(([t, x, y]) => { const e = api.spawnEnemy(t, x, y, Math.atan2(-y, -x)); if (e) { e.spawnT = 0; e.hp = e.maxHp * (0.35 + Math.random() * 0.65); } });
if (WHICH === 'rich') {
  const b = api.spawnBoss('crusher');
  b.x = -160; b.y = 340; b.spawnT = 0; b.hp = b.maxHp * 0.72;
  G.bossAlive = b;
  const b2 = api.spawnBoss('storm');
  b2.x = 380; b2.y = -300; b2.spawnT = 0; b2.hp = b2.maxHp * 0.9;
  G.bossAlive = b;
}
// эффекты
if (WHICH === 'rich') {
  api.burst(120, 160, 26, '#ff9944', 200);
  api.ring(-60, 220, 70, '#8ff0ff', 0.3);
  api.floatText(-40, -60, '-248', '#ffd23f', 18);
  api.floatText(150, 60, '-37', '#ffffff', 12);
  for (let i = 0; i < 5; i++) api.spark(-200 + i * 12, 100 + i * 6, '#ffd23f', 3, 120);
  G.pickups.push({ x: 90, y: -120, vx: 0, vy: 0, val: 5, t: 1, kind: 'coin', r: 6, spin: 0.6 });
  G.pickups.push({ x: -140, y: 90, vx: 0, vy: 0, val: 5, t: 1, kind: 'coin', r: 6, spin: 2.2 });
  G.pickups.push({ x: 40, y: 140, vx: 0, vy: 0, val: 12, t: 1, kind: 'heal', r: 9, spin: 0 });
}
step(6);                      // несколько кадров: снаряды, частицы, доворот башни
G.tower.hp = G.tower.maxHp * (WHICH === 'rich' ? 0.52 : 0.8);

out.length = 0;               // чистим и пишем только финальный кадр
api.render();

fs.writeFileSync(path.join(__dirname, 'shot-' + WHICH + '.json'), JSON.stringify({
  w: 1440, h: 860, ops: out,
  meta: { wave: G.wave, enemies: G.enemies.length, structs: G.structs.length, bullets: G.bullets.length, parts: G.parts.length, hp: Math.round(G.tower.hp), maxHp: G.tower.maxHp, range: Math.round(G.S.range), dmg: +G.S.dmg.toFixed(1), projectiles: G.S.projectiles }
}));
console.log('shot-' + WHICH + '.json: ' + out.length + ' примитивов; ' + JSON.stringify({ enemies: G.enemies.length, structs: G.structs.length, bullets: G.bullets.length, parts: G.parts.length }));
