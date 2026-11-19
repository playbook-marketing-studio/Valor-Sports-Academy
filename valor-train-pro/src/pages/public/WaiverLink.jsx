import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { callFn } from '@/api/supabaseClient';
import PublicLayout from './PublicLayout';
import { SignWaiverForm, SignedNote } from '@/components/waiver/Waiver';
import { VALOR_PHONE } from '@/lib/valor';

/** /waiver/:token — the private per-athlete link (emailed, or a QR at the front desk). No login needed. */
export default function WaiverLink() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    callFn('waiver', { body: { action: 'link', t: token } })
      .then((d) => setState({ loading: false, ...d }))
      .catch((e) => setState({ loading: false, error: e.message }));
  }, [token]);

  if (state.loading) return <PublicLayout title="Valor waiver"><div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div></PublicLayout>;
  if (state.error) {
    return (
      <PublicLayout title="Valor waiver">
        <p className="text-sm">{state.error}</p>
        <p className="mt-3 text-sm">Call or text <a className="text-primary" href={`tel:${VALOR_PHONE}`}>{VALOR_PHONE}</a>.</p>
      </PublicLayout>
    );
  }
  const a = state.athlete;
  if (!state.waiver) return <PublicLayout title="Valor waiver"><p className="text-sm">The waiver isn't ready yet. Check back soon.</p></PublicLayout>;
  if (state.signed || state.done) {
    return (
      <PublicLayout title={`${a.first_name}'s waiver is signed`} subtitle="You're all set. Thanks!">
        <SignedNote signature={state.done?.signature || state.signed} emailed={state.done?.emailed} email={state.done?.email} />
        <p className="mt-4 text-sm text-muted-foreground">Need a copy or a change? Text us at <a className="text-primary" href={`sms:${VALOR_PHONE}`}>{VALOR_PHONE}</a>.</p>
      </PublicLayout>
    );
  }
  return (
    <PublicLayout title={`Sign ${a.first_name}'s waiver`} subtitle="Read it through, then sign at the bottom. Takes a couple minutes.">
      <SignWaiverForm waiver={state.waiver} athlete={a} askEmail bare
        onSign={async (p) => {
          const r = await callFn('waiver', { body: { action: 'sign', t: token, ...p } });
          setState((s) => ({ ...s, done: { ...r, email: p.signer_email } }));
          window.scrollTo(0, 0);
        }} />
    </PublicLayout>
  );
}
