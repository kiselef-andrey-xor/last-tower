/* =========================================================
   CORE: утилиты, сохранение, звук
   ========================================================= */
'use strict';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const chance = (p) => Math.random() < p;
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const sign = (v) => (v < 0 ? -1 : 1);
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
const fmt = (n) => {
  n = Math.round(n);
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 10000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
};

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Взвешенный выбор: items = [{w: вес, ...}] */
function weightedPick(items) {
  let total = 0;
  for (const it of items) total += it.w;
  let r = Math.random() * total;
  for (const it of items) { r -= it.w; if (r <= 0) return it; }
  return items[items.length - 1];
}

/* Короткое имя волны/времени */
function mmss(t) {
  t = Math.max(0, Math.floor(t));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}

/* ---------------------------------------------------------
   СОХРАНЕНИЕ (localStorage может быть недоступен в песочнице
   — тогда тихо работаем в памяти)
   --------------------------------------------------------- */
const SAVE_KEY = 'towerRogueSave_v1';

/* Хранилище: localStorage → sessionStorage → память.
   В песочницах без allow-same-origin localStorage бросает исключение —
   тогда тихо падаем на sessionStorage/память и помечаем degraded. */
const Store = {
  _mem: null,
  _ok: null,               // 'local' | 'session' | false
  _probe() {
    if (this._ok !== null) return this._ok;
    try { window.localStorage.setItem('__t', '1'); window.localStorage.removeItem('__t'); this._ok = 'local'; return this._ok; } catch (e) { }
    try { window.sessionStorage.setItem('__t', '1'); window.sessionStorage.removeItem('__t'); this._ok = 'session'; return this._ok; } catch (e) { }
    this._ok = false;
    return this._ok;
  },
  read() {
    const k = this._probe();
    if (k === 'local') { try { return window.localStorage.getItem(SAVE_KEY); } catch (e) { return null; } }
    if (k === 'session') { try { return window.sessionStorage.getItem(SAVE_KEY); } catch (e) { return null; } }
    return this._mem;
  },
  write(str) {
    const k = this._probe();
    if (k === 'local') { try { window.localStorage.setItem(SAVE_KEY, str); return true; } catch (e) { this._ok = false; } }
    if (k === 'session') { try { window.sessionStorage.setItem(SAVE_KEY, str); return true; } catch (e) { this._ok = false; } }
    this._mem = str;
    return false;
  },
  clear() {
    try { window.localStorage.removeItem(SAVE_KEY); } catch (e) { }
    try { window.sessionStorage.removeItem(SAVE_KEY); } catch (e) { }
    this._mem = null;
  },
  degraded() { return this._probe() !== 'local'; }
};

const DEFAULT_SAVE = () => ({
  coins: 0,
  meta: {},                 // id -> уровень мета-улучшения
  lab: {},                  // id -> уровень улучшения лаборатории
  diff: 0,                  // выбранная сложность
  unlockedDiff: 0,          // макс. открытая сложность
  best: { wave: 0, kills: 0, coins: 0 },
  bestByDiff: {},           // рекорд волны по каждой сложности (ими открываются следующие)
  stats: { runs: 0, kills: 0, waves: 0, bosses: 0, time: 0 },
  sound: true,
  shake: true,
  dmgNumbers: true,
  seenTutorial: false
});

let SAVE = DEFAULT_SAVE();

function loadSave() {
  let raw = null;
  try { raw = Store.read(); } catch (e) { raw = null; }
  const base = DEFAULT_SAVE();
  if (raw) {
    try {
      const p = JSON.parse(raw);
      SAVE = Object.assign(base, p);
      SAVE.meta = Object.assign({}, p.meta || {});
      SAVE.lab = Object.assign({}, p.lab || {});
      SAVE.best = Object.assign(base.best, p.best || {});
      SAVE.stats = Object.assign(base.stats, p.stats || {});
      SAVE.bestByDiff = Object.assign({}, p.bestByDiff || {});
      // миграция старых сейвов: глобальный рекорд считаем рекордом Обычной
      if (!p.bestByDiff && SAVE.best.wave > 0) SAVE.bestByDiff[0] = SAVE.best.wave;
    } catch (e) { SAVE = base; }
  } else SAVE = base;
  return SAVE;
}

