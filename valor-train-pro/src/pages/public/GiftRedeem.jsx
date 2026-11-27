import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Gift, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import GetStarted from '@/components/GetStarted';
import { forgetCode, giftFn, goodThrough, rememberCode } from '@/lib/gifts';
import { VALOR_EMAIL } from '@/lib/valor';
import { cn } from '@/lib/utils';
import PublicLayout from './PublicLayout';

/**
 * Where a gift code goes (the voucher's QR, the gift email, or typed in at /gift). Works signed out: it shows
 * what the gift is and sends them to sign up or log in, remembering the code so Home offers it after.
 */
export default function GiftRedeem() {
  const { code: codeParam } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [typed, setTyped] = useState('');
  const [gift, setGift] = useState(null);
  const [err, setErr] = useState('');
  const [kids, setKids] = useState(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!codeParam) return;
    setErr(''); setGift(null);
    giftFn({ action: 'peek', code: codeParam }).then((g) => { setGift(g); rememberCode(g.code); }).catch((e) => setErr(e.message));
  }, [codeParam]);

  useEffect(() => {
    if (!isAuthenticated || user?.role === 'admin') { setKids(null); return; }
    base44.entities.Athlete.list('first_name', 20).then((ks) => {
      const live = ks.filter((k) => !k.archived_at);
      setKids(live);
      if (live.length === 1) setPick(live[0].id);
    }).catch(() => setKids([]));
  }, [isAuthenticated, user?.role, reload]);

  const claim = async () => {
    setBusy(true);
    try {
      const r = await giftFn({ action: 'claim', code: gift.code, athlete_id: pick });
      forgetCode();
      setDone(r);
    } catch (e) {
      toast({ title: 'Could not add the classes', description: e.message });
    } finally { setBusy(false); }
  };

  if (!codeParam) {
    return (
      <PublicLayout title="Have a gift code?" subtitle="Enter it to add the classes to your athlete.">
        <form onSubmit={(e) => { e.preventDefault(); if (typed.trim()) navigate(`/gift/${encodeURIComponent(typed.trim().toUpperCase())}`); }} className="space-y-3">
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="7K3M-Q9XP" autoCapitalize="characters" autoComplete="off" className="text-center font-mono text-lg tracking-widest" />
          <Button type="submit" className="w-full" disabled={!typed.trim()}>Continue</Button>
        </form>
      </PublicLayout>
    );
  }
  if (err) {
    return (
      <PublicLayout title="We couldn't find that gift" subtitle={err}>
        <Button asChild variant="outline" className="w-full"><Link to="/gift">Try another code</Link></Button>
        <p className="mt-3 text-xs text-muted-foreground">Questions? Email {VALOR_EMAIL}.</p>
      </PublicLayout>
    );
  }
  if (!gift) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const what = gift.classes ? `${gift.classes} classes` : gift.item_name;
  const until = gift.expires_at ? `good through ${goodThrough(gift.expires_at)}` : '';

  if (done) {
    return (
      <PublicLayout title="You're all set">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 text-success" />
          <p className="text-sm"><span className="font-semibold">{done.athlete} has {what} at Valor{until ? `, ${until}` : ''}.</span> Just show up to any class. Thank {gift.from_name || 'them'} for us!</p>
        </div>
        <Button asChild className="mt-5 w-full"><Link to="/">Go to Home</Link></Button>
      </PublicLayout>
    );
  }
  if (gift.status !== 'paid') {
    return (
      <PublicLayout title={gift.status === 'claimed' ? 'This gift was already used' : "This gift can't be used"} subtitle={gift.status === 'claimed' ? 'The classes are already on an athlete. If that wasn\'t you, reach out to Valor.' : 'It was refunded.'}>
        <p className="text-xs text-muted-foreground">Questions? Email {VALOR_EMAIL}.</p>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout title={`${gift.from_name || 'Someone'} gave you ${what}`} subtitle={`At Valor Sports Academy${until ? `, ${until}` : ''}. Any regular class, all sports.`}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-primary/50 bg-primary/5 px-4 py-3">
          <Gift className="h-6 w-6 shrink-0 text-primary" />
          <div className="min-w-0 text-sm">
            {gift.to_name && <p className="font-semibold">For {gift.to_name}</p>}
            {gift.note && <p className="italic text-muted-foreground">"{gift.note}"</p>}
            <p className="font-mono text-xs tracking-widest text-muted-foreground">{gift.code}</p>
          </div>
        </div>

        {!isAuthenticated && (
          <div className="space-y-2">
            <p className="text-sm">Make a free account (or log in) to add the classes to your athlete.</p>
            <Button asChild className="w-full"><Link to="/register">Create an account</Link></Button>
            <Button asChild variant="outline" className="w-full"><Link to="/login">I already have one, log in</Link></Button>
            <p className="text-xs text-muted-foreground">We'll keep this gift ready for you after you sign in.</p>
          </div>
        )}

        {isAuthenticated && user?.role === 'admin' && <p className="text-sm text-muted-foreground">You're signed in as staff. A family claims this from their own login.</p>}

        {isAuthenticated && user?.role !== 'admin' && kids === null && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}

        {isAuthenticated && kids?.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">First, add your athlete.</p>
            <GetStarted onAdded={() => setReload((n) => n + 1)} />
          </div>
        )}

        {isAuthenticated && kids?.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">Who are the classes for?</p>
            <div className="space-y-1.5" role="radiogroup" aria-label="Athlete">
              {kids.map((k) => (
                <button key={k.id} type="button" role="radio" aria-checked={pick === k.id} onClick={() => setPick(k.id)}
                  className={cn('flex w-full items-center rounded-xl border px-3 py-2.5 text-left text-sm font-semibold', pick === k.id ? 'border-2 border-primary bg-primary/5' : 'border-border hover:border-primary/40')}>
                  {k.first_name} {k.last_name || ''}
                </button>
              ))}
            </div>
            <Button className="w-full" disabled={!pick || busy} onClick={claim}>{busy ? 'One moment…' : `Add ${what}${pick ? ` to ${kids.find((k) => k.id === pick)?.first_name}` : ''}`}</Button>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
