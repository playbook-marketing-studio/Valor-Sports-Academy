import React, { useState } from 'react';
import { AlertTriangle, CreditCard, Loader2, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AUTOPAY_STATUS, fmtDay, money, openBillingPortal, setAutopayCancel } from '@/lib/autopay';

/**
 * One athlete's monthly autopay: plan, next charge, commitment, Update card, Cancel / Resume.
 * Parents can cancel only after the commitment (the server enforces it too); staff any time.
 * `readOnly` = staff "view as athlete".
 */
export default function AutopayCard({ sub, staff = false, commitmentMonths = 3, readOnly = false, onChanged }) {
  const [busy, setBusy] = useState('');
  if (!sub) return null;
  const ending = sub.status === 'active' && sub.cancel_at_period_end;
  const st = AUTOPAY_STATUS[ending ? 'ending' : sub.status] || AUTOPAY_STATUS.active;
  const left = Math.max(0, commitmentMonths - (sub.paid_months || 0));
  const canCancel = staff || left === 0;
  const run = async (k, fn) => { setBusy(k); const ok = await fn(); setBusy(''); if (ok) onChanged?.(); };

  return (
    <div className={cn('space-y-2 rounded-lg border px-3 py-2', sub.status === 'past_due' ? 'border-danger-border bg-danger-surface' : 'border-border')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold"><Repeat className="h-4 w-4 text-primary" /> {sub.plan_name} · {money(sub.amount_cents)}/mo</p>
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', st.cls)}>{st.label}</span>
      </div>
      {sub.status === 'past_due' && (
        <p className="flex items-start gap-2 text-sm text-danger"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> The last charge didn't go through. {staff ? 'The parent got an email to update their card. Stripe retries automatically.' : 'Tap Update card. We retry automatically.'}</p>
      )}
      <p className="text-xs text-muted-foreground">
        {sub.status === 'canceled' ? `Ended ${sub.canceled_at ? fmtDay(sub.canceled_at) : ''}.`
          : ending ? `No more charges. Classes stay until ${fmtDay(sub.current_period_end)}.`
          : sub.current_period_end ? `Next charge ${fmtDay(sub.current_period_end)} · ${money(sub.amount_cents)}.` : 'Charges on the 1st of each month.'}
        {sub.status !== 'canceled' && commitmentMonths > 0 && (left > 0 ? ` ${commitmentMonths}-month commitment: ${left} more month${left === 1 ? '' : 's'} to go.` : ' Commitment done.')}
      </p>
      {!readOnly && sub.status !== 'canceled' && (
        <div className="flex flex-wrap gap-2">
          {sub.stripe_customer_id && (
            <Button size="sm" variant={sub.status === 'past_due' ? 'default' : 'outline'} className="h-9 gap-1.5" disabled={!!busy} onClick={() => run('card', async () => { await openBillingPortal(sub); return false; })}>
              {busy === 'card' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Update card
            </Button>
          )}
          {ending ? (
            <Button size="sm" variant="outline" className="h-9" disabled={!!busy} onClick={() => run('resume', () => setAutopayCancel(sub, false))}>{busy === 'resume' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Keep autopay on'}</Button>
          ) : canCancel ? (
            <Button size="sm" variant="ghost" className="h-9 text-muted-foreground" disabled={!!busy}
              onClick={() => { if (window.confirm(staff && left > 0 ? `They're ${left} month${left === 1 ? '' : 's'} short of the ${commitmentMonths}-month commitment. Stop their autopay after this month anyway?` : 'Stop autopay after this month? Classes stay until the end of the paid month.')) run('cancel', () => setAutopayCancel(sub, true)); }}>
              {busy === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cancel autopay'}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
