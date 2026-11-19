// Digital waiver (11/18/2026). Server: supabase/functions/waiver. Text lives in waiver_texts (one row per version).
import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export const ROLE_LABEL = { parent: 'Parent', guardian: 'Legal guardian', athlete: 'Athlete (18 or older)' };
export const fmtSigned = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
export const fmtDate = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' }).format(new Date(iso));

/** Words wrapped in [[...]] are still being confirmed with Valor: highlighted while the version is a draft. */
function Inline({ text, flag }) {
  const parts = text.split(/(\[\[[\s\S]*?\]\])/g);
  return parts.map((p, i) => (p.startsWith('[[')
    ? (flag ? <mark key={i} className="rounded bg-yellow-200 px-0.5 text-black dark:bg-yellow-300">{p.slice(2, -2)}</mark> : <React.Fragment key={i}>{p.slice(2, -2)}</React.Fragment>)
    : <React.Fragment key={i}>{p}</React.Fragment>));
}

/** The waiver body: '## ' and '### ' headings, blank-line paragraphs. */
export function WaiverText({ waiver, className }) {
  const flag = waiver.status === 'draft';
  return (
    <div className={cn('space-y-3 text-[13px] leading-relaxed', className)}>
      {flag && waiver.review_note && (
        <div className="flex gap-2 rounded-lg border border-yellow-400 bg-yellow-50 p-3 text-xs text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div><b>Preview only, not live.</b> {waiver.review_note}</div>
        </div>
      )}
      <p className="font-display text-lg leading-tight">{waiver.title}</p>
      {waiver.body.split(/\n{2,}/).map((p, i) => {
        if (p.startsWith('### ')) return <p key={i} className="pt-1 font-semibold"><Inline text={p.slice(4)} flag={flag} /></p>;
        if (p.startsWith('## ')) return <p key={i} className="pt-2 font-bold"><Inline text={p.slice(3)} flag={flag} /></p>;
        return <p key={i}><Inline text={p} flag={flag} /></p>;
      })}
    </div>
  );
}

/**
 * Read + sign. `athlete` = { first_name, last_name, age }. `askEmail` on the no-login link (we email the copy there).
 * onSign(payload) returns a promise; errors show under the button.
 */
export function SignWaiverForm({ waiver, athlete, askEmail = false, defaultName = '', onSign, compactText = false }) {
  const minor = athlete.age != null && athlete.age < 18;
  const [name, setName] = useState(defaultName);
  const [role, setRole] = useState(minor ? 'parent' : '');
  const [email, setEmail] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const who = [athlete.first_name, athlete.last_name].filter(Boolean).join(' ');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!role) return setError("Pick who's signing.");
    if (name.trim().split(/\s+/).length < 2) return setError('Type your full first and last name.');
    if (askEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Add your email so we can send you a copy.');
    if (!agree) return setError('Check the box to agree.');
    setBusy(true);
    try {
      await onSign({ signer_name: name.trim(), signer_role: role, signer_email: email.trim(), agree: true, version: waiver.version });
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const roles = minor ? ['parent', 'guardian'] : ['parent', 'guardian', 'athlete'];
  return (
    <form onSubmit={submit} className="space-y-5">
      <div className={cn('overflow-y-auto rounded-xl border border-border bg-background p-4', compactText ? 'max-h-[45vh]' : 'max-h-[55vh]')} tabIndex={0} aria-label="Waiver text">
        <WaiverText waiver={waiver} />
      </div>
      <div className="space-y-2">
        <Label>Who's signing for {athlete.first_name}?</Label>
        <div className="grid gap-2">
          {roles.map((r) => (
            <button type="button" key={r} onClick={() => setRole(r)}
              className={cn('flex min-h-11 items-center gap-3 rounded-xl border px-4 text-left text-sm', role === r ? 'border-primary bg-primary/5 font-semibold' : 'border-border')}>
              <span className={cn('h-4 w-4 rounded-full border', role === r ? 'border-[5px] border-primary' : 'border-muted-foreground')} />
              {r === 'athlete' ? `I'm ${athlete.first_name}, and I'm 18 or older` : `I'm ${athlete.first_name}'s ${r === 'parent' ? 'parent' : 'legal guardian'}`}
            </button>
          ))}
        </div>
        {minor && <p className="text-xs text-muted-foreground">{athlete.first_name} is under 18, so a parent or guardian signs.</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wv-name">Your full name (this is your signature)</Label>
        <Input id="wv-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="First and last name" className="h-11 text-base" />
      </div>
      {askEmail && (
        <div className="space-y-1.5">
          <Label htmlFor="wv-email">Your email (we'll send you a copy)</Label>
          <Input id="wv-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="h-11 text-base" />
        </div>
      )}
      <label className="flex items-start gap-3 text-sm">
        <Checkbox checked={agree} onCheckedChange={(v) => setAgree(!!v)} className="mt-0.5 h-5 w-5" />
        <span>I've read this waiver and agree to it{role && role !== 'athlete' ? ` on behalf of ${who}` : ''}. I understand I'm giving up substantial rights by signing it.</span>
      </label>
      {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Sign ${athlete.first_name}'s waiver`}</Button>
    </form>
  );
}

export function SignedNote({ signature, emailed, email }) {
  return (
    <div className="flex gap-3 rounded-xl bg-success-surface p-4 text-sm text-success">
      <CheckCircle2 className="h-5 w-5 shrink-0" />
      <div>
        <p className="font-semibold">Signed{signature?.signer_name ? ` by ${signature.signer_name}` : ''}</p>
        {signature?.signed_at && <p>{fmtSigned(signature.signed_at)}</p>}
        {emailed && <p className="mt-1">We emailed a copy{email ? ` to ${email}` : ''}.</p>}
      </div>
    </div>
  );
}
