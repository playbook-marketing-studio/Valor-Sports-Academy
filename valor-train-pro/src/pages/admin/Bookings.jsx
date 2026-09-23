import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, MessageSquare, Phone, Plus, RefreshCw, Search, UserCheck, UserX } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { fmtTime } from '@/lib/slots';
import { smsHref, telHref } from '@/lib/valor';
import { cn } from '@/lib/utils';

const TZ = 'America/Los_Angeles';
const dayKey = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const dayLabel = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(iso));
const reqDay = (ymd) => (ymd ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(ymd + 'T12:00:00Z')) : 'a day');
const STATUS_STYLE = { booked: 'bg-muted', requested: 'bg-amber-100 text-amber-900', attended: 'bg-green-100 text-green-800', no_show: 'bg-rose-100 text-rose-800', canceled: 'bg-muted text-muted-foreground line-through' };
const STATUS_LABEL = { booked: 'Booked', requested: 'Wants a time', attended: 'Checked in', no_show: 'No-show', canceled: 'Canceled' };
const SOURCE_LABEL = { meta: 'Meta ad', facebook: 'Meta ad', instagram: 'Instagram', google: 'Google' };

function WalkInDialog({ open, onOpenChange, onDone }) {
  const blank = { first_name: '', last_name: '', age: '', sport: '', parent_name: '', parent_email: '', parent_phone: '' };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { const v = e.target.value; setF((x) => ({ ...x, [k]: v })); };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const email = f.parent_email.trim().toLowerCase();
    const { data: a, error } = await supabase.from('athletes').insert({
      first_name: f.first_name.trim(), last_name: f.last_name.trim() || null, age: Number(f.age) || null, sport: f.sport.trim() || null,
      parent_name: f.parent_name.trim() || null, parent_email: email || null, parent_phone: f.parent_phone.trim() || null,
    }).select('id').single();
    if (!error) {
      await supabase.from('bookings').insert({
        athlete_id: a.id, origin: 'walk_in', status: 'attended', checked_in_at: new Date().toISOString(),
        athlete_first_name: f.first_name.trim(), athlete_last_name: f.last_name.trim() || null, athlete_age: Number(f.age) || null, sport: f.sport.trim() || null,
        parent_name: f.parent_name.trim() || 'Parent', parent_email: email || '', parent_phone: f.parent_phone.trim() || null,
      });
    }
    setBusy(false);
    if (error) return toast({ title: 'Could not add the athlete', description: error.message });
    setF(blank); onOpenChange(false); onDone(a.id);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Add a walk-in</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Athlete first name</Label><Input required value={f.first_name} onChange={set('first_name')} /></div>
            <div className="space-y-1"><Label>Last name</Label><Input value={f.last_name} onChange={set('last_name')} /></div>
            <div className="space-y-1"><Label>Age</Label><Input type="number" value={f.age} onChange={set('age')} /></div>
            <div className="space-y-1"><Label>Sport</Label><Input value={f.sport} onChange={set('sport')} /></div>
            <div className="col-span-2 space-y-1"><Label>Parent name</Label><Input required value={f.parent_name} onChange={set('parent_name')} /></div>
            <div className="space-y-1"><Label>Parent email</Label><Input type="email" required value={f.parent_email} onChange={set('parent_email')} /></div>
            <div className="space-y-1"><Label>Parent phone</Label><Input type="tel" value={f.parent_phone} onChange={set('parent_phone')} /></div>
          </div>
          <DialogFooter><Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add and open'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminBookings() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [past, setPast] = useState(false);
  const [busy, setBusy] = useState('');
  const [walkIn, setWalkIn] = useState(false);

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

  const setStatus = async (r, status) => {
    setBusy(r.id);
    const patch = { status, checked_in_at: status === 'attended' ? new Date().toISOString() : r.checked_in_at };
    const { error } = await supabase.from('bookings').update(patch).eq('id', r.id);
    setBusy('');
    if (error) return toast({ title: 'Update failed', description: error.message });
    setRows((xs) => xs.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
    if (status === 'attended' && r.athlete_id) navigate(`/admin/athletes/${r.athlete_id}`);
  };

  const Row = ({ r }) => (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {r.slot_start && <span className="w-20 font-display text-lg">{fmtTime(new Date(r.slot_start))}</span>}
            <Link to={r.athlete_id ? `/admin/athletes/${r.athlete_id}` : '#'} className="font-semibold hover:text-primary">{r.athlete_first_name} {r.athlete_last_name || ''}</Link>
            {r.athlete_age && <span className="text-xs text-muted-foreground">age {r.athlete_age}</span>}
            {r.sport && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{r.sport}</span>}
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_STYLE[r.status])}>{STATUS_LABEL[r.status] || r.status}</span>
            {r.source && r.source !== 'app' && <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{SOURCE_LABEL[r.source.toLowerCase()] || r.source}</span>}
          </div>
          {r.quiz_result && <p className="text-xs text-muted-foreground">Quiz: {r.quiz_result}</p>}
          {r.status === 'requested' && <p className="text-sm">Asked for {reqDay(r.requested_day)}{r.requested_window ? `, ${r.requested_window}` : ''}{r.requested_note ? `: "${r.requested_note}"` : ''}</p>}
          <p className="text-xs text-muted-foreground">{r.parent_name} · {r.parent_email}{r.parent_phone ? ` · ${r.parent_phone}` : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {r.parent_phone && <Button asChild size="sm" variant="outline"><a href={telHref(r.parent_phone)} aria-label="Call"><Phone className="h-4 w-4" /></a></Button>}
          {r.parent_phone && <Button asChild size="sm" variant="outline"><a href={smsHref(r.parent_phone, `Hi ${r.parent_name?.split(' ')[0] || ''}, this is Valor Sports Academy about ${r.athlete_first_name}'s free assessment.`)} aria-label="Text"><MessageSquare className="h-4 w-4" /></a></Button>}
          {r.status !== 'attended' && r.status !== 'canceled' && <Button size="sm" onClick={() => setStatus(r, 'attended')} disabled={busy === r.id} className="gap-1"><UserCheck className="h-4 w-4" /> Check in</Button>}
          {r.status === 'booked' && <Button size="sm" variant="outline" onClick={() => setStatus(r, 'no_show')} disabled={busy === r.id} className="gap-1"><UserX className="h-4 w-4" /> No-show</Button>}
          {(r.status === 'attended' || r.status === 'no_show') && <Button size="sm" variant="ghost" onClick={() => setStatus(r, 'booked')} disabled={busy === r.id}>Undo</Button>}
          {r.athlete_id && <Button asChild size="sm" variant="outline"><Link to={`/admin/athletes/${r.athlete_id}`}>Open</Link></Button>}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl lg:text-4xl">Assessments</h1>
          <p className="mt-1 text-sm text-muted-foreground">Bookings from the website land here. Check athletes in, then open them to record results, send the parent a login and take payment.</p>
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
              <h2 className="font-display text-xl">Asked for a different time <span className="font-body text-sm text-muted-foreground">· text them to set one</span></h2>
              {requests.map((r) => <Row key={r.id} r={r} />)}
            </section>
          )}
          {days.map((d) => (
            <section key={d.key} className="space-y-3">
              <h2 className="font-display text-xl">{d.key === todayKey ? `Today · ${d.label}` : d.label} <span className="font-body text-sm text-muted-foreground">· {d.rows.filter((r) => r.status !== 'canceled').length} booked</span></h2>
              {d.rows.map((r) => <Row key={r.id} r={r} />)}
            </section>
          ))}
          {past && walkIns.length > 0 && (
            <section className="space-y-3"><h2 className="font-display text-xl">Walk-ins</h2>{walkIns.map((r) => <Row key={r.id} r={r} />)}</section>
          )}
          {days.length === 0 && (past || requests.length === 0) && <p className="py-16 text-center text-sm text-muted-foreground">{past ? 'No past assessments yet.' : 'No upcoming assessments. New website bookings show up here on their own.'}</p>}
        </div>
      )}
      <WalkInDialog open={walkIn} onOpenChange={setWalkIn} onDone={(id) => navigate(`/admin/athletes/${id}`)} />
    </div>
  );
}
