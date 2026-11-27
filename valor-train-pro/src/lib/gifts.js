// Gift classes (Black Friday 2026). Server side is fn gift; see supabase/functions/gift/index.ts.
import { callFn } from '@/api/supabaseClient';
import { isMonthlyItem } from '@/lib/autopay';

/** The item a family can give as a gift (settings.enrollment.items[].giftable), or null. */
export const giftItem = (cfg) => (cfg?.items || []).find((i) => i.giftable && !isMonthlyItem(i)) || null;
/** One-time items (class packs, drop-ins): what a family already on a plan can add. */
export const oneTimeItems = (cfg) => (cfg?.items || []).filter((i) => !isMonthlyItem(i) && i.amount_cents >= 50);
/** A short promo line set on an item (settings.enrollment.items[].promo), e.g. the Black Friday deal. */
export const promoLine = (cfg) => (cfg?.items || []).find((i) => i.promo)?.promo || '';

export const giftFn = (body) => callFn('gift', { body });

/** "Good through Jan 31, 2027" from the gift's expiry (stored as the moment right after the last day). */
export function goodThrough(iso) {
  if (!iso) return '';
  return new Date(new Date(iso).getTime() - 1000).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric' });
}

// a code someone opened before signing in: Home offers it again after they log in or sign up
const KEY = 'valor_gift_code';
export const rememberCode = (c) => { try { localStorage.setItem(KEY, c); } catch { /* private mode */ } };
export const pendingCode = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const forgetCode = () => { try { localStorage.removeItem(KEY); } catch { /* private mode */ } };

/** "Jan 31, 2027" for an item before it's bought: its fixed expires_on day, else today + expires_days. */
export function goodThroughFromItem(item) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(item?.expires_on || '')) {
    const [y, m, d] = item.expires_on.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (item?.expires_days) return goodThrough(new Date(Date.now() + item.expires_days * 86400000).toISOString());
  return '';
}
