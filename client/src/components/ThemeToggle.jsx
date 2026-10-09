import { useEffect, useState } from 'react';
import { getThemeMode, resolveTheme, setThemeMode, subscribeTheme } from '../theme.js';

// Quick light/dark flip for the top bar. Always sets an explicit mode —
// "System" is chosen in Settings > Appearance, since a toggle that
// sometimes did nothing visible (system already matching) would feel broken.
export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => resolveTheme(getThemeMode()));

  useEffect(() => subscribeTheme((mode) => setTheme(resolveTheme(mode))), []);

  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="theme-toggle"
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
      onClick={() => setThemeMode(next)}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
