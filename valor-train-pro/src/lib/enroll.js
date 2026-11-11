import { callFn } from '@/api/supabaseClient';
import { toast } from '@/components/ui/use-toast';
import { VALOR_PHONE } from '@/lib/valor';

/** A Stripe Checkout link for the family's own athlete (fn family: a kid added in the app pays a prorated first month). */
async function checkoutFor(athlete, planKey) {
  return callFn('family', { body: { action: 'checkout', athlete_id: athlete.id, plan_key: planKey } });
}

function explain(r) {
  if (r.already_enrolled || r.already_subscribed) { window.location.reload(); return true; }
  if (r.configured === false) {
    toast({ title: 'Online payment is not set up yet', description: `Pay at Valor with a coach, or call or text ${VALOR_PHONE}.` });
    return true;
  }
  return false;
}

/** Parent starts enrollment checkout for their own athlete. Redirects to Stripe, or explains why not. */
export async function startEnrollment(athlete, planKey) {
  try {
    const r = await checkoutFor(athlete, planKey);
    if (explain(r)) return;
    window.location.href = r.url;
  } catch (e) {
    toast({ title: 'Could not start payment', description: e.message });
  }
}

/**
 * "Send to whoever pays" (Valor 11/9/2026: the athlete is at the gym at 5:30am, the parent pays from home).
 * Makes the same Checkout link and hands it to the phone's share sheet, or a text message.
 * The link works for 24 hours; the payment lands on this athlete.
 */
export async function shareCheckout(athlete, planKey, planName) {
  try {
    const r = await checkoutFor(athlete, planKey);
    if (explain(r)) return;
    const text = `Can you set up ${athlete.first_name}'s Valor plan (${planName})? Tap to pay, the link works for 24 hours:`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Valor Sports Academy', text, url: r.url }); return; }
      catch (e) { if (e?.name === 'AbortError') return; }
    }
    window.location.href = `sms:?&body=${encodeURIComponent(`${text} ${r.url}`)}`;
  } catch (e) {
    toast({ title: 'Could not make the payment link', description: e.message });
  }
}
