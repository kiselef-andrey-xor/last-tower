/* =========================================================
   BOOT: запуск
   ========================================================= */
'use strict';

function boot() {
  canvas = document.getElementById('cv');
  ctx = canvas.getContext('2d', { alpha: false });
  loadSave();
  const sb = document.getElementById('btnSound');
  if (sb) sb.classList.toggle('off', !SAVE.sound);
  UI.init();
  bindInput();
  resize();
  requestAnimationFrame(frame);
  YA.init();    // SDK Яндекс Игр: реклама, покупки, облачные сейвы (без SDK — заглушки)
  YA.ready();   // игра загружена и показана — платформа убирает прелоадер

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      flushSave();   // сейв при сворачивании/закрытии вкладки
      if (G && G.state === 'wave' && !UI.modalOpen) togglePause(true);
    }
  });
  window.addEventListener('pagehide', flushSave);
  window.addEventListener('beforeunload', flushSave);
  window.addEventListener('pagehide', () => YA.writeCloudNow());
  if (Store.degraded()) {
    setTimeout(() => UI.toast('⚠ Хранилище браузера недоступно: прогресс живёт до закрытия вкладки. Откройте index.html в обычной вкладке браузера.'), 700);
  }
  // первый жест — включаем звук
  const kick = () => { Sfx.resume(); window.removeEventListener('pointerdown', kick); window.removeEventListener('keydown', kick); };
  window.addEventListener('pointerdown', kick);
  window.addEventListener('keydown', kick);

  /* запрет ландшафта на телефоне: подсказка «поверните» + автопауза забега */
  const orientGuard = () => {
    const phoneL = window.innerWidth < 980 && window.innerWidth > window.innerHeight;
    const hint = document.getElementById('rotateHint');
    if (hint) hint.classList.toggle('show', phoneL);
    if (phoneL && G && (G.state === 'wave' || G.state === 'build')) togglePause();
  };
  window.addEventListener('resize', orientGuard);
  if (window.matchMedia) {
    const mql = window.matchMedia('(orientation: landscape)');
    if (mql.addEventListener) mql.addEventListener('change', orientGuard);
  }
  orientGuard();
}

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
