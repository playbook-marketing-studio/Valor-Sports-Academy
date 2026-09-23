import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CalendarDays } from 'lucide-react';
import { callFn } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BookLayout from './BookLayout';
import { buildDays, money } from '@/lib/slots';
import { cn } from '@/lib/utils';

const sports = ['Football', 'Basketball', 'Baseball', 'Softball', 'Soccer', 'Volleyball', 'Track', 'Wrestling', 'Other'];
const heard = ['Instagram', 'Facebook', 'Google', 'A friend or coach', 'Drove by', 'Other'];

export default function Book() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [cfg, setCfg] = useState(null);
  const [taken, setTaken] = useState([]);
  const [form, setForm] = useState({
    athlete_first_name: params.get('athlete') || '', athlete_last_name: '', athlete_age: params.get('age') || '',
    sport: params.get('sport') || '', parent_name: params.get('parent') || '', parent_email: params.get('email') || '',
    parent_phone: params.get('phone') || '', how_heard: params.get('source') || '', notes: '',
  });
  const [slot, setSlot] = useState('');
  const [requestMode, setRequestMode] = useState(false);
  const [requestedNote, setRequestedNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    callFn('booking', { method: 'GET', query: { action: 'slots' } })
      .then((r) => { setCfg(r.config); setTaken(r.taken || []); })
      .catch(() => setError('Could not load open times. Try again in a minute.'));
  }, []);

  const days = useMemo(() => (cfg ? buildDays(cfg, taken) : []), [cfg, taken]);
  const set = (k) => (e) => { const v = e?.target ? e.target.value : e; setForm((f) => ({ ...f, [k]: v })); };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!requestMode && !slot) { setError('Pick a time, or tap "None of these work?"'); return; }
    if (requestMode && !requestedNote.trim()) { setError('Tell us what days and times work.'); return; }
    setSaving(true);
    try {
      const utm = {};
      for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid']) if (params.get(k)) utm[k] = params.get(k);
      const r = await callFn('booking', {
        body: {
          action: 'create', ...form, athlete_age: Number(form.athlete_age) || null,
          slot_start: requestMode ? null : slot, requested_note: requestMode ? requestedNote : null,
          source: params.get('utm_source') || (params.get('from') || 'app'), utm: Object.keys(utm).length ? utm : null,
        },
      });
      navigate(`/book/account?b=${r.booking.id}&t=${r.claim_token}`);
    } catch (err) {
      setError(err.message);
      if (err.status === 409) callFn('booking', { method: 'GET', query: { action: 'slots' } }).then((r) => setTaken(r.taken || [])).catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  return (
    <BookLayout step={0} title="Book an athlete assessment" wide
      subtitle={cfg ? `Saturdays at 1973 Fowler St, Richland. ${money(cfg.fee_cents, cfg.currency)} per athlete, paid online or at the session.` : 'Saturdays at 1973 Fowler St, Richland.'}>
      <form onSubmit={submit} className="space-y-8">
        <section className="space-y-4">
          <h2 className="font-display text-lg ">The athlete</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="afn">First name</Label><Input id="afn" required value={form.athlete_first_name} onChange={set('athlete_first_name')} /></div>
            <div className="space-y-1.5"><Label htmlFor="aln">Last name</Label><Input id="aln" value={form.athlete_last_name} onChange={set('athlete_last_name')} /></div>
            <div className="space-y-1.5"><Label htmlFor="age">Age</Label><Input id="age" type="number" min="5" max="25" required value={form.athlete_age} onChange={set('athlete_age')} /></div>
            <div className="space-y-1.5"><Label>Primary sport</Label>
              <Select value={form.sport} onValueChange={set('sport')}>
                <SelectTrigger><SelectValue placeholder="Pick one" /></SelectTrigger>
                <SelectContent>{sports.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-lg ">Parent or guardian</h2>
          <p className="text-xs text-muted-foreground">Athletes under 18 are set up under a parent account. You will create the login on the next step.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="pn">Your name</Label><Input id="pn" required value={form.parent_name} onChange={set('parent_name')} /></div>
            <div className="space-y-1.5"><Label htmlFor="pp">Phone</Label><Input id="pp" type="tel" required value={form.parent_phone} onChange={set('parent_phone')} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="pe">Email</Label><Input id="pe" type="email" required value={form.parent_email} onChange={set('parent_email')} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>How did you hear about Valor?</Label>
              <Select value={form.how_heard} onValueChange={set('how_heard')}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>{heard.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> Pick a Saturday time</h2>
            <button type="button" onClick={() => setRequestMode(!requestMode)} className="text-xs text-primary hover:underline">
              {requestMode ? 'Show open times' : 'None of these work?'}
            </button>
          </div>
          {!cfg && !error && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
          {requestMode ? (
            <div className="space-y-1.5">
              <Label htmlFor="rq">What days and times work for you?</Label>
              <Textarea id="rq" rows={3} value={requestedNote} onChange={(e) => setRequestedNote(e.target.value)} placeholder="e.g. Any Saturday after 1pm, or a weekday evening" />
              <p className="text-xs text-muted-foreground">A coach will text you to confirm a time.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {days.slice(0, 6).map((d) => (
                <div key={d.ymd}>
                  <p className="mb-2 text-sm font-medium">{d.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {d.slots.map((s) => (
                      <button key={s.iso} type="button" disabled={s.taken} onClick={() => setSlot(s.iso)}
                        className={cn('rounded-lg border px-3 py-2 text-sm transition',
                          s.taken ? 'cursor-not-allowed border-border text-muted-foreground/40 line-through' :
                          slot === s.iso ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/60')}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {cfg && days.length === 0 && <p className="text-sm text-muted-foreground">No open Saturdays right now. Tap "None of these work?" and we will find a time.</p>}
            </div>
          )}
        </section>

        {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <Button type="submit" size="lg" className="w-full" disabled={saving || !cfg}>
          {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : 'Continue to create your account'}
        </Button>
      </form>
    </BookLayout>
  );
}
