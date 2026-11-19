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

/**
 * settings.waiver.required = 'screen': a family login with an unsigned athlete gets the sign screen before
 * Home, workouts, nutrition and progress. Account (payments) and Messages stay open, so nobody is locked out of paying.
 * Staff, renters and view-as pass. If the check fails, the app opens (never block on our own error).
 */
export default function RequireWaiver() {
  const { user } = useAuth();
  const viewAs = useViewAs();
  const qc = useQueryClient();
  const { data, isLoading } = useMyWaivers();
  if (!user || user.role === 'admin' || user.role === 'renter' || viewAs.isActive) return <Outlet />;
  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const todo = unsignedOf(data);
  if (data?.setting?.required !== 'screen' || todo.length === 0) return <Outlet />;
  const a = todo[0];
  const sign = async (p) => {
    await callFn('waiver', { body: { action: 'sign', athlete_id: a.id, ...p } });
    await qc.invalidateQueries({ queryKey: ['waiver-mine'] });
  };
  return (
    <div className="mx-auto max-w-xl space-y-5 py-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileSignature className="h-6 w-6" /></div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{todo.length > 1 ? `1 of ${todo.length} waivers` : 'One quick thing'}</p>
        <h1 className="mt-1 font-display text-3xl">Sign {a.first_name}'s waiver</h1>
        <p className="mt-2 text-sm text-muted-foreground">Every athlete at Valor needs a signed waiver on file. Read it through, then sign at the bottom. Your account and payments are still in <Link to="/account" className="text-primary underline">Account</Link>.</p>
      </div>
      <SignWaiverForm key={a.id} waiver={data.waiver} athlete={a} defaultName={a.own_login ? [a.first_name, a.last_name].filter(Boolean).join(' ') : (user.full_name || '')} onSign={sign} compactText />
    </div>
  );
}

/** settings.waiver.required = 'banner' (or a screen-mode family that skipped ahead): a reminder card on Home. */
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
