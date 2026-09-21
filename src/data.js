/* =========================================================
   DATA: баланс, враги, улучшения забега, мета-улучшения
   ========================================================= */
'use strict';

/* ---------- СЛОЖНОСТИ ----------
   coins — множитель ЗОЛОТА (награда за забег); на серебро забега
   (монеты за убийства и волны) множители сложности НЕ влияют. */
const DIFFS = [
  { id: 4, name: 'Лёгкая',  hp: 0.70, dmg: 0.70, count: 0.85, speed: 0.95, coins: 0.5, req: null, unlockReq: '', color: '#9fe8ff' },
  { id: 0, name: 'Обычная', hp: 1.00, dmg: 1.00, count: 1.00, speed: 1.00, coins: 1.0, req: null, unlockReq: '', color: '#5ee08a' },
  { id: 1, name: 'Сложная', hp: 1.55, dmg: 1.35, count: 1.20, speed: 1.08, coins: 1.8, req: { diff: 0, waves: 10 }, unlockReq: '10 волн на Обычной', color: '#ffcc55' },
  { id: 2, name: 'Кошмар',  hp: 2.40, dmg: 1.85, count: 1.40, speed: 1.16, coins: 2.8, req: { diff: 1, waves: 10 }, unlockReq: '10 волн на Сложной', color: '#ff5566' },
  { id: 3, name: 'Ад',      hp: 3.60, dmg: 2.40, count: 1.60, speed: 1.24, coins: 1.5, req: { diff: 2, waves: 10 }, unlockReq: '10 волн на Кошмаре', color: '#ff7a1a' }
];

/* ---------- БАЗОВЫЕ ХАРАКТЕРИСТИКИ БАШНИ ---------- */
const BASE = {
  maxHp: 120, armor: 0, dmgReduce: 0, regen: 0, shield: 0,
  dmg: 13, fireRate: 2.0, projectiles: 1, pierce: 0,
  crit: 0.05, critMult: 2.0, range: 340, projSpeed: 480,
  knock: 0, slow: 0, slowDur: 0, burn: 0, burnDur: 0, silverMult: 1,
  cascade: 0, cascadeDmg: 0, fury: 0, revives: 0, autoBuy: 0,
  chain: 0, chainRange: 140, explode: 0, explodeMul: 0.6,
  split: 0, splitMul: 0.45, ricochet: 0, lifesteal: 0,
  goldMult: 1, magnet: 110,
  orbitals: 0, orbitalDmg: 14, orbitalRadius: 100, orbitalSpeed: 2.1,
  missiles: 0, missileDmg: 20, missileCd: 3.4,
  shockCd: 0, shockDmg: 0, shockRadius: 130,
  slowAura: 0, burnAura: 0, auraRadius: 120,
  strikeCd: 20, strikeDmg: 80, strikeRadius: 100,
  turretMul: 1, priceMult: 1, rerolls: 1, startGold: 70, buildMul: 1
};

const statCopy = () => Object.assign({}, BASE);

/* ---------- ВРАГИ ----------
   shape — код отрисовки; fly — игнорирует постройки;
   ranged — держит дистанцию; atk — урон башне/постройке за удар
   --------------------------------------------------------- */
const ENEMIES = {
  crawler:  { name: 'Ползун',      shape: 'blob',   color: '#7bd948', r: 14, hp: 16,  speed: 56,  atk: 6,   gold: 3, wave: 1, ai: 'melee' },
  runner:   { name: 'Скороход',    shape: 'dart',   color: '#ffd23f', r: 12, hp: 11,  speed: 118, atk: 5,   gold: 3, wave: 2, ai: 'melee', zig: 1 },
  tank:     { name: 'Броневик',    shape: 'hex',    color: '#8fa4c8', r: 21, hp: 70,  speed: 33,  atk: 13,  gold: 8, wave: 4, ai: 'melee', armor: 4 },
  spitter:  { name: 'Плевун',      shape: 'spit',   color: '#b06bff', r: 14, hp: 24,  speed: 48,  atk: 6,   gold: 5, wave: 3, ai: 'ranged', pref: 235, cd: 2.0 },
  bomber:   { name: 'Камикадзе',   shape: 'bomb',   color: '#ff6b3d', r: 15, hp: 28,  speed: 88, atk: 22,  gold: 5, wave: 5, ai: 'suicide', boom: 78 },
  splitter: { name: 'Делитель',    shape: 'square', color: '#3fd6c8', r: 17, hp: 34,  speed: 52,  atk: 9,   gold: 5, wave: 6, ai: 'melee', split: 'mini', splitN: 2 },
  mini:     { name: 'Осколок',     shape: 'square', color: '#7ff0e4', r: 10,  hp: 11,  speed: 96,  atk: 4,   gold: 1, wave: 99, ai: 'melee' },
  flyer:    { name: 'Летун',       shape: 'fly',    color: '#59c8ff', r: 13, hp: 19,  speed: 104, atk: 7,   gold: 5, wave: 7, ai: 'melee', fly: true },
  shielder: { name: 'Щитоносец',   shape: 'shield', color: '#ffc76b', r: 17, hp: 36,  speed: 44,  atk: 11,  gold: 8, wave: 8, ai: 'melee', shield: 55, shieldRegen: 12, shieldDelay: 3 },
  summoner: { name: 'Призыватель', shape: 'diamond',color: '#ff5ea8', r: 16, hp: 48,  speed: 38,  atk: 6,   gold: 11, wave: 10, ai: 'ranged', pref: 300, cd: 4.2, summon: 'crawler' },
  healer:   { name: 'Знахарь',     shape: 'healer', color: '#9dff8a', r: 15, hp: 44,  speed: 46,  atk: 6,   gold: 10, wave: 12, ai: 'ranged', pref: 260, cd: 1.0, heal: 9, healR: 130 }
};

