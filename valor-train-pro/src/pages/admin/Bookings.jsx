import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, MessageSquare, Phone, Plus, RefreshCw, Search, UserCheck, UserX } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import AthleteForm from '@/components/AthleteForm';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { fmtTime } from '@/lib/slots';
import { smsHref, telHref } from '@/lib/valor';
import { cn } from '@/lib/utils';

const TZ = 'America/Los_Angeles';
const dayKey = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const dayLabel = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(iso));
const reqDay = (ymd) => (ymd ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(ymd + 'T12:00:00Z')) : 'a day');
// Leads from the old website form (before online booking) have no day or window.
const askText = (b) => (b.requested_day || b.requested_window ? `Asked for ${reqDay(b.requested_day)}${b.requested_window ? `, ${b.requested_window}` : ''}${b.requested_note ? `: "${b.requested_note}"` : ''}` : (b.requested_note || 'Wants a free assessment'));
const askSms = (b) => (b.requested_day || b.requested_window
  ? `Hi ${(b.parent_name || '').split(' ')[0]}, this is Valor Sports Academy. We can fit ${b.athlete_first_name}'s free assessment in. Does ${b.requested_window || 'that time'} on ${reqDay(b.requested_day)} work?`
  : `Hi ${(b.parent_name || '').split(' ')[0]}, this is Valor Sports Academy. Thanks for filling out our form for ${b.athlete_first_name}. Want to come in for a free assessment? We do them Saturday mornings.`);
const STATUS_STYLE = { booked: 'bg-muted', requested: 'bg-amber-100 text-amber-900', attended: 'bg-green-100 text-green-800', no_show: 'bg-rose-100 text-rose-800', canceled: 'bg-muted text-muted-foreground line-through' };
const STATUS_LABEL = { booked: 'Booked', requested: 'Wants a time', attended: 'Checked in', no_show: 'No-show', canceled: 'Canceled' };
const SOURCE_LABEL = { meta: 'Meta ad', facebook: 'Meta ad', instagram: 'Instagram', google: 'Google' };

