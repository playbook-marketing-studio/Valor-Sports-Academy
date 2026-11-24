import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, ChevronRight, Loader2 } from 'lucide-react';
import { EmptyState } from '@/components/vtp';
import { supabase } from '@/api/supabaseClient';
import { cn } from '@/lib/utils';
import { money } from '@/lib/invoices';

const PT = 'America/Los_Angeles';
const dayKey = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: PT }).format(new Date(ts));
const dayLabel = (ts) => new Intl.DateTimeFormat('en-US', { timeZone: PT, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(ts));
const nameOf = (a) => [a?.first_name, a?.last_name].filter(Boolean).join(' ') || 'Athlete';

/**
 * Invoicing > Coming up: every autopay that is still running, with its next charge date.
 * READ ONLY. It reads subscription rows (staff RLS) and changes nothing; tapping a row opens the
 * athlete's autopay card, where Cancel autopay / Change plan / Change charge date already live.
 */
export default function ComingUp() {
  const [subs, setSubs] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    supabase.from('subscriptions')
      .select('id, athlete_id, plan_name, plan_key, amount_cents, status, current_period_end, cancel_at_period_end, last_paid_at, last_failed_at, created_at, athletes(id, first_name, last_name, parent_name, archived_at, is_example)')
      .in('status', ['active', 'past_due'])
      .order('created_at', { ascending: true })
      .then(({ data, error }) => { if (error) setErr(error.message); else setSubs(data || []); });
  }, []);

  if (err) return <p className="text-sm text-destructive">{err}</p>;
  if (!subs) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  // The oldest autopay on an athlete counts as theirs; any later one on the same athlete is flagged as a second one.
  const seen = new Set();
  const rows = subs.map((s) => {
    const second = seen.has(s.athlete_id); seen.add(s.athlete_id);
    const failed = s.status === 'past_due' || (s.last_failed_at && (!s.last_paid_at || new Date(s.last_failed_at) > new Date(s.last_paid_at)));
    const flags = [];
    if (second) flags.push({ tone: 'danger', text: `Second autopay on ${s.athletes?.first_name || 'this athlete'}` });
    if (failed) flags.push({ tone: 'danger', text: s.status === 'past_due' ? 'Past due, the last charge failed' : 'The last charge failed' });
    if (s.cancel_at_period_end) flags.push({ tone: 'warning', text: 'Set to end, won\'t charge again' });
    return { ...s, second, failed, flags, test: !!s.athletes?.is_example, charges: !s.cancel_at_period_end && !!s.current_period_end };
  });
  const dupAthletes = new Set(rows.filter((r) => r.second).map((r) => r.athlete_id));
  rows.forEach((r) => { if (dupAthletes.has(r.athlete_id) && !r.second) r.flags.unshift({ tone: 'danger', text: 'Has a second autopay too' }); });

  const charging = rows.filter((r) => r.charges && !r.test);
  const nextDay = charging.map((r) => dayKey(r.current_period_end)).sort()[0];
  const onNext = charging.filter((r) => dayKey(r.current_period_end) === nextDay);
  const main = onNext.filter((r) => !r.second);
  const extra = onNext.filter((r) => r.second);
  const sum = (l) => l.reduce((n, r) => n + (r.amount_cents || 0), 0);
  const later = charging.filter((r) => dayKey(r.current_period_end) !== nextDay);

  const order = (r) => (r.flags.some((f) => f.tone === 'danger') ? 0 : 1);
  const shown = rows.slice().sort((a, b) => order(a) - order(b)
    || String(a.current_period_end || '').localeCompare(String(b.current_period_end || ''))
    || nameOf(a.athletes).localeCompare(nameOf(b.athletes)));
  const flagged = rows.filter((r) => r.flags.length).length;

  if (!rows.length) return <EmptyState icon={CalendarClock} title="No autopay running" message="Families on a monthly plan show up here with their next charge date." />;

  return (
    <div className="space-y-3">
      {nextDay && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground">Next charge day · {dayLabel(onNext[0].current_period_end)}</p>
          <p className="mt-1 font-display text-2xl">{money(sum(main))} <span className="text-base text-muted-foreground">from {main.length} autopay{main.length === 1 ? '' : 's'}</span></p>
          {extra.length > 0 && (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-danger"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Plus {money(sum(extra))} from {extra.length === 1 ? 'a second autopay' : `${extra.length} second autopays`} on {[...new Set(extra.map((r) => r.athletes?.first_name))].join(', ')}. Check {extra.length === 1 ? 'it' : 'them'} before then.</p>
          )}
          {later.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{later.length} more on other days, below.</p>}
        </div>
      )}
      <p className="text-sm text-muted-foreground">{rows.length} autopay{rows.length === 1 ? '' : 's'} running{flagged ? <> · <b className="text-danger">{flagged} to check</b></> : null}</p>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {shown.map((r) => (
          <Link key={r.id} to={`/admin/athletes/${r.athlete_id}#autopay`} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent">
            <div className="w-16 shrink-0 text-xs text-muted-foreground">{r.current_period_end ? dayLabel(r.current_period_end) : 'No date'}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{nameOf(r.athletes)}{r.test && <span className="ml-2 text-xs font-normal text-muted-foreground">test</span>}</p>
              <p className="truncate text-xs text-muted-foreground">{r.plan_name || r.plan_key}{r.athletes?.parent_name ? ` · ${r.athletes.parent_name}` : ''}</p>
              {r.flags.map((f) => (
                <p key={f.text} className={cn('mt-0.5 flex items-center gap-1 text-xs font-semibold', f.tone === 'danger' ? 'text-danger' : 'text-warning')}><AlertTriangle className="h-3.5 w-3.5" />{f.text}</p>
              ))}
            </div>
            <span className={cn('text-sm font-semibold', !r.charges && 'text-muted-foreground line-through')}>{money(r.amount_cents)}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Nothing here changes anything. Tap a row to open that athlete's autopay, where you can cancel it, change the plan or change the charge date.</p>
    </div>
  );
}
