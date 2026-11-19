import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Copy, Loader2, Mail, QrCode, Search } from 'lucide-react';
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
  screen: 'Sign screen on their next login',
  banner: 'Reminder on Home only',
  off: 'Nothing in the app',
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

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Signed</p><p className="font-display text-3xl">{signed.length}<span className="text-base text-muted-foreground"> / {inScope.length}</span></p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Still need to sign</p><p className="font-display text-3xl">{inScope.length - signed.length}</p></CardContent></Card>
        <Card><CardContent className="space-y-1.5 p-4">
          <p className="text-xs text-muted-foreground">If a family hasn't signed</p>
          <Select value={d.setting.required} onValueChange={setRequired}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(REQUIRED).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">Account and payments always stay open.</p>
        </CardContent></Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedTabs value={tab} onChange={setTab} options={[{ value: 'todo', label: 'Needs a signature' }, { value: 'done', label: 'Signed' }, { value: 'all', label: 'All' }]} />
        <div className="flex gap-2">
          <SegmentedTabs value={scope} onChange={setScope} options={[{ value: 'enrolled', label: 'Training now' }, { value: 'all', label: 'Everyone' }]} />
        </div>
      </div>
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

      <Dialog open={!!qr} onOpenChange={(o) => !o && setQr(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{qr?.name}'s waiver</DialogTitle></DialogHeader>
          {qr && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="rounded-2xl bg-white p-4 shadow"><QRCodeSVG value={qr.url} size={240} level="M" /></div>
              <p className="text-sm">Have the parent scan this with their phone camera and sign. No login needed.</p>
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard?.writeText(qr.url); toast({ title: 'Link copied' }); }}><Copy className="mr-1.5 h-4 w-4" />Copy link</Button>
              <p className="text-[11px] text-muted-foreground">The link works for 60 days and only for this athlete.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <WaiverCopyDialog signatureId={copy} onClose={() => setCopy(null)} staff />
    </div>
  );
}
