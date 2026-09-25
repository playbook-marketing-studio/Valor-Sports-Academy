import React from 'react';
import { Link } from 'react-router-dom';
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

/** Huge confident number for a stat: PRs, counts, weights, streaks. */
export function StatTile({ label, value, unit, icon: Icon, className }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-primary" />}
      </div>
      <p className="stat-number mt-2 text-4xl text-foreground">
        {value}
        {unit && <span className="ml-1 font-body text-base font-normal text-muted-foreground">{unit}</span>}
      </p>
    </div>
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
