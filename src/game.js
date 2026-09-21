/* =========================================================
   GAME: состояние, цикл, волны, враги, снаряды, постройки
   ========================================================= */
'use strict';

const ARENA_R = 460;       // радиус игровой арены
const SPAWN_R = 585;       // откуда приходят враги
const SPAN_X = 1420;       // сколько мировых единиц влезает по ширине
const SPAN_Y = 1250;
const BUILD_TIME = 45;     // секунд на подготовку между волнами
const WAVE_TIME_LIMIT = 60; // предел длины волны: дальше враги отступают
const TOWER_R = 27;
const HEAL_CAP = 0.3;      // предел входящего лечения: доля макс. HP цели в секунду

/* Тестовый банк: монеты, которые выдаются в начало каждого забега,
   чтобы быстро проверять улучшения. Не переносятся в кошелёк.
   По умолчанию ВЫКЛЮЧЕН: с бесплатными 10 000 монет экономика забега
   теряет смысл (любые цены тонут в тестовом банке).
   Для отладки включается параметром адреса: index.html?testgold=10000
   (или поменяйте значение ниже вручную). */
let TEST_GOLD = (() => {
  try {
    const search = (typeof window !== 'undefined' && window.location && window.location.search) || '';
    const m = /[?&]testgold=(\d+)/i.exec(search);
    return m ? Math.min(1e7, parseInt(m[1], 10) || 0) : 0;
  } catch (e) { return 0; }
})();

/* Скорость игры: ×0.5 … ×5 (клавиша F / кнопка ⏩ рядом с приоритетом цели) */
const SPEEDS = [0.5, 1, 1.5, 2, 3, 5];
function cycleSpeed() {
  if (!G) return;
  const i = SPEEDS.indexOf(G.speed || 1);
  G.speed = SPEEDS[(i + 1) % SPEEDS.length];
  UI.hudSpeed();
  UI.toast('Скорость игры ×' + G.speed);
  Sfx.tone(420 + G.speed * 70, 0.06, 'square', 0.05, 900);
}

/* Состав волны: тип -> число (boss = 1), для панели врагов */
function waveComp(w) {
  const q = buildWave(w, G.diff);
  const c = {};
  for (const s of q) c[s.t] = (c[s.t] || 0) + 1;
  if (w % 5 === 0) c.boss = 1;
  return c;
}

const TARGET_MODES = [
  { id: 0, name: 'БЛИЖНИЙ', icon: '◎' },
  { id: 1, name: 'КРЕПКИЙ', icon: '⬢' },
  { id: 2, name: 'СЛАБЫЙ',  icon: '◇' }
];

let G = null;      // состояние забега
let W = 0, H = 0, DPR = 1;
let canvas, ctx;

function newRun() {
  const diff = SAVE.diff || 0;
  const S = computeStats({});
  G = {
    state: 'build',          // build | wave | dead | paused
    diff,
    wave: 0,
    time: 0,
    runTime: 0,
    S,
    levels: {},              // внутризабежные улучшения id -> lv
    tower: {
      x: 0, y: 0, r: TOWER_R, hp: S.maxHp, maxHp: S.maxHp, shield: S.shield,
      angle: -Math.PI / 2, cd: 0, recoil: 0, hitFlash: 0, pulse: 0
    },
    enemies: [], bullets: [], eBullets: [], structs: [], parts: [],
    pickups: [], texts: [], arcs: [],
    inv: {},                 // купленные постройки, ждущие установки
    placing: null,
    shelf: [],
    rerollsLeft: S.rerolls,
    rerollsUsed: 0,
    targetMode: 0,
    strike: { cd: 0, aiming: false, x: 0, y: 0 },
    focus: null,
    orbitCd: 0,
    missileCd: 2,
    shockCd: 0,
    queue: [], spawnT: 0, waveCount: 0, waveKilled: 0, bossAlive: null,
    speed: 1,
    buildT: BUILD_TIME,
    shake: 0, flash: 0, flashColor: '#fff',
    stats: { kills: 0, coins: 0, dmg: 0, bosses: 0, structsBuilt: 0, waves: 0 },
    view: { cx: 0, cy: 0, scale: 0.6 },
    mouse: { x: 0, y: 0, wx: 0, wy: 0, down: false },
    over: null,
    slowmo: 1
  };
  SAVE.stats.runs++;
  recomputeStats(true);
  // кошелёк забега: стартовый грант + тестовый банк; в мета-кошелёк не попадает
  G.purse = S.startGold + TEST_GOLD;
  G.allowLeft = S.startGold;   // сколько из гранта ещё не потрачено (не переносится)
  G.testLeft = TEST_GOLD;      // тестовый банк (не переносится)
  G.banked = false;
  G.revives = S.revives || 0;      // лаборатория: «Второе дыхание»
  G.nextComp = waveComp(1);
  rollShelf(true);
  resize();
  return G;
}

/* ---------- ХАРАКТЕРИСТИКИ ---------- */
function recomputeStats(fullHeal) {
  const prevHp = G.tower.hp, prevMax = G.tower.maxHp, prevShield = G.tower.shield;
  const S = computeStats(G.levels);
  G.S = S;
  G.tower.maxHp = S.maxHp;
  if (fullHeal) { G.tower.hp = S.maxHp; G.tower.shield = S.shield; }
  else {
    // сохраняем процент прочности + добавляем разницу, если maxHp вырос
    const frac = prevMax > 0 ? prevHp / prevMax : 1;
    G.tower.hp = clamp(prevHp + Math.max(0, S.maxHp - prevMax) * frac + (S.maxHp > prevMax ? (S.maxHp - prevMax) * 0.5 : 0), 0, S.maxHp);
    G.tower.shield = prevShield;
  }
}

/* ---------- МОНЕТЫ ----------
   Во время забега вся экономика идёт через G.purse (кошелёк забега):
   стартовый грант и тестовый банк в мета-кошелёк (SAVE.coins) не попадают.
   В SAVE.coins уходит только добыча за вычетом потраченного (перенос)
   и награда за забег. */
function addCoins(n, notify) {
  n = Math.round(n);
  if (n <= 0) return;
  if (G && G.purse !== undefined) { G.purse += n; G.stats.coins += n; }
  else { SAVE.coins += n; markSave(); }
  if (notify !== false) UI.hudCoins();
}
function spendCoins(n) {
  n = Math.round(n);
  if (G && G.purse !== undefined) {
    if (G.purse < n) return false;
    let rest = n;
    const t = Math.min(G.testLeft, rest); G.testLeft -= t; rest -= t;   // сначала тестовый банк
    const a = Math.min(G.allowLeft, rest); G.allowLeft -= a; rest -= a; // затем стартовый грант
    G.purse -= n;                                                      // остаток — добыча
    UI.hudCoins();
    return true;
  }
  if (SAVE.coins < n) return false;
  SAVE.coins -= n;
  markSave();
  UI.hudCoins();
  return true;
}
/* Перенос непотраченной ДОБЫЧИ забега в мета-кошелёк:
   серебро забега конвертируется в золото улучшений 1:100;
   стартовый грант и тест-банк сгорают. */
function bankRunCoins() {
  if (!G || G.banked || G.purse === undefined) return 0;
  G.banked = true;
  const silver = Math.max(0, Math.round(G.purse - G.testLeft - G.allowLeft));
  const gold = Math.floor(silver / 100);
  G.transferSilver = silver;
  if (gold > 0) { SAVE.coins += gold; markSave(); flushSave(); }
  return gold;
}

/* Награда забега и рекорды: одинаковы при гибели башни и при выходе в меню */
function runReward() {
  const D = DIFFS[G.diff];
  return Math.round((6 + G.wave * 5.5 + G.stats.kills * 0.12 + G.stats.bosses * 18) * D.coins);
}
function bankRunProgress() {
  if (!G || G.rewarded) return 0;
  G.rewarded = true;
  const reward = runReward();
  if (G.diff === 3) YA.submitScore(G.wave);   // таблица лидеров: только рекорды со сложности «Ад»
  SAVE.coins += reward;
  SAVE.stats.waves += G.wave;
  SAVE.stats.time += G.runTime;
  if (G.wave > SAVE.best.wave) SAVE.best.wave = G.wave;
  if (G.stats.kills > SAVE.best.kills) SAVE.best.kills = G.stats.kills;
  if (reward > SAVE.best.coins) SAVE.best.coins = reward;
  // рекорд по каждой сложности отдельно: ими открываются следующие сложности
  const bd = SAVE.bestByDiff || (SAVE.bestByDiff = {});
  bd[G.diff] = Math.max(bd[G.diff] || 0, G.wave);
  markSave();
  return reward;
}

/* ---------- ЛАВКА ---------- */
function rollShelf(fresh) {
  if (!G.shelf) G.shelf = [];
  if (fresh) {
    // полностью новый ассортимент, без повторов
    G.shelf = [];
    const seen = {};
    let guard = 0;
    while (G.shelf.length < 5 && guard++ < 60) {
      const c = rollCard();
      if (!c || seen[c.id]) continue;
      seen[c.id] = 1;
      G.shelf.push(c);
    }
  } else {
    while (G.shelf.length < 5) {
      const c = rollCard();
      if (!c) break;          // всё выкуплено до максимума — полка может опустеть
      G.shelf.push(c);
    }
  }
  UI.renderShop();
}

