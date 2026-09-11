import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Dumbbell, Apple, TrendingUp, LayoutDashboard, LogOut, Menu, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/workouts', label: 'Workouts', icon: Dumbbell },
  { to: '/nutrition', label: 'Nutrition', icon: Apple },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
];

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await base44.auth.logout();
  };

  const NavContent = () => (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-6 py-7">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Dumbbell className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="font-display text-base font-bold tracking-tight">VALOR</div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Sports Academy</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border bg-sidebar lg:block">
        <NavContent />
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Dumbbell className="h-4 w-4" />
          </div>
          <span className="font-display text-sm font-bold tracking-tight">VALOR</span>
        </div>
        <button onClick={() => setMobileOpen(true)} className="text-foreground">
          <Menu className="h-6 w-6" />
        </button>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-border bg-sidebar">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 text-muted-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            <NavContent />
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 lg:px-10 lg:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}