import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * The site's header lockup, copied from styles.css (.brand / .brand__name):
 * emblem 60px with a soft drop shadow, 13px gap, "Valor" in Anton at 1.5rem
 * (title case, not uppercase), "Sports Academy" in Hanken Grotesk 700 at .52rem,
 * tracked .34em, 3px under the name. dark=true is the ink sidebar / site header.
 */
export default function Brand({ dark = false, size = 'md', to = '/', className }) {
  const sm = size === 'sm';
  return (
    <Link to={to} aria-label="Valor Sports Academy" className={cn('inline-flex items-center', className)} style={{ gap: sm ? 10 : 13 }}>
      <img
        src="/images/logo-emblem.png"
        alt=""
        style={{ width: sm ? 40 : 60, height: sm ? 40 : 60, objectFit: 'contain', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,.4))' }}
      />
      <span
        className={cn('text-left', dark ? 'text-white' : 'text-foreground')}
        style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: sm ? '1.2rem' : '1.5rem', letterSpacing: '.02em', lineHeight: 0.85 }}
      >
        Valor
        <small
          style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: sm ? '.46rem' : '.52rem', letterSpacing: '.34em', marginTop: 3, color: dark ? '#ff7484' : '#c8102e' }}
        >
          Sports Academy
        </small>
      </span>
    </Link>
  );
}
