import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren
} from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ThemeAppearance = 'light' | 'dark';

export const themePreferenceStorageKey = 'playwatch-theme-preference';

type ThemePreferenceContextValue = {
  preference: ThemePreference;
  appearance: ThemeAppearance;
  setPreference: (preference: ThemePreference) => void;
};

const themePreferenceContext = createContext<ThemePreferenceContextValue | null>(null);

function getSystemAppearance(): ThemeAppearance {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system';
  }

  const value = window.localStorage.getItem(themePreferenceStorageKey);
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function ThemePreferenceProvider(
  props: PropsWithChildren<{
    initialPreference?: ThemePreference;
  }>
) {
  const [preference, setPreference] = useState<ThemePreference>(() => props.initialPreference ?? readStoredPreference());
  const [systemAppearance, setSystemAppearance] = useState<ThemeAppearance>(() => getSystemAppearance());

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemAppearance(event.matches ? 'dark' : 'light');
    };

    setSystemAppearance(mediaQuery.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(themePreferenceStorageKey, preference);
  }, [preference]);

  const appearance = preference === 'system' ? systemAppearance : preference;

  useEffect(() => {
    document.documentElement.dataset.appearance = appearance;
    document.documentElement.classList.toggle('dark', appearance === 'dark');
  }, [appearance]);

  return (
    <themePreferenceContext.Provider value={{
      preference,
      appearance,
      setPreference
    }}>
      {props.children}
    </themePreferenceContext.Provider>
  );
}

export function useThemePreference() {
  const value = useContext(themePreferenceContext);

  if (!value) {
    throw new Error('useThemePreference must be used within ThemePreferenceProvider.');
  }

  return value;
}
