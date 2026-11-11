import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarClock, Loader2, RefreshCw, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { PageHeader, EmptyState } from '@/components/vtp';
import { CalToolbar, MonthGrid, WeekGrid, rangeFor } from '@/components/facility/Calendar';
import { cn } from '@/lib/utils';
import { SPACE, WEEKDAYS, addDays, facilityApi, fmtDay, fmtMin, fmtSpan, hoursLabel, money, place, priceOf, timeOptions, todayPT, unitsFree, useRefreshPendingRentals, weekdayOf } from '@/lib/facility';

const LEGEND = [['booked', 'Rented'], ['wait', 'Request waiting'], ['valor', 'Valor time and Google Calendar']];
const label = 'mb-1 mt-3 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';
const select = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium';
const card = 'rounded-xl border border-border bg-card p-4';
const TIMES = timeOptions(300, 1380, 30); // coaches can block 5am to 11pm
const GCAL_NOTE = {
  connected: ['Google Calendar is connected', 'Rentals and blocks now show up on it, and what is already there blocks the floor here.'],
  declined: ['Google Calendar was not connected', 'Tap Connect again and choose Allow.'],
  noaccess: ['Google Calendar was not connected', 'The calendar box has to stay ticked on Google\'s screen. Tap Connect and try again.'],
  expired: ['That connect link expired', 'Tap Connect to get a fresh one.'],
  failed: ['Google Calendar did not connect', 'Try again. If it keeps failing, tell Omar.'],
};

/**
 * Coaches' side of the facility calendar (11/11/2026): answer rental requests, block the floor (one-off or
 * every week), see who has it, invite renters, and link Valor's Google Calendar. Billing stays outside the app.
 */
export default function AdminFacility() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState('week');
  const [anchor, setAnchor] = useState(todayPT());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState(null);
  const [seed, setSeed] = useState(null);
  const [renterDialog, setRenterDialog] = useState(null); // null | {} (new) | renter
  const refreshBadge = useRefreshPendingRentals();
  const { from, to } = rangeFor(view, anchor);

  const load = useCallback(async () => {
    try { setData(await facilityApi('calendar', { from, to })); setError(''); refreshBadge(); } catch (e) { setError(e.message); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const g = params.get('gcal');
    if (!g) return;
    const [title, description] = GCAL_NOTE[g] || GCAL_NOTE.failed;
    toast({ title, description });
    setParams({}, { replace: true });
  }, [params, setParams]);

  const shown = useMemo(() => {
    const out = (data?.blocks || []).map(place).map((b) => {
      const half = b.space === 'half', pending = b.status === 'pending';
      const base = { key: b.id, ymd: b.ymd, s: b.s, e: b.e, half, pending, units: pending ? 0 : half ? 1 : 2, onClick: () => setEdit(b) };
      if (b.kind === 'rental') return { ...base, tone: pending ? 'wait' : 'booked', title: b.renter || 'Renter', sub: pending ? 'Request' : `${half ? 'Half turf' : 'Full turf'}${b.series_id ? ' · weekly' : ''}` };
      return { ...base, half: false, tone: 'valor', title: b.kind === 'closed' ? (b.title ? `Closed: ${b.title}` : 'Closed') : b.title || 'Valor class', sub: b.series_id ? 'Weekly' : 'Valor' };
    });
    for (const g of (data?.busy || []).map(place)) {
      out.push({ key: `g-${g.event_id}`, ymd: g.ymd, s: g.s, e: g.e, tone: 'valor', title: g.title || 'Busy', sub: 'Google Calendar', units: 0, onClick: () => toast({ title: g.title || 'Google Calendar event', description: `${fmtDay(g.ymd)}, ${fmtSpan(g.s, g.e)}. This one lives on Google Calendar. Change it there.` }) });
    }
    return out;
  }, [data]);

  if (error && !data) return <EmptyState icon={CalendarClock} title="The calendar didn't load" message={error} actionLabel="Try again" onAction={load} />;
  if (!data) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
      <PageHeader title="Facility rentals" subtitle="Answer requests, block the floor and see who has it. Renters only ever see Booked, never who." className="mb-0" />
      <Waiting list={data.waiting} rules={data.rules} onDone={load} />
      <CalToolbar view={view} setView={setView} anchor={anchor} setAnchor={setAnchor} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start">
        {view === 'week'
          ? <WeekGrid anchor={anchor} setAnchor={setAnchor} blocks={shown} rules={data.rules} onSlot={(ymd, min) => setSeed({ date: ymd, s: min, n: Date.now() })} legend={LEGEND} />
          : <MonthGrid anchor={anchor} blocks={shown} onDay={(d) => { setAnchor(d); setView('week'); }} legend={LEGEND} />}
        <div className="space-y-4">
          <AddBlock renters={data.renters} rules={data.rules} seed={seed} shown={shown} range={{ from, to }} onSaved={load} />
          <GoogleCard google={data.google} onChanged={load} />
          <Renters renters={data.renters} onOpen={setRenterDialog} />
        </div>
      </div>
      {edit && <EditBlock block={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />}
      {renterDialog && <RenterDialog renter={renterDialog.id ? data.renters.find((r) => r.id === renterDialog.id) || renterDialog : null} onClose={() => setRenterDialog(null)} onChanged={load} />}
    </div>
  );
}

