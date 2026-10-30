// Dump every client bundle from a DSH app.asar so the English dictionaries can be extracted.
//   node tools/dump-clients.cjs "<install>/resources/app.asar" .cache/cores
const fs = require('fs');
const path = require('path');
const { open, read } = require('./asar-lib.cjs');

const ASAR = process.argv[2];
const OUT = process.argv[3] || '.cache/cores';
if (!ASAR) {
  console.error('usage: node tools/dump-clients.cjs <app.asar> [outDir]');
  process.exit(1);
}
const h = open(ASAR);
const hits = h.all.filter((e) => /\/lib\/client\.js$/.test(e.path));
console.log('client bundles:', hits.length);
fs.mkdirSync(OUT, { recursive: true });
for (const e of hits) {
  const m = e.path.match(/^dsh\/node_modules\/(.+?)\/lib\/client\.js$/);
  const pkg = m ? m[1].replace(/\//g, '__') : 'unknown';
  fs.writeFileSync(path.join(OUT, pkg + '__client.js'), read(h, e));
}
const pkgEntry = h.all.find((e) => e.path === 'dsh/package.json');
if (pkgEntry) {
  const manifest = JSON.parse(read(h, pkgEntry).toString('utf8'));
  console.log('app version:', manifest.name, manifest.version);
}
console.log('written to:', path.resolve(OUT));
