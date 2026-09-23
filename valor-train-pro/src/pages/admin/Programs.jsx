import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || `class_${Date.now()}`;

/**
 * Enrollment is the one thing families pay for (workouts, nutrition and training plans included).
 * Settings "enrollment" = { name, amount_cents, placeholder }. Settings "classes" = what a coach recommends.
 */
export default function AdminEnrollment() {
  const [product, setProduct] = useState(null);
  const [classes, setClasses] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('settings').select('key, value').in('key', ['enrollment', 'classes']).then(({ data }) => {
      const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
      const e = map.enrollment || { name: 'Valor enrollment', amount_cents: 0, placeholder: true };
      setProduct({ ...e, price: (e.amount_cents / 100).toString() });
      setClasses(Array.isArray(map.classes) ? map.classes : []);
    });
  }, []);

  const save = async () => {
    const cents = Math.round(Number(product.price) * 100);
    if (!product.name.trim() || !Number.isFinite(cents) || cents < 50) return toast({ title: 'Enter a name and a price of at least $0.50' });
    setBusy(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from('settings').upsert([
      { key: 'enrollment', value: { name: product.name.trim(), amount_cents: cents, placeholder: !!product.placeholder }, updated_at: now },
      { key: 'classes', value: classes.filter((c) => c.name.trim()).map((c) => ({ key: c.key || slug(c.name), name: c.name.trim() })), updated_at: now },
    ]);
    setBusy(false);
    if (error) return toast({ title: 'Could not save', description: error.message });
    toast({ title: 'Saved', description: 'The new price applies to the next enrollment.' });
  };

  if (!product) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl">Enrollment</h1>
        <p className="mt-1 text-sm text-muted-foreground">The assessment is free. After it, families pay one enrollment, and workouts, nutrition and training plans are included.</p>
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">Enrollment price</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1"><Label htmlFor="en-name" className="text-xs">Name on the receipt</Label><Input id="en-name" value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="en-price" className="text-xs">Price ($, one time)</Label><Input id="en-price" inputMode="decimal" value={product.price} onChange={(e) => setProduct({ ...product, price: e.target.value })} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!product.placeholder} onChange={(e) => setProduct({ ...product, placeholder: e.target.checked })} /> Placeholder price (shows a reminder to staff)</label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">Classes a coach can recommend</CardTitle><p className="text-xs text-muted-foreground">Shown with the assessment results. Not a price.</p></CardHeader>
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
