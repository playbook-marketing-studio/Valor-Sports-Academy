import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import PublicLayout from './PublicLayout';
import { VALOR_PHONE } from '@/lib/valor';

/** Where Stripe sends the parent's phone after they pay from the coach's QR code. */
export default function Paid() {
  const [params] = useSearchParams();
  const autopay = !!params.get('s');
  if (params.get('canceled')) {
    return (
      <PublicLayout title={autopay ? 'Autopay not set up' : 'Payment not finished'} subtitle="Nothing was charged.">
        <p className="text-sm">Let your coach know and they can show the code again, or take cash or Venmo.</p>
      </PublicLayout>
    );
  }
  return (
    <PublicLayout title="You're all set">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-6 w-6 text-success" />
        <div className="text-sm">
          <p className="font-semibold">{autopay ? 'Autopay is set up. Welcome to Valor.' : 'Payment received. Welcome to Valor.'}</p>
          <p className="mt-1 text-muted-foreground">{autopay ? 'Your first payment is done and the receipt is on its way. From now on it charges on the 1st of each month; you can update your card in the app.' : 'Your receipt is on its way to your email.'} Workouts, nutrition and your athlete's training plan are unlocked. Questions? Call or text {VALOR_PHONE}.</p>
        </div>
      </div>
      <Button asChild className="mt-5 w-full"><Link to="/">Go to my dashboard</Link></Button>
    </PublicLayout>
  );
}
