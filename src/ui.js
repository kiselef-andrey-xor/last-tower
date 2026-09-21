/* =========================================================
   UI: HUD, лавка забега, мета-магазин, экраны
   ========================================================= */
'use strict';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

const UI = {
  modalOpen: false,
  _shopOpen: false,
  _bossLast: -1,
  _bossShown: false,
  _toasts: [],

  init() {
    this.cache();
    this.bind();
    this.hudAll();
    this.showMenu();
  },

  cache() {
    this.cv = $('#cv');
    this.hpFill = $('#hpFill'); this.hpText = $('#hpText'); this.shieldFill = $('#shieldFill');
    this.coinText = $('#coinText'); this.waveText = $('#waveText'); this.killText = $('#killText');
    this.waveProgFill = $('#waveProgFill');
    this.buildWrap = $('#buildWrap'); this.buildText = $('#buildText'); this.buildFill = $('#buildFill');
    this.btnStart = $('#btnStart'); this.btnTarget = $('#btnTarget'); this.btnStrike = $('#btnStrike');
    this.strikeCd = $('#strikeCd'); this.strikeKey = $('#strikeKey');
    this.invBar = $('#invBar');
    this.shop = $('#shop'); this.shelf = $('#shelf'); this.rerollText = $('#rerollText');
    this.structList = $('#structList'); this.btnRepair = $('#btnRepair');
    this.leftCol = $('#leftCol');
    this.bossBar = $('#bossBar'); this.bossName = $('#bossName'); this.bossFill = $('#bossFill');
    this.bannerEl = $('#banner'); this.bannerSubEl = $('#bannerSub'); this.bannerWrap = $('#bannerWrap');
    this.toasts = $('#toasts');
    this.overlay = $('#overlay'); this.screen = $('#screen');
    this.hud = $('#hud');
    this.statsPanel = $('#statsPanel'); this.statsBody = $('#statsBody');
    this.enemyPanel = $('#enemyPanel'); this.enemyBody = $('#enemyBody'); this.enemyTitle = $('#enemyTitle');
    this._statsMin = false;   // в портретной сетке телефона характеристики видны в своём ряду
  },

  bind() {
    $('#btnPause').onclick = () => togglePause();
    $('#btnSound').onclick = (e) => {
      SAVE.sound = !SAVE.sound; markSave();
      e.currentTarget.classList.toggle('off', !SAVE.sound);
      if (SAVE.sound) { Sfx.resume(); Sfx.buy(); }
    };
    $('#btnHelp').onclick = () => this.showHelp();
    const bStPop = $('#btnStatsPop');
    if (bStPop) bStPop.onclick = () => this.showStatsPop();
    const bWvPop = $('#btnWavePop');
    if (bWvPop) bWvPop.onclick = () => this.showWavePop();
    this.btnStart.onclick = () => startWave();
    this.btnTarget.onclick = () => cycleTarget(1);
    this.btnStrike.onclick = () => {
      if (!G || G.state === 'dead') return;
      if (G.strike.cd > 0) { Sfx.deny(); this.toast('Орбитальный удар перезаряжается'); return; }
      G.strike.aiming = !G.strike.aiming;
      this.hudAbility();
      if (G.strike.aiming) this.toast('Выберите точку удара на арене');
    };
    $('#btnReroll').onclick = () => rerollShelf();
    this.btnRepair.onclick = () => buyRepair();
    const bSt = $('#btnStats');
    if (bSt) bSt.onclick = () => { this._statsMin = !this._statsMin; this._applyStatsMin(); };
    const bSp = $('#btnSpeed');
    if (bSp) bSp.onclick = () => cycleSpeed();
    this._applyStatsMin();
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalOpen && !$('#screen').dataset.locked) {
        e.stopImmediatePropagation();   // игра не ставит паузу «поверх» выхода из модалки
        if (this._onEsc) this._onEsc(); else this.closeModal();
      }
    });
  },

  /* ---------------- HUD ---------------- */
  hudAll() { this.hudHp(); this.hudCoins(); this.hudWave(); this.hudTarget(); this.hudAbility(); this.renderInv(); this.hudBuild(); this.renderStats(); this.renderEnemies(); this.hudSpeed(); },

  /* текущие деньги: в забеге — кошелёк забега, вне — мета-кошелёк */
  wallet() { return G ? (G.purse !== undefined ? G.purse : 0) : SAVE.coins; },

  hudHp() {
    if (!G) return;
    const T = G.tower;
    const f = clamp(T.hp / T.maxHp, 0, 1);
    this.hpFill.style.width = (f * 100) + '%';
    this.hpFill.className = 'fill ' + (f > 0.55 ? 'ok' : f > 0.25 ? 'warn' : 'bad');
    this.hpText.textContent = Math.ceil(T.hp) + ' / ' + T.maxHp;
    const sf = T.maxHp ? clamp((T.shield || 0) / T.maxHp, 0, 1) : 0;
    this.shieldFill.style.width = (sf * 100) + '%';
    this.shieldFill.style.display = T.shield > 0 ? 'block' : 'none';
  },

  hudCoins() {
    const val = fmt(this.wallet());
    if (!G) { const c = $('#menuCoins'); if (c) c.textContent = val; return; }
    this.coinText.textContent = val;
    document.querySelectorAll('.shop-coins').forEach(n => n.textContent = val);
    if (this._shopOpen) this.paintPrices();
  },

  hudWave() {
    if (!G) return;
    this.waveText.textContent = 'Волна ' + (G.wave || '—');
    const total = G.waveCount || 0;
    const done = G.waveKilled || 0;
    this.killText.textContent = total ? (done + ' / ' + total) : '';
    if (G.state === 'wave' && total) {   // таймер лимита волны прямо в чипе
      const left = Math.max(0, WAVE_TIME_LIMIT - (G.waveT || 0));
      this.killText.textContent = done + ' / ' + total + ' · ' + Math.ceil(left) + 'с';
    }
    const f = total ? clamp(done / total, 0, 1) : 0;
    this.waveProgFill.style.width = (f * 100) + '%';
  },

  hudBuild() {
    if (!G) return;
    const inBuild = G.state === 'build';
    this.buildWrap.classList.toggle('hidden', !inBuild);
    this.btnStart.classList.toggle('hidden', !inBuild);
    if (inBuild) {
      const f = clamp(G.buildT / BUILD_TIME, 0, 1);
      this.buildFill.style.width = (f * 100) + '%';
      const bonus = Math.floor(G.buildT / 3);
      this.buildText.innerHTML = 'Подготовка: <b>' + Math.ceil(G.buildT) + 'с</b>' + (bonus > 0 ? ' <span class="bonus">старт сейчас +' + bonus + '</span>' : '');
    }
  },

  hudTarget() {
    if (!G) return;
    const m = TARGET_MODES[G.targetMode];
    this.btnTarget.innerHTML = '<span class="ico">' + m.icon + '</span><span>' + m.name + '</span>';
  },

  hudAbility() {
    if (!G) return;
    const cd = G.strike.cd;
    const ready = cd <= 0;
    if (this._strikeReady !== ready) {
      this._strikeReady = ready;
      this.btnStrike.classList.toggle('ready', ready);
      this.btnStrike.classList.toggle('cooling', !ready);   // цифра вместо надписи
    }
    const aiming = !!G.strike.aiming;
    if (this._strikeAim !== aiming) {
      this._strikeAim = aiming;
      this.btnStrike.classList.toggle('aiming', aiming);
    }
    if (cd > 0) {
      const f = clamp(1 - cd / G.S.strikeCd, 0, 1);
      this.strikeCd.style.background = `conic-gradient(rgba(255,210,63,.35) ${f * 360}deg, rgba(255,255,255,.06) 0deg)`;
      const key = String(Math.ceil(cd));
      if (this._strikeKey !== key) { this._strikeKey = key; this.strikeKey.textContent = key; }
    } else if (this._strikeKey !== '') {
      this._strikeKey = '';
      this.strikeCd.style.background = 'none';
      this.strikeKey.textContent = '';
    }
  },

  bossTick() {
    if (!G) return;
    const b = G.bossAlive;
    const show = !!(b && !b.dead && b.hp > 0);
    if (!show) {
      // прячем полоску всегда, когда босса больше нет (в т.ч. после «пустой» полоски)
      if (this._bossShown) { this.bossBar.classList.add('hidden'); this._bossShown = false; }
      this._bossLast = -1;
      return;
    }
    if (!this._bossShown) { this.bossBar.classList.remove('hidden'); this._bossShown = true; }
    this.bossName.textContent = b.def.name;
    const f = Math.round(clamp(b.hp / b.maxHp, 0, 1) * 200);
    if (f !== this._bossLast) { this.bossFill.style.width = (f / 2) + '%'; this._bossLast = f; }
  },

  /* ---------------- ЛАВКА ЗАБЕГА ---------------- */
  /* телефон в ландшафте: лавка справа (см. media-query в style.css), а не снизу */
  _isPhoneLandscape() {
    return window.innerWidth < 980 && window.innerHeight < 560 &&
      window.innerWidth > window.innerHeight;
  },
  panelWidth() {
    if (!this._shopOpen) return 0;
    if (this._isPhoneLandscape()) return Math.min(392, window.innerWidth * 0.46);
    return window.innerWidth >= 980 ? Math.min(400, window.innerWidth * 0.34) : 0;
  },
  bottomPad() {
    if (!this._shopOpen) return 0;
    if (this._isPhoneLandscape()) return 0;
    return window.innerWidth < 980 ? Math.min(window.innerHeight * 0.40, 520) : 0;
  },

  openShop() {
    this._shopOpen = true;
    this.shop.classList.remove('hidden');
    this.renderShop();
    resize();
  },
  closeShop() {
    this._shopOpen = false;
    this.shop.classList.add('hidden');
    resize();
  },

  renderShop() {
    if (!G) return;
    // сохраняем позицию прокрутки лавки, чтобы покупка не сбрасывала список наверх
    const sc = this.shop ? this.shop.querySelector('.shop-scroll') : null;
    const sy = sc ? sc.scrollTop : 0;
    const shY = this.shelf ? this.shelf.scrollTop : 0;
    const stY = this.structList ? this.structList.scrollTop : 0;
    this.renderShelf();
    this.renderStructs();
    this.rerollText.textContent = 'Обновлений: ' + G.rerollsLeft;
    $('#btnReroll').disabled = G.rerollsLeft <= 0 || (G.state !== 'build' && G.state !== 'wave');
    this.hudBuild();
    this.renderStats();
    if (sc) sc.scrollTop = sy;
    if (this.shelf) this.shelf.scrollTop = shY;
    if (this.structList) this.structList.scrollTop = stY;
  },

  /* Свернуть/развернуть лавку больше не нужно: авто-сворачивание убрано,
     кнопки у заголовка нет, лавка видна и в подготовке, и в бою. */
  _applyStatsMin() {
    if (!this.statsPanel) return;
    this.statsPanel.classList.toggle('min', !!this._statsMin);
    const b = $('#btnStats');
    if (b) b.textContent = this._statsMin ? '▸' : '▾';
  },

  /* ---------------- ПАНЕЛЬ ХАРАКТЕРИСТИК БАШНИ (меню + забег) ---------------- */
  statsHtml() {
    const S = G ? G.S : computeStats({});
    const r = (k, v) => '<div class="st-row"><span>' + k + '</span><b>' + v + '</b></div>';
    const n1 = (x) => Math.round(x * 10) / 10;
    const dps = Math.round(S.dmg * S.fireRate * S.projectiles * (1 + S.crit * (S.critMult - 1)));
    let base = '';
    base += r('❤️ Прочность', G ? Math.ceil(G.tower.hp) + ' / ' + S.maxHp : S.maxHp);
    if (S.shield > 0) base += r('🔋 Щит', S.shield);
    base += r('🧿 Снижение урона', '-' + Math.round((S.dmgReduce || 0) * 100) + '%');
    base += r('🛡️ Броня', '-' + n1(S.armor) + ' за удар');
    base += r('💢 Урон', n1(S.dmg));
    base += r('⚙️ Темп', (Math.round(S.fireRate * 100) / 100) + '/с');
    base += r('🔱 Снарядов', S.projectiles);
    base += r('📈 DPS', '~' + dps);
    base += r('🎯 Крит', Math.round(S.crit * 100) + '% ×' + (Math.round(S.critMult * 100) / 100));
    if (S.pierce > 0) base += r('🏹 Пробитие', S.pierce);
    base += r('🔭 Дальность', Math.round(S.range));
    const spec = [];
    if (S.orbitals > 0) spec.push(r('🗡️ Клинки', S.orbitals + ' × ' + Math.round(S.orbitalDmg)));
    if (S.missiles > 0) spec.push(r('🚀 Ракеты', S.missiles + ' × ' + Math.round(S.missileDmg)));
    if (S.shockCd > 0) spec.push(r('📡 Импульс', Math.round(S.shockDmg) + ' / ' + n1(S.shockCd) + 'с'));
    if (S.slowAura > 0) spec.push(r('🌬️ Поле стужи', '-' + Math.round(S.slowAura * 100) + '%'));
    if (S.burnAura > 0) spec.push(r('🌋 Выжигание', Math.round(S.burnAura) + '/с'));
    spec.push(r('☄️ Удар', Math.round(S.strikeDmg) + ' / ' + n1(S.strikeCd) + 'с'));
    if (S.lifesteal > 0) spec.push(r('🩸 Вампиризм', n1(S.lifesteal) + ' HP/уб.'));
    if (S.revives > 0) spec.push(r('🧬 Реанимации', S.revives));
    if (S.cascade > 0) spec.push(r('💣 Каскад', Math.round(S.cascadeDmg) + ' урона, r' + Math.round(S.cascade)));
    if (S.fury > 0) spec.push(r('🔥 Ярость', '+' + Math.round(S.fury * 100) + '% при HP<50%'));
    if (S.regen > 0) spec.push(r('💚 Реген', (Math.round(S.regen * 100) / 100) + ' HP/с'));
    const eco = [];
    eco.push(r('💰 Монеты', '+' + Math.round((S.goldMult - 1) * 100) + '%'));
    eco.push(r('🧲 Магнит', Math.round(S.magnet)));
    if (S.priceMult < 1) eco.push(r('🏷️ Цены', '-' + Math.round((1 - S.priceMult) * 100) + '%'));
    return '<div class="st-sec">ОСНОВА</div>' + base +
      '<div class="st-sec">СПЕЦСИСТЕМЫ</div>' + spec.join('') +
      '<div class="st-sec">ЭКОНОМИКА</div>' + eco.join('');
  },
  renderStats() {
    if (!this.statsBody) return;
    this.statsBody.innerHTML = this.statsHtml();
  },

  renderShelf() {
    const S = G.S;
    this.shelf.innerHTML = '';
    G.shelf.forEach((slot, i) => {
      const def = SHOP_BY_ID[slot.id];
      if (!def) return;
      const lv = G.levels[def.id] || 0;
      const price = shopCost(def, lv, Math.max(1, G.wave), S.priceMult);
      const r = RARITY[def.rarity];
      const maxed = lv >= def.max;
      const card = el('div', 'card r-' + def.rarity + (maxed ? ' maxed' : '') + (this.wallet() < price ? ' poor' : ''));
      card.dataset.price = price;
      card.dataset.i = i;
      card.innerHTML =
        '<div class="c-key">' + (i + 1) + '</div>' +
        '<div class="c-ico">' + def.icon + '</div>' +
        '<div class="c-body">' +
        '<div class="c-name">' + def.name + (def.max < 90 ? ' <span class="c-lv">' + lv + '/' + def.max + '</span>' : '') + '</div>' +
        '<div class="c-desc">' + (def.d ? def.d(lv + (def.kind === 'repair' ? 0 : 1)) : '') + '</div>' +
        '<div class="c-rar" style="color:' + r.color + '">' + r.name + '</div>' +
        '</div>' +
        '<div class="c-price">' + (maxed ? 'МАКС' : '<span class="coin silver">◉</span> ' + fmt(price)) + '</div>';
      if (!maxed) card.onclick = () => buyShelf(i);
      this.shelf.appendChild(card);
    });
    if (!G.shelf.length) this.shelf.innerHTML = '<div class="empty">Ассортимент пуст — обновите (R)</div>';
  },

  paintPrices() {
    const w = this.wallet();
    const cards = this.shelf.children;
    for (let i = 0; i < cards.length; i++) {
      const p = parseInt(cards[i].dataset.price || '0', 10);
      cards[i].classList.toggle('poor', w < p);
    }
    const sb = this.structList.children;
    for (let i = 0; i < sb.length; i++) {
      const p = parseInt(sb[i].dataset.price || '0', 10);
      sb[i].classList.toggle('poor', w < p);
    }
  },

  renderStructs() {
    const S = G.S;
    this.structList.innerHTML = '';
    for (const key of ['turret', 'mine', 'cryo', 'wall', 'farm']) {
      const def = STRUCTS[key];
      const price = structCost(key, S.priceMult * S.buildMul);
      const have = countStructs(key);
      const b = el('button', 'sbtn' + (this.wallet() < price || have >= def.max ? ' poor' : ''));
      b.dataset.price = price;
      b.innerHTML = '<span class="s-ico">' + def.icon + '</span>' +
        '<span class="s-txt"><b>' + def.name + '</b><small>' + (have >= def.max ? 'предел ' + def.max : 'стоит: ' + have + '/' + def.max) + '</small></span>' +
        '<span class="s-price"><span class="coin silver">◉</span>' + fmt(price) + '</span>';
      b.title = def.desc;
      b.onclick = () => buyStruct(key);
      this.structList.appendChild(b);
    }
    const rp = repairCost();
    const rb = this.btnRepair;
    rb.dataset.price = rp;
    rb.innerHTML = '<span class="s-ico">🧰</span><span class="s-txt"><b>Ремонт башни</b><small>+35% прочности (' + Math.ceil(G.tower.hp) + '/' + G.tower.maxHp + ')</small></span><span class="s-price"><span class="coin silver">◉</span>' + fmt(rp) + '</span>';
    rb.classList.toggle('poor', this.wallet() < rp || G.tower.hp >= G.tower.maxHp - 0.5);
  rb.disabled = G.state !== 'build';   // ремонт активен только между волнами
  rb.title = G.state === 'build' ? 'Ремонт башни: +35% прочности' : 'Ремонт доступен только между волнами';
  },

  hudSpeed() {
    const b = $('#speedLabel') || $('#btnSpeed');
    if (b) b.textContent = '×' + (G ? (G.speed || 1) : 1);
  },

  /* ---------------- ПАНЕЛЬ ВРАГОВ ТЕКУЩЕЙ ВОЛНЫ ---------------- */
  waveHtml() {
    const isBuild = G.state === 'build' || G.state === 'paused' && G.prevState === 'build';
    const w = isBuild ? G.wave + 1 : G.wave;
    let comp;
    if (isBuild) {
      comp = G.nextComp || {};
    } else {
      comp = {};
      for (const q of G.queue) comp[q.t] = (comp[q.t] || 0) + 1;
      for (const e of G.enemies) if (!e.dead) comp[e.type] = (comp[e.type] || 0) + 1;
      if (G.bossAlive && !G.bossAlive.dead) comp.boss = G.bossAlive.type;
    }
    const sig = w + '|' + (isBuild ? 'b' : 'w') + '|' + JSON.stringify(comp);
    const sc = enemyScale(w, G.diff);
    const rows = [];
    for (const t of Object.keys(comp)) {
      if (t === 'boss') {
        const b = (typeof comp.boss === 'string' && BOSSES[comp.boss]) ? BOSSES[comp.boss] : (w % 5 === 0 ? BOSSES[bossForWave(w)] : null);
        if (!b) continue;
        const hp = Math.round(b.hp * sc.hp * 0.44 * (1 + Math.max(0, (w / 5 - 1)) * 0.5));
        rows.push({ n: comp[t], html: '<div class="st-row boss"><span><i class="dot" style="background:' + b.color + '"></i> ' + b.name + '</span><b>HP ' + fmt(hp) + ' · ' + Math.round(b.atk * sc.dmg) + '</b></div>' });
        continue;
      }
      const d = ENEMIES[t];
      if (!d) continue;
      rows.push({
        n: comp[t],
        html: '<div class="st-row"><span><i class="dot" style="background:' + d.color + '"></i> ' + d.name + ' ×' + comp[t] + '</span><b>HP ' + fmt(Math.round(d.hp * sc.hp)) + ' · ' + (Math.round(d.atk * sc.dmg * 10) / 10) + '</b></div>'
      });
    }
    rows.sort((a, b) => b.n - a.n);
    return {
      sig,
      title: isBuild ? 'ВОЛНА ' + w + ' (ДАЛЕЕ)' : 'ВОЛНА ' + w + ' — ВРАГИ',
      html: rows.length ? rows.map(r => r.html).join('') : '<div class="st-row"><span>пусто</span><b></b></div>'
    };
  },
  renderEnemies() {
    if (!this.enemyPanel) return;
    if (!G || G.state === 'menu' || G.state === 'dead') { this.enemyPanel.classList.add('hidden'); return; }
    const w = this.waveHtml();
    if (w.sig === this._enemySig) { this.enemyPanel.classList.remove('hidden'); return; }
    this._enemySig = w.sig;
    this.enemyTitle.textContent = w.title;
    this.enemyBody.innerHTML = w.html;
    this.enemyPanel.classList.remove('hidden');
  },

  /* всплывающие панели (кнопки в верхнем ряду HUD на узких экранах) */
  showStatsPop() {
    this.setScreen(`
      <div class="panel-modal small">
        <h2>БАШНЯ</h2>
        <div class="pop-body">${this.statsHtml()}</div>
        <div class="modal-btns"><button class="big" id="popClose">ЗАКРЫТЬ</button></div>
      </div>`, { locked: false });
    $('#popClose').onclick = () => this.closeModal();
  },
  showWavePop() {
    const w = this.waveHtml();
    this.setScreen(`
      <div class="panel-modal small">
        <h2>${w.title}</h2>
        <div class="pop-body">${w.html}</div>
        <div class="modal-btns"><button class="big" id="popClose">ЗАКРЫТЬ</button></div>
      </div>`, { locked: false });
    $('#popClose').onclick = () => this.closeModal();
  },

  renderInv() {
    if (!G) return;
    const keys = Object.keys(G.inv).filter(k => G.inv[k] > 0);
    this.invBar.innerHTML = '';
    if (!keys.length) { this.invBar.classList.add('hidden'); return; }
    this.invBar.classList.remove('hidden');
    const lbl = el('div', 'inv-label', 'ПОСТРОИТЬ:');
    this.invBar.appendChild(lbl);
    for (const k of keys) {
      const def = STRUCTS[k];
      const b = el('button', 'inv-btn' + (G.placing === k ? ' active' : ''), def.icon + '<span class="inv-n">×' + G.inv[k] + '</span>');
      b.title = def.name + ' — ' + def.desc;
      b.onclick = () => {
        if (G.state === 'dead' || G.state === 'paused') { this.toast('Сейчас нельзя строить'); return; }
        G.placing = G.placing === k ? null : k;
        G.strike.aiming = false;
        this.renderInv(); this.hudAbility();
        if (G.placing) this.toast('Выберите место на арене (ПКМ — отмена)');
      };
      this.invBar.appendChild(b);
    }
    const cancel = el('button', 'inv-btn cancel', '✕');
    cancel.title = 'Отменить установку';
    cancel.onclick = () => { G.placing = null; this.renderInv(); };
    this.invBar.appendChild(cancel);
  },

  /* ---------------- БАННЕРЫ / ТОСТЫ ---------------- */
  banner(title, sub, color) {
    this.bannerEl.textContent = title;
    this.bannerSubEl.textContent = sub || '';
    this.bannerEl.style.color = color || '#dff6ff';
    this.bannerWrap.classList.remove('show');
    void this.bannerWrap.offsetWidth;
    this.bannerWrap.classList.add('show');
  },
  toast(msg) {
    const n = el('div', 'toast', msg);
    this.toasts.appendChild(n);
    requestAnimationFrame(() => n.classList.add('show'));
    setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 320); }, 2100);
    while (this.toasts.children.length > 4) { const f = this.toasts.children[0]; if (!f) break; f.remove(); }
  },
  toast2(msg) { this.toast(msg); },

  /* ---------------- ЭКРАНЫ ---------------- */
  setScreen(html, opts) {
    this.leftCol.classList.add('hidden');   // панели башни/волны не торчат над модалками
    this._onEsc = null;
    this.screen.innerHTML = html;
    this.screen.dataset.locked = opts && opts.locked ? '1' : '';
    this.overlay.classList.remove('hidden');
    this.modalOpen = true;
    resize();
  },
  closeModal() {
    this.overlay.classList.add('hidden');
    this.modalOpen = false;
    this.screen.innerHTML = '';
    this._onEsc = null;
    if (G && G.state !== 'dead') this.leftCol.classList.remove('hidden');
    resize();
  },

  /* куда возвращаемся по ESC/«назад» из подразделов */
  metaBack() {
    const f = this._metaFrom;
    if (f === 'menu') this.showMenu();
    else if (f === 'results') this.showResults(this._lastReward || 0, this._lastTransfer || 0, this._lastSilver || 0);
    else this.closeModal();
  },
  labBack() {
    if (this._labFrom === 'results') this.showResults(this._lastReward || 0, this._lastTransfer || 0, this._lastSilver || 0);
    else if (G) this.closeModal();
    else this.showMenu();
  },
  helpBack() {
    if (this._helpReturn === 'pause' && G) { this._helpReturn = null; this.openPause(); return; }
    this._helpReturn = null;
    if (G) this.closeModal();
    else this.showMenu();
  },

  showMenu() {
    if (G) { G = null; }
    this._shopOpen = false; this.shop.classList.add('hidden');
    this.hud.classList.add('hidden');
    this.invBar.classList.add('hidden');
    this.bossBar.classList.add('hidden');
    this.leftCol.classList.add('hidden');   // в меню панели башни и волны не нужны
    const best = SAVE.best.wave;
    const unlocked = (id) => {
      const d = DIFFS[id];
      return !d.req || ((SAVE.bestByDiff || {})[d.req.diff] || 0) >= d.req.waves;
    };
    const diffBtns = DIFFS.map(d => {
      const locked = !unlocked(d.id);
      return `<button class="diff ${SAVE.diff === d.id ? 'sel' : ''} ${locked ? 'locked' : ''}" data-d="${d.id}" ${locked ? 'disabled' : ''}>
        <span style="color:${d.color}">${d.name}</span>
        <small>${locked ? '🔒 ' + d.unlockReq : 'монет ×' + d.coins}</small></button>`;
    }).join('');
    this.setScreen(`
      <div class="menu">
        <div class="logo">
          <div class="logo-t">ПОСЛЕДНЯЯ</div>
          <div class="logo-b">БАШНЯ</div>
          <div class="logo-s">роглайк · оборона центра</div>
        </div>
        <div class="menu-coins"><span class="coin">◉</span> <b id="menuCoins">${fmt(SAVE.coins)}</b> золотых</div>
        <div class="diffs">${diffBtns}</div>
        <div class="menu-btns">
          <button class="big play" id="mPlay">▶ ИГРАТЬ</button>
          <button class="big" id="mMeta">🛒 ЛАВКА УЛУЧШЕНИЙ</button>
          <button class="big" id="mLab">🧪 ЛАБОРАТОРИЯ</button>
          <button class="big" id="mYan" style="display:none">💰 ЗОЛОТО ЗА ЯНЫ</button>
          <button class="big" id="mLb">🏆 ТАБЛИЦА ЛИДЕРОВ</button>
          <button class="big" id="mHelp">❓ КАК ИГРАТЬ</button>
        </div>
        <div class="menu-stats">
          <span>Рекорд: <b>${best}</b> волна</span>
          <span>Забеги: <b>${SAVE.stats.runs}</b></span>
          <span>Убийства: <b>${fmt(SAVE.stats.kills)}</b></span>
        </div>
      </div>`, { locked: true });
    this.screen.querySelectorAll('.diff').forEach(b => b.onclick = () => {
      SAVE.diff = parseInt(b.dataset.d, 10); markSave(); this.showMenu(); Sfx.tone(700, 0.06, 'triangle', 0.06);
    });
    $('#mPlay').onclick = () => { Sfx.resume(); startRun(); };
    $('#mMeta').onclick = () => this.showMeta('menu');
    $('#mLab').onclick = () => this.showLab('menu');
    $('#mYan').onclick = () => this.showYanShop();
    $('#mLb').onclick = () => this.showLeaderboard();
    if (YA.available) $('#mYan').style.display = '';
    YA._onAvail = () => { const b = $('#mYan'); if (b) b.style.display = ''; };
    $('#mHelp').onclick = () => this.showHelp();
    this.renderStats();
  },

  showHelp(fromGame) {
    const bestiary = Object.keys(ENEMIES).filter(k => ENEMIES[k].wave < 90).map(k => {
      const e = ENEMIES[k];
      return `<div class="best"><span class="dot" style="background:${e.color}"></span><b>${e.name}</b><small>волна ${e.wave} · ${
        e.ai === 'ranged' ? (e.heal ? 'лечит союзников' : e.summon ? 'призывает' : 'стреляет издалека') :
        e.ai === 'suicide' ? 'взрывается у башни' : e.fly ? 'летает над постройками' :
        e.shield ? 'щит регенерирует' : e.split ? 'делится при смерти' : 'идёт напролом'}</small></div>`;
    }).join('');
    const bosses = Object.keys(BOSSES).map(k => {
      const b = BOSSES[k];
      return `<div class="best"><span class="dot" style="background:${b.color}"></span><b>${b.name}</b><small>каждая 5-я волна · трофей — бесплатное улучшение</small></div>`;
    }).join('');
    this.setScreen(`
      <div class="panel-modal">
        <h2>Как играть</h2>
        <div class="help-cols">
          <div>
            <h3>Суть</h3>
            <p>Ваша башня стоит в центре арены и стреляет автоматически. Волны врагов идут со всех сторон. Отбили волну → открылась <b>лавка</b>: покупайте улучшения и стройте оборону. Умерли → забег окончен, <b>непотраченные монеты остаются</b> и плюс награда за волну — их можно вложить в постоянные улучшения.</p>
            <h3>Управление</h3>
            <ul class="keys">
              <li><kbd>ЛКМ</kbd> по арене — поставить постройку / выбрать точку удара</li>
              <li><kbd>ПРОБЕЛ</kbd> — орбитальный удар (клик по цели)</li>
              <li><kbd>Q</kbd> / <kbd>E</kbd> — приоритет цели: ближний · крепкий · слабый</li>
              <li><kbd>1…5</kbd> — купить товар в лавке (можно и в бою)</li>
              <li><kbd>F</kbd> — скорость игры ×0.5…×5 (кнопка ⏩ рядом с приоритетом цели)</li>
              <li><kbd>R</kbd> — обновить ассортимент, <kbd>ENTER</kbd> — начать волну</li>
              <li><kbd>ESC</kbd> / <kbd>P</kbd> — пауза, <kbd>ПКМ</kbd> — отмена установки</li>
            </ul>
          </div>
          <div>
            <h3>Советы</h3>
            <ul>
              <li>Баррикады держат толпу, но <b>летуны перелетают</b> их — нужны турели и урон.</li>
              <li>Крио-поля складываются с замедлением от патронов: враги стоят под вашим огнём.</li>
              <li>Золотая жила окупается, если доживает до 10+ волны. Ставьте её за баррикадами.</li>
              <li>Быстрый старт волны даёт бонусные монеты — но только если вы готовы.</li>
              <li>Призывателей и знахарей убивайте первыми: режим цели «КРЕПКИЙ» помогает.</li>
            </ul>
            <h3>Бестиарий</h3>
            <div class="best-wrap">${bestiary}${bosses}</div>
          </div>
        </div>
        <div class="modal-btns"><button class="big" id="hClose">${fromGame ? 'ПРОДОЛЖИТЬ' : 'НАЗАД'}</button></div>
      </div>`, { locked: false });
    $('#hClose').onclick = () => this.helpBack();
    this._onEsc = () => this.helpBack();
  },

  showMeta(from) {
    this._metaFrom = from || (G ? (G.state === 'dead' ? 'results' : 'game') : 'menu');
    const rows = META.map(m => {
      const lv = SAVE.meta[m.id] || 0;
      const maxed = lv >= m.max;
      const cost = metaCost(m, lv);
      const pips = Array.from({ length: m.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      return `<div class="mrow ${maxed ? 'maxed' : ''} ${SAVE.coins < cost && !maxed ? 'poor' : ''}">
        <div class="m-ico">${m.icon}</div>
        <div class="m-body">
          <div class="m-name">${m.name} <span class="pips">${pips}</span></div>
          <div class="m-desc">${m.d(Math.max(1, lv))}${lv > 0 ? ' <b class="now">сейчас: ' + m.d(lv) + '</b>' : ''}</div>
        </div>
        <button class="m-buy" data-id="${m.id}" ${maxed || SAVE.coins < cost ? 'disabled' : ''}>${maxed ? 'МАКС' : '<span class="coin">◉</span>' + fmt(cost)}</button>
      </div>`;
    }).join('');
    this.setScreen(`
      <div class="panel-modal meta">
        <h2>Постоянные улучшения <span class="wallet"><span class="coin">◉</span> ${fmt(SAVE.coins)}</span></h2>
        <p class="hint">Эти улучшения остаются навсегда и работают во всех забегах.</p>
        <div class="meta-list">${rows}</div>
        <div class="modal-btns">
          <button class="big" id="metaBack">${G ? (G.state === 'dead' ? '← К РЕЗУЛЬТАТАМ' : 'К ИГРЕ') : '← В МЕНЮ'}</button>
          <button class="ghost" id="metaRespec">⟲ Сбросить улучшения</button>
          <button class="ghost" id="metaReset">Сбросить прогресс</button>
        </div>
      </div>`, { locked: false });
    this.screen.querySelectorAll('.m-buy').forEach(b => b.onclick = () => {
      const m = META_BY_ID[b.dataset.id];
      const lv = SAVE.meta[m.id] || 0;
      if (lv >= m.max) return;
      const cost = metaCost(m, lv);
      if (SAVE.coins < cost) { Sfx.deny(); return; }
      SAVE.coins -= cost;
      SAVE.meta[m.id] = lv + 1;
      markSave(); Sfx.buy();
      if (G) recomputeStats(false);
      this.showMeta(this._metaFrom);
    });
    $('#metaBack').onclick = () => this.metaBack();
    this._onEsc = () => this.metaBack();
    $('#metaRespec').onclick = () => {
      const back = metaRefundTotal();
      if (back <= 0) { Sfx.deny(); this.toast('Вложенных улучшений нет'); return; }
      this.showConfirm({
        title: 'Сбросить улучшения?',
        hint: 'Все постоянные улучшения будут сняты, а ' + fmt(back) + ' золотых вернутся в кошелёк.',
        yesLabel: '⟲ СБРОСИТЬ',
        onNo: () => this.showMeta(this._metaFrom),
        onYes: () => {
          SAVE.meta = {};
          SAVE.coins += back;
          markSave(); flushSave(); Sfx.buy();
          if (G) recomputeStats(false);
          this.showMeta(this._metaFrom);
          this.toast('Улучшения сброшены, возвращено ' + fmt(back) + ' золотых');
        }
      });
    };
    $('#metaReset').onclick = () => {
      this.showConfirm({
        title: 'Удалить весь прогресс?',
        hint: 'Монеты, улучшения, лаборатория и рекорды будут стёрты безвозвратно.',
        yesLabel: '✕ СТЕРЕТЬ',
        onNo: () => this.showMeta(this._metaFrom),
        onYes: () => { Store.clear(); SAVE = DEFAULT_SAVE(); loadSave(); this.showMenu(); }
      });
    };
  },

  showLab(from) {
    this._labFrom = from || 'menu';
    const rows = LAB.map(m => {
      const lv = (SAVE.lab || {})[m.id] || 0;
      const maxed = lv >= m.max;
      const cost = labCost(m, lv);
      const pips = Array.from({ length: m.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      return `<div class="mrow ${maxed ? 'maxed' : ''} ${SAVE.coins < cost && !maxed ? 'poor' : ''}">
        <div class="m-ico">${m.icon}</div>
        <div class="m-body">
          <div class="m-name">${m.name} <span class="pips">${pips}</span></div>
          <div class="m-desc">${m.d(Math.max(1, lv))}${lv > 0 ? ' <b class="now">сейчас: ' + m.d(lv) + '</b>' : ''}</div>
        </div>
        <button class="m-buy" data-id="${m.id}" ${maxed || SAVE.coins < cost ? 'disabled' : ''}>${maxed ? 'МАКС' : '<span class="coin">◉</span>' + fmt(cost)}</button>
      </div>`;
    }).join('');
    this.setScreen(`
      <div class="panel-modal meta lab">
        <h2>Лаборатория <span class="wallet"><span class="coin">◉</span> ${fmt(SAVE.coins)}</span></h2>
        <p class="hint">Передовые экспериментальные модули: эффекты лавки забега, но ~в 1.5 раза сильнее за уровень и ~в 5 раз дороже. Действуют во всех забегах. Есть оригинальные разработки.</p>
        <div class="meta-list">${rows}</div>
        <div class="modal-btns">
          <button class="big" id="labBack">${G ? (G.state === 'dead' ? '← К РЕЗУЛЬТАТАМ' : 'К ИГРЕ') : '← В МЕНЮ'}</button>
          <button class="ghost" id="labRespec">⟲ Сбросить эксперименты</button>
        </div>
      </div>`, { locked: false });
    this.screen.querySelectorAll('.m-buy').forEach(b => b.onclick = () => {
      const m = LAB_BY_ID[b.dataset.id];
      const lv = (SAVE.lab || {})[m.id] || 0;
      if (lv >= m.max) return;
      const cost = labCost(m, lv);
      if (SAVE.coins < cost) { Sfx.deny(); return; }
      SAVE.coins -= cost;
      SAVE.lab[m.id] = lv + 1;
      markSave(); Sfx.buy();
      if (G) recomputeStats(false);
      this.showLab(this._labFrom);
    });
    $('#labBack').onclick = () => this.labBack();
    this._onEsc = () => this.labBack();
    $('#labRespec').onclick = () => {
      const back = labRefundTotal();
      if (back <= 0) { Sfx.deny(); this.toast('Экспериментов пока нет'); return; }
      this.showConfirm({
        title: 'Сбросить эксперименты?',
        hint: 'Все исследования лаборатории будут сняты, а ' + fmt(back) + ' золотых вернутся в кошелёк.',
        yesLabel: '⟲ СБРОСИТЬ',
        onNo: () => this.showLab(this._labFrom),
        onYes: () => {
          SAVE.lab = {};
          SAVE.coins += back;
          markSave(); flushSave(); Sfx.buy();
          if (G) recomputeStats(false);
          this.showLab(this._labFrom);
          this.toast('Эксперименты сброшены, возвращено ' + fmt(back) + ' золотых');
        }
      });
    };
    this.renderStats();
  },

  /* ---------- МАГАЗИН: НАБОРЫ ЗОЛОТА ЗА ЯНЫ (Яндекс Игры) ---------- */
  showYanShop() {
    const rows = YAN_PACKS.map(p => {
      const item = YA.catalog.find(i => i.id === p.id);
      const price = item ? (item.priceValue + ' ' + (item.priceCurrency || 'ЯН')) : 'цена в ЯН на платформе';
      return `<div class="mrow">
        <div class="m-ico">${p.icon}</div>
        <div class="m-body">
          <div class="m-name">${p.name}</div>
          <div class="m-desc">+${fmt(p.gold)} золота в кошелёк постоянных улучшений</div>
        </div>
        <button class="m-buy" data-id="${p.id}" ${YA.payments ? '' : 'disabled'}>${price}</button>
      </div>`;
    }).join('');
    this.setScreen(`
      <div class="panel-modal meta">
        <h2>Золото за яны <span class="wallet"><span class="coin">◉</span> ${fmt(SAVE.coins)}</span></h2>
        <p class="hint">Покупки совершаются на платформе Яндекс Игр за внутреннюю валюту — яны.
        Золото попадает в кошелёк постоянных улучшений и работает во всех забегах.</p>
        <div class="meta-list">${rows}</div>
        <div class="modal-btns"><button class="big" id="yanBack">← В МЕНЮ</button></div>
      </div>`, { locked: false });
    this.screen.querySelectorAll('.m-buy').forEach(b => b.onclick = () => {
      b.disabled = true;
      YA.buy(b.dataset.id, (ok) => {
        if (ok) { Sfx.buy(); this.showYanShop(); this.toast('Золото зачислено!'); }
        else { b.disabled = false; this.toast('Покупка не завершилась'); }
      });
    });
    $('#yanBack').onclick = () => this.showMenu();
    this._onEsc = () => this.showMenu();
  },

  /* ---------- ТАБЛИЦА ЛИДЕРОВ ЯНДЕКС ИГР ---------- */
  showLeaderboard() {
    this.setScreen(`
      <div class="panel-modal small">
        <h2>🏆 ЛУЧШИЕ ВОЛНЫ АДА</h2>
        <p class="hint">В таблицу попадают только рекорды со сложности «Ад».</p>
        <div id="lbBody" class="pop-body"><div class="st-row"><span>Загрузка таблицы…</span><b></b></div></div>
        <div class="modal-btns"><button class="big" id="lbBack">← НАЗАД</button></div>
      </div>`, { locked: false });
    this._onEsc = () => { if (G) this.closeModal(); else this.showMenu(); };
    $('#lbBack').onclick = () => this._onEsc();
    YA.getTop(10, (rows) => {
      const body = $('#lbBody');
      if (!body) return;
      if (!rows) {
        body.innerHTML =
          '<div class="st-row"><span>Таблица платформы недоступна (оффлайн-режим)</span><b></b></div>' +
          '<div class="st-row"><span>Ваш рекорд</span><b>' + (SAVE.best.wave || 0) + ' волна</b></div>';
        return;
      }
      const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
      body.innerHTML = rows.length
        ? rows.map(r => '<div class="st-row"><span>' + r.rank + '. ' + esc(r.name) + '</span><b>' + r.score + ' волна</b></div>').join('')
        : '<div class="st-row"><span>Таблица пока пуста — станьте первым!</span><b></b></div>';
    });
  },

  openPause() {
    this.leftCol.classList.add('hidden');   // на паузе панели башни и волны не мешают
    this.setScreen(`
      <div class="panel-modal small">
        <h2>Пауза</h2>
        <div class="pause-stats">
          <span>Волна <b>${G.wave}</b></span><span>Убийств <b>${G.stats.kills}</b></span>
          <span>Монет забега <b>${fmt(G.purse || 0)}</b></span><span>Время <b>${mmss(G.runTime)}</b></span>
        </div>
        <div class="modal-btns">
          <button class="big play" id="pResume">▶ ПРОДОЛЖИТЬ</button>
          <button class="big" id="pQuit">⏻ В МЕНЮ</button>
        </div>
      </div>`, { locked: true });
    $('#pResume').onclick = () => togglePause();
    $('#pQuit').onclick = () => this.showQuitConfirm();
  },
  closePause() { this.closeModal(); if (G) this.leftCol.classList.remove('hidden'); },

  /* Красивое подтверждение выхода в меню в общем стиле игры
     (вместо системного окна confirm) */
  showQuitConfirm() {
    const D = DIFFS[G.diff];
    const reward = Math.round((6 + G.wave * 5.5 + G.stats.kills * 0.12 + G.stats.bosses * 18) * D.coins);
    const silver = Math.max(0, Math.round((G.purse || 0) - (G.testLeft || 0) - (G.allowLeft || 0)));
    this.setScreen(`
      <div class="panel-modal small">
        <h2>Покинуть забег?</h2>
        <div class="pause-stats">
          <span>Волна <b>${G.wave}</b></span><span>Убийств <b>${G.stats.kills}</b></span>
          <span>Награда <b>+${fmt(reward)}</b></span><span>Серебро <b>${fmt(silver)}</b></span>
        </div>
        <p class="hint">Награда за забег и непотраченное серебро уйдут в кошелёк —
        столько же, сколько при гибели башни.</p>
        <div class="modal-btns">
          <button class="big play" id="qStay">▶ ОСТАТЬСЯ</button>
          <button class="big ghost" id="qQuit">⌂ В МЕНЮ</button>
        </div>
      </div>`, { locked: true });
    $('#qStay').onclick = () => this.openPause();
    $('#qQuit').onclick = () => { this.closeModal(); this.toMenu(); };
  },

  /* Универсальное внутриигровое подтверждение в общем стиле (вместо системного confirm) */
  showConfirm(o) {
    this.setScreen(`
      <div class="panel-modal small">
        <h2>${o.title}</h2>
        <p class="hint">${o.hint}</p>
        <div class="modal-btns">
          <button class="big" id="cfNo">← НАЗАД</button>
          <button class="big ghost" id="cfYes">${o.yesLabel}</button>
        </div>
      </div>`, { locked: true });
    $('#cfNo').onclick = () => o.onNo();
    $('#cfYes').onclick = () => o.onYes();
  },

  showResults(reward, transfer, silver) {
    transfer = transfer || 0;
    silver = silver || 0;
    this._lastReward = reward; this._lastTransfer = transfer; this._lastSilver = silver;
    this._adUsed = false;   // одна rewarded-реклама на забег
    const D = DIFFS[G.diff];
    const newRecord = G.wave >= SAVE.best.wave && G.wave > 0;
    const s = G.stats;
    this.hud.classList.add('hidden');
    this.invBar.classList.add('hidden');
    this.bossBar.classList.add('hidden');
    this._shopOpen = false; this.shop.classList.add('hidden');
    this.leftCol.classList.add('hidden');
    this.setScreen(`
      <div class="panel-modal results">
        <h2 class="dead">БАШНЯ РАЗРУШЕНА</h2>
        <div class="res-grid">
          <div class="res"><small>Волн отбито</small><b>${G.wave}</b></div>
          <div class="res"><small>Убийств</small><b>${fmt(s.kills)}</b></div>
          <div class="res"><small>Боссов</small><b>${s.bosses}</b></div>
          <div class="res"><small>Урона нанесено</small><b>${fmt(s.dmg)}</b></div>
          <div class="res"><small>Построек</small><b>${s.structsBuilt}</b></div>
          <div class="res"><small>Время</small><b>${mmss(G.runTime)}</b></div>
        </div>
        <div class="res-reward">
          <div>Награда за забег <b>+${fmt(reward)}</b> <span class="coin">◉</span> <small>(${D.name}, ×${D.coins})</small></div>
          ${silver > 0 ? '<div>Остаток забега: <b>' + fmt(silver) + '</b> сер. → <b>+' + fmt(transfer) + '</b> зол. <small>(курс 1:100)</small></div>' : ''}
          <div class="wallet-big">В кошельке: <b>${fmt(SAVE.coins)}</b> <span class="coin">◉</span> <small>золотых</small></div>
        </div>
        ${newRecord ? '<div class="record">🏆 НОВЫЙ РЕКОРД!</div>' : ''}
        <div class="modal-btns">
          ${YA.available ? '<button class="big play" id="rAd">📺 РЕКЛАМА: ×2 НАГРАДА</button>' : ''}
          <button class="big play" id="rAgain">↻ ЕЩЁ РАЗ</button>
          <button class="big" id="rMeta">🛒 ВЛОЖИТЬ МОНЕТЫ</button>
          <button class="big" id="rLab">🧪 ЛАБОРАТОРИЯ</button>
          <button class="big" id="rMenu">⌂ В МЕНЮ</button>
        </div>
      </div>`, { locked: true });
    const rAd = $('#rAd');
    if (rAd) rAd.onclick = () => {
      if (this._adUsed) return;
      this._adUsed = true;
      rAd.disabled = true; rAd.textContent = '📺 РЕКЛАМА...';
      const bonus = this._lastReward || 0;
      YA.showRewarded(() => {
        SAVE.coins += bonus; markSave(); flushSave();
        this.showResults(this._lastReward, this._lastTransfer, this._lastSilver);
        this.toast('+' + fmt(bonus) + ' золота за просмотр!');
      }, () => {
        this._adUsed = false;
        this.showResults(this._lastReward, this._lastTransfer, this._lastSilver);
        this.toast('Реклама не загрузилась — бонус недоступен');
      });
    };
    $('#rAgain').onclick = () => { this.closeModal(); startRun(); };
    $('#rMeta').onclick = () => this.showMeta('results');
    $('#rLab').onclick = () => this.showLab('results');
    $('#rMenu').onclick = () => { this.closeModal(); this.toMenu(); };
  },

  toMenu() {
    let reward = 0;
    YA.gameplayStop();
    if (G && !G.banked) {
      if (G.state !== 'dead') reward = bankRunProgress();   // столько же золота, сколько при гибели башни
      bankRunCoins();
    }
    G = null;
    this.closeModal();
    this.closeShop();
    this.showMenu();
    if (reward > 0) this.toast('Забег засчитан: +' + fmt(reward) + ' золотых');
  },

  showBoss(e) { this._bossLast = -1; this.bossTick(); }
};

/* ---------- цены ремонта и покупок ---------- */
/* Полная сумма, вложенная в постоянные улучшения (для возврата при сбросе) */
function metaRefundTotal() {
  let total = 0;
  for (const m of META) {
    const lv = SAVE.meta[m.id] || 0;
    for (let i = 0; i < lv; i++) total += metaCost(m, i);
  }
  return total;
}
/* Сумма, вложенная в лабораторию (возврат при сбросе экспериментов) */
function labRefundTotal() {
  let total = 0;
  for (const m of LAB) {
    const lv = (SAVE.lab || {})[m.id] || 0;
    for (let i = 0; i < lv; i++) total += labCost(m, i);
  }
  return total;
}
function repairCost() {
  return Math.max(10, Math.round((45 + G.wave * 6) * G.S.priceMult));
}
function buyRepair() {
  if (G.state !== 'build') return;   // ремонт — только между волнами
  if (G.tower.hp >= G.tower.maxHp - 0.5) { UI.toast('Башня цела'); Sfx.deny(); return; }
  const price = repairCost();
  if (!spendCoins(price)) { Sfx.deny(); UI.toast('Не хватает монет'); return; }
  const heal = Math.round(G.tower.maxHp * 0.35);
  G.tower.hp = Math.min(G.tower.maxHp, G.tower.hp + heal);
  floatText(0, -60, '+' + heal + ' HP', '#7bd948', 20);
  burst(0, 0, 18, '#7bd948', 90);
  ring(0, 0, 60, '#7bd948', 0.5);
  Sfx.heal();
  UI.hudHp(); UI.renderShop();
}
function buyStruct(key) {
  if (G.state !== 'build' && G.state !== 'wave') return;
  const def = STRUCTS[key];
  if (countStructs(key) >= def.max) { UI.toast('Предел построек: ' + def.max); Sfx.deny(); return; }
  const price = structCost(key, G.S.priceMult * G.S.buildMul);
  if (!spendCoins(price)) { Sfx.deny(); UI.toast('Не хватает монет'); return; }
  G.inv[key] = (G.inv[key] || 0) + 1;
  G.placing = key;
  G.strike.aiming = false;
  Sfx.buy();
  UI.renderInv(); UI.hudAbility(); UI.renderShop();
  UI.toast(def.name + ' — выберите место (ПКМ — отмена)');
}

/* ---------- старт забега ---------- */
function startRun() {
  UI.closeModal();
  newRun();
  UI.hud.classList.remove('hidden');
  UI.leftCol.classList.remove('hidden');
  UI.hudAll();
  UI.openShop();
  UI.banner('НОВЫЙ ЗАБЕГ', DIFFS[G.diff].name + ' · монет: ' + fmt(SAVE.coins), DIFFS[G.diff].color);
  if (!SAVE.seenTutorial) { SAVE.seenTutorial = true; markSave(); setTimeout(() => UI.showHelp(true), 500); }
}
