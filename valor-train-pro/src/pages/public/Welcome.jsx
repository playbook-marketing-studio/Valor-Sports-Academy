import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PublicLayout from './PublicLayout';
import { VALOR_PHONE } from '@/lib/valor';

/** Where the parent lands from the login link a coach sent. They set a password and go to the dashboard. */
export default function Welcome() {
  const navigate = useNavigate();
  const { checkUserAuth } = useAuth();
  const [session, setSession] = useState(undefined);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const hashError = new URLSearchParams(window.location.hash.slice(1)).get('error_description');
    if (hashError) setError(hashError);
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    if (pw.length < 8) return setError('Use at least 8 characters.');
    if (pw !== pw2) return setError('Passwords do not match.');
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (err) return setError(err.message);
    await checkUserAuth();
    navigate('/', { replace: true });
  };

  if (session === undefined) {
    return <PublicLayout title="Welcome to Valor"><div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div></PublicLayout>;
  }
  if (!session) {
    return (
      <PublicLayout title="This link has expired" subtitle="Login links from a coach work once and for 24 hours.">
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        <p className="text-sm">Ask your coach for a new one, or call or text <a className="text-primary" href={`tel:${VALOR_PHONE}`}>{VALOR_PHONE}</a>.</p>
        <p className="mt-3 text-sm">Already set a password? <Link to="/login" className="text-primary hover:underline">Log in</Link></p>
      </PublicLayout>
    );
  }
  return (
    <PublicLayout title="Welcome to Valor" subtitle={`Signed in as ${session.user.email}. Set a password so you can log back in any time.`}>
      <form onSubmit={save} className="space-y-4">
        {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <div className="space-y-1.5"><Label htmlFor="pw">Password</Label><Input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
        <div className="space-y-1.5"><Label htmlFor="pw2">Confirm password</Label><Input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></div>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save and see my athlete'}</Button>
        <button type="button" onClick={() => navigate('/')} className="w-full text-center text-xs text-muted-foreground hover:text-foreground">Skip for now</button>
      </form>
    </PublicLayout>
  );
}
