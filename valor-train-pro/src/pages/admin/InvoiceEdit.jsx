import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, Check, Loader2, Plus, Search, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { addDays, EVERY, EVERY_SHORT, fmtYmd, invoicesApi, money, nextRepeat, todayYmd } from '@/lib/invoices';

const STEPS = ['Who', 'What', 'When', 'Review'];
const blankLine = () => ({ key: crypto.randomUUID(), description: '', quantity: '1', price: '', block_id: null });
const toCents = (s) => Math.round(Number(String(s).replace(/[$,\s]/g, '')) * 100);
const lineCents = (l) => Math.round((Number(l.quantity) || 0) * (toCents(l.price) || 0));

/** New invoice / edit a draft, one step at a time (made for a phone). Server: fn invoices. */
export default function InvoiceEdit() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [step, setStep] = useState(0);
  const [who, setWho] = useState(null);      // a row from people
  const [lines, setLines] = useState([blankLine()]);
  const [due, setDue] = useState('');
  const [memo, setMemo] = useState('');
  const [bank, setBank] = useState(true);
  const [repeat, setRepeat] = useState({ every: '', mode: 'send', end_date: '' }); // every '' = just once   // bank transfer (ACH) on this invoice, when Omar has it switched on
  const [busy, setBusy] = useState('');
  const [draftId, setDraftId] = useState(id || null);

  useEffect(() => {
    invoicesApi('list').then((r) => {
      setD(r);
      setDue(addDays(todayYmd(), r.setting.due_days || 7));
      if (id) {
        const inv = r.invoices.find((x) => x.id === id);
        if (!inv || inv.status !== 'draft') { toast({ title: 'That draft was already sent' }); navigate('/admin/invoicing', { replace: true }); return; }
        setWho(r.people.find((p) => p.contact_id === inv.contact_id) || { key: `c:${inv.contact_id}`, contact_id: inv.contact_id, name: inv.contact?.name, email: inv.contact?.email, renter: !!inv.contact?.renter_id, is_example: inv.contact?.is_example });
        setLines(inv.lines.map((l) => ({ key: l.id, description: l.description, quantity: String(Number(l.quantity)), price: (l.unit_cents / 100).toFixed(2), block_id: l.block_id })));
        setDue(inv.due_date < todayYmd() ? addDays(todayYmd(), r.setting.due_days || 7) : inv.due_date);
        setMemo(inv.memo || '');
        setBank((inv.pay_methods || []).includes('us_bank_account'));
        if (inv.repeat_plan?.every) setRepeat({ every: inv.repeat_plan.every, mode: inv.repeat_plan.mode || 'send', end_date: inv.repeat_plan.end_date || '' });
        setStep(params.get('step') === 'review' ? 3 : 1);
      }
    }).catch((e) => setD({ error: e.message }));
  }, [id]);

  const total = lines.reduce((s, l) => s + lineCents(l), 0);
  if (!d) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (d.error) return <p className="text-sm text-destructive">{d.error}</p>;

  const linesOk = lines.length > 0 && lines.every((l) => l.description.trim() && Number(l.quantity) > 0 && toCents(l.price) >= 0 && l.price !== '') && total >= 50;
  const canSend = d.setting.live || who?.is_example;
  const payload = () => ({
    id: draftId || undefined,
    ...(who.contact_id ? { contact_id: who.contact_id } : { person: who.person }),
    lines: lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unit_cents: toCents(l.price), block_id: l.block_id })),
    due_date: due, memo, pay_methods: d.setting.bank_enabled && bank ? ['card', 'us_bank_account'] : ['card'],
    repeat: repeat.every ? { every: repeat.every, mode: repeat.mode === 'booked' && !who.renter ? 'send' : repeat.mode, end_date: repeat.end_date || null } : null,
  });
  const saveDraft = async (quiet) => {
    const r = await invoicesApi('save', payload());
    setDraftId(r.id);
    if (!quiet) toast({ title: 'Draft saved', description: 'Find it under Drafts on the Invoicing page.' });
    return r.id;
  };
  const onSave = async () => {
    setBusy('save');
    try { await saveDraft(false); navigate('/admin/invoicing?tab=drafts'); } catch (e) { toast({ title: 'Could not save', description: e.message }); } finally { setBusy(''); }
  };
  const onSend = async () => {
    setBusy('send');
    try {
      const saved = await saveDraft(true);
      const r = await invoicesApi('send', { id: saved });
      toast({ title: 'Invoice sent', description: `Stripe emailed ${r.to} a link to pay.${r.repeat ? ` The next one is ${fmtYmd(r.repeat.next_date)}.` : ''}` });
      navigate('/admin/invoicing?tab=waiting');
    } catch (e) { toast({ title: 'Not sent', description: e.message }); } finally { setBusy(''); }
  };
  const next = () => setStep((s) => Math.min(3, s + 1));
  const repeatNext = repeat.every ? nextRepeat(todayYmd(), repeat.every) : null;
  const repeatOk = !repeat.every || !repeat.end_date || repeat.end_date > todayYmd();
  const nextOk = step === 0 ? !!who : step === 1 ? linesOk : step === 2 ? due >= todayYmd() && repeatOk : true;

  return (
    <div className="mx-auto max-w-xl space-y-5 pb-44 lg:pb-28">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Back" onClick={() => (step ? setStep(step - 1) : navigate('/admin/invoicing'))}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{id ? 'Edit draft' : 'New invoice'} · Step {step + 1} of 4</p>
          <h1 className="font-display text-2xl">{['Who is it for?', 'What is it for?', 'When is it due?', 'Check it, then send'][step]}</h1>
        </div>
      </div>
      <div className="flex gap-1.5">{STEPS.map((s, i) => <div key={s} className={cn('h-1.5 flex-1 rounded-full', i <= step ? 'bg-primary' : 'bg-muted')} />)}</div>

      {step === 0 && <PickPerson people={d.people} value={who} onPick={(p) => { setWho(p); setLines((ls) => ls.filter((l) => !l.block_id || p.contact_id === who?.contact_id)); next(); }} onAdded={(p) => setD((x) => ({ ...x, people: [p, ...x.people] }))} />}

      {step === 1 && (
        <div className="space-y-3">
          {who?.renter && <BookedDays who={who} lines={lines} onAdd={(add) => setLines((ls) => [...ls.filter((l) => l.description.trim() || l.price), ...add])} ensureContact={async () => who.contact_id} />}
          {lines.map((l, i) => (
            <div key={l.key} className="space-y-2 rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between"><p className="text-xs font-semibold text-muted-foreground">Line {i + 1}</p>
                {lines.length > 1 && <Button variant="ghost" size="sm" className="h-7 text-danger" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 className="h-4 w-4" />Remove</Button>}</div>
              <Input value={l.description} placeholder="What it's for (Full turf rental, Nov 24)" onChange={(e) => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, description: e.target.value } : x))} />
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">Qty or hours</Label><Input inputMode="decimal" value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, quantity: e.target.value } : x))} /></div>
                <div><Label className="text-xs">Price each</Label><Input inputMode="decimal" value={l.price} placeholder="$0" onChange={(e) => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, price: e.target.value } : x))} /></div>
                <div><Label className="text-xs">Line total</Label><p className="flex h-10 items-center font-semibold">{money(lineCents(l))}</p></div>
              </div>
              {l.block_id && <p className="text-xs text-muted-foreground">From the Facility calendar: {Number(l.quantity)} hours at {money(toCents(l.price))} an hour</p>}
            </div>
          ))}
          <Button variant="outline" className="w-full" onClick={() => setLines((ls) => [...ls, blankLine()])}><Plus className="h-4 w-4" />Add a line</Button>
          <p className="text-right font-display text-xl">Total {money(total)}</p>
          {total > 0 && total < 50 && <p className="text-right text-xs text-danger">Stripe needs at least 50 cents.</p>}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div><Label>Due date</Label><Input type="date" min={todayYmd()} value={due} onChange={(e) => setDue(e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-2">{[['Today', 0], ['In a week', 7], ['In 2 weeks', 14], ['In 30 days', 30]].map(([t, n]) => <Button key={t} size="sm" variant={due === addDays(todayYmd(), n) ? 'default' : 'outline'} onClick={() => setDue(addDays(todayYmd(), n))}>{t}</Button>)}</div></div>
          <div><Label>Note on the invoice (optional)</Label><Textarea rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Thanks for renting with us!" /></div>
          <div className="rounded-xl border border-border bg-card p-3 text-sm">
            <p className="font-semibold">How they can pay</p>
            <p className="mt-1 flex items-center gap-2"><Check className="h-4 w-4 text-success" />Card (on the Stripe pay page)</p>
            {d.setting.bank_enabled ? (
              <label className="mt-1 flex cursor-pointer items-start gap-2">
                <Checkbox className="mt-0.5" checked={bank} onCheckedChange={(v) => setBank(v === true)} />
                <span>Bank transfer<span className="block text-xs text-muted-foreground">Cheaper for you on big invoices (0.8%, never more than $5). Takes about 4 business days to show as paid.</span></span>
              </label>
            ) : (
              <p className="mt-1 flex items-center gap-2 text-muted-foreground"><span className="inline-block h-4 w-4 rounded border border-border" />Bank transfer (off for now, Omar can turn it on)</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Paid with cash or Venmo instead? Send it anyway, then mark it paid on the Invoicing page.</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-sm">
            <p className="font-semibold">Repeat</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[['', 'Just once'], ...Object.entries(EVERY)].map(([v, t]) => <Button key={v || 'once'} size="sm" variant={repeat.every === v ? 'default' : 'outline'} onClick={() => setRepeat((r) => ({ ...r, every: v }))}>{t}</Button>)}
            </div>
            {repeat.every && <>
              <p className="mt-3 text-xs font-semibold text-muted-foreground">Each time</p>
              <div className="mt-1 space-y-1">
                {[['send', 'Send it automatically', 'Same lines and amount every time. Good for a set monthly fee.'],
                  ['draft', 'Make a draft for me to check', 'It shows up under Drafts. You look it over and tap Send.'],
                  ...(who?.renter ? [['booked', 'Make a draft from their booked days', 'Bills the turf days they booked since the last one. You check it and tap Send.']] : []),
                ].map(([v, t, sub]) => (
                  <label key={v} className={cn('flex cursor-pointer items-start gap-2 rounded-lg border p-2', repeat.mode === v ? 'border-primary bg-primary/5' : 'border-border')}>
                    <input type="radio" className="mt-1 accent-[hsl(var(--primary))]" name="repeat-mode" checked={repeat.mode === v} onChange={() => setRepeat((r) => ({ ...r, mode: v }))} />
                    <span>{t}<span className="block text-xs text-muted-foreground">{sub}</span></span>
                  </label>
                ))}
              </div>
              <div className="mt-3"><Label className="text-xs">Stop after (optional)</Label><Input type="date" min={addDays(todayYmd(), 1)} value={repeat.end_date} onChange={(e) => setRepeat((r) => ({ ...r, end_date: e.target.value }))} /></div>
              <p className="mt-2 text-xs text-muted-foreground">This one goes out now. The next one is {fmtYmd(repeatNext)}, and each one is due {Math.max(0, Math.round((Date.parse(due) - Date.parse(todayYmd())) / 86400000))} days after it's made. You can pause or stop it any time on the Invoicing page.</p>
            </>}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-primary bg-card p-4">
            <p className="text-sm text-muted-foreground">Stripe will email</p>
            <p className="font-display text-xl">{who?.name}</p>
            <p className="text-sm">{who?.email}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3">
              <div><p className="text-xs text-muted-foreground">Total</p><p className="font-display text-2xl">{money(total)}</p></div>
              <div><p className="text-xs text-muted-foreground">Due</p><p className="font-display text-2xl">{fmtYmd(due)}</p></div>
            </div>
          </div>
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {lines.map((l) => (
              <div key={l.key} className="flex justify-between gap-3 px-3 py-2 text-sm"><div><p>{l.description}</p>{Number(l.quantity) !== 1 && <p className="text-xs text-muted-foreground">{Number(l.quantity)} × {money(toCents(l.price))}</p>}</div><span className="font-semibold">{money(lineCents(l))}</span></div>
            ))}
            {memo && <p className="px-3 py-2 text-sm text-muted-foreground">Note: {memo}</p>}
          </div>
          <p className="text-sm text-muted-foreground">They get an email with a Pay button. They can pay {d.setting.bank_enabled && bank ? 'by card or bank transfer' : 'by card'} on Stripe's page, no login needed. You'll see it under Waiting until it's paid.</p>
          {repeat.every && <p className="rounded-xl border border-border bg-card p-3 text-sm"><b>Repeats {EVERY_SHORT[repeat.every]}.</b> {repeat.mode === 'send' ? `The next one sends itself on ${fmtYmd(repeatNext)}` : `A draft is made on ${fmtYmd(repeatNext)} for you to check`}{repeat.end_date ? `, until ${fmtYmd(repeat.end_date)}` : ''}. Saved as a draft, it doesn't repeat until you send it.</p>}
          {!canSend && <p className="rounded-xl border border-warning-border bg-warning-surface p-3 text-sm text-warning">This is the test version, so it can only be sent to a test contact. Save it as a draft for now.</p>}
        </div>
      )}

      {step > 0 && <div className="fixed inset-x-0 bottom-[6.5rem] z-30 border-t border-border bg-background/95 p-3 backdrop-blur lg:bottom-0 lg:left-64">
        <div className="mx-auto flex max-w-xl gap-2">
          {step === 3 ? <>
            <Button className="flex-1" size="lg" disabled={!!busy || !canSend || !linesOk} onClick={onSend}>{busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Send invoice · {money(total)}</Button>
            <Button variant="outline" size="lg" disabled={!!busy} onClick={onSave}>Save draft</Button>
          </> : <>
            <Button variant="outline" size="lg" disabled={!!busy || !who || !linesOk} onClick={onSave}>Save draft</Button>
            <Button className="flex-1" size="lg" disabled={!nextOk} onClick={next}>Next</Button>
          </>}
        </div>
      </div>}
    </div>
  );
}

function PickPerson({ people, value, onPick, onAdded }) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', email: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const term = q.trim().toLowerCase();
  const shown = useMemo(() => people.filter((p) => !term || `${p.name} ${p.email}`.toLowerCase().includes(term)).slice(0, 40), [people, term]);
  const add = async () => {
    setBusy(true);
    try {
      const r = await invoicesApi('contact_add', f);
      const c = r.contact;
      const p = { key: `c:${c.id}`, contact_id: c.id, name: c.name, email: c.email, phone: c.phone, renter: !!c.renter_id, is_example: c.is_example, kind: 'Contact' };
      if (!r.existing) onAdded(p);
      onPick(p);
    } catch (e) { toast({ title: 'Could not add them', description: e.message }); } finally { setBusy(false); }
  };
  if (adding) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <p className="font-semibold">Add someone new</p>
        <div><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="First and last name, or a team" /></div>
        <div><Label>Email (the invoice goes here)</Label><Input type="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><Label>Phone (optional)</Label><Input type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div className="flex gap-2"><Button disabled={busy || !f.name.trim() || !f.email.trim()} onClick={add}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Add and continue</Button><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Button variant="outline" className="w-full justify-start" onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" />Add someone new</Button>
      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search renters, parents, people you've billed" className="pl-9" /></div>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {shown.map((p) => (
          <button key={p.key} type="button" onClick={() => onPick(p)} className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent', value?.key === p.key && 'bg-accent')}>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{p.name}{p.is_example && <span className="ml-2 text-xs font-normal text-muted-foreground">test</span>}</p><p className="truncate text-xs text-muted-foreground">{p.email}</p></div>
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{p.kind}</span>
          </button>
        ))}
        {!shown.length && <p className="p-4 text-center text-sm text-muted-foreground">Nobody matches. Tap Add someone new.</p>}
      </div>
    </div>
  );
}

