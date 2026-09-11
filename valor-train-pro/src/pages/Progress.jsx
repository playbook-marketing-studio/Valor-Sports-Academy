import React, { useEffect, useState, useMemo } from 'react';
import { TrendingUp, Plus, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import WeeklyPlan from '@/components/WeeklyPlan';

export default function Progress() {
  const [maxes, setMaxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    exercise_name: '', weight: 0, date: new Date().toISOString().slice(0, 10), notes: '',
  });
  const coreLifts = ['Bench Press', 'Squat', 'Hang Clean', 'Power Clean', 'Deadlift'];
  const [coreForm, setCoreForm] = useState({
    'Bench Press': 0, 'Squat': 0, 'Hang Clean': 0, 'Power Clean': 0, 'Deadlift': 0,
    date: new Date().toISOString().slice(0, 10),
  });
  const [coreSaving, setCoreSaving] = useState(false);
  const [planWorkouts, setPlanWorkouts] = useState([]);

  const load = async () => {
    setLoading(true);
    const [data, plan] = await Promise.all([
      base44.entities.OneRepMax.list('-date', 200),
      base44.entities.Workout.filter({ program: 'In-Season I' }, 'date', 100),
    ]);
    setMaxes(data);
    setPlanWorkouts(plan);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const chartData = useMemo(() => {
    const byExercise = {};
    maxes.forEach((m) => {
      if (!byExercise[m.exercise_name]) byExercise[m.exercise_name] = [];
      byExercise[m.exercise_name].push({ date: m.date, weight: m.weight });
    });
    Object.values(byExercise).forEach((arr) => arr.sort((a, b) => a.date.localeCompare(b.date)));
    const dates = [...new Set(maxes.map((m) => m.date))].sort();
    return dates.map((date) => {
      const row = { date };
      Object.entries(byExercise).forEach(([name, arr]) => {
        const entry = arr.find((a) => a.date === date);
        if (entry) row[name] = entry.weight;
      });
      return row;
    });
  }, [maxes]);

  const exercises = useMemo(() => [...new Set(maxes.map((m) => m.exercise_name))], [maxes]);
  const colors = ['#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];

  const latestByExercise = useMemo(() => {
    const map = {};
    maxes.forEach((m) => {
      if (!map[m.exercise_name] || m.date > map[m.exercise_name].date) {
        map[m.exercise_name] = m;
      }
    });
    return Object.values(map).sort((a, b) => b.weight - a.weight);
  }, [maxes]);

  const latest1rm = useMemo(() => {
    const map = {};
    latestByExercise.forEach((m) => { map[m.exercise_name] = m.weight; });
    return map;
  }, [latestByExercise]);

  const save = async () => {
    setSaving(true);
    try {
      await base44.entities.OneRepMax.create(form);
      setOpen(false);
      setForm({ exercise_name: '', weight: 0, date: new Date().toISOString().slice(0, 10), notes: '' });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const deleteMax = async (id) => {
    await base44.entities.OneRepMax.delete(id);
    await load();
  };

  const saveCoreLifts = async () => {
    const entries = coreLifts
      .filter((name) => coreForm[name] > 0)
      .map((name) => ({ exercise_name: name, weight: coreForm[name], date: coreForm.date, notes: '' }));
    if (entries.length === 0) return;
    setCoreSaving(true);
    try {
      await base44.entities.OneRepMax.bulkCreate(entries);
      setCoreForm({ 'Bench Press': 0, 'Squat': 0, 'Hang Clean': 0, 'Power Clean': 0, 'Deadlift': 0, date: new Date().toISOString().slice(0, 10) });
      await load();
    } finally {
      setCoreSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight lg:text-3xl">Progress</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track your 1-rep-max lifts over time</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Log 1RM</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log a 1-Rep Max</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Exercise Name</Label>
                <Input value={form.exercise_name} onChange={(e) => setForm({ ...form, exercise_name: e.target.value })} placeholder="e.g. Bench Press" list="ex-list" />
                <datalist id="ex-list">
                  {exercises.map((e) => <option key={e} value={e} />)}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Weight (lbs)</Label>
                  <Input type="number" value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving || !form.exercise_name || !form.weight}>{saving ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <WeeklyPlan workouts={planWorkouts} latest1rm={latest1rm} />

      {/* Core lifts quick entry */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Log Core Lifts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {coreLifts.map((name) => (
              <div key={name} className="space-y-1.5">
                <Label>{name}</Label>
                <Input
                  type="number"
                  placeholder="lbs"
                  value={coreForm[name] || ''}
                  onChange={(e) => setCoreForm({ ...coreForm, [name]: Number(e.target.value) })}
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={coreForm.date} onChange={(e) => setCoreForm({ ...coreForm, date: e.target.value })} />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={saveCoreLifts} disabled={coreSaving || !coreLifts.some((n) => coreForm[n] > 0)}>
              {coreSaving ? 'Saving...' : 'Save Core Lifts'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      {exercises.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Strength Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} unit=" lbs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '0.5rem',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                {exercises.map((ex, i) => (
                  <Line key={ex} type="monotone" dataKey={ex} stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 4 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Current maxes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Current 1RM Records</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
            </div>
          ) : latestByExercise.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <TrendingUp className="h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">No 1RM entries yet. Log your first lift!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {latestByExercise.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-3">
                  <div>
                    <p className="font-medium">{m.exercise_name}</p>
                    <p className="text-xs text-muted-foreground">{m.date}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold text-primary">{m.weight}<span className="text-sm font-normal text-muted-foreground"> lbs</span></span>
                    <button onClick={() => deleteMax(m.id)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}