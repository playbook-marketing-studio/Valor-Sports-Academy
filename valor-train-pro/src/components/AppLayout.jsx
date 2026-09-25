import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Dumbbell, Apple, TrendingUp, LogOut, ClipboardList, Users, Tag, BookOpen,
  NotebookPen, CalendarCheck, Eye, Plus, MoreHorizontal, HelpCircle, Home as HomeIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import Brand from '@/components/Brand';
import ThemeToggle from '@/components/ThemeToggle';
import BottomTabBar from '@/components/BottomTabBar';
import Onboarding, { hasSeenOnboarding, markOnboardingSeen } from '@/components/Onboarding';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const parentTabs = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/workouts', label: 'Workouts', icon: Dumbbell },
  { to: '/nutrition', label: 'Nutrition', icon: Apple },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
];

const adminTabs = [
  { to: '/', label: 'Today', icon: CalendarCheck, end: true },
  { to: '/admin/bookings', label: 'Assessments', icon: ClipboardList },
];
const adminTabsRight = [
  { to: '/admin/athletes', label: 'Athletes', icon: Users },
  { to: '/admin/programs', label: 'Programs', icon: BookOpen },
];

// Desktop sidebar keeps the full destination list; phones move the extras into the "More" sheet.
const adminNavFull = [
  { to: '/', label: 'Today', icon: CalendarCheck, end: true },
  { to: '/admin/bookings', label: 'Assessments', icon: ClipboardList },
  { to: '/admin/athletes', label: 'Athletes', icon: Users },
  { to: '/admin/programs', label: 'Programs', icon: BookOpen },
  { to: '/admin/log', label: 'Class log', icon: NotebookPen },
  { to: '/admin/enrollment', label: 'Enrollment', icon: Tag },
  { to: '/admin/view-as-athlete', label: 'View as athlete', icon: Eye },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const navItems = isAdmin ? adminNavFull : parentTabs;
  const [moreOpen, setMoreOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !!user && !hasSeenOnboarding(user.id, user.role));

  const handleLogout = async () => { await logout(); };
  const closeOnboarding = () => {
    if (user) markOnboardingSeen(user.id, user.role);
    setShowOnboarding(false);
  };

  const NavContent = () => (
    <div className="flex h-full flex-col">
      <div className="vtp-stripes border-b border-sidebar-border px-6 py-7">
        <Brand dark />
      </div>

      <nav className="flex-1 space-y-1 px-3 pt-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
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
        <button
          onClick={() => setShowOnboarding(true)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-all hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <HelpCircle className="h-4 w-4" />
          How the app works
        </button>
      </nav>

      <div className="p-3">
        {user && (
          <div className="mb-2 truncate px-3 text-xs text-sidebar-foreground/70">
            {user.full_name || user.email}<span className="ml-1 rounded-full bg-sidebar-accent px-1.5 py-0.5 text-[10px] uppercase tracking-wider">{user.role}</span>
          </div>
        )}
        <ThemeToggle variant="sidebar" className="w-full justify-start" />
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

      {/* Mobile utility bar — brand + theme + sign out. Wayfinding now lives in the bottom tab bar. */}
      <header className="vtp-stripes sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <Brand size="sm" />
        <div className="flex items-center gap-1">
          <ThemeToggle compact className="h-11 w-11 justify-center px-0" />
          <button
            onClick={handleLogout}
            aria-label="Sign out"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-foreground hover:bg-accent"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 lg:px-10 lg:py-10">
          <Outlet />
        </div>
        <div className="vtp-tabbar-spacer" aria-hidden="true" />
      </main>

      {/* Phone navigation: floating bottom tab bar instead of a hamburger drawer. */}
      {isAdmin ? (
        <BottomTabBar
          items={[...adminTabs, ...adminTabsRight, { to: '#more', label: 'More', icon: MoreHorizontal, onClick: (e) => { e.preventDefault(); setMoreOpen(true); } }]}
          centerAction={{ label: 'Walk-in', icon: Plus, onClick: () => navigate('/admin/bookings?walkin=1') }}
        />
      ) : (
        <BottomTabBar items={parentTabs} />
      )}

      {/* Staff "More" sheet — the rest of the destinations, plus the utilities. */}
      {isAdmin && (
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetContent side="bottom" className="rounded-t-[28px] pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
            <SheetHeader className="mb-2">
              <SheetTitle className="font-display text-2xl">More</SheetTitle>
            </SheetHeader>
            <div className="space-y-1">
              {[
                { to: '/admin/log', label: 'Class log', icon: NotebookPen },
                { to: '/admin/enrollment', label: 'Enrollment', icon: Tag },
                { to: '/admin/view-as-athlete', label: 'View as athlete', icon: Eye },
              ].map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-base font-medium text-foreground hover:bg-accent"
                >
                  <item.icon className="h-5 w-5 text-primary" /> {item.label}
                </NavLink>
              ))}
              <button
                onClick={() => { setMoreOpen(false); setShowOnboarding(true); }}
                className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-base font-medium text-foreground hover:bg-accent"
              >
                <HelpCircle className="h-5 w-5 text-primary" /> How the app works
              </button>
              <div className="my-2 border-t border-border" />
              <ThemeToggle className="min-h-[48px] w-full justify-start px-3 text-base" />
              <button
                onClick={handleLogout}
                className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-base font-medium text-foreground hover:bg-accent"
              >
                <LogOut className="h-5 w-5 text-primary" /> Sign out
              </button>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {showOnboarding && user && <Onboarding role={user.role} onClose={closeOnboarding} />}
    </div>
  );
}
