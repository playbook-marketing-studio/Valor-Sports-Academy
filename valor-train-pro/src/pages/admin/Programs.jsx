import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, UserPlus } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import AssignProgramDialog from '@/components/AssignProgramDialog';
import { weekdayName } from '@/lib/programs';
import { athleteName } from '@/lib/valor';
import { cn } from '@/lib/utils';

const GROUP_STYLE = { primary: 'bg-primary/10 text-primary', superset: 'bg-muted', finisher: 'bg-amber-100 text-amber-900', extra: 'bg-sky-100 text-sky-900', other: 'bg-muted' };

export function ProgramsList() {
  const [rows, setRows] = useState(null);
  const [counts, setCounts] = useState({});
  useEffect(() => {
    supabase.from('program_templates').select('id, name, season, weeks, days, source').order('created_at').then(({ data }) => setRows(data || []));
    supabase.from('program_assignments').select('template_id').then(({ data }) => {
      const c = {}; (data || []).forEach((r) => { c[r.template_id] = (c[r.template_id] || 0) + 1; }); setCounts(c);
    });
  }, []);
  if (!rows) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl">Programs</h1>
        <p className="mt-1 text-sm text-muted-foreground">Write a program once, put a whole group on it. Each athlete gets their own dated workouts with targets from their own maxes.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((t) => (
          <Link key={t.id} to={`/admin/programs/${t.id}`}>
            <Card className="h-full transition hover:border-primary/50"><CardContent className="p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{t.season === 'off_season' ? 'Off-season' : 'In-season'} · {t.weeks} weeks</p>
              <h2 className="mt-1 font-display text-2xl">{t.name}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{t.days.map((d) => d.label).join(' · ')}</p>
              <p className="mt-3 text-xs text-muted-foreground">{counts[t.id] || 0} athlete{counts[t.id] === 1 ? '' : 's'} assigned{t.source ? ` · imported from ${t.source}` : ''}</p>
            </CardContent></Card>
          </Link>
        ))}
        {!rows.length && <p className="text-sm text-muted-foreground">No programs yet. Import Corey's workbook with scripts/import_programs.py.</p>}
      </div>
    </div>
  );
}

export function ProgramDetail() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [assigned, setAssigned] = useState([]);
  const [dayKey, setDayKey] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const load = useCallback(async () => {
    const [{ data: tpl }, { data: asg }] = await Promise.all([
      supabase.from('program_templates').select('*').eq('id', id).maybeSingle(),
      supabase.from('program_assignments').select('id, start_date, athlete:athletes(id, first_name, last_name)').eq('template_id', id).order('created_at'),
    ]);
    setT(tpl); setAssigned(asg || []); if (tpl && !dayKey) setDayKey(tpl.days[0]?.key);
  }, [id, dayKey]);
  useEffect(() => { load(); }, [load]);
  if (!t) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const day = t.days.find((d) => d.key === dayKey) || t.days[0];
  const weeks = Array.from({ length: t.weeks }, (_, i) => i + 1);
  const blocks = [...new Set(day.exercises.map((e) => `${e.weeks[0]}-${e.weeks[e.weeks.length - 1]}|${e.block}`))];

  return (
    <div className="space-y-6">
      <Link to="/admin/programs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Programs</Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{t.season === 'off_season' ? 'Off-season' : 'In-season'} · {t.weeks} weeks</p>
          <h1 className="font-display text-3xl lg:text-4xl">{t.name}</h1>
          {t.description && <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link to={`/admin/log?program=${t.id}`}>Class log</Link></Button>
          <Button size="sm" className="gap-2" onClick={() => setAssignOpen(true)}><UserPlus className="h-4 w-4" /> Assign athletes</Button>
        </div>
      </div>

      <Card><CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
        <span className="font-semibold">On this program:</span>
        {assigned.length ? assigned.map((a) => <Link key={a.id} to={`/admin/athletes/${a.athlete.id}`} className="rounded-full bg-muted px-3 py-1 hover:bg-primary/10">{athleteName(a.athlete)} <span className="text-xs text-muted-foreground">from {new Date(a.start_date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></Link>) : <span className="text-muted-foreground">nobody yet</span>}
      </CardContent></Card>

      <div className="flex flex-wrap gap-1">
        {t.days.map((d) => <button key={d.key} onClick={() => setDayKey(d.key)} className={cn('rounded-full px-4 py-1.5 text-sm font-medium', d.key === day.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>{d.label}</button>)}
      </div>
      {day.warmup && <p className="rounded-lg bg-muted/60 p-3 text-sm"><span className="font-semibold">Before lifting: </span>{day.warmup}</p>}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[900px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="sticky left-0 bg-card px-3 py-2 font-medium">Exercise</th><th className="px-2 py-2 font-medium">Sets / notes</th>
            {weeks.map((w) => <th key={w} className="px-2 py-2 font-medium">Wk {w}</th>)}
          </tr></thead>
          <tbody>
            {blocks.map((b) => {
              const [range, label] = b.split('|');
              const rows = day.exercises.filter((e) => `${e.weeks[0]}-${e.weeks[e.weeks.length - 1]}|${e.block}` === b);
              return (
                <React.Fragment key={b}>
                  <tr className="bg-muted/50"><td colSpan={weeks.length + 2} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider">Weeks {range}{label ? ` · ${label}` : ''}</td></tr>
                  {rows.map((e, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="sticky left-0 bg-card px-3 py-1.5 font-medium">{e.name}</td>
                      <td className="px-2 py-1.5"><span className={cn('mr-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', GROUP_STYLE[e.group])}>{e.group}</span><span className="text-xs text-muted-foreground">{e.prescription.replace(/^\w+\s*-\s*/, '')}</span></td>
                      {weeks.map((w) => <td key={w} className={cn('px-2 py-1.5 text-xs', !e.weeks.includes(w) && 'bg-muted/40')}>{e.targets[String(w)] || ''}</td>)}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {(day.cue || day.finish) && <div className="space-y-2 text-sm">{day.finish && <p>{day.finish}</p>}{day.cue && <p className="italic text-muted-foreground">Coach's cue: "{day.cue}"</p>}</div>}
      <p className="text-xs text-muted-foreground">Day {day.label} defaults to {weekdayName(day.weekday)}; change it per athlete when you assign. Targets were transcribed from Corey's original program images in the workbook; spot-check weeks 1-2 before the season.</p>
      <AssignProgramDialog open={assignOpen} onOpenChange={setAssignOpen} template={t} onDone={load} />
    </div>
  );
}
