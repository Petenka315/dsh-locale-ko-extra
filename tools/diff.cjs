// Compare installed dsh-locale-ko dictionaries against the app's English dictionaries.
// Usage: node diff.cjs <koClientJs> <enDictsJson> <outJson>
const fs = require('fs');

function skipString(s, i) {
  const q = s[i]; i++;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') { i += 2; continue; }
    if (c === q) return i + 1;
    i++;
  }
  return i;
}
function matchBalanced(s, start) {
  const open = s[start];
  const close = open === '{' ? '}' : open === '(' ? ')' : ']';
  let depth = 0, i = start;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(s, i); continue; }
    if (c === '/' && s[i + 1] === '/') { const n = s.indexOf('\n', i); i = n < 0 ? s.length : n + 1; continue; }
    if (c === '/' && s[i + 1] === '*') { const n = s.indexOf('*/', i + 2); i = n < 0 ? s.length : n + 2; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return i + 1; }
    i++;
  }
  return -1;
}
function objectAfter(s, marker) {
  const at = s.indexOf(marker);
  if (at < 0) throw new Error('marker not found: ' + marker);
  const brace = s.indexOf('{', at + marker.length);
  const end = matchBalanced(s, brace);
  // eslint-disable-next-line no-new-func
  return new Function('return (' + s.slice(brace, end) + ')')();
}

const koSrc = fs.readFileSync(process.argv[2], 'utf8');
const dictionaries = objectAfter(koSrc, 'const dictionaries =');
const pluginDictionaries = objectAfter(koSrc, 'const pluginDictionaries =');
const enDicts = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));

const allKo = Object.assign({}, pluginDictionaries, dictionaries);
const isRealKey = (k) => !/^\d+$/.test(k);

const report = { missingNamespaces: [], partial: [], extraInKo: [], sameAsEnglish: [], totals: {} };
let totalKeys = 0, coveredKeys = 0, missingKeys = 0;

for (const [ns, entry] of Object.entries(enDicts)) {
  const en = entry.en || {};
  const keys = Object.keys(en).filter(isRealKey);
  const ko = allKo[ns];
  totalKeys += keys.length;
  if (!ko) {
    const sample = keys.map((k) => [k, en[k]]).slice(0, 5);
    report.missingNamespaces.push({ ns, keys: keys.length, sample });
    missingKeys += keys.length;
    continue;
  }
  const missing = [];
  for (const k of keys) {
    if (!(k in ko)) missing.push([k, en[k]]);
    else coveredKeys++;
  }
  missingKeys += missing.length;
  if (missing.length) report.partial.push({ ns, missing: missing.length, total: keys.length, sample: missing.slice(0, 5), all: missing });
}

for (const ns of Object.keys(allKo)) {
  if (!enDicts[ns]) report.extraInKo.push(ns);
}

for (const [ns, entry] of Object.entries(enDicts)) {
  const en = entry.en || {};
  const ko = allKo[ns];
  if (!ko) continue;
  for (const k of Object.keys(en).filter(isRealKey)) {
    if (ko[k] && ko[k] === en[k] && /[A-Za-z]/.test(en[k])) report.sameAsEnglish.push([ns, k, en[k]]);
  }
}

report.totals = {
  coreNamespaces: Object.keys(enDicts).length,
  koNamespaces: Object.keys(allKo).length,
  totalKeys,
  coveredKeys,
  missingKeys,
  missingNamespaces: report.missingNamespaces.length,
  partialNamespaces: report.partial.length,
  sameAsEnglish: report.sameAsEnglish.length,
};

fs.writeFileSync(process.argv[4], JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.totals, null, 2));
console.log('\nmissing namespaces:');
for (const m of report.missingNamespaces) console.log('  ' + m.ns + '  (' + m.keys + ')');
console.log('\npartial:');
for (const p of report.partial) console.log('  ' + p.ns + '  ' + p.missing + '/' + p.total);
console.log('\nsame-as-english:', report.sameAsEnglish.length);
