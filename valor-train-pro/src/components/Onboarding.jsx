import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { photoPosition } from '@/lib/photos';

const STAFF_STEPS = [
  {
    photo: '/images/photos/staff-hero-coaches.webp',
    title: 'Today is your home base',
    body: "Open the app and you land here. See who's booked, who's checked in, and what needs a follow-up today.",
  },
  {
    photo: '/images/photos/facility-wide.webp',
    title: 'Assessments',
    body: 'Everyone who booked a free assessment shows up here. Check kids in when they arrive on Saturday, then enter their results.',
  },
  {
    photo: '/images/photos/coach-corey.webp',
    title: 'Athletes',
    body: "Every kid has their own page: results, their parent's login QR code, and payment status, all in one place.",
  },
  {
    photo: '/images/photos/class-drill.webp',
    title: 'Programs + Class log',
    body: 'Put an athlete on a program, then log their weights right from class as they train.',
  },
  {
    photo: '/images/photos/brothers.webp',
    title: 'View as athlete',
    body: 'Want to see exactly what a family sees? View as athlete shows you their app, read-only.',
  },
];

const PARENT_STEPS = [
  {
    photo: '/images/photos/class-drill.webp',
    title: "Your athlete's results",
    body: 'See how their assessment went and what the coaches are working on with them.',
  },
  {
    photo: '/images/photos/training-action.webp',
    title: "This week's workouts",
    body: 'Every workout on your athlete\'s plan, with the weights to use based on their own maxes.',
  },
  {
    photo: '/images/photos/community.webp',
    title: 'Log meals',
    body: 'Track what your athlete is eating so coaches can help them fuel right.',
  },
  {
    photo: '/images/photos/bw-grind.webp',
    title: 'Track progress',
    body: 'Watch their strength and stats climb over time, one session at a time.',
  },
];

export function getOnboardingSteps(role) {
  return role === 'admin' ? STAFF_STEPS : PARENT_STEPS;
}

/** localStorage key includes the user id so each person only sees their own first-login walkthrough once. */
export function onboardingKey(userId, role) {
  return `vtp-onboarding-seen-${role === 'admin' ? 'staff' : 'parent'}-${userId || 'anon'}`;
}

export function hasSeenOnboarding(userId, role) {
  try {
    return localStorage.getItem(onboardingKey(userId, role)) === '1';
  } catch {
    return true; // if storage is unavailable, don't force it on every load
  }
}

export function markOnboardingSeen(userId, role) {
  try {
    localStorage.setItem(onboardingKey(userId, role), '1');
  } catch {
    /* ignore — private browsing / storage blocked */
  }
}

export default function Onboarding({ role, onClose }) {
  const steps = getOnboardingSteps(role);
  const [i, setI] = useState(0);
  const step = steps[i];
  const last = i === steps.length - 1;
  const next = () => (last ? onClose() : setI((n) => n + 1));
  const back = () => setI((n) => Math.max(0, n - 1));

  // Swipe left/right (touch or mouse drag) to move between cards; arrow keys too.
  const start = useRef(null);
  const onPointerDown = (e) => { start.current = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x, dy = e.clientY - start.current.y;
    start.current = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) { if (!last) setI((n) => n + 1); } else back();
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setI((n) => Math.min(steps.length - 1, n + 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steps.length, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick tour of the app"
      className="fixed inset-0 z-[100] flex touch-pan-y select-none flex-col bg-background"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { start.current = null; }}
    >
      <div className="relative h-[48vh] min-h-[260px] w-full shrink-0 overflow-hidden bg-secondary">
        <img key={step.photo} src={step.photo} alt="" width={800} height={600} draggable={false} style={{ objectPosition: photoPosition(step.photo) }} className="h-full w-full animate-in fade-in object-cover duration-300" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/10 to-black/40" />
        <div className="absolute inset-x-4 top-[calc(env(safe-area-inset-top,0px)+1rem)] flex items-center justify-between">
          <span className="rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-sm">Quick tour</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-black/45 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm"
          >
            Skip tour
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between px-6 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-5">
        <div key={i} className="animate-in fade-in slide-in-from-right-4 duration-300">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            {i === 0 ? `How the app works · ${steps.length} quick steps` : `Step ${i + 1} of ${steps.length}`}
          </p>
          <h1 className="mt-2 font-display text-3xl">{step.title}</h1>
          <p className="mt-3 max-w-md text-base text-muted-foreground">{step.body}</p>
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-center gap-1">
            {steps.map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Go to step ${idx + 1}`}
                onClick={() => setI(idx)}
                className="flex h-8 items-center px-1"
              >
                <span className={cn('h-2 rounded-full transition-all', idx === i ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/40')} />
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground">Swipe or tap Next</p>
          <div className="flex gap-3">
            {i > 0 && (
              <Button size="lg" variant="outline" className="h-14 flex-1 text-base" onClick={back}>Back</Button>
            )}
            <Button size="lg" className="h-14 flex-[2] text-base" onClick={next}>
              {last ? "Got it, let's go" : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
