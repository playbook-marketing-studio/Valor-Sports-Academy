import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { PageHeader, EmptyState } from '@/components/vtp';
import { CalToolbar, MonthGrid, WeekGrid, rangeFor } from '@/components/facility/Calendar';
import { VALOR_PHONE } from '@/lib/valor';
import { cn } from '@/lib/utils';
import { SPACE, addDays, facilityApi, fmtDay, fmtMin, fmtSpan, hoursLabel, money, place, priceOf, timeOptions, todayPT, unitsFree, weekdayOf } from '@/lib/facility';

const LEGEND = [['mine', 'Your time'], ['pend', 'You asked, waiting on Valor'], ['booked', 'Booked by someone else'], ['valor', 'Valor classes and events']];
const label = 'mb-1 mt-3 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';
const select = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium';

/**
 * A renter's facility calendar (Corey 10/28/2026, built 11/11): see when the floor is open and ask for a
 * time. Other groups show only as "Booked", Valor's own time only as "Valor". A coach confirms every
 * request, and nothing is charged in the app.
 */
export default function Facility() {
  const [view, setView] = useState('week');
  const [anchor, setAnchor] = useState(todayPT());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState(() => ({ date: addDays(todayPT(), 2), s: 18 * 60, e: 19 * 60, space: 'full', note: '', renter_id: '' }));
  const formRef = useRef(null);
  const { from, to } = rangeFor(view, anchor);

  const load = useCallback(async () => {
    try { setData(await facilityApi('calendar', { from, to })); setError(''); } catch (e) { setError(e.message); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  const rules = data?.rules;
  const shown = useMemo(() => (data?.blocks || []).map(place).map((b, i) => {
    const half = b.space === 'half';
    const base = { key: b.id || `b${i}`, ymd: b.ymd, s: b.s, e: b.e, half, units: half ? 1 : 2, sub: half ? 'Half turf' : 'Full turf' };
    if (b.kind === 'mine') return { ...base, tone: 'mine', title: 'Your time' };
    if (b.kind === 'mine_pending') return { ...base, tone: 'pend', title: 'Requested', sub: 'Waiting on Valor', pending: true, units: 0 };
    if (b.kind === 'booked') return { ...base, tone: 'booked', title: 'Booked' };
    return { ...base, tone: 'valor', title: 'Valor', sub: 'Not open to rent', half: false, units: 2 };
  }), [data]);

  if (error && !data) return <EmptyState icon={CalendarClock} title="The calendar didn't load" message={error} actionLabel="Try again" onAction={load} />;
  if (!data) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (data.role !== 'renter') {
    return <EmptyState icon={CalendarClock} title="This login isn't set up to rent yet" message={`A coach links your login to your team or group. Call or text ${VALOR_PHONE} and they'll get you in.`} href={`sms:${VALOR_PHONE.replace(/\D/g, '')}`} actionLabel="Text Valor" />;
  }

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const minutes = form.e - form.s;
  const need = form.space === 'half' ? 1 : 2;
  const inView = form.date >= from && form.date <= to;
  const open = inView ? unitsFree(shown, form.date, form.s, form.e) >= need : null;
  const tooShort = minutes < rules.min_minutes;
  const maxDate = addDays(todayPT(), rules.horizon_days);
  const pickSlot = (ymd, min) => {
    if (ymd < todayPT()) return;
    const s = Math.max(rules.open_min, Math.min(min, rules.close_min - rules.min_minutes));
    set({ date: ymd, s, e: s + rules.min_minutes });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const send = async () => {
    setBusy('send');
    try {
      await facilityApi('request', { date: form.date, start_min: form.s, end_min: form.e, space: form.space, note: form.note, renter_id: form.renter_id || undefined });
      toast({ title: 'Request sent', description: 'A coach will confirm it. You get an email either way.' });
      set({ note: '' });
      await load();
    } catch (e) { toast({ title: "That didn't go through", description: e.message }); }
    setBusy('');
  };
  const pullBack = async (id) => {
    setBusy(id);
    try { await facilityApi('cancel', { id }); await load(); } catch (e) { toast({ title: "Couldn't cancel it", description: e.message }); }
    setBusy('');
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Facility calendar" subtitle="See what's open at 1973 Fowler Street and ask for a time. A coach confirms every request." className="mb-0" />
      <CalToolbar view={view} setView={setView} anchor={anchor} setAnchor={setAnchor} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start">
        {view === 'week'
          ? <WeekGrid anchor={anchor} setAnchor={setAnchor} blocks={shown} rules={rules} onSlot={pickSlot} legend={LEGEND} />
          : <MonthGrid anchor={anchor} blocks={shown} onDay={(d) => { setAnchor(d); setView('week'); }} legend={LEGEND} />}

        <div className="space-y-4">
          <div ref={formRef} className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-display text-2xl">Request a time</h2>
            {data.renters.length > 1 && (
              <>
                <label className={label} htmlFor="fac-renter">For</label>
                <select id="fac-renter" className={select} value={form.renter_id || data.renters[0].id} onChange={(e) => set({ renter_id: e.target.value })}>
                  {data.renters.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </>
            )}
            <label className={label} htmlFor="fac-date">Date</label>
            <Input id="fac-date" type="date" className="h-10 rounded-xl" value={form.date} min={todayPT()} max={maxDate}
              onChange={(e) => { if (!e.target.value) return; set({ date: e.target.value }); setAnchor(e.target.value); }} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={label} htmlFor="fac-start">Start</label>
                <select id="fac-start" className={select} value={form.s} onChange={(e) => { const s = Number(e.target.value); set({ s, e: Math.min(rules.close_min, Math.max(form.e, s + rules.min_minutes)) }); }}>
                  {timeOptions(rules.open_min, rules.close_min - rules.min_minutes, rules.step).map((m) => <option key={m} value={m}>{fmtMin(m)}</option>)}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="fac-end">End</label>
                <select id="fac-end" className={select} value={form.e} onChange={(e) => set({ e: Number(e.target.value) })}>
                  {timeOptions(form.s + rules.min_minutes, rules.close_min, rules.step).map((m) => <option key={m} value={m}>{fmtMin(m)}</option>)}
                </select>
              </div>
            </div>
            <span className={label}>Space</span>
            <div className="space-y-1.5">
              {['full', 'half'].map((k) => (
                <button key={k} type="button" onClick={() => set({ space: k })} aria-pressed={form.space === k}
                  className={cn('flex w-full items-center justify-between rounded-xl border bg-background px-3 py-2.5 text-left', form.space === k ? 'border-2 border-primary bg-primary/5' : 'border-border')}>
                  <span><span className="block text-sm font-semibold">{SPACE[k]}</span><span className="block text-xs text-muted-foreground">{k === 'full' ? 'The whole floor' : 'Shared floor, no weight room'}</span></span>
                  <span className="font-display text-lg">{money(k === 'half' ? rules.rates.half : rules.rates.full)}/hr</span>
                </button>
              ))}
            </div>
            <label className={label} htmlFor="fac-note">Note for the coach</label>
            <Textarea id="fac-note" rows={2} maxLength={500} placeholder="Anything they should know" value={form.note} onChange={(e) => set({ note: e.target.value })} />
            <div className="my-3 rounded-xl bg-muted px-3 py-2.5 text-sm">
              <b className="text-[15px]">{fmtDay(form.date)} · {hoursLabel(minutes)} · {money(priceOf(rules, form.space, minutes))}</b>
              <span className="block text-muted-foreground">
                {open === false ? <span className="font-semibold text-danger">That time is taken. Pick an open spot.</span> : open ? 'Open right now. ' : ''}
                {open !== false && 'Nothing is charged in the app, you pay Valor directly.'}
              </span>
            </div>
            <Button className="w-full" disabled={!!busy || open === false || tooShort} onClick={send}>{busy === 'send' ? 'Sending…' : 'Send request'}</Button>
            <p className="mt-2 text-xs text-muted-foreground">Requests need {rules.notice_hours} hours notice. For something sooner, text <a className="underline" href={`sms:${VALOR_PHONE.replace(/\D/g, '')}`}>{VALOR_PHONE}</a>.</p>
          </div>
          <MyRequests requests={data.requests} busy={busy} onCancel={pullBack} />
        </div>
      </div>
    </div>
  );
}

const CHIP = { pending: ['Waiting', 'border-warning-border bg-warning-surface text-warning'], approved: ['Approved', 'border-success-border bg-success-surface text-success'], declined: ['Declined', 'border-danger-border bg-danger-surface text-danger'] };
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Waiting first, then confirmed times (a weekly time is one line), then anything a coach declined lately. */
function MyRequests({ requests, busy, onCancel }) {
  const rows = useMemo(() => {
    const placed = (requests || []).map(place);
    const spaceOf = (b) => (b.space === 'half' ? 'Half turf' : 'Full turf');
    const single = (b) => ({ key: b.id, id: b.id, status: b.status, title: `${fmtDay(b.ymd)}, ${fmtSpan(b.s, b.e)}`, sub: spaceOf(b), note: b.staff_note });
    const out = placed.filter((b) => b.status === 'pending').map(single);
    const groups = new Map();
    for (const b of placed.filter((x) => x.status === 'approved')) {
      const k = b.series_id ? `${b.series_id}:${weekdayOf(b.ymd)}:${b.s}:${b.e}:${b.space}` : b.id;
      groups.set(k, [...(groups.get(k) || []), b]);
    }
    for (const [k, list] of groups) {
      if (list.length === 1) out.push(single(list[0]));
      else out.push({ key: k, status: 'approved', title: `Every ${DAY[weekdayOf(list[0].ymd) - 1]}, ${fmtSpan(list[0].s, list[0].e)}`, sub: `${spaceOf(list[0])} · ${list.length} left, through ${fmtDay(list[list.length - 1].ymd, { month: 'short', day: 'numeric' })}` });
    }
    return [...out, ...placed.filter((b) => b.status === 'declined').map(single)];
  }, [requests]);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-display text-2xl">My requests</h2>
      {rows.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Nothing yet. Tap an open spot on the calendar to ask for it.</p>}
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.key} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{r.title}</p>
              <p className="text-xs text-muted-foreground">{r.sub}</p>
              {r.note && <p className="mt-0.5 text-xs text-muted-foreground">Coach: {r.note}</p>}
              {r.status === 'pending' && <button type="button" disabled={!!busy} onClick={() => onCancel(r.id)} className="mt-0.5 text-xs font-medium text-muted-foreground underline hover:text-foreground">{busy === r.id ? 'Canceling…' : 'Cancel request'}</button>}
            </div>
            <span className={cn('shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold', CHIP[r.status]?.[1])}>{CHIP[r.status]?.[0]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