function rollCard() {
  const avail = SHOP.filter(d => {
    if (d.kind === 'build') return false;   // постройки живут в отдельной секции лавки
    return (G.levels[d.id] || 0) < d.max;
  });
  if (!avail.length) return null;
  // вес по редкости
  const w = avail.map(d => ({ d, w: RARITY[d.rarity].w }));
  return { id: weightedPick(w).d.id, fresh: true };
}

function countStructs(key) {
  let n = G.inv[key] || 0;
  for (const s of G.structs) if (s.key === key) n++;
  return n;
}

function buyShelf(i) {
  if (G.state !== 'build' && G.state !== 'wave') return;   // в бою покупать можно
  const slot = G.shelf[i];
  if (!slot) return;
  const def = SHOP_BY_ID[slot.id];
  if (!def) return;
  const lv = G.levels[def.id] || 0;
  let price;
  if (def.kind === 'build') price = structCost(def.struct, G.S.priceMult);
  else price = shopCost(def, lv, G.wave, G.S.priceMult);

  if (def.kind === 'build' && countStructs(def.struct) >= STRUCTS[def.struct].max) {
    UI.toast('Больше таких построек ставить нельзя'); Sfx.deny(); return;
  }
  if (!spendCoins(price)) { Sfx.deny(); UI.toast('Не хватает монет'); return; }

  Sfx.buy();
  if (def.kind === 'build') {
    G.inv[def.struct] = (G.inv[def.struct] || 0) + 1;
    G.placing = def.struct;
    UI.toast(def.name + ' — выберите место на арене');
  } else if (def.kind === 'repair') {
    const heal = Math.round(G.tower.maxHp * 0.35);
    G.tower.hp = Math.min(G.tower.maxHp, G.tower.hp + heal);
    floatText(0, -60, '+' + heal + ' HP', '#7bd948', 20);
    Sfx.heal();
    burst(0, 0, 16, '#7bd948', 90);
  } else {
    G.levels[def.id] = lv + 1;
    recomputeStats(false);
    floatText(0, -60, def.name + ' ур.' + (lv + 1), RARITY[def.rarity].color, 18);
    burst(0, 0, 14, RARITY[def.rarity].color, 80);
  }
  G.shelf.splice(i, 1);
  UI.renderShop();
  UI.hudAll();
}

function rerollShelf() {
  if (G.state !== 'build' && G.state !== 'wave') return;
  if (G.rerollsLeft <= 0) { Sfx.deny(); UI.toast('Обновления закончились до следующей волны'); return; }
  G.rerollsLeft--;
  G.rerollsUsed++;
  // полностью новая полка: без дублей и без пустых слотов (rollCard может вернуть null)
  rollShelf(true);
  Sfx.tone(700, 0.08, 'triangle', 0.07, 1100);
}

/* ---------- ПОСТРОЙКИ ---------- */
function canPlaceAt(x, y) {
  const d = Math.hypot(x, y);
  if (d < TOWER_R + 34 || d > ARENA_R - 26) return false;
  for (const s of G.structs) if (dist(x, y, s.x, s.y) < s.r + 26) return false;
  return true;
}

function placeStruct(key, x, y) {
  if ((G.inv[key] || 0) <= 0) return false;
  if (!canPlaceAt(x, y)) return false;
  const def = STRUCTS[key];
  G.inv[key]--;
  const hpMul = G.S.turretMul;
  G.structs.push({
    key, x, y, r: def.r, def,
    hp: Math.round(def.hp * hpMul), maxHp: Math.round(def.hp * hpMul),
    cd: rand(0, 0.5), flash: 0, born: G.time, ang: rand(0, TAU), dead: false
  });
  if (G.inv[key] <= 0) G.placing = null;
  G.stats.structsBuilt++;
  Sfx.place();
  burst(x, y, 12, '#ffd23f', 70);
  ring(x, y, 30, '#ffd23f', 0.4);
  UI.renderShop();
  UI.hudAll();
  return true;
}

function damageStruct(s, dmg) {
  s.hp -= dmg;
  s.flash = 0.15;
  if (s.hp <= 0 && !s.dead) {
    s.dead = true;
    burst(s.x, s.y, 18, '#ffb066', 130);
    ring(s.x, s.y, 40, '#ff8844', 0.5);
    Sfx.smallBoom();
    if (s.key === 'mine') return;
  }
}

function mineExplode(s) {
  const def = STRUCTS.mine;
  const dmg = (def.dmgBase + G.S.dmg * def.dmgScale) * (1 + G.wave * 0.05);
  aoe(s.x, s.y, def.radius, dmg, '#ffb066');
  ring(s.x, s.y, def.radius, '#ffd23f', 0.45);
  burst(s.x, s.y, 26, '#ff9944', 190);
  shake(7);
  Sfx.boom();
  s.hp = 0; s.dead = true;
}

/* ---------- УРОН ---------- */
function aoe(x, y, r, dmg, color) {
  for (const e of G.enemies) {
    if (e.dead) continue;
    const d = dist(x, y, e.x, e.y);
    if (d < r + e.r) {
      const falloff = clamp(1 - (d - r * 0.35) / (r * 1.2), 0.45, 1);
      damageEnemy(e, dmg * falloff, null, color);
    }
  }
}

function damageEnemy(e, amount, bullet, color) {
  if (e.dead) return 0;
  let dmg = amount;
  if (e.armor) dmg = Math.max(dmg * 0.18, dmg - e.armor);
  if (e.shieldHp > 0) {
    const absorbed = Math.min(e.shieldHp, dmg);
    e.shieldHp -= absorbed;
    dmg -= absorbed;
    e.shieldT = e.shieldDelay;
    if (e.shieldHp <= 0) { ring(e.x, e.y, e.r + 12, '#ffc76b', 0.35); Sfx.shield(); }
    else if (chance(0.25)) spark(e.x, e.y, '#ffe6b0', 3);
  }
  if (dmg > 0) {
    e.hp -= dmg;
    e.flash = 0.1;
    G.stats.dmg += dmg;
    if (SAVE.dmgNumbers && (bullet && bullet.crit || dmg > e.maxHp * 0.22)) {
      floatText(e.x + rand(-6, 6), e.y - e.r - 4, Math.round(dmg), bullet && bullet.crit ? '#ffd23f' : '#ffffff', bullet && bullet.crit ? 17 : 12);
    }
    if (bullet && bullet.crit) spark(e.x, e.y, '#ffd23f', 6);
  }
  if (e.hp <= 0) killEnemy(e, bullet);
  return dmg;
}

function killEnemy(e, bullet) {
  if (e.dead) return;
  e.dead = true;
  G.waveKilled++;
  G.stats.kills++;
  SAVE.stats.kills++;
  markSave();

  const coinVal = Math.max(1, Math.round(e.gold * G.S.goldMult));
  dropCoins(e.x, e.y, coinVal, e.boss ? 6 : 1);
  if (chance(e.boss ? 1 : 0.022)) dropHeal(e.x, e.y);

  burst(e.x, e.y, e.boss ? 46 : Math.min(20, 6 + e.r), e.def.color, e.boss ? 230 : 120);
  ring(e.x, e.y, e.r * (e.boss ? 3.4 : 2.2), e.def.color, e.boss ? 0.7 : 0.35);
  if (e.boss) { shake(22); Sfx.boom(); Sfx.victory(); }
  else Sfx.kill();

  if (G.S.lifesteal > 0) healTower(G.S.lifesteal);

  // лаборатория: «Каскад детонаций» — смерть взрывает область (один скачок)
  if (G.S.cascade > 0 && !e._noCas) {
    const R = G.S.cascade, D = G.S.cascadeDmg * (1 + G.wave * 0.03);
    ring(e.x, e.y, R, '#c86bff', 0.35);
    burst(e.x, e.y, 10, '#c86bff', 120);
    for (const o of G.enemies) {
      if (o === e || o.dead) continue;
      if (dist(o.x, o.y, e.x, e.y) < R + o.r) { o._noCas = true; damageEnemy(o, D, null, '#c86bff'); }
    }
  }

  if (e.def.split && e.def.splitN) {
    for (let i = 0; i < e.def.splitN; i++) {
      const a = rand(0, TAU);
      spawnEnemy(e.def.split, e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14, a, true);
    }
  }
  if (e.boss) {
    G.stats.bosses++;
    SAVE.stats.bosses++;
    G.bossAlive = null;
    bossTrophy(e);
  }
}

/* Трофей с босса — бесплатное улучшение */
function bossTrophy(e) {
  const avail = SHOP.filter(d => !d.kind && (G.levels[d.id] || 0) < d.max);
  if (!avail.length) { addCoins(80); UI.toast('Трофей босса: +80 монет'); return; }
  const w = avail.map(d => ({ d, w: RARITY[d.rarity].w * (d.rarity === 'epic' ? 3 : 1) }));
  const def = weightedPick(w).d;
  // +2 «полуэтапа» = прежний полный этап: ценность трофея не изменилась
  G.levels[def.id] = Math.min(def.max, (G.levels[def.id] || 0) + 2);
  recomputeStats(false);
  addCoins(40);   // серебро трофея одинаково на всех сложностях
  UI.banner('ТРОФЕЙ БОССА', def.icon + ' ' + def.name + ' ур.' + G.levels[def.id], RARITY[def.rarity].color);
  Sfx.levelup();
  UI.renderShop();
}

