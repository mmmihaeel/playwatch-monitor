import {
  useThemePreference,
  type ThemePreference
} from '../theme/theme-preference.js';

const themeOptions: Array<{
  label: string;
  value: ThemePreference;
}> = [
  { label: 'Auto', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' }
];

export function ThemeModeControl() {
  const { appearance, preference, setPreference } = useThemePreference();

  return (
    <aside className="fixed right-3 top-3 z-30 max-w-[calc(100vw-24px)] rounded-full border border-[color:var(--surface-border)] bg-[var(--surface)] px-3 py-2 shadow-[var(--surface-shadow)] backdrop-blur-xl sm:right-5 sm:top-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium text-[color:var(--muted)]">Theme: {appearance}</p>
        <div className="flex items-center gap-1 rounded-full bg-black/4 p-1 dark:bg-white/4">
          {themeOptions.map((option) => {
            const isActive = preference === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setPreference(option.value)}
                aria-pressed={isActive}
                className={[
                  'rounded-full px-3 py-1.5 text-xs font-semibold tracking-[0.01em] transition',
                  isActive
                    ? 'bg-cyan-300 text-slate-950 shadow-[0_10px_20px_rgba(12,180,206,0.2)]'
                    : 'text-[color:var(--muted)] hover:text-[color:var(--ink)]'
                ].join(' ')}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
