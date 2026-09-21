/* =========================================================
   YANDEX GAMES: SDK, rewarded-реклама, покупки за яны, облачные сейвы.
   Без SDK (локальный запуск, dist с флешки) все методы — безопасные
   заглушки: игра полностью играбельна офлайн.
   ========================================================= */
'use strict';

const YA = {
  sdk: null,
  player: null,
  payments: null,
  catalog: [],
  available: false,
  _readyWanted: false,
  _readyDone: false,
  _cloudT: 0,
  _onAvail: null,

  /* SDK грузится внешним скриптом и может появиться не сразу — ждём до 2 сек */
  init() {
    const tryInit = (n) => {
      if (typeof YaGames !== 'undefined') {
        YaGames.init().then((sdk) => {
          this.sdk = sdk;
          this.available = true;
          if (this._readyWanted) this.ready();
          this._initPlayer();
          this._initPayments();
          this._initLb();
          if (this._onAvail) { try { this._onAvail(); } catch (e) { } }
        }).catch(() => { });
      } else if (n < 10) {
        setTimeout(() => tryInit(n + 1), 200);
      }
    };
    tryInit(0);
  },

  /* игра загружена и показана — платформе можно убирать прелоадер */
  ready() {
    this._readyWanted = true;
    if (!this.sdk || this._readyDone) return;
    this._readyDone = true;
    try { this.sdk.features.LoadingAPI.ready(); } catch (e) { }
  },

  /* границы геймплея: между ними платформа не показывает рекламу */
  gameplayStart() { if (this.sdk) { try { this.sdk.features.GameplayAPI.start(); } catch (e) { } } },
  gameplayStop() { if (this.sdk) { try { this.sdk.features.GameplayAPI.stop(); } catch (e) { } } },

  /* ---------- REWARDED: «посмотри рекламу — получи бонус» ---------- */
  showRewarded(onReward, onFail) {
    if (!this.sdk || !this.sdk.adv) { if (onFail) onFail(); return false; }
    let rewarded = false;
    try {
      this.sdk.adv.showRewardedVideo({
        callbacks: {
          onOpen: () => { },
          onRewarded: () => { rewarded = true; },
          onClose: () => { if (rewarded && onReward) onReward(); else if (!rewarded && onFail) onFail(); },
          onError: () => { if (onFail) onFail(); }
        }
      });
      return true;
    } catch (e) { if (onFail) onFail(); return false; }
  },

  /* ---------- ОБЛАЧНЫЕ СЕЙВЫ ИГРОКА ---------- */
  _initPlayer() {
    if (!this.sdk.getPlayer) return;
    this.sdk.getPlayer({ scopes: false }).then((player) => {
      this.player = player;
      return player.getData();
    }).then((data) => {
      this._mergeCloud(data);
    }).catch(() => { });
  },
  _mergeCloud(c) {
    const s = c && c.save;
    if (!s || typeof s !== 'object') return;
    const base = DEFAULT_SAVE();
    const next = Object.assign(base, s);
    next.meta = Object.assign({}, s.meta);
    next.lab = Object.assign({}, s.lab);
    next.best = Object.assign(base.best, s.best);
    next.bestByDiff = Object.assign({}, s.bestByDiff);
    next.stats = Object.assign(base.stats, s.stats);
    // монеты и рекорды не понижайте: вдруг локально наиграли больше
    next.coins = Math.max(SAVE.coins || 0, s.coins || 0);
    if ((SAVE.best.wave || 0) > (next.best.wave || 0)) next.best.wave = SAVE.best.wave;
    for (const k in (SAVE.bestByDiff || {})) {
      next.bestByDiff[k] = Math.max(next.bestByDiff[k] || 0, SAVE.bestByDiff[k] || 0);
    }
    SAVE = next;
    markSave(); flushSave();
    if (typeof UI !== 'undefined' && !G) UI.showMenu();
  },
  /* дебаунс: не пишем в облако на каждый чих, раз в 3 секунды максимум */
  scheduleCloud() {
    if (!this.player || this._cloudT) return;
    this._cloudT = setTimeout(() => { this._cloudT = 0; this.writeCloudNow(); }, 3000);
  },
  writeCloudNow() {
    if (this._cloudT) { clearTimeout(this._cloudT); this._cloudT = 0; }
    if (!this.player) return;
    try { this.player.setData({ save: JSON.parse(JSON.stringify(SAVE)) }, true); } catch (e) { }
  },

  /* ---------- ПОКУПКИ ЗА ЯНЫ: наборы золота ---------- */
  _initPayments() {
    if (!this.sdk.getPayments) return;
    this.sdk.getPayments().then((p) => {
      this.payments = p;
      return p.getCatalog();
    }).then((cat) => {
      this.catalog = (cat && cat.items) || [];
    }).catch(() => { });
  },
  /* покупка: грант золота -> обязательный consume токена */
  buy(itemId, onDone) {
    if (!this.payments) { if (onDone) onDone(false); return false; }
    this.payments.purchase({ id: itemId }).then((purchase) => {
      const pack = YAN_PACKS.find(p => p.id === itemId);
      if (pack) {
        SAVE.coins += pack.gold;
        markSave(); flushSave();
      }
      if (purchase && purchase.purchaseToken) this.payments.consume(purchase.purchaseToken);
      if (onDone) onDone(!!pack);
    }).catch(() => { if (onDone) onDone(false); });
    return true;
  },

  /* ---------- ТАБЛИЦА ЛИДЕРОВ ----------
   Имя доски в консоли: bestwawe (маска [a-zA-Z0-9]); счёт = волна на сложности Ад. */
  lb: null,
  _initLb() {
    if (this.sdk && this.sdk.getLeaderboards) {
      this.sdk.getLeaderboards().then((lb) => { this.lb = lb; }).catch(() => { });
    }
  },
  submitScore(v) {
    if (this.lb) { try { this.lb.setScore('bestwawe', v); } catch (e) { } }
  },
  getTop(n, cb) {
    if (!this.lb) { cb(null); return; }
    this.lb.getEntries('bestwawe', { quantityTop: n || 10, includeUser: true })
      .then((res) => {
        const rows = (res && res.entries) || [];
        cb(rows.map((e) => ({
          rank: e.rank,
          score: e.score,
          name: (e.player && (e.player.publicName || e.player.name)) || '???'
        })));
      })
      .catch(() => cb(null));
  }
};
