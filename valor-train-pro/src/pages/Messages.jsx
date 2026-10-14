import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Megaphone } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { PageHeader, SegmentedTabs, EmptyState } from '@/components/vtp';
import MessageThread from '@/components/MessageThread';
import { fmtWhen, markRead, useRefreshUnread } from '@/lib/messages';
import { cn } from '@/lib/utils';

/** Parent view: a chat with Valor for each of their athletes, plus Valor's announcements. */
export default function Messages() {
  const { user } = useAuth();
  const [athletes, setAthletes] = useState(null);
  const [news, setNews] = useState([]);
  const [newIds, setNewIds] = useState(new Set());
  const [tab, setTab] = useState('');
  const refreshUnread = useRefreshUnread();

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: kids }, { data: ann }, { data: direct }] = await Promise.all([
        supabase.from('athletes').select('id, first_name, last_name').or(`parent_id.eq.${user.id},user_id.eq.${user.id}`).is('archived_at', null).order('first_name'),
        supabase.from('messages').select('*').eq('kind', 'announcement').order('created_at', { ascending: false }).limit(30),
        supabase.from('messages').select('id, athlete_id').eq('kind', 'direct').eq('from_staff', true),
      ]);
      const ids = [...(ann || []), ...(direct || [])].map((m) => m.id);
      const { data: reads } = ids.length ? await supabase.from('message_reads').select('message_id').eq('user_id', user.id).in('message_id', ids) : { data: [] };
      const seen = new Set((reads || []).map((r) => r.message_id));
      const unseen = new Set(ids.filter((id) => !seen.has(id)));
      setAthletes(kids || []);
      setNews(ann || []);
      setNewIds(unseen);
      // open the tab with something new in it: a kid's chat first, then announcements
      const kidWithNew = (direct || []).find((m) => unseen.has(m.id))?.athlete_id;
      const annNew = (ann || []).some((m) => unseen.has(m.id));
      setTab(kidWithNew || (annNew ? 'news' : (kids?.[0]?.id || 'news')));
    })();
  }, [user]);

  // announcements count as read once the tab is open
  useEffect(() => {
    if (tab !== 'news') return;
    const ids = news.filter((m) => newIds.has(m.id)).map((m) => m.id);
    if (ids.length) markRead(ids).then(refreshUnread);
  }, [tab, news]);

  const options = useMemo(() => {
    if (!athletes) return [];
    const annNew = news.filter((m) => newIds.has(m.id)).length;
    return [
      ...athletes.map((a) => ({ value: a.id, label: athletes.length > 1 ? a.first_name : 'Coach' })),
      { value: 'news', label: annNew ? `Announcements (${annNew})` : 'Announcements' },
    ];
  }, [athletes, news, newIds]);

  if (athletes === null) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const kid = athletes.find((a) => a.id === tab);

  return (
    <div className="space-y-5">
      <PageHeader title="Messages" subtitle="Notes from Valor's coaches and gym news. Questions about training, schedule or payments? Ask here." />
      {athletes.length === 0 ? (
        <EmptyState icon={Megaphone} title="Nothing here yet" message="Once your athlete is set up at Valor, the coaches' messages show up here." to="/" actionLabel="Back to home" />
      ) : (
        <>
          <SegmentedTabs options={options} value={tab} onChange={setTab} />
          {kid && (
            <MessageThread
              key={kid.id}
              athleteId={kid.id}
              side="family"
              placeholder={`Message Valor about ${kid.first_name}`}
              emptyText={`No messages yet. Send the coaches a question about ${kid.first_name} any time.`}
              onSent={refreshUnread}
            />
          )}
          {tab === 'news' && (
            news.length === 0 ? (
              <EmptyState icon={Megaphone} title="No announcements yet" message="Schedule changes, events and gym news from Valor show up here." />
            ) : (
              <div className="space-y-3">
                {news.map((m) => (
                  <article key={m.id} className={cn('rounded-xl border bg-card p-4', newIds.has(m.id) ? 'border-primary/60' : 'border-border')}>
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-display text-xl">{m.title || 'From Valor'}</h2>
                      <span className="shrink-0 text-xs text-muted-foreground">{newIds.has(m.id) && <span className="mr-2 rounded-full bg-primary px-2 py-0.5 font-semibold text-primary-foreground">New</span>}{fmtWhen(m.created_at)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
                  </article>
                ))}
              </div>
            )
          )}
        </>
      )}
      <p className="text-center text-xs text-muted-foreground">Something urgent? Call or text <a href="sms:5099874612" className="underline">509-987-4612</a>.</p>
    </div>
  );
}
