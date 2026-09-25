import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Loader2, MessageSquare, NotebookPen, Plus } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { fmtTime } from '@/lib/slots';
import { athleteName, displayFirstName, smsHref } from '@/lib/valor';
import { photoPosition } from '@/lib/photos';

const TZ = 'America/Los_Angeles';
const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const longDay = (d) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' }).format(d);
const reqDay = (d) => (d ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(d + 'T12:00:00Z')) : 'a day');
// Leads from the old website form (before online booking) have no day or window.
const askText = (b) => (b.requested_day || b.requested_window ? `Asked for ${reqDay(b.requested_day)}${b.requested_window ? `, ${b.requested_window}` : ''}${b.requested_note ? `: "${b.requested_note}"` : ''}` : (b.requested_note || 'Wants a free assessment'));
const askSms = (b) => (b.requested_day || b.requested_window
  ? `Hi ${(b.parent_name || '').split(' ')[0]}, this is Valor Sports Academy. We can fit ${b.athlete_first_name}'s free assessment in. Does ${b.requested_window || 'that time'} on ${reqDay(b.requested_day)} work?`
  : `Hi ${(b.parent_name || '').split(' ')[0]}, this is Valor Sports Academy. Thanks for filling out our form for ${b.athlete_first_name}. Want to come in for a free assessment? We do them Saturday mornings.`);
const shortDay = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso));

function Section({ title, count, action, children }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl">{title}{count != null && <span className="ml-2 font-body text-base text-muted-foreground">{count}</span>}</h2>
        {action}
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">{children}</div>
    </section>
  );
}
const Row = ({ to, children, right }) => {
  const inner = <div className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-3">{children}<span className="flex shrink-0 items-center gap-2">{right}{to && <ChevronRight className="h-4 w-4 text-muted-foreground" />}</span></div>;
  return to ? <Link to={to} className="block transition hover:bg-muted/50">{inner}</Link> : inner;
};
const Empty = ({ children }) => <p className="px-4 py-5 text-sm text-muted-foreground">{children}</p>;