function healTower(n) {
  if (G.tower.hp <= 0) return;
  const before = G.tower.hp;
  G.tower.hp = Math.min(G.tower.maxHp, G.tower.hp + n);
  if (G.tower.hp - before > 0.5 && chance(0.3)) floatText(rand(-20, 20), -34, '+' + Math.round(G.tower.hp - before), '#7bd948', 11);
}

function applyTowerDamage(amount, srcX, srcY) {
  if (G.state === 'dead') return;
  // процентное снижение (до брони), затем абсолютная броня с полом 20%
  const red = amount * (1 - clamp(G.S.dmgReduce || 0, 0, 0.75));
  let dmg = Math.max(red * 0.2, red - G.S.armor);
  const T = G.tower;
  if (T.shield > 0) {
    const ab = Math.min(T.shield, dmg);
    T.shield -= ab; dmg -= ab;
    ring(T.x, T.y, T.r + 14, '#59c8ff', 0.3);
  }
  if (dmg <= 0) return;
  T.hp -= dmg;
  T.hitFlash = 0.25;
  G.flash = Math.min(0.55, 0.18 + dmg / 90);
  G.flashColor = '#ff4455';
  shake(Math.min(16, 4 + dmg * 0.35));
  Sfx.hurt();
  floatText(rand(-16, 16), -T.r - 8, '-' + Math.round(dmg), '#ff6b7a', 15);
  if (srcX !== undefined) burst(srcX, srcY, 8, '#ff6b7a', 90);
  if (T.hp <= 0) {
    if ((G.revives || 0) > 0) {           // лаборатория: «Второе дыхание»
      G.revives--;
      T.hp = Math.round(T.maxHp * 0.5);
      burst(T.x, T.y, 40, '#7bd948', 220);
      ring(T.x, T.y, 160, '#7bd948', 0.8);
      shake(18);
      Sfx.levelup();
      UI.banner('ВТОРОЕ ДЫХАНИЕ', 'башня восстановлена до 50%', '#7bd948');
      floatText(0, -T.r - 24, 'РЕАНИМАЦИЯ', '#7bd948', 20);
    } else {
      T.hp = 0; gameOver();
    }
  }
  UI.hudHp();
}

/* ---------- ВРАГИ ---------- */
function spawnEnemy(type, x, y, ang, isSplit) {
  const def = ENEMIES[type];
  if (!def) return null;
  const sc = enemyScale(G.wave, G.diff);
  const hpMul = isSplit ? 0.6 : 1;
  const hp = Math.round(def.hp * sc.hp * hpMul);
  const e = {
    type, def, x, y, r: def.r,
    hp, maxHp: hp,
    speed: def.speed * sc.speed * rand(0.92, 1.08),
    atk: def.atk * sc.dmg,
    gold: def.gold * sc.gold,
    armor: def.armor || 0,
    shieldHp: def.shield ? def.shield * sc.hp * 0.8 : 0,
    shieldMax: def.shield ? def.shield * sc.hp * 0.8 : 0,
    shieldT: 0, shieldDelay: def.shieldDelay || 3, shieldRegen: def.shieldRegen || 0,
    flash: 0, slowT: 0, slowAmt: 0, fieldSlow: 0, healAcc: 0,
    burnT: 0, burnDps: 0,
    atkCd: rand(0, 0.5), cd: rand(0.5, 2),
    ang: ang === undefined ? Math.atan2(-y, -x) : ang,
    wob: rand(0, TAU), dead: false, boss: false,
    zigT: rand(0, 2), zigDir: chance(0.5) ? 1 : -1,
    spawnT: isSplit ? 0 : 0.45
  };
  if (isSplit && G && G.state === 'wave') {
    G.waveCount = (G.waveCount || 0) + 1;  // осколки/призыв тоже входят в счётчик волны
    if (G.waveTimedOut) e.flee = true;     // после лимита времени новые враги сразу отступают
  }
  G.enemies.push(e);
  return e;
}

function spawnBoss(type) {
  const def = BOSSES[type];
  const sc = enemyScale(G.wave, G.diff);
  const bossWaveMul = 1 + Math.max(0, (G.wave / 5 - 1)) * 0.5;
  const hp = Math.round(def.hp * sc.hp * 0.44 * bossWaveMul);
  const a = rand(0, TAU);
  const e = {
    type, def, x: Math.cos(a) * SPAWN_R, y: Math.sin(a) * SPAWN_R, r: def.r,
    hp, maxHp: hp, speed: def.speed * sc.speed, atk: def.atk * sc.dmg,
    gold: def.gold * sc.gold, armor: def.armor || 0,
    shieldHp: 0, shieldMax: 0, shieldT: 0, shieldDelay: 3, shieldRegen: 0,
    flash: 0, slowT: 0, slowAmt: 0, fieldSlow: 0, healAcc: 0, burnT: 0, burnDps: 0,
    atkCd: 0, cd: 2, ang: a + Math.PI, wob: rand(0, TAU), dead: false, boss: true,
    chargeT: 0, chargeCd: def.chargeCd || 4, chargeDir: 0, stompCd: 3,
    spawnT: 0, zigT: 0, zigDir: 1, spawnT0: 0
  };
  e.spawnT = 1.0;
  G.enemies.push(e);
  G.bossAlive = e;
  UI.showBoss(e);
  Sfx.bossWarn();
  UI.banner('⚠ БОСС ⚠', def.name, def.color);
  return e;
}

