import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Dumbbell, Apple, TrendingUp, LayoutDashboard, LogOut, Loader2, ChevronRight, Search } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useViewAs } from '@/lib/ViewAsContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/admin/view-as', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/view-as/workouts', label: 'Workouts', icon: Dumbbell },
  { to: '/admin/view-as/nutrition', label: 'Nutrition', icon: Apple },
  { to: '/admin/view-as/progress', label: 'Progress', icon: TrendingUp },
];

/** Staff picks a family (searchable by parent or athlete name) to enter view-as mode. */
function ViewAsPicker({ onPick }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('athletes_admin').select('id, first_name, last_name, parent_name, parent_email, parent_id, stage')
      .order('parent_name').limit(2000)
      .then(({ data }) => { setRows(data || []); setLoading(false); });
  }, []);

  const families = useMemo(() => {
    const map = new Map();
    rows.filter((a) => a.stage !== 'archived').forEach((a) => {
      const key = a.parent_id || `${a.parent_name}|${a.parent_email}`;
      if (!map.has(key)) map.set(key, { key, parent_name: a.parent_name, parent_email: a.parent_email, athletes: [] });
      map.get(key).athletes.push(a);
    });
    return [...map.values()];
  }, [rows]);

  const term = q.trim().toLowerCase();
  const shown = families.filter((f) => !term || [f.parent_name, f.parent_email, ...f.athletes.map((a) => a.first_name)].join(' ').toLowerCase().includes(term));

  return (
    <div className="mx-auto max-w-xl space-y-5 px-4 py-10">
      <div>
        <h1 className="font-display text-3xl">View as family</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pick a family to see the app exactly as their parent does. Read-only — nothing here can be saved or changed.</p>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search parent or athlete name" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-2">
          {shown.map((f) => (
            <Card key={f.key} className="cursor-pointer transition hover:border-primary/60" onClick={() => onPick(f.athletes[0].id)}>
              <CardContent className="flex min-h-[64px] items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{f.parent_name || 'Parent'}</p>
                  <p className="truncate text-xs text-muted-foreground">{f.athletes.map((a) => a.first_name).join(', ')}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
          {shown.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No families match.</p>}
        </div>
      )}
    </div>
  );
}

/** Sticky "you're viewing as" bar + the parent's own nav, wrapping the real parent screens. */
export default function ViewAs() {
  const { viewAsAthleteId, enterViewAs, exitViewAs, family, loading } = useViewAs();
  const navigate = useNavigate();

  if (!viewAsAthleteId) return <ViewAsPicker onPick={enterViewAs} />;

  if (loading || !family) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const exit = () => {
    const athleteId = viewAsAthleteId;
    exitViewAs();
    navigate(`/admin/athletes/${athleteId}`);
  };

  const parentLabel = family.parent?.full_name || family.parent?.email || 'this family';

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 bg-primary px-4 py-3 text-primary-foreground shadow-[0_8px_24px_-8px_rgba(0,0,0,.6)]">
        <p className="text-sm font-semibold">
          Viewing as <span className="font-display font-normal tracking-wide">{parentLabel}</span>'s family <span className="font-normal opacity-85">(read-only)</span>
        </p>
        <Button size="sm" variant="secondary" className="h-11 gap-1.5" onClick={exit}><LogOut className="h-4 w-4" /> Exit</Button>
      </div>
      <header className="sticky top-[49px] z-40 flex items-center gap-1 overflow-x-auto border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex min-h-[40px] shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )
            }
          >
            <item.icon className="h-4 w-4" /> {item.label}
          </NavLink>
        ))}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 lg:px-10 lg:py-10">
        <Outlet />
      </main>
    </div>
  );
}
