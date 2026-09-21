/* =========================================================
   BALANCE: симуляция волн под разными профилями игры
   (башня бессмертна — меряем, сколько урона она «съедает»)
   ========================================================= */
'use strict';
const T = require('./harness.js');
const { api, step, sleep } = T;
api.TEST_GOLD = 0;   // симуляции без тестового банка

const PRIO = {
  dmg: 6, rate: 5.5, multi: 8, pierce: 5, explode: 5, chain: 4.5, crit: 3.4, critdmg: 3,
  split: 3.6, rico: 3, orbit: 3.6, missile: 4, shock: 3.4, burn: 2.8, slow: 2.4, hp: 2.6,
  armor: 2.2, regen: 2.2, range: 2, speed: 1.6, knock: 1.6, aura: 2, scorch: 2, strike: 2,
  vamp: 2.6, gold: 1.6, magnet: 1, turrets: 2.4, discount: 1.8, repair: 0.5
};

function autoShop(mode) {
  const G = api.G;
  if (!G || G.state !== 'build') return;
  if (mode === 'none') return;
  if (mode === 'god') {                       // читаем: всё на максимум
    for (const d of api.SHOP) if (!d.kind) { G.levels[d.id] = d.max; }
    api.recomputeStats(false);
    G.tower.hp = G.tower.maxHp;
    return;
  }
  let guard = 0;
  while (guard++ < 30) {
    let bestI = -1, bestScore = -1;
    G.shelf.forEach((slot, i) => {
      const def = api.SHOP.find(d => d.id === slot.id);
      if (!def) return;
      const lv = G.levels[def.id] || 0;
      if (lv >= def.max) return;
      const price = api.shopCost(def, lv, Math.max(1, G.wave), G.S.priceMult);
      if (price > api.G.purse) return;
      let pr = PRIO[def.id] || 1;
      if (def.id === 'repair') pr = G.tower.hp / G.tower.maxHp < 0.6 ? 9 : 0.2;
      const score = pr * 100 / Math.max(10, price);
      if (score > bestScore) { bestScore = score; bestI = i; }
    });
    if (bestI < 0) {
      // постройки
      const order = mode === 'build' ? ['turret', 'wall', 'cryo', 'mine', 'farm'] : ['turret', 'wall', 'mine', 'cryo', 'farm'];
      let done = false;
      for (const k of order) {
        if (api.countStructs(k) >= api.STRUCTS[k].max) continue;
        const price = api.structCost(k, G.S.priceMult * G.S.buildMul);
        if (price > api.G.purse) continue;
        if (k === 'farm' && G.wave > 10) continue;
        api.buyStruct(k);
        let tries = 0;
        while ((G.inv[k] || 0) > 0 && tries++ < 80) {
          const a = Math.random() * Math.PI * 2, r = 95 + Math.random() * 280;
          api.placeStruct(k, Math.cos(a) * r, Math.sin(a) * r);
        }
        done = true; break;
      }
      if (!done) {
        if (G.tower.hp < G.tower.maxHp * 0.6 && api.G.purse >= api.repairCost()) { api.buyRepair(); continue; }
        break;
      }
      continue;
    }
    api.buyShelf(bestI);
  }
}

