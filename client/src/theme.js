import { api } from './api.js';

// 'system' follows the OS; 'light'/'dark' are explicit. Default is 'dark' —
// what the app has always looked like — not 'system', so nobody's existing
// install flips to light just because their OS happens to be light.
const KEY = 'theme';
const MODES = ['system', 'light', 'dark'];
const listeners = new Set();

export function getThemeMode() {
  try {
    const stored = localStorage.getItem(KEY);
    if (MODES.includes(stored)) return stored;
  } catch {
    /* storage blocked — fall through to the default */
  }
  return 'dark';
}

export function resolveTheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function paint(mode) {
  document.documentElement.dataset.theme = resolveTheme(mode);
  // Desktop app only: lets the native frame/menus/scrollbars follow too.
  window.desktop?.setTheme?.(mode);
  for (const fn of listeners) fn(mode);
}

// Applies + remembers a mode. `persist` also saves it server-side — the
// desktop app's origin (and so its localStorage) isn't guaranteed stable
// between launches, so the server copy is what survives that.
export function setThemeMode(mode, { persist = true } = {}) {
  if (!MODES.includes(mode)) return;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* storage blocked — still applies for this session */
  }
  paint(mode);
  if (persist) api.updateSettings({ ui_theme: mode }).catch(() => {});
}

export function subscribeTheme(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Called once at startup: paints from the local copy immediately, keeps
// following the OS while in 'system' mode, then reconciles with the
// server-side setting (which wins — it's the one that survives a new origin).
export function initTheme() {
  paint(getThemeMode());
  window
    .matchMedia('(prefers-color-scheme: light)')
    .addEventListener('change', () => {
      if (getThemeMode() === 'system') paint('system');
    });
  api
    .getSettings()
    .then((s) => {
      if (MODES.includes(s.ui_theme) && s.ui_theme !== getThemeMode()) {
        setThemeMode(s.ui_theme, { persist: false });
      }
    })
    .catch(() => {});
}
