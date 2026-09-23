import React from 'react';
import Brand from '@/components/Brand';

/** Plain branded page for the few screens a parent sees without being signed in. */
export default function PublicLayout({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8"><Brand /></div>
        <h1 className="font-display text-3xl lg:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-6 rounded-[22px] border border-border bg-card p-6 shadow-[0_24px_70px_-30px_rgba(20,18,13,.55)]">{children}</div>
      </div>
    </div>
  );
}
