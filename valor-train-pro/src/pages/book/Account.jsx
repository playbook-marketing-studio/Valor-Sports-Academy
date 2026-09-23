import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { callFn } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import BookLayout from './BookLayout';
import { fmtSlot } from '@/lib/slots';

export default function BookAccount() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const b = params.get('b'), t = params.get('t');
  const { isAuthenticated, isLoadingAuth, user } = useAuth();
  const [booking, setBooking] = useState(null);
  const [mode, setMode] = useState('signup'); // signup | login
  const [form, setForm] = useState({ email: '', password: '', confirm: '', full_name: '', phone: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!b || !t) { setError('This link is missing the booking. Start again.'); return; }
    callFn('booking', { method: 'GET', query: { action: 'get', id: b, t } })
      .then((r) => {
        setBooking(r.booking);
        setForm((f) => ({ ...f, email: r.booking.parent_email || '', full_name: r.booking.parent_name || '', phone: r.booking.parent_phone || '' }));
      })
      .catch((e) => setError(e.message));
  }, [b, t]);

  const claim = async () => {
    const r = await callFn('booking', { body: { action: 'claim', id: b, t } });
    navigate(`/book/pay?b=${b}&t=${t}`, { state: { booking: r.booking, stripe_configured: r.stripe_configured } });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (mode === 'signup' && form.password !== form.confirm) { setError('Passwords do not match'); return; }
    if (mode === 'signup' && form.password.length < 8) { setError('Use at least 8 characters'); return; }
    setBusy(true);
    try {
      if (mode === 'signup') await base44.auth.register({ email: form.email, password: form.password, full_name: form.full_name, phone: form.phone, role: 'parent' });
      else await base44.auth.loginViaEmailPassword(form.email, form.password);
      await claim();
    } catch (err) {
      const msg = err.message || 'Something went wrong';
      if (/already registered|already exists/i.test(msg)) { setMode('login'); setError('That email already has an account. Log in to continue.'); }
      else setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const useCurrent = async () => {
    setBusy(true); setError('');
    try { await claim(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const athlete = booking ? [booking.athlete_first_name, booking.athlete_last_name].filter(Boolean).join(' ') : '';

  return (
    <BookLayout step={1} title={mode === 'signup' ? 'Create your parent account' : 'Log in to continue'}
      subtitle={booking ? `${athlete}'s assessment: ${fmtSlot(booking.slot_start)}. This login owns ${booking.athlete_first_name}'s training data.` : ''}>
      {error && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {!isLoadingAuth && isAuthenticated && booking && (
        <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <p>You are signed in as <span className="font-medium">{user.email}</span>.</p>
          <Button className="mt-3" onClick={useCurrent} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Attach ${booking.athlete_first_name}'s booking to this account`}</Button>
          <p className="mt-2 text-xs text-muted-foreground">Not you? Sign out from the app menu and come back to this link.</p>
        </div>
      )}

      {booking && (
        <form onSubmit={submit} className="space-y-4">
          {mode === 'signup' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="fn">Your name</Label><Input id="fn" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ph">Phone</Label><Input id="ph" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
          )}
          <div className="space-y-1.5"><Label htmlFor="em">Email</Label><Input id="em" type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="pw">Password</Label><Input id="pw" type="password" required autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          {mode === 'signup' && (
            <div className="space-y-1.5"><Label htmlFor="cp">Confirm password</Label><Input id="cp" type="password" required autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></div>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> One moment…</> : mode === 'signup' ? 'Create account and continue' : 'Log in and continue'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {mode === 'signup' ? 'Already have a Valor account? ' : 'New here? '}
            <button type="button" className="text-primary hover:underline" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); }}>
              {mode === 'signup' ? 'Log in' : 'Create an account'}
            </button>
          </p>
        </form>
      )}
      {!booking && !error && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
    </BookLayout>
  );
}
