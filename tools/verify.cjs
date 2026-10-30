// Check that base/ko.json + overrides cover every English key the app has,
// that placeholders survive, and that the generated bundle compiles.
//   node tools/verify.cjs
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const overrides = JSON.parse(fs.readFileSync(path.join(ROOT, 'overrides', 'ko.overrides.json'), 'utf8')).namespaces || {};
const reference = JSON.parse(fs.readFileSync(path.join(ROOT, 'reference', 'en-dicts.json'), 'utf8'));
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'base', 'ko.json'), 'utf8'));

let failures = 0;
const fail = (message) => { failures++; console.log('  FAIL ' + message); };
const ok = (message) => console.log('  ok   ' + message);

// 1. Override data sanity.
let overrideKeys = 0;
for (const [ns, entries] of Object.entries(overrides)) {
  for (const [key, value] of Object.entries(entries)) {
    overrideKeys++;
    if (typeof value !== 'string' || !value.trim()) fail('empty translation: ' + ns + ' / ' + key);
    if (value === key) fail('untranslated value: ' + ns + ' / ' + key);
  }
}
ok(overrideKeys + ' override entries in ' + Object.keys(overrides).length + ' namespaces');
if (base.meta) ok('base snapshot: dsh-locale-ko ' + base.meta.packVersion + ' (' + base.meta.coreNamespaces + ' core, ' + base.meta.pluginNamespaces + ' plugin)');
else fail('base/ko.json has no meta block; re-run tools/sync-base.cjs');

// 2. Compile the generated browser bundle.
try {
  // eslint-disable-next-line no-new-func
  new Function('window', 'queueMicrotask', 'console', fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8'));
  ok('client.js compiles');
} catch (error) {
  fail('client.js does not compile: ' + error.message);
}

// 3. Coverage: base snapshot plus overrides must answer every English key.
const lookup = (ns, key) => (overrides[ns] && overrides[ns][key])
  ?? (base.core[ns] && base.core[ns][key])
  ?? (base.plugin[ns] && base.plugin[ns][key]);

const tokens = (s) => new Set((String(s).match(/\{(\w+)\}/g) || []));
const sameTokens = (a, b) => a.size === b.size && [...a].every((t) => b.has(t));

let compared = 0;
const missing = [];
const mismatched = [];
for (const [ns, entry] of Object.entries(reference)) {
  for (const [key, english] of Object.entries(entry.en || {})) {
    if (/^\d+$/.test(key)) continue;
    compared++;
    const effective = lookup(ns, key);
    if (effective === undefined) { missing.push(ns + ' / ' + key); continue; }
    if (!sameTokens(tokens(english), tokens(effective))) mismatched.push(ns + ' / ' + key + ' :: ' + effective);
  }
}
if (missing.length) fail(missing.length + ' untranslated keys, e.g. ' + missing.slice(0, 5).join(', '));
else ok(compared + ' English keys all covered');
if (mismatched.length) fail(mismatched.length + ' placeholder mismatches, e.g. ' + mismatched.slice(0, 3).join(' | '));
else ok('placeholder parity');

console.log(failures ? '\nRESULT: ' + failures + ' failure(s)' : '\nRESULT: OK');
process.exit(failures ? 1 : 0);
