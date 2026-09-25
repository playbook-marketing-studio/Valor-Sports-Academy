// Shared wording for assessment bookings/leads, used by Assessments, Today and the
// athlete page so the card and the athlete's own page always say the same thing.
export const reqDay = (ymd) => (ymd ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(ymd + 'T12:00:00Z')) : 'a day');
// Leads from the old website form (before online booking) have no day or window.
export const askText = (b) => (b.requested_day || b.requested_window ? `Asked for ${reqDay(b.requested_day)}${b.requested_window ? `, ${b.requested_window}` : ''}${b.requested_note ? `: "${b.requested_note}"` : ''}` : (b.requested_note || 'Wants a free assessment'));
export const askSms = (b) => (b.requested_day || b.requested_window
  ? `Hi ${(b.parent_name || '').split(' ')[0]}, this is Valor Sports Academy. We can fit ${b.athlete_first_name}'s free assessment in. Does ${b.requested_window || 'that time'} on ${reqDay(b.requested_day)} work?`
  : `Hi ${(b.parent_name || '').split(' ')[0]}, this is Valor Sports Academy. Thanks for filling out our form for ${b.athlete_first_name}. Want to come in for a free assessment? We do them Saturday mornings.`);
export const STATUS_LABEL = { booked: 'Booked', requested: 'Wants a time', attended: 'Checked in', no_show: 'No-show', canceled: 'Canceled' };
export const SOURCE_LABEL = { meta: 'Meta ad', facebook: 'Meta ad', instagram: 'Instagram', google: 'Google' };
export const sourceLabel = (s) => (!s || s === 'app' ? '' : SOURCE_LABEL[String(s).toLowerCase()] || s);

export const fmtContacted = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
