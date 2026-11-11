import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SegmentedTabs } from '@/components/vtp';
import { addDays, addMonths, fmtDay, fmtMin, fmtSpan, mondayOf, monthDays, todayPT, weekDays } from '@/lib/facility';

/**
 * The facility calendar, shared by renters and coaches. The page turns what the server sent into
 * display blocks: { key, ymd, s, e, tone, title, sub, half, pending, onClick }.
 *   tone: mine (red) · pend (dashed red) · booked (ink) · valor (striped) · wait (dashed amber)
 * Week view is a time grid (one day at a time on a phone); month view is a grid of days.
 */
const ROW = 40; // px per hour
const TONE = {
  mine: 'bg-primary text-primary-foreground',
  pend: 'border-[1.5px] border-dashed border-primary bg-card text-primary',
  booked: 'bg-foreground text-background',
  valor: 'text-muted-foreground',
  wait: 'border-[1.5px] border-dashed border-warning-border bg-warning-surface text-warning',
};
const DOT = { mine: 'bg-primary', pend: 'border border-dashed border-primary', booked: 'bg-foreground', valor: 'bg-muted-foreground/40', wait: 'bg-warning-border' };
export const STRIPES = { backgroundImage: 'repeating-linear-gradient(135deg, hsl(var(--border)) 0 7px, hsl(var(--muted)) 7px 14px)' };

