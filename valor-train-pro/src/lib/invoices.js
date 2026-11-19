// Helpers for the coach Invoicing pages (server: fn invoices).
import { callFn } from '@/api/supabaseClient';

export const invoicesApi = (action, body = {}) => callFn('invoices', { body: { action, ...body } });

export const money = (c) => `$${((c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const todayYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
/** "Nov 26" from YYYY-MM-DD (a date, no time zone shift). */
export const fmtYmd = (ymd, withYear = false) => {
  if (!ymd) return '';
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
};
/** "Nov 26" from a timestamp, Pacific. */
export const fmtTs = (ts) => (ts ? new Date(ts).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' }) : '');
export const monthKey = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit' }).format(new Date(ts));
export const monthLabel = (key) => { const [y, m] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }); };

export const STATUS = {
  draft: { label: 'Draft', tone: 'muted' },
  waiting: { label: 'Waiting', tone: 'warning' },
  open: { label: 'Waiting', tone: 'warning' },
  overdue: { label: 'Overdue', tone: 'danger' },
  paid: { label: 'Paid', tone: 'success' },
  refunded: { label: 'Refunded', tone: 'muted' },
  void: { label: 'Voided', tone: 'muted' },
  voided: { label: 'Voided', tone: 'muted' },
  uncollectible: { label: 'Not collected', tone: 'danger' },
};
export const TONE = {
  muted: 'border-border bg-muted text-muted-foreground',
  warning: 'border-warning-border bg-warning-surface text-warning',
  danger: 'border-danger-border bg-danger-surface text-danger',
  success: 'border-success-border bg-success-surface text-success',
};
export const statusOf = (inv) => (inv.status === 'open' && inv.overdue ? 'overdue' : inv.status === 'paid' && inv.refunded_cents ? 'refunded' : inv.status);
export const PAID_HOW = { cash: 'Cash', venmo: 'Venmo', check: 'Check', other: 'Other', card: 'Card' };
export const SOURCE = { invoice: 'Invoice', autopay: 'Autopay', payment: 'Class or pack' };

// Repeating invoices (11/19)
export const EVERY = { week: 'Every week', '2weeks': 'Every 2 weeks', month: 'Every month' };
export const EVERY_SHORT = { week: 'weekly', '2weeks': 'every 2 weeks', month: 'monthly' };
export const MODE = { send: 'Sends automatically', draft: 'Makes a draft to check', booked: 'Drafts their booked days' };
/** Same rule as the server: weekly +7, every 2 weeks +14, monthly the same day next month (31st -> last day). */
export function nextRepeat(ymd, every) {
  if (every !== 'month') return addDays(ymd, every === 'week' ? 7 : 14);
  const [y, m, d] = ymd.split('-').map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10);
}
