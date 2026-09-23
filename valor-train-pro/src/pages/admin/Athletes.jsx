import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { athleteName } from '@/lib/valor';
import { cn } from '@/lib/utils';

export function loginState(a) {
  if (a.parent_last_sign_in_at) return { label: 'Parent active', cls: 'bg-green-100 text-green-800' };
  if (a.invited_at) return { label: 'Login sent', cls: 'bg-amber-100 text-amber-900' };
  return { label: 'No login yet', cls: 'bg-muted text-muted-foreground' };
}

export default function AdminAthletes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    supabase.from('athletes_admin').select('*').order('created_at', { ascending: false }).limit(1000)
      .then(({ data }) => { setRows(data || []); setLoading(false); });
  }, []);

  const term = q.trim().toLowerCase();
  const shown = rows.filter((a) => !term || [a.first_name, a.last_name, a.parent_name, a.parent_email, a.parent_login_email, a.sport].join(' ').toLowerCase().includes(term));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl">Athletes</h1>
        <p className="mt-1 text-sm text-muted-foreground">Everyone who has booked or walked in. Open one to record results, send the parent a login or take payment.</p>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search athlete, parent, email, sport" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
        <div className="space-y-2">
          {shown.map((a) => {
            const ls = loginState(a);
            return (
              <Link key={a.id} to={`/admin/athletes/${a.id}`}>
                <Card className="transition hover:border-primary/50">
                  <CardContent className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="font-semibold">{athleteName(a)}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{[a.age && `age ${a.age}`, a.sport, a.parent_name].filter(Boolean).join(' · ')}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className={cn('rounded-full px-2 py-0.5 font-medium', ls.cls)}>{ls.label}</span>
                      <span className={cn('rounded-full px-2 py-0.5 font-medium', a.last_paid_plan ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground')}>{a.last_paid_plan ? a.last_paid_plan.split(' · ')[0] : 'Not signed up'}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
          {shown.length === 0 && <p className="py-16 text-center text-sm text-muted-foreground">No athletes yet.</p>}
        </div>
      )}
    </div>
  );
}
