// Snapshot the Korean dictionaries of an installed dsh-locale-ko into base/ko.json.
//   node tools/sync-base.cjs [path/to/dsh-locale-ko/client.js]
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const source = process.argv[2] || path.join(os.homedir(), '.dsh', 'profiles', 'desktop', 'node_modules', 'dsh-locale-ko', 'client.js');

function objectSpan(s, marker) {
  const at = s.indexOf(marker);
  if (at < 0) throw new Error('not a dsh-locale-ko bundle: missing "' + marker + '"');
  const brace = s.indexOf('{', at + marker.length);
  let depth = 0, i = brace, inStr = null;
  for (; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === '\\') i++; else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  // eslint-disable-next-line no-new-func
  return new Function('return (' + s.slice(brace, i + 1) + ')')();
}

const text = fs.readFileSync(source, 'utf8');
const core = objectSpan(text, 'const dictionaries =');
const plugin = objectSpan(text, 'const pluginDictionaries =');

let version = 'unknown';
const manifestPath = path.join(path.dirname(source), 'package.json');
if (fs.existsSync(manifestPath)) {
  try { version = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version || version; } catch { /* keep unknown */ }
}

const snapshot = {
  meta: {
    source,
    packVersion: version,
    syncedAt: new Date().toISOString(),
    coreNamespaces: Object.keys(core).length,
    pluginNamespaces: Object.keys(plugin).length,
  },
  core,
  plugin,
};

const out = path.join(ROOT, 'base', 'ko.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(snapshot, null, 2), 'utf8');

const count = (group) => Object.values(group).reduce((n, d) => n + Object.keys(d).length, 0);
console.log('source      :', source);
console.log('pack version:', version);
console.log('core        :', Object.keys(core).length, 'namespaces,', count(core), 'keys');
console.log('plugin      :', Object.keys(plugin).length, 'namespaces,', count(plugin), 'keys');
console.log('written     :', out);
