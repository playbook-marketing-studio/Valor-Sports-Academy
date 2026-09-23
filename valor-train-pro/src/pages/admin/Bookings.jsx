import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Loader2, RefreshCw, Search } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { fmtSlot, money } from '@/lib/slots';
import { cn } from '@/lib/utils';

const PAY = { paid: 'bg-green-500/15 text-green-400', pending: 'bg-amber-500/15 text-amber-400', unpaid: 'bg-muted text-muted-foreground', waived: 'bg-sky-500/15 text-sky-400', refunded: 'bg-rose-500/15 text-rose-400' };
const STATUS = ['booked', 'requested', 'attended', 'no_show', 'canceled'];

export default function AdminBookings() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('open');
  const [busy, setBusy] = useState('');
  const [fee, setFee] = useState(null);

  const load = async () => {
    setLoading(true);
    const [{ data, error }, { data: s }] = await Promise.all([
      supabase.from('bookings_admin').select('*').order('slot_start', { ascending: true, nullsFirst: false }).limit(500),
      supabase.from('settings').select('value').eq('key', 'assessment').maybeSingle(),
    ]);
    if (error) toast({ title: 'Could not load bookings', description: error.message });
    setRows(data || []);
    setFee(s?.value?.fee_cents ?? null);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'open' && !['booked', 'requested'].includes(r.status)) return false;
      if (filter === 'unpaid' && r.payment_status === 'paid') return false;
      if (filter === 'unpaid' && !['booked', 'requested', 'attended'].includes(r.status)) return false;
      if (!term) return true;
      return [r.athlete_first_name, r.athlete_last_name, r.parent_name, r.parent_email, r.parent_phone, r.sport].join(' ').toLowerCase().includes(term);
    });
  }, [rows, q, filter]);

  const patch = async (id, values, label) => {
    setBusy(id + label);
    const { error } = await supabase.from('bookings').update(values).eq('id', id);
    if (error) toast({ title: 'Update failed', description: error.message });
    else { toast({ title: label }); await load(); }
    setBusy('');
  };

  const markPaid = (r) => patch(r.id, { payment_status: 'paid', payment_method: r.payment_method || 'in_person', paid_at: new Date().toISOString(), marked_paid_by: user.id }, `Marked ${r.athlete_first_name} paid`);
  const unmark = (r) => patch(r.id, { payment_status: 'unpaid', paid_at: null, marked_paid_by: null }, 'Marked unpaid');
  const setStatus = (r, status) => patch(r.id, { status }, `Set to ${status.replace('_', ' ')}`);

  const saveFee = async () => {
    const cents = Math.round(Number(fee));
    if (!Number.isFinite(cents) || cents < 0) return;
    const { data: cur } = await supabase.from('settings').select('value').eq('key', 'assessment').maybeSingle();
    const { error } = await supabase.from('settings').update({ value: { ...(cur?.value || {}), fee_cents: cents } }).eq('key', 'assessment');
    toast(error ? { title: 'Could not save fee', description: error.message } : { title: `Assessment fee is now ${money(cents)}` });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-tight lg:text-3xl">Assessments</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every booking from the form. Mark in-person payments here; online payments mark themselves.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2"><RefreshCw className="h-4 w-4" /> Refresh</Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search athlete, parent, email, phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {[['open', 'Upcoming'], ['unpaid', 'Unpaid'], ['all', 'All']].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={cn('rounded-lg px-3 py-2 text-sm font-medium', filter === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : shown.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{r.athlete_first_name} {r.athlete_last_name || ''}</p>
                    {r.athlete_age && <span className="text-xs text-muted-foreground">age {r.athlete_age}</span>}
                    {r.sport && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{r.sport}</span>}
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', PAY[r.payment_status] || PAY.unpaid)}>
                      {r.payment_status}{r.payment_method ? ` · ${r.payment_method.replace('_', ' ')}` : ''}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{r.status.replace('_', ' ')}</span>
                  </div>
                  <p className="text-sm">{fmtSlot(r.slot_start)}{r.requested_note ? ` · "${r.requested_note}"` : ''}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.parent_name} · {r.parent_email}{r.parent_phone ? ` · ${r.parent_phone}` : ''}{r.how_heard ? ` · heard via ${r.how_heard}` : ''}
                    {!r.parent_id && ' · no account yet'}
                    {r.paid_at && ` · paid ${new Date(r.paid_at).toLocaleDateString()}${r.marked_paid_by_name ? ` by ${r.marked_paid_by_name}` : ' via Stripe'}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{money(r.amount_cents, r.currency)}</span>
                  {r.payment_status !== 'paid' ? (
                    <Button size="sm" onClick={() => markPaid(r)} disabled={!!busy} className="gap-1"><BadgeCheck className="h-4 w-4" /> Mark paid</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => unmark(r)} disabled={!!busy}>Undo paid</Button>
                  )}
                  <select value={r.status} onChange={(e) => setStatus(r, e.target.value)} disabled={!!busy}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                    {STATUS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="fee">Assessment fee (cents)</Label>
            <Input id="fee" type="number" className="w-40" value={fee ?? ''} onChange={(e) => setFee(e.target.value)} />
          </div>
          <Button variant="outline" onClick={saveFee}>Save fee</Button>
          <p className="text-xs text-muted-foreground">Shown on the booking form and charged by Stripe. {fee != null && `Currently ${money(Number(fee))}.`}</p>
        </CardContent>
      </Card>
    </div>
  );
}
