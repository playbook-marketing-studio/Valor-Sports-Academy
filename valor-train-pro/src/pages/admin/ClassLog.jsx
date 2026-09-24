import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { saveCoachLog } from '@/lib/programs';
import { athleteName } from '@/lib/valor';
import { latestMaxes } from '@/lib/maxes';
import { cn } from '@/lib/utils';

/** The workbook's Monday/Wednesday/Day-N Log tabs: one program day + week, every athlete on it, weight used per exercise. */
export default function ClassLog() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [templates, setTemplates] = useState([]);
  const templateId = params.get('program') || '';
  const dayKey = params.get('day') || '';
  const week = Number(params.get('week') || 0);
  const [rows, setRows] = useState(null); // [{ workout, athlete, log, maxes }]
  const [vals, setVals] = useState({});   // `${workoutId}|${exercise}` → weight
  const [saved, setSaved] = useState({});

  useEffect(() => { supabase.from('program_templates').select('id, name, weeks, days').order('created_at').then(({ data }) => setTemplates(data || [])); }, []);
  const tpl = templates.find((t) => t.id === templateId);
  const set = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

  // default to this week of the program, today's day if it matches
  useEffect(() => {
    if (!tpl) return;
    if (!dayKey) set('day', tpl.days[0].key);
    if (!week) set('week', '1');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl]);

  const load = useCallback(async () => {
    if (!templateId || !dayKey || !week) return setRows(null);
    setRows(undefined);
    const { data: ws } = await supabase.from('workouts').select('*, athlete:athletes(id, first_name, last_name)').eq('template_id', templateId).eq('day_key', dayKey).eq('week', week).order('date');
    const ids = (ws || []).map((w) => w.id);
    const aids = [...new Set((ws || []).map((w) => w.athlete_id))];
    const [{ data: logs }, { data: maxes }] = await Promise.all([
      ids.length ? supabase.from('workout_logs').select('*').in('workout_id', ids).eq('owner_id', user.id) : { data: [] },
      aids.length ? supabase.from('one_rep_maxes').select('*').in('athlete_id', aids) : { data: [] },
    ]);
    const v = {};
    (logs || []).forEach((l) => (l.logged_exercises || []).forEach((e) => { if (e.weight != null) v[`${l.workout_id}|${e.name}`] = String(e.weight); }));
    setVals(v); setSaved({});
    setRows((ws || []).map((w) => ({ workout: w, athlete: w.athlete, maxes: latestMaxes(maxes || [], w.athlete_id) })));
  }, [templateId, dayKey, week, user.id]);
  useEffect(() => { load(); }, [load]);

  const exercises = useMemo(() => {
    const names = []; (rows || []).forEach((r) => r.workout.exercises.forEach((e) => { if (!names.find((n) => n.name === e.name)) names.push(e); }));
    return names;
  }, [rows]);

  const saveRow = async (r) => {
    try {
      const entries = Object.fromEntries(r.workout.exercises.map((e) => [e.name, { weight: vals[`${r.workout.id}|${e.name}`] ? Number(vals[`${r.workout.id}|${e.name}`]) : null }]));
      await saveCoachLog(r.workout, user.id, entries);
      setSaved((s) => ({ ...s, [r.workout.id]: true }));
    } catch (e) { toast({ title: `Could not save ${athleteName(r.athlete)}`, description: e.message }); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl">Class log</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pick the program, day and week. Type the weight each athlete used; each row saves when you leave it. Gray hint = their target from their own max.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Program" value={templateId} onChange={(e) => { const p = new URLSearchParams(); if (e.target.value) p.set('program', e.target.value); setParams(p, { replace: true }); }} className="h-9 rounded-full border border-input bg-background px-3 text-sm">
          <option value="">Pick a program</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {tpl && tpl.days.map((d) => <button key={d.key} onClick={() => set('day', d.key)} className={cn('rounded-full px-3 py-1.5 text-sm font-medium', dayKey === d.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{d.label}</button>)}
        {tpl && (
          <select aria-label="Week" value={week || ''} onChange={(e) => set('week', e.target.value)} className="h-9 rounded-full border border-input bg-background px-3 text-sm">
            {Array.from({ length: tpl.weeks }, (_, i) => i + 1).map((w) => <option key={w} value={w}>Week {w}</option>)}
          </select>
        )}
      </div>
      {rows === undefined && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      {rows && !rows.length && <p className="py-12 text-center text-sm text-muted-foreground">Nobody is on this program yet. <Link to={`/admin/programs/${templateId}`} className="text-primary">Assign athletes</Link>.</p>}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="text-sm">
            <thead><tr className="border-b border-border text-left text-xs">
              <th className="sticky left-0 z-10 min-w-[150px] bg-card px-3 py-2 font-medium text-muted-foreground">Athlete</th>
              {exercises.map((e) => <th key={e.name} className="min-w-[110px] px-2 py-2 align-bottom font-medium"><span className="block">{e.name}</span><span className="block font-normal text-muted-foreground">{e.target || e.prescription.replace(/^\w+\s*-\s*/, '')}</span></th>)}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.workout.id} className="border-b border-border last:border-0" onBlur={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget)) saveRow(r); }}>
                  <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                    <Link to={`/admin/athletes/${r.athlete.id}`} className="font-medium hover:text-primary">{athleteName(r.athlete)}</Link>
                    <span className="block text-[11px] text-muted-foreground">{new Date(r.workout.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}{saved[r.workout.id] && <Check className="ml-1 inline h-3 w-3 text-green-600" />}</span>
                  </td>
                  {exercises.map((e) => {
                    const ex = r.workout.exercises.find((x) => x.name === e.name);
                    if (!ex) return <td key={e.name} className="bg-muted/40" />;
                    const hint = ex.intensity && r.maxes[ex.name] ? `${Math.round((r.maxes[ex.name] * ex.intensity) / 100)}` : 'lb';
                    const k = `${r.workout.id}|${e.name}`;
                    return <td key={e.name} className="px-1 py-1"><Input aria-label={`${athleteName(r.athlete)} ${e.name}`} className="h-8 px-2" inputMode="decimal" placeholder={hint} value={vals[k] ?? ''} onChange={(ev) => setVals({ ...vals, [k]: ev.target.value })} /></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
