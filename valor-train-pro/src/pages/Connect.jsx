import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { callFn } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { VALOR_EMAIL } from '@/lib/valor';

/** The "Connect my athlete" email link (fn family claim): proves this login owns the inbox, then links the kid on file. */
export default function Connect() {
  const [params] = useSearchParams();
  const [state, setState] = useState({ busy: true });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    callFn('family', { body: { action: 'claim', t: params.get('t') || '' } })
      .then((r) => setState({ linked: r.linked || [] }))
      .catch((e) => setState({ error: e.message }));
  }, [params]);

  const names = state.linked?.join(' and ');
  return (
    <div className="mx-auto max-w-md space-y-4 py-10 text-center">
      {state.busy && <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />}
      {state.linked && (
        <>
          <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
          <h1 className="font-display text-3xl">{state.linked.length ? `${names} ${state.linked.length === 1 ? 'is' : 'are'} connected` : 'Already connected'}</h1>
          <p className="text-sm text-muted-foreground">{state.linked.length ? 'Their workouts, messages and monthly plan are on your Home screen now.' : 'Nothing left to connect on this login.'}</p>
          <Button asChild><Link to="/">Go to Home</Link></Button>
        </>
      )}
      {state.error && (
        <>
          <h1 className="font-display text-3xl">That link didn't work</h1>
          <p className="text-sm text-muted-foreground">{state.error}</p>
          <p className="text-sm text-muted-foreground">Still stuck? Email <span className="font-medium text-foreground">{VALOR_EMAIL}</span>.</p>
          <Button asChild variant="outline"><Link to="/">Go to Home</Link></Button>
        </>
      )}
    </div>
  );
}
