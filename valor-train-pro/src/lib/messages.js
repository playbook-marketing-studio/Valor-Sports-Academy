// Messages between Valor staff and families (migration 20261014000000_messages.sql).
// announcement = staff to every family; direct = one thread per athlete, parents can reply.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

export const UNREAD_KEY = ['messages-unread'];

/** Unread count for the nav badge. Refreshes every 30s and when the tab comes back into focus. */
export function useUnreadCount() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: UNREAD_KEY,
    enabled: !!user,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('unread_message_count');
      if (error) return 0;
      return data || 0;
    },
  });
  return data || 0;
}

export function useRefreshUnread() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: UNREAD_KEY });
}

/** Mark the given messages read for whoever is signed in (only rows they can see). */
export async function markRead(ids) {
  if (!ids?.length) return;
  await supabase.rpc('mark_messages_read', { ids });
}

/** Messages in one athlete's thread, oldest first, plus which ones the signed-in user has read. */
export async function loadThread(athleteId) {
  const { data } = await supabase.from('messages').select('*').eq('kind', 'direct').eq('athlete_id', athleteId).order('created_at').limit(300);
  return data || [];
}

export async function sendDirect(athleteId, body) {
  return supabase.from('messages').insert({ kind: 'direct', athlete_id: athleteId, body: body.trim() }).select('*').single();
}

export async function sendAnnouncement(title, body) {
  return supabase.from('messages').insert({ kind: 'announcement', title: title.trim() || null, body: body.trim() }).select('*').single();
}

export const fmtWhen = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const days = (now - d) / 86400000;
  if (days < 6) return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

/** The heads-up text staff send so a parent knows to open the app. */
export const nudgeSms = (athlete, origin = window.location.origin) => {
  const first = (athlete?.parent_name || '').split(' ')[0];
  return `Hi${first ? ` ${first}` : ''}, Valor here. We sent you a message about ${athlete?.first_name || 'your athlete'} in the app: ${origin}/messages`;
};
