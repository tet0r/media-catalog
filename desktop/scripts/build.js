// npm run dist [-- <electron-builder args>]   builds the installer + portable
// npm run pack                                builds an unpacked app (--dir), fast
//
// The app's version comes from the repo-root VERSION file (the same one the
// server, the UI and the update check read), passed to electron-builder so
// the artifacts are named for it without anyone editing desktop/package.json.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const desktop = path.join(__dirname, '..');
const version = fs.readFileSync(path.join(desktop, '..', 'VERSION'), 'utf8').trim();

const prepared = spawnSync(process.execPath, [path.join(__dirname, 'prepare.js')], { stdio: 'inherit' });
if (prepared.status !== 0) process.exit(prepared.status || 1);

const passthrough = process.argv.slice(2);
// Publishing is the release workflow's job (it uploads to the GitHub
// release for the tag) — a local build should never try to.
if (!passthrough.some((a) => a.startsWith('--publish'))) passthrough.push('--publish', 'never');

const builderCli = require.resolve('electron-builder/cli.js', { paths: [desktop] });
const built = spawnSync(
  process.execPath,
  [builderCli, '--win', `-c.extraMetadata.version=${version}`, ...passthrough],
  { cwd: desktop, stdio: 'inherit' }
);
process.exit(built.status === null ? 1 : built.status);
