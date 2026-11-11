import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { shareCheckout, startEnrollment } from '@/lib/enroll';
import { Send } from 'lucide-react';
import { defaultItem, priceLabel } from '@/lib/valor';
import { useViewAs } from '@/lib/ViewAsContext';
import { autopayTerms, isMonthlyItem, monthlyFor, money } from '@/lib/autopay';
import { cn } from '@/lib/utils';

const classesLine = (p) => (p.classes == null ? 'Unlimited classes' : isMonthlyItem(p) ? `${p.classes} classes a month` : `${p.classes} class${p.classes === 1 ? '' : 'es'}`);

/**
 * A family picks a plan and pays for one athlete: a monthly autopay plan (charged on the 1st) or a one-time
 * class or pack. Every athlete gets the same thing (Omar 11/11/2026: a dropdown for one kid and a button for
 * another read like two different features): the plans as rows with their price, the coach's pick marked and
 * already selected, then one button. `compact` is the one-line version for tight spots (a dropdown only when
 * there is nothing to preselect).
 */
export default function EnrollButton({ athlete, cfg, recommendedKey, coachPick, label, compact = false }) {
  const initial = defaultItem(cfg, recommendedKey);
  const [key, setKey] = useState(initial?.key || '');
  // the price list and the coach's recommendation load after first render; pick them up when they arrive
  useEffect(() => { if (!key && initial?.key) setKey(initial.key); }, [initial?.key, key]);
  const [busy, setBusy] = useState(''); // '' | 'pay' | 'share'
  const { isActive: viewingAsFamily } = useViewAs();
  if (!cfg?.items?.length) return null;
  // Read-only in view-as mode: no payment can be started from here.
  if (viewingAsFamily) {
    return <span className="text-xs text-muted-foreground">{label || 'Start autopay'} (off in read-only view)</span>;
  }
  const items = [...cfg.items].sort((a, b) => Number(isMonthlyItem(b)) - Number(isMonthlyItem(a))); // monthly plans first
  const program = items.find((p) => p.key === key);
  const monthly = isMonthlyItem(program);
  const many = items.length > 1;
  const payText = busy === 'pay' ? 'One moment…'
    : !program ? 'Pick a plan'
      : monthly ? `Start autopay · ${money(program.amount_cents)}/mo`
        : `${label || 'Pay'} · ${money(program.amount_cents)}`;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', !compact && 'w-full')}>
      {many && !compact && (
        <div className="w-full space-y-1.5">
          {items.map((p) => (
            <button key={p.key} type="button" aria-pressed={key === p.key} onClick={() => setKey(p.key)}
              className={cn('flex w-full items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2.5 text-left', key === p.key ? 'border-2 border-primary bg-primary/5' : 'border-border hover:border-primary/40')}>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{p.name}{coachPick === p.key && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">Coach's pick</span>}</span>
                <span className="block text-xs text-muted-foreground">{classesLine(p)} · {isMonthlyItem(p) ? 'autopay on the 1st' : 'one time'}</span>
              </span>
              <span className="shrink-0 font-display text-lg">{money(p.amount_cents)}{isMonthlyItem(p) ? '/mo' : ''}</span>
            </button>
          ))}
        </div>
      )}
      {many && compact && !initial && (
        <select aria-label={`Plan for ${athlete.first_name}`} value={key} onChange={(e) => setKey(e.target.value)} className="h-9 rounded-full border border-input bg-background px-3 text-sm">
          <option value="">Pick a plan</option>
          {items.map((p) => <option key={p.key} value={p.key}>{p.name} · {priceLabel(p)}</option>)}
        </select>
      )}
      <Button size="sm" disabled={!program || !!busy} onClick={async () => { setBusy('pay'); await startEnrollment(athlete, program.key); setBusy(''); }}>{payText}</Button>
      {/* the athlete at the gym, the parent paying from home: text them the checkout link */}
      <Button size="sm" variant="outline" className="gap-1" disabled={!program || !!busy} onClick={async () => { setBusy('share'); await shareCheckout(athlete, program.key, program.name); setBusy(''); }}>
        <Send className="h-3.5 w-3.5" /> {busy === 'share' ? 'One moment…' : 'Send to whoever pays'}
      </Button>
      {monthly && <p className="w-full text-xs text-muted-foreground">{autopayTerms(program, monthlyFor(athlete, cfg.monthly))}</p>}
    </div>
  );
}