/** Requests waiting on a coach. One that overlaps a booked time can't be approved; one over a Google event asks first. */
function Waiting({ list, rules, onDone }) {
  const [busy, setBusy] = useState('');
  const [declining, setDeclining] = useState(null); // { id, note }
  if (!list.length) return null;
  const decide = async (w, approve, extra = {}) => {
    setBusy(w.id);
    try {
      const r = await facilityApi('decide', { id: w.id, approve, ...extra });
      toast({ title: approve ? `Approved for ${w.renter}` : 'Declined', description: r.renter_emailed ? 'They got an email.' : 'No email went out (no address on file, or a test renter).' });
      setDeclining(null);
      await onDone();
    } catch (e) {
      if (approve && /Google Calendar/.test(e.message) && window.confirm(`${e.message} Approve it anyway?`)) { setBusy(''); return decide(w, true, { force: true }); }
      toast({ title: approve ? "Couldn't approve it" : "Couldn't decline it", description: e.message });
      await onDone();
    }
    setBusy('');
  };
  return (
    <div className="space-y-2">
      <h2 className="font-display text-2xl">Waiting on you ({list.length})</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map(place).map((w) => (
          <div key={w.id} className="rounded-xl border border-warning-border bg-card p-3.5">
            <p className="font-semibold">{w.renter} · {fmtDay(w.ymd)}</p>
            <p className="text-sm text-muted-foreground">{fmtSpan(w.s, w.e)} · {SPACE[w.space]} · {money(priceOf(rules, w.space, w.e - w.s))}</p>
            {w.note && <p className="mt-1 text-sm italic text-muted-foreground">"{w.note}"</p>}
            {w.conflict && (
              <p className={cn('mt-2 flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold', w.conflict === 'booked' ? 'border-danger-border bg-danger-surface text-danger' : 'border-warning-border bg-warning-surface text-warning')}>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {w.conflict === 'booked' ? 'Overlaps a time that is already booked.' : `Overlaps ${w.conflict_detail || 'an event'} on Google Calendar.`}
              </p>
            )}
            {declining?.id === w.id ? (
              <div className="mt-2 space-y-2">
                <Textarea rows={2} maxLength={500} placeholder="Why, or another time that works (they see this)" value={declining.note} onChange={(e) => setDeclining({ id: w.id, note: e.target.value })} />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => decide(w, false, { staff_note: declining.note })}>{busy === w.id ? 'Sending…' : 'Send decline'}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeclining(null)}>Back</Button>
                </div>
              </div>
            ) : (
              <div className="mt-2.5 flex gap-2">
                <Button size="sm" disabled={!!busy || w.conflict === 'booked'} onClick={() => decide(w, true)}>{busy === w.id ? 'One moment…' : 'Approve'}</Button>
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setDeclining({ id: w.id, note: '' })}>Decline</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Put a block on the floor: a renter's time, a Valor class or closed. Optional weekly repeat. */
function AddBlock({ renters, rules, seed, shown, range, onSaved }) {
  const [f, setF] = useState(() => ({ who: 'valor', title: '', date: todayPT(), s: 18 * 60, e: 19 * 60, space: 'full', repeat: false, days: [], until: addDays(todayPT(), 84) }));
  const [busy, setBusy] = useState(false);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  useEffect(() => { if (seed) setF((x) => ({ ...x, date: seed.date, s: seed.s, e: Math.min(1380, Math.max(seed.s + 60, seed.s + (x.e - x.s))) })); }, [seed]);

  const rental = f.who !== 'valor' && f.who !== 'closed';
  const days = f.repeat ? (f.days.length ? f.days : [weekdayOf(f.date)]) : [];
  const dates = useMemo(() => {
    if (!days.length) return [f.date];
    const out = [];
    const last = f.until > addDays(f.date, 370) ? addDays(f.date, 370) : f.until;
    for (let d = f.date; d <= last; d = addDays(d, 1)) if (days.includes(weekdayOf(d))) out.push(d);
    return out;
  }, [f.date, f.until, f.repeat, days.join()]);
  const need = rental && f.space === 'half' ? 1 : 2;
  const clash = dates.filter((d) => d >= range.from && d <= range.to && unitsFree(shown, d, f.s, f.e) < need).length;

  const save = async () => {
    setBusy(true);
    try {
      const r = await facilityApi('save_blocks', {
        kind: rental ? 'rental' : f.who, renter_id: rental ? f.who : undefined, title: rental ? '' : f.title, space: rental ? f.space : 'full',
        date: f.date, start_min: f.s, end_min: f.e, repeat: days.length ? { days, until: f.until } : undefined,
      });
      const notes = [];
      if (r.skipped?.length) notes.push(`${r.skipped.length} skipped, already booked: ${r.skipped.slice(0, 4).map((x) => fmtDay(x.date, { month: 'short', day: 'numeric' })).join(', ')}${r.skipped.length > 4 ? '…' : ''}`);
      if (r.google_overlaps?.length) notes.push(`${r.google_overlaps.length} overlap something on Google Calendar`);
      toast({ title: r.created ? `${r.created} block${r.created === 1 ? '' : 's'} added` : 'Nothing was added', description: notes.join('. ') || undefined });
      await onSaved();
    } catch (e) { toast({ title: "Couldn't save it", description: e.message }); }
    setBusy(false);
  };

  return (
    <div className={card}>
      <h2 className="font-display text-2xl">Add a block</h2>
      <label className={label} htmlFor="fb-who">Who</label>
      <select id="fb-who" className={select} value={f.who} onChange={(e) => set({ who: e.target.value })}>
        <option value="valor">Valor class</option>
        <option value="closed">Closed</option>
        {renters.map((r) => <option key={r.id} value={r.id}>Rental: {r.name}</option>)}
      </select>
      {!rental && (
        <>
          <label className={label} htmlFor="fb-title">What it is</label>
          <Input id="fb-title" className="h-10 rounded-xl" maxLength={80} placeholder={f.who === 'closed' ? 'Holiday, floor work' : 'Evening class'} value={f.title} onChange={(e) => set({ title: e.target.value })} />
        </>
      )}
      <label className={label} htmlFor="fb-date">{f.repeat ? 'Starting' : 'Date'}</label>
      <Input id="fb-date" type="date" className="h-10 rounded-xl" value={f.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label} htmlFor="fb-start">Start</label>
          <select id="fb-start" className={select} value={f.s} onChange={(e) => { const s = Number(e.target.value); set({ s, e: Math.max(f.e, s + 30) }); }}>
            {TIMES.slice(0, -1).map((m) => <option key={m} value={m}>{fmtMin(m)}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="fb-end">End</label>
          <select id="fb-end" className={select} value={f.e} onChange={(e) => set({ e: Number(e.target.value) })}>
            {TIMES.filter((m) => m > f.s).map((m) => <option key={m} value={m}>{fmtMin(m)}</option>)}
          </select>
        </div>
      </div>
      {rental && (
        <>
          <label className={label} htmlFor="fb-space">Space</label>
          <select id="fb-space" className={select} value={f.space} onChange={(e) => set({ space: e.target.value })}>
            <option value="full">{SPACE.full} · {money(rules.rates.full)}/hr</option>
            <option value="half">{SPACE.half} · {money(rules.rates.half)}/hr</option>
          </select>
        </>
      )}
      <label className="mt-3 flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={f.repeat} onChange={(e) => set({ repeat: e.target.checked, days: e.target.checked && !f.days.length ? [weekdayOf(f.date)] : f.days })} />
        Repeats every week
      </label>
      {f.repeat && (
        <>
          <div className="mt-2 flex gap-1.5">
            {WEEKDAYS.map((d, i) => {
              const on = days.includes(i + 1);
              return <button key={i} type="button" aria-pressed={on} aria-label={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i]} onClick={() => set({ days: on ? days.filter((x) => x !== i + 1) : [...days, i + 1].sort() })} className={cn('h-9 w-9 rounded-full border text-xs font-bold', on ? 'border-foreground bg-foreground text-background' : 'border-border bg-background')}>{d}</button>;
            })}
          </div>
          <label className={label} htmlFor="fb-until">Until</label>
          <Input id="fb-until" type="date" className="h-10 rounded-xl" value={f.until} min={f.date} onChange={(e) => e.target.value && set({ until: e.target.value })} />
        </>
      )}
      <div className="my-3 rounded-xl bg-muted px-3 py-2.5 text-sm">
        <b className="text-[15px]">{dates.length} block{dates.length === 1 ? '' : 's'} · {hoursLabel((dates.length * (f.e - f.s)))}</b>
        <span className="block text-muted-foreground">{clash ? `${clash} on screen overlap${clash === 1 ? 's' : ''} something booked and will be skipped.` : dates.length ? 'Days that are already booked get skipped, the rest are added.' : 'None of those weekdays fall between the two dates.'}</span>
      </div>
      <Button className="w-full" disabled={busy || !dates.length || f.e <= f.s} onClick={save}>{busy ? 'Saving…' : dates.length > 1 ? 'Save blocks' : 'Save block'}</Button>
      <p className="mt-2 text-xs text-muted-foreground">Tap an open spot on the calendar to start here, or tap a block to change or remove it.</p>
    </div>
  );
}

/** Change or remove one block, or it and every later one made with it. */
function EditBlock({ block, onClose, onDone }) {
  const b = useMemo(() => place(block), [block]);
  const [f, setF] = useState({ date: b.ymd, s: b.s, e: b.e, space: b.space, title: b.title || '', scope: 'one' });
  const [busy, setBusy] = useState('');
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const rental = b.kind === 'rental', pending = b.status === 'pending';
  const who = rental ? b.renter : b.kind === 'closed' ? 'Closed' : b.title || 'Valor class';
  const run = async (k, fn) => {
    setBusy(k);
    try { await fn(); onDone(); } catch (e) { toast({ title: "That didn't save", description: e.message }); setBusy(''); }
  };
  const save = () => run('save', async () => {
    const r = await facilityApi('update_block', { id: b.id, scope: f.scope, date: f.scope === 'one' ? f.date : undefined, start_min: f.s, end_min: f.e, space: f.space, title: rental ? undefined : f.title });
    toast({ title: r.changed ? `${r.changed} block${r.changed === 1 ? '' : 's'} changed` : 'Nothing changed', description: r.skipped?.length ? `${r.skipped.length} skipped: that time is already booked.` : undefined });
  });
  const remove = () => {
    const many = f.scope === 'series';
    if (!window.confirm(rental && !pending ? `Remove ${many ? 'this and every later' : 'this'} rental for ${b.renter}? They get an email.` : `Remove ${many ? 'this and every later one' : 'this block'}?`)) return;
    run('delete', async () => {
      const r = await facilityApi('delete_block', { id: b.id, scope: f.scope });
      toast({ title: `${r.removed} block${r.removed === 1 ? '' : 's'} removed`, description: r.renter_emailed ? `${b.renter} got an email.` : undefined });
    });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{who}</DialogTitle>
          <DialogDescription>
            {fmtDay(b.ymd)}, {fmtSpan(b.s, b.e)}{rental ? ` · ${SPACE[b.space]}` : ''}
            {pending ? '. This is a request. Approve or decline it under Waiting on you.' : ''}
            {b.note ? ` Their note: "${b.note}"` : ''}
          </DialogDescription>
        </DialogHeader>
        <div>
          {b.series_id && !pending && (
            <div className="mb-1 grid grid-cols-2 gap-2">
              {[['one', 'Just this day'], ['series', 'This and every later one']].map(([k, t]) => (
                <button key={k} type="button" aria-pressed={f.scope === k} onClick={() => set({ scope: k })} className={cn('rounded-xl border px-3 py-2 text-sm font-semibold', f.scope === k ? 'border-2 border-primary bg-primary/5' : 'border-border')}>{t}</button>
              ))}
            </div>
          )}
          {!rental && (
            <>
              <label className={label} htmlFor="eb-title">What it is</label>
              <Input id="eb-title" className="h-10 rounded-xl" maxLength={80} value={f.title} onChange={(e) => set({ title: e.target.value })} />
            </>
          )}
          {f.scope === 'one' && (
            <>
              <label className={label} htmlFor="eb-date">Date</label>
              <Input id="eb-date" type="date" className="h-10 rounded-xl" value={f.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label} htmlFor="eb-start">Start</label>
              <select id="eb-start" className={select} value={f.s} onChange={(e) => { const s = Number(e.target.value); set({ s, e: Math.max(f.e, s + 30) }); }}>
                {[...new Set([...TIMES.slice(0, -1), b.s])].sort((x, y) => x - y).map((m) => <option key={m} value={m}>{fmtMin(m)}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="eb-end">End</label>
              <select id="eb-end" className={select} value={f.e} onChange={(e) => set({ e: Number(e.target.value) })}>
                {[...new Set([...TIMES, b.e])].sort((x, y) => x - y).filter((m) => m > f.s).map((m) => <option key={m} value={m}>{fmtMin(m)}</option>)}
              </select>
            </div>
          </div>
          {rental && (
            <>
              <label className={label} htmlFor="eb-space">Space</label>
              <select id="eb-space" className={select} value={f.space} onChange={(e) => set({ space: e.target.value })}>
                <option value="full">{SPACE.full}</option>
                <option value="half">{SPACE.half}</option>
              </select>
            </>
          )}
          {block.google_error && <p className="mt-3 text-xs text-danger">This one hasn't reached Google Calendar yet ({block.google_error}). It retries on its own.</p>}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" className="text-danger hover:text-danger" disabled={!!busy} onClick={remove}>{busy === 'delete' ? 'Removing…' : pending ? 'Remove request' : 'Remove'}</Button>
          <Button disabled={!!busy || f.e <= f.s} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save changes'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : fmtDay(new Date(iso).toISOString().slice(0, 10), { month: 'short', day: 'numeric' }); };

/** The link to Valor's Google Calendar: rentals go out to it, what is on it blocks the floor here. */
function GoogleCard({ google, onChanged }) {
  const [busy, setBusy] = useState('');
  const connect = async () => {
    setBusy('connect');
    try {
      const r = await facilityApi('gcal_connect');
      if (r.url) { window.location.href = r.url; return; }
      toast({ title: 'Not set up yet', description: "Omar has to add Valor's Google keys first. Nothing for you to do yet." });
    } catch (e) { toast({ title: "Couldn't start the connect", description: e.message }); }
    setBusy('');
  };
  const sync = async () => {
    setBusy('sync');
    try {
      const r = await facilityApi('gcal_sync');
      toast({ title: 'Synced with Google Calendar', description: `${r.events} event${r.events === 1 ? '' : 's'} read in. ${r.pushed} sent out${r.failed ? `, ${r.failed} failed` : ''}${r.left ? `, ${r.left} still to go` : ''}.` });
      await onChanged();
    } catch (e) { toast({ title: "Couldn't sync", description: e.message }); }
    setBusy('');
  };
  const disconnect = async () => {
    if (!window.confirm('Disconnect Google Calendar? Events already on it stay there, new ones stop going out, and it no longer blocks the floor here.')) return;
    setBusy('off');
    try { await facilityApi('gcal_disconnect'); await onChanged(); } catch (e) { toast({ title: "Couldn't disconnect", description: e.message }); }
    setBusy('');
  };
  const needsReconnect = google.error === 'reconnect';
  return (
    <div className={card}>
      <h2 className="font-display text-2xl">Google Calendar</h2>
      {google.connected ? (
        <>
          <p className="mt-2"><span className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-bold', needsReconnect ? 'border-danger-border bg-danger-surface text-danger' : 'border-success-border bg-success-surface text-success')}>{needsReconnect ? 'Needs reconnecting' : 'Connected'}</span></p>
          <p className="mt-1.5 break-all text-sm font-semibold">{google.email || 'Valor Google account'}</p>
          <p className="text-xs text-muted-foreground">{google.last_sync_at ? `Synced ${ago(google.last_sync_at)}` : 'Not synced yet'}</p>
          {google.error && !needsReconnect && <p className="mt-1 text-xs text-danger">Last sync hit a snag: {google.error}</p>}
          <div className="mt-2.5 flex flex-wrap gap-2">
            {needsReconnect ? <Button size="sm" disabled={!!busy} onClick={connect}>Reconnect</Button>
              : <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy} onClick={sync}><RefreshCw className={cn('h-3.5 w-3.5', busy === 'sync' && 'animate-spin')} /> Sync now</Button>}
            <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={!!busy} onClick={disconnect}>Disconnect</Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">{google.configured ? "Not connected yet. Sign in to Valor's Google account on this device, then tap Connect and choose Allow." : "Not set up yet. Omar adds Valor's Google keys, then a coach connects it here with one tap."}</p>
          {google.configured && <Button size="sm" className="mt-2.5" disabled={!!busy} onClick={connect}>{busy === 'connect' ? 'One moment…' : 'Connect Google Calendar'}</Button>}
        </>
      )}
      <p className="mt-3 text-xs text-muted-foreground"><b className="text-foreground">Out:</b> every approved rental and every block you add shows up there, like "Rental: Maniacs, full turf". Change or remove it here and Google follows.</p>
      <p className="mt-1.5 text-xs text-muted-foreground"><b className="text-foreground">In:</b> timed events already on that calendar block the floor here, so nobody can request over them. All-day events and ones marked Free don't.</p>
    </div>
  );
}

function Renters({ renters, onOpen }) {
  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl">Renters</h2>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onOpen({})}><UserPlus className="h-3.5 w-3.5" /> Add</Button>
      </div>
      {renters.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No renters yet. Add a team or group, then email them a login so they can see what's open.</p>}
      <div className="divide-y divide-border">
        {renters.map((r) => {
          const n = r.facility_renter_members?.length || 0;
          return (
            <button key={r.id} type="button" onClick={() => onOpen(r)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:opacity-80">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{r.name}{r.is_example ? ' (test)' : ''}</span>
                <span className="block truncate text-xs text-muted-foreground">{n ? `${n} login${n === 1 ? '' : 's'}` : 'No login yet'}{r.contact_name ? ` · ${r.contact_name}` : ''}</span>
              </span>
              <span className={cn('shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold', n ? 'border-success-border bg-success-surface text-success' : 'border-warning-border bg-warning-surface text-warning')}>{n ? 'Has login' : 'Invite'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Add or edit a renter, and email someone a login for it. */
function RenterDialog({ renter, onClose, onChanged }) {
  const [f, setF] = useState({ name: renter?.name || '', contact_name: renter?.contact_name || '', contact_email: renter?.contact_email || '', contact_phone: renter?.contact_phone || '', is_example: !!renter?.is_example });
  const [invite, setInvite] = useState({ email: '', full_name: '' });
  const [busy, setBusy] = useState('');
  const [link, setLink] = useState('');
  const [saved, setSaved] = useState(renter || null);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const members = saved?.facility_renter_members || [];

  const save = async (then) => {
    setBusy('save');
    try {
      const r = await facilityApi('save_renter', { id: saved?.id, ...f });
      setSaved((s) => ({ ...(s || {}), ...r.renter }));
      await onChanged();
      if (then) await then(r.renter); else { toast({ title: 'Saved' }); if (saved) onClose(); }
    } catch (e) { toast({ title: "Couldn't save", description: e.message }); }
    setBusy('');
  };
  const sendInvite = async (r) => {
    const email = (invite.email || (!saved ? f.contact_email : '')).trim();
    if (!email) { toast({ title: 'Saved', description: 'Add an email to send them a login.' }); return; }
    try {
      const res = await facilityApi('invite_member', { renter_id: r.id, email, full_name: invite.full_name || f.contact_name });
      setInvite({ email: '', full_name: '' });
      setLink(res.link || '');
      toast({ title: res.emailed ? `Login emailed to ${email}` : res.existing_login ? `${email} can now see the calendar` : 'Login made, not emailed', description: res.emailed ? (res.existing_login ? 'They sign in with the Valor login they already have.' : 'The link in it works once, for 24 hours.') : res.link ? 'Copy the link below and text it to them.' : undefined });
      await onChanged();
      setSaved((s) => ({ ...s, facility_renter_members: [...(s?.facility_renter_members || []).filter((m) => m.email !== email.toLowerCase()), { user_id: `new-${email}`, email: email.toLowerCase(), full_name: invite.full_name || f.contact_name }] }));
    } catch (e) { toast({ title: "Couldn't invite them", description: e.message }); }
  };
  const removeMember = async (m) => {
    if (!window.confirm(`Take ${m.email} off ${f.name}? They won't see the calendar any more.`)) return;
    setBusy(m.user_id);
    try { await facilityApi('remove_member', { renter_id: saved.id, user_id: m.user_id }); setSaved((s) => ({ ...s, facility_renter_members: s.facility_renter_members.filter((x) => x.user_id !== m.user_id) })); await onChanged(); } catch (e) { toast({ title: "Couldn't remove them", description: e.message }); }
    setBusy('');
  };
  const archive = async () => {
    if (!window.confirm(`Archive ${f.name}? Their logins stop seeing the calendar. Their booked times stay until you remove them.`)) return;
    setBusy('archive');
    try { await facilityApi('save_renter', { id: saved.id, ...f, archived: true }); await onChanged(); onClose(); } catch (e) { toast({ title: "Couldn't archive", description: e.message }); setBusy(''); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{saved ? f.name || 'Renter' : 'Add a renter'}</DialogTitle>
          <DialogDescription>A team or group that rents the floor. Their login only shows the calendar: no athletes, no billing.</DialogDescription>
        </DialogHeader>
        <div>
          <label className={cn(label, 'mt-0')} htmlFor="rn-name">Team or group</label>
          <Input id="rn-name" className="h-10 rounded-xl" maxLength={80} placeholder="Maniacs" value={f.name} onChange={(e) => set({ name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <div><label className={label} htmlFor="rn-contact">Contact</label><Input id="rn-contact" className="h-10 rounded-xl" maxLength={80} value={f.contact_name} onChange={(e) => set({ contact_name: e.target.value })} /></div>
            <div><label className={label} htmlFor="rn-phone">Phone</label><Input id="rn-phone" className="h-10 rounded-xl" maxLength={30} value={f.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })} /></div>
          </div>
          <label className={label} htmlFor="rn-email">Email</label>
          <Input id="rn-email" type="email" className="h-10 rounded-xl" maxLength={120} value={f.contact_email} onChange={(e) => set({ contact_email: e.target.value })} />
          <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" checked={f.is_example} onChange={(e) => set({ is_example: e.target.checked })} />
            Test renter. Request alerts go to Omar only and nothing is sent to Google Calendar.
          </label>

          {saved && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-sm font-semibold">Logins</p>
              {members.length === 0 && <p className="text-xs text-muted-foreground">Nobody yet.</p>}
              {members.map((m) => (
                <div key={m.user_id} className="flex items-center justify-between gap-2 py-1 text-sm">
                  <span className="min-w-0 truncate">{m.email}{m.full_name ? ` · ${m.full_name}` : ''}</span>
                  {!String(m.user_id).startsWith('new-') && <button type="button" disabled={!!busy} onClick={() => removeMember(m)} className="shrink-0 text-xs text-muted-foreground underline hover:text-danger">Remove</button>}
                </div>
              ))}
              <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input type="email" className="h-10 rounded-xl" placeholder="Email" aria-label="Email for the new login" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
                <Input className="h-10 rounded-xl" placeholder="Name" aria-label="Name for the new login" value={invite.full_name} onChange={(e) => setInvite({ ...invite, full_name: e.target.value })} />
                <Button variant="outline" disabled={!!busy || !invite.email.trim()} onClick={async () => { setBusy('invite'); await sendInvite(saved); setBusy(''); }}>{busy === 'invite' ? 'Sending…' : 'Email login'}</Button>
              </div>
            </div>
          )}
          {link && (
            <div className="mt-3 rounded-xl border border-warning-border bg-warning-surface p-2.5 text-xs text-warning">
              <p className="font-semibold">The email didn't go out. Text them this link (works once, 24 hours):</p>
              <p className="mt-1 break-all font-mono">{link}</p>
              <button type="button" className="mt-1 font-semibold underline" onClick={() => navigator.clipboard?.writeText(link).then(() => toast({ title: 'Link copied' }))}>Copy link</button>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {saved ? <Button variant="ghost" className="text-muted-foreground" disabled={!!busy} onClick={archive}>Archive</Button> : <span />}
          {saved
            ? <Button disabled={!!busy || !f.name.trim()} onClick={() => save()}>{busy === 'save' ? 'Saving…' : 'Save'}</Button>
            : <Button disabled={!!busy || !f.name.trim()} onClick={() => save(sendInvite)}>{busy === 'save' ? 'Saving…' : f.contact_email.trim() ? 'Save and email a login' : 'Save'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
