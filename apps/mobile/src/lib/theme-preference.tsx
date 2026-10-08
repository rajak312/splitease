import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'splitease.theme';

interface ThemeContextValue {
  preference: ThemePreference;
  scheme: 'light' | 'dark';
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'system',
  scheme: 'light',
  setPreference: () => undefined,
});

export function ThemePreferenceProvider({ children }: { children: (scheme: 'light' | 'dark') => ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') setPreferenceState(v);
      })
      .catch(() => undefined);
  }, []);

  const scheme: 'light' | 'dark' = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo(
    () => ({
      preference,
      scheme,
      setPreference: (p: ThemePreference) => {
        setPreferenceState(p);
        void AsyncStorage.setItem(KEY, p).catch(() => undefined);
      },
    }),
    [preference, scheme],
  );

  return <ThemeContext.Provider value={value}>{children(scheme)}</ThemeContext.Provider>;
}

export const useThemePreference = () => useContext(ThemeContext);
