import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const categories = ['Strength', 'Hypertrophy', 'Conditioning', 'Mobility', 'Power', 'Cardio'];

export default function NewWorkoutDialog({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', date: new Date().toISOString().slice(0, 10), category: 'Strength',
  });
  const [exercises, setExercises] = useState([{ name: '', sets: 3, reps: 10, weight: 0, notes: '' }]);
  const [saving, setSaving] = useState(false);

  const addExercise = () => setExercises([...exercises, { name: '', sets: 3, reps: 10, weight: 0, notes: '' }]);
  const removeExercise = (i) => setExercises(exercises.filter((_, idx) => idx !== i));
  const updateExercise = (i, field, value) => {
    const next = [...exercises];
    next[i] = { ...next[i], [field]: value };
    setExercises(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await base44.entities.Workout.create({
        ...form,
        exercises: exercises.filter((e) => e.name.trim()),
      });
      setOpen(false);
      setForm({ title: '', description: '', date: new Date().toISOString().slice(0, 10), category: 'Strength' });
      setExercises([{ name: '', sets: 3, reps: 10, weight: 0, notes: '' }]);
      onCreated?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" /> New Workout</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Workout</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Push Day" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Input id="desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional notes" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Exercises</Label>
              <Button type="button" variant="outline" size="sm" onClick={addExercise} className="gap-1">
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            {exercises.map((ex, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input placeholder="Exercise name" value={ex.name} onChange={(e) => updateExercise(i, 'name', e.target.value)} />
                  <button onClick={() => removeExercise(i)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input type="number" placeholder="Sets" value={ex.sets} onChange={(e) => updateExercise(i, 'sets', Number(e.target.value))} />
                  <Input type="number" placeholder="Reps" value={ex.reps} onChange={(e) => updateExercise(i, 'reps', Number(e.target.value))} />
                  <Input type="number" placeholder="Weight" value={ex.weight} onChange={(e) => updateExercise(i, 'weight', Number(e.target.value))} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.title}>{saving ? 'Saving...' : 'Save Workout'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}