function updateEnemies(dt) {
  const T = G.tower;
  const list = G.enemies;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e.dead) { list.splice(i, 1); continue; }
    if (e.flee) {   // отступление по лимиту волны: бегут от башни и покидают арену
      const fdx = e.x - T.x, fdy = e.y - T.y;
      const fd = Math.hypot(fdx, fdy) || 1;
      e.x += fdx / fd * e.speed * 1.7 * dt;
      e.y += fdy / fd * e.speed * 1.7 * dt;
      e.ang = Math.atan2(fdy, fdx);
      if (fd > SPAWN_R + 80) { e.dead = true; list.splice(i, 1); }
      continue;
    }
    if (e.spawnT > 0) { e.spawnT -= dt; }

    // эффекты
    if (e.flash > 0) e.flash -= dt;
    if (e.healAcc > 0) e.healAcc = Math.max(0, e.healAcc - e.maxHp * HEAL_CAP * dt);   // «остывание» полученного лечения
    if (e.burnT > 0) {
      e.burnT -= dt;
      damageEnemy(e, e.burnDps * dt, null);
      if (chance(dt * 8)) spark(e.x + rand(-e.r, e.r), e.y + rand(-e.r, e.r), '#ff8844', 1);
      if (e.dead) { list.splice(i, 1); continue; }
    }
    if (e.slowT > 0) e.slowT -= dt;
    if (e.shieldMax > 0) {
      if (e.shieldT > 0) e.shieldT -= dt;
      else e.shieldHp = Math.min(e.shieldMax, e.shieldHp + e.shieldRegen * dt);
    }

    const slow = 1 - clamp(Math.max(e.slowT > 0 ? e.slowAmt : 0, e.fieldSlow), 0, 0.85);
    e.fieldSlow = 0;
    const spd = e.speed * slow * (e.spawnT > 0 ? 0.35 : 1);

    const dx = T.x - e.x, dy = T.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    e.wob += dt * 6;

    if (e.boss) { updateBoss(e, dt, nx, ny, d, spd); }
    else if (e.def.ai === 'ranged') {
      const pref = e.def.pref || 240;
      if (d > pref + 12) { e.x += nx * spd * dt; e.y += ny * spd * dt; }
      else if (d < pref - 40) { e.x -= nx * spd * dt * 0.6; e.y -= ny * spd * dt * 0.6; }
      else { e.x += -ny * spd * dt * 0.25 * (e.wob % 2 < 1 ? 1 : -1); e.y += nx * spd * dt * 0.25 * (e.wob % 2 < 1 ? 1 : -1); }
      e.cd -= dt;
      if (e.cd <= 0 && d < pref + 90) {
        e.cd = e.def.cd;
        if (e.def.summon) {
          const a = rand(0, TAU);
          spawnEnemy(e.def.summon, e.x + Math.cos(a) * 22, e.y + Math.sin(a) * 22, a, true);
          ring(e.x, e.y, 30, e.def.color, 0.4);
          Sfx.tone(400, 0.15, 'sine', 0.06, 700);
        } else if (e.def.heal) {
          // Знахарь лечит ОДНОГО самого побитого союзника в радиусе, а не всех
          // разом; входящее лечение на цель ограничено (см. HEAL_CAP и затухание
          // healAcc в updateEnemies). Иначе толпа знахарей лечит друг друга
          // быстрее, чем башня снимает HP — волну невозможно закончить.
          let target = null, worst = 1;
          for (const o of G.enemies) {
            if (o === e || o.dead || o.hp >= o.maxHp) continue;
            if (dist(o.x, o.y, e.x, e.y) >= e.def.healR) continue;
            const frac = o.hp / o.maxHp;
            if (frac < worst) { worst = frac; target = o; }
          }
          if (target) {
            const want = e.def.heal * enemyScale(G.wave, G.diff).hp;
            const room = target.maxHp * HEAL_CAP - (target.healAcc || 0);
            const h = Math.min(want, Math.max(0, room));
            if (h > 0.01) {
              target.hp = Math.min(target.maxHp, target.hp + h);
              target.healAcc = (target.healAcc || 0) + h;
            }
            spark(target.x, target.y, '#9dff8a', 3);
            ring(target.x, target.y, target.r + 12, '#9dff8a', 0.35);
          }
        } else {
          enemyShoot(e, nx, ny);
        }
      }
      e.ang = Math.atan2(ny, nx);
    } else if (e.def.ai === 'suicide') {
      e.x += nx * spd * dt; e.y += ny * spd * dt;
      if (d < T.r + e.r + 4) {
        const boom = e.def.boom * enemyScale(G.wave, G.diff).dmg;
        ring(e.x, e.y, e.def.boom, '#ff6b3d', 0.5);
        burst(e.x, e.y, 24, '#ff9944', 180);
        shake(12); Sfx.boom();
        if (dist(e.x, e.y, T.x, T.y) < e.def.boom + T.r) applyTowerDamage(boom, e.x, e.y);
        for (const s of G.structs) if (!s.dead && dist(e.x, e.y, s.x, s.y) < e.def.boom + s.r) damageStruct(s, boom * 1.5);
        dropCoins(e.x, e.y, Math.max(1, Math.round(e.gold * G.S.goldMult)), 1);
        e.dead = true; G.waveKilled++; G.stats.kills++; SAVE.stats.kills++; markSave();
        list.splice(i, 1); continue;
      }
      if (chance(dt * 12)) spark(e.x + rand(-4, 4), e.y + rand(-4, 4), '#ff6b3d', 1);
      e.ang = Math.atan2(ny, nx);
    } else {
      // ближний бой: идёт к башне, но может быть заблокирован постройкой
      let blocked = null;
      if (!e.def.fly) {
        for (const s of G.structs) {
          if (s.dead || s.key === 'mine' || s.key === 'cryo') continue;
          if (dist(e.x, e.y, s.x, s.y) < s.r + e.r + 2) { blocked = s; break; }
        }
      }
      // крио-поля замедляют
      if (!e.def.fly) {
        for (const s of G.structs) {
          if (s.dead || s.key !== 'cryo') continue;
          if (dist(e.x, e.y, s.x, s.y) < s.def.range + e.r) e.fieldSlow = Math.max(e.fieldSlow, s.def.slow);
        }
      }
      if (blocked) {
        e.atkCd -= dt;
        if (e.atkCd <= 0) {
          e.atkCd = 1.05;
          damageStruct(blocked, e.atk);
          spark(blocked.x, blocked.y, '#ffd23f', 4);
          if (blocked.hp <= 0) { blocked = null; }
        }
        e.ang = Math.atan2(blocked ? blocked.y - e.y : ny, blocked ? blocked.x - e.x : nx);
      } else if (d > T.r + e.r - 2) {
        let mx = nx, my = ny;
        if (e.def.zig) {
          e.zigT -= dt;
          if (e.zigT <= 0) { e.zigT = rand(0.5, 1.2); e.zigDir *= -1; }
          const p = -ny * e.zigDir * 0.55, q = nx * e.zigDir * 0.55;
          mx = nx + p; my = ny + q;
          const l = Math.hypot(mx, my) || 1; mx /= l; my /= l;
        }
        e.x += mx * spd * dt; e.y += my * spd * dt;
        e.ang = Math.atan2(my, mx);
      } else {
        e.atkCd -= dt;
        if (e.atkCd <= 0) {
          e.atkCd = 1.05;
          applyTowerDamage(e.atk, e.x, e.y);
          spark(e.x, e.y, '#ff6b7a', 5);
        }
        e.ang = Math.atan2(ny, nx);
      }
    }

    // мины
    if (!e.def.fly) {
      for (const s of G.structs) {
        if (s.dead || s.key !== 'mine') continue;
        if (dist(e.x, e.y, s.x, s.y) < s.def.trigR + e.r * 0.6) { mineExplode(s); break; }
      }
    }

    // расталкивание
    for (let j = i - 1; j >= 0; j--) {
      const o = list[j];
      if (o.dead) continue;
      if (!!o.def.fly !== !!e.def.fly) continue;
      const ddx = e.x - o.x, ddy = e.y - o.y;
      const dd = Math.hypot(ddx, ddy);
      const minD = (e.r + o.r) * 0.86;
      if (dd > 0.001 && dd < minD) {
        const push = (minD - dd) * 0.5;
        const px = ddx / dd * push, py = ddy / dd * push;
        const wO = o.boss ? 0.1 : 1, wE = e.boss ? 0.1 : 1;
        e.x += px * wO; e.y += py * wO;
        o.x -= px * wE; o.y -= py * wE;
      }
    }

    // не пускаем внутрь башни (иначе их не достать снарядами)
    const dT = Math.hypot(e.x - T.x, e.y - T.y);
    const minD = T.r + e.r * 0.8;
    if (dT < minD && dT > 0.0001) {
      e.x = T.x + (e.x - T.x) / dT * minD;
      e.y = T.y + (e.y - T.y) / dT * minD;
    }
    // не выпускаем за арену
    const cd2 = Math.hypot(e.x, e.y);
    const maxD = e.def.fly ? SPAWN_R + 40 : SPAWN_R + 40;
    if (cd2 > maxD) { e.x *= maxD / cd2; e.y *= maxD / cd2; }
  }
}

function enemyShoot(e, nx, ny) {
  const sc = enemyScale(G.wave, G.diff);
  const dmg = (e.def.atk || 6) * sc.dmg * 1.1;
  const speed = 210;
  const mk = (ang) => G.eBullets.push({
    x: e.x + Math.cos(ang) * (e.r + 4), y: e.y + Math.sin(ang) * (e.r + 4),
    vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: 6, dmg, life: 4, color: e.def.color
  });
  mk(Math.atan2(ny, nx));
  Sfx.tone(320, 0.1, 'sawtooth', 0.05, 160);
}

function updateBoss(e, dt, nx, ny, d, spd) {
  const def = e.def;
  if (def.chargeCd) {
    e.chargeCd -= dt;
    if (e.chargeT > 0) {
      e.chargeT -= dt;
      e.x += Math.cos(e.chargeDir) * spd * 5.2 * dt;
      e.y += Math.sin(e.chargeDir) * spd * 5.2 * dt;
      if (chance(dt * 30)) spark(e.x + rand(-20, 20), e.y + rand(-20, 20), def.color, 2);
      if (e.chargeT <= 0) {
        // ударная волна в конце рывка
        ring(e.x, e.y, def.stomp.radius, '#ff5566', 0.5);
        shake(14); Sfx.boom();
        if (dist(e.x, e.y, G.tower.x, G.tower.y) < def.stomp.radius + G.tower.r) applyTowerDamage(def.stomp.dmg * enemyScale(G.wave, G.diff).dmg, e.x, e.y);
        for (const s of G.structs) if (!s.dead && dist(e.x, e.y, s.x, s.y) < def.stomp.radius + s.r) damageStruct(s, def.stomp.dmg * 2);
      }
    } else if (e.chargeCd <= 0 && d < 420) {
      e.chargeCd = def.chargeCd * rand(0.85, 1.2);
      e.chargeT = 0.75;
      e.chargeDir = Math.atan2(ny, nx);
      UI.toast2('Крушитель готовится к рывку!');
      Sfx.tone(120, 0.5, 'sawtooth', 0.1, 300);
    }
  }
  if (def.summon) {
    e.spawnT0 = (e.spawnT0 || 0) - dt;
    if (e.spawnT0 <= 0) {
      e.spawnT0 = def.summonCd;
      const n = def.summonN || 1;
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        spawnEnemy(def.summon, e.x + Math.cos(a) * (e.r + 10), e.y + Math.sin(a) * (e.r + 10), a, true);
      }
      ring(e.x, e.y, e.r + 26, def.color, 0.45);
      Sfx.tone(300, 0.2, 'sine', 0.07, 520);
    }
  }
  if (def.ranged) {
    const pref = def.pref;
    if (d > pref + 20) { e.x += nx * spd * dt; e.y += ny * spd * dt; }
    else if (d < pref - 60) { e.x -= nx * spd * dt * 0.7; e.y -= ny * spd * dt * 0.7; }
    else { const a = Math.atan2(ny, nx) + Math.PI / 2; e.x += Math.cos(a) * spd * dt * 0.5; e.y += Math.sin(a) * spd * dt * 0.5; }
    e.cd -= dt;
    if (e.cd <= 0) {
      e.cd = def.cd;
      const base = Math.atan2(ny, nx);
      const sc = enemyScale(G.wave, G.diff);
      for (let i = 0; i < def.spread; i++) {
        const a = base + (i - (def.spread - 1) / 2) * 0.22;
        G.eBullets.push({
          x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r,
          vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, r: 7,
          dmg: def.boltDmg * sc.dmg, life: 4.5, color: '#9fe8ff'
        });
      }
      Sfx.tone(500, 0.14, 'square', 0.06, 200);
    }
  } else {
    // обычный подход к башне
    let blocked = null;
    if (!def.fly) {
      for (const s of G.structs) {
        if (s.dead || s.key === 'mine' || s.key === 'cryo') continue;
        if (dist(e.x, e.y, s.x, s.y) < s.r + e.r + 2) { blocked = s; break; }
      }
    }
    if (blocked) {
      e.atkCd -= dt;
      if (e.atkCd <= 0) { e.atkCd = def.atkCd || 1.5; damageStruct(blocked, e.atk); spark(blocked.x, blocked.y, '#ffd23f', 5); }
    } else if (d > G.tower.r + e.r - 2) {
      e.x += nx * spd * dt; e.y += ny * spd * dt;
    } else {
      e.atkCd -= dt;
      if (e.atkCd <= 0) { e.atkCd = def.atkCd || 1.5; applyTowerDamage(e.atk, e.x, e.y); }
    }
  }
  e.ang = Math.atan2(ny, nx);
}

