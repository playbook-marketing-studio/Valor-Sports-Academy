import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { assignProgram, mondayOf, nextMonday, weekdayName } from '@/lib/programs';
import { athleteName } from '@/lib/valor';

/** Put one or more athletes on a program from a start Monday. Pass `template` or let staff pick one; pass `athleteIds` to preselect. */
export default function AssignProgramDialog({ open, onOpenChange, template: fixedTemplate = null, athleteIds = [], onDone }) {
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [athletes, setAthletes] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [start, setStart] = useState(nextMonday());
  const [overrides, setOverrides] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPicked(new Set(athleteIds)); setStart(nextMonday()); setOverrides({});
    setTemplateId(fixedTemplate?.id || '');
    supabase.from('program_templates').select('*').order('created_at').then(({ data }) => setTemplates(data || []));
    supabase.from('athletes').select('id, first_name, last_name, season, sport, archived_at').is('archived_at', null).order('first_name').then(({ data }) => setAthletes(data || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const template = fixedTemplate || templates.find((t) => t.id === templateId);
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const shown = athletes.filter((a) => !template?.season || !a.season || a.season === template.season || picked.has(a.id));

  const go = async () => {
    if (!template || !picked.size) return;
    setBusy(true);
    try {
      const monday = mondayOf(start);
      const r = await assignProgram(template, [...picked], monday, overrides);
      toast({ title: `${r.assigned} athlete${r.assigned === 1 ? '' : 's'} on ${template.name}`, description: `${template.weeks} weeks from ${new Date(monday + 'T12:00:00').toLocaleDateString()}${r.skipped ? ` · ${r.skipped} already on it` : ''}.` });
      onOpenChange(false); onDone?.();
    } catch (e) { toast({ title: 'Could not assign', description: e.message }); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Assign a program</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {!fixedTemplate && (
            <div className="space-y-1">
              <Label htmlFor="ap-t">Program</Label>
              <select id="ap-t" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
                <option value="">Pick a program</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="ap-s">Week 1 starts</Label><Input id="ap-s" type="date" value={start} onChange={(e) => setStart(e.target.value)} /><p className="text-[11px] text-muted-foreground">Snaps to that week's Monday.</p></div>
            {template && template.days.map((d) => (
              <div key={d.key} className="space-y-1">
                <Label htmlFor={`ap-${d.key}`}>{d.label} on</Label>
                <select id={`ap-${d.key}`} value={overrides[d.key] || d.weekday} onChange={(e) => setOverrides({ ...overrides, [d.key]: Number(e.target.value) })} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
                  {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{weekdayName(n)}</option>)}
                </select>
              </div>
            ))}
          </div>
          {!athleteIds.length || athleteIds.length > 1 || athletes.length ? (
            <div className="space-y-1">
              <Label>Athletes {template?.season ? <span className="font-normal text-muted-foreground">({template.season === 'in_season' ? 'in-season' : 'off-season'} and unset shown)</span> : null}</Label>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                {shown.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                    <input type="checkbox" checked={picked.has(a.id)} onChange={() => toggle(a.id)} />
                    {athleteName(a)} <span className="text-xs text-muted-foreground">{[a.sport, a.season === 'in_season' ? 'in-season' : a.season === 'off_season' ? 'off-season' : ''].filter(Boolean).join(' · ')}</span>
                  </label>
                ))}
                {!shown.length && <p className="p-2 text-xs text-muted-foreground">No athletes yet.</p>}
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter><Button onClick={go} disabled={busy || !template || !picked.size}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Assign to ${picked.size}`}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
