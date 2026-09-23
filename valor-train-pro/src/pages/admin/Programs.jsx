import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || `program_${Date.now()}`;
const dollars = (c) => ((c || 0) / 100).toString();
// valorsportsacademywa.com/programs, 9/2026
const SITE_MONTHLY = [
  { key: 'inseason_2x', name: 'In-season, 2x a week', price: '199' },
  { key: 'inseason_1x', name: 'In-season, 1x a week', price: '99' },
  { key: 'offseason_3x', name: 'Off-season, 3x a week', price: '299' },
];

/**
 * settings.enrollment = { billing, placeholder, programs[], drop_in }.
 * Families pay for a program (enrollment); workouts, nutrition and training plans are included.
 * The billing switch decides monthly (Stripe renews each month; cash/Venmo cover a month) or one time.
 */
export default function AdminEnrollment() {
  const [cfg, setCfg] = useState(null);
  const [classes, setClasses] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('settings').select('key, value').in('key', ['enrollment', 'classes']).then(({ data }) => {
      const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
      const e = map.enrollment || {};
      setCfg({
        billing: e.billing === 'monthly' ? 'monthly' : 'one_time', placeholder: !!e.placeholder,
        programs: (e.programs || []).map((p) => ({ ...p, price: dollars(p.amount_cents) })),
        dropIn: e.drop_in ? dollars(e.drop_in.amount_cents) : '',
      });
      setClasses(Array.isArray(map.classes) ? map.classes : []);
    });
  }, []);

  const upd = (i, k, v) => setCfg((c) => ({ ...c, programs: c.programs.map((p, j) => (j === i ? { ...p, [k]: v } : p)) }));
  const useSiteMonthly = () => {
    setCfg((c) => ({ ...c, billing: 'monthly', programs: SITE_MONTHLY.map((p) => ({ ...p })), dropIn: c.dropIn || '25' }));
    toast({ title: "Loaded the website's monthly programs", description: 'Review, then Save.' });
  };

  const save = async () => {
    const programs = cfg.programs.filter((p) => p.name.trim()).map((p) => ({ key: p.key || slug(p.name), name: p.name.trim(), amount_cents: Math.round(Number(p.price) * 100) }));
    if (!programs.length || programs.some((p) => !Number.isFinite(p.amount_cents) || p.amount_cents < 50)) return toast({ title: 'Each program needs a name and a price of at least $0.50' });
    const dropCents = cfg.dropIn === '' ? null : Math.round(Number(cfg.dropIn) * 100);
    if (dropCents !== null && (!Number.isFinite(dropCents) || dropCents < 50)) return toast({ title: 'Check the drop-in price' });
    setBusy(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from('settings').upsert([
      { key: 'enrollment', updated_at: now, value: { billing: cfg.billing, placeholder: cfg.placeholder, programs, drop_in: dropCents ? { name: 'Drop-in session', amount_cents: dropCents } : null } },
      { key: 'classes', updated_at: now, value: classes.filter((c) => c.name.trim()).map((c) => ({ key: c.key || slug(c.name), name: c.name.trim() })) },
    ]);
    setBusy(false);
    if (error) return toast({ title: 'Could not save', description: error.message });
    setCfg((c) => ({ ...c, programs: programs.map((p) => ({ ...p, price: dollars(p.amount_cents) })) }));
    toast({ title: 'Saved', description: 'Applies to the next payment. Families already enrolled keep what they paid for.' });
  };

  if (!cfg) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl">Enrollment</h1>
        <p className="mt-1 text-sm text-muted-foreground">The assessment is free. Families then pay for a program, and workouts, nutrition and training plans are included while they're enrolled.</p>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">How programs are billed</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {[['monthly', 'Monthly', 'Card renews every month. Cash or Venmo covers one month. Access stops if a month is not paid.'],
              ['one_time', 'One time', 'A single payment enrolls them. Access stays until it is refunded or undone.']].map(([v, l, d]) => (
              <button key={v} onClick={() => setCfg({ ...cfg, billing: v })} className={cn('rounded-xl border p-4 text-left transition', cfg.billing === v ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50')}>
                <p className="font-semibold">{l}{cfg.billing === v ? ' ✓' : ''}</p><p className="mt-1 text-xs text-muted-foreground">{d}</p>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.placeholder} onChange={(e) => setCfg({ ...cfg, placeholder: e.target.checked })} /> Placeholder (shows staff a reminder that prices are not confirmed)</label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg">Programs</CardTitle>
          <Button size="sm" variant="outline" onClick={useSiteMonthly}>Use the website's monthly programs</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-12 gap-2 px-1 text-[11px] font-medium text-muted-foreground"><span className="col-span-8">Program</span><span className="col-span-3">Price ($){cfg.billing === 'monthly' ? ' per month' : ''}</span></div>
          {cfg.programs.map((p, i) => (
            <div key={p.key || i} className="grid grid-cols-12 items-center gap-2">
              <Input aria-label="Program name" className="col-span-8" value={p.name} onChange={(e) => upd(i, 'name', e.target.value)} />
              <Input aria-label="Price" className="col-span-3" inputMode="decimal" value={p.price} onChange={(e) => upd(i, 'price', e.target.value)} />
              <button className="col-span-1 justify-self-center text-muted-foreground hover:text-destructive" onClick={() => setCfg({ ...cfg, programs: cfg.programs.filter((_, j) => j !== i) })} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setCfg({ ...cfg, programs: [...cfg.programs, { key: '', name: '', price: '' }] })}><Plus className="h-3 w-3" /> Add program</Button>
          <div className="flex items-center gap-3 border-t border-border pt-3">
            <Label htmlFor="dropin" className="text-sm">Drop-in session ($, one time, doesn't unlock content)</Label>
            <Input id="dropin" className="w-28" inputMode="decimal" value={cfg.dropIn} onChange={(e) => setCfg({ ...cfg, dropIn: e.target.value })} placeholder="none" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">Classes a coach can recommend</CardTitle><p className="text-xs text-muted-foreground">Shown with the assessment results. When a class has the same name as a program, it's preselected at payment.</p></CardHeader>
        <CardContent className="space-y-2">
          {classes.map((c, i) => (
            <div key={c.key || i} className="flex items-center gap-2">
              <Input aria-label="Class name" value={c.name} onChange={(e) => setClasses((xs) => xs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <button onClick={() => setClasses((xs) => xs.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setClasses((xs) => [...xs, { key: '', name: '' }])}><Plus className="h-3 w-3" /> Add class</Button>
        </CardContent>
      </Card>
      <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
    </div>
  );
}
