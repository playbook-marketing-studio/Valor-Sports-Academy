import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
    photo: '/images/photos/action-pad-drive.webp',
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
    photo: '/images/photos/sports-kids.webp',
    title: "Your athlete's results",
    body: 'See how their assessment went and what the coaches are working on with them.',
  },
  {
    photo: '/images/photos/training-action.webp',
    title: "This week's workouts",
    body: 'Every workout your athlete has in class, with the exact weights they hit.',
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

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      <div className="relative h-[52vh] min-h-[280px] w-full shrink-0 overflow-hidden bg-secondary">
        <img src={step.photo} alt="" width={800} height={600} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/10 to-black/30" />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-[calc(env(safe-area-inset-top,0px)+1rem)] rounded-full bg-black/40 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm"
        >
          Skip
        </button>
      </div>

      <div className="flex flex-1 flex-col justify-between px-6 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-6">
        <div>
          <h1 className="font-display text-3xl">{step.title}</h1>
          <p className="mt-3 max-w-md text-base text-muted-foreground">{step.body}</p>
        </div>

        <div className="mt-8 space-y-5">
          <div className="flex items-center justify-center gap-2">
            {steps.map((_, idx) => (
              <span
                key={idx}
                className={cn('h-2 rounded-full transition-all', idx === i ? 'w-6 bg-primary' : 'w-2 bg-secondary')}
              />
            ))}
          </div>
          <Button
            size="lg"
            className="h-14 w-full text-base"
            onClick={() => (last ? onClose() : setI((n) => n + 1))}
          >
            {last ? "Let's go" : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}
