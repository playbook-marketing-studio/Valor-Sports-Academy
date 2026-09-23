import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Dumbbell, Apple, TrendingUp, LayoutDashboard, LogOut, Menu, X, ClipboardList, Users, Tag } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import Brand from '@/components/Brand';

const baseNav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/workouts', label: 'Workouts', icon: Dumbbell },
  { to: '/nutrition', label: 'Nutrition', icon: Apple },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
];
const adminNav = [
  { to: '/admin/bookings', label: 'Assessments', icon: ClipboardList },
  { to: '/admin/athletes', label: 'Athletes', icon: Users },
  { to: '/admin/programs', label: 'Programs & prices', icon: Tag },
];

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const navItems = user?.role === 'admin' ? [...adminNav, ...baseNav] : baseNav;

  const handleLogout = async () => {
    await logout();
  };

  const NavContent = () => (
    <div className="flex h-full flex-col">
      <div className="px-6 py-7">
        <Brand dark />
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
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-primary/30'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3">
        {user && (
          <div className="mb-2 truncate px-3 text-xs text-sidebar-foreground/70">
            {user.full_name || user.email}<span className="ml-1 rounded-full bg-sidebar-accent px-1.5 py-0.5 text-[10px] uppercase tracking-wider">{user.role}</span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-all hover:bg-sidebar-accent hover:text-sidebar-foreground"
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
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:block">
        <NavContent />
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur lg:hidden">
        <Brand size="sm" />
        <button onClick={() => setMobileOpen(true)} className="text-foreground">
          <Menu className="h-6 w-6" />
        </button>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
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