import React, { useEffect, useState } from 'react';
import { Loader2, MailCheck } from 'lucide-react';
import { callFn } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { SITE_ASSESSMENT_URL, VALOR_EMAIL } from '@/lib/valor';

/**
 * Home for a login with no athlete yet (someone who signed up in the app on their own, Valor 11/9/2026).
 *  - A kid on file with this email as the parent email: "Email me the link" proves the inbox, then the kid connects.
 *  - Otherwise "Who's training?": adds the athlete to this login, and Home's plan card + checkout show right away.
 */
export default function GetStarted({ onAdded, promo = '' }) {
  const [status, setStatus] = useState(null); // null loading | {match}
  const [sent, setSent] = useState(null); // email the link went to
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    callFn('family', { body: { action: 'status' } }).then(setStatus).catch(() => setStatus({ match: false }));
  }, []);

  const sendLink = async () => {
    setBusy(true);
    try {
      const r = await callFn('family', { body: { action: 'send_claim' } });
      if (r.sent) setSent(r.email); else setShowForm(true);
    } catch (e) {
      toast({ title: 'Could not send the email', description: e.message });
    } finally { setBusy(false); }
  };

  if (!status) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (status.match && !showForm) {
    return (
      <div className="space-y-3 rounded-xl border border-primary/60 bg-primary/5 p-5">
        {sent ? (
          <>
            <h2 className="flex items-center gap-2 font-display text-2xl"><MailCheck className="h-6 w-6 text-primary" /> Check your email</h2>
            <p className="text-sm text-muted-foreground">We sent a link to <span className="font-semibold text-foreground">{sent}</span>. Tap it on this phone and your athlete shows up here. It can take a minute, and check spam if it's not there.</p>
            <button onClick={sendLink} disabled={busy} className="text-sm font-medium text-primary hover:underline">Send it again</button>
          </>
        ) : (
          <>
            <h2 className="font-display text-2xl">We found your athlete</h2>
            <p className="text-sm text-muted-foreground">Your email is already on file at Valor. To keep your athlete's info private, we'll email you a link to connect them to this login.</p>
            <Button onClick={sendLink} disabled={busy}>{busy ? 'Sending…' : 'Email me the link'}</Button>
          </>
        )}
        <button onClick={() => setShowForm(true)} className="block text-xs text-muted-foreground hover:text-foreground">Signing up someone else? Add them here</button>
      </div>
    );
  }

  return <WhoIsTraining onAdded={onAdded} />;
}

function WhoIsTraining({ onAdded }) {
  const [role, setRole] = useState('');
  const [f, setF] = useState({ first_name: '', last_name: '', age: '', sport: '', phone: '', parent_name: '', parent_phone: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const athlete = role === 'athlete';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await callFn('family', { body: { action: 'add_athlete', role, ...f, age: f.age ? Number(f.age) : null } });
      onAdded?.();
    } catch (err) {
      toast({ title: 'Could not add your athlete', description: err.message });
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="font-display text-2xl">Who's training?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Add your athlete to pick a plan and pay right here. New to Valor? Your first assessment is free.</p>
        {promo && <p className="mt-2 text-sm font-semibold text-primary">{promo}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Who is signing up">
        {[['athlete', "I'm the athlete"], ['parent', "I'm a parent"]].map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={role === k} onClick={() => setRole(k)}
            className={cn('min-h-[48px] rounded-full border px-4 text-sm font-semibold transition', role === k ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:border-primary/60')}>{l}</button>
        ))}
      </div>
      {role && (
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="gs-first">{athlete ? 'Your first name' : "Athlete's first name"}</Label><Input id="gs-first" required value={f.first_name} onChange={set('first_name')} autoComplete={athlete ? 'given-name' : 'off'} /></div>
            <div className="space-y-1"><Label htmlFor="gs-last">Last name</Label><Input id="gs-last" value={f.last_name} onChange={set('last_name')} autoComplete={athlete ? 'family-name' : 'off'} /></div>
            <div className="space-y-1"><Label htmlFor="gs-age">Age</Label><Input id="gs-age" type="number" inputMode="numeric" min={4} max={60} value={f.age} onChange={set('age')} /></div>
            <div className="space-y-1"><Label htmlFor="gs-sport">Sport</Label><Input id="gs-sport" value={f.sport} onChange={set('sport')} placeholder="Football, volleyball..." /></div>
          </div>
          <div className="space-y-1"><Label htmlFor="gs-phone">Your phone</Label><Input id="gs-phone" type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} /></div>
          {athlete && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Under 18 or someone else pays? Add a parent so the coaches can reach them. You can text them the payment link on the next screen.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label htmlFor="gs-pname">Parent's name</Label><Input id="gs-pname" value={f.parent_name} onChange={set('parent_name')} /></div>
                <div className="space-y-1"><Label htmlFor="gs-pphone">Parent's phone</Label><Input id="gs-pphone" type="tel" inputMode="tel" value={f.parent_phone} onChange={set('parent_phone')} /></div>
              </div>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={busy || !f.first_name.trim()}>{busy ? 'One moment…' : 'Next: pick a plan'}</Button>
        </form>
      )}
      <p className="text-xs text-muted-foreground">Want to try it first? <a href={SITE_ASSESSMENT_URL} className="font-medium text-primary hover:underline">Book a free assessment</a>. Questions? Email <span className="font-medium text-foreground">{VALOR_EMAIL}</span>.</p>
    </div>
  );
}
