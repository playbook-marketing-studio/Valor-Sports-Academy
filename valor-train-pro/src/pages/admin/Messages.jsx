import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Inbox, Loader2, Megaphone, MessageSquare, Trash2 } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { PageHeader, SegmentedTabs, EmptyState } from '@/components/vtp';
import MessageThread from '@/components/MessageThread';
import { athleteName, smsHref } from '@/lib/valor';
import { fmtWhen, nudgeSms, sendAnnouncement, useRefreshUnread } from '@/lib/messages';
import { cn } from '@/lib/utils';

/** Staff: one inbox of parent conversations (one per athlete) plus announcements to every family. */
export default function AdminMessages() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'news' ? 'news' : 'inbox';
  return (
    <div className="space-y-5">
      <PageHeader title="Messages" subtitle="Talk with a family about their athlete, or post an announcement every family sees when they open the app." />
      <SegmentedTabs
        options={[{ value: 'inbox', label: 'Conversations' }, { value: 'news', label: 'Announcements' }]}
        value={tab}
        onChange={(v) => setParams(v === 'news' ? { tab: 'news' } : {}, { replace: true })}
      />
      {tab === 'inbox' ? <Conversations /> : <Announcements />}
    </div>
  );
}

function Conversations() {
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [pick, setPick] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: msgs }, { data: roster }] = await Promise.all([
        supabase.from('messages').select('id, athlete_id, body, from_staff, created_at').eq('kind', 'direct').order('created_at', { ascending: false }).limit(500),
        supabase.from('athletes_admin').select('id, first_name, last_name, parent_name, parent_id, archived_at').order('first_name'),
      ]);
      const familyIds = (msgs || []).filter((m) => !m.from_staff).map((m) => m.id);
      const { data: reads } = familyIds.length ? await supabase.from('message_reads').select('message_id').in('message_id', familyIds) : { data: [] };
      const seen = new Set((reads || []).map((r) => r.message_id));
      const byId = Object.fromEntries((roster || []).map((a) => [a.id, a]));
      const threads = [];
      const index = {};
      for (const m of msgs || []) {
        if (!index[m.athlete_id]) { index[m.athlete_id] = { athlete: byId[m.athlete_id], last: m, unread: 0 }; threads.push(index[m.athlete_id]); }
        if (!m.from_staff && !seen.has(m.id)) index[m.athlete_id].unread += 1;
      }
      setState({ threads: threads.filter((t) => t.athlete), roster: (roster || []).filter((a) => !a.archived_at) });
    })();
  }, []);

  if (!state) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
        <label htmlFor="msg-pick" className="text-sm font-semibold sm:w-40">New message to</label>
        <select id="msg-pick" value={pick} onChange={(e) => setPick(e.target.value)} className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-base sm:text-sm">
          <option value="">Pick an athlete's family</option>
          {state.roster.map((a) => <option key={a.id} value={a.id}>{athleteName(a)}{a.parent_name ? ` (${a.parent_name})` : ''}{a.parent_id ? '' : ' · no login yet'}</option>)}
        </select>
        <Button className="h-11" disabled={!pick} onClick={() => navigate(`/admin/messages/${pick}`)}>Open</Button>
      </div>
      {state.threads.length === 0 ? (
        <EmptyState icon={Inbox} title="No conversations yet" message="Pick a family above to send the first message. When a parent writes back, it shows up here." />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {state.threads.map(({ athlete, last, unread }) => (
            <Link key={athlete.id} to={`/admin/messages/${athlete.id}`} className="flex min-h-[68px] items-center gap-3 px-4 py-3 transition hover:bg-muted/50">
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', unread ? 'bg-primary' : 'bg-transparent')} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn('truncate', unread ? 'font-bold' : 'font-semibold')}>{athleteName(athlete)}{athlete.parent_name ? <span className="font-normal text-muted-foreground"> · {athlete.parent_name}</span> : null}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtWhen(last.created_at)}</span>
                </span>
                <span className="block truncate text-sm text-muted-foreground">{last.from_staff ? 'You: ' : ''}{last.body}</span>
              </span>
              {unread > 0 && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{unread}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Announcements() {
  const [rows, setRows] = useState(null);
  const [families, setFamilies] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: ann }, { data: kids }] = await Promise.all([
      supabase.from('messages').select('*').eq('kind', 'announcement').order('created_at', { ascending: false }).limit(50),
      supabase.from('athletes').select('parent_id').not('parent_id', 'is', null).is('archived_at', null),
    ]);
    const parentIds = new Set((kids || []).map((k) => k.parent_id));
    const ids = (ann || []).map((m) => m.id);
    const { data: reads } = ids.length ? await supabase.from('message_reads').select('message_id, user_id').in('message_id', ids) : { data: [] };
    const seenBy = {};
    for (const r of reads || []) if (parentIds.has(r.user_id)) seenBy[r.message_id] = (seenBy[r.message_id] || 0) + 1;
    setFamilies(parentIds.size);
    setRows((ann || []).map((m) => ({ ...m, seen: seenBy[m.id] || 0 })));
  }, []);
  useEffect(() => { load(); }, [load]);

  const post = async () => {
    if (!body.trim()) return;
    if (!window.confirm(`Post this to all ${families} families with a login? They see it the next time they open the app.`)) return;
    setBusy(true);
    const { error } = await sendAnnouncement(title, body);
    setBusy(false);
    if (error) return toast({ title: 'Could not post', description: error.message });
    setTitle(''); setBody('');
    toast({ title: 'Posted', description: 'Families see it under Messages and on their home screen.' });
    load();
  };
  const remove = async (m) => {
    if (!window.confirm('Delete this announcement? Families stop seeing it.')) return;
    const { error } = await supabase.from('messages').delete().eq('id', m.id);
    if (error) return toast({ title: 'Could not delete', description: error.message });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">New announcement <span className="font-normal text-muted-foreground">· goes to {families} {families === 1 ? 'family' : 'families'} with a login</span></p>
        <Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} placeholder="Headline (optional), e.g. No class Thursday" className="h-11 text-base sm:text-sm" />
        <Textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 2000))} rows={4} placeholder="What do families need to know?" className="text-base sm:text-sm" />
        <div className="flex justify-end">
          <Button onClick={post} disabled={busy || !body.trim()} className="h-11 gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />} Post to all families</Button>
        </div>
      </div>
      {rows === null ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Megaphone} title="No announcements yet" message="Schedule changes, closures, events. Post it once and every family sees it in the app." />
      ) : (
        <div className="space-y-3">
          {rows.map((m) => (
            <article key={m.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-xl">{m.title || 'From Valor'}</h2>
                <button onClick={() => remove(m)} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label="Delete announcement"><Trash2 className="h-4 w-4" /></button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
              <p className="mt-3 text-xs text-muted-foreground">{fmtWhen(m.created_at)} · seen by {m.seen} of {families}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/** Staff: one athlete's conversation with their parent. */
export function AdminMessageThread() {
  const { athleteId } = useParams();
  const [athlete, setAthlete] = useState(null);
  const [justSent, setJustSent] = useState(false);
  const refreshUnread = useRefreshUnread();

  useEffect(() => {
    supabase.from('athletes_admin').select('*').eq('id', athleteId).maybeSingle().then(({ data }) => setAthlete(data || false));
  }, [athleteId]);
  const nudge = useMemo(() => (athlete ? nudgeSms(athlete) : ''), [athlete]);

  if (athlete === null) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (athlete === false) return <EmptyState title="Athlete not found" to="/admin/messages" actionLabel="Back to messages" />;
  const phone = athlete.parent_phone;

  return (
    <div className="space-y-4">
      <Link to="/admin/messages" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Messages</Link>
      <PageHeader
        title={athleteName(athlete)}
        subtitle={`${athlete.parent_name || 'Parent'}${phone ? ` · ${phone}` : ''}`}
        action={<Button asChild variant="secondary" size="sm" className="h-10"><Link to={`/admin/athletes/${athlete.id}`}>Athlete page</Link></Button>}
        className="mb-2"
      />
      {!athlete.parent_id && (
        <p className="rounded-xl border border-warning-border bg-warning-surface p-3 text-sm text-warning">
          {athlete.parent_name || 'This parent'} doesn't have a login yet, so they won't see messages until they sign in. Show them the login QR on the <Link className="underline" to={`/admin/athletes/${athlete.id}`}>athlete page</Link> first.
        </p>
      )}
      <MessageThread
        athleteId={athlete.id}
        side="staff"
        placeholder={`Message ${athlete.parent_name?.split(' ')[0] || 'the parent'} about ${athlete.first_name}`}
        emptyText={`No messages yet. Anything you send shows up when ${athlete.parent_name?.split(' ')[0] || 'the parent'} opens the app.`}
        onSent={() => { setJustSent(true); refreshUnread(); }}
      />
      {phone && (
        <div className={cn('flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between', justSent ? 'border-primary/60 bg-primary/5' : 'border-border bg-card')}>
          <p className="text-sm">{justSent ? 'Sent. Want to give them a heads-up by text so they check the app?' : 'Parents see messages when they open the app. A quick text gets them to look.'}</p>
          <Button asChild variant={justSent ? 'default' : 'outline'} size="sm" className="h-10 shrink-0 gap-1.5">
            <a href={smsHref(phone, nudge)}><MessageSquare className="h-4 w-4" /> Text a heads-up</a>
          </Button>
        </div>
      )}
    </div>
  );
}
