/* =========================================================
   HARNESS: фейковый DOM + загрузка бандла игры в vm
   Используется тестами headless.js / balance.js
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------- ФЕЙКОВЫЙ DOM ---------- */
function makeCtxStub() {
  const store = {
    globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '',
    textAlign: 'left', textBaseline: 'alphabetic', globalCompositeOperation: 'source-over',
    lineCap: 'butt', shadowBlur: 0, shadowColor: ''
  };
  const gradient = { addColorStop() { } };
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createRadialGradient' || k === 'createLinearGradient' || k === 'createPattern') return () => gradient;
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => { };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

class Stub {
  constructor(tag = 'div', id = '') {
    this.tagName = (tag || 'div').toUpperCase();
    this.id = id;
    this.children = [];
    this.style = new Proxy({}, { get: (t, k) => (k in t ? t[k] : ''), set: (t, k, v) => (t[k] = v, true) });
    this.classList = {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, f) { const on = f === undefined ? !this._s.has(c) : !!f; on ? this._s.add(c) : this._s.delete(c); return on; },
      contains(c) { return this._s.has(c); }
    };
    this.dataset = {};
    this._html = '';
    this.textContent = '';
    this.disabled = false;
    this.offsetWidth = 100;
    this.onclick = null;
    this._ctx = this.tagName === 'CANVAS' ? makeCtxStub() : null;
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = v; if (v === '') this.children.length = 0; }
  get firstChild() { return this.children[0] || null; }
  get firstElementChild() { return this.children[0] || null; }
  getContext() { return this._ctx || (this._ctx = makeCtxStub()); }
  appendChild(c) { c._parent = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); return c; }
  remove() { if (this._parent) this._parent.removeChild(this); }
  setAttribute() { }
  getAttribute() { return null; }
  addEventListener() { }
  removeEventListener() { }
  querySelector() { return getStub('q'); }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1440, height: 860, right: 1440, bottom: 860 }; }
  focus() { }
}

const _stubs = new Map();
function getStub(sel) {
  if (!_stubs.has(sel)) _stubs.set(sel, new Stub('div', sel));
  return _stubs.get(sel);
}

const memStore = (() => {
  let m = {};
  return {
    getItem: k => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; },
    clear: () => { m = {}; }
  };
})();

let rafQueue = [];
const documentStub = {
  readyState: 'complete',
  hidden: false,
  querySelector: sel => getStub(sel),
  getElementById: id => getStub('#' + id),
  querySelectorAll: () => [],
  createElement: tag => new Stub(tag),
  addEventListener() { }, removeEventListener() { },
  body: new Stub('body'),
  documentElement: new Stub('html')
};
const canvasStub = new Stub('canvas', 'cv');
documentStub.querySelector = (sel) => (sel === '#cv' ? canvasStub : getStub(sel));
documentStub.getElementById = (id) => (id === 'cv' ? canvasStub : getStub('#' + id));

const windowStub = {
  innerWidth: 1440, innerHeight: 860, devicePixelRatio: 1,
  addEventListener() { }, removeEventListener() { },
  localStorage: memStore,
  requestAnimationFrame: cb => { rafQueue.push(cb); return rafQueue.length; },
  AudioContext: undefined,
  matchMedia: () => ({ matches: false, addEventListener() { } })
};

/* ---------- СБОРКА КОДА ---------- */
const SRC = path.join(__dirname, '..', 'src');
const files = ['core.js', 'data.js', 'yandex.js', 'game.js', 'render.js', 'ui.js', 'boot.js'];
let code = files.map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n\n');
code += `
;globalThis.__api = {
  get G(){return G}, get SAVE(){return SAVE}, set SAVE(v){SAVE=v},
  newRun, startWave, buyShelf, rerollShelf, buyStruct, placeStruct, tryStrike, cycleTarget,
  computeStats, SHOP, META, LAB, LAB_BY_ID, labCost, ENEMIES, BOSSES, STRUCTS, DIFFS, enemyScale, buildWave, bossForWave,
  update, render, resize, togglePause, gameOver, metaCost, shopCost, structCost, repairCost, buyRepair,
  spawnEnemy, spawnBoss, canPlaceAt, countStructs, loadSave, UI, Store, BASE, rollShelf, buyShelf,
  ARENA_R, SPAWN_R, TARGET_MODES, applyTowerDamage, damageEnemy, healTower, recomputeStats, Sfx,
  get frameDt(){return typeof frameDt!=='undefined'?frameDt:0},
  get TEST_GOLD(){return TEST_GOLD}, set TEST_GOLD(v){TEST_GOLD=v},
  bankRunCoins
};`;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const mathObj = Object.create(Math);
if (process.env.SEED) { mathObj.random = mulberry32(parseInt(process.env.SEED, 10) * 7919 + 13); }

const sandbox = {
  console,
  document: documentStub,
  window: windowStub,
  requestAnimationFrame: windowStub.requestAnimationFrame,
  cancelAnimationFrame: () => { },
  setTimeout, clearTimeout, setInterval, clearInterval,
  Math: mathObj, JSON, Date, performance: { now: () => Date.now() },
  confirm: () => true,
  devicePixelRatio: 1,
  Uint8ClampedArray, Map, Set, Array, Object, Number, String, Boolean, Error, isNaN, parseInt, parseFloat, Infinity, NaN
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);

const errors = [];
try {
  vm.runInContext(code, sandbox, { filename: 'game-bundle.js' });
} catch (e) {
  errors.push('ЗАГРУЗКА: ' + e.stack);
}

const api = sandbox.__api;

/* ---------- ХАРНЕС ---------- */
let ts = 0;
function step(n = 1, dt = 1 / 60) {
  for (let i = 0; i < n; i++) {
    ts += dt * 1000;
    if (!rafQueue.length) throw new Error('rAF-очередь пуста');
    const q = rafQueue; rafQueue = [];
    for (const cb of q) { try { cb(ts); } catch (e) { errors.push('КАДР: ' + e.stack); throw e; } }
  }
}
const sleep = (ms = 0) => new Promise(r => setTimeout(r, ms));

const counters = { checks: 0, fails: 0 };
function ok(cond, name, extra) {
  counters.checks++;
  if (!cond) { counters.fails++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
  else console.log('  ✓ ' + name);
}
const T = {
  api, step, sleep, errors, ok, counters,
  get ts() { return ts; },
  summary() {
    const c = counters;
    console.log('\n=== ИТОГ: ' + (c.checks - c.fails) + '/' + c.checks + ' проверок пройдено' + (c.fails ? ' — ЕСТЬ ПАДЕНИЯ' : ' — всё чисто') + ' ===');
    if (errors.length) console.log('\nОШИБКИ:\n' + errors.slice(0, 3).join('\n'));
    return c.fails || errors.length ? 1 : 0;
  },
  windowStub, Stub, canvasStub
};
module.exports = T;

