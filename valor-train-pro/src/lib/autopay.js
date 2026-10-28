// Monthly autopay (Stripe subscription), charged on the 1st. Server rules: supabase/functions/_shared/billing.ts.
import { callFn } from '@/api/supabaseClient';
import { toast } from '@/components/ui/use-toast';
import { VALOR_PHONE } from '@/lib/valor';

export const isMonthlyItem = (item) => item?.billing === 'monthly';
export const money = (c) => `$${((c || 0) / 100).toFixed((c || 0) % 100 ? 2 : 0)}`;
export const fmtDay = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const TZ = 'America/Los_Angeles';
const monthName = (d) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'long' }).format(d);
const ptDay = (d) => Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, day: 'numeric' }).format(d));

export const AUTOPAY_STATUS = {
  active: { label: 'Autopay on', cls: 'bg-success-surface text-success' },
  ending: { label: 'Ends this month', cls: 'bg-warning-surface text-warning' },
  past_due: { label: 'Past due', cls: 'bg-danger-surface text-danger' },
  canceled: { label: 'Autopay ended', cls: 'bg-muted text-muted-foreground' },
  pending: { label: 'Waiting for card', cls: 'bg-muted text-muted-foreground' },
  expired: { label: 'Not finished', cls: 'bg-muted text-muted-foreground' },
};

/** The one-line terms shown before someone starts autopay. */
export function autopayTerms(item, monthly = {}) {
  const now = new Date();
  const commit = Number(monthly.commitment_months ?? 3);
  const first = ptDay(now) === 1
    ? `${money(item.amount_cents)} today for ${monthName(now)}`
    : monthly.first_month === 'half'
      ? `half price (${money(Math.round(item.amount_cents / 2))}) for the rest of ${monthName(now)}`
      : monthly.first_month === 'none'
        ? `${money(Math.max(50, Number(monthly.first_fee_cents) || 50))} today to put the card on file (${monthName(now)} is already paid)`
        : `a prorated first payment for the rest of ${monthName(now)}`;
  const line = `${first}, then ${money(item.amount_cents)} on the 1st of every month.${commit ? ` ${commit}-month commitment, no cancellation fee.` : ''}`;
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/**
 * The monthly plan that matches the athlete's roster season + days a week (Corey's sheet), so a family
 * coming off UpperHand gets one tap: in-season 1x/2x, off-season 3x. Anything else: null (they pick).
 */
export function suggestedPlanKey(athlete, cfg) {
  const freq = parseInt(String(athlete?.frequency || ''), 10);
  const key = athlete?.season === 'in_season' && (freq === 1 || freq === 2) ? `inseason_${freq}x`
    : athlete?.season === 'off_season' && freq === 3 ? 'offseason_3x' : null;
  return key && cfg?.items?.some((x) => x.key === key && isMonthlyItem(x)) ? key : null;
}

/** The athlete's current autopay (active, past due or ending), else null. */
export const currentSub = (subs) => (subs || []).find((s) => s.status === 'active' || s.status === 'past_due') || null;

async function act(action, subscriptionId) {
  return callFn('staff', { body: { action, subscription_id: subscriptionId } });
}
export async function openBillingPortal(sub) {
  try {
    const r = await act('billing_portal', sub.id);
    if (r.url) window.location.href = r.url;
  } catch (e) { toast({ title: 'Could not open the card page', description: e.message }); }
}
export async function setAutopayCancel(sub, cancel) {
  try {
    await act(cancel ? 'cancel_autopay' : 'resume_autopay', sub.id);
    toast({ title: cancel ? 'Autopay stops after this month' : 'Autopay is back on', description: cancel ? `No more charges after ${fmtDay(sub.current_period_end)}. Classes stay until then.` : `Next charge ${fmtDay(sub.current_period_end)}.` });
    return true;
  } catch (e) {
    toast({ title: cancel ? "Can't cancel yet" : 'Could not change autopay', description: e.message || `Call or text ${VALOR_PHONE}.` });
    return false;
  }
}
