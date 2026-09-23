import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { startEnrollment } from '@/lib/enroll';
import { defaultItem, priceLabel } from '@/lib/valor';
import { money } from '@/lib/slots';

/**
 * Parent's "Enroll and pay" for one athlete: a one-time class or class pack. Uses the coach's
 * recommendation, or the only item; otherwise shows a small picker.
 */
export default function EnrollButton({ athlete, cfg, recommendedKey, label }) {
  const initial = defaultItem(cfg, recommendedKey);
  const [key, setKey] = useState(initial?.key || '');
  const [busy, setBusy] = useState(false);
  const program = cfg?.items?.find((p) => p.key === key);
  const needsPick = !initial && (cfg?.items?.length || 0) > 1;
  if (!cfg?.items?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {needsPick && (
        <select aria-label={`Program for ${athlete.first_name}`} value={key} onChange={(e) => setKey(e.target.value)} className="h-9 rounded-full border border-input bg-background px-3 text-sm">
          <option value="">Pick a class or pack</option>
          {cfg.items.map((p) => <option key={p.key} value={p.key}>{p.name} · {priceLabel(p)}</option>)}
        </select>
      )}
      <Button size="sm" disabled={!program || busy} onClick={async () => { setBusy(true); await startEnrollment(athlete, program.key); setBusy(false); }}>
        {busy ? 'One moment…' : `${label || 'Enroll and pay'}${program ? ` · ${money(program.amount_cents)}` : ''}`}
      </Button>
    </div>
  );
}
