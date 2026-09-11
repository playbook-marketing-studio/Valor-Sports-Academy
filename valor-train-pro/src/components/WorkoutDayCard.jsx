import React from 'react';
import { Calendar, CheckCircle2, Play } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const today = new Date().toISOString().slice(0, 10);

export default function WorkoutDayCard({ workout, latest1rm, isCompleted, onLog }) {
  const isToday = workout.date === today;
  const done = isCompleted(workout);
  const focus = workout.title.replace(/^Week \d+ - /, '');

  return (
    <Card className={cn('overflow-hidden', isToday && 'border-primary')}>
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{workout.day}</p>
          <h3 className="font-display text-xl font-bold">{focus}</h3>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="flex items-center gap-1 text-xs text-muted-foreground"><Calendar className="h-3 w-3" />{workout.date}</span>
          {isToday && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">Today</span>}
          {done && <span className="flex items-center gap-1 text-xs text-green-500"><CheckCircle2 className="h-3 w-3" />Done</span>}
        </div>
      </div>

      <CardContent className="p-0">
        {workout.description && <p className="px-5 pt-4 text-xs text-muted-foreground">{workout.description}</p>}
        <div className="divide-y divide-border">
          {workout.exercises?.map((ex, i) => {
            const target = ex.intensity && latest1rm[ex.name] ? Math.round((latest1rm[ex.name] * ex.intensity) / 100) : null;
            return (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{ex.name}</p>
                  {ex.notes && <p className="truncate text-xs text-muted-foreground">{ex.notes}</p>}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="rounded-md bg-muted px-2 py-1 font-medium">{ex.sets}×{ex.reps}</span>
                  {ex.intensity ? (
                    <span className="font-semibold text-primary">{target ? `${target}lbs` : `${ex.intensity}%`}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-4">
          <Button className="w-full gap-2" onClick={() => onLog(workout)} variant={done ? 'outline' : 'default'}>
            <Play className="h-4 w-4" /> {done ? 'Log Again' : 'Start Workout'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}