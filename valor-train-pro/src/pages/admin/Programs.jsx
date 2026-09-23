import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || `plan_${Date.now()}`;

/** Programs and prices parents enroll in after the assessment. Stored in settings key "plans". */
export default function AdminPrograms() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', 'plans').maybeSingle().then(({ data }) => {
      setRows((Array.isArray(data?.value) ? data.value : []).map((p) => ({ ...p, price: (p.amount_cents / 100).toString() })));
    });
  }, []);

  const upd = (i, k, v) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const save = async () => {
    const clean = rows.filter((r) => r.name.trim()).map((r) => ({
      key: r.key || slug(r.name), name: r.name.trim(), amount_cents: Math.round(Number(r.price || 0) * 100), interval: r.interval || null,
    }));
    if (clean.some((r) => !Number.isFinite(r.amount_cents) || r.amount_cents < 0)) return toast({ title: 'Check the prices' });
    setBusy(true);
    const { error } = await supabase.from('settings').upsert({ key: 'plans', value: clean, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) return toast({ title: 'Could not save', description: error.message });
    setRows(clean.map((p) => ({ ...p, price: (p.amount_cents / 100).toString() })));
    toast({ title: 'Programs saved', description: 'New prices apply to the next payment. Existing monthly plans keep their price.' });
  };

  if (!rows) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl">Programs &amp; prices</h1>
        <p className="mt-1 text-sm text-muted-foreground">What families sign up for after the free assessment. Staff pick one when taking payment, and parents can enroll from their phone.</p>
      </div>
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-12 gap-2 px-1 text-[11px] font-medium text-muted-foreground"><span className="col-span-6">Program</span><span className="col-span-2">Price ($)</span><span className="col-span-3">Billing</span></div>
          {rows.map((r, i) => (
            <div key={r.key || i} className="grid grid-cols-12 items-center gap-2">
              <Input aria-label="Program name" className="col-span-6" value={r.name} onChange={(e) => upd(i, 'name', e.target.value)} />
              <Input aria-label="Price in dollars" className="col-span-2" inputMode="decimal" value={r.price} onChange={(e) => upd(i, 'price', e.target.value)} />
              <select aria-label="Billing" className="col-span-3 h-9 rounded-md border border-input bg-transparent px-2 text-sm" value={r.interval || ''} onChange={(e) => upd(i, 'interval', e.target.value || null)}>
                <option value="month">Monthly</option>
                <option value="">One time</option>
              </select>
              <button className="col-span-1 justify-self-center text-muted-foreground hover:text-destructive" onClick={() => setRows((xs) => xs.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setRows((xs) => [...xs, { key: '', name: '', price: '', interval: 'month' }])}><Plus className="h-3 w-3" /> Add program</Button>
            <Button size="sm" onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
