import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Gift, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';
import { loadSettings, VALOR_EMAIL } from '@/lib/valor';
import { money } from '@/lib/autopay';
import { giftFn, giftItem, goodThroughFromItem } from '@/lib/gifts';
import { cn } from '@/lib/utils';

/** Buy classes as a gift (Omar 11/27/2026). Pays in Stripe, then lands on the voucher. */
export default function GiftBuy() {
  const [params] = useSearchParams();
  const [item, setItem] = useState(undefined); // undefined loading | null none
  const [f, setF] = useState({ from_name: '', to_name: '', to_email: '', note: '' });
  const [how, setHow] = useState('voucher'); // 'voucher' | 'email'
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    loadSettings().then((st) => setItem(giftItem(st.enrollment))).catch(() => setItem(null));
    base44.auth.me().then((me) => setF((x) => (x.from_name ? x : { ...x, from_name: me?.full_name || '' }))).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await giftFn({ action: 'buy', item_key: item.key, from_name: f.from_name, to_name: f.to_name, to_email: how === 'email' ? f.to_email : '', note: f.note });
      window.location.href = r.url;
    } catch (err) {
      toast({ title: 'Could not start the payment', description: err.message });
      setBusy(false);
    }
  };

  if (item === undefined) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!item) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h1 className="font-display text-3xl">Gifts</h1>
        <p className="text-sm text-muted-foreground">There's no gift deal running right now. Questions? Email {VALOR_EMAIL}.</p>
        <Button asChild variant="outline"><Link to="/">Back to Home</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 font-display text-4xl"><Gift className="h-8 w-8 text-primary" /> Give {item.classes ? `${item.classes} classes` : 'classes'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{item.name} · {money(item.amount_cents)}{item.expires_on || item.expires_days ? ` · good through ${goodThroughFromItem(item)}` : ''}. Any regular class, all sports, ages 8 to 18.</p>
      </div>
      {params.get('canceled') && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">Payment not finished. Nothing was charged.</p>}
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="g-from">From</Label><Input id="g-from" required value={f.from_name} onChange={set('from_name')} placeholder="Your name" /></div>
          <div className="space-y-1"><Label htmlFor="g-to">For (optional)</Label><Input id="g-to" value={f.to_name} onChange={set('to_name')} placeholder="The athlete's name" /></div>
        </div>
        <div className="space-y-1"><Label htmlFor="g-note">Note (optional)</Label><Input id="g-note" maxLength={200} value={f.note} onChange={set('note')} placeholder="Merry Christmas!" /></div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">How do you want to give it?</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="How to give it">
            {[['voucher', 'I\'ll give it myself', 'Save or screenshot the voucher'], ['email', 'Email it for me', 'We email them the code']].map(([k, l, s]) => (
              <button key={k} type="button" role="radio" aria-checked={how === k} onClick={() => setHow(k)}
                className={cn('rounded-xl border px-3 py-2.5 text-left', how === k ? 'border-2 border-primary bg-primary/5' : 'border-border hover:border-primary/40')}>
                <span className="block text-sm font-semibold">{l}</span>
                <span className="block text-xs text-muted-foreground">{s}</span>
              </button>
            ))}
          </div>
          {how === 'email' && <div className="space-y-1"><Label htmlFor="g-email">Their email</Label><Input id="g-email" type="email" required value={f.to_email} onChange={set('to_email')} placeholder="parent@example.com" /></div>}
        </div>
        <Button type="submit" className="w-full" disabled={busy || !f.from_name.trim() || (how === 'email' && !f.to_email.trim())}>{busy ? 'One moment…' : `Pay ${money(item.amount_cents)}`}</Button>
        <p className="text-xs text-muted-foreground">After you pay you get the voucher with a gift code. You can save it, text it, or email it any time from your Account.</p>
      </form>
    </div>
  );
}
