import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import WorkoutDayCard from '@/components/WorkoutDayCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import NewWorkoutDialog from '@/components/NewWorkoutDialog';

const today = new Date().toISOString().slice(0, 10);

export default function Workouts() {
  const [planWorkouts, setPlanWorkouts] = useState([]);
  const [customWorkouts, setCustomWorkouts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [latest1rm, setLatest1rm] = useState({});
  const [loading, setLoading] = useState(true);
  const [week, setWeek] = useState(1);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    const [all, maxes, allLogs] = await Promise.all([
      base44.entities.Workout.list('-date', 200),
      base44.entities.OneRepMax.list('-date', 200),
      base44.entities.WorkoutLog.list('-date', 200),
    ]);
    const plan = all.filter((w) => w.program === 'In-Season I');
    setPlanWorkouts(plan);
    setCustomWorkouts(all.filter((w) => w.program !== 'In-Season I'));
    setLogs(allLogs);
    const rmMap = {};
    maxes.forEach((m) => {
      if (!rmMap[m.exercise_name] || m.date > rmMap[m.exercise_name].date) rmMap[m.exercise_name] = m;
    });
    const map = {};
    Object.entries(rmMap).forEach(([k, v]) => { map[k] = v.weight; });
    setLatest1rm(map);
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

  useEffect(() => { load(); }, []);

  const weeks = useMemo(() => [...new Set(planWorkouts.map((w) => w.week))].sort((a, b) => a - b), [planWorkouts]);
  const weekWorkouts = useMemo(() => planWorkouts.filter((w) => w.week === week), [planWorkouts, week]);

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
          <p className="mt-1 text-sm text-muted-foreground">In-Season plan · log your live numbers</p>
        </div>
        <NewWorkoutDialog onCreated={load} />
      </div>

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
                  <WorkoutDayCard key={w.id} workout={w} latest1rm={latest1rm} isCompleted={isCompleted} onLog={(w) => navigate(`/workout/${w.id}`)} />
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