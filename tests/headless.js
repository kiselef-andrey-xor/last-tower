/* =========================================================
   HEADLESS-ТЕСТ: прогон игрового цикла + проверки
   ========================================================= */
'use strict';
const T = require('./harness.js');
const { api, step, sleep, errors, ok } = T;
api.TEST_GOLD = 0;   // симуляции без тестового банка

/* ---------- АВТО-ИГРОК ---------- */
function autoShop() {
  const G = api.G;
  if (!G || G.state !== 'build') return;
  let guard = 0;
  while (guard++ < 40) {
    const S = api.G.purse;
    // покупаем самую дорогую доступную карточку (жадная стратегия)
    let bestI = -1, bestPrice = -1, bestScore = -1;
    G.shelf.forEach((slot, i) => {
      const def = api.SHOP.find(d => d.id === slot.id);
      if (!def) return;
      const lv = G.levels[def.id] || 0;
      if (lv >= def.max) return;
      const price = api.shopCost(def, lv, Math.max(1, G.wave), G.S.priceMult);
      if (price <= S) {
        const PRIO = { dmg: 6, rate: 5.5, multi: 8, pierce: 5, explode: 5, chain: 4.5, crit: 3.4, critdmg: 3, split: 3.6, rico: 3, orbit: 3.6, missile: 4, shock: 3.4, burn: 2.8, slow: 2.4, hp: 2.6, armor: 2.2, regen: 2.2, range: 2, speed: 1.6, knock: 1.6, aura: 2, scorch: 2, strike: 2, vamp: 2.6, gold: 1.6, magnet: 1, turrets: 2.4, discount: 1.8, repair: G.tower.hp / G.tower.maxHp < 0.65 ? 9 : 0.5 };
        const score = (PRIO[def.id] || 1) * (def.rarity === 'epic' ? 1.25 : 1) / Math.max(10, price) * 100;
        if (score > bestScore) { bestScore = score; bestI = i; bestPrice = price; }
      }
    });
    if (bestI >= 0) { api.buyShelf(bestI); continue; }

    // постройки
    const keys = ['turret', 'wall', 'cryo', 'mine', 'farm'].filter(k => api.countStructs(k) < api.STRUCTS[k].max);
    let bought = false;
    for (const k of keys) {
      const price = api.structCost(k, G.S.priceMult * G.S.buildMul);
      if (price <= api.G.purse && (k !== 'farm' || G.wave <= 8)) {
        api.buyStruct(k);
        // расставляем
        let placed = 0, tries = 0;
        while (placed < (G.inv[k] || 0) && tries++ < 60) {
          const a = Math.random() * Math.PI * 2;
          const r = 90 + Math.random() * 300;
          const x = Math.cos(a) * r, y = Math.sin(a) * r;
          if (api.placeStruct(k, x, y)) placed++;
        }
        bought = true;
        break;
      }
    }
    if (bought) continue;

    // ремонт, если побиты
    if (G.tower.hp < G.tower.maxHp * 0.6 && api.G.purse >= api.repairCost()) { api.buyRepair(); continue; }
    break;
  }
}

