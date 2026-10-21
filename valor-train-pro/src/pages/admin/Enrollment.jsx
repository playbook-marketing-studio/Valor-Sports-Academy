import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Mail, Plus, Repeat, Trash2, Users } from 'lucide-react';
import { callFn, supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { athleteName } from '@/lib/valor';
import { AUTOPAY_STATUS, fmtDay, money } from '@/lib/autopay';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || `item_${Date.now()}`;
const blankNum = (v) => (v === '' || v == null ? null : Number(v));

/**
 * settings.enrollment = { placeholder, note, items: [{ key, name, amount_cents, classes, expires_days, billing? }],
 *                         monthly: { first_month: 'prorate'|'half', commitment_months } }
 * One-time items are classes and packs bought at the front desk. billing 'monthly' items are autopay:
 * charged on the 1st, classes = per month (Corey 10/19/2026). The drop-in stays one-time.
 */
/**
 * Moving families off UpperHand (10/21/2026): per enrolled athlete, did we email the login, has the
 * parent signed in, have they started autopay. Pilot a few, then everyone after the Nov 1 charges.
 */
function RolloutTracker() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState('');
  const load = async () => {
    const [{ data: ath }, { data: sb }] = await Promise.all([
      supabase.from('athletes_admin').select('id, first_name, last_name, parent_name, parent_email, parent_id, parent_last_sign_in_at, login_emailed_at, stage, is_example')
        .is('archived_at', null).order('first_name'),
      supabase.from('subscriptions').select('athlete_id, status, created_at, last_paid_at, cancel_at_period_end').order('created_at', { ascending: false }),
    ]);
    const subBy = {};
    for (const x of sb || []) if (!subBy[x.athlete_id] || ['active', 'past_due'].includes(x.status)) subBy[x.athlete_id] = subBy[x.athlete_id] && ['active', 'past_due'].includes(subBy[x.athlete_id].status) ? subBy[x.athlete_id] : x;
    setRows((ath || []).filter((a) => a.stage === 'enrolled' || a.login_emailed_at || subBy[a.id]).map((a) => ({ ...a, sub: subBy[a.id] || null })));
  };
  useEffect(() => { load(); }, []);
  const emailLogin = async (a) => {
    if (!window.confirm(`Email ${a.parent_name || 'the parent'} (${a.parent_email}) the new app login for ${a.first_name}? It says Valor moved to a new app and asks them to start autopay. The link works once, for 24 hours.`)) return;
    setBusy(a.id);
    try {
      const r = await callFn('staff', { body: { action: 'email_parent_login', athlete_id: a.id, style: 'switch' } });
      toast({ title: 'Login emailed', description: `Sent to ${r.email}.` });
      await load();
    } catch (e) { toast({ title: 'Could not send', description: e.message }); }
    setBusy('');
  };
  if (rows === null) return null;
  const d = (iso) => (iso ? fmtDay(iso) : null);
  const done = rows.filter((r) => r.sub && ['active', 'past_due'].includes(r.sub.status)).length;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5 text-primary" /> Moving families over
          <span className="font-body text-sm font-normal text-muted-foreground">{done} of {rows.length} on autopay</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">Email the login, they set a password, they tap Start autopay. A family with no email on file needs it added on the athlete's Profile tab first.</p>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {rows.map((a) => {
            const on = a.sub && ['active', 'past_due'].includes(a.sub.status);
            const step = (label, when, good) => (
              <span className={cn('rounded-full px-2 py-0.5', when ? (good ? 'bg-success-surface text-success' : 'bg-muted text-foreground') : 'bg-muted text-muted-foreground')}>{label}{when ? ` ${when}` : ': not yet'}</span>
            );
            return (
              <div key={a.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <Link to={`/admin/athletes/${a.id}`} className="min-w-0 hover:text-primary">
                  <span className="block font-semibold">{athleteName(a)}{a.is_example && <span className="ml-2 text-xs font-normal text-muted-foreground">(test)</span>}</span>
                  <span className="block truncate text-xs text-muted-foreground">{a.parent_name || 'No parent on file'}{a.parent_email ? ` · ${a.parent_email}` : ''}</span>
                </Link>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {step('Emailed', d(a.login_emailed_at), false)}
                  {step('Signed in', d(a.parent_last_sign_in_at), false)}
                  {on ? step(a.sub.status === 'past_due' ? 'Autopay past due' : 'Autopay', d(a.sub.created_at), a.sub.status === 'active') : step('Autopay', null)}
                  {!on && (a.parent_email
                    ? <Button size="sm" variant={a.login_emailed_at ? 'ghost' : 'outline'} className="h-8 gap-1" disabled={busy === a.id} onClick={() => emailLogin(a)}>{busy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} {a.login_emailed_at ? 'Resend' : 'Email login'}</Button>
                    : <span className="text-warning">No email on file</span>)}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminEnrollment() {
  const [cfg, setCfg] = useState(null);
  const [subs, setSubs] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', 'enrollment').maybeSingle().then(({ data }) => {
      const e = data?.value || {};
      setCfg({
        placeholder: !!e.placeholder, note: e.note || '',
        monthly: { first_month: e.monthly?.first_month === 'half' ? 'half' : 'prorate', commitment_months: e.monthly?.commitment_months ?? 3 },
        items: (e.items || []).map((x) => ({ ...x, price: ((x.amount_cents || 0) / 100).toString(), classes: x.classes ?? '', expires_days: x.expires_days ?? '', monthly: x.billing === 'monthly' })),
      });
    });
    supabase.from('subscriptions').select('*, athletes(id, first_name, last_name, parent_name)').in('status', ['active', 'past_due', 'canceled'])
      .order('created_at', { ascending: false }).limit(200).then(({ data }) => setSubs(data || []));
  }, []);

  const upd = (i, k, v) => setCfg((c) => ({ ...c, items: c.items.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
  const save = async () => {
    const items = cfg.items.filter((x) => x.name.trim()).map((x) => ({
      key: x.key || slug(x.name), name: x.name.trim(), amount_cents: Math.round(Number(x.price) * 100),
      classes: blankNum(x.classes), expires_days: x.monthly ? null : blankNum(x.expires_days),
      ...(x.monthly ? { billing: 'monthly' } : {}),
    }));
    if (!items.length || items.some((x) => !Number.isFinite(x.amount_cents) || x.amount_cents < 50)) return toast({ title: 'Each item needs a name and a price of at least $0.50' });
    if (items.some((x) => (x.classes !== null && !(x.classes > 0)) || (x.expires_days !== null && !(x.expires_days > 0)))) return toast({ title: 'Classes and expiry must be blank or a positive number' });
    const commitment = Number(cfg.monthly.commitment_months);
    if (!(commitment >= 0 && commitment <= 24)) return toast({ title: 'Commitment must be 0 to 24 months' });
    setBusy(true);
    const { error } = await supabase.from('settings').upsert({ key: 'enrollment', updated_at: new Date().toISOString(), value: {
      placeholder: cfg.placeholder, note: cfg.placeholder ? cfg.note : '', items,
      monthly: { first_month: cfg.monthly.first_month, commitment_months: commitment },
    } });
    setBusy(false);
    if (error) return toast({ title: 'Could not save', description: error.message });
    toast({ title: 'Saved', description: 'Applies to the next sign-up. Autopay already running keeps its price.' });
  };

  if (!cfg) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const anyMonthly = cfg.items.some((x) => x.monthly);
  const order = { past_due: 0, active: 1, canceled: 2 };
  const shown = (subs || []).slice().sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
  const pastDue = shown.filter((s) => s.status === 'past_due').length;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl">Enrollment</h1>
        <p className="mt-1 text-sm text-muted-foreground">The assessment is free. After it, families either buy a class or pack one time, or go on monthly autopay, charged on the 1st. Workouts, nutrition and training plans are included while they have classes.</p>
      </div>
      {cfg.placeholder && (
        <p className="rounded-lg border border-warning-border bg-warning-surface px-4 py-3 text-sm text-warning">
          These prices are placeholders copied from your website. Change each one to what you actually charge, then tap Save.
        </p>
      )}

      {anyMonthly && <RolloutTracker />}

      {subs !== null && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg"><Repeat className="h-5 w-5 text-primary" /> On autopay
              <span className="font-body text-sm font-normal text-muted-foreground">{shown.filter((s) => s.status !== 'canceled').length}{pastDue ? ` · ${pastDue} past due` : ''}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {shown.length === 0 ? <p className="text-sm text-muted-foreground">Nobody yet. Families start autopay from their app, or you show them the card QR on their athlete page.</p> : (
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {shown.map((s) => {
                  const st = AUTOPAY_STATUS[s.cancel_at_period_end && s.status === 'active' ? 'ending' : s.status] || AUTOPAY_STATUS.active;
                  return (
                    <Link key={s.id} to={`/admin/athletes/${s.athlete_id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-accent">
                      <span className="min-w-0">
                        <span className="block font-semibold">{athleteName(s.athletes || {})} <span className="font-normal text-muted-foreground">· {s.athletes?.parent_name || 'Parent'}</span></span>
                        <span className="block text-xs text-muted-foreground">{s.plan_name} · {money(s.amount_cents)}/mo · {s.paid_months} full month{s.paid_months === 1 ? '' : 's'} paid</span>
                      </span>
                      <span className="flex items-center gap-2 text-xs">
                        {s.status !== 'canceled' && s.current_period_end && <span className="text-muted-foreground">{s.cancel_at_period_end ? 'ends' : 'next'} {fmtDay(s.current_period_end)}</span>}
                        <span className={cn('rounded-full px-2.5 py-0.5 font-semibold', st.cls)}>{st.label}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">Classes, packs and monthly plans</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-3">
            {cfg.items.map((x, i) => (
              <div key={x.key || i} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Input aria-label="Name" value={x.name} onChange={(e) => upd(i, 'name', e.target.value)} className="h-10" placeholder="Name, e.g. In-season, 2x a week" />
                  <button className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => setCfg({ ...cfg, items: cfg.items.filter((_, j) => j !== i) })} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="space-y-1"><Label className="text-xs">{x.monthly ? 'Price per month ($)' : 'Price ($)'}</Label><Input aria-label="Price" inputMode="decimal" value={x.price} onChange={(e) => upd(i, 'price', e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">{x.monthly ? 'Classes per month' : 'Classes'}</Label><Input aria-label="Classes" inputMode="numeric" placeholder="Unlimited" value={x.classes} onChange={(e) => upd(i, 'classes', e.target.value)} /></div>
                  {!x.monthly && <div className="space-y-1"><Label className="text-xs">Expires after (days)</Label><Input aria-label="Expires after days" inputMode="numeric" placeholder="Never" value={x.expires_days} onChange={(e) => upd(i, 'expires_days', e.target.value)} /></div>}
                  <label className="flex min-h-[44px] cursor-pointer items-end gap-2 pb-2 text-sm sm:col-start-4">
                    <input type="checkbox" checked={!!x.monthly} onChange={(e) => upd(i, 'monthly', e.target.checked)} className="h-5 w-5 accent-[hsl(var(--primary))]" /> Monthly autopay
                  </label>
                </div>
              </div>
            ))}
          </div>
          <p className="px-1 text-xs text-muted-foreground">Leave classes blank for unlimited. Monthly plans charge on the 1st and their classes reset each month.</p>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setCfg({ ...cfg, items: [...cfg.items, { key: '', name: '', price: '', classes: '', expires_days: '', monthly: false }] })}><Plus className="h-3 w-3" /> Add class, pack or plan</Button>
          <label className="flex items-center gap-2 border-t border-border pt-3 text-sm"><input type="checkbox" checked={cfg.placeholder} onChange={(e) => setCfg({ ...cfg, placeholder: e.target.checked })} /> Placeholder: shows "confirm with Corey" to staff</label>
        </CardContent>
      </Card>

      {anyMonthly && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Autopay rules</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-2">
              <p className="font-semibold">Signing up mid-month</p>
              <label className="flex cursor-pointer items-start gap-2"><input type="radio" name="first" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={cfg.monthly.first_month === 'prorate'} onChange={() => setCfg({ ...cfg, monthly: { ...cfg.monthly, first_month: 'prorate' } })} />
                <span><span className="font-medium">Prorated.</span> <span className="text-muted-foreground">They pay for the days left in the month (signing up on the 20th of a 31-day month about 39% of the price), then full price on the 1st.</span></span></label>
              <label className="flex cursor-pointer items-start gap-2"><input type="radio" name="first" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={cfg.monthly.first_month === 'half'} onChange={() => setCfg({ ...cfg, monthly: { ...cfg.monthly, first_month: 'half' } })} />
                <span><span className="font-medium">Half price.</span> <span className="text-muted-foreground">A flat half month whenever they join, then full price on the 1st.</span></span></label>
              <p className="text-xs text-muted-foreground">Either way, the first month's classes match the weeks left (2x a week, joining with 2 weeks left = 4 classes).</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="commit" className="font-semibold">Commitment (full months)</Label>
              <Input id="commit" inputMode="numeric" className="w-24" value={cfg.monthly.commitment_months} onChange={(e) => setCfg({ ...cfg, monthly: { ...cfg.monthly, commitment_months: e.target.value } })} />
              <p className="text-xs text-muted-foreground">No fee. Parents can cancel in the app once this many full months are paid. Coaches can stop anyone's autopay any time from the athlete page.</p>
            </div>
          </CardContent>
        </Card>
      )}
      <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
    </div>
  );
}
