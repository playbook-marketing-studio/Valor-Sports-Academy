import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Plus, Search, UserPlus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import AthleteForm from '@/components/AthleteForm';
import { supabase } from '@/api/supabaseClient';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { athleteName } from '@/lib/valor';
import { cn } from '@/lib/utils';

export function loginState(a) {
  if (a.parent_last_sign_in_at) return { label: 'Parent active', cls: 'bg-green-100 text-green-800' };
  if (a.invited_at) return { label: 'Login sent', cls: 'bg-amber-100 text-amber-900' };
  return { label: 'No login yet', cls: 'bg-muted text-muted-foreground' };
}

const STAGES = [['active', 'All active'], ['lead', 'Waiting on a text'], ['reached_out', 'Reached out'], ['booked', 'Booked'], ['assessed', 'Assessed'], ['enrolled', 'Enrolled'], ['archived', 'Archived']];
// lead -> reached_out -> booked (has an assessment time) -> assessed -> enrolled (paid or in a class)
const STAGE_LABEL = { lead: 'Waiting on a text', reached_out: 'Reached out', booked: 'Booked', assessed: 'Assessed', enrolled: 'Enrolled', archived: 'Archived', new: 'New' };
const STAGE_STYLE = { lead: 'bg-amber-100 text-amber-900', reached_out: 'bg-sky-100 text-sky-900', new: 'bg-muted text-muted-foreground', booked: 'bg-muted text-muted-foreground', assessed: 'bg-amber-100 text-amber-900', enrolled: 'bg-green-100 text-green-800', archived: 'bg-muted text-muted-foreground line-through' };

export default function AdminAthletes() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const stageParam = searchParams.get('stage');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [stage, setStage] = useState(STAGES.some(([k]) => k === stageParam) ? stageParam : 'active');
  const [season, setSeason] = useState('');
  const [form, setForm] = useState(null); // 'add' | 'walk_in'

  useEffect(() => {
    supabase.from('athletes_admin').select('*').order('created_at', { ascending: false }).limit(2000)
      .then(({ data }) => { setRows(data || []); setLoading(false); });
  }, []);

  const term = q.trim().toLowerCase();
  const count = (k) => rows.filter((a) => (k === 'active' ? a.stage !== 'archived' : a.stage === k)).length;
  const shown = rows
    .filter((a) => (stage === 'active' ? a.stage !== 'archived' : a.stage === stage))
    .filter((a) => !season || a.season === season)
    .filter((a) => !term || [a.first_name, a.last_name, a.parent_name, a.parent_email, a.parent_login_email, a.sport, a.school].join(' ').toLowerCase().includes(term))
    .sort((x, y) => Number(!!y.is_example) - Number(!!x.is_example)); // the live example athlete always first

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl lg:text-4xl">Athletes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Everyone who has booked, walked in or trains here. Tap a name to see results, their parent login QR, and payment.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setForm('add')} className="gap-2"><UserPlus className="h-4 w-4" /> Add athlete</Button>
          <Button size="sm" onClick={() => setForm('walk_in')} className="gap-2"><Plus className="h-4 w-4" /> Walk-in</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {STAGES.map(([k, l]) => (
          <button key={k} onClick={() => setStage(k)} className={cn('rounded-full px-4 py-1.5 text-sm font-medium', stage === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>{l} <span className="opacity-70">{count(k)}</span></button>
        ))}
        <select aria-label="Season" value={season} onChange={(e) => setSeason(e.target.value)} className="ml-auto h-9 rounded-full border border-input bg-background px-3 text-sm">
          <option value="">All seasons</option><option value="in_season">In-season</option><option value="off_season">Off-season</option>
        </select>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search athlete, parent, email, sport" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
        <div className="space-y-2">
          {shown.map((a) => {
            const ls = loginState(a);
            return (
              <Link key={a.id} to={`/admin/athletes/${a.id}`}>
                <Card className={cn('transition hover:border-primary/50', a.is_example && 'border-primary/60 bg-primary/5')}>
                  <CardContent className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      {a.is_example && <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">Live example · everything filled in</p>}
                      <span className="font-semibold">{athleteName(a)}</span>
                      {a.is_example && <p className="mt-0.5 text-xs text-muted-foreground">Quiz, two assessments, a paid pack, a program with logged weights, max lifts and meals. Open it, then tap View as athlete to see the parent side.</p>}
                      <span className="ml-2 text-xs text-muted-foreground">{[a.age && `age ${a.age}`, a.sport, a.season === 'in_season' ? 'in-season' : a.season === 'off_season' ? 'off-season' : '', a.frequency, a.class_days, a.nutrition_plan ? 'nutrition plan' : ''].filter(Boolean).join(' · ')}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className={cn('rounded-full px-2 py-0.5 font-medium', STAGE_STYLE[a.stage])}>{STAGE_LABEL[a.stage] || a.stage}</span>
                      <span className={cn('rounded-full px-2 py-0.5 font-medium', ls.cls)}>{ls.label}</span>
                      {a.last_paid_plan && <span className="rounded-full border border-border px-2 py-0.5 font-medium">{a.last_paid_plan.split(' · ')[0]}</span>}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
          {shown.length === 0 && <p className="py-16 text-center text-sm text-muted-foreground">No athletes here.</p>}
        </div>
      )}
      <AthleteForm open={!!form} onOpenChange={(o) => !o && setForm(null)} mode={form || 'add'} onSaved={(id) => id && navigate(`/admin/athletes/${id}`)} />
    </div>
  );
}
