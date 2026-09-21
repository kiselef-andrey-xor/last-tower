/* Прогон N сидов: медиана/разброс достигнутых волн авто-игроком */
const { spawnSync } = require('child_process');
const N = parseInt(process.argv[2] || '8', 10);
const res = [];
for (let s = 1; s <= N; s++) {
  const r0 = spawnSync('node', [__dirname + '/headless.js'], { env: Object.assign({}, process.env, { SEED: String(s) }), encoding: 'utf8', timeout: 240000 });
  const out = (r0.stdout || '') + (r0.stderr || '');
  const m = /волн:\s+(\d+)/.exec(out);
  const k = /убийств:\s+(\d+)/.exec(out);
  const b = /боссов:\s+(\d+)/.exec(out);
  res.push({ s, w: m ? +m[1] : -1, k: k ? +k[1] : 0, b: b ? +b[1] : 0 });
}
res.sort((a, b) => a.w - b.w);
console.log('сид | волна | убийств | боссов');
for (const r of res) console.log(String(r.s).padStart(3) + ' | ' + String(r.w).padStart(5) + ' | ' + String(r.k).padStart(7) + ' | ' + String(r.b).padStart(6));
const ws = res.map(r => r.w);
const med = ws[Math.floor(ws.length / 2)];
console.log('медиана волн: ' + med + ', мин ' + ws[0] + ', макс ' + ws[ws.length - 1]);
