import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';

const TITLES = { walk_in: 'Add a walk-in', add: 'Add an athlete', sibling: 'Add a sibling', edit: 'Edit athlete', parent_edit: 'Edit athlete' };
const blank = { first_name: '', last_name: '', age: '', birthdate: '', sport: '', position: '', school: '', grad_year: '', season: '', frequency: '', class_days: '', nutrition_plan: false, notes: '', parent_name: '', parent_email: '', parent_phone: '' };

/**
 * One form for every way an athlete gets created or changed.
 *  walk_in     staff, creates the athlete + a checked-in booking for today
 *  add         staff, athlete only (e.g. a current member)
 *  sibling     staff, same parent as `athlete`
 *  edit        staff, everything incl. parent contact + coach notes
 *  parent_edit parent, athlete basics only
 */
export default function AthleteForm({ open, onOpenChange, mode = 'add', athlete = null, onSaved }) {
  const staff = mode !== 'parent_edit';
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const src = athlete || {};
    const parent = { parent_name: src.parent_name || '', parent_email: src.parent_email || src.parent_login_email || '', parent_phone: src.parent_phone || '' };
    if (mode === 'sibling') setF({ ...blank, ...parent });
    else if (mode === 'edit' || mode === 'parent_edit') {
      setF(Object.fromEntries(Object.keys(blank).map((k) => [k, src[k] ?? (k === 'nutrition_plan' ? false : '')])));
      setF((x) => ({ ...x, ...parent }));
    } else setF(blank);
  }, [open, mode, athlete]);

  const set = (k) => (e) => { const v = e.target.value; setF((x) => ({ ...x, [k]: v })); };
  const num = (v) => (v === '' || v == null ? null : Number(v));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const email = f.parent_email.trim().toLowerCase();
    const values = {
      first_name: f.first_name.trim(), last_name: f.last_name.trim() || null, age: num(f.age), birthdate: f.birthdate || null,
      sport: f.sport.trim() || null, position: f.position.trim() || null, school: f.school.trim() || null, grad_year: num(f.grad_year),
    };
    if (staff) Object.assign(values, { season: f.season || null, frequency: f.frequency || null, class_days: f.class_days.trim() || null, nutrition_plan: !!f.nutrition_plan, notes: f.notes.trim() || null, parent_name: f.parent_name.trim() || null, parent_email: email || null, parent_phone: f.parent_phone.trim() || null });

    // link to an existing parent login with this email (siblings, returning families)
    if (staff && email && !athlete?.parent_id) {
      const { data: p } = await supabase.from('profiles').select('id, role').ilike('email', email).maybeSingle();
      if (p?.role === 'parent') values.parent_id = p.id;
    }
    if (mode === 'sibling' && athlete?.parent_id) values.parent_id = athlete.parent_id;

    let id = athlete?.id;
    let error;
    if (mode === 'edit' || mode === 'parent_edit') {
      ({ error } = await supabase.from('athletes').update(values).eq('id', athlete.id));
    } else {
      const res = await supabase.from('athletes').insert(values).select('id').single();
      error = res.error; id = res.data?.id;
      if (!error && mode === 'walk_in') {
        const b = await supabase.from('bookings').insert({
          athlete_id: id, parent_id: values.parent_id || null, origin: 'walk_in', status: 'attended',
          checked_in_at: new Date().toISOString(), slot_start: null,
          athlete_first_name: values.first_name, athlete_last_name: values.last_name, athlete_age: values.age, sport: values.sport,
          parent_name: values.parent_name || 'Parent', parent_email: email || '', parent_phone: values.parent_phone,
        });
        if (b.error) error = b.error;
      }
    }
    setBusy(false);
    if (error) return toast({ title: 'Could not save', description: error.message });
    toast({ title: mode === 'edit' || mode === 'parent_edit' ? 'Saved' : `${values.first_name} added` });
    onOpenChange(false);
    onSaved?.(id);
  };

  const field = (k, label, props = {}) => (
    <div className={props.wide ? 'col-span-2 space-y-1' : 'space-y-1'}>
      <Label htmlFor={`af-${k}`} className="text-xs">{label}</Label>
      <Input id={`af-${k}`} value={f[k]} onChange={set(k)} {...Object.fromEntries(Object.entries(props).filter(([p]) => p !== 'wide'))} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{TITLES[mode]}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {field('first_name', 'First name', { required: true })}
            {field('last_name', 'Last name')}
            {field('age', 'Age', { type: 'number', min: 4, max: 60 })}
            {field('birthdate', 'Birthday', { type: 'date' })}
            {field('sport', 'Primary sport')}
            {field('position', 'Position')}
            {field('school', 'School')}
            {field('grad_year', 'Grad year', { type: 'number', min: 2024, max: 2045 })}
          </div>
          {staff && (
            <>
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
                <div className="space-y-1"><Label htmlFor="af-season" className="text-xs">Season</Label>
                  <select id="af-season" value={f.season || ''} onChange={set('season')} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"><option value="">Not set</option><option value="in_season">In-season</option><option value="off_season">Off-season</option></select></div>
                <div className="space-y-1"><Label htmlFor="af-frequency" className="text-xs">Frequency</Label>
                  <select id="af-frequency" value={f.frequency || ''} onChange={set('frequency')} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"><option value="">Not set</option><option>1x/week</option><option>2x/week</option><option>3x/week</option></select></div>
                {field('class_days', 'Class days / time', { placeholder: 'e.g. Mon / Wed (PM1)' })}
                <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={!!f.nutrition_plan} onChange={(e) => { const v = e.target.checked; setF((x) => ({ ...x, nutrition_plan: v })); }} /> On a nutrition plan</label>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
                {field('parent_name', 'Parent / guardian name', { wide: true, required: mode === 'walk_in' })}
                {field('parent_email', 'Parent email', { type: 'email', required: mode === 'walk_in' })}
                {field('parent_phone', 'Parent phone', { type: 'tel' })}
              </div>
              <div className="space-y-1"><Label htmlFor="af-notes" className="text-xs">Coach notes (staff only)</Label><Textarea id="af-notes" rows={2} value={f.notes} onChange={set('notes')} placeholder="Injuries, schedule, goals" /></div>
              {athlete?.parent_id && mode === 'edit' && <p className="text-xs text-muted-foreground">This parent has a login. Changing the email here updates the contact only, not their login.</p>}
            </>
          )}
          <DialogFooter><Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'walk_in' ? 'Add and check in' : 'Save'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
