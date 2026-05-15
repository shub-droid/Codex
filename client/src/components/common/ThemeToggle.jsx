import { useTheme } from '../../context/ThemeContext.jsx';
import './ThemeToggle.css';

/* ── Icons ──────────────────────────────────────────── */
const MoonIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const SunIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    <line x1="12" y1="2"  x2="12" y2="5"  />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" />
    <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
    <line x1="2"  y1="12" x2="5"  y2="12" />
    <line x1="19" y1="12" x2="22" y2="12" />
    <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" />
    <line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
  </svg>
);

/* ── Component ──────────────────────────────────────── */
export default function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  // Two explicit modifier classes so CSS transitions are predictable
  const trackClass = `theme-toggle ${isDark ? 'theme-toggle--dark' : 'theme-toggle--light'}`;

  return (
    <button
      className={trackClass}
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      id="theme-toggle-btn"
    >
      {/* Decorative dots — look like stars in dark, fade out in light */}
      <span className="theme-toggle__dot" aria-hidden="true" />
      <span className="theme-toggle__dot" aria-hidden="true" />
      <span className="theme-toggle__dot" aria-hidden="true" />

      {/* Sliding knob */}
      <span className="theme-toggle__knob" aria-hidden="true">
        <span className="theme-toggle__icon">
          {isDark ? <SunIcon /> : <MoonIcon />}
        </span>
      </span>
    </button>
  );
}
