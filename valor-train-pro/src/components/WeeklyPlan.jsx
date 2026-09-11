import React, { useState, useMemo } from 'react';
import { Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function WeeklyPlan({ workouts, latest1rm }) {
  const [week, setWeek] = useState(1);
  const weeks = useMemo(() => [...new Set(workouts.map((w) => w.week))].sort((a, b) => a - b), [workouts]);

  const dayWorkouts = useMemo(() => workouts.filter((w) => w.week === week), [workouts, week]);

  const targetWeight = (ex) => {
    if (!ex.intensity) return null;
    const oneRM = latest1rm[ex.name];
    if (!oneRM) return null;
    return Math.round((oneRM * ex.intensity) / 100);
  };

  if (workouts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg">In-Season Plan · Phase Three</CardTitle>
            <p className="text-xs text-muted-foreground">2x/week · Strength & Power</p>
          </div>
          <div className="flex gap-1">
            {weeks.map((w) => (
              <button
                key={w}
                onClick={() => setWeek(w)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                  week === w ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                W{w}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {dayWorkouts.map((dw) => (
          <div key={dw.id} className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <h4 className="font-semibold">{dw.day}</h4>
              <span className="text-xs text-muted-foreground">{dw.date}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{dw.description}</p>
            <div className="mt-3 space-y-1.5">
              {dw.exercises?.map((ex, i) => {
                const target = targetWeight(ex);
                return (
                  <div key={i} className="flex flex-col gap-1 rounded-lg bg-muted/30 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="font-medium">{ex.name}</span>
                      {ex.notes && <span className="ml-2 text-xs text-muted-foreground">{ex.notes}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>{ex.sets}×{ex.reps}</span>
                      {ex.intensity ? (
                        <span className="font-medium text-primary">
                          {ex.intensity}%{target ? ` · ${target} lbs` : ''}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}