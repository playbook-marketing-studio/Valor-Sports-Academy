import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { photoPosition } from '@/lib/photos';
import { Button } from '@/components/ui/button';

/**
 * Shared "modern gym app" visual system — the reference apps Omar liked share:
 * near-black canvas, big rounded charcoal cards, one bright accent, photo-led
 * cards with a dark gradient + white title, huge confident numbers, progress
 * rings, pill chips/segmented tabs. These are the reusable building blocks so
 * every screen picks them up instead of re-inventing layout each time.
 */

/** Every screen's title + a one-line plain-language subtitle saying what the page is for. */
export function PageHeader({ eyebrow, title, subtitle, action, className }) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="text-sm text-muted-foreground">{eyebrow}</p>}
        <h1 className="font-display text-3xl lg:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * Huge confident number for a stat: PRs, counts, weights, streaks.
 * Optional `trend` = { label, direction: 'up'|'down'|'flat', tone: 'good'|'bad'|'neutral' }
 * for a small "+18% from yesterday" style line under the number.
 */
export function StatTile({ label, value, unit, icon: Icon, trend, to, onClick, className }) {
  const Comp = to ? Link : onClick ? 'button' : 'div';
  return (
    <Comp
      {...(to ? { to } : {})}
      {...(onClick ? { type: 'button', onClick } : {})}
      className={cn(
        'block w-full rounded-xl border border-border bg-card p-4 text-left',
        (to || onClick) && 'cursor-pointer transition active:scale-[.98] hover:border-primary/40',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-primary" />}
      </div>
      <p className="stat-number mt-2 text-4xl text-foreground">
        {value}
        {unit && <span className="ml-1 font-body text-base font-normal text-muted-foreground">{unit}</span>}
      </p>
      {trend && (
        <p
          className={cn(
            'mt-1.5 flex items-center gap-1 text-xs font-medium',
            trend.tone === 'good' && 'text-green-600 dark:text-green-400',
            trend.tone === 'bad' && 'text-destructive',
            (!trend.tone || trend.tone === 'neutral') && 'text-muted-foreground'
          )}
        >
          {trend.direction === 'up' && <ArrowUp className="h-3 w-3 shrink-0" />}
          {trend.direction === 'down' && <ArrowDown className="h-3 w-3 shrink-0" />}
          <span className="truncate">{trend.label}</span>
        </p>
      )}
    </Comp>
  );
}

/**
 * Full-bleed photo card: image + dark gradient + white title/meta over it,
 * like the reference apps' program/workout cards. Lazy-loaded with explicit
 * width/height so photos never jank the layout or slow the app.
 */
export function PhotoCard({ src, alt = '', title, meta, chip, to, href, onClick, className, height = 180, children }) {
  const inner = (
    <div
      className={cn(
        'group relative flex w-full flex-col justify-end overflow-hidden rounded-xl border border-border bg-secondary text-left',
        (to || href || onClick) && 'cursor-pointer transition-transform active:scale-[.98]',
        className
      )}
      style={{ height }}
    >
      {src && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          width={800}
          height={height}
          style={{ objectPosition: photoPosition(src) }}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
      <div className="relative z-10 p-4">
        {chip && <span className="vtp-chip mb-2 border-white/25 bg-white/15 text-white backdrop-blur-sm" data-active="false">{chip}</span>}
        {title && <p className="font-display text-xl leading-none text-white drop-shadow">{title}</p>}
        {meta && <p className="mt-1 text-xs font-medium text-white/80">{meta}</p>}
        {children}
      </div>
    </div>
  );
  if (to) return <Link to={to} onClick={onClick}>{inner}</Link>;
  if (href) return <a href={href} onClick={onClick}>{inner}</a>;
  if (onClick) return <button type="button" onClick={onClick} className="w-full">{inner}</button>;
  return inner;
}

/** Small pill tag/filter chip. */
export function Chip({ children, active = false, onClick, className, icon: Icon }) {
  const Comp = onClick ? 'button' : 'span';
  return (
    <Comp type={onClick ? 'button' : undefined} onClick={onClick} data-active={active} className={cn('vtp-chip', onClick && 'hover:border-primary/50', className)}>
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </Comp>
  );
}

/** Segmented control: a row of pill tabs sharing one active state. */
export function SegmentedTabs({ options, value, onChange, className }) {
  return (
    <div className={cn('inline-flex flex-wrap items-center gap-1.5 rounded-full border border-border bg-card p-1', className)} role="tablist">
      {options.map((opt) => {
        const val = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        const active = value === val;
        return (
          <button
            key={val}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(val)}
            className={cn(
              'min-h-[36px] rounded-full px-4 text-sm font-semibold transition-colors',
              active ? 'bg-primary text-primary-foreground vtp-glow' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Progress ring: accent stroke arc on a muted track, huge number center. */
export function ProgressRing({ value = 0, size = 88, strokeWidth = 9, label, sublabel, className }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="hsl(var(--primary))" strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset .5s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <span className="stat-number text-lg text-foreground">{label ?? `${Math.round(pct)}%`}</span>
        {sublabel && <span className="text-[10px] text-muted-foreground">{sublabel}</span>}
      </div>
    </div>
  );
}

/**
 * Segmented arc gauge: a dotted track over ~250° with a solid accent arc for
 * the value and a big number centered in the gap. Same idea as ProgressRing
 * but reads as a "dial" — use it where the ref apps used a gauge (today's
 * calories, a weight-style goal) instead of a full ring.
 */
export function ArcGauge({ value = 0, max = 100, size = 160, strokeWidth = 14, label, sublabel, className }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2 - 2;
  const startDeg = -125;
  const endDeg = 125;
  const valueDeg = startDeg + (pct / 100) * (endDeg - startDeg);
  const pt = (deg) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
  };
  const arc = (a, b) => {
    const s = pt(a);
    const e = pt(b);
    const large = b - a > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  };
  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <path d={arc(startDeg, endDeg)} fill="none" stroke="hsl(var(--secondary))" strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={`1 ${Math.max(6, strokeWidth * 0.7)}`} />
        {pct > 0 && (
          <path d={arc(startDeg, valueDeg)} fill="none" stroke="hsl(var(--primary))" strokeWidth={strokeWidth} strokeLinecap="round" style={{ transition: 'all .5s ease' }} />
        )}
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center px-2" style={{ top: '36%' }}>
        <span className="stat-number text-2xl leading-none text-foreground">{label ?? `${Math.round(pct)}%`}</span>
        {sublabel && <span className="mt-1 text-[11px] text-muted-foreground">{sublabel}</span>}
      </div>
    </div>
  );
}

/** Small bar chart by category (day of week, etc). `data` = [{ label, value, highlight? }]. */
export function MiniBars({ data = [], height = 64, className }) {
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0));
  return (
    <div className={cn('flex items-end justify-between gap-1.5', className)} style={{ height }}>
      {data.map((d, i) => {
        const v = Math.max(0, Number(d.value) || 0);
        const h = v > 0 ? Math.max(4, (v / max) * (height - 18)) : 2;
        return (
          <div key={`${d.label}-${i}`} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <div
              className={cn('w-full rounded-t transition-all', d.highlight ? 'bg-primary' : v > 0 ? 'bg-foreground/25' : 'bg-secondary')}
              style={{ height: h }}
              aria-label={`${d.label}: ${d.value}`}
            />
            <span className={cn('text-[10px] font-medium leading-none', d.highlight ? 'text-foreground' : 'text-muted-foreground')}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Tiny trend line for "first result to latest" style visuals. Needs 2+ points. */
export function Sparkline({ data = [], width = 120, height = 32, className, strokeWidth = 2 }) {
  const vals = (data || []).filter((v) => v != null && !Number.isNaN(Number(v))).map(Number);
  if (vals.length < 2) {
    return <div className={cn('flex items-center text-[11px] text-muted-foreground', className)} style={{ width, height }}>{vals.length === 1 ? 'One result so far' : 'No results yet'}</div>;
  }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const pad = strokeWidth + 1;
  const step = vals.length > 1 ? (width - pad * 2) / (vals.length - 1) : 0;
  const points = vals.map((v, i) => [pad + i * step, pad + (1 - (v - min) / range) * (height - pad * 2)]);
  const last = points[points.length - 1];
  return (
    <svg width={width} height={height} className={className}>
      <polyline points={points.map((p) => p.join(',')).join(' ')} fill="none" stroke="hsl(var(--primary))" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={strokeWidth + 1.5} fill="hsl(var(--primary))" />
    </svg>
  );
}

/** Horizontal progress bar: an accent fill on a muted track, with an optional label row above it. */
export function ProgressBar({ value = 0, max = 100, label, sublabel, height = 8, className, barClassName }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cn('w-full', className)}>
      {(label || sublabel) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          {label && <span className="text-sm font-semibold">{label}</span>}
          {sublabel && <span className="text-xs text-muted-foreground">{sublabel}</span>}
        </div>
      )}
      <div className="w-full overflow-hidden rounded-full bg-secondary" style={{ height }}>
        <div className={cn('h-full rounded-full bg-primary transition-all duration-500', barClassName)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Empty state: always names the next step, with a button that does it. */
export function EmptyState({ icon: Icon, title, message, actionLabel, onAction, to, href, photo, className }) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-border bg-card text-center', className)}>
      {photo && (
        <img src={photo} alt="" loading="lazy" width={800} height={140} style={{ objectPosition: photoPosition(photo) }} className="h-[140px] w-full object-cover opacity-90" />
      )}
      <div className="flex flex-col items-center gap-2 px-6 py-10">
        {Icon && (
          <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </div>
        )}
        <p className="font-display text-xl">{title}</p>
        {message && <p className="max-w-sm text-sm text-muted-foreground">{message}</p>}
        {actionLabel && (to ? (
          <Button asChild className="mt-3"><Link to={to}>{actionLabel}</Link></Button>
        ) : href ? (
          <Button asChild className="mt-3"><a href={href}>{actionLabel}</a></Button>
        ) : (
          <Button className="mt-3" onClick={onAction}>{actionLabel}</Button>
        ))}
      </div>
    </div>
  );
}
