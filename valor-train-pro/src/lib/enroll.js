import { callFn } from '@/api/supabaseClient';
import { toast } from '@/components/ui/use-toast';
import { VALOR_PHONE } from '@/lib/valor';

/** Parent starts enrollment checkout for their own athlete. Redirects to Stripe, or explains why not. */
export async function startEnrollment(athlete, planKey) {
  try {
    const r = await callFn('staff', { body: { action: 'take_payment', athlete_id: athlete.id, plan_key: planKey } });
    if (r.already_enrolled) { window.location.reload(); return; }
    if (r.configured === false) {
      toast({ title: 'Online payment is not set up yet', description: `Pay at Valor with a coach, or call or text ${VALOR_PHONE}.` });
      return;
    }
    window.location.href = r.url;
  } catch (e) {
    toast({ title: 'Could not start payment', description: e.message });
  }
}