/* Боссы (каждые 5 волн) */
const BOSSES = {
  crusher: {
    name: 'КРУШИТЕЛЬ', shape: 'boss1', color: '#ff5566', r: 46, hp: 460, speed: 26, atk: 19, gold: 70,
    ai: 'boss', armor: 7, atkCd: 2.0, chargeCd: 6.0, stomp: { radius: 145, dmg: 12 }, summon: 'crawler', summonCd: 6.5
  },
  brood: {
    name: 'МАТКА', shape: 'boss2', color: '#c86bff', r: 44, hp: 420, speed: 30, atk: 14, gold: 70,
    ai: 'boss', atkCd: 1.7, summon: 'runner', summonCd: 2.6, summonN: 2, eggHp: 1.0, splits: 'splitter'
  },
  storm: {
    name: 'ПОВЕЛИТЕЛЬ БУРИ', shape: 'boss3', color: '#59c8ff', r: 42, hp: 380, speed: 58, atk: 14, gold: 75,
    ai: 'boss', fly: true, atkCd: 1.6, ranged: true, pref: 255, cd: 2.0, spread: 3, boltDmg: 8
  }
};

/* ---------- ГЕНЕРАТОР ВОЛН ---------- */
/* Возвращает список спавнов: [{t: тип, at: время, ang: угол}] */
function buildWave(wave, diff) {
  const D = DIFFS[diff];
  const list = [];
  const ramp = wave < 5 ? 0.7 : 1;
  const count = Math.min(85, Math.round((5 + wave * 1.75 + Math.pow(wave, 1.3) * 0.32) * D.count * ramp));

  // базовые веса типов
  const W0 = {
    crawler: 10, runner: 7, spitter: 5, tank: 3.2, bomber: 4,
    splitter: 4, flyer: 5, shielder: 3.4, summoner: 2.4, healer: 2.2
  };
  const pool = Object.keys(W0).filter(t => ENEMIES[t].wave <= wave);
  const weights = pool.map(t => {
    let w = W0[t];
    const age = wave - ENEMIES[t].wave;           // старые типы чуть реже, новые — чаще
    w *= age <= 2 ? 1.35 : age <= 5 ? 1.0 : 0.72;
    // «тяжёлые» типы не должны занимать всю волну
    if (t === 'tank' || t === 'shielder') w *= clamp(1.4 - wave * 0.012, 0.55, 1.4);
    return { t, w };
  });
  const cap = {};                                  // потолок доли дорогих типов
  for (let i = 0; i < count; i++) {
    let t = weightedPick(weights).t;
    cap[t] = (cap[t] || 0) + 1;
    const maxShare = (t === 'tank' || t === 'shielder' || t === 'summoner' || t === 'healer') ? 0.28 : 1;
    if (cap[t] > count * maxShare) t = 'crawler';
    list.push({ t });
  }

  // тайминг: отряды с разных сторон
  const squads = clamp(2 + Math.floor(wave / 4), 2, 7);
  const squadAngles = [];
  const baseAng = rand(0, TAU);
  for (let i = 0; i < squads; i++) squadAngles.push(baseAng + (i / squads) * TAU + rand(-0.3, 0.3));
  const gap = clamp(0.52 - wave * 0.013, 0.13, 0.52);
  let time = 0.8;
  shuffle(list);
  for (let i = 0; i < list.length; i++) {
    const sq = squadAngles[i % squads];
    list[i].at = time;
    list[i].ang = sq + rand(-0.34, 0.34);
    time += gap * rand(0.7, 1.3);
  }
  return list;
}

function bossForWave(wave) {
  const idx = Math.floor((wave / 5 - 1)) % 3;
  return ['crusher', 'brood', 'storm'][idx];
}

/* Масштабирование HP/урона врага по волне */
function enemyScale(wave, diff) {
  const D = DIFFS[diff];
  return {
    hp: D.hp * Math.pow(1.152, wave - 1) * (1 + wave * 0.008) * (1 + Math.max(0, wave - 10) * 0.035),
    dmg: D.dmg * (1 + (wave - 1) * 0.075) * (1 + Math.max(0, wave - 12) * 0.02),
    speed: D.speed * (1 + Math.min(0.32, (wave - 1) * 0.014)),
    gold: 1 + (wave - 1) * 0.07
  };
}

/* ---------- ПОСТРОЙКИ (ставятся между волнами) ---------- */
const STRUCTS = {
  turret: {
    id: 'turret', name: 'Турель «Оса»', icon: '🔫', cost: 60, hp: 90, r: 16,
    range: 205, fireRate: 1.35, dmgBase: 5, dmgScale: 0.4, max: 10,
    desc: 'Сама стреляет по ближайшим врагам. Урон растёт вместе с уроном башни.'
  },
  mine: {
    id: 'mine', name: 'Мина «Гром»', icon: '💣', cost: 24, hp: 1, r: 12,
    trigR: 36, dmgBase: 35, dmgScale: 3.2, radius: 82, max: 14,
    desc: 'Взрывается, когда враг подходит вплотную. Одноразовая, урон по площади.'
  },
  cryo: {
    id: 'cryo', name: 'Крио-поле', icon: '❄️', cost: 75, hp: 110, r: 18,
    range: 128, slow: 0.38, max: 6,
    desc: 'Замедляет наземных врагов в радиусе. Летунов не берёт.'
  },
  wall: {
    id: 'wall', name: 'Баррикада', icon: '🧱', cost: 36, hp: 340, r: 20, max: 12,
    desc: 'Принимает удар на себя: враги грызут её, пока не сломают. Летуны перелетают.'
  },
  farm: {
    id: 'farm', name: 'Золотая жила', icon: '⛏️', cost: 120, hp: 130, r: 17,
    income: 14, max: 5,
    desc: 'Приносит монеты в конце каждой волны (растёт с номером волны). Уязвима — защищайте!'
  }
};

