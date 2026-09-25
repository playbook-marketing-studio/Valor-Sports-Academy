import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { loadSettings, DEFAULT_METRICS, countsAsEnrollment, classesLeft, enrolledIds, itemName, weekRange, metricDelta } from '@/lib/valor';
import { supabase } from '@/api/supabaseClient';
import EnrollButton from '@/components/EnrollButton';
import AthleteForm from '@/components/AthleteForm';
import { Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useViewAs } from '@/lib/ViewAsContext';
import { EmptyState, ProgressRing, ProgressBar, StatTile, Chip } from '@/components/vtp';
import { photoPosition } from '@/lib/photos';

export default function Home() {
  const viewAs = useViewAs();
  const [user, setUser] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [weekWorkouts, setWeekWorkouts] = useState([]);
  const [weekLoggedIds, setWeekLoggedIds] = useState(new Set());
  const [settings, setSettings] = useState({ enrollment: null, metrics: DEFAULT_METRICS });
  const enrolledPays = payments.filter(countsAsEnrollment);
  const [inClass, setInClass] = useState(new Set()); // enrolled via a program, even without a pack in the app
  useEffect(() => { enrolledIds(athletes.map((a) => a.id)).then(setInClass); }, [athletes]);
  const [editing, setEditing] = useState(null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);

  /** This week's (Mon-Sun) scheduled workouts + which ones are logged, for one or more athlete ids. */
  const loadWeek = async (ids) => {
    if (!ids?.length) { setWeekWorkouts([]); setWeekLoggedIds(new Set()); return; }
    const { start, end } = weekRange();
    const { data: ws } = await supabase.from('workouts').select('id, athlete_id, date').in('athlete_id', ids).gte('date', start).lte('date', end);
    setWeekWorkouts(ws || []);
    const wIds = (ws || []).map((w) => w.id);
    if (!wIds.length) { setWeekLoggedIds(new Set()); return; }
    const { data: logs } = await supabase.from('workout_logs').select('workout_id').in('workout_id', wIds);
    setWeekLoggedIds(new Set((logs || []).map((l) => l.workout_id)));
  };

  useEffect(() => {
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);

        // View-as: an admin looking at this one athlete's Home exactly as their
        // login would. RLS lets an admin see every row, so scope explicitly to
        // just this athlete id — no siblings, no "all" option.
        if (viewAs.isActive) {
          if (!viewAs.athlete) return;
          const a = viewAs.athlete;
          setUser({ full_name: a.first_name, role: 'parent' });
          setAthletes([a]);
          const [{ data: next }, { data: as }, { data: ps }, st] = await Promise.all([
            supabase.from('workouts').select('id, athlete_id, title, date, day, week, program').gte('date', today).eq('athlete_id', a.id).order('date').limit(40),
            supabase.from('assessments').select('*').eq('athlete_id', a.id).order('date', { ascending: false }),
            supabase.from('payments').select('*').eq('athlete_id', a.id).eq('status', 'paid').order('paid_at', { ascending: false }),
            loadSettings(),
          ]);
          setUpcoming(next || []);
          setAssessments(as || []); setPayments(ps || []); setSettings(st);
          loadWeek([a.id]);
          return;
        }

        const me = await base44.auth.me();
        setUser(me);

        const [kids, { data: next }] = await Promise.all([
          me.role === 'admin' ? [] : base44.entities.Athlete.list('first_name', 20).catch(() => []),
          supabase.from('workouts').select('id, athlete_id, title, date, day, week, program').gte('date', today).not('athlete_id', 'is', null).order('date').limit(40),
        ]);
        setUpcoming(next || []);
        setAthletes(kids);
        if (me.role !== 'admin' && kids.length) {
          const ids = kids.map((k) => k.id);
          const [{ data: as }, { data: ps }, st] = await Promise.all([
            supabase.from('assessments').select('*').in('athlete_id', ids).order('date', { ascending: false }),
            supabase.from('payments').select('*').in('athlete_id', ids).eq('status', 'paid').order('paid_at', { ascending: false }),
            loadSettings(),
          ]);
          setAssessments(as || []); setPayments(ps || []); setSettings(st);
          loadWeek(ids);
        }

      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [reload, viewAs.isActive, viewAs.athlete]);

  const firstName = user?.full_name?.split(' ')[0] || 'Athlete';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';


  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-xl border border-border">
        <img src="/images/photos/facility-weights.webp" alt="" width={1200} height={500} style={{ objectPosition: photoPosition('/images/photos/facility-weights.webp') }} className="h-36 w-full object-cover sm:h-44" />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/70 to-black/10" />
        <div className="relative -mt-8 bg-card px-5 pb-5 pt-2">
          <h1 className="font-display text-4xl">{greeting}, {firstName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your athlete's results, this week's workouts, meals and progress, all here.</p>
        </div>
      </div>

      {/* Next up: each enrolled kid's next workout, one tap to start */}
      {athletes.some((a) => upcoming.some((w) => w.athlete_id === a.id)) && (
        <div className="space-y-2">
          <h2 className="font-display text-2xl">Next up</h2>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {athletes.map((a) => {
              const w = upcoming.find((x) => x.athlete_id === a.id);
              if (!w) return null;
              const isToday = w.date === new Date().toISOString().slice(0, 10);
              return (
                <Link key={a.id} to={`${viewAs.basePath}/workout/${w.id}`} className="flex min-h-[64px] items-center justify-between gap-3 px-4 py-3 transition hover:bg-muted/50">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{athletes.length > 1 ? `${a.first_name}: ` : ''}{w.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{isToday ? 'Today' : new Date(w.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}{w.week ? ` · week ${w.week}` : ''}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">{isToday ? 'Start' : 'View'}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Athletes: assessment results + program (parents) */}
      {athletes.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {athletes.map((a) => {
            const athleteAssessments = assessments.filter((x) => x.athlete_id === a.id); // newest first
            const as = athleteAssessments[0];
            const prevAs = athleteAssessments[1];
            const paid = enrolledPays.find((x) => x.athlete_id === a.id);
            const enrolledNoPack = !paid && inClass.has(a.id);
            const lapsed = !paid && !enrolledNoPack && payments.some((x) => x.athlete_id === a.id);
            const left = enrolledPays.filter((x) => x.athlete_id === a.id).reduce((n, x) => (n == null || classesLeft(x) == null ? null : n + classesLeft(x)), 0);
            const packTotal = enrolledPays.filter((x) => x.athlete_id === a.id).reduce((n, x) => n + (x.classes_total || 0), 0);
            const cls = itemName(settings.enrollment, as?.recommended_plan);
            const filled = as ? settings.metrics.filter((m) => as.metrics?.[m.key]) : [];
            const athleteWeek = weekWorkouts.filter((w) => w.athlete_id === a.id);
            const weekDone = athleteWeek.filter((w) => weekLoggedIds.has(w.id)).length;
            return (
              <Card key={a.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="font-display text-2xl">{a.first_name} {a.last_name || ''}</CardTitle>
                    {!viewAs.isActive && (
                      <button onClick={() => setEditing(a)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /> Edit</button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{[a.age && `Age ${a.age}`, a.sport].filter(Boolean).join(' · ')}</p>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  {(paid || enrolledNoPack) && (
                    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border px-3 py-3">
                      {paid && left != null ? (
                        <ProgressRing value={packTotal > 0 ? (left / packTotal) * 100 : 0} size={76} strokeWidth={8} label={String(left)} sublabel="classes left" />
                      ) : paid ? (
                        <ProgressRing value={100} size={76} strokeWidth={8} label={'∞'} sublabel="classes left" />
                      ) : (
                        <Chip active>In a class</Chip>
                      )}
                      <div className="min-w-[140px] flex-1">
                        {athleteWeek.length > 0 ? (
                          <ProgressBar value={weekDone} max={athleteWeek.length} label="This week" sublabel={`${weekDone}/${athleteWeek.length} workouts`} />
                        ) : (
                          <p className="text-xs text-muted-foreground">No workouts scheduled this week.</p>
                        )}
                      </div>
                    </div>
                  )}
                  {!as && <p className="text-muted-foreground">Assessment results show up here after the session.</p>}
                  {as && (
                    <>
                      <p className="text-xs text-muted-foreground">Assessment results · {new Date(as.date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                      {filled.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {filled.map((m) => {
                            const delta = prevAs?.metrics?.[m.key] != null ? metricDelta(as.metrics[m.key], prevAs.metrics[m.key], m.unit) : null;
                            return (
                              <StatTile
                                key={m.key}
                                label={m.label}
                                value={as.metrics[m.key]}
                                unit={m.unit}
                                trend={delta ? { label: `${delta.label} vs last`, direction: delta.direction, tone: delta.tone } : undefined}
                              />
                            );
                          })}
                        </div>
                      )}
                      {as.work_on && <p><span className="font-semibold">Work on first:</span> {as.work_on}</p>}
                      {as.notes && <p className="text-muted-foreground">{as.notes}</p>}
                    </>
                  )}
                  {cls && <p><span className="font-semibold">Coach recommends:</span> {cls}</p>}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                    {enrolledNoPack ? <p><span className="font-semibold text-green-700 dark:text-green-400">Enrolled.</span> {a.first_name} is in a class at Valor. Workouts, nutrition and their training plan are unlocked.</p>
                      : paid ? <p><span className="font-semibold text-green-700 dark:text-green-400">Enrolled.</span> {left == null ? 'Unlimited classes' : `${left} class${left === 1 ? '' : 'es'} left`}{paid.covers_until ? `, good through ${new Date(paid.covers_until).toLocaleDateString()}` : ''}. Workouts, nutrition and their training plan are unlocked.</p>
                      : <p>{lapsed ? `${a.first_name}'s classes are used up or expired. Buy more` : `Enroll ${a.first_name}`} to unlock workouts, nutrition and their training plan.</p>}
                    {!paid && !enrolledNoPack && !viewAs.isActive && <EnrollButton athlete={a} cfg={settings.enrollment} recommendedKey={as?.recommended_plan} label={lapsed ? 'Buy more classes' : undefined} />}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AthleteForm open={!!editing} onOpenChange={(o) => !o && setEditing(null)} mode="parent_edit" athlete={editing} onSaved={() => setReload((n) => n + 1)} />

      {athletes.length === 0 && !loading && (
        <EmptyState
          photo="/images/photos/facility-wide.webp"
          title="Nothing here yet"
          message="Your athlete shows up here after their free assessment. Questions? Call or text 509-987-4612."
          actionLabel="Text us"
          href="sms:5099874612"
        />
      )}
    </div>
  );
}