/* ---------- СНАРЯДЫ БАШНИ ---------- */
function fireTower() {
  const S = G.S, T = G.tower;
  const target = acquireTarget();
  if (!target) return false;
  const baseAng = Math.atan2(target.y - T.y, target.x - T.x);
  T.angle = baseAng;
  const n = Math.max(1, Math.round(S.projectiles));
  const spread = n === 1 ? 0 : 0.115;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * spread + rand(-0.02, 0.02);
    const a = baseAng + off;
    const crit = chance(S.crit);
    let dmg = S.dmg * (crit ? S.critMult : 1);
    if (S.fury > 0 && T.hp < T.maxHp * 0.5) dmg *= 1 + S.fury;   // лаборатория: «Ярость ядра»
    const muzzle = T.r * 0.45;
    G.bullets.push({
      x: T.x + Math.cos(a) * muzzle, y: T.y + Math.sin(a) * muzzle,
      vx: Math.cos(a) * S.projSpeed, vy: Math.sin(a) * S.projSpeed,
      r: crit ? 6 : 4.6, dmg, crit, pierce: S.pierce, hit: [], rico: S.ricochet,
      life: (S.range + 120) / S.projSpeed, ang: a, kind: 'shot',
      color: crit ? '#ffd23f' : '#8ff0ff'
    });
  }
  T.recoil = 1;
  T.pulse = 1;
  spark(T.x + Math.cos(baseAng) * (T.r + 14), T.y + Math.sin(baseAng) * (T.r + 14), '#bff4ff', 3);
  if (S.dmg > 40) Sfx.shootHeavy(); else Sfx.shoot();
  return true;
}

function acquireTarget() {
  const S = G.S, T = G.tower;
  const R = S.range;
  if (G.focus && !G.focus.dead) {
    if (dist(G.focus.x, G.focus.y, T.x, T.y) <= R + G.focus.r) return G.focus;
  } else if (G.focus) G.focus = null;
  let best = null, bestVal = null;
  for (const e of G.enemies) {
    if (e.dead || e.spawnT > 0.2) continue;
    const d = dist(e.x, e.y, T.x, T.y);
    if (d > R + e.r) continue;
    let v;
    if (G.targetMode === 0) v = d;
    else if (G.targetMode === 1) v = -(e.hp + (e.shieldHp || 0) + (e.boss ? 1e6 : 0));
    else v = e.hp + (e.shieldHp || 0) - (e.boss ? 1e6 : 0);
    if (bestVal === null || v < bestVal) { bestVal = v; best = e; }
  }
  return best;
}

function updateBullets(dt) {
  const S = G.S;
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    if (b.kind === 'missile' && b.target && !b.target.dead) {
      const a = Math.atan2(b.target.y - b.y, b.target.x - b.x);
      const cur = Math.atan2(b.vy, b.vx);
      let da = a - cur;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      const na = cur + clamp(da, -6 * dt, 6 * dt);
      const sp = Math.hypot(b.vx, b.vy) + 260 * dt;
      b.vx = Math.cos(na) * Math.min(sp, 620);
      b.vy = Math.sin(na) * Math.min(sp, 620);
      b.ang = na;
    }
    b.life -= dt;
    if (chance(dt * 22)) spark(b.x, b.y, b.color, 1, 22);

    let exploded = false;
    // движение подшагами: быстрый снаряд не пролетает сквозь врага
    const stepLen = Math.hypot(b.vx, b.vy) * dt;
    const sub = clamp(Math.ceil(stepLen / 9), 1, 8);
    for (let q = 0; q < sub && !exploded; q++) {
      b.x += b.vx * dt / sub; b.y += b.vy * dt / sub;
      exploded = bulletCollide(b, S);
    }
    if (exploded || b.life <= 0 || Math.hypot(b.x, b.y) > SPAWN_R + 90) {
      if (!exploded && S.split > 0 && b.kind === 'shot') splitBullet(b);
      else if (!exploded && b.kind === 'shot') spark(b.x, b.y, b.color, 3, 40);
      G.bullets.splice(i, 1);
    }
  }
}

/* Проверка попадания одного снаряда (один подшаг). Возвращает true, если снаряд исчез. */
function bulletCollide(b, S) {
  {
    for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0.25) continue;
      if (b.hit.indexOf(e) >= 0) continue;
      if (dist(b.x, b.y, e.x, e.y) < e.r + b.r) {
        b.hit.push(e);
        damageEnemy(e, b.dmg, b, b.color);
        applyOnHit(e, b);
        if (b.kind === 'missile') {
          aoe(b.x, b.y, 62, b.dmg * 0.7, '#ffb066');
          ring(b.x, b.y, 62, '#ffb066', 0.35);
          burst(b.x, b.y, 14, '#ff9944', 130);
          Sfx.smallBoom(); shake(3);
          return true;
        }
        if (S.explode > 0) {
          aoe(b.x, b.y, S.explode, b.dmg * S.explodeMul, '#ffb066');
          ring(b.x, b.y, S.explode, '#ff9944', 0.3);
          burst(b.x, b.y, 10, '#ff9944', 120);
          Sfx.smallBoom();
          return true;
        }
        Sfx.hit();
        // рикошет
        if (b.rico > 0) {
          const nxt = nearestEnemyExcept(b.x, b.y, b.hit, 300);
          if (nxt) {
            b.rico--;
            const a = Math.atan2(nxt.y - b.y, nxt.x - b.x);
            const sp = Math.hypot(b.vx, b.vy);
            b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.ang = a;
            b.life = Math.max(b.life, 0.6);
            spark(b.x, b.y, '#bff4ff', 4);
            continue;
          }
        }
        if (b.pierce > 0) { b.pierce--; b.dmg *= 0.92; }
        else return true;
        break;
      }
    }
  }
  return false;
}

function applyOnHit(e, b) {
  const S = G.S;
  if (S.knock > 0 && !e.boss) {
    const a = b.ang;
    e.x += Math.cos(a) * S.knock * 0.07;
    e.y += Math.sin(a) * S.knock * 0.07;
  }
  if (S.slow > 0) { e.slowT = Math.max(e.slowT, S.slowDur); e.slowAmt = Math.max(e.slowAmt, S.slow); }
  if (S.burn > 0) { e.burnT = Math.max(e.burnT, S.burnDur); e.burnDps = Math.max(e.burnDps, S.burn * (1 + G.S.dmg / 40)); }
  if (S.chain > 0) chainLightning(e, b.dmg * 0.6, S.chain, b);
}

function chainLightning(from, dmg, jumps, b) {
  let cur = from;
  const used = b && b.hit ? b.hit.slice() : [from];
  for (let j = 0; j < jumps; j++) {
    const nxt = nearestEnemyExcept(cur.x, cur.y, used, G.S.chainRange);
    if (!nxt) break;
    used.push(nxt);
    G.arcs.push({ x1: cur.x, y1: cur.y, x2: nxt.x, y2: nxt.y, life: 0.18, max: 0.18 });
    damageEnemy(nxt, dmg, null, '#9fe8ff');
    spark(nxt.x, nxt.y, '#9fe8ff', 4);
    cur = nxt;
    dmg *= 0.75;
  }
  if (jumps > 0) Sfx.tone(1200, 0.07, 'square', 0.045, 400);
}

