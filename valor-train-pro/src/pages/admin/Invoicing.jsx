import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Copy, ExternalLink, FileText, Loader2, Mail, Pause, Play, Plus, Receipt, Repeat, Search, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState, PageHeader, SegmentedTabs } from '@/components/vtp';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { EVERY, EVERY_SHORT, fmtTs, fmtYmd, invoicesApi, MODE, money, monthKey, monthLabel, PAID_HOW, SOURCE, STATUS, statusOf, TONE } from '@/lib/invoices';

export function StatusPill({ status, className }) {
  const s = STATUS[status] || STATUS.draft;
  return <span className={cn('shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold', TONE[s.tone], className)}>{s.label}</span>;
}

/** Coach Invoicing page: drafts, waiting, paid, and every payment in one list. Server: fn invoices. */
export default function AdminInvoicing() {
  const [params, setParams] = useSearchParams();
  const [d, setD] = useState(null);
  const tab = params.get('tab') || 'waiting';
  const setTab = (t) => setParams((p) => { p.set('tab', t); return p; }, { replace: true });
  const [open, setOpen] = useState(null); // invoice id
  const [openPay, setOpenPay] = useState(null); // a money row that isn't an invoice (autopay, drop-in): its receipt

  const load = () => invoicesApi('list').then(setD).catch((e) => setD({ error: e.message }));
  useEffect(() => { load(); }, []);

  if (!d) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (d.error) return <p className="text-sm text-destructive">{d.error}</p>;

  const inv = d.invoices;
  const drafts = inv.filter((i) => i.status === 'draft');
  const waiting = inv.filter((i) => i.status === 'open');
  const overdue = waiting.filter((i) => i.overdue);
  const thisMonth = monthKey(new Date());
  const paidThisMonth = d.money.filter((m) => m.status === 'paid' && monthKey(m.date) === thisMonth && !m.is_example).reduce((s, m) => s + m.amount_cents, 0);
  const current = open && inv.find((i) => i.id === open);

  return (
    <div className="space-y-5">
      <PageHeader title="Invoicing" subtitle="Bill anyone for anything, and see every payment in one place."
        action={<Button asChild><Link to="/admin/invoicing/new"><Plus className="h-4 w-4" /> New invoice</Link></Button>} />

      {!d.setting.live && (
        <Card className="border-warning-border"><CardContent className="flex gap-3 p-4 text-sm"><AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <div><b>Test version.</b> Invoices can only be sent to a test contact for now. You can make drafts for anyone.</div></CardContent></Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Waiting" value={money(waiting.reduce((s, i) => s + i.total_cents, 0))} sub={`${waiting.length} invoice${waiting.length === 1 ? '' : 's'}`} onClick={() => setTab('waiting')} />
        <Tile label="Overdue" value={String(overdue.length)} sub={overdue.length ? money(overdue.reduce((s, i) => s + i.total_cents, 0)) : 'none'} tone={overdue.length ? 'danger' : null} onClick={() => setTab('waiting')} />
        <Tile label={`Paid in ${monthLabel(thisMonth).split(' ')[0]}`} value={money(paidThisMonth)} sub="all payments" onClick={() => setTab('money')} />
      </div>

      <SegmentedTabs value={tab} onChange={setTab} options={[
        { value: 'drafts', label: `Drafts${drafts.length ? ` ${drafts.length}` : ''}` },
        { value: 'waiting', label: `Waiting${waiting.length ? ` ${waiting.length}` : ''}` },
        { value: 'paid', label: 'Paid' },
        { value: 'money', label: 'All money' },
        ...(d.repeats?.length || tab === 'repeats' ? [{ value: 'repeats', label: `Repeats${d.repeats?.length ? ` ${d.repeats.length}` : ''}` }] : []),
      ]} />

      {tab === 'repeats' ? <Repeats list={d.repeats || []} onChanged={load} /> : tab === 'money' || tab === 'paid' ? <AllMoney key={tab} money={d.money} paidOnly={tab === 'paid'} onOpen={setOpen} onOpenPay={setOpenPay} /> : (
        <InvoiceList list={tab === 'drafts' ? drafts : waiting} tab={tab} onOpen={setOpen} />
      )}

      <ReceiptDialog row={openPay} onClose={() => setOpenPay(null)} />
      <InvoiceDialog inv={current} canRefund={d.can_refund} live={d.setting.live} onClose={() => setOpen(null)} onChanged={load} />
    </div>
  );
}

function Tile({ label, value, sub, tone, onClick }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl border border-border bg-card p-3 text-left hover:border-primary/50">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-display text-2xl', tone === 'danger' && 'text-danger')}>{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </button>
  );
}

function InvoiceList({ list, tab, onOpen }) {
  if (!list.length) {
    return <EmptyState icon={Receipt} title={tab === 'drafts' ? 'No drafts' : tab === 'waiting' ? 'Nothing waiting' : 'Nothing paid yet'}
      message={tab === 'drafts' ? 'Invoices you save without sending show up here.' : tab === 'waiting' ? 'Sent invoices that haven\'t been paid show up here.' : 'Paid and voided invoices show up here.'}
      actionLabel="New invoice" to="/admin/invoicing/new" />;
  }
  return (
    <div className="space-y-2">
      {list.map((i) => {
        const st = statusOf(i);
        return (
          <button key={i.id} type="button" onClick={() => onOpen(i.id)} className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left hover:border-primary/50">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{i.contact?.name}{i.contact?.is_example && <span className="ml-2 text-xs font-normal text-muted-foreground">test</span>}{(i.repeat_id || i.repeat_plan?.every) && <Repeat className="ml-1.5 inline h-3.5 w-3.5 text-muted-foreground" aria-label="Repeats" />}</p>
              <p className="truncate text-xs text-muted-foreground">{i.lines.map((l) => l.description).join(', ')}</p>
              <p className={cn('text-xs', st === 'overdue' ? 'font-semibold text-danger' : 'text-muted-foreground')}>
                {i.status === 'paid' ? `Paid ${fmtTs(i.paid_at)}${i.paid_outside ? ` · ${PAID_HOW[i.paid_outside]}` : ''}` : i.status === 'void' ? `Voided ${fmtTs(i.voided_at)}` : st === 'overdue' ? `Was due ${fmtYmd(i.due_date)}` : `Due ${fmtYmd(i.due_date)}`}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="font-display text-lg">{money(i.total_cents)}</span>
              <StatusPill status={st} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

// Paid tab = the same list, only money that came in (invoices, autopay, drop-ins, cash/Venmo), refunds shown struck through.
function AllMoney({ money: all, paidOnly, onOpen, onOpenPay }) {
  const rows = paidOnly ? all.filter((r) => r.status === 'paid' || r.status === 'refunded') : all;
  const [month, setMonth] = useState(monthKey(new Date()));
  const [q, setQ] = useState('');
  const months = useMemo(() => [...new Set(rows.map((r) => monthKey(r.date)))].sort().reverse(), [rows]);
  const term = q.trim().toLowerCase();
  const shown = rows.filter((r) => (month === 'all' || monthKey(r.date) === month) && (!term || `${r.who} ${r.what}`.toLowerCase().includes(term)));
  const paidTotal = shown.filter((r) => r.status === 'paid').reduce((s, r) => s + r.amount_cents, 0);
  const waitingTotal = shown.filter((r) => r.status === 'waiting' || r.status === 'overdue').reduce((s, r) => s + r.amount_cents, 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            {!months.includes(monthKey(new Date())) && <SelectItem value={monthKey(new Date())}>{monthLabel(monthKey(new Date()))}</SelectItem>}
            {months.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}
            <SelectItem value="all">All months</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name" className="pl-9" />
        </div>
      </div>
      <p className="text-sm text-muted-foreground"><b className="text-foreground">{money(paidTotal)}</b> paid{waitingTotal ? <> · <b className="text-foreground">{money(waitingTotal)}</b> waiting</> : null} · {shown.length} item{shown.length === 1 ? '' : 's'}</p>
      {!shown.length ? <p className="py-8 text-center text-sm text-muted-foreground">{paidOnly ? 'Nothing paid' : 'Nothing'} for {month === 'all' ? 'this search' : monthLabel(month)}.</p> : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {shown.map((r) => (
            <button key={r.id} type="button" onClick={() => (r.invoice_id ? onOpen(r.invoice_id) : onOpenPay(r))}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent">
              <div className="w-12 shrink-0 text-xs text-muted-foreground">{fmtTs(r.date)}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{r.who}{r.is_example && <span className="ml-2 text-xs font-normal text-muted-foreground">test</span>}</p>
                <p className="truncate text-xs text-muted-foreground">{SOURCE[r.source]}{r.method && r.method !== 'card' ? ` · ${PAID_HOW[r.method] || r.method}` : ''}{r.what ? ` · ${r.what}` : ''}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={cn('text-sm font-semibold', (r.status === 'voided' || r.status === 'refunded') && 'text-muted-foreground line-through')}>{money(r.amount_cents)}</span>
                {r.status !== 'paid' && <StatusPill status={r.status} />}
              </div>
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Autopay months, drop-ins and packs, and cash or Venmo a coach recorded are here too. Tap any one for Stripe's receipt and invoice PDF.</p>
    </div>
  );
}

function InvoiceDialog({ inv, canRefund, live, onClose, onChanged }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(null); // 'void' | 'refund' | 'delete' | 'paid'
  const [how, setHow] = useState('cash');
  const [note, setNote] = useState('');
  useEffect(() => { setConfirm(null); setHow('cash'); setNote(''); }, [inv?.id]);
  if (!inv) return null;
  const st = statusOf(inv);
  const canSend = live || inv.contact?.is_example;

  const run = async (action, extra, done) => {
    setBusy(action);
    try { const r = await invoicesApi(action, { id: inv.id, ...extra }); toast({ title: done(r) }); setConfirm(null); await onChanged(); if (action === 'delete_draft') onClose(); }
    catch (e) { toast({ title: 'That didn\'t work', description: e.message }); }
    finally { setBusy(''); }
  };
  const copyLink = async () => { try { await navigator.clipboard.writeText(inv.hosted_url); toast({ title: 'Pay link copied', description: 'Paste it in a text to them.' }); } catch { toast({ title: inv.hosted_url }); } };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2">{inv.contact?.name} <StatusPill status={st} /></DialogTitle></DialogHeader>
        <p className="-mt-2 text-sm text-muted-foreground">{inv.contact?.email}{inv.stripe_number ? ` · ${inv.stripe_number}` : ''}</p>

        <div className="divide-y divide-border rounded-xl border border-border">
          {inv.lines.map((l) => (
            <div key={l.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
              <div><p>{l.description}</p>{Number(l.quantity) !== 1 && <p className="text-xs text-muted-foreground">{Number(l.quantity)} × {money(l.unit_cents)}</p>}</div>
              <span className="font-semibold">{money(l.amount_cents)}</span>
            </div>
          ))}
          <div className="flex justify-between px-3 py-2 font-semibold"><span>Total</span><span>{money(inv.total_cents)}</span></div>
        </div>
        <div className="space-y-1 text-sm">
          <p><span className="text-muted-foreground">Due:</span> {fmtYmd(inv.due_date, true)}</p>
          {inv.sent_at && <p><span className="text-muted-foreground">Sent:</span> {fmtTs(inv.sent_at)}</p>}
          {inv.paid_at && <p><span className="text-muted-foreground">Paid:</span> {fmtTs(inv.paid_at)} · {PAID_HOW[inv.paid_outside] || 'Card'}</p>}
          {inv.refunded_cents > 0 && <p><span className="text-muted-foreground">Refunded:</span> {money(inv.refunded_cents)}</p>}
          {inv.memo && <p><span className="text-muted-foreground">Note:</span> {inv.memo}</p>}
        </div>

        {confirm === 'paid' ? (
          <div className="space-y-2 rounded-xl border border-border p-3">
            <p className="text-sm font-semibold">How did they pay?</p>
            <div className="flex flex-wrap gap-2">{['cash', 'venmo', 'check', 'other'].map((m) => <Button key={m} size="sm" variant={how === m ? 'default' : 'outline'} onClick={() => setHow(m)}>{PAID_HOW[m]}</Button>)}</div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" rows={2} />
            <div className="flex gap-2"><Button disabled={!!busy} onClick={() => run('mark_paid', { method: how, note }, () => 'Marked paid')}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Mark paid</Button><Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button></div>
          </div>
        ) : confirm ? (
          <div className="space-y-2 rounded-xl border border-danger-border bg-danger-surface p-3 text-sm">
            <p className="font-semibold text-danger">{confirm === 'void' ? 'Void this invoice? The pay link stops working. This can\'t be undone.' : confirm === 'refund' ? `Refund ${money(inv.total_cents)} to their card? This can't be undone.` : 'Delete this draft?'}</p>
            <div className="flex gap-2">
              <Button variant="destructive" disabled={!!busy} onClick={() => confirm === 'void' ? run('void', {}, () => 'Invoice voided') : confirm === 'refund' ? run('refund', {}, (r) => `Refunded ${money(r.amount_cents)}`) : run('delete_draft', {}, () => 'Draft deleted')}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{confirm === 'void' ? 'Yes, void it' : confirm === 'refund' ? 'Yes, refund' : 'Yes, delete'}
              </Button>
              <Button variant="ghost" onClick={() => setConfirm(null)}>Keep it</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {inv.status === 'draft' && <>
              <Button onClick={() => navigate(`/admin/invoicing/${inv.id}/edit?step=review`)} disabled={!canSend}><Mail className="h-4 w-4" />Review and send</Button>
              <Button variant="outline" onClick={() => navigate(`/admin/invoicing/${inv.id}/edit`)}>Edit</Button>
              <Button variant="outline" onClick={() => setConfirm('paid')}>They paid already</Button>
              <Button variant="ghost" className="text-danger" onClick={() => setConfirm('delete')}>Delete draft</Button>
              {!canSend && <p className="w-full text-xs text-muted-foreground">Sending is off in the test version for anyone but a test contact.</p>}
            </>}
            {inv.status === 'open' && <>
              <Button onClick={copyLink}><Copy className="h-4 w-4" />Copy pay link</Button>
              <Button variant="outline" disabled={!!busy || !canSend} onClick={() => run('resend', {}, (r) => `Sent again to ${r.to}`)}>{busy === 'resend' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Resend</Button>
              {inv.pdf_url && <Button variant="outline" asChild><a href={inv.pdf_url} target="_blank" rel="noreferrer"><FileText className="h-4 w-4" />PDF</a></Button>}
              <Button variant="outline" onClick={() => setConfirm('paid')}>Paid with cash or Venmo</Button>
              <Button variant="ghost" className="text-danger" onClick={() => setConfirm('void')}>Void</Button>
            </>}
            {inv.status === 'paid' && <>
              <ReceiptLinks query={{ invoice_id: inv.id }} />
              {canRefund && !inv.paid_outside && !inv.refunded_cents && <Button variant="ghost" className="text-danger" onClick={() => setConfirm('refund')}>Refund</Button>}
            </>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Stripe's receipt + invoice PDF for one paid item, looked up when it's opened (for filing). */
function ReceiptLinks({ query }) {
  const [r, setR] = useState(null);
  const k = JSON.stringify(query);
  useEffect(() => { setR(null); invoicesApi('receipt', query).then(setR).catch((e) => setR({ error: e.message })); }, [k]);
  if (!r) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Getting the receipt from Stripe</p>;
  if (r.error) return <p className="text-sm text-destructive">{r.error}</p>;
  return (
    <div className="flex w-full flex-wrap gap-2">
      {r.receipt_url && <Button variant="outline" asChild><a href={r.receipt_url} target="_blank" rel="noreferrer"><Receipt className="h-4 w-4" />Receipt</a></Button>}
      {r.pdf_url && <Button variant="outline" asChild><a href={r.pdf_url} target="_blank" rel="noreferrer"><FileText className="h-4 w-4" />Invoice PDF</a></Button>}
      {r.invoice_url && <Button variant="ghost" asChild><a href={r.invoice_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Stripe page</a></Button>}
      {r.note && <p className="w-full text-xs text-muted-foreground">{r.note}</p>}
    </div>
  );
}

function ReceiptDialog({ row, onClose }) {
  if (!row) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{row.who || 'Payment'}</DialogTitle></DialogHeader>
        <div className="space-y-1 text-sm">
          <p className="font-display text-2xl">{money(row.amount_cents)}</p>
          <p className="text-muted-foreground">{SOURCE[row.source]}{row.what ? ` · ${row.what}` : ''}</p>
          <p><span className="text-muted-foreground">Paid:</span> {fmtTs(row.date)} · {PAID_HOW[row.method] || row.method || 'Card'}</p>
          {row.note && <p><span className="text-muted-foreground">Note:</span> {row.note}</p>}
        </div>
        <ReceiptLinks query={{ payment_id: row.payment_id }} />
      </DialogContent>
    </Dialog>
  );
}

function Repeats({ list, onChanged }) {
  const [busy, setBusy] = useState('');
  const [stopping, setStopping] = useState(null);
  const act = async (r, action, extra, msg) => {
    setBusy(r.id + action);
    try { const x = await invoicesApi(action, { id: r.id, ...extra }); toast({ title: msg(x) }); setStopping(null); await onChanged(); }
    catch (e) { toast({ title: 'That didn\'t work', description: e.message }); }
    finally { setBusy(''); }
  };
  if (!list.length) return <EmptyState icon={Repeat} title="No repeating invoices" message="When you make an invoice, pick Every week or Every month on the due date step." actionLabel="New invoice" to="/admin/invoicing/new" />;
  return (
    <div className="space-y-2">
      {list.map((r) => (
        <div key={r.id} className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{r.contact?.name}{r.contact?.is_example && <span className="ml-2 text-xs font-normal text-muted-foreground">test</span>}</p>
              <p className="text-xs text-muted-foreground">{EVERY[r.every]} · {MODE[r.mode]}{r.end_date ? ` · until ${fmtYmd(r.end_date)}` : ''}</p>
              <p className="text-xs">{r.status === 'paused' ? <span className="font-semibold text-warning">Paused</span> : <>Next: <b>{fmtYmd(r.next_date)}</b></>}{r.made ? ` · ${r.made} made so far` : ''}</p>
              {r.last_note && <p className="mt-1 text-xs text-muted-foreground">Last time: {r.last_note}</p>}
            </div>
            <span className="font-display text-lg">{r.mode === 'booked' ? 'Booked days' : money(r.total_cents)}</span>
          </div>
          {stopping === r.id ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-danger-border bg-danger-surface p-2 text-sm">
              <span className="font-semibold text-danger">Stop this repeat? Invoices already sent stay as they are.</span>
              <Button size="sm" variant="destructive" disabled={!!busy} onClick={() => act(r, 'repeat_set', { status: 'stopped' }, () => 'Repeat stopped')}>Yes, stop it</Button>
              <Button size="sm" variant="ghost" onClick={() => setStopping(null)}>Keep it</Button>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {r.status === 'active' && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act(r, 'repeat_now', {}, (x) => x.sent ? 'Sent the next one' : x.invoice_id ? 'Made a draft, it\'s under Drafts' : (x.note || 'Nothing to make'))}>
                {busy === r.id + 'repeat_now' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Make the next one now</Button>}
              {r.status === 'active'
                ? <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act(r, 'repeat_set', { status: 'paused' }, () => 'Paused')}><Pause className="h-4 w-4" />Pause</Button>
                : <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act(r, 'repeat_set', { status: 'active' }, (x) => `Resumed, next one ${fmtYmd(x.next_date)}`)}><Play className="h-4 w-4" />Resume</Button>}
              <Button size="sm" variant="ghost" className="text-danger" onClick={() => setStopping(r.id)}><Square className="h-4 w-4" />Stop</Button>
            </div>
          )}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Each repeat is a new invoice with its own pay link, so it shows under Waiting and Paid like any other.</p>
    </div>
  );
}
