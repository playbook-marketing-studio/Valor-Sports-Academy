import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dumbbell, Apple, TrendingUp, Flame, Target, ArrowRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { fmtSlot, money } from '@/lib/slots';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Home() {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({ workouts: 0, todayCalories: 0, topLift: 0 });
  const [athletes, setAthletes] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        const today = new Date().toISOString().slice(0, 10);

        const [workouts, logs, maxes, kids, bks] = await Promise.all([
          base44.entities.Workout.list('-date', 100),
          base44.entities.NutritionLog.filter({ date: today }, '-created_date', 100),
          base44.entities.OneRepMax.list('-date', 100),
          me.role === 'admin' ? [] : base44.entities.Athlete.list('first_name', 20).catch(() => []),
          me.role === 'admin' ? [] : base44.entities.Booking.list('-created_date', 20).catch(() => []),
        ]);
        setAthletes(kids);
        setBookings(bks);

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
      <div className="relative overflow-hidden rounded-[22px] bg-[#16140f] p-8 text-white lg:p-10">
        <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full bg-primary/30 blur-3xl" />
        <div className="relative">
          <p className="inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[0.16em] text-[#ff7484]"><span className="inline-block h-0.5 w-7 rounded bg-[#ff7484]" />{greeting}, {firstName}</p>
          <h1 className="mt-3 font-display text-4xl lg:text-5xl">
            Train with purpose.<br /><span className="text-[#ff7484]">Rise with Valor.</span>
          </h1>
          <p className="mt-3 max-w-md text-sm text-white/70">
            Your workouts, nutrition and lifts in one place.
          </p>
        </div>
      </div>

      {/* Athletes + assessment status (parents) */}
      {(athletes.length > 0 || bookings.length > 0) && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Your athletes</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {athletes.map((a) => {
              const b = bookings.find((x) => x.athlete_id === a.id) || null;
              return (
                <div key={a.id} className="flex flex-col gap-1 rounded-lg bg-muted/30 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="font-medium">{a.first_name} {a.last_name || ''}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{[a.age && `age ${a.age}`, a.sport].filter(Boolean).join(' · ')}</span>
                  </div>
                  {b && (
                    <div className="text-xs text-muted-foreground">
                      Assessment {fmtSlot(b.slot_start)} ·{' '}
                      {b.payment_status === 'paid' ? <span className="text-green-500">paid</span>
                        : b.payment_method === 'in_person' ? `${money(b.amount_cents, b.currency)} due at the session`
                        : <Link to={`/book/pay?b=${b.id}&t=${b.claim_token}`} className="text-primary hover:underline">choose how to pay</Link>}
                    </div>
                  )}
                </div>
              );
            })}
            <Link to="/book" className="inline-block text-xs text-primary hover:underline">Book an assessment for another athlete</Link>
          </CardContent>
        </Card>
      )}

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
                <h3 className="mt-4 font-display text-lg ">{c.title}</h3>
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