function nearestEnemyExcept(x, y, exclude, maxR) {
  let best = null, bd = maxR * maxR;
  for (const e of G.enemies) {
    if (e.dead || exclude.indexOf(e) >= 0) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function splitBullet(b) {
  const S = G.S;
  const n = S.split;
  const base = Math.atan2(b.vy, b.vx) + Math.PI;
  for (let i = 0; i < n; i++) {
    const a = base + (i - (n - 1) / 2) * 0.85 + rand(-0.15, 0.15);
    G.bullets.push({
      x: b.x, y: b.y, vx: Math.cos(a) * S.projSpeed * 0.62, vy: Math.sin(a) * S.projSpeed * 0.62,
      r: 3.2, dmg: b.dmg * S.splitMul, crit: false, pierce: 0, hit: [], rico: 0,
      life: 0.55, ang: a, kind: 'shard', color: '#c9a6ff'
    });
  }
  spark(b.x, b.y, '#c9a6ff', 6, 70);
  Sfx.tone(900, 0.06, 'triangle', 0.04, 400);
}

function updateEBullets(dt) {
  const T = G.tower;
  for (let i = G.eBullets.length - 1; i >= 0; i--) {
    const b = G.eBullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (chance(dt * 10)) spark(b.x, b.y, b.color, 1, 18);
    let gone = b.life <= 0 || Math.hypot(b.x, b.y) > SPAWN_R + 60;
    if (!gone && dist(b.x, b.y, T.x, T.y) < T.r + b.r) {
      applyTowerDamage(b.dmg, b.x, b.y);
      gone = true;
    }
    if (!gone) {
      for (const s of G.structs) {
        if (s.dead || s.key === 'mine' || s.key === 'cryo') continue;
        if (dist(b.x, b.y, s.x, s.y) < s.r + b.r) { damageStruct(s, b.dmg); spark(b.x, b.y, b.color, 3); gone = true; break; }
      }
    }
    if (gone) G.eBullets.splice(i, 1);
  }
}

/* ---------- СПЕЦ-СИСТЕМЫ БАШНИ ---------- */
function updateTowerSystems(dt) {
  const S = G.S, T = G.tower;
  T.cd -= dt;
  if (T.recoil > 0) T.recoil = Math.max(0, T.recoil - dt * 6);
  if (T.hitFlash > 0) T.hitFlash -= dt;
  if (S.regen > 0) healTower(S.regen * dt);

  if (G.state === 'wave' || G.enemies.length) {
    if (T.cd <= 0) {
      if (fireTower()) T.cd = 1 / S.fireRate;
      else T.cd = 0.08;
    }
  }
  // плавный доворот башни к цели
  const tgt = acquireTarget();
  if (tgt) {
    const want = Math.atan2(tgt.y - T.y, tgt.x - T.x);
    let da = want - T.angle;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    T.angle += clamp(da, -9 * dt, 9 * dt);
  }

  // ауры
  if (S.slowAura > 0 || S.burnAura > 0) {
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (dist(e.x, e.y, T.x, T.y) < S.auraRadius + e.r) {
        if (S.slowAura > 0) { e.fieldSlow = Math.max(e.fieldSlow, S.slowAura); }
        if (S.burnAura > 0) { e.burnT = Math.max(e.burnT, 0.35); e.burnDps = Math.max(e.burnDps, S.burnAura); }
      }
    }
  }
  // орбитальные клинки
  if (S.orbitals > 0) {
    G.orbitCd += dt * S.orbitalSpeed;
    for (let i = 0; i < S.orbitals; i++) {
      const a = G.orbitCd + (i / S.orbitals) * TAU;
      const ox = T.x + Math.cos(a) * S.orbitalRadius, oy = T.y + Math.sin(a) * S.orbitalRadius;
      for (const e of G.enemies) {
        if (e.dead || e.orbCd > 0) continue;
        if (dist(e.x, e.y, ox, oy) < e.r + 12) {
          e.orbCd = 0.45;
          damageEnemy(e, S.orbitalDmg * (1 + G.wave * 0.03), null, '#bff4ff');
          spark(ox, oy, '#bff4ff', 5);
          Sfx.tone(760, 0.05, 'triangle', 0.04, 420);
        }
      }
    }
  }
  for (const e of G.enemies) if (e.orbCd > 0) e.orbCd -= dt;

  // ракеты
  if (S.missiles > 0) {
    G.missileCd -= dt;
    if (G.missileCd <= 0 && G.enemies.length) {
      const t = acquireTarget() || G.enemies[0];
      if (t) {
        G.missileCd = S.missileCd;
        for (let i = 0; i < S.missiles; i++) {
          const a = rand(0, TAU);
          G.bullets.push({
            x: T.x + Math.cos(a) * 18, y: T.y + Math.sin(a) * 18,
            vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, r: 5.5,
            dmg: S.missileDmg * (1 + G.wave * 0.04), crit: false, pierce: 0, hit: [], rico: 0,
            life: 3.2, ang: a, kind: 'missile', color: '#ffb066', target: t
          });
        }
        Sfx.tone(420, 0.18, 'sawtooth', 0.06, 900);
      }
    }
  }
  // импульс-волна
  if (S.shockCd > 0) {
    G.shockCd -= dt;
    if (G.shockCd <= 0) {
      G.shockCd = S.shockCd;
      let hitAny = false;
      for (const e of G.enemies) {
        if (e.dead) continue;
        if (dist(e.x, e.y, T.x, T.y) < S.shockRadius + e.r) {
          damageEnemy(e, S.shockDmg * (1 + G.wave * 0.04), null, '#9fe8ff');
          if (!e.boss && S.knock >= 0) {
            const a = Math.atan2(e.y - T.y, e.x - T.x);
            e.x += Math.cos(a) * 16; e.y += Math.sin(a) * 16;
          }
          hitAny = true;
        }
      }
      ring(T.x, T.y, S.shockRadius, '#9fe8ff', 0.45);
      if (hitAny) { Sfx.tone(220, 0.2, 'sine', 0.09, 900); shake(4); }
    }
  }
  // орбитальный удар
  if (G.strike.cd > 0) G.strike.cd -= dt;
}

/* ---------- ПОСТРОЙКИ ---------- */
function updateStructs(dt) {
  const S = G.S;
  for (let i = G.structs.length - 1; i >= 0; i--) {
    const s = G.structs[i];
    if (s.flash > 0) s.flash -= dt;
    if (s.dead || s.hp <= 0) {
      if (s.key !== 'mine') { burst(s.x, s.y, 12, '#99a', 90); }
      G.structs.splice(i, 1);
      UI.renderInv();
      continue;
    }
    if (s.key === 'turret') {
      s.cd -= dt;
      if (s.cd <= 0) {
        let best = null, bd = s.def.range * s.def.range;
        for (const e of G.enemies) {
          if (e.dead || e.spawnT > 0.25) continue;
          const d = dist2(s.x, s.y, e.x, e.y);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          s.cd = 1 / (s.def.fireRate * (1 + 0.04 * G.wave));
          const a = Math.atan2(best.y - s.y, best.x - s.x);
          s.ang = a;
          const dmg = (s.def.dmgBase + S.dmg * s.def.dmgScale) * S.turretMul * (1 + G.wave * 0.05);
          G.bullets.push({
            x: s.x + Math.cos(a) * (s.r + 4), y: s.y + Math.sin(a) * (s.r + 4),
            vx: Math.cos(a) * 430, vy: Math.sin(a) * 430, r: 3.6, dmg,
            crit: false, pierce: 0, hit: [], rico: 0, life: s.def.range / 430 + 0.1,
            ang: a, kind: 'turret', color: '#ffd23f'
          });
          spark(s.x + Math.cos(a) * (s.r + 6), s.y + Math.sin(a) * (s.r + 6), '#ffd23f', 2);
          Sfx.tone(rand(600, 700), 0.04, 'square', 0.028, 260);
        } else s.cd = 0.15;
      }
    }
  }
}

/* ---------- ПИКАПЫ ---------- */
function dropCoins(x, y, total, blobs) {
  const per = total / blobs;
  for (let i = 0; i < blobs; i++) {
    const a = rand(0, TAU), sp = rand(20, 90);
    G.pickups.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      val: Math.max(1, Math.round(per)), t: 0, kind: 'coin', r: 6, spin: rand(0, TAU)
    });
  }
}
function dropHeal(x, y) {
  G.pickups.push({ x, y, vx: rand(-40, 40), vy: rand(-40, 40), val: Math.max(4, Math.round(G.tower.maxHp * 0.07)), t: 0, kind: 'heal', r: 9, spin: 0 });
}

function updatePickups(dt) {
  const T = G.tower, mag = G.S.magnet;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i];
    p.t += dt; p.spin += dt * 6;
    const d = dist(p.x, p.y, T.x, T.y);
    if (p.t > 0.3) {
      const a = Math.atan2(T.y - p.y, T.x - p.x);
      const near = d < mag;
      const sp = near ? 460 : 120;
      const k = 1 - Math.exp(-dt * (near ? 7 : 2.2));
      p.vx = lerp(p.vx, Math.cos(a) * sp, k);
      p.vy = lerp(p.vy, Math.sin(a) * sp, k);
    } else {
      p.vx *= 0.94; p.vy *= 0.94;
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (d < T.r + 8) {
      if (p.kind === 'coin') {
        addCoins(p.val);
        floatText(p.x, p.y - 8, '+' + p.val, '#ffd23f', 12);
        Sfx.coin();
        spark(p.x, p.y, '#ffd23f', 3, 60);
      } else {
        healTower(p.val);
        floatText(p.x, p.y - 8, '+' + p.val + ' HP', '#7bd948', 14);
        Sfx.heal();
        burst(p.x, p.y, 10, '#7bd948', 70);
      }
      G.pickups.splice(i, 1);
    } else if (p.t > 26) G.pickups.splice(i, 1);
  }
}

