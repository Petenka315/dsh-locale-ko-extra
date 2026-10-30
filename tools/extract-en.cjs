// Extract English/Chinese dictionaries from generated DSH client bundles.
// Usage: node extract-en.cjs <dirWithClientJs> <outJson>
const fs = require('fs');
const path = require('path');

function skipString(s, i) {
  const q = s[i];
  i++;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') { i += 2; continue; }
    if (c === q) return i + 1;
    i++;
  }
  return i;
}

function skipComment(s, i) {
  if (s[i] === '/' && s[i + 1] === '/') {
    const n = s.indexOf('\n', i);
    return n < 0 ? s.length : n + 1;
  }
  if (s[i] === '/' && s[i + 1] === '*') {
    const n = s.indexOf('*/', i + 2);
    return n < 0 ? s.length : n + 2;
  }
  return i;
}

// Return index just past the balanced closer for the opener at `start`.
function matchBalanced(s, start) {
  const open = s[start];
  const close = open === '{' ? '}' : open === '(' ? ')' : ']';
  let depth = 0;
  let i = start;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(s, i); continue; }
    if (c === '/' && (s[i + 1] === '/' || s[i + 1] === '*')) { i = skipComment(s, i); continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return i + 1; }
    i++;
  }
  return -1;
}

function splitTopLevel(text) {
  const parts = [];
  let depth = 0, start = 0, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(text, i); continue; }
    if (c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) { i = skipComment(text, i); continue; }
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
    i++;
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

// Evaluate a JS object literal; free identifiers resolve through `objects`
// (bundle-local dictionary constants) and `strings`, otherwise to their own name.
function evalObject(text, strings, objects, depth = 0) {
  try {
    // eslint-disable-next-line no-new-func
    const v = new Function('return (' + text + ')')();
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  } catch { /* fall through to scoped evaluation */ }
  try {
    const scope = new Proxy({}, {
      has: () => true,
      get: (target, key) => {
        if (key === Symbol.unscopables) return undefined;
        if (typeof key !== 'string') return undefined;
        if (objects && objects.has(key) && depth < 4) {
          const nested = evalObject(objects.get(key), strings, objects, depth + 1);
          if (nested) return nested;
        }
        if (strings && strings.has(key)) return strings.get(key);
        return key;
      },
    });
    // eslint-disable-next-line no-new-func
    const v = new Function('scope', 'with (scope) { return (' + text + '); }')(scope);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  } catch { /* ignore */ }
  return null;
}

function collectBindings(s) {
  const objects = new Map(); // name -> object literal text
  const strings = new Map(); // name -> string literal value
  const objRe = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{/g;
  let m;
  while ((m = objRe.exec(s))) {
    const braceAt = objRe.lastIndex - 1;
    const end = matchBalanced(s, braceAt);
    if (end < 0) continue;
    objects.set(m[1], s.slice(braceAt, end));
  }
  const strRe = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'])((?:\\.|(?!\2).)*)\2/g;
  while ((m = strRe.exec(s))) {
    if (!strings.has(m[1])) strings.set(m[1], m[3].replace(/\\(.)/g, '$1'));
  }
  return { objects, strings };
}

function resolveString(expr, strings) {
  const t = expr.trim();
  if (/^["'][^"']*["']$/.test(t)) return t.slice(1, -1);
  if (strings.has(t)) return strings.get(t);
  return null;
}

const dir = process.argv[2];
const outFile = process.argv[3];
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
const result = {};
const report = [];

for (const f of files) {
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  const { objects, strings } = collectBindings(s);
  const regRe = /\.locale\.register\(/g;
  let m;
  while ((m = regRe.exec(s))) {
    const parenAt = m.index + m[0].length - 1;
    const end = matchBalanced(s, parenAt);
    if (end < 0) continue;
    const inner = s.slice(parenAt + 1, end - 1);
    const args = splitTopLevel(inner);
    if (args.length < 2) continue;
    const ns = resolveString(args[0], strings);
    if (!ns) { report.push(f + ': unresolved ns ' + args[0].slice(0, 40)); continue; }
    // arg 1 is either { zh, en } / { zh: {...}, en: {...} } or a lone dictionary object.
    const a1 = args[1].trim();
    let zh = null, en = null;
    const resolveDict = (expr) => {
      const t = expr.trim();
      if (!t.startsWith('{')) {
        return objects.has(t) ? evalObject(objects.get(t), strings, objects) : null;
      }
      // `{ zh, en }`, `{ zh: zh$1, en: en$1 }` or a flat `{ "key": "text" }` dictionary.
      const parts = splitTopLevel(t.slice(1, -1)).map((x) => x.trim());
      const out = {};
      for (const part of parts) {
        const kv = part.match(/^([A-Za-z_$][\w$]*)\s*:\s*([\s\S]+)$/);
        const key = kv ? kv[1] : part;
        const exprText = (kv ? kv[2] : part).trim();
        let v = null;
        if (exprText.startsWith('{')) v = evalObject(exprText, strings, objects);
        else if (strings.has(exprText)) v = strings.get(exprText);
        else if (objects.has(exprText)) v = evalObject(objects.get(exprText), strings, objects);
        if (v == null) continue;
        const base = key.replace(/\$\d+$/, '');
        if (base === 'zh' || base === 'en') out[base] = v;
        else out[key] = v;
      }
      return Object.keys(out).length ? out : null;
    };
    const obj = resolveDict(a1);
    if (obj && (obj.zh || obj.en)) { zh = obj.zh || null; en = obj.en || null; }
    else if (obj) { en = obj; } // flat English-only dictionary
    if (!en) report.push(f + ': no en for ' + ns);
    const entry = { file: f, en: en || null, zh: zh || null };
    if (result[ns]) entry.duplicate = true;
    result[ns] = Object.assign(result[ns] || {}, entry);
  }
}
fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log('namespaces:', Object.keys(result).length, 'files:', files.length);
console.log('unresolved notes:', report.length);
for (const r of report.slice(0, 20)) console.log(' -', r);
