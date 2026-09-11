import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dumbbell, Apple, TrendingUp, Flame, Target, ArrowRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Home() {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({ workouts: 0, todayCalories: 0, topLift: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        const today = new Date().toISOString().slice(0, 10);

        const [workouts, logs, maxes] = await Promise.all([
          base44.entities.Workout.list('-date', 100),
          base44.entities.NutritionLog.filter({ date: today }, '-created_date', 100),
          base44.entities.OneRepMax.list('-date', 100),
        ]);

        const todayCalories = logs.reduce((s, l) => s + (l.calories || 0), 0);
        const topLift = maxes.reduce((m, r) => Math.max(m, r.weight || 0), 0);

        setStats({
          workouts: workouts.length,
          todayCalories,
          topLift,
        });
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const firstName = user?.full_name?.split(' ')[0] || 'Athlete';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const cards = [
    {
      to: '/workouts',
      icon: Dumbbell,
      title: 'Workouts',
      desc: 'View your training sessions',
      stat: `${stats.workouts} sessions`,
    },
    {
      to: '/nutrition',
      icon: Apple,
      title: 'Nutrition',
      desc: 'Track macros & meals',
      stat: `${stats.todayCalories} cal today`,
    },
    {
      to: '/progress',
      icon: TrendingUp,
      title: 'Progress',
      desc: '1-rep-max strength gains',
      stat: `${stats.topLift} lbs top`,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card to-background p-8 lg:p-10">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{greeting}, {firstName}</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight lg:text-4xl">
            Welcome back to Valor Sports Academy
          </h1>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            Train with purpose. Rise with Valor.
          </p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Dumbbell className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.workouts}</p>
              <p className="text-xs text-muted-foreground">Total Workouts</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Flame className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.todayCalories}</p>
              <p className="text-xs text-muted-foreground">Calories Today</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Target className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.topLift} <span className="text-base font-normal text-muted-foreground">lbs</span></p>
              <p className="text-xs text-muted-foreground">Top 1RM</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Navigation cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.to} to={c.to}>
            <Card className="group h-full transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <c.icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold">{c.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
                <p className="mt-3 text-xs font-medium text-primary">{c.stat}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}