/* ---------- УЛУЧШЕНИЯ ЗАБЕГА (магазин между волнами) ---------- */
/* apply(S, lv) — lv = сколько раз уже куплено (включая текущую покупку).
   Экономика v2: каждый этап вдвое слабее и вдвое дороже прежнего, зато
   этапов вдвое больше. Мощность полностью прокачанного улучшения не
   изменилась, а цена на той же точке мощности ровно ×2 (рост цены за
   уровень = √прежнего роста, чтобы лесенка цен не улетала в космос).
   Дискретные эффекты (снаряды, пробитие, рикошет, клинки, ракеты,
   прыжки молнии, осколки) дают +1 единицу за каждые 2 уровня — ceil(lv/2). */
const SHOP = [
  { id: 'dmg',       name: 'Острый сердечник', icon: '💢', rarity: 'common', max: 28, cost: 48, grow: 1.15, apply: (S, lv) => { S.dmg *= 1 + 0.09 * lv; }, d: lv => `+${Math.round(9 * lv)}% урона снарядов` },
  { id: 'rate',      name: 'Автоподатчик',     icon: '⚙️', rarity: 'common', max: 24, cost: 56, grow: 1.16, apply: (S, lv) => { S.fireRate *= 1 + 0.075 * lv; }, d: lv => `+${Math.round(7.5 * lv)}% скорострельности` },
  { id: 'multi',     name: 'Доп. ствол',       icon: '🔱', rarity: 'rare',   max: 10, cost: 180, grow: 1.31, apply: (S, lv) => { S.projectiles += Math.ceil(lv / 2); }, d: lv => `+${Math.ceil(lv / 2)} снаряд(а) в залпе (по +1 за 2 ур.)` },
  { id: 'pierce',    name: 'Бронебой',         icon: '🏹', rarity: 'rare',   max: 12, cost: 148, grow: 1.26, apply: (S, lv) => { S.pierce += Math.ceil(lv / 2); }, d: lv => `Снаряд пробивает +${Math.ceil(lv / 2)} врага(ов) (по +1 за 2 ур.)` },
  { id: 'crit',      name: 'Метка снайпера',   icon: '🎯', rarity: 'common', max: 16, cost: 68, grow: 1.18, apply: (S, lv) => { S.crit += 0.03 * lv; }, d: lv => `+${Math.round(3 * lv)}% шанса крита` },
  { id: 'critdmg',   name: 'Хрупкая точка',    icon: '☠️', rarity: 'rare',   max: 12, cost: 88, grow: 1.2,  apply: (S, lv) => { S.critMult += 0.175 * lv; }, d: lv => `Крит наносит x${(BASE.critMult + 0.175 * lv).toFixed(2)}` },
  { id: 'range',     name: 'Оптика',           icon: '🔭', rarity: 'common', max: 12, cost: 56, grow: 1.17, apply: (S, lv) => { S.range *= 1 + 0.075 * lv; }, d: lv => `+${Math.round(7.5 * lv)}% дальности стрельбы` },
  { id: 'speed',     name: 'Ускоритель',       icon: '💨', rarity: 'common', max: 10, cost: 48, grow: 1.16, apply: (S, lv) => { S.projSpeed *= 1 + 0.11 * lv; }, d: lv => `+${Math.round(11 * lv)}% скорости снарядов` },
  { id: 'knock',     name: 'Отдача',           icon: '🌀', rarity: 'common', max: 10, cost: 52, grow: 1.18, apply: (S, lv) => { S.knock += 21 * lv; }, d: lv => `Отбрасывает врагов при попадании (${Math.round(21 * lv)})` },
  { id: 'slow',      name: 'Крио-патроны',     icon: '❄️', rarity: 'rare',   max: 8,  cost: 124, grow: 1.24, apply: (S, lv) => { S.slow = Math.min(0.8, S.slow + 0.11 * lv); S.slowDur = Math.max(S.slowDur, 0.9 + 0.15 * lv); }, d: lv => `Попадание замедляет на ${Math.round(Math.min(80, 11 * lv))}%` },
  { id: 'burn',      name: 'Зажигатель',       icon: '🔥', rarity: 'rare',   max: 10, cost: 116, grow: 1.22, apply: (S, lv) => { S.burn += 3 * lv; S.burnDur = Math.max(S.burnDur, 2.5); }, d: lv => `Поджигает: ${Math.round(3 * lv)} урона/сек 2.5с` },
  { id: 'chain',     name: 'Цепная молния',    icon: '⚡', rarity: 'epic',   max: 8,  cost: 240, grow: 1.32, apply: (S, lv) => { S.chain += Math.ceil(lv / 2); S.chainRange += 7.5 * lv; }, d: lv => `Удар бьёт током ещё ${Math.ceil(lv / 2)} врага(ов) рядом` },
  { id: 'explode',   name: 'Осколочный',       icon: '💥', rarity: 'epic',   max: 8,  cost: 260, grow: 1.34, apply: (S, lv) => { S.explode = Math.max(S.explode, 52 + 7 * lv); S.explodeMul += 0.05 * lv; }, d: lv => `Взрыв при попадании (r=${Math.round(52 + 7 * lv)}, ${Math.round((0.6 + 0.05 * lv) * 100)}% урона)` },
  { id: 'split',     name: 'Расщепление',      icon: '✨', rarity: 'epic',   max: 6,  cost: 220, grow: 1.34, apply: (S, lv) => { S.split += Math.floor(lv / 2) + 1; S.splitMul += 0.025 * lv; }, d: lv => `Снаряд рассыпается на ${Math.floor(lv / 2) + 1} осколк(а/ов)` },
  { id: 'rico',      name: 'Рикошет',          icon: '🔃', rarity: 'rare',   max: 8,  cost: 140, grow: 1.26, apply: (S, lv) => { S.ricochet += Math.ceil(lv / 2); }, d: lv => `Снаряд отскакивает ${Math.ceil(lv / 2)} раз(а) (по +1 за 2 ур.)` },
  { id: 'vamp',      name: 'Наноремонт',       icon: '🩸', rarity: 'rare',   max: 10, cost: 132, grow: 1.26, apply: (S, lv) => { S.lifesteal += lv * 0.25; }, d: lv => `${(lv * 0.25).toFixed(2)} HP башне за каждое убийство` },
  { id: 'armor',     name: 'Бронеплиты',       icon: '🛡️', rarity: 'common', max: 16, cost: 68, grow: 1.2,  apply: (S, lv) => { S.armor += 1.25 * lv; }, d: lv => `-${(1.25 * lv).toFixed(2)} урона от каждого удара` },
  { id: 'regen',     name: 'Регенератор',      icon: '💚', rarity: 'common', max: 10, cost: 88, grow: 1.24, apply: (S, lv) => { S.regen += 0.25 * lv; }, d: lv => `+${(0.25 * lv).toFixed(2)} HP/сек` },
  { id: 'hp',        name: 'Укрепление',       icon: '🏰', rarity: 'common', max: 16, cost: 76, grow: 1.19, apply: (S, lv) => { S.maxHp += 12.5 * lv; }, d: lv => `+${Math.round(12.5 * lv)} к прочности башни` },
  { id: 'orbit',     name: 'Орбитальные клинки', icon: '🗡️', rarity: 'epic', max: 10, cost: 184, grow: 1.26, apply: (S, lv) => { S.orbitals += Math.ceil(lv / 2); S.orbitalDmg += 2 + 4 * lv; }, d: lv => `${Math.ceil(lv / 2)} клинк(а/ов) кружат вокруг башни` },
  { id: 'missile',   name: 'Ракетный блок',    icon: '🚀', rarity: 'epic',   max: 8,  cost: 210, grow: 1.3,  apply: (S, lv) => { S.missiles += Math.ceil(lv / 2); S.missileDmg += 4 + 7 * lv; }, d: lv => `${Math.ceil(lv / 2)} самонаводящ. ракет(ы) каждые ${BASE.missileCd}с` },
  { id: 'shock',     name: 'Импульс-генератор',icon: '📡', rarity: 'epic',   max: 8,  cost: 200, grow: 1.3,  apply: (S, lv) => { S.shockCd = S.shockCd > 0 ? Math.min(S.shockCd, 5.5 - 0.25 * lv) : 5.5 - 0.25 * lv; S.shockDmg += 30 + 10 * lv; S.shockRadius += 2 + 10 * lv; }, d: lv => `Волна каждые ${(5.5 - 0.25 * lv).toFixed(2)}с: ${Math.round(30 + 10 * lv)} урона вокруг` },
  { id: 'aura',      name: 'Поле стужи',       icon: '🌬️', rarity: 'rare',   max: 6,  cost: 160, grow: 1.26, apply: (S, lv) => { S.slowAura += 0.08 * lv; S.auraRadius = Math.max(S.auraRadius, 120 + 11 * lv); }, d: lv => `-${Math.round(8 * lv)}% скорости врагам рядом` },
  { id: 'scorch',    name: 'Выжженная земля',  icon: '🌋', rarity: 'rare',   max: 8,  cost: 168, grow: 1.26, apply: (S, lv) => { S.burnAura += 3.5 * lv; S.auraRadius = Math.max(S.auraRadius, 120 + 11 * lv); }, d: lv => `${Math.round(3.5 * lv)} урона/сек врагам рядом` },
  { id: 'strike',    name: 'Орбитальный удар', icon: '☄️', rarity: 'rare',   max: 12, cost: 110, grow: 1.2,  apply: (S, lv) => { S.strikeCd = Math.max(5, S.strikeCd - 0.8 * lv); S.strikeDmg *= 1 + 0.14 * lv; S.strikeRadius += 4.5 * lv; }, d: lv => { const S = computeStats(G ? G.levels : {}); return `Удар (ПРОБЕЛ): ${Math.round(S.strikeDmg * (1 + 0.14 * lv))} урона, откат ${Math.max(5, S.strikeCd - 0.8 * lv).toFixed(1)}с`; } },
  { id: 'gold',      name: 'Алчность',         icon: '💰', rarity: 'common', max: 12, cost: 72, grow: 1.2,  apply: (S, lv) => { S.goldMult += 0.08 * lv; }, d: lv => `+${Math.round(8 * lv)}% монет с врагов` },
  { id: 'magnet',    name: 'Магнит',           icon: '🧲', rarity: 'common', max: 8,  cost: 48, grow: 1.18, apply: (S, lv) => { S.magnet += 35 * lv; }, d: lv => `Монеты притягиваются с ${Math.round(BASE.magnet + 35 * lv)} px` },
  { id: 'silver',   name: 'Серебряный магнат', icon: '🪙', rarity: 'epic', max: 10, cost: 560, grow: 1.38, apply: (S, lv) => { S.silverMult = 1 + 0.15 * lv; }, d: lv => `×${(1 + 0.15 * lv).toFixed(2)} серебра с врагов и волн (макс ×2.5)` },
  { id: 'turrets',   name: 'Инженер',          icon: '🔧', rarity: 'rare',   max: 8,  cost: 116, grow: 1.24, apply: (S, lv) => { S.turretMul += 0.125 * lv; }, d: lv => `+${Math.round(12.5 * lv)}% урона и прочности построек` },
  { id: 'discount',  name: 'Барыга',           icon: '🏷️', rarity: 'rare',   max: 6,  cost: 140, grow: 1.34, apply: (S, lv) => { S.priceMult *= 1 - 0.06 * lv; }, d: lv => `-${Math.round(6 * lv)}% к ценам в лавке` },
  { id: 'block',     name: 'Тактический щит',  icon: '🛡️', rarity: 'rare',   max: 12, cost: 104, grow: 1.22, apply: (S, lv) => { S.dmgReduce = Math.min(0.6, (S.dmgReduce || 0) + 0.03 * lv); }, d: lv => `-${Math.round(3 * lv)}% получаемого урона (суммируется, общий предел 60%)` },
  { id: 'def_repair', name: 'Экстренный ремонт', icon: '🔧', rarity: 'common', max: 10, cost: 76, grow: 1.2, apply: (S, lv) => { S.regen += 0.2 * lv; S.maxHp += 7.5 * lv; }, d: lv => `+${(0.2 * lv).toFixed(1)} HP/сек и +${Math.round(7.5 * lv)} к прочности` },

  /* --- постройки --- */
  { id: 'b_turret', name: STRUCTS.turret.name, icon: STRUCTS.turret.icon, rarity: 'rare', max: 99, cost: STRUCTS.turret.cost, grow: 1.0, kind: 'build', struct: 'turret', d: () => STRUCTS.turret.desc },
  { id: 'b_mine',   name: STRUCTS.mine.name,   icon: STRUCTS.mine.icon,   rarity: 'common', max: 99, cost: STRUCTS.mine.cost, grow: 1.0, kind: 'build', struct: 'mine', d: () => STRUCTS.mine.desc },
  { id: 'b_cryo',   name: STRUCTS.cryo.name,   icon: STRUCTS.cryo.icon,   rarity: 'rare', max: 99, cost: STRUCTS.cryo.cost, grow: 1.0, kind: 'build', struct: 'cryo', d: () => STRUCTS.cryo.desc },
  { id: 'b_wall',   name: STRUCTS.wall.name,   icon: STRUCTS.wall.icon,   rarity: 'common', max: 99, cost: STRUCTS.wall.cost, grow: 1.0, kind: 'build', struct: 'wall', d: () => STRUCTS.wall.desc },
  { id: 'b_farm',   name: STRUCTS.farm.name,   icon: STRUCTS.farm.icon,   rarity: 'epic', max: 99, cost: STRUCTS.farm.cost, grow: 1.0, kind: 'build', struct: 'farm', d: () => STRUCTS.farm.desc }
];

