import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { enrolledIds, loadSettings, SITE_ASSESSMENT_URL } from '@/lib/valor';
import EnrollButton from '@/components/EnrollButton';
import { supabase } from '@/api/supabaseClient';
import { useViewAs } from '@/lib/ViewAsContext';

/**
 * Workouts, nutrition and training plans are included with enrollment.
 * Staff always pass. A parent passes once at least one of their athletes is enrolled
 * (paid online or marked paid by staff); otherwise they get the enroll-and-pay screen.
 * The database enforces the same rule for coach content (RLS on workouts / maxes).
 *
 * In "view as athlete" mode an admin must see the same lock that athlete's own
 * login would — evaluated for just that one kid, not skipped just because the
 * signed-in user is staff.
 */
export default function RequireEnrollment() {
  const { user } = useAuth();
  const viewAs = useViewAs();
  const [state, setState] = useState({ loading: true, athletes: [], enrolled: new Set(), enrollment: null, rec: {}, lapsed: new Set() });

  useEffect(() => {
    if (!user) return;
    if (!viewAs.isActive && user.role === 'admin') return;
    if (viewAs.isActive && !viewAs.athlete) return;
    (async () => {
      const kids = viewAs.isActive ? [viewAs.athlete] : await base44.entities.Athlete.list('first_name', 20).catch(() => []);
      const ids = kids.map((k) => k.id);
      const [enrolled, settings, { data: as }, { data: past }] = await Promise.all([
        enrolledIds(ids), loadSettings(),
        ids.length ? supabase.from('assessments').select('athlete_id, recommended_plan, date').in('athlete_id', ids).order('date', { ascending: false }) : { data: [] },
        ids.length ? supabase.from('payments').select('athlete_id').in('athlete_id', ids).eq('status', 'paid') : { data: [] },
      ]);
      const rec = {}; (as || []).forEach((x) => { if (!(x.athlete_id in rec)) rec[x.athlete_id] = x.recommended_plan; });
      setState({ loading: false, athletes: kids, enrolled, enrollment: settings.enrollment, rec, lapsed: new Set((past || []).map((p) => p.athlete_id)) });
    })();
  }, [user, viewAs.isActive, viewAs.athlete]);

  if (!user || (!viewAs.isActive && user.role === 'admin')) return <Outlet />;
  if (state.loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (state.enrolled.size > 0) return <Outlet />;

  return (
    <div className="mx-auto max-w-xl space-y-6 py-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Lock className="h-6 w-6" /></div>
      <div>
        <h1 className="font-display text-3xl">Unlocks with enrollment</h1>
        <p className="mt-2 text-sm text-muted-foreground">Workouts, nutrition and your athlete's training plan are included while they have a class or class pack at Valor. Pay here, or with a coach at the gym.</p>
      </div>
      {state.athletes.length === 0 ? (
        <Card><CardContent className="p-5 text-sm">
          <p>Start with a free assessment. A coach meets your athlete, then you decide.</p>
          <Button asChild className="mt-4"><a href={SITE_ASSESSMENT_URL}>Book a free assessment</a></Button>
        </CardContent></Card>
      ) : state.athletes.map((a) => (
        <Card key={a.id}><CardContent className="flex items-center justify-between gap-3 p-4">
          <div><p className="font-semibold">{a.first_name} {a.last_name || ''}</p><p className="text-xs text-muted-foreground">{state.lapsed.has(a.id) ? 'Classes used up or expired' : 'Not enrolled yet'}</p></div>
          <EnrollButton athlete={a} cfg={state.enrollment} recommendedKey={state.rec[a.id]} label={state.lapsed.has(a.id) ? 'Buy more classes' : `Enroll ${a.first_name}`} />
        </CardContent></Card>
      ))}
    </div>
  );
}
