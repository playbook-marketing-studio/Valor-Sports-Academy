import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import PublicLayout from './PublicLayout';
import { VALOR_PHONE } from '@/lib/valor';

/** Where Stripe sends the parent's phone after they pay from the coach's QR code. */
export default function Paid() {
  const [params] = useSearchParams();
  if (params.get('canceled')) {
    return (
      <PublicLayout title="Payment not finished" subtitle="Nothing was charged.">
        <p className="text-sm">Let your coach know and they can show the code again, or take cash or Venmo.</p>
      </PublicLayout>
    );
  }
  return (
    <PublicLayout title="You're all set">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-6 w-6 text-green-600" />
        <div className="text-sm">
          <p className="font-semibold">Payment received. Welcome to Valor.</p>
          <p className="mt-1 text-muted-foreground">Your receipt is on its way to your email. Questions? Call or text {VALOR_PHONE}.</p>
        </div>
      </div>
    </PublicLayout>
  );
}
