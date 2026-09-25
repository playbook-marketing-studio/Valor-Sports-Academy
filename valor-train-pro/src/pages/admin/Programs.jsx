import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Copy, Loader2, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import AssignProgramDialog from '@/components/AssignProgramDialog';
import { resyncAssignments, weekdayName } from '@/lib/programs';
import { athleteName } from '@/lib/valor';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/vtp';
import { photoPosition } from '@/lib/photos';

// Wide cards need landscape training/facility shots — a portrait coach photo
// forced into this crop shows nothing but torso. class-drill and facility-*
// are landscape and read fine at 128px tall.
const PROGRAM_PHOTOS = [
  '/images/photos/class-drill.webp',
  '/images/photos/facility-turf.webp',
  '/images/photos/sports-kids.webp',
  '/images/photos/facility-weights.webp',
  '/images/photos/bw-grind.webp',
  '/images/photos/facility-wide.webp',
];

const GROUP_STYLE = { primary: 'bg-primary/10 text-primary', superset: 'bg-muted', finisher: 'bg-amber-100 text-amber-900', extra: 'bg-sky-100 text-sky-900', other: 'bg-muted' };

const blankTemplate = () => ({
  name: 'New program', season: 'in_season', weeks: 4, description: '',
  days: [{ key: 'day1', label: 'Day 1', weekday: 1, warmup: '', cue: '', finish: '', exercises: [] }],
});

export function ProgramsList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const create = async () => {
    const { data, error } = await supabase.from('program_templates').insert(blankTemplate()).select('id').single();
    if (error) return toast({ title: 'Could not create', description: error.message });
    navigate(`/admin/programs/${data.id}?edit=1`);
  };
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl lg:text-4xl">Programs</h1>
          <p className="mt-1 text-sm text-muted-foreground">Write a program once, put a whole group on it. Each athlete gets their own dated workouts with targets from their own maxes.</p>
        </div>
        <Button size="sm" className="gap-2" onClick={create}><Plus className="h-4 w-4" /> New program</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((t, idx) => (
          <Link key={t.id} to={`/admin/programs/${t.id}`}>
            <Card className="h-full overflow-hidden transition hover:border-primary/50">
              <img src={PROGRAM_PHOTOS[idx % PROGRAM_PHOTOS.length]} alt="" loading="lazy" width={640} height={128} style={{ objectPosition: photoPosition(PROGRAM_PHOTOS[idx % PROGRAM_PHOTOS.length]) }} className="h-32 w-full object-cover" />
              <CardContent className="p-5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{t.season === 'off_season' ? 'Off-season' : 'In-season'} · {t.weeks} weeks</p>
                <h2 className="mt-1 font-display text-2xl">{t.name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{t.days.map((d) => d.label).join(' · ')}</p>
                <p className="mt-3 text-xs text-muted-foreground">{counts[t.id] || 0} athlete{counts[t.id] === 1 ? '' : 's'} assigned{t.source ? ` · imported from ${t.source}` : ''}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      {!rows.length && (
        <EmptyState
          photo="/images/photos/facility-wide.webp"
          title="No programs yet"
          message="Write a program once and put a whole group on it, or import Corey's workbook with scripts/import_programs.py."
          actionLabel="New program"
          onAction={create}
        />
      )}
    </div>
  );
}

const GROUPS = ['primary', 'superset', 'finisher', 'extra', 'other'];
const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, k) => a + k);
const blockKey = (e) => `${e.weeks[0]}-${e.weeks[e.weeks.length - 1]}|${e.block || ''}`;
const slugKey = (label, taken) => { let k = label.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12) || 'day'; let n = k, i = 2; while (taken.includes(n)) n = `${k}${i++}`; return n; };

