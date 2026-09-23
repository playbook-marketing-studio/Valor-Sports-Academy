import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { enrolledIds, loadSettings, SITE_ASSESSMENT_URL } from '@/lib/valor';
import { startEnrollment } from '@/lib/enroll';
import { money } from '@/lib/slots';

/**
 * Workouts, nutrition and training plans are included with enrollment.
 * Staff always pass. A parent passes once at least one of their athletes is enrolled
 * (paid online or marked paid by staff); otherwise they get the enroll-and-pay screen.
 * The database enforces the same rule for coach content (RLS on workouts / maxes).
 */
export default function RequireEnrollment() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, athletes: [], enrolled: new Set(), enrollment: null });
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!user || user.role === 'admin') return;
    (async () => {
      const kids = await base44.entities.Athlete.list('first_name', 20).catch(() => []);
      const [enrolled, settings] = await Promise.all([enrolledIds(kids.map((k) => k.id)), loadSettings()]);
      setState({ loading: false, athletes: kids, enrolled, enrollment: settings.enrollment });
    })();
  }, [user]);

  if (!user || user.role === 'admin') return <Outlet />;
  if (state.loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (state.enrolled.size > 0) return <Outlet />;

  const price = state.enrollment ? money(state.enrollment.amount_cents) : '';
  return (
    <div className="mx-auto max-w-xl space-y-6 py-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Lock className="h-6 w-6" /></div>
      <div>
        <h1 className="font-display text-3xl">Unlocks with enrollment</h1>
        <p className="mt-2 text-sm text-muted-foreground">Workouts, nutrition and your athlete's training plan are included once they're enrolled at Valor{price ? ` (${price})` : ''}. Pay here, or with a coach at the gym.</p>
      </div>
      {state.athletes.length === 0 ? (
        <Card><CardContent className="p-5 text-sm">
          <p>Start with a free assessment. A coach meets your athlete, then you decide.</p>
          <Button asChild className="mt-4"><a href={SITE_ASSESSMENT_URL}>Book a free assessment</a></Button>
        </CardContent></Card>
      ) : state.athletes.map((a) => (
        <Card key={a.id}><CardContent className="flex items-center justify-between gap-3 p-4">
          <div><p className="font-semibold">{a.first_name} {a.last_name || ''}</p><p className="text-xs text-muted-foreground">Not enrolled yet</p></div>
          <Button onClick={async () => { setBusy(a.id); await startEnrollment(a); setBusy(''); }} disabled={busy === a.id}>{busy === a.id ? 'One moment…' : `Enroll ${a.first_name}${price ? ` · ${price}` : ''}`}</Button>
        </CardContent></Card>
      ))}
    </div>
  );
}
