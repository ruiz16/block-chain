'use client';

// =============================================================================
// ThemeInitializer — Restores persisted theme on ALL pages
// =============================================================================
//
// Runs in useEffect (after React hydration) on EVERY page, including public
// routes where the Sidebar (with ThemeToggle) doesn't render.
//
// Renders nothing — zero visual impact.
// =============================================================================

import { useEffect } from 'react';

export default function ThemeInitializer() {
  useEffect(() => {
    // Read persisted preference and apply to <html>
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.classList.toggle('dark', stored === 'dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', prefersDark);
    }
  }, []);

  return null;
}