async function runProfile(name, mode, maxWave, diff = 0, startCoins = 45) {
  api.SAVE.diff = diff;
  api.SAVE.meta = {};
  api.newRun();
  api.G.purse += startCoins;   // бюджет профиля поверх стартового гранта
  api.UI.hud.classList.remove('hidden');
  api.UI.openShop();
  const G = api.G;
  const rows = [];
  let stop = false;

  for (let w = 1; w <= maxWave && !stop; w++) {
    if (G.state === 'dead') break;
    autoShop(mode);
    if (G.state !== 'build') break;
    api.startWave();
    let dmgTaken = 0, peakEnemies = 0, t = 0, guard = 0, bossMax = 0;
    const hp0 = G.tower.hp;
    const dmgBefore = G.stats.dmg;
    let wavePool = 0;   // суммарный HP пул волны
    while (G.state === 'wave' && guard++ < 60 * 200) {
      const before = G.tower.hp;
      step(1);
      dmgTaken += Math.max(0, before - G.tower.hp);
      G.tower.hp = G.tower.maxHp;            // бессмертная башня: меряем только давление
      t += 1 / 60;
      peakEnemies = Math.max(peakEnemies, G.enemies.length);
      if (G.bossAlive) bossMax = Math.max(bossMax, G.bossAlive.maxHp);
      for (const e of G.enemies) if (!e._counted) { e._counted = true; wavePool += e.maxHp + (e.shieldMax || 0); }
      if (G.strike.cd <= 0 && G.enemies.length > 5 && mode !== 'none') {
        const e = G.enemies.reduce((a, b) => (b.hp > (a ? a.hp : 0) ? b : a), null);
        if (e) api.tryStrike(e.x, e.y);
      }
      if (guard % 40 === 0) await sleep(0);
    }
    if (guard >= 60 * 200) {
      rows.push({ w: G.wave, note: 'ТАЙМАУТ' });
      console.log('  ДИАГНОСТИКА ЗАВИСАНИЯ (волна ' + G.wave + '): врагов ' + G.enemies.length + ', очередь ' + G.queue.length);
      for (const e of G.enemies.slice(0, 14)) {
        console.log('   - ' + e.type.padEnd(9) + ' d=' + Math.round(Math.hypot(e.x, e.y)).toString().padStart(4) +
          ' hp=' + Math.round(e.hp) + '/' + e.maxHp + ' spd=' + Math.round(e.speed) + ' ai=' + e.def.ai +
          (e.def.fly ? ' FLY' : '') + (e.slowT > 0 ? ' SLOW' : ''));
      }
      console.log('   построек: ' + G.structs.map(s2 => s2.key + '(' + Math.round(s2.hp) + 'hp@' + Math.round(Math.hypot(s2.x, s2.y)) + ')').join(', '));
      console.log('   range башни: ' + Math.round(G.S.range) + ', dmg ' + G.S.dmg.toFixed(1) + ', rate ' + G.S.fireRate.toFixed(2) + ', снарядов ' + G.S.projectiles);
      break;
    }
    if (G.state === 'dead') { rows.push({ w: G.wave, note: 'СМЕРТЬ (башня не выдержала бы)', dmgTaken: Math.round(dmgTaken), t }); stop = true; break; }
    rows.push({
      w: G.wave, t: +t.toFixed(1), dmg: Math.round(dmgTaken), peak: peakEnemies,
      hp: G.tower.maxHp, boss: bossMax || '', coins: api.G.purse,
      dps: Math.round((G.stats.dmg - dmgBefore) / Math.max(1, t)), pool: Math.round(wavePool)
    });
    G.tower.hp = Math.max(G.tower.maxHp * 0.35, hp0 - dmgTaken * 0.55); // частично «честно» возвращаем урон
    if (G.tower.hp <= 0) { rows.push({ w: G.wave, note: 'СМЕРТЬ по накопленному урону' }); stop = true; break; }
  }
  console.log('\n### Профиль: ' + name + ' (сложность ' + api.DIFFS[diff].name + ')');
  console.log('волна | время | пик | HP-пул |  DPS  | урон по башне | HP | босс | монет');
  for (const r of rows) {
    if (r.note) { console.log(String(r.w).padStart(5) + ' | ' + r.note); continue; }
    console.log(
      String(r.w).padStart(5) + ' | ' + String(r.t).padStart(5) + ' | ' + String(r.peak).padStart(3) + ' | ' +
      String(r.pool).padStart(6) + ' | ' + String(r.dps).padStart(5) + ' | ' +
      String(r.dmg).padStart(13) + ' | ' + String(r.hp).padStart(4) + ' | ' + String(r.boss || '-').padStart(5) + ' | ' + String(r.coins).padStart(5));
  }
  const last = rows[rows.length - 1];
  console.log('→ дошёл до волны ' + (last && last.w) + ', убийств ' + G.stats.kills);
  return rows;
}

(async function main() {
  console.log('=== БАЛАНСИРОВКА ===');
  await runProfile('ГОЛЫЙ (без покупок)', 'none', 6);
  await runProfile('ОБЫЧНЫЙ игрок', 'smart', 12);
  await runProfile('СТРОИТЕЛЬ (упор на постройки)', 'build', 12);
  await runProfile('ЧИТ (всё максимум)', 'god', 26, 0, 999999);
  console.log('\n(«урон по башне» — сколько HP она потеряла бы за волну при бессмертии; сравните с колонкой HP башни)');
  process.exit(0);
})();
