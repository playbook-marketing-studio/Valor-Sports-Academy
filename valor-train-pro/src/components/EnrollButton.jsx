import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { startEnrollment } from '@/lib/enroll';
import { defaultProgram, priceLabel } from '@/lib/valor';

/**
 * Parent's "Enroll and pay" for one athlete. Uses the coach's recommended program when it is one,
 * or the only program; otherwise shows a small picker. Price reads "$199/mo" or "$199 one time"
 * depending on the billing switch.
 */
export default function EnrollButton({ athlete, cfg, recommendedKey, label }) {
  const initial = defaultProgram(cfg, recommendedKey);
  const [key, setKey] = useState(initial?.key || '');
  const [busy, setBusy] = useState(false);
  const program = cfg?.programs?.find((p) => p.key === key);
  const needsPick = !initial && (cfg?.programs?.length || 0) > 1;
  if (!cfg?.programs?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {needsPick && (
        <select aria-label={`Program for ${athlete.first_name}`} value={key} onChange={(e) => setKey(e.target.value)} className="h-9 rounded-full border border-input bg-background px-3 text-sm">
          <option value="">Pick a program</option>
          {cfg.programs.map((p) => <option key={p.key} value={p.key}>{p.name} · {priceLabel(cfg, p)}</option>)}
        </select>
      )}
      <Button size="sm" disabled={!program || busy} onClick={async () => { setBusy(true); await startEnrollment(athlete, program.key); setBusy(false); }}>
        {busy ? 'One moment…' : `${label || 'Enroll and pay'}${program ? ` · ${priceLabel(cfg, program)}` : ''}`}
      </Button>
    </div>
  );
}
