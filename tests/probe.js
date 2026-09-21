const T = require('./harness.js');
const { api, step, sleep } = T;
api.TEST_GOLD = 0;   // симуляции без тестового банка
const PRIO = { dmg: 6, rate: 5.5, multi: 8, pierce: 5, explode: 5, chain: 4.5, crit: 3.4, critdmg: 3,
  split: 3.6, rico: 3, orbit: 3.6, missile: 4, shock: 3.4, burn: 2.8, slow: 2.4, hp: 2.6, armor: 2.2,
  regen: 2.2, range: 2, speed: 1.6, knock: 1.6, aura: 2, scorch: 2, strike: 2, vamp: 2.6, gold: 1.6,
  magnet: 1, turrets: 2.4, discount: 1.8, repair: 0.5 };
function autoShop() {
  const G = api.G; if (!G || G.state !== 'build') return;
  let guard = 0;
  while (guard++ < 30) {
    let bestI = -1, bestScore = -1;
    G.shelf.forEach((slot, i) => {
      const def = api.SHOP.find(d => d.id === slot.id); if (!def) return;
      const lv = G.levels[def.id] || 0; if (lv >= def.max) return;
      const price = api.shopCost(def, lv, Math.max(1, G.wave), G.S.priceMult);
      if (price > api.G.purse) return;
      let pr = PRIO[def.id] || 1;
      if (def.id === 'repair') pr = G.tower.hp / G.tower.maxHp < 0.6 ? 9 : 0.2;
      const sc = pr * 100 / Math.max(10, price);
      if (sc > bestScore) { bestScore = sc; bestI = i; }
    });
    if (bestI < 0) {
      let done = false;
      for (const k of ['turret','wall','mine','cryo','farm']) {
        if (api.countStructs(k) >= api.STRUCTS[k].max) continue;
        const price = api.structCost(k, G.S.priceMult * G.S.buildMul);
        if (price > api.G.purse) continue;
        if (k === 'farm' && G.wave > 10) continue;
        api.buyStruct(k);
        let tries = 0;
        while ((G.inv[k] || 0) > 0 && tries++ < 80) { const a = Math.random()*6.28, r = 95+Math.random()*280; api.placeStruct(k, Math.cos(a)*r, Math.sin(a)*r); }
        done = true; break;
      }
      if (!done) { if (G.tower.hp < G.tower.maxHp*0.6 && api.G.purse >= api.repairCost()) { api.buyRepair(); continue; } break; }
      continue;
    }
    api.buyShelf(bestI);
  }
}
(async function(){
  api.SAVE.meta = {}; api.SAVE.diff = 0;
  api.newRun(); api.G.purse += 400; api.UI.hud.classList.remove('hidden'); api.UI.openShop();
  const G = api.G;
  for (let w = 1; w <= 40; w++) {
    if (G.state === 'dead') break;
    if (G.state === 'build') { autoShop(); if (G.wave === 12 || G.wave === 20 || G.wave === 28) {
        console.log('волна ' + G.wave + ': монет ' + api.G.purse + ' | hp ' + Math.round(G.tower.hp) + '/' + G.tower.maxHp +
          ' | dmg ' + G.S.dmg.toFixed(0) + ' rate ' + G.S.fireRate.toFixed(1) + ' proj ' + G.S.projectiles + ' pierce ' + G.S.pierce +
          ' armor ' + G.S.armor + ' knock ' + G.S.knock + ' regen ' + G.S.regen.toFixed(1) + ' vamp ' + G.S.lifesteal.toFixed(1) +
          ' shock ' + G.S.shockDmg + ' orbit ' + G.S.orbitals + ' missile ' + G.S.missiles + ' explode ' + G.S.explode +
          ' | построек ' + G.structs.length);
      } api.startWave(); }
    let guard = 0, leak = 0;
    while (G.state === 'wave' && guard++ < 60*180) {
      const before = G.tower.hp; step(1); leak += Math.max(0, before - G.tower.hp);
      if (G.strike.cd <= 0 && G.enemies.length > 6) { const e = G.enemies[0]; api.tryStrike(e.x, e.y); }
      if (guard % 60 === 0) await sleep(0);
    }
    if (G.state === 'dead') { console.log('СМЕРТЬ на волне ' + G.wave + ' (урон за волну ' + Math.round(leak) + ')'); break; }
    if (G.wave % 5 === 0) console.log('  босс-волна ' + G.wave + ' пройдена, урон по башне ' + Math.round(leak) + ', hp ' + Math.round(G.tower.hp) + '/' + G.tower.maxHp);
  }
  console.log('уровни:', JSON.stringify(G.levels));
  process.exit(0);
})();
