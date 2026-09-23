import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import Brand from '@/components/Brand';

const steps = ['Athlete', 'Account', 'Payment', 'Done'];

export default function BookLayout({ step = 0, title, subtitle, children, wide = false }) {
  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className={cn('mx-auto w-full', wide ? 'max-w-3xl' : 'max-w-xl')}>
        <div className="mb-8 flex items-center justify-between">
          <Brand />
          <Link to="/login" className="text-xs text-muted-foreground hover:text-foreground">Already have an account? Log in</Link>
        </div>

        <ol className="mb-8 flex items-center gap-2 text-xs">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className={cn('flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold',
                i < step ? 'bg-primary/20 text-primary' : i === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{i + 1}</span>
              <span className={cn(i === step ? 'text-foreground font-medium' : 'text-muted-foreground')}>{s}</span>
              {i < steps.length - 1 && <span className="mx-1 h-px w-4 bg-border" />}
            </li>
          ))}
        </ol>

        <h1 className="font-display text-3xl lg:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-6 rounded-[22px] border border-border bg-card p-6 shadow-[0_24px_70px_-30px_rgba(20,18,13,.55)]">{children}</div>
      </div>
    </div>
  );
}