function useIsPhone() {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

export function CalToolbar({ view, setView, anchor, setAnchor, children }) {
  const days = weekDays(anchor);
  const sameMonth = days[0].slice(0, 7) === days[6].slice(0, 7);
  const label = view === 'month'
    ? fmtDay(anchor, { month: 'long', year: 'numeric' })
    : `${fmtDay(days[0], { month: 'short', day: 'numeric' })} to ${fmtDay(days[6], sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`;
  const step = (n) => setAnchor(view === 'month' ? addMonths(anchor, n) : addDays(anchor, 7 * n));
  const arrow = 'flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedTabs options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} value={view} onChange={setView} />
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label="Earlier" className={arrow} onClick={() => step(-1)}><ChevronLeft className="h-4 w-4" /></button>
        <span className="min-w-[7.5rem] text-center text-sm font-semibold">{label}</span>
        <button type="button" aria-label="Later" className={arrow} onClick={() => step(1)}><ChevronRight className="h-4 w-4" /></button>
      </div>
      <button type="button" className="h-9 rounded-full border border-border bg-card px-3 text-sm font-semibold text-muted-foreground hover:text-foreground" onClick={() => setAnchor(todayPT())}>Today</button>
      {children}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
      {items.map(([tone, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <i className={cn('inline-block h-3.5 w-3.5 rounded', TONE[tone])} style={tone === 'valor' ? STRIPES : undefined} />
          {label}
        </span>
      ))}
      <span>White is open</span>
    </div>
  );
}

/** Put two half-turf blocks side by side, and waiting requests on top of whatever they overlap. */
function arrange(list) {
  const solid = list.filter((b) => !b.pending).sort((a, b) => a.s - b.s);
  const lanes = [];
  for (const b of solid) {
    if (!b.half) continue;
    const taken = lanes.filter((x) => x.s < b.e && x.e > b.s).map((x) => x.lane);
    b.lane = taken.includes(0) ? 1 : 0;
    lanes.push(b);
  }
  for (const b of list) if (b.pending) b.over = solid.some((x) => x.s < b.e && x.e > b.s);
  return list;
}

function DayColumn({ ymd, blocks, fromMin, toMin, onSlot, past }) {
  const height = ((toMin - fromMin) / 60) * ROW;
  const mine = useMemo(() => arrange(blocks.filter((b) => b.ymd === ymd).map((b) => ({ ...b }))), [blocks, ymd]);
  const click = (e) => {
    if (!onSlot) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    onSlot(ymd, Math.min(toMin - 30, fromMin + Math.floor((y / ROW) * 2) * 30));
  };
  return (
    <div
      className={cn('relative border-l border-border', onSlot && 'cursor-pointer', past && 'bg-muted/40')}
      style={{ height, backgroundImage: 'linear-gradient(hsl(var(--border)) 1px, transparent 1px)', backgroundSize: `100% ${ROW}px` }}
      onClick={click}
    >
      {mine.map((b) => {
        const top = ((Math.max(b.s, fromMin) - fromMin) / 60) * ROW + 2;
        const h = ((Math.min(b.e, toMin) - Math.max(b.s, fromMin)) / 60) * ROW - 4;
        if (h <= 0) return null;
        const style = { top, height: h, left: 3, right: 3, ...(b.tone === 'valor' ? STRIPES : null) };
        if (b.half && !b.pending) { if (b.lane) style.left = 'calc(50% + 1px)'; else style.right = 'calc(50% + 1px)'; }
        if (b.pending && b.over) style.left = '38%';
        const Tag = b.onClick ? 'button' : 'div';
        return (
          <Tag
            key={b.key}
            type={b.onClick ? 'button' : undefined}
            title={`${b.title} · ${fmtSpan(b.s, b.e)}${b.sub ? ` · ${b.sub}` : ''}`}
            onClick={(e) => { e.stopPropagation(); b.onClick?.(); }}
            className={cn('absolute overflow-hidden rounded-lg px-1.5 py-1 text-left text-[11px] leading-tight', TONE[b.tone], b.pending && 'z-10', b.onClick && 'hover:brightness-110')}
            style={style}
          >
            <b className="block truncate text-[11.5px]">{b.title}</b>
            {h > 30 && b.sub && <span className="block truncate">{b.sub}</span>}
            {h > 50 && <span className="block truncate opacity-80">{fmtSpan(b.s, b.e)}</span>}
          </Tag>
        );
      })}
    </div>
  );
}

export function WeekGrid({ anchor, setAnchor, blocks, rules, onSlot, legend }) {
  const phone = useIsPhone();
  const today = todayPT();
  const days = weekDays(anchor);
  const shown = phone ? [anchor] : days;
  const visible = blocks.filter((b) => days.includes(b.ymd));
  const fromMin = Math.floor(Math.min(rules?.open_min ?? 360, ...visible.map((b) => b.s)) / 60) * 60;
  const toMin = Math.ceil(Math.max(rules?.close_min ?? 1320, ...visible.map((b) => b.e)) / 60) * 60;
  const hours = [];
  for (let m = fromMin; m < toMin; m += 60) hours.push(m);
  const cols = { gridTemplateColumns: `44px repeat(${shown.length}, minmax(0, 1fr))` };
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {phone ? (
        <div className="grid grid-cols-7 gap-1 border-b border-border p-2">
          {days.map((d) => (
            <button key={d} type="button" onClick={() => setAnchor(d)} className={cn('flex flex-col items-center rounded-lg py-1.5 text-[10px] font-semibold uppercase tracking-wider', d === anchor ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
              {fmtDay(d, { weekday: 'short' })}
              <span className={cn('font-display text-lg leading-tight', d === anchor ? '' : d === today ? 'text-primary' : 'text-foreground')}>{Number(d.slice(8))}</span>
              <i className={cn('mt-0.5 h-1.5 w-1.5 rounded-full', visible.some((b) => b.ymd === d) ? (d === anchor ? 'bg-primary-foreground' : 'bg-foreground') : 'bg-transparent')} />
            </button>
          ))}
        </div>
      ) : (
        <div className="grid border-b border-border" style={cols}>
          <div />
          {days.map((d) => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {fmtDay(d, { weekday: 'short' })}
              <span className={cn('block font-display text-xl leading-tight', d === today ? 'text-primary' : 'text-foreground')}>{Number(d.slice(8))}</span>
            </div>
          ))}
        </div>
      )}
      <div className="grid" style={cols}>
        <div>{hours.map((m) => <div key={m} className="pr-2 pt-0.5 text-right text-[10.5px] text-muted-foreground" style={{ height: ROW }}>{fmtMin(m)}</div>)}</div>
        {shown.map((d) => <DayColumn key={d} ymd={d} blocks={blocks} fromMin={fromMin} toMin={toMin} onSlot={onSlot} past={d < today} />)}
      </div>
      {legend && <Legend items={legend} />}
    </div>
  );
}

export function MonthGrid({ anchor, blocks, onDay, legend }) {
  const today = todayPT();
  const days = monthDays(anchor);
  const month = anchor.slice(0, 7);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const list = blocks.filter((b) => b.ymd === d).sort((a, b) => a.s - b.s);
          return (
            <button key={d} type="button" onClick={() => onDay(d)} className={cn('min-h-[64px] border-border p-1 text-left align-top hover:bg-muted/50 sm:min-h-[92px] sm:p-1.5', i % 7 && 'border-l', i >= 7 && 'border-t', d.slice(0, 7) !== month && 'opacity-40')}>
              <span className={cn('font-display text-base leading-none sm:text-lg', d === today && 'text-primary')}>{Number(d.slice(8))}</span>
              <span className="mt-1 hidden space-y-0.5 sm:block">
                {list.slice(0, 3).map((b) => (
                  <span key={b.key} className="flex items-center gap-1 truncate text-[10.5px] leading-tight text-muted-foreground">
                    <i className={cn('h-2 w-2 shrink-0 rounded-full', DOT[b.tone])} />
                    <span className="truncate"><span className="text-foreground">{fmtMin(b.s)}</span> {b.title}</span>
                  </span>
                ))}
                {list.length > 3 && <span className="block text-[10.5px] text-muted-foreground">+{list.length - 3} more</span>}
              </span>
              <span className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                {list.slice(0, 6).map((b) => <i key={b.key} className={cn('h-1.5 w-1.5 rounded-full', DOT[b.tone])} />)}
              </span>
            </button>
          );
        })}
      </div>
      {legend && <Legend items={legend} />}
    </div>
  );
}

/** Week or month, with the range the page should load for it. */
export const rangeFor = (view, anchor) => (view === 'month' ? { from: monthDays(anchor)[0], to: monthDays(anchor)[41] } : { from: mondayOf(anchor), to: addDays(mondayOf(anchor), 6) });