/* ---------- ЧАСТИЦЫ / ТЕКСТ ---------- */
function spark(x, y, color, n = 4, spd = 90) {
  if (G.parts.length > 620) return;
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(spd * 0.3, spd);
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.16, 0.4), max: 0.4, r: rand(1.2, 2.8), color, kind: 'spark' });
  }
}
function burst(x, y, n, color, spd) {
  if (G.parts.length > 620) n = Math.min(n, 6);
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(spd * 0.25, spd);
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.8), max: 0.8, r: rand(1.6, 4.2), color, kind: 'spark' });
  }
  for (let i = 0; i < Math.min(6, n / 3); i++) {
    const a = rand(0, TAU), s = rand(6, 30);
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 1.1), max: 1.1, r: rand(6, 16), color: '#6b7280', kind: 'smoke' });
  }
}
function ring(x, y, r, color, life) {
  G.parts.push({ x, y, vx: 0, vy: 0, life, max: life, r, color, kind: 'ring' });
}
function floatText(x, y, text, color, size) {
  if (G.texts.length > 70) G.texts.shift();
  G.texts.push({ x, y, text: String(text), color, size: size || 13, life: 0.85, max: 0.85, vy: -34 });
}
function shake(n) { if (SAVE.shake) G.shake = Math.min(26, G.shake + n); }

function updateParticles(dt) {
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i];
    p.life -= dt;
    if (p.life <= 0) { G.parts.splice(i, 1); continue; }
    if (p.kind !== 'ring') {
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = p.kind === 'smoke' ? 0.6 : 3.2;
      p.vx -= p.vx * Math.min(1, dt * k);
      p.vy -= p.vy * Math.min(1, dt * k);
      if (p.kind === 'smoke') p.r += dt * 16;
    } else p.r += dt * 190;
  }
  for (let i = G.texts.length - 1; i >= 0; i--) {
    const t = G.texts[i];
    t.life -= dt;
    if (t.life <= 0) { G.texts.splice(i, 1); continue; }
    t.y += t.vy * dt; t.vy *= 1 - Math.min(1, dt * 2.4);
  }
  for (let i = G.arcs.length - 1; i >= 0; i--) {
    G.arcs[i].life -= dt;
    if (G.arcs[i].life <= 0) G.arcs.splice(i, 1);
  }
}

/* ---------- ВОЛНЫ ---------- */
function startWave() {
  if (G.state !== 'build') return;
  G.wave++;
  G.stats.waves = G.wave;
  const bonus = Math.floor(G.buildT / 3);
  if (bonus > 0 && G.wave > 1) { addCoins(bonus); UI.toast('Быстрый старт: +' + bonus + ' монет'); }
  G.state = 'wave';
  YA.gameplayStart();   // Яндекс Игры: граница геймплея (реклама не мешается)
  G.queue = buildWave(G.wave, G.diff);
  const isBoss = G.wave % 5 === 0;
  if (isBoss) {
    G.queue.unshift({ t: 'boss', at: 1.4, ang: rand(0, TAU) });
    // свита пореже: главная угроза — сам босс
    G.queue = G.queue.filter((q, i) => i === 0 || (q.at > 3.0 && chance(0.45)));
    for (const q of G.queue) if (q !== G.queue[0]) q.at += 1.5;
  }
  G.waveCount = G.queue.length;
  G.waveKilled = 0;
  G.waveT = 0;
  G.waveTimedOut = false;
  G.spawnT = 0;
  G.placing = null;
  G.nextComp = waveComp(G.wave + 1);
  Sfx.waveStart();
  if (isBoss) UI.banner('ВОЛНА ' + G.wave, 'ИДЁТ БОСС', '#ff5566');
  else UI.banner('ВОЛНА ' + G.wave, nextWaveHint(), '#8ff0ff');
  // лавка не закрывается и не сворачивается: во время волны она остаётся
  // открытой (покупки доступны и в бою), ассортимент обновляется в конце волны
  UI.renderShop();
  UI.hudAll();
}

function nextWaveHint() {
  const w = G.wave + 1;
  if (w % 5 === 0) return '⚠ Следующая волна — БОСС';
  const q = buildWave(w, G.diff);
  const counts = {};
  for (const s of q) counts[s.t] = (counts[s.t] || 0) + 1;
  const keys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 3);
  return keys.map(k => ENEMIES[k].name + ' ×' + counts[k]).join('  ·  ');
}

function waveCleared() {
  // серебро за волну НЕ зависит от сложности: одинаково на Обычной и на Аду
  const bonus = Math.round((14 + G.wave * 5) * (G.S.silverMult || 1));
  let farmIncome = 0;
  for (const s of G.structs) {
    if (s.dead || s.key !== 'farm') continue;
    farmIncome += Math.round((s.def.income + G.wave * 2) * G.S.goldMult);
  }
  addCoins(bonus + farmIncome);
  const repair = Math.round(G.tower.maxHp * 0.05);
  if (G.tower.hp > 0) healTower(repair);
  G.state = 'build';
  G.buildT = BUILD_TIME;
  G.rerollsLeft = G.S.rerolls;
  G.rerollsUsed = 0;
  G.nextComp = waveComp(G.wave + 1);
  rollShelf(true);
  if (farmIncome > 0) UI.toast('Золотые жилы принесли +' + farmIncome);
  if (repair > 0 && G.tower.hp < G.tower.maxHp) UI.toast('Полевой ремонт: +' + repair + ' HP');
  UI.banner('ВОЛНА ' + G.wave + ' ОТБИТА', '+' + (bonus + farmIncome) + ' монет', '#5ee08a');
  Sfx.levelup();
  UI.openShop();          // ассортимент обновился (rollShelf выше)
  UI.hudAll();
}

