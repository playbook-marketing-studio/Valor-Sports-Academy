import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { Dumbbell, Apple, TrendingUp, LayoutDashboard, LogOut, Loader2, ChevronRight, Search, Users, MessageSquare, Megaphone } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useViewAs } from '@/lib/ViewAsContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import Brand from '@/components/Brand';
import ThemeToggle from '@/components/ThemeToggle';
import { athleteName } from '@/lib/valor';
import { PageHeader, SegmentedTabs, EmptyState } from '@/components/vtp';
import MessageThread from '@/components/MessageThread';
import { fmtWhen } from '@/lib/messages';

const navItems = (base) => [
  { to: base, label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: `${base}/workouts`, label: 'Workouts', icon: Dumbbell },
  { to: `${base}/nutrition`, label: 'Nutrition', icon: Apple },
  { to: `${base}/progress`, label: 'Progress', icon: TrendingUp },
  { to: `${base}/messages`, label: 'Messages', icon: MessageSquare },
];

/** The family's Messages screen for this athlete, read-only: their chat with Valor plus announcements. Marks nothing read. */
export function ViewAsMessages() {
  const { athlete } = useViewAs();
  const [news, setNews] = useState(null);
  const [tab, setTab] = useState('chat');
  useEffect(() => {
    supabase.from('messages').select('*').eq('kind', 'announcement').order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => setNews(data || []));
  }, []);
  if (!athlete) return null;
  return (
    <div className="space-y-5">
      <PageHeader title="Messages" subtitle="What the family sees: their chat with Valor about this athlete, plus announcements." />
      <SegmentedTabs options={[{ value: 'chat', label: 'Coach' }, { value: 'news', label: 'Announcements' }]} value={tab} onChange={setTab} />
      {tab === 'chat' && (
        <MessageThread key={athlete.id} athleteId={athlete.id} side="family" readOnly
          emptyText={`No messages yet between Valor and ${athlete.first_name}'s family.`} />
      )}
      {tab === 'news' && (news === null ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        : news.length === 0 ? <EmptyState icon={Megaphone} title="No announcements yet" message="Announcements you send from Messages show up here for every family." />
        : (
          <div className="space-y-3">
            {news.map((m) => (
              <article key={m.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display text-xl">{m.title || 'From Valor'}</h2>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtWhen(m.created_at)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
              </article>
            ))}
          </div>
        ))}
    </div>
  );
}

/** Staff picks ONE athlete (searchable by athlete or parent name) to enter view-as mode. */
function ViewAsPicker({ onPick }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('athletes_admin').select('id, first_name, last_name, parent_name, parent_email, stage, is_example')
      .order('first_name').limit(2000)
      .then(({ data }) => { setRows(data || []); setLoading(false); });
  }, []);

  const athletes = useMemo(() => rows.filter((a) => a.stage !== 'archived').sort((x, y) => Number(!!y.is_example) - Number(!!x.is_example)), [rows]);
  const term = q.trim().toLowerCase();
  const shown = athletes.filter((a) => !term || [a.first_name, a.last_name, a.parent_name, a.parent_email].join(' ').toLowerCase().includes(term));

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-xl space-y-5 px-4 py-10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl">View as athlete</h1>
            <p className="mt-1 text-sm text-muted-foreground">Pick an athlete to see the app exactly as their login would. Read-only — nothing here can be saved or changed.</p>
          </div>
          <ThemeToggle />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search athlete or parent name" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-2">
            {shown.map((a) => (
              <Card key={a.id} className="cursor-pointer transition hover:border-primary/60" onClick={() => onPick(a.id)}>
                <CardContent className="flex min-h-[64px] items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{athleteName(a)}{a.is_example && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Live example</span>}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.parent_name || 'No parent on file'}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            ))}
            {shown.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No athletes match.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Its own shell — NOT AppLayout — so a read-only "view as athlete" session
 * shows only this sticky bar plus the athlete's own nav, never the admin's
 * sidebar or mobile menu underneath it.
 */
/** /admin/view-as-athlete: pick an athlete; the choice goes in the URL. */
export function ViewAsPickerPage() {
  const navigate = useNavigate();
  return <ViewAsPicker onPick={(id) => navigate(`/admin/view-as-athlete/${id}`)} />;
}

export default function ViewAsAthlete() {
  const { athleteId } = useParams();
  const { enterViewAs, exitViewAs, athlete, basePath } = useViewAs();
  const navigate = useNavigate();

  // The URL decides who we're viewing as; leaving this shell ends view-as mode.
  useEffect(() => { enterViewAs(athleteId); return () => exitViewAs(); }, [athleteId, enterViewAs, exitViewAs]);

  if (!athlete || athlete.id !== athleteId || !basePath) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (athlete.missing) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">That athlete could not be found.</p>
        <Button onClick={() => navigate('/admin/view-as-athlete')}>Pick an athlete</Button>
      </div>
    );
  }

  const exit = () => navigate(`/admin/athletes/${athleteId}`);

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 bg-primary px-4 py-3 text-primary-foreground shadow-[0_8px_24px_-8px_rgba(0,0,0,.6)]">
        <p className="text-sm font-semibold">
          Viewing as <span className="font-display font-normal tracking-wide">{athleteName(athlete)}</span> <span className="font-normal">(read-only)</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle compact className="h-11 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground" />
          <Button size="sm" variant="secondary" className="h-11 gap-1.5" onClick={() => navigate('/admin/view-as-athlete')}><Users className="h-4 w-4" /> Switch</Button>
          <Button size="sm" variant="secondary" className="h-11 gap-1.5" onClick={exit}><LogOut className="h-4 w-4" /> Exit</Button>
        </div>
      </div>
      <header className="sticky top-[49px] z-40 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
        <div className="hidden shrink-0 sm:block"><Brand size="sm" /></div>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {navItems(basePath).map((item) => (
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
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 lg:px-10 lg:py-10">
        <Outlet key={athleteId} />
      </main>
    </div>
  );
}
