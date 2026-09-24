import React, { useEffect, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CATEGORIES = ['Strength', 'Power', 'Speed', 'Conditioning', 'Mobility', 'Hypertrophy'];
const emptyEx = () => ({ name: '', sets: 3, reps: 8, intensity: '', weight: '', notes: '' });
const dayOf = (ymd) => DAYS[(new Date(ymd + 'T12:00:00Z').getUTCDay() + 6) % 7];

/** Coach builds or edits one workout for one athlete. Shows up on the parent's Workouts page. */
export default function WorkoutEditor({ open, onOpenChange, athlete, workout = null, defaultWeek = 1, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ title: '', date: today, week: defaultWeek, category: 'Strength', description: '' });
  const [ex, setEx] = useState([emptyEx()]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (workout) {
      setF({ title: workout.title, date: workout.date, week: workout.week || 1, category: workout.category || 'Strength', description: workout.description || '' });
      setEx((workout.exercises || []).map((e) => ({ ...emptyEx(), ...e, intensity: e.intensity ?? '', weight: e.weight ?? '' })));
    } else {
      setF({ title: '', date: today, week: defaultWeek, category: 'Strength', description: '' });
      setEx([emptyEx()]);
    }
  }, [open, workout, defaultWeek, today]);

  const upd = (i, k, v) => setEx((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const n = (v) => (v === '' || v == null ? null : Number(v));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const values = {
      athlete_id: athlete.id, program: workout?.program || 'Valor plan', title: f.title.trim(), date: f.date, week: Number(f.week) || 1, day: dayOf(f.date),
      category: f.category, description: f.description.trim() || null,
      // keep program fields (group, prescription, target) when a coach edits an assigned workout
      exercises: ex.filter((x) => x.name.trim()).map((x) => ({ ...x, name: x.name.trim(), sets: n(x.sets), reps: n(x.reps), intensity: n(x.intensity), weight: n(x.weight), notes: x.notes?.trim() || '' })),
    };
    const res = workout ? await supabase.from('workouts').update(values).eq('id', workout.id) : await supabase.from('workouts').insert(values);
    setBusy(false);
    if (res.error) return toast({ title: 'Could not save the workout', description: res.error.message });
    onOpenChange(false); onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{workout ? 'Edit workout' : `New workout for ${athlete?.first_name}`}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2 space-y-1"><Label htmlFor="we-title" className="text-xs">Title</Label><Input id="we-title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Lower body power" /></div>
            <div className="space-y-1"><Label htmlFor="we-date" className="text-xs">Date</Label><Input id="we-date" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="we-week" className="text-xs">Week #</Label><Input id="we-week" type="number" min={1} value={f.week} onChange={(e) => setF({ ...f, week: e.target.value })} /></div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor="we-cat" className="text-xs">Focus</Label>
              <select id="we-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2 space-y-1"><Label htmlFor="we-desc" className="text-xs">Note for the athlete</Label><Input id="we-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 px-1 text-[11px] font-medium text-muted-foreground">
              <span className="col-span-4">Exercise</span><span className="col-span-1">Sets</span><span className="col-span-1">Reps</span><span className="col-span-2">% of 1RM</span><span className="col-span-2">or lbs</span><span className="col-span-2" />
            </div>
            {ex.map((x, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-2">
                <Input aria-label="Exercise" className="col-span-4" value={x.name} onChange={(e) => upd(i, 'name', e.target.value)} placeholder="Back squat" />
                <Input aria-label="Sets" className="col-span-1 px-2" type="number" value={x.sets} onChange={(e) => upd(i, 'sets', e.target.value)} />
                <Input aria-label="Reps" className="col-span-1 px-2" type="number" value={x.reps} onChange={(e) => upd(i, 'reps', e.target.value)} />
                <Input aria-label="Percent of max" className="col-span-2" type="number" value={x.intensity} onChange={(e) => upd(i, 'intensity', e.target.value)} placeholder="75" />
                <Input aria-label="Pounds" className="col-span-2" type="number" value={x.weight} onChange={(e) => upd(i, 'weight', e.target.value)} />
                <button type="button" className="col-span-2 justify-self-start text-muted-foreground hover:text-destructive" onClick={() => setEx((xs) => xs.filter((_, j) => j !== i))} aria-label="Remove"><X className="h-4 w-4" /></button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setEx((xs) => [...xs, emptyEx()])} className="gap-1"><Plus className="h-3 w-3" /> Exercise</Button>
          </div>
          <DialogFooter><Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save workout'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