export function ProgramDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [t, setT] = useState(null);          // saved template
  const [draft, setDraft] = useState(null);  // editing copy, null when viewing
  const [assigned, setAssigned] = useState([]);
  const [dayKey, setDayKey] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const [{ data: tpl }, { data: asg }] = await Promise.all([
      supabase.from('program_templates').select('*').eq('id', id).maybeSingle(),
      supabase.from('program_assignments').select('id, start_date, athlete:athletes(id, first_name, last_name)').eq('template_id', id).order('created_at'),
    ]);
    setT(tpl); setAssigned(asg || []);
    if (tpl) setDayKey((k) => (tpl.days.some((d) => d.key === k) ? k : tpl.days[0]?.key));
    return tpl;
  }, [id]);
  useEffect(() => { load().then((tpl) => { if (tpl && params.get('edit')) setDraft(structuredClone(tpl)); }); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!t) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const view = draft || t;
  const editing = !!draft;
  const day = view.days.find((d) => d.key === dayKey) || view.days[0];
  const weeks = range(1, view.weeks);
  const blocks = day ? [...new Set(day.exercises.map(blockKey))] : [];

  // ── draft helpers ─────────────────────────────────────────────────────
  const edit = (fn) => setDraft((d) => { const n = structuredClone(d); fn(n); return n; });
  const dayIdx = () => draft.days.findIndex((d) => d.key === day.key);
  const exIdx = (e) => day.exercises.indexOf(e);
  const setEx = (e, k, v) => edit((n) => { n.days[dayIdx()].exercises[exIdx(e)][k] = v; });
  const setTarget = (e, w, v) => edit((n) => { const ex = n.days[dayIdx()].exercises[exIdx(e)]; ex.targets = { ...ex.targets, [String(w)]: v }; if (!v) delete ex.targets[String(w)]; });
  const addExercise = (bk) => edit((n) => {
    const d = n.days[dayIdx()];
    const [r, label] = bk ? bk.split('|') : [`1-${n.weeks}`, ''];
    const [a, b] = r.split('-').map(Number);
    const at = bk ? d.exercises.map(blockKey).lastIndexOf(bk) + 1 : d.exercises.length;
    d.exercises.splice(at, 0, { name: '', group: 'primary', prescription: '', block: label, weeks: range(a, b), targets: {} });
  });
  const removeExercise = (e) => edit((n) => { n.days[dayIdx()].exercises.splice(exIdx(e), 1); });
  const moveExercise = (e, dir) => edit((n) => {
    const list = n.days[dayIdx()].exercises; const i = exIdx(e); const j = i + dir;
    if (j < 0 || j >= list.length || blockKey(list[j]) !== blockKey(list[i])) return;
    [list[i], list[j]] = [list[j], list[i]];
  });
  const editBlock = (bk, patch) => edit((n) => {
    n.days[dayIdx()].exercises.forEach((e) => {
      if (blockKey(e) !== bk) return;
      if (patch.label !== undefined) e.block = patch.label;
      if (patch.from || patch.to) {
        const a = Math.max(1, Number(patch.from ?? e.weeks[0])); const b = Math.min(n.weeks, Number(patch.to ?? e.weeks[e.weeks.length - 1]));
        e.weeks = range(a, Math.max(a, b));
        e.targets = Object.fromEntries(Object.entries(e.targets || {}).filter(([w]) => e.weeks.includes(Number(w))));
      }
    });
  });
  const addBlock = () => edit((n) => {
    const d = n.days[dayIdx()];
    const last = Math.max(0, ...d.exercises.map((e) => e.weeks[e.weeks.length - 1]));
    const a = Math.min(n.weeks, last + 1); const b = Math.min(n.weeks, a + 3);
    d.exercises.push({ name: '', group: 'primary', prescription: '', block: 'New block', weeks: range(a, b), targets: {} });
  });
  const addDay = () => { const key = slugKey(`day${draft.days.length + 1}`, draft.days.map((d) => d.key)); edit((n) => { n.days.push({ key, label: `Day ${n.days.length + 1}`, weekday: Math.min(6, n.days.length + 1), warmup: '', cue: '', finish: '', exercises: [] }); }); setDayKey(key); };
  const removeDay = () => { if (draft.days.length === 1) return; if (!window.confirm(`Remove ${day.label} from this program?`)) return; edit((n) => { n.days.splice(dayIdx(), 1); }); setDayKey(draft.days[0].key === day.key ? draft.days[1].key : draft.days[0].key); };
  const setDay = (k, v) => edit((n) => { n.days[dayIdx()][k] = v; });
  const setWeeks = (v) => edit((n) => {
    n.weeks = Math.max(1, Math.min(52, Number(v) || 1));
    n.days.forEach((d) => d.exercises.forEach((e) => { e.weeks = e.weeks.filter((w) => w <= n.weeks); if (!e.weeks.length) e.weeks = [n.weeks]; e.targets = Object.fromEntries(Object.entries(e.targets || {}).filter(([w]) => Number(w) <= n.weeks)); }));
  });

  const save = async () => {
    const clean = structuredClone(draft);
    clean.days.forEach((d) => { d.exercises = d.exercises.filter((e) => e.name.trim()).map((e) => ({ ...e, name: e.name.trim(), prescription: (e.prescription || '').trim() })); });
    if (!clean.name.trim()) return toast({ title: 'Give the program a name' });
    setBusy('save');
    const { error } = await supabase.from('program_templates').update({ name: clean.name.trim(), season: clean.season, weeks: clean.weeks, description: clean.description, days: clean.days }).eq('id', t.id);
    setBusy('');
    if (error) return toast({ title: 'Could not save', description: error.message });
    const saved = await load();
    setDraft(null); setParams({}, { replace: true });
    if (assigned.length && window.confirm(`Saved. Update the upcoming workouts for the ${assigned.length} athlete${assigned.length === 1 ? '' : 's'} on this program?\n\nPast workouts and anything already logged stay as they are. Hand edits on their upcoming workouts from this program are replaced.`)) {
      setBusy('sync');
      try { const r = await resyncAssignments(saved); toast({ title: 'Athletes updated', description: `${r.replaced} upcoming workout${r.replaced === 1 ? '' : 's'} rebuilt for ${r.athletes} athlete${r.athletes === 1 ? '' : 's'}.` }); }
      catch (e) { toast({ title: 'Saved, but updating athletes failed', description: e.message }); }
      setBusy('');
    } else toast({ title: 'Program saved' });
  };
  const duplicate = async () => {
    const { id: _i, created_at: _c, updated_at: _u, created_by: _b, source: _s, ...rest } = t;
    const { data, error } = await supabase.from('program_templates').insert({ ...rest, name: `${t.name} (copy)` }).select('id').single();
    if (error) return toast({ title: 'Could not duplicate', description: error.message });
    navigate(`/admin/programs/${data.id}?edit=1`);
  };
  const remove = async () => {
    if (assigned.length) return toast({ title: `${assigned.length} athlete${assigned.length === 1 ? ' is' : 's are'} on this program`, description: 'Take them off it first (Remove on their Training tab), then delete.' });
    if (!window.confirm(`Delete ${t.name}?`)) return;
    const { error } = await supabase.from('program_templates').delete().eq('id', t.id);
    if (error) return toast({ title: 'Could not delete', description: error.message });
    navigate('/admin/programs');
  };

  const cell = 'h-8 px-2 text-xs';
  return (
    <div className="space-y-6">
      <Link to="/admin/programs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Programs</Link>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        {editing ? (
          <div className="grid w-full max-w-3xl gap-2 sm:grid-cols-6">
            <Input aria-label="Program name" className="font-display text-xl sm:col-span-4" value={draft.name} onChange={(e) => edit((n) => { n.name = e.target.value; })} />
            <select aria-label="Season" value={draft.season || ''} onChange={(e) => edit((n) => { n.season = e.target.value || null; })} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">
              <option value="in_season">In-season</option><option value="off_season">Off-season</option><option value="">Any</option>
            </select>
            <div className="flex items-center gap-1"><Input aria-label="Weeks" type="number" min={1} max={52} value={draft.weeks} onChange={(e) => setWeeks(e.target.value)} /><span className="text-xs text-muted-foreground">wks</span></div>
            <Textarea aria-label="Description" rows={2} className="sm:col-span-6" placeholder="What this program is for, how percentages work" value={draft.description || ''} onChange={(e) => edit((n) => { n.description = e.target.value; })} />
          </div>
        ) : (
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{t.season === 'off_season' ? 'Off-season' : t.season === 'in_season' ? 'In-season' : 'Any season'} · {t.weeks} weeks</p>
            <h1 className="font-display text-3xl lg:text-4xl">{t.name}</h1>
            {t.description && <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t.description}</p>}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-destructive" onClick={remove}><Trash2 className="h-3 w-3" /> Delete program</Button>
              <Button variant="ghost" size="sm" onClick={() => { setDraft(null); setParams({}, { replace: true }); }}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={!!busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save program'}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setDraft(structuredClone(t))}><Pencil className="h-3 w-3" /> Edit</Button>
              <Button variant="outline" size="sm" className="gap-1" onClick={duplicate}><Copy className="h-3 w-3" /> Duplicate</Button>
              <Button variant="outline" size="sm" className="gap-1 hover:border-destructive hover:text-destructive" onClick={remove}><Trash2 className="h-3 w-3" /> Delete</Button>
              <Button asChild variant="outline" size="sm"><Link to={`/admin/log?program=${t.id}`}>Class log</Link></Button>
              <Button size="sm" className="gap-2" onClick={() => setAssignOpen(true)}><UserPlus className="h-4 w-4" /> Assign athletes</Button>
            </>
          )}
        </div>
      </div>
      {busy === 'sync' && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Updating athletes' upcoming workouts…</p>}

      {!editing && (
        <Card><CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
          <span className="font-semibold">On this program:</span>
          {assigned.length ? assigned.map((a) => <Link key={a.id} to={`/admin/athletes/${a.athlete.id}`} className="rounded-full bg-muted px-3 py-1 hover:bg-primary/10">{athleteName(a.athlete)} <span className="text-xs text-muted-foreground">from {new Date(a.start_date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></Link>) : <span className="text-muted-foreground">nobody yet</span>}
        </CardContent></Card>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {view.days.map((d) => <button key={d.key} onClick={() => setDayKey(d.key)} className={cn('rounded-full px-4 py-1.5 text-sm font-medium', d.key === day?.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>{d.label}</button>)}
        {editing && <Button variant="ghost" size="sm" className="gap-1" onClick={addDay}><Plus className="h-3 w-3" /> Day</Button>}
      </div>

      {day && editing && (
        <Card><CardContent className="grid gap-2 p-4 sm:grid-cols-6">
          <Input aria-label="Day name" className="sm:col-span-3" value={day.label} onChange={(e) => setDay('label', e.target.value)} />
          <select aria-label="Default weekday" value={day.weekday} onChange={(e) => setDay('weekday', Number(e.target.value))} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm sm:col-span-2">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{weekdayName(n)}</option>)}
          </select>
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-destructive" onClick={removeDay} disabled={view.days.length === 1}><Trash2 className="h-3 w-3" /> Remove day</Button>
          <Textarea aria-label="Warm-up" rows={2} className="sm:col-span-6" placeholder="Before lifting: warm-up, mobility, SAQ" value={day.warmup || ''} onChange={(e) => setDay('warmup', e.target.value)} />
          <Input aria-label="Finisher" className="sm:col-span-3" placeholder="Finish with…" value={day.finish || ''} onChange={(e) => setDay('finish', e.target.value)} />
          <Input aria-label="Coach's cue" className="sm:col-span-3" placeholder="Coach's cue" value={day.cue || ''} onChange={(e) => setDay('cue', e.target.value)} />
        </CardContent></Card>
      )}
      {day && !editing && day.warmup && <p className="rounded-lg bg-muted/60 p-3 text-sm"><span className="font-semibold">Before lifting: </span>{day.warmup}</p>}

      {day && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card px-3 py-2 font-medium">Exercise</th><th className="px-2 py-2 font-medium">Sets / notes</th>
              {weeks.map((w) => <th key={w} className="px-2 py-2 font-medium">Wk {w}</th>)}
              {editing && <th />}
            </tr></thead>
            <tbody>
              {blocks.map((b, bi) => {
                const [r, label] = b.split('|');
                const [from, to] = r.split('-').map(Number);
                const rows = day.exercises.filter((e) => blockKey(e) === b);
                return (
                  <React.Fragment key={bi}>
                    <tr className="bg-muted/50"><td colSpan={weeks.length + 3} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider">
                      {editing ? (
                        <span className="flex flex-wrap items-center gap-2 normal-case tracking-normal">
                          Weeks <Input aria-label="Block from week" type="number" className="h-7 w-14 px-1 text-xs" value={from} min={1} max={view.weeks} onChange={(e) => editBlock(b, { from: e.target.value, to })} />
                          to <Input aria-label="Block to week" type="number" className="h-7 w-14 px-1 text-xs" value={to} min={1} max={view.weeks} onChange={(e) => editBlock(b, { from, to: e.target.value })} />
                          <Input aria-label="Block name" className="h-7 w-48 text-xs" placeholder="e.g. Total Body" value={label} onChange={(e) => editBlock(b, { label: e.target.value })} />
                          <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => addExercise(b)}><Plus className="h-3 w-3" /> Exercise</Button>
                        </span>
                      ) : <>Weeks {r}{label ? ` · ${label}` : ''}</>}
                    </td></tr>
                    {rows.map((e, i) => (
                      <tr key={`${bi}-${i}`} className="border-b border-border last:border-0">
                        <td className="sticky left-0 z-10 bg-card px-3 py-1.5 font-medium">
                          {editing ? <Input aria-label="Exercise name" className="h-8 min-w-[160px]" value={e.name} onChange={(ev) => setEx(e, 'name', ev.target.value)} /> : e.name}
                        </td>
                        <td className="px-2 py-1.5">
                          {editing ? (
                            <div className="flex gap-1">
                              <select aria-label="Role" value={e.group} onChange={(ev) => setEx(e, 'group', ev.target.value)} className="h-8 rounded-md border border-input bg-transparent px-1 text-xs">{GROUPS.map((g) => <option key={g}>{g}</option>)}</select>
                              <Input aria-label="Prescription" className="h-8 w-28 px-2 text-xs" placeholder="5x3" value={(e.prescription || '').replace(/^\w+\s*-\s*/, '')} onChange={(ev) => setEx(e, 'prescription', ev.target.value ? `${e.group} - ${ev.target.value}` : e.group)} />
                            </div>
                          ) : <><span className={cn('mr-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', GROUP_STYLE[e.group])}>{e.group}</span><span className="text-xs text-muted-foreground">{(e.prescription || '').replace(/^\w+\s*-\s*/, '')}</span></>}
                        </td>
                        {weeks.map((w) => (
                          <td key={w} className={cn('px-1 py-1 text-xs', !e.weeks.includes(w) && 'bg-muted/40')}>
                            {editing && e.weeks.includes(w)
                              ? <Input aria-label={`${e.name || 'Exercise'} week ${w}`} className={cn(cell, 'w-20')} placeholder="3 x 55%" value={(e.targets || {})[String(w)] || ''} onChange={(ev) => setTarget(e, w, ev.target.value)} />
                              : <span className="px-1">{(e.targets || {})[String(w)] || ''}</span>}
                          </td>
                        ))}
                        {editing && (
                          <td className="whitespace-nowrap px-1">
                            <button onClick={() => moveExercise(e, -1)} className="px-1 text-muted-foreground hover:text-foreground" aria-label="Move up">↑</button>
                            <button onClick={() => moveExercise(e, 1)} className="px-1 text-muted-foreground hover:text-foreground" aria-label="Move down">↓</button>
                            <button onClick={() => removeExercise(e)} className="px-1 text-muted-foreground hover:text-destructive" aria-label="Remove"><Trash2 className="inline h-3.5 w-3.5" /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
              {!blocks.length && <tr><td colSpan={weeks.length + 3} className="px-3 py-8 text-center text-sm text-muted-foreground">No exercises on this day yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {editing && <div className="flex gap-2"><Button variant="outline" size="sm" className="gap-1" onClick={() => (blocks.length ? addBlock() : addExercise(null))}><Plus className="h-3 w-3" /> {blocks.length ? 'Add a block of weeks' : 'Add the first exercise'}</Button></div>}
      {editing && <p className="text-xs text-muted-foreground">Targets are free text, the way the workbook writes them: "3 x 55%" (reps at % of max), "x10", "x5 ea", "Bodyweight", "x30 sec". Percent targets turn into each athlete's weight from their own max.</p>}
      {!editing && day && (day.cue || day.finish) && <div className="space-y-2 text-sm">{day.finish && <p>{day.finish}</p>}{day.cue && <p className="italic text-muted-foreground">Coach's cue: "{day.cue}"</p>}</div>}
      {!editing && day && <p className="text-xs text-muted-foreground">{day.label} defaults to {weekdayName(day.weekday)}; change it per athlete when you assign.{t.source ? " Imported from Corey's workbook, which says to spot-check weeks 1-2 against his original program." : ''}</p>}
      <AssignProgramDialog open={assignOpen} onOpenChange={setAssignOpen} template={t} onDone={load} />
    </div>
  );
}