const SHOP_BY_ID = {};
SHOP.forEach(s => SHOP_BY_ID[s.id] = s);

const RARITY = {
  common: { name: 'обычное',   color: '#9fb4c7', w: 62, glow: 'rgba(159,180,199,.35)' },
  rare:   { name: 'редкое',    color: '#59c8ff', w: 28, glow: 'rgba(89,200,255,.4)' },
  epic:   { name: 'эпическое', color: '#c86bff', w: 10, glow: 'rgba(200,107,255,.45)' }
};

/* ---------- МЕТА-УЛУЧШЕНИЯ (за монеты между забегами) ---------- */
const META = [
  { id: 'm_hp',     name: 'Крепость',       icon: '🏰', max: 8,  cost: 45,  grow: 1.42, d: lv => `+${20 * lv} к прочности башни в начале забега`, apply: (S, lv) => { S.maxHp += 20 * lv; } },
  { id: 'm_dmg',    name: 'Огневая мощь',   icon: '💢', max: 8,  cost: 50,  grow: 1.45, d: lv => `+${9 * lv}% базового урона`, apply: (S, lv) => { S.dmg *= 1 + 0.09 * lv; } },
  { id: 'm_rate',   name: 'Механизмы',      icon: '⚙️', max: 6,  cost: 55,  grow: 1.5,  d: lv => `+${8 * lv}% скорострельности`, apply: (S, lv) => { S.fireRate *= 1 + 0.08 * lv; } },
  { id: 'm_range',  name: 'Дальнобойность', icon: '🔭', max: 5,  cost: 40,  grow: 1.45, d: lv => `+${9 * lv}% дальности`, apply: (S, lv) => { S.range *= 1 + 0.09 * lv; } },
  { id: 'm_crit',   name: 'Точность',       icon: '🎯', max: 6,  cost: 48,  grow: 1.5,  d: lv => `+${3 * lv}% шанса крита`, apply: (S, lv) => { S.crit += 0.03 * lv; } },
  { id: 'm_armor',  name: 'Бронеплиты',   icon: '🛡️', max: 6,  cost: 60,  grow: 1.5,  d: lv => `-${3 * lv} урона от каждого удара`, apply: (S, lv) => { S.armor += 3 * lv; } },
  { id: 'm_def',    name: 'Демпфер урона', icon: '🧿', max: 5,  cost: 90,  grow: 1.6,  d: lv => `-${6 * lv}% получаемого урона (считается до брони)`, apply: (S, lv) => { S.dmgReduce = Math.min(0.6, S.dmgReduce + 0.06 * lv); } },
  { id: 'm_regen',  name: 'Нано-ремонт',    icon: '💚', max: 5,  cost: 52,  grow: 1.52, d: lv => `+${(0.35 * lv).toFixed(2)} HP/сек`, apply: (S, lv) => { S.regen += 0.35 * lv; } },
  { id: 'm_multi',  name: 'Доп. ствол',     icon: '🔱', max: 2,  cost: 320, grow: 2.4,  d: lv => `+${lv} снаряд в залпе с самого начала`, apply: (S, lv) => { S.projectiles += lv; } },
  { id: 'm_gold',   name: 'Стартовый капитал', icon: '💰', max: 5, cost: 65, grow: 1.5, d: lv => `+${40 * lv} монет в начале забега`, apply: (S, lv) => { S.startGold += 40 * lv; } },
  { id: 'm_reroll', name: 'Связи на рынке', icon: '🔄', max: 3,  cost: 90,  grow: 1.7,  d: lv => `+${lv} обновление(й) ассортимента за волну`, apply: (S, lv) => { S.rerolls += lv; } },
  { id: 'm_price',  name: 'Оптовая скидка', icon: '🏷️', max: 4,  cost: 85,  grow: 1.6,  d: lv => `-${7 * lv}% к ценам в лавке забега`, apply: (S, lv) => { S.priceMult *= 1 - 0.07 * lv; } },
  { id: 'm_magnet', name: 'Магнит',         icon: '🧲', max: 4,  cost: 42,  grow: 1.45, d: lv => `+${60 * lv} радиус сбора монет, +${4 * lv}% монет`, apply: (S, lv) => { S.magnet += 60 * lv; S.goldMult += 0.04 * lv; } },
  { id: 'm_strike', name: 'Орбитальный канал', icon: '☄️', max: 4, cost: 75, grow: 1.55, d: lv => `-${12 * lv}% отката и +${18 * lv}% урона орбитального удара`, apply: (S, lv) => { S.strikeCd *= 1 - 0.12 * lv; S.strikeDmg *= 1 + 0.18 * lv; } },
  { id: 'm_shield', name: 'Аварийный щит',  icon: '🔋', max: 3,  cost: 110, grow: 1.75, d: lv => `Стартовый щит ${25 * lv} ед. (вбирает урон первым)`, apply: (S, lv) => { S.shield += 25 * lv; } },
  { id: 'm_build',  name: 'Стройбат',       icon: '🔧', max: 4,  cost: 70,  grow: 1.55, d: lv => `Постройки на ${12 * lv}% дешевле и на ${15 * lv}% прочнее`, apply: (S, lv) => { S.buildMul *= 1 - 0.12 * lv; S.turretMul += 0.15 * lv; } },
  { id: 'm_pierce', name: 'Сквозной канал', icon: '🏹', max: 2,  cost: 260, grow: 2.2,  d: lv => `Снаряды пробивают +${lv} врага(ов)`, apply: (S, lv) => { S.pierce += lv; } },
  { id: 'm_autobuy', name: 'Автозакупщик',  icon: '🤖', max: 1,  cost: 600, grow: 1.0,  d: () => 'Автоматически покупает доступные улучшения в лавке забега во время волны (PRO-версия в лаборатории срабатывает в 2.5 раза чаще)', apply: (S, lv) => { S.autoBuy = lv > 0; } }
];

