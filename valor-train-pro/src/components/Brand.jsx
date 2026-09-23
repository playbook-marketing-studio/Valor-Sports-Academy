import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** The site's header brand: emblem + "Valor / Sports Academy" wordmark. dark=true for the ink sidebar. */
export default function Brand({ dark = false, size = 'md', to = '/', className }) {
  const img = size === 'sm' ? 'h-8' : 'h-11';
  return (
    <Link to={to} aria-label="Valor Sports Academy" className={cn('inline-flex items-center gap-3', className)}>
      <img src="/images/logo-emblem.png" alt="" className={cn(img, 'w-auto')} />
      <span className={cn('font-display leading-[.85]', size === 'sm' ? 'text-lg' : 'text-2xl', dark ? 'text-white' : 'text-foreground')}>
        Valor
        <small className={cn('mt-0.5 block font-body text-[.5rem] font-bold tracking-[.34em]', dark ? 'text-[#ff7484]' : 'text-primary')}>Sports Academy</small>
      </span>
    </Link>
  );
}
