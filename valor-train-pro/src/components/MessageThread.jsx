import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { fmtWhen, loadThread, markRead, sendDirect, useRefreshUnread } from '@/lib/messages';

/**
 * One athlete's conversation between Valor staff and the parent, chat style.
 * `side` = 'staff' or 'family': whose bubbles sit on the right.
 * Opening it marks the other side's messages read. `onSent` lets staff offer the text heads-up.
 */
export default function MessageThread({ athleteId, side, placeholder, onSent, emptyText }) {
  const [rows, setRows] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  const refreshUnread = useRefreshUnread();

  const load = async () => {
    const data = await loadThread(athleteId);
    setRows(data);
    const theirs = data.filter((m) => (side === 'staff' ? !m.from_staff : m.from_staff)).map((m) => m.id);
    if (theirs.length) { await markRead(theirs); refreshUnread(); }
  };
  useEffect(() => {
    setRows(null);
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [athleteId]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [rows?.length]);

  const send = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    const { data, error } = await sendDirect(athleteId, draft);
    setBusy(false);
    if (error) return toast({ title: 'Could not send', description: error.message });
    setDraft('');
    setRows((r) => [...(r || []), data]);
    onSent?.(data);
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="max-h-[55vh] min-h-[180px] space-y-3 overflow-y-auto p-4">
        {rows === null && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {rows?.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>}
        {rows?.map((m) => {
          const mine = side === 'staff' ? m.from_staff : !m.from_staff;
          return (
            <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
              <div className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted text-foreground')}>
                {m.body}
              </div>
              <span className="mt-1 px-1 text-[11px] text-muted-foreground">{m.from_staff ? 'Valor' : 'Parent'} · {fmtWhen(m.created_at)}</span>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <div className="flex items-end gap-2 border-t border-border p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
          placeholder={placeholder}
          rows={2}
          className="min-h-[52px] resize-none text-base sm:text-sm"
        />
        <Button onClick={send} disabled={busy || !draft.trim()} className="h-[52px] shrink-0 gap-1.5 px-4">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
        </Button>
      </div>
    </div>
  );
}
