import React, { createContext, useContext, useState, useCallback } from 'react';

const STORAGE_KEY = 'vtp-theme';
const ThemeContext = createContext(null);

/**
 * Light/dark theme, mirrored onto a `.dark` class on <html> (Tailwind
 * darkMode: 'class'). index.html sets that class synchronously before React
 * loads (reading localStorage, falling back to prefers-color-scheme) so
 * there's no flash of the wrong theme; this context just keeps React state
 * in sync with it and persists the user's explicit choice.
 */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try { return document.documentElement.classList.contains('dark') ? 'dark' : 'light'; } catch { return 'light'; }
  });

  const setTheme = useCallback((next) => {
    setThemeState(next);
    try {
      document.documentElement.classList.toggle('dark', next === 'dark');
      localStorage.setItem(STORAGE_KEY, next);
    } catch { /* ignore (private browsing, etc.) */ }
  }, []);

  const toggleTheme = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext) || { theme: 'dark', setTheme: () => {}, toggleTheme: () => {} };
