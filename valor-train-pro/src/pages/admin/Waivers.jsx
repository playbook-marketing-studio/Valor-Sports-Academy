import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Copy, Loader2, Mail, Plus, QrCode, Search } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { callFn, supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, SegmentedTabs } from '@/components/vtp';
import { toast } from '@/components/ui/use-toast';
import { fmtDate } from '@/components/waiver/Waiver';
import { WaiverCopyDialog } from '@/components/waiver/WaiverDialogs';
import { cn } from '@/lib/utils';

const REQUIRED = {
  prompt: 'Ask each time they open the app',
  block: 'Lock the app until they sign',
  off: "Don't ask in the app",
};

/** Who has signed, who hasn't, resend, front-desk QR, signed copies. Server: fn waiver (list/send/sign_link/copy/setting). */
export default function AdminWaivers() {
  const [d, setD] = useState(null);
  const [stage, setStage] = useState({});
  const [tab, setTab] = useState('todo');
  const [scope, setScope] = useState('enrolled');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [qr, setQr] = useState(null);       // { name, url }
  const [copy, setCopy] = useState(null);   // signature id

  const load = () => Promise.all([
    callFn('waiver', { body: { action: 'list' } }),
    supabase.from('athletes_admin').select('id, stage'),
  ]).then(([r, { data }]) => { setD(r); setStage(Object.fromEntries((data || []).map((x) => [x.id, x.stage]))); })
    .catch((e) => setD({ error: e.message }));
  useEffect(() => { load(); }, []);

  if (!d) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (d.error) return <p className="text-sm text-destructive">{d.error}</p>;

  const term = q.trim().toLowerCase();
  const inScope = d.athletes.filter((a) => scope === 'all' || stage[a.id] === 'enrolled' || a.is_example);
  const signed = inScope.filter((a) => a.signature);
  const shown = inScope
    .filter((a) => (tab === 'todo' ? !a.signature : tab === 'done' ? !!a.signature : true))
    .filter((a) => !term || [a.name, a.parent_name, a.email].join(' ').toLowerCase().includes(term));

  const send = async (a) => {
    setBusy(a.id);
    try { const r = await callFn('waiver', { body: { action: 'send', athlete_id: a.id } }); toast({ title: 'Waiver email sent', description: `Sent to ${r.to}.` }); load(); }
    catch (e) { toast({ title: 'Could not send', description: e.message }); }
    finally { setBusy(''); }
  };
  const showQr = async (a) => {
    setBusy(`qr${a.id}`);
    try { const r = await callFn('waiver', { body: { action: 'sign_link', athlete_id: a.id } }); setQr({ name: a.name, url: r.url }); }
    catch (e) { toast({ title: 'Could not make the link', description: e.message }); }
    finally { setBusy(''); }
  };
  const setRequired = async (required) => {
    try { await callFn('waiver', { body: { action: 'setting', required } }); setD((x) => ({ ...x, setting: { ...x.setting, required } })); toast({ title: 'Saved' }); }
    catch (e) { toast({ title: 'Could not save', description: e.message }); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Waivers" subtitle="Every athlete needs a signed waiver on file. Families sign in the app, from the emailed link, or by scanning a QR code at the desk." />

      {!d.setting.version && (
        <Card><CardContent className="flex gap-3 p-4 text-sm"><AlertTriangle className="h-5 w-5 shrink-0 text-warning" />The waiver isn't switched on yet. Nobody is asked to sign until it is.</CardContent></Card>
      )}
      {d.waiver?.status === 'draft' && (
        <Card className="border-yellow-400"><CardContent className="flex gap-3 p-4 text-sm"><AlertTriangle className="h-5 w-5 shrink-0 text-yellow-600" />
          <div><b>Preview.</b> Two spots in sections 3 and 4 came through mixed up in the copy we got. They're highlighted on the waiver until Michael confirms the wording.</div></CardContent></Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Signed</p><p className="font-display text-3xl">{signed.length}<span className="text-base text-muted-foreground"> / {inScope.length}</span></p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Still need to sign</p><p className="font-display text-3xl">{inScope.length - signed.length}</p></CardContent></Card>
        <Card className="col-span-2 sm:col-span-1"><CardContent className="space-y-1.5 p-4">
          <p className="text-xs text-muted-foreground">If a family hasn't signed</p>
          <Select value={REQUIRED[d.setting.required] ? d.setting.required : 'prompt'} onValueChange={setRequired}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(REQUIRED).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">{d.setting.required === 'block' ? 'Account and payments still stay open.' : 'They can tap Not now and still use everything, payments included.'} New sign-ups always sign first.</p>
        </CardContent></Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedTabs value={tab} onChange={setTab} options={[{ value: 'todo', label: 'Needs a signature' }, { value: 'done', label: 'Signed' }, { value: 'all', label: 'All' }, { value: 'teams', label: `Teams${d.team_signatures?.length ? ` ${d.team_signatures.length}` : ''}` }]} />
        {tab !== 'teams' && <div className="flex gap-2">
          <SegmentedTabs value={scope} onChange={setScope} options={[{ value: 'enrolled', label: 'Training now' }, { value: 'all', label: 'Everyone' }]} />
        </div>}
      </div>
      {tab === 'teams' ? <TeamWaivers d={d} reload={load} onQr={setQr} onCopy={setCopy} /> : <>
      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search athlete or parent" className="pl-9" /></div>

      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {shown.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">{tab === 'todo' ? 'Everyone here has signed.' : 'Nobody here yet.'}</p>}
        {shown.map((a) => (
          <div key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold"><Link to={`/admin/athletes/${a.id}`} className="hover:underline">{a.name}</Link>{a.is_example && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">Example</span>}</p>
              <p className="truncate text-xs text-muted-foreground">{a.parent_name || 'No parent name'} · {a.email || 'no email on file'}</p>
              <p className={cn('mt-1 text-xs', a.signature ? 'text-success' : 'text-warning')}>
                {a.signature
                  ? `Signed ${fmtDate(a.signature.signed_at)} by ${a.signature.signer_name}${a.signature.method === 'link' ? ' (link)' : ''}`
                  : a.last_sent ? `Not signed · emailed ${fmtDate(a.last_sent.sent_at)}${a.sent_count > 1 ? ` (${a.sent_count} times)` : ''}` : 'Not signed · not emailed yet'}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {a.signature ? (
                <Button variant="outline" size="sm" onClick={() => setCopy(a.signature.id)}>View copy</Button>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => showQr(a)} disabled={busy === `qr${a.id}`}>{busy === `qr${a.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <><QrCode className="mr-1.5 h-4 w-4" />QR</>}</Button>
                  <Button size="sm" onClick={() => send(a)} disabled={!a.email || busy === a.id} title={a.email ? '' : 'No email on file'}>{busy === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Mail className="mr-1.5 h-4 w-4" />{a.last_sent ? 'Resend' : 'Email link'}</>}</Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      </>}

      <Dialog open={!!qr} onOpenChange={(o) => !o && setQr(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{qr?.team ? `${qr.name} team link` : `${qr?.name}'s waiver`}</DialogTitle></DialogHeader>
          {qr && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="rounded-2xl bg-white p-4 shadow"><QRCodeSVG value={qr.url} size={240} level="M" /></div>
              <p className="text-sm">{qr.team ? 'Text this link to the team, or print the QR for the door. Each parent types their athlete\'s name and signs. No login needed.' : 'Have the parent scan this with their phone camera and sign. No login needed.'}</p>
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard?.writeText(qr.url); toast({ title: 'Link copied' }); }}><Copy className="mr-1.5 h-4 w-4" />Copy link</Button>
              <p className="text-[11px] text-muted-foreground">{qr.team ? "One link for the whole team. It works until you turn it off. Nothing checks who signs, so anyone with the link can fill it out." : 'The link works for 60 days and only for this athlete.'}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <WaiverCopyDialog signatureId={copy} onClose={() => setCopy(null)} staff />
    </div>
  );
}

/** Team sign links (outside teams whose kids aren't in the app) and the signatures that came in through them. */
function TeamWaivers({ d, reload, onQr, onCopy }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const [q, setQ] = useState('');
  const [team, setTeam] = useState('all');
  const add = async () => {
    setBusy('add');
    try { const r = await callFn('waiver', { body: { action: 'team_add', name } }); setName(''); await reload(); onQr({ name: name.trim(), url: r.url, team: true }); }
    catch (e) { toast({ title: 'Could not make the link', description: e.message }); } finally { setBusy(''); }
  };
  const toggle = async (t) => {
    setBusy(t.id);
    try { await callFn('waiver', { body: { action: 'team_set', team_id: t.id, active: !t.active } }); toast({ title: t.active ? `${t.name} link turned off` : `${t.name} link is on again` }); await reload(); }
    catch (e) { toast({ title: 'That didn\'t work', description: e.message }); } finally { setBusy(''); }
  };
  const term = q.trim().toLowerCase();
  const sigs = (d.team_signatures || []).filter((x) => (team === 'all' || x.team_id === team) && (!term || `${x.athlete_name} ${x.signer_name} ${x.team}`.toLowerCase().includes(term)));
  return (
    <div className="space-y-4">
      <Card><CardContent className="space-y-3 p-4">
        <p className="text-sm">For teams that use the gym but aren't in the app, like the Maniacs. Make one link per team, then text it to them or put the QR at the door. Each parent types their athlete's name and signs. No login needed.</p>
        <p className="flex gap-2 rounded-lg border border-warning-border bg-warning-surface p-2.5 text-xs text-warning"><AlertTriangle className="h-4 w-4 shrink-0" />Nothing checks who signs a team link. Anyone with the link can fill it out, so these show as not verified.</p>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" onKeyDown={(e) => { if (e.key === 'Enter' && name.trim().length > 1) add(); }} />
          <Button onClick={add} disabled={name.trim().length < 2 || busy === 'add'}>{busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1.5 h-4 w-4" />Make link</>}</Button>
        </div>
        {(d.teams || []).length > 0 && (
          <div className="divide-y divide-border rounded-xl border border-border">
            {d.teams.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t.name}{!t.active && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">Off</span>}</p>
                  <p className="text-xs text-muted-foreground">{t.signed} signed</p>
                </div>
                {t.active && <Button variant="outline" size="sm" onClick={() => onQr({ name: t.name, url: t.url, team: true })}><QrCode className="mr-1.5 h-4 w-4" />QR / link</Button>}
                <Button variant="ghost" size="sm" disabled={busy === t.id} onClick={() => toggle(t)}>{busy === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : t.active ? 'Turn off' : 'Turn on'}</Button>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>

      <div className="flex flex-col gap-2 sm:flex-row">
        {(d.teams || []).length > 1 && (
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All teams</SelectItem>{d.teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Check a name at the door" className="pl-9" /></div>
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {sigs.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">{term ? 'No team waiver with that name.' : 'No team waivers signed yet.'}</p>}
        {sigs.map((x) => (
          <div key={x.id} className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{x.athlete_name} <span className="text-xs font-normal text-muted-foreground">· {x.team}</span></p>
              <p className="truncate text-xs text-muted-foreground">Signed {fmtDate(x.signed_at)} by {x.signer_name}{x.signer_role === 'athlete' ? ' (the athlete)' : ''} · {x.signer_email}</p>
              <p className="mt-1"><span className="rounded-full border border-warning-border bg-warning-surface px-2 py-0.5 text-[11px] font-semibold text-warning">Not verified · team link</span></p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onCopy(x.id)}>View copy</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
