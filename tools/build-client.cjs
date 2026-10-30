// Generate client.js from tools/client-template.js + base/ko.json + overrides.
//   node tools/build-client.cjs
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const basePath = path.join(ROOT, 'base', 'ko.json');
const overridesPath = path.join(ROOT, 'overrides', 'ko.overrides.json');
const templatePath = path.join(__dirname, 'client-template.js');
const outPath = path.join(ROOT, 'client.js');

if (!fs.existsSync(basePath)) {
  console.error('base/ko.json is missing. Run: node tools/sync-base.cjs <path to dsh-locale-ko/client.js>');
  process.exit(1);
}

const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8')).namespaces || {};
const template = fs.readFileSync(templatePath, 'utf8');

const clone = (group) => JSON.parse(JSON.stringify(group));
const core = clone(base.core || {});
const plugin = clone(base.plugin || {});

let added = 0, replaced = 0;
const newNamespaces = [];
for (const [namespace, entries] of Object.entries(overrides)) {
  const target = plugin[namespace] ? plugin : core;
  if (!target[namespace]) { target[namespace] = {}; newNamespaces.push(namespace); }
  for (const [key, value] of Object.entries(entries)) {
    if (Object.prototype.hasOwnProperty.call(target[namespace], key)) {
      if (target[namespace][key] !== value) replaced++;
    } else {
      added++;
    }
    target[namespace][key] = value;
  }
}

const source = template
  .replace('/*__CORE__*/ {}', JSON.stringify(core))
  .replace('/*__PLUGIN__*/ {}', JSON.stringify(plugin));

// Compile check before writing.
try {
  // eslint-disable-next-line no-new-func
  new Function('window', 'queueMicrotask', 'console', source);
} catch (error) {
  console.error('refusing to write: generated bundle does not compile: ' + error.message);
  process.exit(1);
}

fs.writeFileSync(outPath, source, 'utf8');

const count = (group) => Object.values(group).reduce((n, d) => n + Object.keys(d).length, 0);
console.log('base        :', base.meta ? 'dsh-locale-ko ' + base.meta.packVersion : 'unknown');
console.log('core        :', Object.keys(core).length, 'namespaces,', count(core), 'keys');
console.log('plugin      :', Object.keys(plugin).length, 'namespaces,', count(plugin), 'keys');
console.log('overrides   :', added, 'added,', replaced, 'changed');
if (newNamespaces.length) console.log('new         :', newNamespaces.join(', '));
console.log('written     :', outPath, '(' + fs.statSync(outPath).size + ' bytes)');