function updateWave(dt) {
  if (G.state !== 'wave') return;
  G.spawnT += dt;
  G.waveT = (G.waveT || 0) + dt;
  // лимит длины волны: спавн_stop, остатки отступают, идёт подготовка к новой
  if (!G.waveTimedOut && G.waveT >= WAVE_TIME_LIMIT) {
    G.waveTimedOut = true;
    G.queue.length = 0;
    for (const e of G.enemies) if (!e.boss && !e.dead) e.flee = true;
    UI.banner('ВРЕМЯ ВОЛНЫ ВЫШЛО', 'враги отступают — готовится новая волна', '#ffcc55');
  }
  while (G.queue.length && G.queue[0].at <= G.spawnT) {
    const s = G.queue.shift();
    if (s.t === 'boss') spawnBoss(bossForWave(G.wave));
    else {
      const x = Math.cos(s.ang) * SPAWN_R, y = Math.sin(s.ang) * SPAWN_R;
      const e = spawnEnemy(s.t, x, y, s.ang + Math.PI);
      if (e) { portal(x, y, e.def.color); }
    }
  }
  if (!G.queue.length && !G.enemies.length) waveCleared();
  
  // Автозакупщик: покупает самое дорогое доступное улучшение (постройки не трогает — их ставит игрок)
  if (G.S.autoBuy) {
    G.autoBuyTimer = (G.autoBuyTimer || 0) + dt;
    // PRO-версия из лаборатории (SAVE.lab) покупает в 2.5 раза чаще
    const interval = (SAVE.lab && SAVE.lab['l_autobuy']) ? 1.2 : 3.0;
    if (G.autoBuyTimer >= interval) {
      G.autoBuyTimer = 0;
      let bestIdx = -1, bestPrice = 0;
      for (let i = 0; i < G.shelf.length; i++) {
        const slot = G.shelf[i];
        if (!slot) continue;
        const def = SHOP_BY_ID[slot.id];
        if (!def || def.kind) continue;                    // постройки и расходники пропускаем
        const lv = G.levels[def.id] || 0;
        if (lv >= def.max) continue;
        const price = shopCost(def, lv, G.wave, G.S.priceMult);
        if (price <= G.purse && price > bestPrice) {       // кошелёк забега — G.purse
          bestPrice = price;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) buyShelf(bestIdx);
    }
  }
  
  UI.hudWave();
  UI.renderEnemies();
}

function portal(x, y, color) {
  ring(x, y, 34, color, 0.5);
  burst(x, y, 8, color, 70);
}

/* ---------- ОРБИТАЛЬНЫЙ УДАР ---------- */
function tryStrike(x, y) {
  if (G.strike.cd > 0) { Sfx.deny(); UI.toast('Орбитальный удар перезаряжается'); return; }
  G.strike.cd = G.S.strikeCd;
  G.strike.aiming = false;
  const dmg = G.S.strikeDmg * (1 + G.S.dmg / 22);
  const r = G.S.strikeRadius;
  // предупреждение и задержка удара
  G.parts.push({ x, y, vx: 0, vy: 0, life: 0.55, max: 0.55, r, color: '#ff5566', kind: 'strikeWarn' });
  const delay = Math.round(550 / clamp(G.speed || 1, 0.5, 5));   // на замедлении удар ждёт дольше в реальном времени
  const fire = () => {
    if (!G || G.state === 'dead') return;
    if (G.state === 'paused') { setTimeout(fire, 150); return; }   // во время паузы удар не падает
    aoe(x, y, r, dmg, '#ffd23f');
    ring(x, y, r, '#ffb066', 0.55);
    ring(x, y, r * 0.6, '#fff3c4', 0.35);
    burst(x, y, 40, '#ff9944', 260);
    G.parts.push({ x, y, vx: 0, vy: 0, life: 0.5, max: 0.5, r: r * 1.6, color: '#ffe6b0', kind: 'beam' });
    shake(20);
    G.flash = 0.4; G.flashColor = '#ffd9a0';
    Sfx.strike();
    UI.hudAbility();
  };
  setTimeout(fire, delay);
  Sfx.tone(1500, 0.5, 'sine', 0.06, 200);
  UI.hudAbility();
}

/* ---------- ГЛАВНЫЙ ЦИКЛ ----------
   Симуляция идёт фиксированными шагами 1/60: скорость ×N просто увеличивает
   число шагов за кадр (без взрыва физики на больших dt). */
let lastT = 0, frameDt = 0.016, simAcc = 0;
const SIM_STEP = 1 / 60;
function frame(ts) {
  requestAnimationFrame(frame);
  if (!lastT) lastT = ts;
  let dt = (ts - lastT) / 1000;
  lastT = ts;
  frameDt = clamp(dt, 0.001, 0.1);
  Sfx.budget = 12;
  if (dt > 0.05) dt = 0.05;
  if (G && G.state !== 'menu') {
    if (G.state === 'paused') {
      simAcc = 0;
    } else {
      const sdt = dt * (G.slowmo || 1) * (G.speed || 1);
      G.time += sdt;
      if (G.state !== 'dead') G.runTime += dt;
      simAcc += sdt;
      let n = 0;
      while (simAcc >= SIM_STEP && n < 12) { update(SIM_STEP, SIM_STEP); simAcc -= SIM_STEP; n++; }
      if (n >= 12) simAcc = 0;   // защита от спирали смерти на очень слабых машинах
    }
  }
  if (G && G.state !== 'menu') { UI.hudHp(); UI.hudAbility(); }   // полоска HP и откат удара живые каждый кадр
  render();
  flushSave();
}

function update(dt, rdt) {
  if (G.state === 'dead') {
    updateParticles(dt);
    if (G.slowmo < 1) G.slowmo = Math.min(1, G.slowmo + rdt * 0.6);
    return;
  }
  if (G.state === 'paused') return;

  if (G.state === 'build') {
    G.buildT -= rdt;
    if (G.buildT <= 0) { G.buildT = 0; startWave(); }
    else if (G.buildT < 6 && Math.floor(G.buildT) !== Math.floor(G.buildT + rdt)) Sfx.tick();
    UI.hudBuild();
  } else if (G.state === 'wave') {
    updateWave(dt);
  }

  updateEnemies(dt);
  updateBullets(dt);
  updateEBullets(dt);
  updateStructs(dt);
  updateTowerSystems(dt);
  updatePickups(dt);
  updateParticles(dt);

  if (G.shake > 0) G.shake = Math.max(0, G.shake - rdt * 42);
  if (G.flash > 0) G.flash = Math.max(0, G.flash - rdt * 1.6);
}

/* ---------- КОНЕЦ ЗАБЕГА ---------- */
function gameOver() {
  if (G.state === 'dead') return;
  G.state = 'dead';
  YA.gameplayStop();
  G.slowmo = 0.25;
  const T = G.tower;
  burst(T.x, T.y, 70, '#ff9944', 320);
  burst(T.x, T.y, 40, '#ffd23f', 220);
  ring(T.x, T.y, 220, '#ff6b3d', 0.9);
  shake(30);
  G.flash = 0.8; G.flashColor = '#ff8855';
  Sfx.gameOver();
  Sfx.boom();

  const reward = bankRunProgress();        // награда и рекорды
  const transfer = bankRunCoins();         // непотраченная добыча забега → в кошелёк
  flushSave();   // критический момент: сейвим сразу, не ждём следующий кадр
  setTimeout(() => UI.showResults(reward, transfer, G.transferSilver || 0), 1200);
}

/* ---------- ВВОД ---------- */
function screenToWorld(sx, sy) {
  const v = G.view;
  return { x: (sx - v.cx) / v.scale, y: (sy - v.cy) / v.scale };
}

function onPointerMove(sx, sy) {
  if (!G) return;
  G.mouse.x = sx; G.mouse.y = sy;
  const w = screenToWorld(sx, sy);
  G.mouse.wx = w.x; G.mouse.wy = w.y;
  G.strike.x = w.x; G.strike.y = w.y;
}

function onPointerDown(sx, sy, btn) {
  if (!G) return;
  Sfx.resume();
  onPointerMove(sx, sy);
  if (G.state === 'dead') return;
  const w = screenToWorld(sx, sy);
  if (btn === 2) { G.placing = null; G.strike.aiming = false; UI.renderInv(); return; }
  if (G.strike.aiming) { tryStrike(w.x, w.y); return; }
  if (G.state === 'wave' || G.state === 'build') {
    const e = enemyAt(w.x, w.y);
    if (e) {
      G.focus = e;
      floatText(e.x, e.y - e.r - 14, 'ЦЕЛЬ!', '#ff8899', 13);
      ring(e.x, e.y, e.r + 10, '#ff5566', 0.4);
      Sfx.tone(880, 0.07, 'square', 0.06, 1200);
      return;
    }
  }
  if (G.placing) {
    if (placeStruct(G.placing, w.x, w.y)) { /* ok */ }
    else { Sfx.deny(); UI.toast('Здесь нельзя строить'); }
    return;
  }
}

function bindInput() {
  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    onPointerMove(e.clientX - r.left, e.clientY - r.top);
  });
  canvas.addEventListener('mousedown', e => {
    const r = canvas.getBoundingClientRect();
    onPointerDown(e.clientX - r.left, e.clientY - r.top, e.button);
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('touchstart', e => {
    if (!e.touches.length) return;
    const r = canvas.getBoundingClientRect();
    const t = e.touches[0];
    onPointerDown(t.clientX - r.left, t.clientY - r.top, 0);
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    if (!e.touches.length) return;
    const r = canvas.getBoundingClientRect();
    const t = e.touches[0];
    onPointerMove(t.clientX - r.left, t.clientY - r.top);
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('keydown', e => {
    if (!G) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (G.state === 'dead') return;
      if (G.strike.cd <= 0) { G.strike.aiming = !G.strike.aiming; UI.hudAbility(); }
      else { Sfx.deny(); UI.toast('Удар перезаряжается'); }
      return;
    }
    if (k === 'q' || k === 'e' || k === 'tab') {
      e.preventDefault();
      cycleTarget(k === 'q' ? -1 : 1);
      return;
    }
    if (k >= '1' && k <= '9') {
      const n = parseInt(k, 10) - 1;
      if (G.state === 'build' || G.state === 'wave') buyShelf(n);
      return;
    }
    if (k === 'r') { if (G.state === 'build' || G.state === 'wave') rerollShelf(); return; }
    if (k === 'f') { cycleSpeed(); return; }
    if (k === 'enter') { if (G.state === 'build') startWave(); return; }
    if (k === 'escape') {
      if (G.placing) { G.placing = null; UI.renderInv(); return; }
      if (G.strike.aiming) { G.strike.aiming = false; UI.hudAbility(); return; }
      if (G.state === 'paused') { togglePause(); return; }   // ESC снимает паузу
      if (UI.modalOpen) return;                              // открытая модалка обрабатывает ESC сама
      if (G.state === 'wave' || G.state === 'build') togglePause();
      return;
    }
    if (k === 'p') {
      if (G.state === 'paused') { togglePause(); return; }
      if (UI.modalOpen) return;
      if (G.state === 'wave' || G.state === 'build') togglePause();
      return;
    }
  });

  window.addEventListener('resize', resize);
  window.addEventListener('blur', () => { if (G && (G.state === 'wave')) togglePause(true); });
}

function enemyAt(x, y) {
  let best = null, bd = 1e9;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const d = dist(x, y, e.x, e.y);
    if (d < e.r + 14 && d < bd) { bd = d; best = e; }
  }
  return best;
}

function cycleTarget(dir) {
  G.targetMode = (G.targetMode + dir + TARGET_MODES.length) % TARGET_MODES.length;
  Sfx.tone(620, 0.05, 'square', 0.05, 900);
  UI.hudTarget();
}

function togglePause(force) {
  if (!G) return;
  if (G.state === 'paused') {
    G.state = G.prevState || 'wave'; UI.closePause();
    if (G.state === 'wave') YA.gameplayStart();
  } else if (G.state === 'wave' || G.state === 'build') {
    G.prevState = G.state; G.state = 'paused'; UI.openPause();
    YA.gameplayStop();
  }
}

/* ---------- РАЗМЕР ---------- */
function resize() {
  if (!canvas) return;
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  if (!G) return;
  const hasUI = (typeof UI !== 'undefined') && UI.panelWidth;
  const panel = hasUI ? UI.panelWidth() : 0;
  const availW = Math.max(320, W - panel);
  const availH = Math.max(320, H - (hasUI ? UI.bottomPad() : 0));
  const phonePortrait = W < 980 && W < H;
  // в портрете арена растягивается почти до краёв экрана (меньше мировой размах)
  const span = phonePortrait ? 1040 : 0;
  const scale = clamp(Math.min(availW / (span || SPAN_X), availH / (span || SPAN_Y)), 0.28, 1.25);
  G.view.scale = scale;
  G.view.cx = panel / 2 + availW / 2;
  // на телефоне в портрете опускаем башню на ~8% высоты: сверху HUD, снизу лавка
  G.view.cy = availH / 2 + (phonePortrait ? H * 0.08 : 0);
}
