import React from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * Floating bottom tab bar for phones — replaces the old hamburger-first nav.
 * `items` are the persistent destinations; `centerAction` (staff only, per
 * Omar's brief) is a raised red quick-action button in the middle, like the
 * reference apps' raised "+" tab.
 */
export default function BottomTabBar({ items, centerAction }) {
  const left = centerAction ? items.slice(0, Math.ceil(items.length / 2)) : items;
  const right = centerAction ? items.slice(Math.ceil(items.length / 2)) : [];

  const Tab = ({ item }) => (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={item.onClick}
      className={({ isActive }) =>
        cn(
          'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-semibold transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon className={cn('h-5 w-5', isActive && 'drop-shadow-[0_0_10px_hsl(var(--primary)/0.6)]')} />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-3 bottom-3 z-40 lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto flex max-w-md items-center gap-1 rounded-[28px] border border-border bg-card/95 px-2 py-2 shadow-[0_18px_45px_-15px_rgba(0,0,0,.55)] backdrop-blur-md">
        {left.map((item) => <Tab key={item.to} item={item} />)}
        {centerAction && (
          <button
            type="button"
            onClick={centerAction.onClick}
            aria-label={centerAction.label}
            className="relative -mt-7 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground vtp-glow ring-4 ring-background transition-transform active:scale-95"
          >
            <centerAction.icon className="h-6 w-6" />
          </button>
        )}
        {right.map((item) => <Tab key={item.to} item={item} />)}
      </div>
    </nav>
  );
}
