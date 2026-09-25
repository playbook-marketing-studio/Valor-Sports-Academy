import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || `item_${Date.now()}`;
const blankNum = (v) => (v === '' || v == null ? null : Number(v));

/**
 * settings.enrollment = { placeholder, note, items: [{ key, name, amount_cents, classes, expires_days }] }
 * Classes and class packs, sold one time the way Valor sells at the gym (no subscriptions).
 * A paid item unlocks workouts, nutrition and training plans until its classes are used or it expires.
 */
export default function AdminEnrollment() {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', 'enrollment').maybeSingle().then(({ data }) => {
      const e = data?.value || {};
      setCfg({
        placeholder: !!e.placeholder, note: e.note || '',
        items: (e.items || []).map((x) => ({ ...x, price: ((x.amount_cents || 0) / 100).toString(), classes: x.classes ?? '', expires_days: x.expires_days ?? '' })),
      });
    });
  }, []);

  const upd = (i, k, v) => setCfg((c) => ({ ...c, items: c.items.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
  const save = async () => {
    const items = cfg.items.filter((x) => x.name.trim()).map((x) => ({
      key: x.key || slug(x.name), name: x.name.trim(), amount_cents: Math.round(Number(x.price) * 100),
      classes: blankNum(x.classes), expires_days: blankNum(x.expires_days),
    }));
    if (!items.length || items.some((x) => !Number.isFinite(x.amount_cents) || x.amount_cents < 50)) return toast({ title: 'Each item needs a name and a price of at least $0.50' });
    if (items.some((x) => (x.classes !== null && !(x.classes > 0)) || (x.expires_days !== null && !(x.expires_days > 0)))) return toast({ title: 'Classes and expiry must be blank or a positive number' });
    setBusy(true);
    const { error } = await supabase.from('settings').upsert({ key: 'enrollment', updated_at: new Date().toISOString(), value: { placeholder: cfg.placeholder, note: cfg.placeholder ? cfg.note : '', items } });
    setBusy(false);
    if (error) return toast({ title: 'Could not save', description: error.message });
    toast({ title: 'Saved', description: 'Applies to the next purchase. Packs already bought keep what they paid for.' });
  };

  if (!cfg) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl">Enrollment</h1>
        <p className="mt-1 text-sm text-muted-foreground">The assessment is free. After it, families buy a class or a class pack, one time, the way they would at the front desk. Workouts, nutrition and training plans are included until the classes are used up or the pack expires.</p>
      </div>
      {cfg.placeholder && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          These prices are placeholders copied from your website. Change each one to what you actually charge: the price, how many classes it includes (leave blank for unlimited) and how many days it lasts (leave blank for no expiry). Then tap Save.
        </p>
      )}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">Classes and packs</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {/* Phone: one card per class/pack with labeled fields — a 12-col table doesn't fit at 390px. */}
          <div className="space-y-3 sm:hidden">
            {cfg.items.map((x, i) => (
              <div key={x.key || i} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">Name</Label>
                  <button className="text-muted-foreground hover:text-destructive" onClick={() => setCfg({ ...cfg, items: cfg.items.filter((_, j) => j !== i) })} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                </div>
                <Input aria-label="Name" value={x.name} onChange={(e) => upd(i, 'name', e.target.value)} />
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1"><Label className="text-xs">Price ($)</Label><Input aria-label="Price" inputMode="decimal" value={x.price} onChange={(e) => upd(i, 'price', e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">Classes</Label><Input aria-label="Classes" inputMode="numeric" placeholder="Unlimited" value={x.classes} onChange={(e) => upd(i, 'classes', e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">Expires after (days)</Label><Input aria-label="Expires after days" inputMode="numeric" placeholder="Never" value={x.expires_days} onChange={(e) => upd(i, 'expires_days', e.target.value)} /></div>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop/tablet: compact table. */}
          <div className="hidden space-y-2 sm:block">
            <div className="grid grid-cols-12 gap-2 px-1 text-[11px] font-medium text-muted-foreground">
              <span className="col-span-6">Name</span><span className="col-span-2">Price ($)</span><span className="col-span-1">Classes</span><span className="col-span-2">Expires after (days)</span>
            </div>
            {cfg.items.map((x, i) => (
              <div key={x.key || i} className="grid grid-cols-12 items-center gap-2">
                <Input aria-label="Name" className="col-span-6" value={x.name} onChange={(e) => upd(i, 'name', e.target.value)} />
                <Input aria-label="Price" className="col-span-2" inputMode="decimal" value={x.price} onChange={(e) => upd(i, 'price', e.target.value)} />
                <Input aria-label="Classes" className="col-span-1 px-2" inputMode="numeric" placeholder="Unlimited" value={x.classes} onChange={(e) => upd(i, 'classes', e.target.value)} />
                <Input aria-label="Expires after days" className="col-span-2" inputMode="numeric" placeholder="Never" value={x.expires_days} onChange={(e) => upd(i, 'expires_days', e.target.value)} />
                <button className="col-span-1 justify-self-center text-muted-foreground hover:text-destructive" onClick={() => setCfg({ ...cfg, items: cfg.items.filter((_, j) => j !== i) })} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <p className="px-1 text-xs text-muted-foreground">Leave classes blank for unlimited. Leave expiry blank for never.</p>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setCfg({ ...cfg, items: [...cfg.items, { key: '', name: '', price: '', classes: '', expires_days: '' }] })}><Plus className="h-3 w-3" /> Add class or pack</Button>
          <label className="flex items-center gap-2 border-t border-border pt-3 text-sm"><input type="checkbox" checked={cfg.placeholder} onChange={(e) => setCfg({ ...cfg, placeholder: e.target.checked })} /> Placeholder: shows "confirm with Corey" to staff</label>
        </CardContent>
      </Card>
      <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
    </div>
  );
}
