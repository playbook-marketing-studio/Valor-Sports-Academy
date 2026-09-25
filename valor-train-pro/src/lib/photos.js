// Focal points for our object-cover photo cards, so faces stay in frame at
// phone widths instead of getting cropped off the top or turned into a wall
// of torso. `position` is a CSS object-position value: "horizontal% vertical%".
// Checked each file's actual framing (public/images/photos) before picking these.
export const PHOTO_POSITIONS = {
  // Two coaches, red backdrop, heads in the top third — hero crops need to stay high.
  '/images/photos/staff-hero-coaches.webp': '50% 20%',
  // Portrait headshots: face sits in the top quarter of a tall frame.
  '/images/photos/coach-corey.webp': '50% 20%',
  '/images/photos/coach-michael.webp': '50% 18%',
  // Full-body studio portraits (tall/portrait orientation) — faces well above center.
  '/images/photos/brothers.webp': '50% 25%',
  '/images/photos/training-action.webp': '50% 25%',
  // Landscape training/facility action shots — subjects are mid-frame, not edge-cropped.
  '/images/photos/class-drill.webp': '50% 30%',
  '/images/photos/bw-grind.webp': '50% 40%',
  '/images/photos/community.webp': '50% 35%',
  '/images/photos/sports-kids.webp': '50% 30%',
  // Empty-facility / equipment shots — no faces to protect, center is fine.
  '/images/photos/facility-turf.webp': '50% 50%',
  '/images/photos/facility-weights.webp': '50% 50%',
  '/images/photos/facility-wide.webp': '50% 55%',
};

/** CSS object-position for a photo path; defaults to center when we don't have one mapped. */
export function photoPosition(src) {
  return PHOTO_POSITIONS[src] || '50% 50%';
}
