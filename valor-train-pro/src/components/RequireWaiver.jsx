import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSignature, Loader2 } from 'lucide-react';
import { callFn } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useViewAs } from '@/lib/ViewAsContext';
import { SignWaiverForm } from '@/components/waiver/Waiver';

/** This login's athletes and their waiver status. Shared by the gate, Home's banner and Account. */
export function useMyWaivers() {
  const { user } = useAuth();
  const viewAs = useViewAs();
  const family = !!user && user.role !== 'admin' && user.role !== 'renter' && !viewAs.isActive;
  return useQuery({
    queryKey: ['waiver-mine', user?.id],
    queryFn: () => callFn('waiver', { body: { action: 'mine' } }),
    enabled: family,
    staleTime: 0,
    retry: 1,
  });
}

export const unsignedOf = (d) => (d?.waiver ? (d.athletes || []).filter((a) => !a.signature) : []);

// "Not now" lasts until the app is closed: sessionStorage resets when the phone app or tab is reopened.
const laterKey = (uid) => `vtp-waiver-later-${uid}`;
const readLater = (uid) => { try { return sessionStorage.getItem(laterKey(uid)) === '1'; } catch { return false; } };
const saveLater = (uid) => { try { sessionStorage.setItem(laterKey(uid), '1'); } catch { /* private mode: ask again next screen */ } };

/**
 * Omar 11/19: never lock families out for an unsigned waiver.
 * settings.waiver.required = 'prompt' (default): each time a family opens the app they get the sign screen for an
 *   unsigned athlete, with "Not now" (then the app works as usual, incl. payments; Home keeps a reminder card).
 * 'block': same screen, no "Not now" (kept off by default). 'off': nothing in the app.
 * A new sign-up (athlete added in the app once the waiver is on, must_sign) always signs first: no "Not now".
 * Account and Messages are never behind this. Staff, renters and view-as pass. If the check fails, the app opens.
 */
export default function RequireWaiver() {
  const { user } = useAuth();
  const viewAs = useViewAs();
  const qc = useQueryClient();
  const { data, isLoading } = useMyWaivers();
  const [later, setLater] = React.useState(() => (user ? readLater(user.id) : false));
  if (!user || user.role === 'admin' || user.role === 'renter' || viewAs.isActive) return <Outlet />;
  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const mode = data?.setting?.required || 'prompt';
  const todo = unsignedOf(data);
  const must = todo.filter((a) => a.must_sign || mode === 'block');
  const ask = must.length ? must : (mode === 'prompt' && !later ? todo : []);
  if (!ask.length) return <Outlet />;
  const a = ask[0];
  const canSkip = !must.length;
  const sign = async (p) => {
    await callFn('waiver', { body: { action: 'sign', athlete_id: a.id, ...p } });
    await qc.invalidateQueries({ queryKey: ['waiver-mine'] });
  };
  const skip = () => { saveLater(user.id); setLater(true); };
  return (
    <div className="mx-auto max-w-xl space-y-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileSignature className="h-6 w-6" /></div>
        {canSkip && <button type="button" onClick={skip} className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">Not now</button>}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{ask.length > 1 ? `1 of ${ask.length} waivers` : canSkip ? 'One quick thing' : 'Last step'}</p>
        <h1 className="mt-1 font-display text-3xl">Sign {a.first_name}'s waiver</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {canSkip
            ? <>Every athlete at Valor needs a signed waiver on file. Read it through, then sign at the bottom. Busy right now? Tap Not now and we'll ask next time you open the app.</>
            : <>Every athlete at Valor needs a signed waiver on file before they train. Read it through, then sign at the bottom. Your account and payments are in <Link to="/account" className="text-primary underline">Account</Link>.</>}
        </p>
      </div>
      <SignWaiverForm key={a.id} waiver={data.waiver} athlete={a} defaultName={a.own_login ? [a.first_name, a.last_name].filter(Boolean).join(' ') : (user.full_name || '')} onSign={sign} />
      {canSkip && <button type="button" onClick={skip} className="w-full text-center text-sm text-muted-foreground underline">Not now, take me to the app</button>}
    </div>
  );
}

/** After "Not now": a reminder card on Home until every athlete on this login has signed. */
export function WaiverBanner() {
  const { data } = useMyWaivers();
  const todo = unsignedOf(data);
  if (!todo.length || data?.setting?.required === 'off') return null;
  const names = todo.map((a) => a.first_name).join(' and ');
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/60 bg-primary/5 p-4">
      <div className="flex items-start gap-3"><FileSignature className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div><p className="font-semibold">Sign {names}'s waiver</p><p className="text-sm text-muted-foreground">Every athlete needs one on file. Takes a couple minutes.</p></div></div>
      <Link to="/account" className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Sign</Link>
    </div>
  );
}
