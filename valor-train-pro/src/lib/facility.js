// Facility rental calendar (11/11/2026). Server: supabase/functions/facility. Every time is Pacific.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { callFn, supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

export const TZ = 'America/Los_Angeles';
const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** The Pacific date (YYYY-MM-DD) and minutes since midnight of an instant. */
export function partsPT(d) {
  const p = Object.fromEntries(dtf.formatToParts(new Date(d)).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
export const todayPT = () => partsPT(new Date()).ymd;
export const addDays = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** 1 = Monday ... 7 = Sunday */
export const weekdayOf = (ymd) => ((new Date(`${ymd}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
export const mondayOf = (ymd) => addDays(ymd, 1 - weekdayOf(ymd));
export const weekDays = (anchor) => Array.from({ length: 7 }, (_, i) => addDays(mondayOf(anchor), i));
/** The 6 weeks a month view shows, Monday first. */
export const monthDays = (anchor) => { const first = mondayOf(`${anchor.slice(0, 8)}01`); return Array.from({ length: 42 }, (_, i) => addDays(first, i)); };
export const addMonths = (ymd, n) => { const [y, m] = ymd.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 10); };

const dayFmt = (opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts });
export const fmtDay = (ymd, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => dayFmt(opts).format(new Date(`${ymd}T12:00:00Z`));
export function fmtMin(min) {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}
export const fmtSpan = (s, e) => `${fmtMin(s)} to ${fmtMin(e)}`;
export const hoursLabel = (minutes) => { const h = minutes / 60; return h === 1 ? '1 hour' : `${h} hours`; };
export const money = (cents) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
export const SPACE = { full: 'Full turf + weight room', half: 'Half the turf' };
export const priceOf = (rules, space, minutes) => Math.round(((space === 'half' ? rules?.rates?.half : rules?.rates?.full) || 0) * minutes / 60);
export const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export const timeOptions = (from, to, step = 30) => { const out = []; for (let m = from; m <= to; m += step) out.push(m); return out; };

/** A block from the server with its Pacific day and minutes: { ...b, ymd, s, e } (e = 1440 at midnight). */
export function place(b) {
  const a = partsPT(b.starts_at), z = partsPT(b.ends_at);
  return { ...b, ymd: a.ymd, s: a.min, e: z.ymd === a.ymd ? z.min : 1440 };
}

/** How much of the floor is free for a window on one day, from the blocks on screen: 2 = all, 1 = half, 0 = none. */
export function unitsFree(placed, ymd, s, e) {
  const busy = placed.filter((b) => b.ymd === ymd && b.s < e && b.e > s && b.units > 0);
  let worst = 0;
  for (const t of [s, ...busy.map((b) => b.s).filter((x) => x > s)]) {
    worst = Math.max(worst, busy.filter((b) => b.s <= t && b.e > t).reduce((n, b) => n + b.units, 0));
  }
  return 2 - worst;
}

export const facilityApi = (action, body = {}) => callFn('facility', { body: { action, ...body } });

const PENDING_KEY = ['facility-pending'];
/** Staff: how many rental requests are waiting (the badge on Facility). */
export function usePendingRentals() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: PENDING_KEY,
    enabled: user?.role === 'admin',
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { count, error } = await supabase.from('facility_blocks').select('id', { count: 'exact', head: true }).eq('status', 'pending').gt('ends_at', new Date().toISOString());
      return error ? 0 : count || 0;
    },
  });
  return data || 0;
}
export function useRefreshPendingRentals() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: PENDING_KEY });
}

/** Does this login belong to a renter group? Renter-only logins always do; a parent can too. */
export function useIsRenter() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['facility-member', user?.id],
    enabled: !!user && user.role !== 'admin' && user.role !== 'renter',
    staleTime: 5 * 60000,
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('facility_renter_members').select('renter_id').eq('user_id', user.id).limit(1);
      return !error && !!rows?.length;
    },
  });
  return user?.role === 'renter' || !!data;
}
