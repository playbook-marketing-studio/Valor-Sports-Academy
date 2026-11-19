import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { callFn } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import PublicLayout from './PublicLayout';
import { SignWaiverForm, SignedNote } from '@/components/waiver/Waiver';
import { VALOR_PHONE } from '@/lib/valor';

/** /waiver/team/:token — one link per outside team (texted, or a QR at the door). No login; the parent types the athlete's name. */
export default function WaiverTeamLink() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true });
  const [round, setRound] = useState(0); // "Sign for another athlete" resets the form

  useEffect(() => {
    callFn('waiver', { body: { action: 'team_link', tt: token } })
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
  if (!state.waiver) return <PublicLayout title="Valor waiver"><p className="text-sm">The waiver isn't ready yet. Check back soon.</p></PublicLayout>;
  const team = state.team?.name;
  if (state.done) {
    const sig = state.done.signature;
    return (
      <PublicLayout title={state.done.already ? 'Already signed' : 'Waiver signed'} subtitle={`${sig?.athlete_name || 'Your athlete'} is all set for ${team}. Thanks!`}>
        <SignedNote signature={sig} emailed={state.done.emailed} email={state.done.email} />
        <Button className="mt-4 w-full" size="lg" variant="outline" onClick={() => { setState((s) => ({ ...s, done: null })); setRound((r) => r + 1); window.scrollTo(0, 0); }}>Sign for another athlete</Button>
        <p className="mt-4 text-sm text-muted-foreground">Questions? Text us at <a className="text-primary" href={`sms:${VALOR_PHONE}`}>{VALOR_PHONE}</a>.</p>
      </PublicLayout>
    );
  }
  return (
    <PublicLayout title="Sign the Valor waiver" subtitle={`For ${team}. One waiver per athlete. Read it through, then sign at the bottom.`}>
      <SignWaiverForm key={round} waiver={state.waiver} askAthlete askEmail bare
        onSign={async (p) => {
          const r = await callFn('waiver', { body: { action: 'team_sign', tt: token, ...p } });
          setState((s) => ({ ...s, done: { ...r, email: p.signer_email } }));
          window.scrollTo(0, 0);
        }} />
    </PublicLayout>
  );
}