let saveDirty = false;
function markSave() { saveDirty = true; }
function flushSave() {
  if (!saveDirty) return;
  saveDirty = false;
  try { Store.write(JSON.stringify(SAVE)); } catch (e) { }
  if (typeof YA !== 'undefined') YA.scheduleCloud();   // облако Яндекс Игр (дебаунс внутри)
}

/* ---------------------------------------------------------
   ЗВУК: маленький процедурный синтезатор на WebAudio
   --------------------------------------------------------- */
const Sfx = {
  ctx: null,
  master: null,
  budget: 0,          // сколько звуков осталось в этом кадре
  enabled: true,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.enabled = false; }
  },
  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => { });
  },
  ok() {
    if (!this.enabled || !SAVE.sound) return false;
    this.init();
    if (!this.ctx) return false;
    if (this.budget <= 0) return false;
    this.budget--;
    return true;
  },
  tone(freq, dur, type = 'square', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.ok()) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  },
  noise(dur, vol = 0.25, lp = 1200, delay = 0) {
    if (!this.ok()) return;
    const t0 = this.ctx.currentTime + delay;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, Math.max(16, n), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  },

  // --- конкретные звуки ---
  shoot() { this.tone(rand(520, 620), 0.06, 'square', 0.055, 220); },
  shootHeavy() { this.tone(180, 0.1, 'sawtooth', 0.09, 70); this.noise(0.07, 0.06, 900); },
  hit() { this.tone(rand(300, 380), 0.035, 'triangle', 0.05, 180); },
  crit() { this.tone(880, 0.07, 'square', 0.07, 1500); },
  kill() { this.noise(0.09, 0.11, 1600); this.tone(rand(150, 220), 0.08, 'triangle', 0.05, 80); },
  boom() { this.noise(0.4, 0.3, 700); this.tone(90, 0.35, 'sine', 0.22, 32); },
  smallBoom() { this.noise(0.18, 0.16, 1100); this.tone(140, 0.15, 'sine', 0.1, 50); },
  coin() { this.tone(rand(1150, 1300), 0.05, 'square', 0.045); this.tone(rand(1600, 1750), 0.06, 'square', 0.035, null, 0.04); },
  buy() { this.tone(660, 0.07, 'triangle', 0.09); this.tone(990, 0.09, 'triangle', 0.08, null, 0.06); this.tone(1320, 0.12, 'triangle', 0.06, null, 0.12); },
  deny() { this.tone(160, 0.12, 'square', 0.08, 90); },
  place() { this.tone(240, 0.08, 'sawtooth', 0.09, 420); this.noise(0.08, 0.08, 800); },
  waveStart() { this.tone(120, 0.5, 'sawtooth', 0.11, 260); this.tone(180, 0.5, 'square', 0.05, 380, 0.05); },
  bossWarn() { for (let i = 0; i < 3; i++) { this.tone(90, 0.3, 'sawtooth', 0.14, 60, i * 0.34); this.noise(0.3, 0.1, 400, i * 0.34); } },
  hurt() { this.tone(150, 0.16, 'square', 0.12, 60); this.noise(0.14, 0.12, 500); },
  shield() { this.tone(500, 0.09, 'sine', 0.06, 900); },
  strike() { this.noise(0.55, 0.32, 2600); this.tone(1400, 0.4, 'sawtooth', 0.09, 90); this.tone(70, 0.5, 'sine', 0.2, 30, 0.05); },
  heal() { this.tone(520, 0.1, 'sine', 0.07, 780); this.tone(780, 0.14, 'sine', 0.05, 1100, 0.07); },
  levelup() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.09, null, i * 0.07)); },
  gameOver() { [440, 370, 294, 220, 165].forEach((f, i) => this.tone(f, 0.42, 'sawtooth', 0.12, f * 0.6, i * 0.22)); },
  victory() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.3, 'square', 0.09, null, i * 0.11)); },
  tick() { this.tone(1200, 0.03, 'square', 0.03); }
};
