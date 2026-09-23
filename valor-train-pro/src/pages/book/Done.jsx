import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, MapPin } from 'lucide-react';
import { callFn } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import BookLayout from './BookLayout';
import { fmtSlot, money } from '@/lib/slots';

export default function BookDone() {
  const [params] = useSearchParams();
  const b = params.get('b'), t = params.get('t'), paid = params.get('paid');
  const [booking, setBooking] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!b || !t) return;
    let tries = 0;
    const load = () => callFn('booking', { method: 'GET', query: { action: 'get', id: b, t } })
      .then((r) => {
        setBooking(r.booking); setCfg(r.config);
        // after a Stripe redirect the webhook may land a second or two later
        if (paid && r.booking.payment_status !== 'paid' && tries++ < 5) setTimeout(load, 1500);
      })
      .catch((e) => setError(e.message));
    load();
  }, [b, t, paid]);

  const isPaid = booking?.payment_status === 'paid';
  const inPerson = booking?.payment_method === 'in_person';

  return (
    <BookLayout step={3} title={booking?.status === 'requested' ? 'We got your request' : "You're booked"}>
      {error && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {!booking ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : (
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 text-green-500" />
            <div>
              <p className="font-semibold">{booking.athlete_first_name}'s assessment</p>
              <p className="text-sm text-muted-foreground">{fmtSlot(booking.slot_start)}{booking.status === 'requested' ? ' · a coach will text you to confirm' : ''}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <MapPin className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p>{cfg?.address || '1973 Fowler St, Richland, WA 99352'}</p>
              <p className="text-muted-foreground">Arrive 10 minutes early in athletic clothes with water.</p>
            </div>
          </div>
          <div className="rounded-lg border border-border p-4 text-sm">
            <p className="font-medium">Payment: {isPaid ? 'paid' : inPerson ? `${money(booking.amount_cents, booking.currency)} due at the assessment` : paid ? 'confirming with Stripe…' : 'not chosen yet'}</p>
            {!isPaid && !inPerson && <Link to={`/book/pay?b=${b}&t=${t}`} className="mt-1 inline-block text-primary hover:underline">Choose how to pay</Link>}
            {!isPaid && paid && <p className="mt-1 text-xs text-muted-foreground">If this does not update in a minute, your dashboard will show the final status.</p>}
          </div>
          <Button asChild size="lg" className="w-full"><Link to="/">Go to {booking.athlete_first_name}'s dashboard</Link></Button>
        </div>
      )}
    </BookLayout>
  );
}