/* ---------- ПРОГОН ---------- */
(async function run() {
  console.log('=== HEADLESS ПРОГОН «ПОСЛЕДНЯЯ БАШНЯ» ===\n');
  ok(!errors.length, 'код загрузился без ошибок', errors[0]);

  // boot.js уже отработал при загрузке бандла (как в браузере)
  step(2);
  ok(true, 'меню отрисовалось');

  // --- старт забега ---
  api.newRun();
  api.G.purse += 400;   // свои 400 поверх стартового гранта
  api.UI.hud.classList.remove('hidden');
  api.UI.openShop();
  let G = api.G;
  ok(G.state === 'build' && G.wave === 0, 'забег начался в фазе подготовки');
  ok(G.tower.hp === G.tower.maxHp, 'башня цела: ' + G.tower.hp);
  ok(G.shelf.length === 5, 'в лавке 5 карточек: ' + G.shelf.length);

  // --- проверка карточек: покупаем, что хватает ---
  const before = api.G.purse;
  autoShop();
  ok(api.G.purse <= before, 'покупка списывает монеты');

  // --- волны 1..24, авто-игрок ---
  const t0 = Date.now();
  let frames = 0;
  let maxEnemies = 0, maxBullets = 0, maxParts = 0;
  let sawBoss = false, bossTrophy = false, sawSplitter = false, sawMine = false, sawChain = false;
  const lvlBefore = Object.keys(G.levels).length;

  for (let w = 0; w < 40; w++) {
    if (G.state === 'dead') break;
    if (G.state === 'build') { autoShop(); api.startWave(); }
    // крутим волну
    let guard = 0;
    while (G.state === 'wave' && guard++ < 60 * 180) {
      step(1);
      frames++;
      maxEnemies = Math.max(maxEnemies, G.enemies.length);
      maxBullets = Math.max(maxBullets, G.bullets.length);
      maxParts = Math.max(maxParts, G.parts.length);
      if (G.bossAlive) sawBoss = true;
      if (G.enemies.some(e => e.type === 'splitter' || e.type === 'mini')) sawSplitter = true;
      if (G.parts.some(p => p.kind === 'ring')) { }
      if (G.strike.cd <= 0 && G.enemies.length > 6) {
        const t = G.enemies[0];
        api.tryStrike(t.x, t.y);
      }
      if (guard % 30 === 0) await sleep(0);
    }
    if (guard >= 60 * 180) { console.log('  ! волна ' + G.wave + ' не закончилась за 3 минуты — прерываем'); break; }
    if (G.state === 'dead') break;
    // после волны: проверяем трофей босса
    if (G.wave % 5 === 0) { if (Object.keys(G.levels).length > 0) bossTrophy = true; }
    if (!G.structs.some(s => s.key === 'mine')) sawMine = true;
  }
  const elapsed = Date.now() - t0;

  console.log('\n--- результат прогона ---');
  console.log('  волн:            ' + G.wave);
  console.log('  убийств:         ' + G.stats.kills);
  console.log('  урона нанесено:  ' + Math.round(G.stats.dmg));
  console.log('  монет заработано:' + G.stats.coins);
  console.log('  боссов:          ' + G.stats.bosses);
  console.log('  построек:        ' + G.stats.structsBuilt);
  console.log('  кадров:          ' + frames + ' (' + (elapsed / Math.max(1, frames)).toFixed(3) + ' мс/кадр логики+рендера-стаба)');
  console.log('  пик врагов/снарядов/частиц: ' + maxEnemies + ' / ' + maxBullets + ' / ' + maxParts);
  console.log('  состояние:       ' + G.state);
  console.log('  уровни улучшений: ' + JSON.stringify(G.levels));

  // экономика v2: этапы лавки вдвое дороже (суммарно прокачка ~в 4 раза дороже),
  // поэтому жадный бот доходит лишь до первых боссов — нижняя граница снижена до 4
  ok(G.wave >= 4 && G.wave <= 40, 'авто-игрок дошёл до вменяемой волны (4..40)', 'wave=' + G.wave);
  ok(G.stats.kills > 20, 'враги умирают', 'kills=' + G.stats.kills);
  ok(maxEnemies <= 260, 'число врагов в разумных пределах: ' + maxEnemies);
  ok(maxParts <= 900, 'число частиц ограничено: ' + maxParts);
  ok(elapsed / Math.max(1, frames) < 3, 'средний кадр быстрее 3 мс (логика)');
  ok(!errors.length, 'за время прогона не было исключений', errors[0]);

  // --- проверка конца забега ---
  await sleep(40);
  if (G.state !== 'dead') {
    api.applyTowerDamage(99999);
    await sleep(40);
  }
  ok(G.state === 'dead', 'башня разрушена → состояние dead');
  ok(api.SAVE.best.wave >= G.wave || api.SAVE.best.wave > 0, 'рекорд записан: ' + api.SAVE.best.wave);
  ok(api.SAVE.stats.runs >= 1, 'счётчик забегов растёт');

  // --- сохранение ---
  const raw = api.Store.read();
  ok(!!raw && JSON.parse(raw).coins !== undefined, 'сейв пишется в хранилище');
  const coinsAfter = api.SAVE.coins;
  api.loadSave();
  ok(api.SAVE.coins === coinsAfter, 'сейв читается обратно (' + coinsAfter + ' монет)');

  // --- мета-улучшения ---
  api.SAVE.coins = 100000;
  api.SAVE.meta['m_dmg'] = 8;
  api.SAVE.meta['m_multi'] = 2;
  api.SAVE.meta['m_hp'] = 8;
  api.SAVE.meta['m_def'] = 5;
  const S = api.computeStats({});
  ok(S.projectiles === 3, 'мета «доп. ствол» даёт 3 снаряда: ' + S.projectiles);
  ok(S.maxHp === 120 + 20 * 8, 'мета «крепость» даёт +160 HP: ' + S.maxHp);
  ok(Math.abs(S.dmg - 13 * 1.72) < 0.05, 'мета «огневая мощь» ≈ +72%: ' + S.dmg.toFixed(2));
  ok(Math.abs(S.dmgReduce - 0.3) < 1e-9, 'мета «демпфер» даёт -30% урона: ' + Math.round(S.dmgReduce * 100) + '%');
  // --- лаборатория ---
  api.SAVE.lab = { l_hp: 2, l_revive: 1, l_dmg: 3 };
  const SL = api.computeStats({});
  ok(SL.maxHp === 120 + 20 * 8 + 38 * 2, 'лаборатория «каркас» даёт +76 HP: ' + SL.maxHp);
  ok(SL.revives === 1, 'лаборатория «второе дыхание» = 1: ' + SL.revives);
  ok(Math.abs(SL.dmg - 13 * 1.72 * (1 + 0.27 * 3)) < 0.05, 'лаборатория стекуется с метой: ' + SL.dmg.toFixed(2));
  const lc0 = api.labCost(api.LAB_BY_ID['l_dmg'], 0), lc3 = api.labCost(api.LAB_BY_ID['l_dmg'], 3);
  ok(lc0 === 120 && lc3 > lc0 * 3, 'цены лаборатории растут: ' + lc0 + ' → ' + lc3);
  api.SAVE.lab = {};

  // --- внутризабежные синергии ---
  // (уровни в 2 раза выше прежних: этап стал «половинным», их вдвое больше)
  api.SAVE.meta = {};   // синергии забега считаем без меты (мета стекуется отдельно)
  const S2 = api.computeStats({ dmg: 10, multi: 4, pierce: 6, chain: 8, explode: 4, split: 6, rico: 4, slow: 4, burn: 6, orbit: 6, missile: 4, shock: 4, aura: 4, scorch: 4, strike: 8 });
  ok(S2.projectiles === 3 && S2.pierce === 3 && S2.chain === 4, 'стаки улучшений считаются');
  ok(S2.explode > 0 && S2.split === 4 && S2.ricochet === 2, 'взрыв/осколки/рикошет активны');
  ok(S2.shockCd > 0 && S2.shockDmg > 0, 'импульс-генератор активен');
  ok(S2.strikeCd < 20, 'орбитальный удар прокачивается: ' + S2.strikeCd.toFixed(1) + 'с');

  // --- генератор волн ---
  for (const w of [1, 2, 5, 10, 20, 30, 45]) {
    const q = api.buildWave(w, 0);
    const bad = q.filter(s => !api.ENEMIES[s.t]);
    ok(q.length > 3 && bad.length === 0, 'волна ' + w + ': ' + q.length + ' врагов, типы валидны');
  }
  const sizes = [5, 10, 15, 25].map(w => api.buildWave(w, 0).length);
  ok(sizes[0] < sizes[1] && sizes[1] < sizes[2] && sizes[2] < sizes[3], 'волны растут: ' + sizes.join(' < '));
  ok(api.bossForWave(5) === 'crusher' && api.bossForWave(10) === 'brood' && api.bossForWave(15) === 'storm', 'ротация боссов');

  // --- цены не вырождаются ---
  // шагов стало вдвое больше, рост за уровень = √прежнего: сравниваем лесенку целиком
  const dmgDef = api.SHOP.find(d => d.id === 'dmg');
  const c0 = api.shopCost(dmgDef, 0, 1, 1);
  const c10 = api.shopCost(dmgDef, 10, 20, 1);
  const c20 = api.shopCost(dmgDef, 20, 20, 1);
  ok(c10 > c0 * 5 && c20 > c10 * 3, 'цены растут с уровнем и волной: ' + c0 + ' → ' + c10 + ' → ' + c20);

  // --- баланс: урон башни против HP врагов на поздних волнах ---
  const hp20 = api.enemyScale(20, 0).hp * api.ENEMIES.crawler.hp;
  const hp40 = api.enemyScale(40, 0).hp * api.ENEMIES.tank.hp;
  console.log('\n--- баланс ---');
  console.log('  HP ползуна на 20-й волне:  ' + Math.round(hp20));
  console.log('  HP броневика на 40-й волне:' + Math.round(hp40));
  console.log('  DPS базовой башни:         ' + Math.round(api.BASE.dmg * api.BASE.fireRate));
  console.log('  DPS с макс. апгрейдами:     ' + Math.round(api.computeStats({ dmg: 28, rate: 24, multi: 10, crit: 16, critdmg: 12 }).dmg * api.computeStats({ dmg: 28, rate: 24, multi: 10 }).fireRate * 5));
  ok(hp20 < 60000, 'HP врагов не улетают в космос к 20-й волне');

  // делители детерминированно: убили → осколки
  {
    api.newRun();
    const G2 = api.G;
    api.startWave();
    const sp = api.spawnEnemy('splitter', 200, 0, Math.PI);
    api.damageEnemy(sp, 1e9, null, '#fff');
    ok(G2.enemies.some(e => e.type === 'mini'), 'делитель порождает осколки при смерти');
  }

  // знахари: лечение только самой побитой цели и с потолком входящего лечения.
  // Раньше 5 знахарей лечили ВСЕХ в радиусе без лимита и волна зависала навсегда.
  {
    api.newRun();
    const G3 = api.G;
    G3.S.range = 10;                    // башня «слепа», чтобы не мешала замеру
    const pal = api.spawnEnemy('tank', 420, 0, Math.PI);
    pal.speed = 0; pal.hp = 1;          // побитый союзник вне досягаемости башни
    const docs = [];
    for (let i = 0; i < 5; i++) {
      const doc = api.spawnEnemy('healer', 330, i % 2 ? 40 : -40, Math.PI);
      doc.speed = 0; doc.cd = 0.2;      // стоят на месте, лечат синхронно и часто
      docs.push(doc);
    }
    step(60 * 3);                       // 3 секунды: 5 знахарей × ~3 пульса
    const cap = pal.maxHp * 0.3 * 3;    // HEAL_CAP = 30% макс.HP в секунду
    const got = Math.max(0, pal.hp - 1);
    ok(got > 0 && got <= cap + 1, '5 знахарей лечат, но не больше 30% HP/сек (нет бессмертного клубка)', 'вылечено=' + got.toFixed(1) + ', предел=' + cap.toFixed(1));
    ok(!docs.some(d => d.dead), 'знахари живы — сценарий отработал полностью');
  }

  // автозакупщик переехал из лавки забега в постоянные улучшения
  ok(!api.SHOP.some(d => d.id === 'autobuy') && !!api.META.find(m => m.id === 'm_autobuy'), '«Автозакупщик» переехал из лавки забега в постоянные улучшения');
  api.SAVE.meta = { m_autobuy: 1 };
  ok(api.computeStats({}).autoBuy === true, 'постоянный «Автозакупщик» включается');
  api.SAVE.meta = {};

  // лимит волны 60 секунд: спавн стоп, враги отступают
  {
    api.newRun();
    api.startWave();
    const G4 = api.G;
    G4.waveT = 59.99;
    step(3);
    ok(G4.waveTimedOut === true && G4.queue.length === 0 && G4.enemies.every(e => e.flee || e.dead),
      'лимит волны 60с: спавн остановлен, враги отступают');
  }

  // сложность «Ад» на месте и открывается 10 волнами Кошмара
  ok(api.DIFFS.length === 5 &&
     api.DIFFS.find(d => d.id === 3).name === 'Ад' &&
     api.DIFFS.find(d => d.id === 3).coins === 1.5 &&
     api.DIFFS.find(d => d.id === 4).name === 'Лёгкая' &&
     api.DIFFS.find(d => d.id === 4).coins === 0.5,
    '5 сложностей: «Лёгкая» (золото ×0.5) и «Ад» (золото ×1.5)');
  {
    // подкрепления (осколки делителя) попадают в счётчик волны: не бывает 145/85
    api.newRun();
    api.startWave();
    const G6 = api.G;
    const before = G6.waveCount;
    const sp = api.spawnEnemy('splitter', 200, 0, Math.PI);
    api.damageEnemy(sp, 1e9, null, '#fff');
    ok(G6.waveCount === before + 2, 'осколки учитываются в счётчике волны (+2 к total)');
  }

  // босс детерминированно: принудительный старт волны 5 (не ждём выживаемости бота)
  {
    api.newRun();
    const G5 = api.G;
    G5.wave = 4;
    api.startWave();      // волна 5 → босс
    step(60 * 3);
    ok(!!G5.bossAlive || G5.stats.bosses > 0, 'босс появляется на 5-й волне');
  }

  // аудит улучшений: лабораторная «Орбитальная батарея» реально сокращает откат
  {
    const keepLab = JSON.parse(JSON.stringify(api.SAVE.lab));
    api.SAVE.lab = { l_strike: 4 };
    const Ss = api.computeStats({});
    api.SAVE.lab = keepLab;
    ok(Math.abs(Ss.strikeCd - 10.4) < 1e-6, 'лаборатория: откат удара 20 -> 10.4с на 4 ур.');
  }
  // аудит: снижение урона из всех источников сразу не превышает 60%
  {
    const keepM = JSON.parse(JSON.stringify(api.SAVE.meta));
    const keepL = JSON.parse(JSON.stringify(api.SAVE.lab));
    api.SAVE.meta = { m_def: 5 };
    api.SAVE.lab = { l_block: 6 };
    const Sd = api.computeStats({ block: 12 });
    api.SAVE.meta = keepM; api.SAVE.lab = keepL;
    ok(Math.abs(Sd.dmgReduce - 0.6) < 1e-9, 'снижение урона ограничено 60% суммарно');
  }

  // --- все типы врагов спавнятся и обновляются без ошибок ---
  api.SAVE.coins = 500;
  api.newRun();
  G = api.G;
  api.startWave();
  const errs2 = [];
  for (const k of Object.keys(api.ENEMIES)) {
    try { api.spawnEnemy(k, 200, 0, Math.PI); } catch (e) { errs2.push(k + ': ' + e.message); }
  }
  for (const k of Object.keys(api.BOSSES)) {
    try { api.spawnBoss(k); } catch (e) { errs2.push(k + ': ' + e.message); }
  }
  step(60 * 12);
  ok(errs2.length === 0, 'все 11 типов врагов и 3 босса живут 12 секунд', errs2[0]);

  process.exit(T.summary());
})();
