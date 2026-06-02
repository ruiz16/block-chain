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

import { useTheme } from '@/hooks/useTheme';

export default function ThemeInitializer() {
  // Mounting the hook is enough — the effect syncs <html> class + localStorage
  useTheme();
  return null;
}