/** Staff home: what needs doing today, in the order it happens at the gym. */
export default function Today() {
  const { user } = useAuth();
  const [d, setD] = useState(null);

  useEffect(() => {
    (async () => {
      const now = new Date();
      const today = ymd(now);
      const weekAhead = new Date(now.getTime() + 8 * 86400000).toISOString();
      const [{ data: todayWs }, { data: nextWs }, { data: books }, { data: reqs }, { data: roster }] = await Promise.all([
        supabase.from('workouts').select('id, template_id, day_key, week, title, program, athlete_id').eq('date', today).not('template_id', 'is', null),
        supabase.from('workouts').select('date').not('template_id', 'is', null).gt('date', today).order('date').limit(1),
        supabase.from('bookings').select('*').in('status', ['booked', 'attended', 'no_show']).gte('slot_start', new Date(now.getTime() - 12 * 3600000).toISOString()).lte('slot_start', weekAhead).order('slot_start'),
        supabase.from('bookings').select('*').eq('status', 'requested').order('created_at'),
        supabase.from('athletes_admin').select('id, first_name, last_name, parent_name, parent_phone, stage, archived_at').eq('stage', 'assessed'),
      ]);
      const ids = (todayWs || []).map((w) => w.id);
      const { data: logs } = ids.length ? await supabase.from('workout_logs').select('workout_id').in('workout_id', ids) : { data: [] };
      const logged = new Set((logs || []).map((l) => l.workout_id));
      const classes = {};
      (todayWs || []).forEach((w) => {
        const k = `${w.template_id}|${w.day_key}|${w.week}`;
        (classes[k] = classes[k] || { template_id: w.template_id, day_key: w.day_key, week: w.week, program: w.program, title: w.title, n: 0, logged: 0 });
        classes[k].n += 1; if (logged.has(w.id)) classes[k].logged += 1;
      });
      const firstDay = books?.length ? ymd(new Date(books[0].slot_start)) : null;
      setD({
        today, label: longDay(now), classes: Object.values(classes), nextClass: nextWs?.[0]?.date || null,
        assessDay: firstDay, assessments: (books || []).filter((b) => ymd(new Date(b.slot_start)) === firstDay),
        requests: reqs || [], followUps: roster || [],
      });
    })();
  }, []);

  if (!d) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const first = displayFirstName((user?.full_name || '').split(' ')[0]);
  const assessIsToday = d.assessDay === d.today;

  return (
    <div className="max-w-3xl space-y-8">
      <div className="relative overflow-hidden rounded-xl border border-border">
        <img src="/images/photos/staff-hero-coaches.webp" alt="" width={1200} height={500} style={{ objectPosition: photoPosition('/images/photos/staff-hero-coaches.webp') }} className="h-40 w-full object-cover sm:h-48" />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/70 to-black/10" />
        <div className="relative -mt-10 flex flex-wrap items-end justify-between gap-3 bg-card px-5 pb-5 pt-2">
          <div>
            <p className="text-sm text-muted-foreground">{d.label}{first ? ` · Hey ${first}` : ''}</p>
            <h1 className="font-display text-4xl">Today</h1>
            <p className="mt-1 text-sm text-muted-foreground">Everything that needs your attention today, in the order it happens at the gym.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="gap-2"><Link to="/admin/log"><NotebookPen className="h-4 w-4" /> Class log</Link></Button>
            <Button asChild size="sm" className="gap-2"><Link to="/admin/bookings?walkin=1"><Plus className="h-4 w-4" /> Walk-in</Link></Button>
          </div>
        </div>
      </div>

      <Section title="Classes today" count={d.classes.length || null}>
        {d.classes.length ? d.classes.map((c) => (
          <Row key={`${c.template_id}${c.day_key}${c.week}`} to={`/admin/log?program=${c.template_id}&day=${c.day_key}&week=${c.week}`}
            right={<span className={c.logged === c.n ? 'text-sm font-medium text-green-700' : 'text-sm text-muted-foreground'}>{c.logged}/{c.n} logged</span>}>
            <div className="min-w-0"><p className="truncate font-medium">{c.title} · week {c.week}</p><p className="truncate text-xs text-muted-foreground">{c.program} · {c.n} athlete{c.n === 1 ? '' : 's'}</p></div>
          </Row>
        )) : <Empty>No program classes today.{d.nextClass ? ` Next one is ${shortDay(d.nextClass + 'T12:00:00')}.` : ' Assign a program to athletes to see classes here.'}</Empty>}
      </Section>

      <Section title={assessIsToday ? 'Assessments today' : d.assessDay ? `Assessments ${shortDay(d.assessments[0].slot_start)}` : 'Assessments'} count={d.assessments.length || null}
        action={<Link to="/admin/bookings" className="text-sm text-primary hover:underline">All bookings</Link>}>
        {d.assessments.length ? d.assessments.map((b) => (
          <Row key={b.id} to={b.athlete_id ? `/admin/athletes/${b.athlete_id}` : '/admin/bookings'}
            right={<span className={b.status === 'attended' ? 'text-xs font-medium text-green-700' : b.status === 'no_show' ? 'text-xs text-rose-700' : 'text-xs text-muted-foreground'}>{b.status === 'attended' ? 'Checked in' : b.status === 'no_show' ? 'No-show' : 'Booked'}</span>}>
            <div className="flex min-w-0 items-baseline gap-3"><span className="w-[4.75rem] shrink-0 whitespace-nowrap font-display text-lg">{fmtTime(new Date(b.slot_start))}</span><span className="truncate"><span className="font-medium">{b.athlete_first_name} {b.athlete_last_name || ''}</span><span className="text-xs text-muted-foreground"> · {[b.athlete_age && `age ${b.athlete_age}`, b.sport].filter(Boolean).join(' · ')}</span></span></div>
          </Row>
        )) : <Empty>No assessments booked this week.</Empty>}
      </Section>

      {d.requests.length > 0 && (
        <Section title="Waiting on a text" count={d.requests.length}>
          {d.requests.map((b) => (
            <Row key={b.id} right={b.parent_phone && <Button asChild size="sm" variant="outline" className="gap-1"><a href={smsHref(b.parent_phone, askSms(b))}><MessageSquare className="h-4 w-4" /> Text</a></Button>}>
              <div className="min-w-0"><p className="truncate font-medium">{b.athlete_first_name} {b.athlete_last_name || ''} <span className="font-normal text-muted-foreground">· {b.parent_name}</span></p><p className="truncate text-xs text-muted-foreground">{askText(b)}</p></div>
            </Row>
          ))}
        </Section>
      )}

      {d.followUps.length > 0 && (
        <Section title="Assessed, not enrolled" count={d.followUps.length}>
          {d.followUps.map((a) => (
            <Row key={a.id} right={a.parent_phone && <Button asChild size="sm" variant="outline" className="gap-1"><a href={smsHref(a.parent_phone, `Hi ${(a.parent_name || '').split(' ')[0]}, it's Valor. Any questions about getting ${a.first_name} started?`)}><MessageSquare className="h-4 w-4" /> Text</a></Button>}>
              <Link to={`/admin/athletes/${a.id}`} className="min-w-0 hover:text-primary"><p className="truncate font-medium">{athleteName(a)}</p><p className="truncate text-xs text-muted-foreground">{a.parent_name}</p></Link>
            </Row>
          ))}
        </Section>
      )}
    </div>
  );
}