const META_BY_ID = {};
META.forEach(m => META_BY_ID[m.id] = m);

const metaCost = (m, lv) => Math.round(m.cost * Math.pow(m.grow, lv));

/* ---------- ЛАБОРАТОРИЯ: передовые экспериментальные улучшения ----------
   Зеркало лавки забега: те же эффекты, но ~в 1.5 раза сильнее за уровень
   и ~в 5 раз дороже (цена растёт быстрее). Плюс несколько оригиналов.
   Уровни хранятся в SAVE.lab, работают во всех забегах как META. */
const LAB = [
  { id: 'l_dmg',     name: 'Плазменный сердечник', icon: '💢', max: 8, cost: 120, grow: 1.5,  d: lv => `+${Math.round(27 * lv)}% урона снарядов`, apply: (S, lv) => { S.dmg *= 1 + 0.27 * lv; } },
  { id: 'l_rate',    name: 'Сервопривод подачи',   icon: '⚙️', max: 6, cost: 140, grow: 1.5,  d: lv => `+${Math.round(22 * lv)}% скорострельности`, apply: (S, lv) => { S.fireRate *= 1 + 0.22 * lv; } },
  { id: 'l_multi',   name: 'Кассетный ствол',      icon: '🔱', max: 2, cost: 450, grow: 2.2,  d: lv => `+${lv} снаряд(а) в залпе`, apply: (S, lv) => { S.projectiles += lv; } },
  { id: 'l_pierce',  name: 'Вольфрамовый наконечник', icon: '🏹', max: 4, cost: 370, grow: 1.8, d: lv => `Снаряд пробивает +${lv} врага(ов)`, apply: (S, lv) => { S.pierce += lv; } },
  { id: 'l_crit',    name: 'Квантовый прицел',     icon: '🎯', max: 6, cost: 170, grow: 1.5,  d: lv => `+${Math.round(9 * lv)}% шанса крита`, apply: (S, lv) => { S.crit += 0.09 * lv; } },
  { id: 'l_critdmg', name: 'Точка распада',        icon: '☠️', max: 4, cost: 220, grow: 1.6,  d: lv => `Крит x${(0.5 * lv).toFixed(1)} сверху`, apply: (S, lv) => { S.critMult += 0.5 * lv; } },
  { id: 'l_range',   name: 'Орбитальная оптика',   icon: '🔭', max: 4, cost: 140, grow: 1.5,  d: lv => `+${Math.round(22 * lv)}% дальности`, apply: (S, lv) => { S.range *= 1 + 0.22 * lv; } },
  { id: 'l_speed',   name: 'Рельсовый разгон',     icon: '💨', max: 3, cost: 120, grow: 1.5,  d: lv => `+${Math.round(33 * lv)}% скорости снарядов`, apply: (S, lv) => { S.projSpeed *= 1 + 0.33 * lv; } },
  { id: 'l_knock',   name: 'Импульсные соплa',     icon: '🌀', max: 3, cost: 130, grow: 1.5,  d: lv => `Отброс ${63 * lv} при попадании`, apply: (S, lv) => { S.knock += 63 * lv; } },
  { id: 'l_slow',    name: 'Крио-конденсат',       icon: '❄️', max: 3, cost: 310, grow: 1.6,  d: lv => `Попадания замедляют на ${Math.round(Math.min(80, 33 * lv))}%`, apply: (S, lv) => { S.slow = Math.min(0.8, S.slow + 0.33 * lv); S.slowDur = Math.max(S.slowDur, 1.2 + 0.45 * lv); } },
  { id: 'l_burn',    name: 'Термитная смесь',      icon: '🔥', max: 4, cost: 290, grow: 1.5,  d: lv => `Поджог ${9 * lv} урона/сек`, apply: (S, lv) => { S.burn += 9 * lv; S.burnDur = Math.max(S.burnDur, 3); } },
  { id: 'l_chain',   name: 'Тесла-контур',         icon: '⚡', max: 2, cost: 600, grow: 1.8,  d: lv => `Цепная молния +${lv} прыжка`, apply: (S, lv) => { S.chain += lv; S.chainRange += 22 * lv; } },
  { id: 'l_explode', name: 'Фугасный сердечник',   icon: '💥', max: 3, cost: 650, grow: 1.8,  d: lv => `Взрыв r=${52 + 21 * lv}, +${Math.round(15 * lv)}% урона взрывом`, apply: (S, lv) => { S.explode = Math.max(S.explode, 52 + 21 * lv); S.explodeMul += 0.15 * lv; } },
  { id: 'l_split',   name: 'Кассетный розпуск',    icon: '✨', max: 2, cost: 550, grow: 1.8,  d: lv => `+${lv + 1} осколка при исчерпании`, apply: (S, lv) => { S.split += lv + 1; S.splitMul += 0.075 * lv; } },
  { id: 'l_rico',    name: 'Умный рикошет',        icon: '🔃', max: 3, cost: 350, grow: 1.6,  d: lv => `+${lv} рикошет(а)`, apply: (S, lv) => { S.ricochet += lv; } },
  { id: 'l_vamp',    name: 'Нано-фаги',            icon: '🩸', max: 4, cost: 330, grow: 1.6,  d: lv => `${(0.75 * lv).toFixed(2)} HP за убийство`, apply: (S, lv) => { S.lifesteal += 0.75 * lv; } },
  { id: 'l_armor',   name: 'Композитная броня',    icon: '🛡️', max: 6, cost: 170, grow: 1.5,  d: lv => `-${(3.75 * lv).toFixed(2)} урона от удара`, apply: (S, lv) => { S.armor += 3.75 * lv; } },
  { id: 'l_regen',   name: 'Био-регенератор',      icon: '💚', max: 4, cost: 220, grow: 1.5,  d: lv => `+${(0.75 * lv).toFixed(2)} HP/сек`, apply: (S, lv) => { S.regen += 0.75 * lv; } },
  { id: 'l_hp',      name: 'Усиленный каркас',     icon: '🏰', max: 6, cost: 190, grow: 1.5,  d: lv => `+${38 * lv} к прочности башни`, apply: (S, lv) => { S.maxHp += 38 * lv; } },
  { id: 'l_orbit',   name: 'Клинки-сингулярности', icon: '🗡️', max: 4, cost: 460, grow: 1.7,  d: lv => `${lv} клинк(а), урон 14+${3 + 12 * lv}`, apply: (S, lv) => { S.orbitals += lv; S.orbitalDmg += 3 + 12 * lv; } },
  { id: 'l_missile', name: 'Тяжёлый ракетный блок', icon: '🚀', max: 3, cost: 525, grow: 1.7, d: lv => `${lv} ракет(ы), урон 20+${6 + 21 * lv}`, apply: (S, lv) => { S.missiles += lv; S.missileDmg += 6 + 21 * lv; } },
  { id: 'l_shock',   name: 'Генератор цунами',     icon: '📡', max: 3, cost: 500, grow: 1.7,  d: lv => `Импульс ${(5.5 - 0.75 * lv).toFixed(2)}с: ${30 + 30 * lv} урона`, apply: (S, lv) => { S.shockCd = S.shockCd > 0 ? Math.min(S.shockCd, 5.5 - 0.75 * lv) : 5.5 - 0.75 * lv; S.shockDmg += 30 + 30 * lv; S.shockRadius += 2 + 30 * lv; } },
  { id: 'l_aura',    name: 'Абсолютный ноль',      icon: '🌬️', max: 2, cost: 400, grow: 1.6,  d: lv => `-${Math.round(24 * lv)}% скорости врагам рядом`, apply: (S, lv) => { S.slowAura += 0.24 * lv; S.auraRadius = Math.max(S.auraRadius, 120 + 33 * lv); } },
  { id: 'l_scorch',  name: 'Плазменный котёл',     icon: '🌋', max: 3, cost: 420, grow: 1.6,  d: lv => `${10 * lv} урона/сек врагам рядом`, apply: (S, lv) => { S.burnAura += 10 * lv; S.auraRadius = Math.max(S.auraRadius, 120 + 33 * lv); } },
  { id: 'l_strike',  name: 'Орбитальная батарея',  icon: '☄️', max: 4, cost: 275, grow: 1.6,  d: lv => `Удар: +${Math.round(42 * lv)}% урона, откат -${(2.4 * lv).toFixed(1)}с`, apply: (S, lv) => { S.strikeCd = Math.max(4, S.strikeCd - 2.4 * lv); S.strikeDmg *= 1 + 0.42 * lv; S.strikeRadius += 13 * lv; } },
  { id: 'l_gold',    name: 'Аффинаж серебра',      icon: '💰', max: 4, cost: 180, grow: 1.6,  d: lv => `+${Math.round(24 * lv)}% серебра с врагов`, apply: (S, lv) => { S.goldMult += 0.24 * lv; } },
  { id: 'l_magnet',  name: 'Гравитационный колодец', icon: '🧲', max: 3, cost: 120, grow: 1.5, d: lv => `Магнит +${105 * lv} радиуса`, apply: (S, lv) => { S.magnet += 105 * lv; } },
  { id: 'l_turrets', name: 'Инженерный ИИ',        icon: '🔧', max: 3, cost: 290, grow: 1.6,  d: lv => `+${Math.round(37 * lv)}% урона и прочности построек`, apply: (S, lv) => { S.turretMul += 0.37 * lv; } },
  { id: 'l_discount', name: 'Теневой контракт',    icon: '🏷️', max: 2, cost: 350, grow: 1.8,  d: lv => `-${Math.round(18 * lv)}% к ценам лавки забега`, apply: (S, lv) => { S.priceMult *= 1 - 0.18 * lv; } },
  /* --- блок и ремонт для лаборатории --- */
  { id: 'l_block',   name: 'Тактический барьер',   icon: '🛡️', max: 6, cost: 260, grow: 1.5,  d: lv => `-${Math.round(9 * lv)}% получаемого урона (суммируется, общий предел 60%)`, apply: (S, lv) => { S.dmgReduce = Math.min(0.6, (S.dmgReduce || 0) + 0.09 * lv); } },
  { id: 'l_def_repair', name: 'Нано-ремонтник',    icon: '🔧', max: 5, cost: 190, grow: 1.45, d: lv => `+${(0.6 * lv).toFixed(1)} HP/сек и +${23 * lv} к прочности`, apply: (S, lv) => { S.regen += 0.6 * lv; S.maxHp += 23 * lv; } },
  { id: 'l_autobuy', name: 'Автозакупщик PRO',     icon: '🤖', max: 1, cost: 2250, grow: 1.0, d: lv => lv > 0 ? 'Автоматически покупает доступные улучшения в лавке во время волны (в 2.5 раза чаще обычного)' : 'Включает автопокупку улучшений', apply: (S, lv) => { S.autoBuy = lv > 0; } },
  /* --- оригиналы лаборатории --- */
  { id: 'l_over',    name: 'Перегрузка ядра',      icon: '⚛️', max: 5, cost: 200, grow: 1.7,  d: lv => `+${Math.round(12 * lv)}% темпа, но -${Math.round(2 * lv)}% прочности`, apply: (S, lv) => { S.fireRate *= 1 + 0.12 * lv; S.maxHp = Math.round(S.maxHp * (1 - 0.02 * lv)); } },
  { id: 'l_revive',  name: 'Второе дыхание',       icon: '🧬', max: 2, cost: 900, grow: 2.5,  d: lv => `+${lv} воскрешение(я) за забег (50% HP)`, apply: (S, lv) => { S.revives += lv; } },
  { id: 'l_cascade', name: 'Каскад детонаций',     icon: '💣', max: 3, cost: 480, grow: 1.7,  d: lv => `Смерть врага взрывает область r=${70 + 15 * lv} (${25 + 10 * lv} урона, 1 скачок)`, apply: (S, lv) => { S.cascade = Math.max(S.cascade, 70 + 15 * lv); S.cascadeDmg += 25 + 10 * lv; } },
  { id: 'l_fury',    name: 'Ярость ядра',          icon: '🔥', max: 4, cost: 300, grow: 1.6,  d: lv => `+${Math.round(25 * lv)}% урона, пока HP башни < 50%`, apply: (S, lv) => { S.fury += 0.25 * lv; } }
];

