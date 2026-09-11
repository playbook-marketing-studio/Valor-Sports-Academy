import React, { useEffect, useState, useMemo } from 'react';
import { Apple, Plus, Flame, Beef, Wheat, Droplet, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import ScanFoodDialog from '@/components/ScanFoodDialog';

const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export default function Nutrition() {
  const [logs, setLogs] = useState([]);
  const [goal, setGoal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    meal_name: '', meal_type: 'Snack', calories: 0, protein: 0, carbs: 0, fats: 0,
    date: new Date().toISOString().slice(0, 10),
  });
  const [goalForm, setGoalForm] = useState({
    calories_goal: 2500, protein_goal: 180, carbs_goal: 250, fats_goal: 70,
    date: new Date().toISOString().slice(0, 10),
  });

  const today = new Date().toISOString().slice(0, 10);

  const load = async () => {
    setLoading(true);
    const [allLogs, goals] = await Promise.all([
      base44.entities.NutritionLog.list('-date', 200),
      base44.entities.MacroGoal.list('-date', 50),
    ]);
    setLogs(allLogs);
    setGoal(goals.find((g) => g.date === today) || goals[0] || null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const todayLogs = useMemo(() => logs.filter((l) => l.date === today), [logs, today]);

  const totals = useMemo(() => {
    return todayLogs.reduce(
      (acc, l) => ({
        calories: acc.calories + (l.calories || 0),
        protein: acc.protein + (l.protein || 0),
        carbs: acc.carbs + (l.carbs || 0),
        fats: acc.fats + (l.fats || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
  }, [todayLogs]);

  const saveLog = async () => {
    setSaving(true);
    try {
      await base44.entities.NutritionLog.create(form);
      setOpen(false);
      setForm({ meal_name: '', meal_type: 'Snack', calories: 0, protein: 0, carbs: 0, fats: 0, date: today });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const saveGoal = async () => {
    setSaving(true);
    try {
      await base44.entities.MacroGoal.create(goalForm);
      setGoalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const deleteLog = async (id) => {
    await base44.entities.NutritionLog.delete(id);
    await load();
  };

  const macros = [
    { label: 'Calories', icon: Flame, value: totals.calories, goal: goal?.calories_goal || 0, unit: 'cal', color: 'bg-primary' },
    { label: 'Protein', icon: Beef, value: totals.protein, goal: goal?.protein_goal || 0, unit: 'g', color: 'bg-red-500' },
    { label: 'Carbs', icon: Wheat, value: totals.carbs, goal: goal?.carbs_goal || 0, unit: 'g', color: 'bg-amber-500' },
    { label: 'Fats', icon: Droplet, value: totals.fats, goal: goal?.fats_goal || 0, unit: 'g', color: 'bg-blue-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight lg:text-3xl">Nutrition</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track your macros and meals</p>
        </div>
        <div className="flex gap-2">
          <ScanFoodDialog onLogged={load} />
          <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Apple className="h-4 w-4" /> Set Goals
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Set Macro Goals</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Calories</Label>
                  <Input type="number" value={goalForm.calories_goal} onChange={(e) => setGoalForm({ ...goalForm, calories_goal: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Protein (g)</Label>
                  <Input type="number" value={goalForm.protein_goal} onChange={(e) => setGoalForm({ ...goalForm, protein_goal: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Carbs (g)</Label>
                  <Input type="number" value={goalForm.carbs_goal} onChange={(e) => setGoalForm({ ...goalForm, carbs_goal: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Fats (g)</Label>
                  <Input type="number" value={goalForm.fats_goal} onChange={(e) => setGoalForm({ ...goalForm, fats_goal: Number(e.target.value) })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGoalOpen(false)}>Cancel</Button>
                <Button onClick={saveGoal} disabled={saving}>{saving ? 'Saving...' : 'Save Goals'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Log Meal</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Log a Meal</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Meal / Food Name</Label>
                  <Input value={form.meal_name} onChange={(e) => setForm({ ...form, meal_name: e.target.value })} placeholder="e.g. Chicken & Rice" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Meal Type</Label>
                    <Select value={form.meal_type} onValueChange={(v) => setForm({ ...form, meal_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {mealTypes.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date</Label>
                    <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Calories</Label>
                    <Input type="number" value={form.calories} onChange={(e) => setForm({ ...form, calories: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Protein (g)</Label>
                    <Input type="number" value={form.protein} onChange={(e) => setForm({ ...form, protein: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Carbs (g)</Label>
                    <Input type="number" value={form.carbs} onChange={(e) => setForm({ ...form, carbs: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Fats (g)</Label>
                    <Input type="number" value={form.fats} onChange={(e) => setForm({ ...form, fats: Number(e.target.value) })} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={saveLog} disabled={saving || !form.meal_name}>{saving ? 'Saving...' : 'Add Meal'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Macro progress */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {macros.map((m) => {
          const pct = m.goal > 0 ? Math.min((m.value / m.goal) * 100, 100) : 0;
          return (
            <Card key={m.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <m.icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs text-muted-foreground">{Math.round(pct)}%</span>
                </div>
                <p className="mt-3 text-2xl font-bold">{m.value}<span className="text-sm font-normal text-muted-foreground"> {m.unit}</span></p>
                <p className="text-xs text-muted-foreground">{m.label} · goal {m.goal}{m.unit}</p>
                <Progress value={pct} className="mt-3 h-1.5" />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Today's meals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Today's Meals</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
            </div>
          ) : todayLogs.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <Apple className="h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">No meals logged today. Add your first meal!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {todayLogs.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{l.meal_name}</span>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{l.meal_type}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {l.calories} cal · {l.protein}p · {l.carbs}c · {l.fats}f
                    </p>
                  </div>
                  <button onClick={() => deleteLog(l.id)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}