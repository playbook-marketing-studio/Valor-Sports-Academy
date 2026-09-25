import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/lib/ThemeContext';
import { cn } from '@/lib/utils';

/**
 * Sun/moon toggle, labeled for accessibility (not icon-only).
 * variant "default" reads the regular (theme-reactive) tokens; "sidebar" uses
 * the sidebar tokens instead, since the sidebar/mobile-menu ink stays dark in
 * both themes and shouldn't go low-contrast when the app is set to light.
 */
export default function ThemeToggle({ className, variant = 'default', compact = false }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const sidebar = variant === 'sidebar';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
        sidebar
          ? 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        compact && 'px-2',
        className
      )}
    >
      {isDark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
      {!compact && <span>{isDark ? 'Light' : 'Dark'}</span>}
    </button>
  );
}
