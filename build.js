/* =========================================================
   BUILD: собирает однофайловую игру dist/index.html
   template.html + style.css + src/*.js  ->  dist/index.html
   Запуск: node build.js
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const ORDER = ['core.js', 'data.js', 'yandex.js', 'game.js', 'render.js', 'ui.js', 'boot.js'];

function read(p) { return fs.readFileSync(p, 'utf8'); }

const template = read(path.join(ROOT, 'template.html'));
const css = read(path.join(ROOT, 'style.css'));

const parts = ORDER.map(f => {
  const code = read(path.join(SRC, f));
  return '/* ===== ' + f + ' ===== */\n' + code;
});
const js = parts.join('\n\n');

// защита от преждевременного закрытия </script> внутри строк
const jsSafe = js.replace(/<\/script/gi, '<\\/script');

if (template.indexOf('/*__CSS__*/') < 0 || template.indexOf('/*__JS__*/') < 0) {
  console.error('! в template.html не найдены плейсхолдеры /*__CSS__*/ или /*__JS__*/');
  process.exit(1);
}

const html = template
  .replace('/*__CSS__*/', () => css)
  .replace('/*__JS__*/', () => jsSafe);

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
const out = path.join(DIST, 'index.html');
fs.writeFileSync(out, html);

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log('СОБРАНО: dist/index.html (' + kb + ' КБ)');
console.log('  css: ' + (css.length / 1024).toFixed(1) + ' КБ, js: ' + (js.length / 1024).toFixed(1) +
  ' КБ (' + ORDER.length + ' файлов: ' + ORDER.join(', ') + ')');
