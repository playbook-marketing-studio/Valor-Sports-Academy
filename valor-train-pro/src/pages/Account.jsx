import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Receipt, Wallet } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useViewAs } from '@/lib/ViewAsContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, EmptyState } from '@/components/vtp';
import EnrollButton from '@/components/EnrollButton';
import AutopayCard from '@/components/AutopayCard';
import { athleteName, classesLeft, countsAsEnrollment, loadSettings, VALOR_PHONE } from '@/lib/valor';
import { currentSub, fmtDay, money, suggestedPlanKey } from '@/lib/autopay';

const METHOD = { card: 'Card', cash: 'Cash', venmo: 'Venmo', other: 'Other' };
const STATUS = { paid: '', refunded: 'Refunded', canceled: 'Canceled', pending: 'Not finished' };

/**
 * Account & billing, always there for every athlete (Omar 10/21/2026: "every athlete should be able to
 * look at their account"). Stage, program, classes left or who created the athlete never hide it;
 * the program only changes the line at the top. Shows the current plan or "no plan yet", next charge,
 * payment history, and the one right action: Start autopay with no active autopay, Update card + the
 * cancel rule with one. Staff "view as athlete" sees it read-only.
 */
export default function Account() {
  const { user } = useAuth();
  const viewAs = useViewAs();
  const [state, setState] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (viewAs.isActive && !viewAs.athlete) return;
    (async () => {
      const { data: kids } = viewAs.isActive
        ? { data: [viewAs.athlete] }
        : await supabase.from('athletes').select('*').is('archived_at', null).order('first_name');
      const ids = (kids || []).map((k) => k.id);
      if (!ids.length) { setState({ kids: [] }); return; }
      const [{ data: pays }, { data: subs }, { data: progs }, { data: as }, settings] = await Promise.all([
        supabase.from('payments').select('*').in('athlete_id', ids).order('created_at', { ascending: false }),
        supabase.from('subscriptions').select('*').in('athlete_id', ids).order('created_at', { ascending: false }),
        supabase.from('program_assignments').select('athlete_id, program_templates(name)').in('athlete_id', ids),
        supabase.from('assessments').select('athlete_id, recommended_plan, date').in('athlete_id', ids).order('date', { ascending: false }),
        loadSettings(),
      ]);
      setState({ kids, pays: pays || [], subs: subs || [], progs: progs || [], as: as || [], settings });
    })();
  }, [reload, viewAs.isActive, viewAs.athlete]);

  if (!viewAs.isActive && user?.role === 'admin') {
    return <EmptyState icon={Wallet} title="This is the family's account page" message="Staff see each family's billing on the athlete page, or open View as athlete to see exactly what they see." to="/admin/view-as-athlete" actionLabel="View as athlete" />;
  }
  if (!state) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!state.kids.length) {
    return <EmptyState icon={Wallet} title="No athlete on this login yet" message={`Your athlete shows up here once a coach links them to your login. Questions? Call or text ${VALOR_PHONE}.`} to="/" actionLabel="Back to home" />;
  }
  const cfg = state.settings?.enrollment;
  const commitment = cfg?.monthly?.commitment_months ?? 3;

  return (
    <div className="space-y-6">
      <PageHeader title="Account" subtitle="Your plan, payments and card for each athlete." />
      {state.kids.map((a) => {
        const sub = currentSub(state.subs.filter((x) => x.athlete_id === a.id));
        const pays = state.pays.filter((x) => x.athlete_id === a.id && x.status !== 'pending');
        const packs = pays.filter(countsAsEnrollment);
        const left = packs.reduce((n, x) => (n == null || classesLeft(x) == null ? null : n + classesLeft(x)), 0);
        const program = state.progs.find((x) => x.athlete_id === a.id)?.program_templates?.name;
        const rec = state.as.find((x) => x.athlete_id === a.id)?.recommended_plan;
        const isParent = viewAs.isActive || a.parent_id === user?.id;
        const top = sub
          ? sub.status === 'past_due' ? `${a.first_name}'s last monthly payment didn't go through. Update the card below.` : `${a.first_name} is on monthly autopay.`
          : packs.length ? `${a.first_name} has a class pack.` : program ? `${a.first_name} trains in ${program}. Set up the monthly plan to keep it going.` : `${a.first_name} doesn't have a plan yet.`;
        return (
          <Card key={a.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">{athleteName(a)}</CardTitle>
              <p className="text-sm text-muted-foreground">{top}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current plan</p>
                {sub ? (
                  <AutopayCard sub={sub} commitmentMonths={commitment} readOnly={viewAs.isActive || !isParent} onChanged={() => setReload((n) => n + 1)} />
                ) : (
                  <div className="space-y-3 rounded-lg border border-border px-3 py-3">
                    <p className="text-sm">{packs.length ? `Class pack · ${left == null ? 'unlimited classes' : `${left} class${left === 1 ? '' : 'es'} left`}` : 'No plan yet.'}</p>
                    {viewAs.isActive ? <p className="text-xs text-muted-foreground">Start autopay shows here for the family (off in read-only view).</p>
                      : isParent ? <EnrollButton athlete={a} cfg={cfg} recommendedKey={rec || suggestedPlanKey(a, cfg)} />
                      : <p className="text-xs text-muted-foreground">Ask your parent to start the monthly plan from their login.</p>}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Receipt className="h-3.5 w-3.5" /> Payment history</p>
                {pays.length === 0 ? <p className="text-sm text-muted-foreground">No payments yet.</p> : (
                  <div className="divide-y divide-border overflow-hidden rounded-lg border border-border text-sm">
                    {pays.map((p) => (
                      <div key={p.id} className="flex items-start justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate">{String(p.description || '').split(' · ')[0] || 'Payment'}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.paid_at ? fmtDay(p.paid_at) : fmtDay(p.created_at)} · {p.kind === 'subscription' ? 'Autopay' : METHOD[p.method] || p.method}
                            {p.classes_total ? ` · ${p.classes_used}/${p.classes_total} classes used` : ''}{STATUS[p.status] ? ` · ${STATUS[p.status]}` : ''}
                          </p>
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums">{money(p.amount_cents)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
      <p className="text-center text-xs text-muted-foreground">Questions about a charge? <Link to={viewAs.isActive ? '#' : '/messages'} className="underline">Message us</Link> or call or text <a href={`sms:${VALOR_PHONE.replace(/\D/g, '')}`} className="underline">{VALOR_PHONE}</a>.</p>
    </div>
  );
}
