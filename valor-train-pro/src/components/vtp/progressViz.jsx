import React, { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { Sparkline, EmptyState } from '@/components/vtp';
import { metricDelta } from '@/lib/valor';

/**
 * Assessment results over time, one row per metric: a sparkline across every
 * test plus a first -> latest delta chip. Shared by the parent Progress page
 * and the staff athlete Progress tab so both read the same real assessment
 * rows the same way.
 */
export function AssessmentTrends({ assessments = [], metrics = [] }) {
  const rows = useMemo(() => {
    const sorted = [...assessments].sort((a, b) => a.date.localeCompare(b.date));
    return metrics
      .map((m) => {
        const points = sorted.filter((a) => a.metrics?.[m.key] != null).map((a) => ({ date: a.date, value: Number(a.metrics[m.key]) }));
        if (!points.length) return null;
        const first = points[0];
        const latest = points[points.length - 1];
        const delta = points.length > 1 ? metricDelta(latest.value, first.value, m.unit) : null;
        return { ...m, points, first, latest, delta };
      })
      .filter(Boolean);
  }, [assessments, metrics]);

  if (!rows.length) {
    return <EmptyState icon={TrendingUp} title="No test results yet" message="Results from the assessment day show up here, with a trend line once there's more than one." />;
  }

  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {rows.map((r) => (
        <div key={r.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{r.label}</p>
            <p className="text-xs text-muted-foreground">
              {r.first.date === r.latest.date ? (
                <>First test · {r.latest.value}{r.unit || ''}</>
              ) : (
                <>{r.first.value}{r.unit || ''} <span className="mx-0.5">&rarr;</span> {r.latest.value}{r.unit || ''}</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Sparkline data={r.points.map((p) => p.value)} width={90} height={28} />
            {r.delta && (
              <span className={r.delta.tone === 'good' ? 'text-xs font-semibold text-green-600 dark:text-green-400' : r.delta.tone === 'bad' ? 'text-xs font-semibold text-destructive' : 'text-xs font-semibold text-muted-foreground'}>
                {r.delta.label}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Max lifts as big tiles: the latest weight per lift, a trend line from
 * earlier maxes, and the change since the previous entry. Shared by the
 * parent Progress page and the staff athlete Progress tab.
 */
export function MaxLiftTrends({ maxes = [] }) {
  const lifts = useMemo(() => {
    const byName = {};
    [...maxes].sort((a, b) => a.date.localeCompare(b.date)).forEach((m) => {
      (byName[m.exercise_name] = byName[m.exercise_name] || []).push(m);
    });
    return Object.entries(byName)
      .map(([name, entries]) => {
        const latest = entries[entries.length - 1];
        const prev = entries.length > 1 ? entries[entries.length - 2] : null;
        const delta = prev ? metricDelta(latest.weight, prev.weight, null) : null;
        return { name, entries, latest, delta };
      })
      .sort((a, b) => b.latest.weight - a.latest.weight);
  }, [maxes]);

  if (!lifts.length) {
    return <EmptyState icon={TrendingUp} title="No max lifts logged yet" message="Add a max lift and it shows up here as a tile, with a trend line once there's a history." />;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {lifts.map((l) => (
        <div key={l.name} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{l.name}</p>
              <p className="stat-number mt-1 text-3xl text-foreground">{l.latest.weight}<span className="ml-1 font-body text-sm font-normal text-muted-foreground">lbs</span></p>
              {l.delta && (
                <p className={l.delta.tone === 'good' ? 'mt-1 text-xs font-semibold text-green-600 dark:text-green-400' : 'mt-1 text-xs font-semibold text-muted-foreground'}>
                  {l.delta.label} lbs since last
                </p>
              )}
            </div>
            {l.entries.length > 1 && <Sparkline data={l.entries.map((e) => e.weight)} width={72} height={40} />}
          </div>
        </div>
      ))}
    </div>
  );
}