function BookedDays({ who, lines, onAdd }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(todayYmd().slice(0, 8) + '01');
  const [to, setTo] = useState(addDays(todayYmd(), 30));
  const [days, setDays] = useState(null);
  const [pick, setPick] = useState({});
  const [contactId, setContactId] = useState(who.contact_id || null);
  const onList = new Set(lines.map((l) => l.block_id).filter(Boolean));
  const load = async () => {
    setDays(null);
    try {
      let cid = contactId;
      if (!cid) { // a renter picked from the list who isn't a contact yet: save them first
        const r = await invoicesApi('contact_add', { name: who.name, email: who.email, phone: who.phone, renter_id: who.person?.id });
        cid = r.contact.id; setContactId(cid); who.contact_id = cid;
      }
      const r = await invoicesApi('booked_days', { contact_id: cid, from, to });
      setDays(r.days);
    } catch (e) { toast({ title: 'Could not load the calendar', description: e.message }); setDays([]); }
  };
  useEffect(() => { if (open) load(); }, [open, from, to]);
  const chosen = (days || []).filter((x) => pick[x.block_id]);
  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}><CalendarPlus className="h-4 w-4" />Add booked days from the Facility calendar</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader><DialogTitle>Booked days</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          {!days ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /> : !days.length ? <p className="py-4 text-center text-sm text-muted-foreground">No approved bookings in these dates.</p> : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {days.map((x) => {
                const off = x.billed || onList.has(x.block_id);
                return (
                  <label key={x.block_id} className={cn('flex items-center gap-3 px-3 py-2.5 text-sm', off ? 'opacity-50' : 'cursor-pointer')}>
                    <Checkbox disabled={off} checked={!!pick[x.block_id]} onCheckedChange={(v) => setPick((p) => ({ ...p, [x.block_id]: !!v }))} />
                    <div className="flex-1"><p>{x.label}</p><p className="text-xs text-muted-foreground">{off ? (x.billed ? 'Already on an invoice' : 'Already on this invoice') : `${x.hours} hr × ${money(x.rate_cents)}`}</p></div>
                    <span className="font-semibold">{money(x.amount_cents)}</span>
                  </label>
                );
              })}
            </div>
          )}
          <Button disabled={!chosen.length} onClick={() => {
            onAdd(chosen.map((x) => ({ key: x.block_id, description: x.label, quantity: String(x.hours), price: (x.rate_cents / 100).toFixed(2), block_id: x.block_id })));
            setPick({}); setOpen(false);
          }}>Add {chosen.length || ''} day{chosen.length === 1 ? '' : 's'}{chosen.length ? ` · ${money(chosen.reduce((s, x) => s + x.amount_cents, 0))}` : ''}</Button>
          <p className="text-xs text-muted-foreground">The price is the hourly rate times the hours. You can change it on the line after.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