export default function AdminBookings() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [past, setPast] = useState(false);
  const [busy, setBusy] = useState('');
  const [params] = useSearchParams();
  const [walkIn, setWalkIn] = useState(params.get('walkin') === '1');
  const [booking, setBooking] = useState(null); // request being turned into a booking
  const [slot, setSlot] = useState('');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('bookings').select('*').order('slot_start', { ascending: true, nullsFirst: true }).limit(1000);
    if (error) toast({ title: 'Could not load assessments', description: error.message });
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const todayKey = dayKey(new Date().toISOString());
  const term = q.trim().toLowerCase();
  const match = (r) => !term || [r.athlete_first_name, r.athlete_last_name, r.parent_name, r.parent_email, r.parent_phone, r.sport].join(' ').toLowerCase().includes(term);

  const requests = rows.filter((r) => r.status === 'requested' && match(r));
  const days = useMemo(() => {
    const groups = {};
    rows.filter((r) => r.slot_start && r.status !== 'requested' && match(r)).forEach((r) => {
      const k = dayKey(r.slot_start);
      if (past ? k >= todayKey : k < todayKey) return;
      (groups[k] = groups[k] || []).push(r);
    });
    const keys = Object.keys(groups).sort();
    if (past) keys.reverse();
    return keys.map((k) => ({ key: k, label: dayLabel(groups[k][0].slot_start), rows: groups[k] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, past, term, todayKey]);
  const walkIns = rows.filter((r) => !r.slot_start && r.origin === 'walk_in' && match(r));

  // older rows (day-1 app bookings) have no athlete yet; make one from the booking
  const ensureAthlete = async (r) => {
    if (r.athlete_id) return r.athlete_id;
    const { data: a, error } = await supabase.from('athletes').insert({
      parent_id: r.parent_id, first_name: r.athlete_first_name, last_name: r.athlete_last_name, age: r.athlete_age, sport: r.sport,
      parent_name: r.parent_name, parent_email: r.parent_email || null, parent_phone: r.parent_phone,
    }).select('id').single();
    if (error) { toast({ title: 'Could not create the athlete', description: error.message }); return null; }
    await supabase.from('bookings').update({ athlete_id: a.id }).eq('id', r.id);
    setRows((xs) => xs.map((x) => (x.id === r.id ? { ...x, athlete_id: a.id } : x)));
    return a.id;
  };
  const openAthlete = async (r) => { const id = await ensureAthlete(r); if (id) navigate(`/admin/athletes/${id}`); };

  const setStatus = async (r, status) => {
    setBusy(r.id);
    const patch = { status, checked_in_at: status === 'attended' ? new Date().toISOString() : r.checked_in_at };
    const { error } = await supabase.from('bookings').update(patch).eq('id', r.id);
    setBusy('');
    if (error) return toast({ title: 'Update failed', description: error.message });
    setRows((xs) => xs.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
    if (status === 'attended') openAthlete(r);
  };

  const Row = ({ r }) => (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {r.slot_start && <span className="w-20 font-display text-lg">{fmtTime(new Date(r.slot_start))}</span>}
            <button onClick={() => openAthlete(r)} className="font-semibold hover:text-primary">{r.athlete_first_name} {r.athlete_last_name || ''}</button>
            {r.athlete_age && <span className="text-xs text-muted-foreground">age {r.athlete_age}</span>}
            {r.sport && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{r.sport}</span>}
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_STYLE[r.status])}>{STATUS_LABEL[r.status] || r.status}</span>
            {r.source && r.source !== 'app' && <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{SOURCE_LABEL[r.source.toLowerCase()] || r.source}</span>}
          </div>
          {r.quiz_result && <p className="text-xs text-muted-foreground">Quiz: {r.quiz_result}</p>}
          {r.status === 'requested' && <p className="text-sm">{askText(r)}</p>}
          <p className="text-xs text-muted-foreground">{r.parent_name} · {r.parent_email}{r.parent_phone ? ` · ${r.parent_phone}` : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {r.parent_phone && <Button asChild size="icon" variant="outline" className="h-10 w-10"><a href={telHref(r.parent_phone)} aria-label={`Call ${r.parent_name}`}><Phone className="h-4 w-4" /></a></Button>}
          {r.status === 'requested' ? (
            <>
              {r.parent_phone && <Button asChild size="sm" className="h-10 gap-1"><a href={smsHref(r.parent_phone, askSms(r))}><MessageSquare className="h-4 w-4" /> Text to set a time</a></Button>}
              <Button size="sm" variant="outline" className="h-10" onClick={() => { setBooking(r); setSlot(r.requested_day ? `${r.requested_day}T18:00` : ''); }}>Book a time</Button>
            </>
          ) : (
            <>
              {r.parent_phone && <Button asChild size="icon" variant="outline" className="h-10 w-10"><a href={smsHref(r.parent_phone, `Hi ${r.parent_name?.split(' ')[0] || ''}, this is Valor Sports Academy about ${r.athlete_first_name}'s free assessment.`)} aria-label={`Text ${r.parent_name}`}><MessageSquare className="h-4 w-4" /></a></Button>}
              {r.status !== 'attended' && r.status !== 'canceled' && <Button size="sm" onClick={() => setStatus(r, 'attended')} disabled={busy === r.id} className="h-10 gap-1"><UserCheck className="h-4 w-4" /> Check in</Button>}
            </>
          )}
          {r.status === 'booked' && <Button size="sm" variant="outline" onClick={() => setStatus(r, 'no_show')} disabled={busy === r.id} className="h-10 gap-1"><UserX className="h-4 w-4" /> No-show</Button>}
          {(r.status === 'attended' || r.status === 'no_show') && <Button size="sm" variant="ghost" onClick={() => setStatus(r, 'booked')} disabled={busy === r.id} className="h-10">Undo</Button>}
          <Button size="sm" variant="outline" className="hidden h-10 sm:inline-flex" onClick={() => openAthlete(r)}>Open</Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl lg:text-4xl">Assessments</h1>
          <p className="mt-1 text-sm text-muted-foreground">Website bookings land here on their own.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-2"><RefreshCw className="h-4 w-4" /> Refresh</Button>
          <Button size="sm" onClick={() => setWalkIn(true)} className="gap-2"><Plus className="h-4 w-4" /> Walk-in</Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search athlete, parent, email, phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {[[false, 'Upcoming'], [true, 'Past']].map(([k, l]) => (
            <button key={l} onClick={() => setPast(k)} className={cn('rounded-full px-4 py-2 text-sm font-medium', past === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
        <div className="space-y-8">
          {!past && requests.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-xl">Asked for a different time</h2>
              <p className="-mt-1 text-sm text-muted-foreground">Text them to agree on a time, then book it.</p>
              {requests.map((r) => <Row key={r.id} r={r} />)}
            </section>
          )}
          {days.map((d) => (
            <section key={d.key} className="space-y-3">
              <h2 className="font-display text-xl">{d.key === todayKey ? `Today · ${d.label}` : d.label} <span className="ml-1 font-body text-sm normal-case text-muted-foreground">{d.rows.filter((r) => r.status !== 'canceled').length} booked</span></h2>
              {d.rows.map((r) => <Row key={r.id} r={r} />)}
            </section>
          ))}
          {past && walkIns.length > 0 && (
            <section className="space-y-3"><h2 className="font-display text-xl">Walk-ins</h2>{walkIns.map((r) => <Row key={r.id} r={r} />)}</section>
          )}
          {days.length === 0 && (past || requests.length === 0) && <p className="py-16 text-center text-sm text-muted-foreground">{past ? 'No past assessments yet.' : 'No upcoming assessments. New website bookings show up here on their own.'}</p>}
        </div>
      )}
      <AthleteForm open={walkIn} onOpenChange={setWalkIn} mode="walk_in" onSaved={(id) => id && navigate(`/admin/athletes/${id}`)} />
      <Dialog open={!!booking} onOpenChange={(o) => !o && setBooking(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Book {booking?.athlete_first_name}'s assessment</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Once {booking?.parent_name?.split(' ')[0] || 'the parent'} agrees to a time, set it here. It moves to the day's list.</p>
          <Input type="datetime-local" aria-label="Assessment time" value={slot} onChange={(e) => setSlot(e.target.value)} />
          <DialogFooter><Button disabled={!slot} onClick={async () => {
            const start = new Date(slot); const end = new Date(start.getTime() + 30 * 60000);
            const { error } = await supabase.from('bookings').update({ status: 'booked', slot_start: start.toISOString(), slot_end: end.toISOString() }).eq('id', booking.id);
            if (error) return toast({ title: error.code === '23505' ? 'That time is already taken' : 'Could not book it', description: error.code === '23505' ? 'Pick another time.' : error.message });
            toast({ title: `${booking.athlete_first_name} is booked`, description: start.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) });
            setBooking(null); load();
          }}>Book this time</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
