// Assembles desktop/app-server/ — the exact server code and built client the
// Docker image ships, laid out the way the Electron app expects:
//
//   app-server/index.js, db.js, lib/, routes/   <- ../server (no node_modules,
//                                                  data, logs)
//   app-server/public/                          <- ../client/dist
//   app-server/VERSION                          <- ../VERSION
//
// The server's own dependencies resolve from desktop/node_modules (the
// copy sits inside desktop/), which is where electron-builder rebuilds
// better-sqlite3 for Electron — so the two package.json dependency lists
// have to agree, and this fails loudly if they've drifted.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const desktop = path.join(__dirname, '..');
const root = path.join(desktop, '..');
const out = path.join(desktop, 'app-server');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function checkDependencies() {
  const server = readJson(path.join(root, 'server', 'package.json')).dependencies || {};
  const bundled = readJson(path.join(desktop, 'package.json')).dependencies || {};
  const problems = [];
  for (const [name, range] of Object.entries(server)) {
    if (bundled[name] !== range) problems.push(`${name}: server wants ${range}, desktop has ${bundled[name] || 'nothing'}`);
  }
  for (const name of Object.keys(bundled)) {
    if (!(name in server)) problems.push(`${name}: in desktop/package.json but not the server's`);
  }
  if (problems.length) {
    throw new Error(
      `desktop/package.json dependencies are out of sync with server/package.json:\n  ${problems.join('\n  ')}\n` +
        'Update desktop/package.json to match, run npm install in desktop/, and try again.'
    );
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function main() {
  checkDependencies();

  // Always rebuild the client so a packaged app can never carry a stale UI.
  console.log('Building the client...');
  execSync('npm install --no-audit --no-fund', { cwd: path.join(root, 'client'), stdio: 'inherit' });
  execSync('npm run build', { cwd: path.join(root, 'client'), stdio: 'inherit' });

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const file of ['index.js', 'db.js']) fs.copyFileSync(path.join(root, 'server', file), path.join(out, file));
  for (const dir of ['lib', 'routes']) copyDir(path.join(root, 'server', dir), path.join(out, dir));
  copyDir(path.join(root, 'client', 'dist'), path.join(out, 'public'));
  fs.copyFileSync(path.join(root, 'VERSION'), path.join(out, 'VERSION'));
  console.log(`Prepared ${path.relative(root, out)} (version ${fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim()})`);
}

main();
