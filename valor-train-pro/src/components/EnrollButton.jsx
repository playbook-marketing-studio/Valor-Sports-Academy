import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { shareCheckout, startEnrollment } from '@/lib/enroll';
import { Send } from 'lucide-react';
import { defaultItem, priceLabel } from '@/lib/valor';
import { money } from '@/lib/slots';
import { useViewAs } from '@/lib/ViewAsContext';
import { autopayTerms, isMonthlyItem, monthlyFor, money as perMonth } from '@/lib/autopay';

/**
 * Parent's "Enroll and pay" for one athlete: a one-time class or pack, or a monthly autopay plan
 * (charged on the 1st). Uses the coach's recommendation, or the only item; otherwise a small picker.
 */
export default function EnrollButton({ athlete, cfg, recommendedKey, label }) {
  const initial = defaultItem(cfg, recommendedKey);
  const [key, setKey] = useState(initial?.key || '');
  // the price list and the coach's recommendation load after first render; pick them up when they arrive
  useEffect(() => { if (!key && initial?.key) setKey(initial.key); }, [initial?.key, key]);
  const [busy, setBusy] = useState(''); // '' | 'pay' | 'share'
  const program = cfg?.items?.find((p) => p.key === key);
  const needsPick = !initial && (cfg?.items?.length || 0) > 1;
  const { isActive: viewingAsFamily } = useViewAs();
  if (!cfg?.items?.length) return null;
  // Read-only in view-as mode: no payment can be started from here.
  if (viewingAsFamily) {
    return <span className="text-xs text-muted-foreground">{label || 'Enroll and pay'} (off in read-only view)</span>;
  }
  const monthly = isMonthlyItem(program);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {needsPick && (
        <select aria-label={`Program for ${athlete.first_name}`} value={key} onChange={(e) => setKey(e.target.value)} className="h-9 rounded-full border border-input bg-background px-3 text-sm">
          <option value="">Pick a class or pack</option>
          {cfg.items.map((p) => <option key={p.key} value={p.key}>{p.name} · {priceLabel(p)}</option>)}
        </select>
      )}
      <Button size="sm" disabled={!program || !!busy} onClick={async () => { setBusy('pay'); await startEnrollment(athlete, program.key); setBusy(''); }}>
        {busy === 'pay' ? 'One moment…' : monthly ? `Start autopay · ${perMonth(program.amount_cents)}/mo` : `${label || 'Enroll and pay'}${program ? ` · ${money(program.amount_cents)}` : ''}`}
      </Button>
      {/* the athlete at the gym, the parent paying from home: text them the checkout link */}
      <Button size="sm" variant="outline" className="gap-1" disabled={!program || !!busy} onClick={async () => { setBusy('share'); await shareCheckout(athlete, program.key, program.name); setBusy(''); }}>
        <Send className="h-3.5 w-3.5" /> {busy === 'share' ? 'One moment…' : 'Send to whoever pays'}
      </Button>
      {monthly && <p className="w-full text-xs text-muted-foreground">{autopayTerms(program, monthlyFor(athlete, cfg.monthly))}</p>}
    </div>
  );
}
