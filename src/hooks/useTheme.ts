'use client';

// =============================================================================
// useTheme — Centralized dark/light mode logic
// =============================================================================
//
// Extracted from ThemeInitializer and ThemeToggle which had identical
// localStorage + system-preference reading duplicated in both.
//
// Returns:
//   theme   — 'light' | 'dark'
//   toggle  — flips theme and persists
//   setTheme — direct setter if needed
// =============================================================================

import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

/**
 * Read initial theme from localStorage (if present) or system preference.
 * Safe for SSR — returns 'dark' as a sensible default server-side.
 */
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // Sync <html> class and persist whenever theme changes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, setTheme, toggle };
}