const LAB_BY_ID = {};
LAB.forEach(m => LAB_BY_ID[m.id] = m);

/* ---------- НАБОРЫ ЗОЛОТА ЗА ЯНЫ (Яндекс Игры) ----------
   id должны совпадать с каталогом покупок в консоли разработчика;
   цены в янах задаются там же. */
const YAN_PACKS = [
  { id: 'gold_small',  gold: 1500,  name: 'Мешок золота',   icon: '💰' },
  { id: 'gold_medium', gold: 8000,  name: 'Сундук золота',  icon: '🧰' },
  { id: 'gold_large',  gold: 20000, name: 'Обоз золота',    icon: '🏆' }
];

const labCost = (m, lv) => Math.round(m.cost * Math.pow(m.grow, lv));

/* ---------- РАСЧЁТ ХАРАКТЕРИСТИК ---------- */
function computeStats(runLevels) {
  const S = statCopy();
  for (const m of META) {
    const lv = SAVE.meta[m.id] || 0;
    if (lv > 0) m.apply(S, lv);
  }
  for (const m of LAB) {
    const lv = (SAVE.lab || {})[m.id] || 0;
    if (lv > 0) m.apply(S, lv);
  }
  S.maxHp = Math.round(S.maxHp);
  S.baseMaxHp = S.maxHp;          // HP до внутризабежных улучшений
  for (const id in runLevels) {
    const def = SHOP_BY_ID[id];
    if (def && def.apply) def.apply(S, runLevels[id]);
  }
  // финальные округления
  S.maxHp = Math.round(S.maxHp);
  S.dmg = Math.max(1, S.dmg);
  S.fireRate = Math.max(0.1, S.fireRate);
  S.priceMult = clamp(S.priceMult, 0.4, 1);
  S.buildMul = clamp(S.buildMul, 0.45, 1);
  S.dmgReduce = clamp(S.dmgReduce || 0, 0, 0.6);   // общий предел снижения урона 60% во всех источниках
  S.goldMult = S.goldMult * (S.silverMult || 1);   // серебро забега: алчность × магнат
  return S;
}

/* Цена товара в лавке забега */
function shopCost(def, boughtLv, wave, priceMult) {
  const waveFactor = 1 + Math.max(0, wave - 1) * 0.045;
  return Math.max(5, Math.round(def.cost * Math.pow(def.grow, boughtLv) * priceMult * waveFactor));
}

/* Стоимость постройки с учётом скидок */
function structCost(key, priceMult) {
  return Math.max(5, Math.round(STRUCTS[key].cost * priceMult));
}
