// Demo data for Valor Train Pro.  Everything uses @valortrainpro.test emails so it purges cleanly.
//   set -a; source ~/Documents/Claude/Projects/playbook/.env; set +a
//   DEMO_PASSWORD=... node scripts/demo-data.mjs seed     (purges first, then seeds)
//   node scripts/demo-data.mjs purge
// Needs VALOR_TRAINPRO_SUPABASE_SERVICE_ROLE_KEY and VALOR_TRAINPRO_INGEST_KEY (vault).
// Upcoming bookings go through the ingest-booking function, the same path the website uses.
const URL_ = 'https://gpotwyuttkkygvxzktep.supabase.co';
const SVC = process.env.VALOR_TRAINPRO_SUPABASE_SERVICE_ROLE_KEY;
const INGEST = process.env.VALOR_TRAINPRO_INGEST_KEY;
const DOMAIN = '@valortrainpro.test';
const KEEP = ['admin-test@valortrainpro.test'];
if (!SVC || !INGEST) { console.error('source the vault first (service role + ingest key)'); process.exit(1); }
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'content-type': 'application/json' };

async function rest(method, path, body, prefer = 'return=representation') {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: { ...H, Prefer: prefer }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}
async function authAdmin(method, path, body) {
  const r = await fetch(`${URL_}/auth/v1/admin/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`auth ${method} ${path}: ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}

// ── dates in Pacific ──────────────────────────────────────────────────────
const TZ = 'America/Los_Angeles';
function ymdPT(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
function atPT(ymd, hh, mm) { // wall-clock PT → ISO (minutes may overflow, e.g. 10:60)
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(guess).map((x) => [x.type, x.value]));
  const asIfUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(guess.getTime() + (guess.getTime() - asIfUTC)).toISOString();
}
function addDays(ymd, n) { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const today = ymdPT(new Date());
const dow = new Date(today + 'T12:00:00Z').getUTCDay();
const nextSat = addDays(today, (6 - dow + 7) % 7);
const lastSat = addDays(nextSat, -7);
const satAfter = addDays(nextSat, 7);

async function purge() {
  const athletes = await rest('GET', `athletes?select=id&parent_email=ilike.*${encodeURIComponent(DOMAIN)}`);
  const ids = athletes.map((a) => a.id);
  if (ids.length) {
    const inList = `(${ids.join(',')})`;
    for (const t of ['payments', 'assessments', 'workout_logs', 'workouts', 'one_rep_maxes', 'bookings']) await rest('DELETE', `${t}?athlete_id=in.${inList}`, null, 'return=minimal');
  }
  await rest('DELETE', `bookings?parent_email=ilike.*${encodeURIComponent(DOMAIN)}`, null, 'return=minimal');
  await rest('DELETE', `athletes?parent_email=ilike.*${encodeURIComponent(DOMAIN)}`, null, 'return=minimal');
  let users = []; let page = 1;
  for (;;) { const r = await authAdmin('GET', `users?page=${page}&per_page=200`); users = users.concat(r.users || []); if (!r.users || r.users.length < 200) break; page++; }
  const gone = users.filter((u) => u.email?.endsWith(DOMAIN) && !KEEP.includes(u.email));
  for (const u of gone) await authAdmin('DELETE', `users/${u.id}`);
  console.log(`purged ${ids.length} athletes, ${gone.length} parent logins`);
}

const siteBooking = (b) => ({ id: crypto.randomUUID(), status: 'booked', ...b });
async function ingest(bookings) {
  const r = await fetch(`${URL_}/functions/v1/ingest-booking`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ingest-key': INGEST }, body: JSON.stringify({ bookings }) });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return j.results;
}
const athleteByEmail = async (email, first) => (await rest('GET', `athletes?select=*&parent_email=eq.${encodeURIComponent(email)}&first_name=eq.${encodeURIComponent(first)}`))[0];
const slot = (ymd, hh, mm) => ({ slot_start: atPT(ymd, hh, mm), slot_end: atPT(ymd, hh, mm + 30) });

async function seed() {
  await purge();
  const staff = (await rest('GET', `profiles?select=id&email=eq.admin-test@valortrainpro.test`))[0];
  // enrollment config: one-time classes / class packs (no subscriptions). Seed follows whatever is set.
  const cfg = (await rest('GET', 'settings?select=value&key=eq.enrollment'))[0].value;
  const item = (k) => cfg.items.find((x) => x.key === k) || cfg.items[0];
  const pay = (athleteId, parentId, k, athleteName, method, paidAt, extra = {}) => {
    const it = item(k);
    const covers = it.expires_days ? new Date(new Date(paidAt).getTime() + it.expires_days * 86400000).toISOString() : null;
    return rest('POST', 'payments', { athlete_id: athleteId, parent_id: parentId, plan_key: it.key, description: `${it.name} · ${athleteName}`, amount_cents: it.amount_cents, kind: 'one_time', method, status: 'paid', paid_at: paidAt, covers_until: covers, classes_total: it.classes ?? null, recorded_by: staff.id, ...extra });
  };


  // 1. website bookings (same path as the live site)
  await ingest([
    // next Saturday
    siteBooking({ ...slot(nextSat, 10, 30), athlete_name: 'Liam Carter', athlete_age: '13', sport: 'Football', quiz_result: 'Developing Athlete (8/15)', parent_name: 'Jess Carter', phone: '509-555-0111', email: 'jess.carter' + DOMAIN, utm_source: 'meta', utm_campaign: 'fall-assessment' }),
    siteBooking({ ...slot(nextSat, 11, 0), athlete_name: 'Sophia Nguyen', athlete_age: '11', sport: 'Volleyball', quiz_result: 'Foundation Athlete (4/15)', parent_name: 'Linh Nguyen', phone: '509-555-0112', email: 'linh.nguyen' + DOMAIN, utm_source: 'instagram' }),
    siteBooking({ ...slot(nextSat, 11, 30), athlete_name: 'Jaylen Brooks', athlete_age: '15', sport: 'Basketball', quiz_result: 'Advanced Athlete (11/15)', parent_name: 'Andre Brooks', phone: '509-555-0113', email: 'andre.brooks' + DOMAIN, utm_source: 'google' }),
    siteBooking({ ...slot(nextSat, 12, 30), athlete_name: 'Emma Ruiz', athlete_age: '9', sport: 'Soccer', quiz_result: 'Foundation Athlete (3/15)', parent_name: 'Carla Ruiz', phone: '509-555-0114', email: 'carla.ruiz' + DOMAIN, utm_source: 'meta' }),
    // the Saturday after
    siteBooking({ ...slot(satAfter, 10, 0), athlete_name: 'Noah Patel', athlete_age: '14', sport: 'Baseball', quiz_result: 'Developing Athlete (7/15)', parent_name: 'Priya Patel', phone: '509-555-0115', email: 'priya.patel' + DOMAIN, utm_source: 'meta' }),
    // wants a different time
    { id: crypto.randomUUID(), status: 'requested', requested_day: addDays(nextSat, 5), requested_window: 'evening', note: 'After volleyball practice, anytime after 6', athlete_name: 'Ava Martinez', athlete_age: '15', sport: 'Volleyball', quiz_result: 'Advanced Athlete (10/15)', parent_name: 'Rosa Martinez', phone: '509-555-0116', email: 'rosa.martinez' + DOMAIN, utm_source: 'meta' },
    // last Saturday (already happened)
    siteBooking({ ...slot(lastSat, 10, 0), status: 'attended', athlete_name: 'Marcus Hill', athlete_age: '16', sport: 'Football', quiz_result: 'Advanced Athlete (12/15)', parent_name: 'Dana Hill', phone: '509-555-0117', email: 'dana.hill' + DOMAIN, utm_source: 'meta' }),
    siteBooking({ ...slot(lastSat, 10, 30), status: 'attended', athlete_name: 'Ethan Brown', athlete_age: '13', sport: 'Football', quiz_result: 'Developing Athlete (6/15)', parent_name: 'Kim Brown', phone: '509-555-0118', email: 'kim.brown' + DOMAIN, utm_source: 'google' }),
    siteBooking({ ...slot(lastSat, 11, 0), status: 'no-show', athlete_name: 'Chloe Kim', athlete_age: '10', sport: 'Gymnastics', quiz_result: 'Foundation Athlete (5/15)', parent_name: 'Grace Kim', phone: '509-555-0119', email: 'grace.kim' + DOMAIN, utm_source: 'instagram' }),
  ]);

  // 2. Marcus: assessed, parent active, enrolled on card, training plan with logs
  const marcus = await athleteByEmail('dana.hill' + DOMAIN, 'Marcus');
  await rest('PATCH', `athletes?id=eq.${marcus.id}`, { school: 'Hanford High', grad_year: 2028, position: 'Wide receiver', notes: 'Tweaked right hamstring in August, cleared. Wants to run a sub-4.8 forty by spring.' });
  const mBooking = (await rest('GET', `bookings?select=id&athlete_id=eq.${marcus.id}`))[0];
  await rest('PATCH', `bookings?id=eq.${mBooking.id}`, { checked_in_at: atPT(lastSat, 9, 58) });
  await rest('POST', 'assessments', { athlete_id: marcus.id, booking_id: mBooking.id, date: lastSat, coach_id: staff.id, metrics: { sprint_10yd: '1.71', sprint_40yd: '4.98', pro_agility: '4.55', vertical_in: '27', broad_jump_in: '104' }, work_on: 'Hip mobility before speed work, and staying low out of the break.', recommended_plan: 'inseason_2x', notes: 'Strong kid, very coachable. Mom asked about off-season in January.' });
  const pw = process.env.DEMO_PASSWORD;
  if (!pw) throw new Error('set DEMO_PASSWORD for the demo parent login');
  const dana = await authAdmin('POST', 'users', { email: 'dana.hill' + DOMAIN, password: pw, email_confirm: true, user_metadata: { full_name: 'Dana Hill', phone: '509-555-0117', role: 'parent' } });
  await rest('PATCH', `athletes?id=eq.${marcus.id}`, { parent_id: dana.id, invited_at: atPT(lastSat, 11, 5) });
  await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: SVC, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'dana.hill' + DOMAIN, password: pw }) }); // sets "last signed in"
  const [mp] = await pay(marcus.id, dana.id, 'inseason_2x', 'Marcus Hill', 'card', atPT(lastSat, 11, 10), { stripe_customer_id: 'cus_demo_dana', note: 'demo', classes_used: 2 });
  for (const d of [addDays(lastSat, 2), addDays(lastSat, 4)]) await rest('POST', 'class_visits', { athlete_id: marcus.id, payment_id: mp.id, visited_at: atPT(d, 18, 0), logged_by: staff.id });
  for (const [ex, w] of [['Back squat', 245], ['Bench press', 185], ['Hang clean', 165], ['Trap bar deadlift', 315]]) await rest('POST', 'one_rep_maxes', { athlete_id: marcus.id, owner_id: staff.id, exercise_name: ex, weight: w, date: lastSat });
  const wk1Mon = addDays(lastSat, 2), wk1Wed = addDays(lastSat, 4);
  const lower = [{ name: 'Back squat', sets: 4, reps: 5, intensity: 75 }, { name: 'Hang clean', sets: 4, reps: 3, intensity: 70 }, { name: 'Box jump', sets: 3, reps: 5, notes: '30 in box' }, { name: 'Nordic curl', sets: 3, reps: 6, notes: 'slow on the way down' }];
  const upper = [{ name: 'Bench press', sets: 4, reps: 6, intensity: 72 }, { name: 'Trap bar deadlift', sets: 3, reps: 5, intensity: 75 }, { name: 'Med ball chest pass', sets: 3, reps: 8 }, { name: 'Copenhagen plank', sets: 3, reps: 1, notes: '20 sec each side' }];
  const w = await rest('POST', 'workouts', [
    { athlete_id: marcus.id, owner_id: staff.id, program: 'Valor plan', week: 1, day: 'Monday', date: wk1Mon, title: 'Lower body power', category: 'Power', description: 'Warm up with the hip series first.', exercises: lower },
    { athlete_id: marcus.id, owner_id: staff.id, program: 'Valor plan', week: 1, day: 'Wednesday', date: wk1Wed, title: 'Upper body strength', category: 'Strength', description: null, exercises: upper },
    { athlete_id: marcus.id, owner_id: staff.id, program: 'Valor plan', week: 2, day: 'Monday', date: addDays(wk1Mon, 7), title: 'Lower body power', category: 'Power', description: null, exercises: lower.map((e) => (e.intensity ? { ...e, intensity: e.intensity + 5 } : e)) },
    { athlete_id: marcus.id, owner_id: staff.id, program: 'Valor plan', week: 2, day: 'Wednesday', date: addDays(wk1Wed, 7), title: 'Upper body strength', category: 'Strength', description: null, exercises: upper.map((e) => (e.intensity ? { ...e, intensity: e.intensity + 5 } : e)) },
  ]);
  await rest('POST', 'workout_logs', { owner_id: dana.id, athlete_id: marcus.id, workout_id: w[0].id, workout_title: w[0].title, date: wk1Mon, week: 1, day: 'Monday', logged_exercises: [{ name: 'Back squat', sets: 4, reps: 5, weight: 185 }, { name: 'Hang clean', sets: 4, reps: 3, weight: 115 }] });

  // 3. Tyler: Marcus's brother, walked in last Saturday, paid cash, same parent login
  const [tyler] = await rest('POST', 'athletes', { parent_id: dana.id, first_name: 'Tyler', last_name: 'Hill', age: 12, sport: 'Football', parent_name: 'Dana Hill', parent_email: 'dana.hill' + DOMAIN, parent_phone: '509-555-0117' });
  const [tb] = await rest('POST', 'bookings', { athlete_id: tyler.id, parent_id: dana.id, origin: 'walk_in', status: 'attended', checked_in_at: atPT(lastSat, 10, 40), athlete_first_name: 'Tyler', athlete_last_name: 'Hill', athlete_age: 12, sport: 'Football', parent_name: 'Dana Hill', parent_email: 'dana.hill' + DOMAIN, parent_phone: '509-555-0117' });
  await rest('POST', 'assessments', { athlete_id: tyler.id, booking_id: tb.id, date: lastSat, coach_id: staff.id, metrics: { sprint_10yd: '2.02', sprint_40yd: '6.10', pro_agility: '5.35', vertical_in: '16', broad_jump_in: '70' }, work_on: 'Arm action when he sprints, and basic squat pattern.', recommended_plan: 'inseason_1x' });
  await pay(tyler.id, dana.id, 'inseason_1x', 'Tyler Hill', 'cash', atPT(lastSat, 11, 12));

  // 4. Ethan: assessed, login sent, hasn't paid yet (the follow-up case)
  const ethan = await athleteByEmail('kim.brown' + DOMAIN, 'Ethan');
  await rest('PATCH', `bookings?athlete_id=eq.${ethan.id}`, { checked_in_at: atPT(lastSat, 10, 29) });
  await rest('POST', 'assessments', { athlete_id: ethan.id, date: lastSat, coach_id: staff.id, metrics: { sprint_10yd: '1.94', sprint_40yd: '5.62', pro_agility: '5.02', vertical_in: '19' }, work_on: 'Core strength and first-step drive.', recommended_plan: 'inseason_2x', notes: 'Dad wants to talk it over. Follow up Tuesday.' });
  const kim = await authAdmin('POST', 'users', { email: 'kim.brown' + DOMAIN, password: pw, email_confirm: true, user_metadata: { full_name: 'Kim Brown', role: 'parent' } });
  // a coach already built Ethan's first week; it stays hidden from the family until he's enrolled
  await rest('POST', 'workouts', { athlete_id: ethan.id, owner_id: staff.id, program: 'Valor plan', week: 1, day: 'Monday', date: addDays(lastSat, 2), title: 'Speed foundations', category: 'Speed', description: null, exercises: [{ name: 'A-skip', sets: 3, reps: 20 }, { name: 'Wall drive', sets: 3, reps: 10 }] });
  await rest('PATCH', `athletes?id=eq.${ethan.id}`, { parent_id: kim.id, invited_at: atPT(lastSat, 10, 55) });

  console.log(`classes/packs: ${cfg.items.map((x) => x.key).join(', ')}${cfg.placeholder ? ' (placeholder, confirm with Corey)' : ''}`);
  console.log(`seeded: next Saturday ${nextSat} (4 booked), ${satAfter} (1), 1 time request, last Saturday ${lastSat} (Marcus 8-class pack by card with 2 used, Tyler walk-in 4-class pack in cash, Ethan assessed and NOT enrolled = locked, Chloe no-show)`);
  console.log('demo parent logins ($DEMO_PASSWORD): dana.hill@ (enrolled, unlocked) and kim.brown@ (not enrolled, locked) valortrainpro.test');
}

const cmd = process.argv[2];
if (cmd === 'purge') await purge();
else if (cmd === 'seed') await seed();
else { console.error('usage: node scripts/demo-data.mjs seed|purge'); process.exit(1); }
