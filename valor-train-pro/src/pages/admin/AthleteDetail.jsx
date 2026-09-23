import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, ArchiveRestore, ArrowLeft, Banknote, Check, CheckCircle2, Copy, CopyPlus, Loader2, Mail, MessageSquare, Pencil, Phone, Plus, QrCode, Save, Smartphone, Trash2, UserPlus } from 'lucide-react';
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
import { athleteName, classesLeft, countsAsEnrollment, defaultItem, loadSettings, priceLabel, smsHref, telHref } from '@/lib/valor';
import { loginState } from './Athletes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AthleteForm from '@/components/AthleteForm';
import WorkoutEditor from '@/components/WorkoutEditor';
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
function Results({ athlete, booking, items, metrics, onSaved }) {
  const [rec, setRec] = useState(null);
  const [form, setForm] = useState({ metrics: {}, work_on: '', recommended_plan: '', notes: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.from('assessments').select('*').eq('athlete_id', athlete.id).order('date', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (data) { setRec(data); setForm({ metrics: data.metrics || {}, work_on: data.work_on || '', recommended_plan: data.recommended_plan || '', notes: data.notes || '' }); } });
  }, [athlete.id]);
  const startRetest = () => {
    setRec(null);
    setForm({ metrics: {}, work_on: '', recommended_plan: form.recommended_plan, notes: '' });
  };
  const save = async () => {
    setBusy(true);
    const values = { ...form, athlete_id: athlete.id, booking_id: rec ? rec.booking_id : (booking?.id || null) };
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
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-lg">1. Assessment results</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{rec ? `Editing the ${new Date(rec.date + 'T12:00:00').toLocaleDateString()} results` : 'New results, dated today'}</p>
        </div>
        {rec && <Button size="sm" variant="outline" onClick={startRetest}>Start a re-test</Button>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {metrics.map((m) => (
            <div key={m.key} className="space-y-1">
              <Label htmlFor={`m-${m.key}`} className="text-xs">{m.label}{m.unit ? ` (${m.unit})` : ''}</Label>
              <Input id={`m-${m.key}`} inputMode="decimal" value={form.metrics[m.key] ?? ''} onChange={(e) => setMetric(m.key, e.target.value)} />
            </div>
          ))}
        </div>
        <div className="space-y-1"><Label>What to work on first</Label><Textarea rows={2} value={form.work_on} onChange={(e) => setForm({ ...form, work_on: e.target.value })} placeholder="The one or two things, in plain words" /></div>
        <div className="space-y-1">
          <Label>Class or pack that fits their season</Label>
          <Select value={form.recommended_plan} onValueChange={(v) => setForm({ ...form, recommended_plan: v })}>
            <SelectTrigger><SelectValue placeholder="Pick one" /></SelectTrigger>
            <SelectContent>{items.map((c) => <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>)}</SelectContent>
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

// ── payment: one-time classes and class packs (no subscriptions) ──────────
function Payment({ athlete, cfg, recommendedKey }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [key, setKey] = useState('');
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
  useEffect(() => () => clearInterval(poll.current), []);
  useEffect(() => { if (!key && cfg) setKey(defaultItem(cfg, recommendedKey)?.key || ''); }, [cfg, recommendedKey, key]);

  if (!cfg) return null;
  const items = cfg.items || [];
  const chosen = items.find((p) => p.key === key);
  const active = rows.filter(countsAsEnrollment);
  const left = active.reduce((n, x) => (n == null || classesLeft(x) == null ? null : n + classesLeft(x)), 0);
  const usedUp = !active.length && rows.some((r) => r.status === 'paid');
  const paidNow = checkout && rows.find((r) => r.id === checkout.payment_id)?.status === 'paid';

  const showCardQr = async () => {
    setBusy('card');
    try {
      const r = await callFn('staff', { body: { action: 'take_payment', athlete_id: athlete.id, plan_key: key } });
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
    const now = new Date();
    const { error } = await supabase.from('payments').insert({
      athlete_id: athlete.id, parent_id: athlete.parent_id, plan_key: chosen.key,
      description: `${chosen.name} · ${athleteName(athlete)}`, amount_cents: chosen.amount_cents,
      kind: 'one_time', method, status: 'paid', paid_at: now.toISOString(), recorded_by: user.id, note: note.trim() || null,
      classes_total: chosen.classes ?? null,
      covers_until: chosen.expires_days ? new Date(now.getTime() + chosen.expires_days * 86400000).toISOString() : null,
    });
    setBusy('');
    if (error) return toast({ title: 'Could not record it', description: error.message });
    setNote(''); await load();
    toast({ title: `${athlete.first_name} is enrolled`, description: `${METHOD_LABEL[method]} · ${chosen.name}. Workouts and nutrition are unlocked.` });
  };
  const logVisit = async () => {
    setBusy('visit');
    const { data, error } = await supabase.rpc('log_class_visit', { aid: athlete.id });
    setBusy('');
    if (error) return toast({ title: 'Could not log the class', description: error.message });
    await load();
    toast({ title: 'Class logged', description: data == null ? 'Unlimited pack.' : `${data} class${data === 1 ? '' : 'es'} left on this pack.` });
  };
  const voidRow = async (r) => {
    if (!window.confirm('Undo this payment? If it was their only active class or pack, they lose access to workouts and nutrition.')) return;
    const { error } = await supabase.from('payments').update({ status: 'canceled' }).eq('id', r.id);
    if (error) toast({ title: 'Could not undo', description: error.message }); else load();
  };

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-lg">3. Classes &amp; enrollment</CardTitle><p className="mt-1 text-xs text-muted-foreground">One-time payment for a class or class pack. Workouts, nutrition and training plans are included while one is active.</p></CardHeader>
      <CardContent className="space-y-4">
        {cfg.placeholder && <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">Prices and packs are placeholders: confirm with Corey.</p>}
        {active.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-green-50 px-3 py-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-green-800"><CheckCircle2 className="h-5 w-5" /> Enrolled · {left == null ? 'unlimited classes' : `${left} class${left === 1 ? '' : 'es'} left`}{active[0].covers_until ? ` · good through ${new Date(active[0].covers_until).toLocaleDateString()}` : ''}</p>
            <Button size="sm" variant="outline" onClick={logVisit} disabled={!!busy}>{busy === 'visit' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Log a class visit'}</Button>
          </div>
        )}
        {usedUp && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">Classes used up or expired. {athlete.first_name}'s family is locked out of workouts and nutrition until they buy more.</p>}
        {!items.length ? <p className="text-sm text-muted-foreground">Add a class or pack on the Enrollment screen first.</p> : (
          <>
            <div className="space-y-1">
              <Label>{active.length ? 'Add another class or pack' : 'Class or pack'}</Label>
              <Select value={key} onValueChange={setKey}>
                <SelectTrigger><SelectValue placeholder="Pick one" /></SelectTrigger>
                <SelectContent>{items.map((p) => <SelectItem key={p.key} value={p.key}>{p.name} · {priceLabel(p)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button onClick={showCardQr} disabled={!chosen || !!busy} className="col-span-3 gap-2">{busy === 'card' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />} Card: show QR to scan</Button>
              <Button variant="outline" onClick={() => record('cash')} disabled={!chosen || !!busy} className="gap-2"><Banknote className="h-4 w-4" /> Paid cash</Button>
              <Button variant="outline" onClick={() => record('venmo')} disabled={!chosen || !!busy} className="gap-2">Paid Venmo</Button>
              <Button variant="outline" onClick={() => record('other')} disabled={!chosen || !!busy} className="gap-2">Other</Button>
            </div>
            <Input placeholder="Note (optional): Venmo name, check number, card on the reader" value={note} onChange={(e) => setNote(e.target.value)} />
          </>
        )}
        {rows.length > 0 && (
          <div className="divide-y divide-border rounded-lg border border-border text-sm">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate">{r.description.split(' · ')[0]} · {money(r.amount_cents)}</p>
                  <p className="text-xs text-muted-foreground">{METHOD_LABEL[r.method]} · {r.status === 'paid' ? `paid ${new Date(r.paid_at).toLocaleDateString()}` : r.status}{r.classes_total ? ` · ${r.classes_used}/${r.classes_total} used` : ''}{r.covers_until ? ` · expires ${new Date(r.covers_until).toLocaleDateString()}` : ''}{r.note ? ` · ${r.note}` : ''}</p>
                </div>
                {r.status === 'paid' && r.method !== 'card' && <Button size="sm" variant="ghost" onClick={() => voidRow(r)}>Undo</Button>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <Dialog open={!!checkout} onOpenChange={(o) => { if (!o) { setCheckout(null); clearInterval(poll.current); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{chosen ? `${chosen.name} · ${money(chosen.amount_cents)}` : 'Payment'}</DialogTitle></DialogHeader>
          {checkout && (paidNow ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center"><Check className="h-10 w-10 text-green-600" /><p className="font-semibold">Paid. Welcome to Valor.</p></div>
          ) : (
            <div className="space-y-4">
              <QrPanel value={checkout.url} caption="Parent scans with their phone camera and pays with card, Apple Pay or Google Pay. This screen updates when it goes through." />
              <div className="grid grid-cols-2 gap-2">
                {athlete.parent_phone && <Button asChild variant="outline" size="sm"><a href={smsHref(athlete.parent_phone, `Here's the link to finish ${athlete.first_name}'s Valor sign-up: ${checkout.url}`)}><MessageSquare className="h-4 w-4" /> Text link</a></Button>}
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard?.writeText(checkout.url); toast({ title: 'Payment link copied' }); }}><Copy className="h-4 w-4" /> Copy link</Button>
              </div>
            </div>
          ))}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── profile ───────────────────────────────────────────────────────────────
function ProfileTab({ athlete, onEdit, onSibling }) {
  const [siblings, setSiblings] = useState([]);
  useEffect(() => {
    const email = athlete.parent_email || athlete.parent_login_email;
    let q = supabase.from('athletes').select('id, first_name, last_name, age, sport').neq('id', athlete.id);
    q = athlete.parent_id ? q.eq('parent_id', athlete.parent_id) : email ? q.ilike('parent_email', email) : null;
    if (q) q.then(({ data }) => setSiblings(data || []));
  }, [athlete]);
  const row = (label, value) => value ? <div className="flex justify-between gap-4 border-b border-border py-2 text-sm last:border-0"><span className="text-muted-foreground">{label}</span><span className="text-right">{value}</span></div> : null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-lg">Athlete</CardTitle><Button size="sm" variant="outline" onClick={onEdit} className="gap-1"><Pencil className="h-3 w-3" /> Edit</Button></CardHeader>
        <CardContent>
          {row('Name', athleteName(athlete))}{row('Age', athlete.age)}{row('Birthday', athlete.birthdate && new Date(athlete.birthdate + 'T12:00:00').toLocaleDateString())}
          {row('Sport', athlete.sport)}{row('Position', athlete.position)}{row('School', athlete.school)}{row('Grad year', athlete.grad_year)}
          {athlete.notes && <p className="mt-3 rounded-lg bg-muted/60 p-3 text-sm"><span className="font-semibold">Coach notes: </span>{athlete.notes}</p>}
        </CardContent>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Parent</CardTitle></CardHeader>
          <CardContent>
            {row('Name', athlete.parent_name)}{row('Email', athlete.parent_email)}{row('Phone', athlete.parent_phone)}
            {row('Login', athlete.parent_login_email ? `${athlete.parent_login_email}${athlete.parent_last_sign_in_at ? ' · active' : ' · not logged in yet'}` : 'none yet')}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-lg">Siblings</CardTitle><Button size="sm" variant="outline" onClick={onSibling} className="gap-1"><UserPlus className="h-3 w-3" /> Add sibling</Button></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {siblings.length === 0 && <p className="text-muted-foreground">None. Siblings share the parent's login.</p>}
            {siblings.map((x) => <Link key={x.id} to={`/admin/athletes/${x.id}`} className="block rounded-lg px-2 py-1.5 hover:bg-muted">{athleteName(x)} <span className="text-xs text-muted-foreground">{[x.age && `age ${x.age}`, x.sport].filter(Boolean).join(' · ')}</span></Link>)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── training (coach-assigned workouts) ────────────────────────────────────
function TrainingTab({ athlete }) {
  const [rows, setRows] = useState([]);
  const [done, setDone] = useState({});
  const [editing, setEditing] = useState(null); // null | 'new' | workout
  const load = useCallback(async () => {
    const { data } = await supabase.from('workouts').select('*').eq('athlete_id', athlete.id).order('date', { ascending: true });
    setRows(data || []);
    const ids = (data || []).map((w) => w.id);
    if (ids.length) {
      const { data: logs } = await supabase.from('workout_logs').select('workout_id, date').in('workout_id', ids);
      setDone(Object.fromEntries((logs || []).map((l) => [l.workout_id, l.date])));
    } else setDone({});
  }, [athlete.id]);
  useEffect(() => { load(); }, [load]);

  const weeks = [...new Set(rows.map((w) => w.week || 1))].sort((a, b) => a - b);
  const nextWeek = weeks.length ? Math.max(...weeks) : 1;
  const remove = async (w) => { if (!window.confirm(`Delete "${w.title}"?`)) return; await supabase.from('workouts').delete().eq('id', w.id); load(); };
  const copyWeek = async (wk) => {
    const src = rows.filter((w) => (w.week || 1) === wk);
    const plus7 = (d) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 7); return x.toISOString().slice(0, 10); };
    const { error } = await supabase.from('workouts').insert(src.map(({ id: _i, created_at: _c, updated_at: _u, owner_id: _o, ...w }) => ({ ...w, week: wk + 1, date: plus7(w.date), title: w.title })));
    if (error) toast({ title: 'Could not copy', description: error.message }); else { toast({ title: `Week ${wk} copied to week ${wk + 1}` }); load(); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Workouts built here show up on {athlete.first_name}'s Workouts page. A check mark means they logged it.</p>
        <Button onClick={() => setEditing('new')} className="gap-2"><Plus className="h-4 w-4" /> New workout</Button>
      </div>
      {rows.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No workouts yet.</p>}
      {weeks.map((wk) => (
        <section key={wk} className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl">Week {wk}</h3>
            <Button size="sm" variant="ghost" onClick={() => copyWeek(wk)} className="gap-1"><CopyPlus className="h-4 w-4" /> Copy to week {wk + 1}</Button>
          </div>
          {rows.filter((w) => (w.week || 1) === wk).map((w) => (
            <Card key={w.id}>
              <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">{done[w.id] && <CheckCircle2 className="mr-1 inline h-4 w-4 text-green-600" />}{w.title} <span className="text-xs font-normal text-muted-foreground">{w.day} {new Date(w.date + 'T12:00:00').toLocaleDateString()} · {w.category}</span></p>
                  <p className="truncate text-xs text-muted-foreground">{(w.exercises || []).map((e) => `${e.name} ${e.sets}x${e.reps}${e.intensity ? ` @${e.intensity}%` : e.weight ? ` @${e.weight}` : ''}`).join(' · ')}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(w)} className="gap-1"><Pencil className="h-3 w-3" /> Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(w)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      ))}
      <WorkoutEditor open={!!editing} onOpenChange={(o) => !o && setEditing(null)} athlete={athlete} workout={editing === 'new' ? null : editing} defaultWeek={nextWeek} onSaved={load} />
    </div>
  );
}

// ── progress (re-tests + 1RMs) ────────────────────────────────────────────
function ProgressTab({ athlete, metrics }) {
  const [tests, setTests] = useState([]);
  const [maxes, setMaxes] = useState([]);
  const [f, setF] = useState({ exercise_name: '', weight: '', date: new Date().toISOString().slice(0, 10) });
  const load = useCallback(async () => {
    const [{ data: t }, { data: m }] = await Promise.all([
      supabase.from('assessments').select('*').eq('athlete_id', athlete.id).order('date', { ascending: true }),
      supabase.from('one_rep_maxes').select('*').eq('athlete_id', athlete.id).order('date', { ascending: false }),
    ]);
    setTests(t || []); setMaxes(m || []);
  }, [athlete.id]);
  useEffect(() => { load(); }, [load]);
  const addMax = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('one_rep_maxes').insert({ athlete_id: athlete.id, exercise_name: f.exercise_name.trim(), weight: Number(f.weight), date: f.date });
    if (error) return toast({ title: 'Could not save', description: error.message });
    setF({ ...f, exercise_name: '', weight: '' }); load();
  };
  const delMax = async (id) => { await supabase.from('one_rep_maxes').delete().eq('id', id); load(); };
  const shown = metrics.filter((m) => tests.some((t) => t.metrics?.[m.key]));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">Test results over time</CardTitle><p className="text-xs text-muted-foreground">Add a re-test from the Assessment day tab.</p></CardHeader>
        <CardContent className="overflow-x-auto">
          {tests.length === 0 ? <p className="text-sm text-muted-foreground">No results yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 pr-3 font-medium">Test</th>{tests.map((t) => <th key={t.id} className="py-1 pr-3 font-medium">{new Date(t.date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</th>)}</tr></thead>
              <tbody>{shown.map((m) => <tr key={m.key} className="border-t border-border"><td className="py-1.5 pr-3">{m.label}</td>{tests.map((t) => <td key={t.id} className="py-1.5 pr-3 font-medium">{t.metrics?.[m.key] ? `${t.metrics[m.key]}${m.unit ? ` ${m.unit}` : ''}` : '–'}</td>)}</tr>)}</tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">Max lifts</CardTitle><p className="text-xs text-muted-foreground">Workout targets use the latest max for each lift.</p></CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={addMax} className="grid grid-cols-6 gap-2">
            <Input className="col-span-3" required placeholder="Lift, e.g. Back squat" value={f.exercise_name} onChange={(e) => setF({ ...f, exercise_name: e.target.value })} />
            <Input className="col-span-1 px-2" required type="number" placeholder="lbs" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} />
            <Input className="col-span-2" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            <Button type="submit" size="sm" className="col-span-6 sm:col-span-2">Add max</Button>
          </form>
          <div className="divide-y divide-border text-sm">
            {maxes.map((m) => <div key={m.id} className="flex items-center justify-between py-1.5"><span>{m.exercise_name} <span className="font-semibold">{m.weight} lbs</span> <span className="text-xs text-muted-foreground">{new Date(m.date + 'T12:00:00').toLocaleDateString()}</span></span><button onClick={() => delMax(m.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete"><Trash2 className="h-4 w-4" /></button></div>)}
            {maxes.length === 0 && <p className="text-muted-foreground">No maxes logged.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AthleteDetail() {
  const { id } = useParams();
  const [athlete, setAthlete] = useState(null);
  const [booking, setBooking] = useState(null);
  const [settings, setSettings] = useState({ enrollment: null, metrics: [] });
  const [recKey, setRecKey] = useState('');
  const [form, setForm] = useState(null); // 'edit' | 'sibling'
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const [{ data: a }, { data: b }, { data: as }] = await Promise.all([
      supabase.from('athletes_admin').select('*').eq('id', id).maybeSingle(),
      supabase.from('bookings').select('*').eq('athlete_id', id).order('slot_start', { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
      supabase.from('assessments').select('recommended_plan').eq('athlete_id', id).order('date', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setAthlete(a); setBooking(b); setRecKey(as?.recommended_plan || '');
  }, [id]);
  useEffect(() => { load(); loadSettings().then(setSettings); }, [load]);

  if (!athlete) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const phone = athlete.parent_phone;
  const archive = async () => {
    const archived_at = athlete.archived_at ? null : new Date().toISOString();
    if (archived_at && !window.confirm(`Archive ${athlete.first_name}? They drop off the roster but nothing is deleted.`)) return;
    const { error } = await supabase.from('athletes').update({ archived_at }).eq('id', athlete.id);
    if (error) toast({ title: 'Could not update', description: error.message }); else load();
  };

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
        <div className="mt-3 flex flex-wrap gap-2">
          {phone && <Button asChild size="sm" variant="secondary"><a href={telHref(phone)}><Phone className="h-4 w-4" /> Call</a></Button>}
          {phone && <Button asChild size="sm" variant="secondary"><a href={smsHref(phone, '')}><MessageSquare className="h-4 w-4" /> Text</a></Button>}
          <Button size="sm" variant="secondary" onClick={() => setForm('edit')}><Pencil className="h-4 w-4" /> Edit</Button>
          <Button size="sm" variant="secondary" onClick={archive}>{athlete.archived_at ? <><ArchiveRestore className="h-4 w-4" /> Restore</> : <><Archive className="h-4 w-4" /> Archive</>}</Button>
        </div>
        {athlete.archived_at && <p className="mt-3 text-xs text-[#ff7484]">Archived {new Date(athlete.archived_at).toLocaleDateString()}</p>}
      </div>
      <Tabs defaultValue="day">
        <TabsList className="h-auto flex-wrap rounded-full bg-muted p-1">
          {[['day', 'Assessment day'], ['profile', 'Profile'], ['training', 'Training'], ['progress', 'Progress']].map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="rounded-full px-4 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{l}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="day" className="mt-5">
          <div className="grid gap-6 lg:grid-cols-2">
            <Results athlete={athlete} booking={booking} items={settings.enrollment?.items || []} metrics={settings.metrics} onSaved={load} />
            <div className="space-y-6">
              <ParentLogin athlete={athlete} onChanged={load} />
              <Payment athlete={athlete} cfg={settings.enrollment} recommendedKey={recKey} />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="profile" className="mt-5"><ProfileTab athlete={athlete} onEdit={() => setForm('edit')} onSibling={() => setForm('sibling')} /></TabsContent>
        <TabsContent value="training" className="mt-5"><TrainingTab athlete={athlete} /></TabsContent>
        <TabsContent value="progress" className="mt-5"><ProgressTab athlete={athlete} metrics={settings.metrics} /></TabsContent>
      </Tabs>
      <AthleteForm open={!!form} onOpenChange={(o) => !o && setForm(null)} mode={form || 'edit'} athlete={athlete}
        onSaved={(newId) => { if (form === 'sibling' && newId) navigate(`/admin/athletes/${newId}`); else load(); }} />
    </div>
  );
}
