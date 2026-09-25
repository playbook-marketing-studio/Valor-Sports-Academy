import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * The site's header lockup, copied from styles.css (.brand / .brand__name):
 * emblem with a soft drop shadow, "Valor" in Anton (title case, not uppercase),
 * "Sports Academy" in Hanken Grotesk 700, tracked wide, under the name.
 * The whole app now runs on a dark ink canvas, so the lockup always renders
 * for a dark surface: bright paper name + a lifted red tagline that holds AA
 * contrast against near-black. `dark` is kept as a no-op prop for callers.
 */
export default function Brand({ dark = false, size = 'md', to = '/', className }) {
  const sm = size === 'sm';
  return (
    <Link to={to} aria-label="Valor Sports Academy" className={cn('inline-flex items-center', className)} style={{ gap: sm ? 10 : 13 }}>
      <img
        src="/images/logo-emblem.png"
        alt=""
        style={{ width: sm ? 42 : 64, height: sm ? 42 : 64, objectFit: 'contain', filter: 'drop-shadow(0 4px 14px rgba(0,0,0,.55))' }}
      />
      <span
        className="text-left text-foreground"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: sm ? '1.2rem' : '1.5rem', letterSpacing: '.02em', lineHeight: 0.85 }}
      >
        Valor
        <small
          style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: sm ? '.46rem' : '.52rem', letterSpacing: '.34em', marginTop: 3, color: '#ff7484' }}
        >
          Sports Academy
        </small>
      </span>
    </Link>
  );
}
