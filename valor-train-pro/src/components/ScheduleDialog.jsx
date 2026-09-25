import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { mondayOf, rescheduleAssignment, weekdayName } from '@/lib/programs';

const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmt = (ymd) => new Date(ymd + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Change one athlete's program schedule: which week they're on, and which days they come in. */
export default function ScheduleDialog({ open, onOpenChange, athlete, assignment, onDone }) {
  const template = assignment?.template;
  const [start, setStart] = useState('');
  const [days, setDays] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!assignment) return;
    setStart(assignment.start_date);
    setDays(Object.fromEntries((template?.days || []).map((d) => [d.key, Number(assignment.day_weekdays?.[d.key] ?? d.weekday ?? 1)])));
  }, [assignment, template]);
  if (!assignment || !template) return null;

  const monday = start ? mondayOf(start) : assignment.start_date;
  const thisMonday = mondayOf(new Date().toISOString().slice(0, 10));
  const weekNow = Math.floor((new Date(thisMonday) - new Date(monday)) / (7 * 86400000)) + 1;
  const setWeekNow = (n) => setStart(addDays(thisMonday, -(n - 1) * 7));
  // Before the effect fills `days`, fall back to the saved schedule so the first render never breaks.
  const dayOf = (d) => days[d.key] ?? Number(assignment.day_weekdays?.[d.key] ?? d.weekday ?? 1);
  const coming = template.days.filter((d) => dayOf(d) !== 0).map((d) => weekdayName(dayOf(d)).slice(0, 3));

  const save = async () => {
    setSaving(true);
    try {
      const r = await rescheduleAssignment(assignment, template, monday, Object.fromEntries(template.days.map((d) => [d.key, dayOf(d)])));
      toast({ title: `${athlete.first_name}'s schedule updated`, description: `${r.rebuilt} workouts rebuilt${r.kept ? `, ${r.kept} logged ones kept` : ''}.` });
      onOpenChange(false); onDone?.();
    } catch (e) { toast({ title: 'Could not update', description: e.message }); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Change days or week</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{template.name}. Workouts already logged stay as they are; everything else moves to the new schedule.</p>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="sd-week">Week this week</Label>
            <select id="sd-week" value={weekNow >= 1 && weekNow <= template.weeks ? weekNow : ''} onChange={(e) => setWeekNow(Number(e.target.value))} className="h-11 w-full rounded-xl border border-input bg-transparent px-3 text-sm">
              {weekNow < 1 && <option value="">Starts {fmt(monday)}</option>}
              {weekNow > template.weeks && <option value="">Finished</option>}
              {Array.from({ length: template.weeks }, (_, i) => <option key={i + 1} value={i + 1}>Week {i + 1} of {template.weeks}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">Week 1 started {fmt(monday)}. Or pick a start date: <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 h-10" /></p>
          </div>
          <div className="space-y-2">
            <Label>Days {athlete.first_name} comes in</Label>
            {template.days.map((d) => (
              <div key={d.key} className="flex items-center justify-between gap-3">
                <span className="text-sm">{d.label.replace(/\s*\(.*\)$/, '')} workout on</span>
                <select aria-label={`${d.label} on`} value={dayOf(d)} onChange={(e) => setDays({ ...template.days.reduce((o, x) => ({ ...o, [x.key]: dayOf(x) }), {}), [d.key]: Number(e.target.value) })} className="h-11 w-44 rounded-xl border border-input bg-transparent px-3 text-sm">
                  {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{weekdayName(n)}</option>)}
                  <option value={0}>Skip</option>
                </select>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">{coming.length ? `Comes in ${coming.join(' and ')} (${coming.length}x a week).` : 'Every day is skipped.'}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="h-11" onClick={save} disabled={saving || !coming.length}>{saving ? 'Saving…' : 'Save schedule'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
