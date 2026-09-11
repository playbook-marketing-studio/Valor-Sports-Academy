import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Timer, RotateCcw, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const today = new Date().toISOString().slice(0, 10);
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function WorkoutSession() {
  const { workoutId } = useParams();
  const navigate = useNavigate();
  const [workout, setWorkout] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [elapsed, setElapsed] = useState(0);
  const [restLeft, setRestLeft] = useState(0);
  const [restRunning, setRestRunning] = useState(false);

  // session timer counts up
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // rest timer counts down
  useEffect(() => {
    if (!restRunning) return;
    const id = setInterval(() => {
      setRestLeft((r) => {
        if (r <= 1) { setRestRunning(false); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [restRunning]);

  useEffect(() => {
    (async () => {
      const [w, maxes] = await Promise.all([
        base44.entities.Workout.get(workoutId),
        base44.entities.OneRepMax.list('-date', 200),
      ]);
      setWorkout(w);
      const rmMap = {};
      maxes.forEach((m) => { if (!rmMap[m.exercise_name] || m.date > rmMap[m.exercise_name].date) rmMap[m.exercise_name] = m; });
      const map = {};
      Object.entries(rmMap).forEach(([k, v]) => { map[k] = v.weight; });
      setEntries((w.exercises || []).map((ex) => {
        const target = ex.intensity && map[ex.name] ? Math.round((map[ex.name] * ex.intensity) / 100) : 0;
        return { name: ex.name, sets: ex.sets, reps: ex.reps, weight: target, notes: ex.notes || '' };
      }));
      setLoading(false);
    })();
  }, [workoutId]);

  const update = (i, field, value) => {
    const next = [...entries];
    next[i] = { ...next[i], [field]: value };
    setEntries(next);
  };

  const startRest = (s) => { setRestLeft(s); setRestRunning(true); };
  const resetRest = () => { setRestRunning(false); setRestLeft(0); };

  const finish = async () => {
    setSaving(true);
    try {
      await base44.entities.WorkoutLog.create({
        workout_id: workout.id,
        workout_title: workout.title,
        date: today,
        week: workout.week,
        day: workout.day,
        logged_exercises: entries.filter((e) => e.weight > 0 || e.reps > 0),
      });
      navigate('/workouts');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
    </div>
  );
  if (!workout) return <div className="py-20 text-center text-muted-foreground">Workout not found</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/workouts')} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-primary">
          <Timer className="h-4 w-4" /><span className="font-mono font-semibold">{fmt(elapsed)}</span>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{workout.day}</p>
        <h1 className="font-display text-2xl font-bold">{workout.title.replace(/^Week \d+ - /, '')}</h1>
        {workout.description && <p className="mt-1 text-sm text-muted-foreground">{workout.description}</p>}
      </div>

      {/* Rest timer */}
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-4">
          <div className="font-mono text-4xl font-bold">{fmt(restLeft)}</div>
          <div className="flex flex-wrap justify-center gap-2">
            {[30, 60, 90, 120].map((s) => (
              <Button key={s} variant="outline" size="sm" onClick={() => startRest(s)} disabled={restRunning}>{s}s</Button>
            ))}
            <Button variant="outline" size="sm" onClick={resetRest} className="gap-1"><RotateCcw className="h-3 w-3" />Reset</Button>
          </div>
        </CardContent>
      </Card>

      {/* Exercise entry */}
      <div className="space-y-3">
        {entries.map((e, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{i + 1}</span>
                <span className="font-medium">{e.name}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Sets</Label>
                  <Input type="number" value={e.sets} onChange={(ev) => update(i, 'sets', Number(ev.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Reps</Label>
                  <Input type="number" value={e.reps} onChange={(ev) => update(i, 'reps', Number(ev.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Weight (lbs)</Label>
                  <Input type="number" value={e.weight} onChange={(ev) => update(i, 'weight', Number(ev.target.value))} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button size="lg" className="w-full gap-2" onClick={finish} disabled={saving}>
        <Check className="h-5 w-5" /> {saving ? 'Saving...' : 'Done'}
      </Button>
    </div>
  );
}