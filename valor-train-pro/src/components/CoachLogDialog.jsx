import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { coachLogFor, saveCoachLog } from '@/lib/programs';

/** Coach enters what the athlete actually used for one workout (the workbook's Log tabs). */
export default function CoachLogDialog({ workout, athleteName, maxes = {}, open, onOpenChange, onSaved }) {
  const { user } = useAuth();
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !workout) return;
    coachLogFor(workout.id, user.id).then((log) => {
      setVals(Object.fromEntries((log?.logged_exercises || []).map((e) => [e.name, { weight: e.weight ?? '', notes: e.notes || '' }])));
    });
  }, [open, workout, user]);
  if (!workout) return null;
  const save = async () => {
    setBusy(true);
    try {
      const n = await saveCoachLog(workout, user.id, Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, { weight: v.weight === '' ? null : Number(v.weight), notes: v.notes }])));
      toast({ title: 'Logged', description: `${n} exercise${n === 1 ? '' : 's'} for ${athleteName}.` });
      onOpenChange(false); onSaved?.();
    } catch (e) { toast({ title: 'Could not save', description: e.message }); }
    setBusy(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{athleteName} · Week {workout.week} {workout.day}</DialogTitle></DialogHeader>
        <p className="-mt-2 text-xs text-muted-foreground">{workout.title} · {new Date(workout.date + 'T12:00:00').toLocaleDateString()}. Enter the weight used (lb), or a note for bands and timed work.</p>
        <div className="divide-y divide-border">
          {workout.exercises.map((e) => {
            const target = e.intensity && maxes[e.name] ? Math.round((maxes[e.name] * e.intensity) / 100) : null;
            return (
              <div key={e.name} className="grid grid-cols-12 items-center gap-2 py-2">
                <div className="col-span-6 min-w-0">
                  <p className="truncate text-sm font-medium">{e.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{e.prescription}{e.target ? ` · ${e.target}` : ''}{target ? ` · ≈${target} lb` : ''}</p>
                </div>
                <Input aria-label={`${e.name} weight used`} className="col-span-2 px-2" inputMode="decimal" placeholder="lb" value={vals[e.name]?.weight ?? ''} onChange={(ev) => setVals({ ...vals, [e.name]: { ...vals[e.name], weight: ev.target.value } })} />
                <Input aria-label={`${e.name} note`} className="col-span-4" placeholder="note" value={vals[e.name]?.notes ?? ''} onChange={(ev) => setVals({ ...vals, [e.name]: { ...vals[e.name], notes: ev.target.value } })} />
              </div>
            );
          })}
        </div>
        <DialogFooter><Button onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save log'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
