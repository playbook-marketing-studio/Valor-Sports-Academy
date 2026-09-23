import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CreditCard, HandCoins, Loader2 } from 'lucide-react';
import { callFn } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import BookLayout from './BookLayout';
import { fmtSlot, money } from '@/lib/slots';

export default function BookPay() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [params] = useSearchParams();
  const b = params.get('b'), t = params.get('t');
  const [booking, setBooking] = useState(state?.booking || null);
  const [stripeOn, setStripeOn] = useState(state?.stripe_configured ?? null);
  const [error, setError] = useState(params.get('canceled') ? 'Payment was canceled. Choose again below.' : '');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!b || !t) return;
    callFn('booking', { method: 'GET', query: { action: 'get', id: b, t } })
      .then((r) => { setBooking(r.booking); setStripeOn(r.stripe_configured); if (r.booking.payment_status === 'paid') navigate(`/book/done?b=${b}&t=${t}`); })
      .catch((e) => setError(e.message));
  }, [b, t, navigate]);

  const payOnline = async () => {
    setBusy('online'); setError('');
    try {
      const r = await callFn('stripe-checkout', { body: { id: b, t } });
      if (r.already_paid) return navigate(`/book/done?b=${b}&t=${t}`);
      if (r.configured === false) { setStripeOn(false); setError(r.message); return; }
      window.location.href = r.url;
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  };

  const payInPerson = async () => {
    setBusy('in_person'); setError('');
    try {
      await callFn('booking', { body: { action: 'choose', id: b, t, payment_method: 'in_person' } });
      navigate(`/book/done?b=${b}&t=${t}`);
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  };

  const fee = booking ? money(booking.amount_cents, booking.currency) : '';

  return (
    <BookLayout step={2} title="How would you like to pay?"
      subtitle={booking ? `${booking.athlete_first_name}'s assessment, ${fmtSlot(booking.slot_start)}. Fee: ${fee}.` : ''}>
      {error && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {!booking ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : (
        <div className="grid gap-4">
          <button onClick={payOnline} disabled={!!busy || stripeOn === false}
            className="flex items-start gap-4 rounded-xl border border-border p-5 text-left transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-50">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><CreditCard className="h-5 w-5" /></div>
            <div>
              <p className="font-semibold">Pay {fee} online now</p>
              <p className="mt-1 text-sm text-muted-foreground">Card, Apple Pay or Google Pay through Stripe. Your spot is locked in and you get a receipt by email.</p>
              {stripeOn === false && <p className="mt-2 text-xs text-primary">Online payment is not connected yet. Pay at the assessment instead.</p>}
              {busy === 'online' && <Loader2 className="mt-2 h-4 w-4 animate-spin" />}
            </div>
          </button>
          <button onClick={payInPerson} disabled={!!busy}
            className="flex items-start gap-4 rounded-xl border border-border p-5 text-left transition hover:border-primary disabled:opacity-50">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><HandCoins className="h-5 w-5" /></div>
            <div>
              <p className="font-semibold">Pay at the assessment</p>
              <p className="mt-1 text-sm text-muted-foreground">Bring {fee} on the day. Card or cash with a coach at the front desk.</p>
              {busy === 'in_person' && <Loader2 className="mt-2 h-4 w-4 animate-spin" />}
            </div>
          </button>
          <Button variant="ghost" size="sm" className="justify-self-start text-muted-foreground" onClick={() => navigate('/')}>Decide later, go to my dashboard</Button>
        </div>
      )}
    </BookLayout>
  );
}
