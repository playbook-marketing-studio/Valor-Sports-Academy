import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote, Check, Copy, Loader2, Mail, MessageSquare, Phone, QrCode, Save, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase, callFn } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { fmtSlot, money } from '@/lib/slots';
import { athleteName, loadSettings, planLabel, smsHref, telHref } from '@/lib/valor';
import { loginState } from './Athletes';
import { cn } from '@/lib/utils';

const METHOD_LABEL = { card: 'Card', cash: 'Cash', venmo: 'Venmo', other: 'Other' };

function QrPanel({ value, caption }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-2xl bg-white p-4 shadow"><QRCodeSVG value={value} size={240} level="M" /></div>
      <p className="max-w-xs text-center text-sm text-muted-foreground">{caption}</p>
    </div>
  );
}

// ── assessment results ────────────────────────────────────────────────────
function Results({ athlete, booking, plans, metrics, onSaved }) {
  const [rec, setRec] = useState(null);
  const [form, setForm] = useState({ metrics: {}, work_on: '', recommended_plan: '', notes: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.from('assessments').select('*').eq('athlete_id', athlete.id).order('date', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (data) { setRec(data); setForm({ metrics: data.metrics || {}, work_on: data.work_on || '', recommended_plan: data.recommended_plan || '', notes: data.notes || '' }); } });
  }, [athlete.id]);
  const save = async () => {
    setBusy(true);
    const values = { ...form, athlete_id: athlete.id, booking_id: booking?.id || null };
    const res = rec ? await supabase.from('assessments').update(values).eq('id', rec.id).select('*').single()
      : await supabase.from('assessments').insert(values).select('*').single();
    setBusy(false);
    if (res.error) return toast({ title: 'Could not save', description: res.error.message });
    setRec(res.data); onSaved(res.data);
    toast({ title: 'Results saved', description: 'The parent sees these when they log in.' });
  };
  const setMetric = (k, v) => setForm((f) => ({ ...f, metrics: { ...f.metrics, [k]: v } }));
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-lg">1. Assessment results</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {metrics.map((m) => (
            <div key={m.key} className="space-y-1">
              <Label className="text-xs">{m.label}{m.unit ? ` (${m.unit})` : ''}</Label>
              <Input inputMode="decimal" value={form.metrics[m.key] ?? ''} onChange={(e) => setMetric(m.key, e.target.value)} />
            </div>
          ))}
        </div>
        <div className="space-y-1"><Label>What to work on first</Label><Textarea rows={2} value={form.work_on} onChange={(e) => setForm({ ...form, work_on: e.target.value })} placeholder="The one or two things, in plain words" /></div>
        <div className="space-y-1">
          <Label>Class that fits their season</Label>
          <Select value={form.recommended_plan} onValueChange={(v) => setForm({ ...form, recommended_plan: v })}>
            <SelectTrigger><SelectValue placeholder="Pick one" /></SelectTrigger>
            <SelectContent>{plans.map((p) => <SelectItem key={p.key} value={p.key}>{planLabel(p)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label>Coach notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        <Button onClick={save} disabled={busy} className="gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save results</Button>
      </CardContent>
    </Card>
  );
}

// ── parent login ──────────────────────────────────────────────────────────
function ParentLogin({ athlete, onChanged }) {
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(athlete.parent_email || athlete.parent_login_email || '');
  const ls = loginState(athlete);
  const first = (athlete.parent_name || '').split(' ')[0];

  const create = async () => {
    setBusy(true);
    try {
      if (!athlete.parent_id && email.trim().toLowerCase() !== (athlete.parent_email || '')) {
        await supabase.from('athletes').update({ parent_email: email.trim().toLowerCase() }).eq('id', athlete.id);
      }
      const r = await callFn('staff', { body: { action: 'invite_parent', athlete_id: athlete.id } });
      setInvite(r); setOpen(true); onChanged();
    } catch (e) { toast({ title: 'Could not create the login', description: e.message }); }
    setBusy(false);
  };
  const msg = invite ? `Hi ${first}, here's your Valor login for ${athlete.first_name}'s training, results and payments: ${invite.link}` : '';

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-lg">2. Parent login</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', ls.cls)}>{ls.label}</span>
          {athlete.parent_last_sign_in_at && <span className="text-xs text-muted-foreground">last in {new Date(athlete.parent_last_sign_in_at).toLocaleDateString()}</span>}
        </div>
        {!athlete.parent_id && (
          <div className="space-y-1"><Label className="text-xs">Parent email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        )}
        <Button onClick={create} disabled={busy || !email} className="gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />} {athlete.invited_at || athlete.parent_id ? 'New login link' : 'Get parent login'}</Button>
        <p className="text-xs text-muted-foreground">Shows a QR code for the parent to scan on the spot, or text or email them the link. It works once, for 24 hours.</p>
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Login for {athlete.parent_name || invite?.email}</DialogTitle></DialogHeader>
          {invite && (
            <div className="space-y-4">
              <QrPanel value={invite.link} caption={`${first || 'Parent'} scans this with their phone camera, sets a password and lands on ${athlete.first_name}'s page.`} />
              <div className="grid grid-cols-3 gap-2">
                {athlete.parent_phone && <Button asChild variant="outline" size="sm"><a href={smsHref(athlete.parent_phone, msg)}><MessageSquare className="h-4 w-4" /> Text</a></Button>}
                <Button asChild variant="outline" size="sm"><a href={`mailto:${invite.email}?subject=${encodeURIComponent('Your Valor login')}&body=${encodeURIComponent(msg)}`}><Mail className="h-4 w-4" /> Email</a></Button>
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard?.writeText(invite.link); toast({ title: 'Link copied' }); }}><Copy className="h-4 w-4" /> Copy</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── payment ───────────────────────────────────────────────────────────────
function Payment({ athlete, plans, suggested }) {
  const { user } = useAuth();
  const [plan, setPlan] = useState(suggested || '');
  const [rows, setRows] = useState([]);
  const [checkout, setCheckout] = useState(null); // {url, payment_id}
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const poll = useRef(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('payments').select('*').eq('athlete_id', athlete.id).order('created_at', { ascending: false });
    setRows(data || []);
    return data || [];
  }, [athlete.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (suggested && !plan) setPlan(suggested); }, [suggested, plan]);
  useEffect(() => () => clearInterval(poll.current), []);

  const chosen = plans.find((p) => p.key === plan);
  const paidNow = checkout && rows.find((r) => r.id === checkout.payment_id)?.status === 'paid';

  const showCardQr = async () => {
    setBusy('card');
    try {
      const r = await callFn('staff', { body: { action: 'take_payment', athlete_id: athlete.id, plan_key: plan } });
      if (r.configured === false) toast({ title: 'Card payments are not connected yet', description: r.message });
      else {
        setCheckout(r);
        clearInterval(poll.current);
        poll.current = setInterval(async () => {
          const data = await load();
          if (data.find((x) => x.id === r.payment_id)?.status === 'paid') clearInterval(poll.current);
        }, 3000);
        await load();
      }
    } catch (e) { toast({ title: 'Could not start card payment', description: e.message }); }
    setBusy('');
  };

  const record = async (method) => {
    if (!chosen) return;
    setBusy(method);
    const { error } = await supabase.from('payments').insert({
      athlete_id: athlete.id, parent_id: athlete.parent_id, plan_key: chosen.key,
      description: `${chosen.name} · ${athleteName(athlete)}`, amount_cents: chosen.amount_cents,
      kind: 'one_time', method, status: 'paid', paid_at: new Date().toISOString(), recorded_by: user.id, note: note.trim() || null,
    });
    setBusy('');
    if (error) return toast({ title: 'Could not record it', description: error.message });
    setNote(''); await load();
    toast({ title: `${METHOD_LABEL[method]} payment recorded`, description: `${money(chosen.amount_cents)} for ${chosen.name}` });
  };
  const voidRow = async (r) => {
    const { error } = await supabase.from('payments').update({ status: 'canceled' }).eq('id', r.id);
    if (error) toast({ title: 'Could not undo', description: error.message }); else load();
  };

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-lg">3. Payment</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>Program</Label>
          <Select value={plan} onValueChange={setPlan}>
            <SelectTrigger><SelectValue placeholder="Pick what they're signing up for" /></SelectTrigger>
            <SelectContent>{plans.map((p) => <SelectItem key={p.key} value={p.key}>{planLabel(p)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button onClick={showCardQr} disabled={!chosen || !!busy} className="col-span-3 gap-2">{busy === 'card' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />} Card: show QR to scan</Button>
          <Button variant="outline" onClick={() => record('cash')} disabled={!chosen || !!busy} className="gap-2"><Banknote className="h-4 w-4" /> Paid cash</Button>
          <Button variant="outline" onClick={() => record('venmo')} disabled={!chosen || !!busy} className="gap-2">Paid Venmo</Button>
          <Button variant="outline" onClick={() => record('other')} disabled={!chosen || !!busy} className="gap-2">Other</Button>
        </div>
        <Input placeholder="Note (optional): Venmo name, check number, card on the reader" value={note} onChange={(e) => setNote(e.target.value)} />
        {chosen?.interval && <p className="text-xs text-muted-foreground">Card: the parent's card is charged {money(chosen.amount_cents)} today and each month after. Cash / Venmo covers one month.</p>}

        {rows.length > 0 && (
          <div className="divide-y divide-border rounded-lg border border-border text-sm">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate">{r.description.split(' · ')[0]} · {money(r.amount_cents)}</p>
                  <p className="text-xs text-muted-foreground">{METHOD_LABEL[r.method]}{r.kind === 'subscription' ? ' · monthly' : ''} · {r.status === 'paid' ? `paid ${new Date(r.paid_at).toLocaleDateString()}` : r.status}{r.note ? ` · ${r.note}` : ''}</p>
                </div>
                {r.status === 'paid' && r.method !== 'card' && <Button size="sm" variant="ghost" onClick={() => voidRow(r)}>Undo</Button>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <Dialog open={!!checkout} onOpenChange={(o) => { if (!o) { setCheckout(null); clearInterval(poll.current); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{chosen ? `${chosen.name} · ${money(chosen.amount_cents)}${chosen.interval ? '/mo' : ''}` : 'Payment'}</DialogTitle></DialogHeader>
          {checkout && (paidNow ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center"><Check className="h-10 w-10 text-green-600" /><p className="font-semibold">Paid. Welcome to Valor.</p></div>
          ) : (
            <QrPanel value={checkout.url} caption="Parent scans with their phone camera and pays with card, Apple Pay or Google Pay. This screen updates when it goes through." />
          ))}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function AthleteDetail() {
  const { id } = useParams();
  const [athlete, setAthlete] = useState(null);
  const [booking, setBooking] = useState(null);
  const [settings, setSettings] = useState({ plans: [], metrics: [] });
  const [suggested, setSuggested] = useState('');

  const load = useCallback(async () => {
    const [{ data: a }, { data: b }, { data: as }] = await Promise.all([
      supabase.from('athletes_admin').select('*').eq('id', id).maybeSingle(),
      supabase.from('bookings').select('*').eq('athlete_id', id).order('slot_start', { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
      supabase.from('assessments').select('recommended_plan').eq('athlete_id', id).order('date', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setAthlete(a); setBooking(b); if (as?.recommended_plan) setSuggested(as.recommended_plan);
  }, [id]);
  useEffect(() => { load(); loadSettings().then(setSettings); }, [load]);

  if (!athlete) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const phone = athlete.parent_phone;

  return (
    <div className="space-y-6">
      <Link to="/admin/bookings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Assessments</Link>
      <div className="rounded-[22px] bg-[#16140f] p-6 text-white">
        <p className="inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[0.16em] text-[#ff7484]"><span className="inline-block h-0.5 w-7 rounded bg-[#ff7484]" />{[athlete.age && `Age ${athlete.age}`, athlete.sport].filter(Boolean).join(' · ') || 'Athlete'}</p>
        <h1 className="mt-2 font-display text-4xl">{athleteName(athlete)}</h1>
        <p className="mt-2 text-sm text-white/70">
          {athlete.parent_name || 'Parent'}{athlete.parent_email ? ` · ${athlete.parent_email}` : ''}{phone ? ` · ${phone}` : ''}
          {booking?.slot_start ? ` · assessment ${fmtSlot(booking.slot_start)}` : ''}{booking?.quiz_result ? ` · quiz ${booking.quiz_result}` : ''}
        </p>
        {phone && <div className="mt-3 flex gap-2"><Button asChild size="sm" variant="secondary"><a href={telHref(phone)}><Phone className="h-4 w-4" /> Call</a></Button><Button asChild size="sm" variant="secondary"><a href={smsHref(phone, '')}><MessageSquare className="h-4 w-4" /> Text</a></Button></div>}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Results athlete={athlete} booking={booking} plans={settings.plans} metrics={settings.metrics} onSaved={(r) => r.recommended_plan && setSuggested(r.recommended_plan)} />
        <div className="space-y-6">
          <ParentLogin athlete={athlete} onChanged={load} />
          <Payment athlete={athlete} plans={settings.plans} suggested={suggested} />
        </div>
      </div>
    </div>
  );
}
