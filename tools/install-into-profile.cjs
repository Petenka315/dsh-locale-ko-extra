// Register this plugin in a DSH profile's package.json (dependency + bundle layer).
//   node tools/install-into-profile.cjs [profileDir] [--revert]
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const profileDir = path.resolve(args[0] || path.join(os.homedir(), '.dsh', 'profiles', 'desktop'));
const packagePath = path.join(profileDir, 'package.json');
const backupDir = path.join(ROOT, 'backups');

if (!fs.existsSync(packagePath)) {
  console.error('no profile package.json at ' + packagePath);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const pluginName = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).name;
const linkSpec = 'link:' + ROOT.replace(/\\/g, '/');

if (args.includes('--revert')) {
  manifest.dependencies = manifest.dependencies || {};
  delete manifest.dependencies[pluginName];
  const bundles = manifest.dsh?.profile?.bundles;
  if (Array.isArray(bundles)) manifest.dsh.profile.bundles = bundles.filter((b) => b !== pluginName);
  fs.writeFileSync(packagePath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('removed', pluginName, 'from', packagePath);
  process.exit(0);
}

fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
for (const name of ['package.json', 'pnpm-lock.yaml']) {
  const from = path.join(profileDir, name);
  if (fs.existsSync(from)) {
    const to = path.join(backupDir, name.replace(/\./, '-' + stamp + '.'));
    fs.copyFileSync(from, to);
    console.log('backup :', to);
  }
}

manifest.dependencies = manifest.dependencies || {};
manifest.dependencies[pluginName] = linkSpec;

manifest.dsh = manifest.dsh || {};
manifest.dsh.profile = manifest.dsh.profile || {};
const bundles = Array.isArray(manifest.dsh.profile.bundles) ? manifest.dsh.profile.bundles : [];
if (!bundles.includes(pluginName)) bundles.push(pluginName);
manifest.dsh.profile.bundles = bundles;

fs.writeFileSync(packagePath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log('updated:', packagePath);
console.log('  dependency:', pluginName, '->', linkSpec);
console.log('  bundles   :', bundles.join(', '));
