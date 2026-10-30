// Behavioral test for client.js against a mock of the locale runtime.
//   node tools/test-client.cjs
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const overrides = JSON.parse(fs.readFileSync(path.join(ROOT, 'overrides', 'ko.overrides.json'), 'utf8')).namespaces || {};
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'base', 'ko.json'), 'utf8'));
const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

let failures = 0;
function check(name, condition, detail) {
  if (condition) { console.log('  ok   ' + name); return; }
  failures++;
  console.log('  FAIL ' + name + (detail ? ' :: ' + detail : ''));
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

function createLocale(active = 'ko') {
  const dicts = new Map();
  const listeners = new Set();
  const catalog = new Map([['en', { id: 'en', label: 'English' }]]);
  const locale = {
    dicts,
    catalog,
    snapshot: Object.freeze({ active, locales: [], revision: 0 }),
    publish(nextActive) {
      const locales = [...catalog.values()];
      locale.snapshot = Object.freeze({ active: nextActive, locales, revision: locale.snapshot.revision + 1 });
      for (const fn of [...listeners]) fn();
    },
    getSnapshot() { return locale.snapshot; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    addLanguage(definition) {
      if (catalog.has(definition.id)) throw new Error('locale "' + definition.id + '" is already registered');
      if (!definition.fallback || !catalog.has(definition.fallback)) throw new Error('unknown fallback');
      catalog.set(definition.id, definition);
      locale.publish(locale.snapshot.active, false);
      return () => { catalog.delete(definition.id); };
    },
    register(ns, language, dict) {
      let byLanguage = dicts.get(ns);
      if (!byLanguage) { byLanguage = new Map(); dicts.set(ns, byLanguage); }
      if (byLanguage.has(language)) throw new Error(`locale namespace "${ns}" already has locale "${language}"`);
      byLanguage.set(language, dict);
      locale.publish(locale.snapshot.active, false);
      return () => byLanguage.delete(language);
    },
    lookup(ns, key) {
      const byLanguage = dicts.get(ns);
      if (!byLanguage) return undefined;
      for (const language of [locale.snapshot.active, 'ko']) {
        const dict = byLanguage.get(language);
        if (dict && dict[key] !== undefined) return dict[key];
      }
      return undefined;
    },
    languageIds() { return [...catalog.keys()]; },
  };
  return locale;
}

function loadPlugin(locale) {
  let definition;
  const window = { __ModuleLoader__: { load: (d) => { definition = d; } } };
  const fn = new Function('window', 'queueMicrotask', 'setTimeout', 'clearTimeout', 'console', source);
  fn(window, (cb) => Promise.resolve().then(cb), setTimeout, clearTimeout, { log() {}, info() {}, warn() {}, error() {} });
  const plugin = definition.factory();
  const disposers = [];
  const ctx = {
    locale,
    effect(factory) {
      const disposer = factory();
      if (typeof disposer === 'function') disposers.push(disposer);
      return () => {};
    },
  };
  plugin.apply(ctx);
  return { definition, plugin, ctx, disposeAll() { for (const dispose of disposers.splice(0)) dispose(); } };
}

function countKorean(locale) {
  let n = 0;
  for (const byLanguage of locale.dicts.values()) if (byLanguage.has('ko')) n++;
  return n;
}

const overrideOnly = Object.keys(overrides).filter((ns) => !base.core[ns] && !base.plugin[ns]);
const coreNamespaces = Object.keys(base.core).length + overrideOnly.length;
const firstEntry = (group) => {
  const [ns, dict] = Object.entries(group)[0];
  const [key, value] = Object.entries(dict)[0];
  return { ns, key, value };
};

(async () => {
  console.log('package:', pkg.name, pkg.version);

  console.log('\ncase 1 — standalone (dsh-locale-ko disabled)');
  {
    const locale = createLocale();
    loadPlugin(locale);
    await flush();
    check('language not registered before the deferred install', true);
    check('registers the ko language', locale.languageIds().includes('ko'), locale.languageIds().join(','));
    check('registers every core namespace', countKorean(locale) === coreNamespaces, countKorean(locale) + '/' + coreNamespaces);
    const picked = firstEntry(base.core);
    check('base string present', locale.lookup(picked.ns, picked.key) === picked.value, picked.ns + '/' + picked.key);
    const over = firstEntry(overrides);
    check('override present', locale.lookup(over.ns, over.key) === over.value, over.ns + '/' + over.key);
    check('third-party namespaces stay unclaimed', !locale.dicts.has(Object.keys(base.plugin)[0]));
  }

  console.log('\ncase 2 — overlay (dsh-locale-ko enabled first)');
  {
    const locale = createLocale();
    locale.addLanguage({ id: 'ko', label: '한국어', fallback: 'en' });
    const packDicts = new Map();
    for (const [ns, dict] of Object.entries(base.core)) {
      const owned = Object.assign({ 'upstream.only': '원본' }, dict);
      packDicts.set(ns, owned);
      locale.register(ns, 'ko', owned);
    }
    const before = countKorean(locale);
    loadPlugin(locale);
    await flush();
    check('does not add a second language', locale.languageIds().filter((id) => id === 'ko').length === 1);
    check('only the missing namespaces are registered', countKorean(locale) === before + overrideOnly.length, countKorean(locale) + ' vs ' + (before + overrideOnly.length));
    let replaced = 0;
    for (const [ns, owned] of packDicts) if (locale.dicts.get(ns).get('ko') !== owned) replaced++;
    check('existing dictionaries are merged, not replaced', replaced === 0);
    const over = firstEntry(overrides);
    check('override merged', locale.lookup(over.ns, over.key) === over.value, over.ns + '/' + over.key);
    const picked = firstEntry(base.core);
    check('upstream string kept', locale.lookup(picked.ns, 'upstream.only') === '원본');
    check('upstream base string kept', locale.lookup(picked.ns, picked.key) === picked.value);
  }

  console.log('\ncase 3 — a pack activating in the same boot pass, after this plugin, wins');
  {
    const locale = createLocale();
    loadPlugin(locale);                       // defers its install by one turn
    locale.addLanguage({ id: 'ko', label: '한국어', fallback: 'en' });
    const packDicts = new Map();
    for (const [ns, dict] of Object.entries(base.core)) {
      const owned = Object.assign({}, dict);
      packDicts.set(ns, owned);
      locale.register(ns, 'ko', owned);
    }
    const before = countKorean(locale);
    await flush();                            // our deferred install now runs
    check('pack keeps ownership (no duplicate registration)', countKorean(locale) === before + overrideOnly.length, countKorean(locale) + ' vs ' + (before + overrideOnly.length));
    let replaced = 0;
    for (const [ns, owned] of packDicts) if (locale.dicts.get(ns).get('ko') !== owned) replaced++;
    check('pack dictionaries untouched as objects', replaced === 0);
    const over = firstEntry(overrides);
    check('our strings still merged', locale.lookup(over.ns, over.key) === over.value);
  }

  console.log('\ncase 4 — disabling the plugin undoes its changes');
  {
    const locale = createLocale();
    const { disposeAll } = loadPlugin(locale);
    await flush();
    const over = firstEntry(overrides);
    check('override present before disable', locale.lookup(over.ns, over.key) !== undefined);
    disposeAll();
    check('language removed', !locale.languageIds().includes('ko'));
    check('override gone', locale.lookup(over.ns, over.key) === undefined);
  }

  console.log('\ncase 5 — runtime without a dictionary table degrades quietly');
  {
    const locale = { snapshot: { active: 'ko', revision: 0 }, subscribe: () => () => {}, publish() {}, getSnapshot() { return this.snapshot; } };
    let crashed = false;
    try { loadPlugin(locale); } catch { crashed = true; }
    await flush();
    check('no throw', !crashed);
  }

  console.log(failures ? '\nRESULT: ' + failures + ' failure(s)' : '\nRESULT: OK');
  process.exit(failures ? 1 : 0);
})();
