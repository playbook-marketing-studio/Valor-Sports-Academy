import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { callFn } from '@/api/supabaseClient';
import { cn } from '@/lib/utils';
import { fmtDay, money } from '@/lib/autopay';

const TZ = 'America/Los_Angeles';
const ymdPT = (d) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}`; };
const addDays = (n) => ymdPT(new Date(Date.now() + n * 86400000));
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const niceDay = (ymd) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(`${ymd}T12:00:00Z`));

/**
 * Coaches change a family's autopay (Omar 11/11/2026): a different monthly plan, or a different charge date.
 * Neither charges anything today. The plan changes at the next charge; the date moves the next charge and the
 * day of the month after it. The parent gets an email. Server: supabase/functions/autopay-changes.
 */
export default function AutopayChange({ mode, sub, plans = [], name = 'this athlete', onClose, onChanged }) {
  const [planKey, setPlanKey] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const plan = plans.find((p) => p.key === planKey);
  const next = sub.current_period_end ? fmtDay(sub.current_period_end) : 'the next charge';
  const isPlan = mode === 'plan';
  const ready = isPlan ? !!plan : !!date;

  const save = async () => {
    setBusy(true);
    try {
      const r = await callFn('autopay-changes', { body: isPlan ? { action: 'change_plan', subscription_id: sub.id, plan_key: planKey } : { action: 'change_date', subscription_id: sub.id, date } });
      toast({
        title: isPlan ? `${name} is on ${r.plan_name} now` : `Next charge moved to ${niceDay(date)}`,
        description: `Nothing was charged today. ${r.parent_emailed ? 'The parent got an email.' : 'No email went out, so tell the parent.'}${r.receipt_name === false ? ' Heads up: the receipt will still show the old plan name. Tell Omar.' : ''}`,
      });
      onChanged?.();
      onClose();
    } catch (e) {
      toast({ title: "That didn't go through", description: e.message });
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{isPlan ? 'Change plan' : 'Change charge date'}</DialogTitle>
          <DialogDescription>
            {name} is on {sub.plan_name}, {money(sub.amount_cents)} a month. Next charge {next}.
          </DialogDescription>
        </DialogHeader>
        {isPlan ? (
          <div className="space-y-1.5">
            {plans.filter((p) => !(p.key === sub.plan_key && p.amount_cents === sub.amount_cents)).map((p) => (
              <button key={p.key} type="button" aria-pressed={planKey === p.key} onClick={() => setPlanKey(p.key)}
                className={cn('flex w-full items-center justify-between rounded-xl border bg-background px-3 py-2.5 text-left', planKey === p.key ? 'border-2 border-primary bg-primary/5' : 'border-border')}>
                <span><span className="block text-sm font-semibold">{p.name}</span><span className="block text-xs text-muted-foreground">{p.classes ? `${p.classes} classes a month` : 'Unlimited classes'}</span></span>
                <span className="font-display text-lg">{money(p.amount_cents)}/mo</span>
              </button>
            ))}
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="ac-date">New charge date</label>
            <Input id="ac-date" type="date" className="h-10 rounded-xl" value={date} min={addDays(3)} max={addDays(60)} onChange={(e) => setDate(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">At least 3 days out and within the next 2 months.</p>
          </div>
        )}
        <div className="rounded-xl bg-muted px-3 py-2.5 text-sm">
          {!ready ? <span className="text-muted-foreground">{isPlan ? 'Pick the new plan.' : 'Pick the date of the next charge.'}</span>
            : isPlan ? <><b>{name} goes to {plan.name}, {money(plan.amount_cents)} starting {next}.</b><span className="block text-muted-foreground">Nothing is charged today. This month's classes stay as they are. The parent gets an email.</span></>
              : <><b>Next charge is {money(sub.amount_cents)} on {niceDay(date)}, then the {ordinal(Number(date.slice(8)))} of every month.</b><span className="block text-muted-foreground">Nothing is charged today. Classes stay usable until then. The parent gets an email.</span></>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" disabled={busy} onClick={onClose}>Back</Button>
          <Button disabled={busy || !ready} onClick={save}>{busy ? 'Saving…' : isPlan ? 'Change plan' : 'Change date'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
