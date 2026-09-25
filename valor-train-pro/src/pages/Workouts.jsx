import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { enrolledIds } from '@/lib/valor';
import WorkoutDayCard from '@/components/WorkoutDayCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import NewWorkoutDialog from '@/components/NewWorkoutDialog';
import { latestMaxes } from '@/lib/maxes';
import { useViewAs } from '@/lib/ViewAsContext';
import { athleteEntity } from '@/lib/viewAsScope';

const today = new Date().toISOString().slice(0, 10);

export default function Workouts() {
  const [planWorkouts, setPlanWorkouts] = useState([]);
  const [customWorkouts, setCustomWorkouts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [allMaxes, setAllMaxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [week, setWeek] = useState(1);
  const [athletes, setAthletes] = useState([]);
  const [who, setWho] = useState('all');
  const navigate = useNavigate();
  const viewAs = useViewAs();

  const load = async () => {
    setLoading(true);
    // View-as: scope explicitly to this one athlete instead of relying on RLS,
    // which would hand an admin every athlete's workouts in the gym.
    const athlete = viewAs.isActive ? viewAs.athlete : null;
    const [all, maxes, allLogs, kids] = athlete ? await Promise.all([
      athleteEntity('workouts', athlete.id).list('-date', 500),
      athleteEntity('one_rep_maxes', athlete.id).list('-date', 500),
      athleteEntity('workout_logs', athlete.id).list('-date', 500),
      Promise.resolve([athlete]),
    ]) : await Promise.all([
      base44.entities.Workout.list('-date', 500),
      base44.entities.OneRepMax.list('-date', 500),
      base44.entities.WorkoutLog.list('-date', 500),
      base44.entities.Athlete.list('first_name', 20).then(async (ks) => { const on = await enrolledIds(ks.map((k) => k.id)); return ks.filter((k) => on.has(k.id)); }).catch(() => []),
    ]);
    setAthletes(kids);
    // a plan = anything with a week number: coach-built workouts for an athlete, or the In-Season template
    const plan = all.filter((w) => w.week != null || w.program === 'In-Season I');
    setPlanWorkouts(plan);
    setCustomWorkouts(all.filter((w) => !(w.week != null || w.program === 'In-Season I')));
    setLogs(allLogs);
    setAllMaxes(maxes);
    // families with several athletes: open on the first one who has a plan
    if (kids.length > 1) {
      const first = kids.find((k) => plan.some((w) => w.athlete_id === k.id));
      if (first) setWho(first.id);
    }
    const weeks = [...new Set(plan.map((w) => w.week))].sort();
    const current = weeks.find((w) => {
      const ws = plan.filter((p) => p.week === w);
      const min = Math.min(...ws.map((x) => x.date));
      const max = Math.max(...ws.map((x) => x.date));
      return today >= min && today <= max;
    });
    setWeek(current || weeks[0] || 1);
    setLoading(false);
  };

  useEffect(() => { if (!viewAs.isActive || viewAs.athlete) load(); }, [viewAs.isActive, viewAs.athlete]);

  const mine = useMemo(() => (who === 'all' ? planWorkouts : planWorkouts.filter((w) => w.athlete_id === who)), [planWorkouts, who]);
  const weeks = useMemo(() => [...new Set(mine.map((w) => w.week))].sort((a, b) => a - b), [mine]);
  const weekWorkouts = useMemo(() => mine.filter((w) => w.week === week), [mine, week]);

  const dayOrder = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7 };
  const groupedDays = useMemo(() => {
    const groups = {};
    weekWorkouts.forEach((w) => {
      const k = w.day || 'Other';
      if (!groups[k]) groups[k] = [];
      groups[k].push(w);
    });
    return Object.keys(groups)
      .sort((a, b) => (dayOrder[a] || 99) - (dayOrder[b] || 99))
      .map((k, i) => ({ day: k, label: `Day ${i + 1}`, workouts: groups[k] }));
  }, [weekWorkouts]);

  const isCompleted = (w) => logs.some((l) => l.workout_id === w.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-tight lg:text-3xl">Workouts</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your plan from Valor coaches · log your live numbers</p>
        </div>
        {!viewAs.isActive && <NewWorkoutDialog onCreated={load} />}
      </div>

      {/* Athlete selector (families with more than one athlete) */}
      {athletes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {[{ id: 'all', first_name: 'Everyone' }, ...athletes].map((a) => (
            <button key={a.id} onClick={() => setWho(a.id)} className={cn('rounded-full px-4 py-1.5 text-sm font-medium', who === a.id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground')}>{a.first_name}</button>
          ))}
        </div>
      )}

      {/* Week selector */}
      <div className="flex flex-wrap gap-2">
        {weeks.map((w) => (
          <button
            key={w}
            onClick={() => setWeek(w)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition',
              week === w ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            Week {w}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : weeks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">No workouts yet. Your coach adds them here after the assessment.</p>
      ) : (
        <div className="space-y-6">
          {groupedDays.map(({ day, label, workouts }) => (
            <div key={day} className="space-y-3">
              <div className="flex items-baseline gap-2">
                <h2 className="font-display text-lg text-primary">{label}</h2>
                <span className="text-sm text-muted-foreground">· {day}</span>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {workouts.map((w) => (
                  <WorkoutDayCard key={w.id} workout={w} latest1rm={latestMaxes(allMaxes, w.athlete_id || null)} isCompleted={isCompleted} onLog={(w) => navigate(`${viewAs.isActive ? '/admin/view-as-athlete' : ''}/workout/${w.id}`)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Custom workouts */}
      {customWorkouts.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-lg ">My Workouts</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {customWorkouts.map((w) => (
              <Card key={w.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{w.title}</CardTitle>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{w.date}</span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{w.category}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  {w.exercises?.length > 0 && (
                    <div className="space-y-1.5">
                      {w.exercises.map((ex, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
                          <span className="font-medium">{ex.name}</span>
                          <span className="text-muted-foreground">{ex.sets}×{ex.reps} {ex.intensity ? `@ ${ex.intensity}%` : ex.weight ? `@ ${ex.weight}lbs` : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}