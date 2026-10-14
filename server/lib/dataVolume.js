const fs = require('fs');
const path = require('path');

// Warns when this app is running in a container whose data folder (or backup
// folder) isn't on storage that survives the container being recreated —
// the "I rebooted and my whole library was gone" failure. Everything the app
// keeps (the database, cached images) lives in one folder, so if that folder
// is just part of the container's own disposable filesystem, the next
// redeploy/update/stack change quietly starts it over empty.
//
// Works by reading how the folder is mounted (/proc/self/mountinfo) and
// recognising the cases that lose data:
//   container-layer    no mount at all — the folder is inside the container
//   anonymous-volume   Docker made a throwaway volume (the Dockerfile declares
//                      VOLUME /data, so an unmounted /data silently gets one):
//                      survives a restart, orphaned on recreate
//   memory             tmpfs/ramfs, including a host path that is itself RAM
// A bind mount or a named volume is fine. Anywhere that isn't a container
// (a normal install, the desktop app) is never warned about — a plain folder
// on a plain disk is persistent.

// Mount-point paths in /proc escape spaces and the like as \040 etc.
function decode(p) {
  return p.replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function parseMountinfo(text) {
  const mounts = [];
  for (const line of text.split('\n')) {
    const sep = line.indexOf(' - ');
    if (!line.trim() || sep < 0) continue;
    const left = line.slice(0, sep).split(' ');
    const right = line.slice(sep + 3).split(' ');
    mounts.push({ root: decode(left[3] || ''), mountPoint: decode(left[4] || ''), fsType: right[0], source: right[1] });
  }
  return mounts;
}

// The mount that actually holds `dir`: the one with the longest mount-point
// prefix (later entries win ties — a mount stacked over another replaces it).
function mountFor(mounts, dir) {
  let best = null;
  for (const m of mounts) {
    const mp = m.mountPoint;
    const covers = mp === '/' || dir === mp || dir.startsWith(mp.endsWith('/') ? mp : `${mp}/`);
    if (covers && (!best || mp.length >= best.mountPoint.length)) best = m;
  }
  return best;
}

// Docker names an anonymous volume with a random 64-character hex id.
const ANONYMOUS_VOLUME = /\/volumes\/[0-9a-f]{64}\/_data\/?$/;
const MEMORY_FILESYSTEMS = new Set(['tmpfs', 'ramfs']);

function classify(mounts, dir) {
  const m = mountFor(mounts, dir);
  if (!m) return { code: 'unknown', mountPoint: null };
  if (MEMORY_FILESYSTEMS.has(m.fsType)) return { code: 'memory', mountPoint: m.mountPoint };
  if (m.mountPoint === '/') return { code: 'container-layer', mountPoint: '/' };
  if (ANONYMOUS_VOLUME.test(m.root)) return { code: 'anonymous-volume', mountPoint: m.mountPoint };
  return { code: 'ok', mountPoint: m.mountPoint };
}

const PROBLEMS = {
  'container-layer': (what, dir) =>
    `${what} (${dir}) isn't on a mounted volume — it's inside the container itself, so it's lost whenever the container is recreated (an update, a redeploy, a stack change).`,
  'anonymous-volume': (what, dir) =>
    `${what} (${dir}) is on an anonymous Docker volume. It survives a restart, but when the container is recreated (an update, a redeploy, a stack change) a new empty one is made and everything looks wiped.`,
  memory: (what, dir) => `${what} (${dir}) is stored in memory (tmpfs), so it's lost on every reboot.`,
};

const FIX = ' Mount a folder on the host, or a named volume, at that path — see "Data & backups" in the README.';

// Pure so it can be tested with made-up mount tables. `inContainer` is
// decided by the caller from what it can see of the environment.
function analyze({ mountinfo, dataDir, backupDir, inContainer }) {
  if (!inContainer) return [];
  const mounts = parseMountinfo(mountinfo);
  const warnings = [];

  const data = classify(mounts, dataDir);
  if (PROBLEMS[data.code]) {
    warnings.push({ kind: 'data', code: data.code, message: PROBLEMS[data.code]('Your library data folder', dataDir) + FIX });
  }

  // Backups kept on the very same storage are covered by the warning above;
  // only call out a backup folder that's separately at risk.
  const backup = classify(mounts, backupDir);
  if (PROBLEMS[backup.code] && backup.mountPoint !== data.mountPoint) {
    warnings.push({ kind: 'backups', code: backup.code, message: PROBLEMS[backup.code]('Your backup folder', backupDir) + FIX });
  }
  return warnings;
}

function detectContainer(mountinfoText) {
  if (fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv')) return true;
  if (process.env.KUBERNETES_SERVICE_HOST) return true;
  // containerd/Kubernetes don't create /.dockerenv, but a container's root
  // filesystem is an overlay and a normal machine's isn't.
  const root = parseMountinfo(mountinfoText).find((m) => m.mountPoint === '/');
  return !!root && root.fsType === 'overlay';
}

function getStorageWarnings(dataDir, backupDir) {
  if (process.platform !== 'linux') return [];
  try {
    const mountinfo = fs.readFileSync('/proc/self/mountinfo', 'utf8');
    const resolve = (p) => {
      try {
        return fs.realpathSync(p);
      } catch {
        return path.resolve(p);
      }
    };
    return analyze({
      mountinfo,
      dataDir: resolve(dataDir),
      backupDir: resolve(backupDir),
      inContainer: detectContainer(mountinfo),
    });
  } catch {
    // Can't tell — never raise a warning on a guess.
    return [];
  }
}

module.exports = { getStorageWarnings, analyze, parseMountinfo, classify };
