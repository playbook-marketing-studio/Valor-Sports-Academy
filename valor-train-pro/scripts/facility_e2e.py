"""End-to-end test of the deployed `facility` function with throwaway .test logins. Cleans up after itself."""
import os, json, urllib.request, urllib.parse, urllib.error, base64, datetime, sys
U = os.environ['VALOR_TRAINPRO_SUPABASE_URL'].rstrip('/'); ANON = os.environ['VALOR_TRAINPRO_SUPABASE_ANON_KEY']; SRK = os.environ['VALOR_TRAINPRO_SUPABASE_SERVICE_ROLE_KEY']
def req(method, url, body=None, headers={}):
    h = {'User-Agent': 'vtp-fac-e2e', **headers}; data = None
    if body is not None: data = json.dumps(body).encode(); h['content-type'] = 'application/json'
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r) as x:
            raw = x.read()
            try: return x.status, json.loads(raw or b'null')
            except Exception: return x.status, raw.decode()[:200]
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw or b'null')
        except Exception: return e.code, raw.decode()[:200]
admin = {'apikey': SRK, 'Authorization': 'Bearer ' + SRK}
def rest(method, path, body=None, prefer='return=representation'): return req(method, f'{U}/rest/v1/{path}', body, {**admin, 'Prefer': prefer})
pw = lambda: 'T' + base64.b16encode(os.urandom(8)).decode() + '!x'
fails = []
def check(name, cond, got=None):
    print(('ok   ' if cond else 'FAIL ') + name + ('' if cond else f'  -> {json.dumps(got)[:300]}'))
    if not cond: fails.append(name)

STAFF = 'vtp-fac-staff@valortrainpro.test'; RENTER = 'vtp-fac-renter@valortrainpro.test'; PARENT = 'vtp-fac-parent@valortrainpro.test'
made_users = []; renter_ids = []
def cleanup():
    for rid in renter_ids:
        st, bl = rest('GET', f'facility_blocks?renter_id=eq.{rid}&select=id')
        for b in (bl or []): rest('DELETE', f'message_alerts?key=like.fac:{b["id"]}:*')
        rest('DELETE', f'facility_blocks?renter_id=eq.{rid}')
    rest('DELETE', 'facility_blocks?title=like.ZZTEST*')
    for rid in renter_ids: rest('DELETE', f'facility_renters?id=eq.{rid}')
    rest('DELETE', 'facility_renters?name=like.ZZ%20Test*')
    for email in (STAFF, RENTER, PARENT):
        st, p = rest('GET', f'profiles?email=eq.{urllib.parse.quote(email)}&select=id')
        for row in (p or []): req('DELETE', f'{U}/auth/v1/admin/users/{row["id"]}', None, admin)
cleanup()  # leftovers from an aborted run

def user(email, role=None):
    p = pw()
    st, u = req('POST', f'{U}/auth/v1/admin/users', {'email': email, 'password': p, 'email_confirm': True, 'user_metadata': {'full_name': 'Fac Test'}}, admin)
    assert st == 200, (st, u)
    if role: rest('PATCH', f'profiles?id=eq.{u["id"]}', {'role': role})
    return u['id'], login(email, p)
def login(email, p):
    st, s = req('POST', f'{U}/auth/v1/token?grant_type=password', {'email': email, 'password': p}, {'apikey': ANON})
    assert st == 200, (st, s)
    return s['access_token']
def fn(jwt, body): return req('POST', f'{U}/functions/v1/facility', body, {'Authorization': 'Bearer ' + jwt, 'apikey': ANON, 'Origin': 'https://preview.example'})

try:
    staff_id, sj = user(STAFF, 'admin')
    parent_id, pj = user(PARENT)
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-8))).date()
    d = lambda n: (today + datetime.timedelta(days=n)).isoformat()
    D = d(10)                                   # the day everything happens on
    wk = D; wk_from, wk_to = d(8), d(14)

    # ── renters + invite ──
    st, r = fn(sj, {'action': 'save_renter', 'name': 'ZZ Test Maniacs', 'is_example': True}); check('staff makes a renter', st == 200 and r.get('renter'), r)
    rid = r['renter']['id']; renter_ids.append(rid)
    st, r2 = fn(sj, {'action': 'save_renter', 'name': 'ZZ Test Other', 'is_example': True}); rid2 = r2['renter']['id']; renter_ids.append(rid2)
    st, r = fn(sj, {'action': 'invite_member', 'renter_id': rid, 'email': STAFF}); check('inviting a coach email is refused', st == 409, r)
    st, r = fn(sj, {'action': 'invite_member', 'renter_id': rid, 'email': RENTER.upper(), 'full_name': 'Renter Test'})
    check('invite makes a login, no email to a .test address, hands back a link', st == 200 and r.get('emailed') is False and r.get('existing_login') is False and str(r.get('link', '')).startswith('http'), r)
    st, p = rest('GET', f'profiles?email=eq.{urllib.parse.quote(RENTER)}&select=id,role,full_name'); check('new login has role renter', p and p[0]['role'] == 'renter', p)
    renter_uid = p[0]['id']; rp = pw()
    req('PUT', f'{U}/auth/v1/admin/users/{renter_uid}', {'password': rp, 'email_confirm': True}, admin); rj = login(RENTER, rp)
    st, r = fn(sj, {'action': 'invite_member', 'renter_id': rid2, 'email': PARENT}); check('an existing parent login is linked, keeps role parent', st == 200 and r.get('existing_login') is True, r)
    st, p = rest('GET', f'profiles?id=eq.{parent_id}&select=role'); check('parent role unchanged', p[0]['role'] == 'parent', p)
    st, r = fn(sj, {'action': 'remove_member', 'renter_id': rid2, 'user_id': parent_id}); check('remove member', st == 200, r)

    # ── who can do what ──
    st, r = fn(pj, {'action': 'calendar', 'from': wk_from, 'to': wk_to}); check('a parent with no renter sees nothing', st == 200 and r == {'role': 'none'}, r)
    st, r = fn(pj, {'action': 'request', 'date': D, 'start_min': 1080, 'end_min': 1140, 'space': 'full'}); check('a parent cannot request', st == 403, r)
    st, r = fn(rj, {'action': 'save_blocks', 'kind': 'valor', 'date': D, 'start_min': 600, 'end_min': 660}); check('a renter cannot add blocks', st == 403, r)
    st, r = fn(rj, {'action': 'gcal_connect'}); check('a renter cannot connect Google', st == 403, r)
    st, r = req('POST', f'{U}/functions/v1/facility', {'action': 'calendar', 'from': wk_from, 'to': wk_to}, {'apikey': ANON, 'Authorization': 'Bearer ' + ANON}); check('signed out is refused', st == 401, r)
    st, rows = req('GET', f'{U}/rest/v1/facility_blocks?select=id', None, {'apikey': ANON, 'Authorization': 'Bearer ' + rj}); check('renter reads no rows straight from the table', st == 200 and rows == [], rows)
    st, rows = req('GET', f'{U}/rest/v1/facility_gcal?select=*', None, {'apikey': ANON, 'Authorization': 'Bearer ' + sj}); check('even staff cannot read the Google token row', rows == [] or st >= 400, rows)
    st, rows = req('POST', f'{U}/rest/v1/facility_blocks', {'kind': 'closed', 'starts_at': D + 'T10:00:00-08:00', 'ends_at': D + 'T11:00:00-08:00'}, {'apikey': ANON, 'Authorization': 'Bearer ' + sj}); check('staff cannot write the table directly', st >= 400, rows)

    # ── staff blocks ──
    st, r = fn(sj, {'action': 'save_blocks', 'kind': 'valor', 'title': 'ZZTEST Classes', 'date': D, 'start_min': 960, 'end_min': 1080}); check('staff adds a Valor block 4 to 6pm', st == 200 and r['created'] == 1, r)
    st, r = fn(sj, {'action': 'save_blocks', 'kind': 'rental', 'renter_id': rid2, 'space': 'half', 'date': D, 'start_min': 1080, 'end_min': 1200}); check('staff adds a half-turf rental 6 to 8pm for the other group', st == 200 and r['created'] == 1, r)
    st, r = fn(sj, {'action': 'save_blocks', 'kind': 'rental', 'renter_id': rid2, 'space': 'full', 'date': D, 'start_min': 1020, 'end_min': 1140}); check('a full block over them is skipped as booked', st == 200 and r['created'] == 0 and r['skipped'][0]['reason'] == 'already booked', r)
    wd = (today + datetime.timedelta(days=20)).isoweekday()
    st, r = fn(sj, {'action': 'save_blocks', 'kind': 'rental', 'renter_id': rid, 'space': 'full', 'date': d(20), 'start_min': 1080, 'end_min': 1260, 'repeat': {'days': [wd], 'until': d(20 + 21)}}); check('weekly repeat makes 4 blocks', st == 200 and r['created'] == 4, r)
    st, r = fn(sj, {'action': 'save_blocks', 'kind': 'rental', 'renter_id': rid2, 'space': 'full', 'date': d(20), 'start_min': 1140, 'end_min': 1200, 'repeat': {'days': [wd], 'until': d(20 + 21)}}); check('a clashing repeat skips all 4', st == 200 and r['created'] == 0 and len(r['skipped']) == 4, r)

    # ── renter requests ──
    R = lambda **k: fn(rj, {'action': 'request', 'date': D, 'space': 'full', **k})
    st, r = R(start_min=1200, end_min=1230); check('too short is refused', st == 400 and 'shortest' in r['error'], r)
    st, r = R(start_min=1215, end_min=1275); check('off the half hour is refused', st == 400, r)
    st, r = R(start_min=300, end_min=420); check('before opening is refused', st == 400, r)
    st, r = fn(rj, {'action': 'request', 'date': d(0), 'start_min': 1260, 'end_min': 1320, 'space': 'full'}); check('less than 24 hours notice is refused', st == 400 and 'notice' in r['error'], r)
    st, r = fn(rj, {'action': 'request', 'date': d(120), 'start_min': 1080, 'end_min': 1140, 'space': 'full'}); check('more than 90 days out is refused', st == 400, r)
    st, r = R(start_min=990, end_min=1050); check('over a Valor block is refused as taken', st == 409, r)
    st, r = R(start_min=1080, end_min=1140); check('full turf while a half is rented is refused', st == 409, r)
    st, r = fn(rj, {'action': 'request', 'date': D, 'start_min': 1080, 'end_min': 1140, 'space': 'half', 'note': 'ZZ half request'}); check('half turf beside the other half is accepted, coaches not emailed for a test login', st == 200 and r['status'] == 'pending' and r['coaches_emailed'] is False, r)
    half_id = r['id']
    st, r = fn(rj, {'action': 'request', 'date': D, 'start_min': 1080, 'end_min': 1140, 'space': 'half'}); check('asking twice for the same time is refused', st == 409, r)
    st, r = R(start_min=1200, end_min=1260, note='ZZ full 8 to 9'); check('full turf 8 to 9pm is accepted', st == 200, r); full_id = r['id']
    st, r = R(start_min=1230, end_min=1290); check('a second overlapping request is allowed while both wait', st == 200, r); second_id = r['id']
    st, r = R(start_min=780, end_min=840); check('a fourth request is accepted', st == 200, r); third_id = r.get('id')

    # ── what each side sees ──
    st, cal = fn(rj, {'action': 'calendar', 'from': wk_from, 'to': wk_to})
    kinds = sorted(b['kind'] for b in cal['blocks'])
    check('renter calendar: own pending, the other group as booked, Valor time as valor', st == 200 and cal['role'] == 'renter' and kinds.count('mine_pending') == 4 and kinds.count('booked') == 1 and kinds.count('valor') == 1, kinds)
    leak = [b for b in cal['blocks'] if b['kind'] in ('booked', 'valor') and (set(b) - {'kind', 'space', 'starts_at', 'ends_at'})]
    check('nothing about other groups leaks (no ids, names, titles or notes)', not leak and 'ZZ Test Other' not in json.dumps(cal) and 'ZZTEST' not in json.dumps(cal), leak)
    check('renter gets the rules and rates', cal['rules']['rates'] == {'full': 12500, 'half': 5000} and cal['rules']['notice_hours'] == 24, cal['rules'])
    check('My requests lists the 4 waiting and the 4 weekly times', len([x for x in cal['requests'] if x['status'] == 'pending']) == 4 and len([x for x in cal['requests'] if x['status'] == 'approved']) == 4, [x['status'] for x in cal['requests']])
    st, sc = fn(sj, {'action': 'calendar', 'from': wk_from, 'to': wk_to})
    check('staff calendar: names, titles, waiting list, renters, Google status', st == 200 and sc['role'] == 'staff' and len(sc['waiting']) == 4 and any(b['renter'] == 'ZZ Test Other' for b in sc['blocks']) and any(b['title'] == 'ZZTEST Classes' for b in sc['blocks']) and sc['google']['connected'] is False, {k: (len(v) if isinstance(v, list) else v) for k, v in sc.items()})
    check('no waiting request is flagged while the floor is open', all(w['conflict'] is None for w in sc['waiting']), [w['conflict'] for w in sc['waiting']])
    check('renters come with their logins', any(r_['name'] == 'ZZ Test Maniacs' and r_['facility_renter_members'][0]['email'] == RENTER for r_ in sc['renters']), sc['renters'])

    # ── decisions ──
    st, r = fn(sj, {'action': 'decide', 'id': full_id, 'approve': True}); check('approve the 8 to 9pm request, no email to a .test renter', st == 200 and r['status'] == 'approved' and r['renter_emailed'] is False, r)
    st, sc = fn(sj, {'action': 'calendar', 'from': wk_from, 'to': wk_to}); flag = [w['conflict'] for w in sc['waiting'] if w['id'] == second_id]
    check('the overlapping request is now flagged as booked', flag == ['booked'], flag)
    st, r = fn(sj, {'action': 'decide', 'id': second_id, 'approve': True}); check('approving it is refused: already booked', st == 409 and r.get('code') == 'booked', r)
    st, r = fn(sj, {'action': 'decide', 'id': second_id, 'approve': False, 'staff_note': 'ZZ taken, try 9pm'}); check('decline with a note', st == 200 and r['status'] == 'declined', r)
    st, r = fn(sj, {'action': 'decide', 'id': second_id, 'approve': True}); check('a decided request cannot be decided again', st == 409, r)
    st, r = fn(sj, {'action': 'decide', 'id': half_id, 'approve': True}); check('approve the half-turf request (two halves at once)', st == 200, r)
    st, r = fn(rj, {'action': 'cancel', 'id': third_id}); check('renter pulls back a waiting request', st == 200, r)
    st, r = fn(rj, {'action': 'cancel', 'id': full_id}); check('renter cannot cancel a confirmed time', st == 409, r)
    st, r = fn(pj, {'action': 'cancel', 'id': half_id}); check("someone else cannot cancel it", st == 404, r)
    st, cal = fn(rj, {'action': 'calendar', 'from': wk_from, 'to': wk_to}); dec = [x for x in cal['requests'] if x['id'] == second_id]
    check('renter sees the decline and the coach note', dec and dec[0]['status'] == 'declined' and dec[0]['staff_note'] == 'ZZ taken, try 9pm', dec)
    check('renter calendar now shows 2 of their own times', sorted(b['kind'] for b in cal['blocks']).count('mine') == 2, [b['kind'] for b in cal['blocks']])

    # ── edit + delete ──
    st, r = fn(sj, {'action': 'update_block', 'id': full_id, 'scope': 'one', 'start_min': 1200, 'end_min': 1290}); check('staff stretches the 8pm block to 9:30', st == 200 and r['changed'] == 1, r)
    st, r = fn(sj, {'action': 'update_block', 'id': full_id, 'scope': 'one', 'start_min': 1110, 'end_min': 1170}); check('moving it onto the two halves is skipped as booked', st == 200 and r['changed'] == 0 and r['skipped'], r)
    st, ser = rest('GET', f'facility_blocks?renter_id=eq.{rid}&series_id=not.is.null&select=id,starts_at,series_id&order=starts_at')
    st, r = fn(sj, {'action': 'update_block', 'id': ser[1]['id'], 'scope': 'series', 'start_min': 1140, 'end_min': 1260, 'space': 'half'}); check('series edit changes this one and the 2 after it', st == 200 and r['changed'] == 3, r)
    st, after = rest('GET', f'facility_blocks?series_id=eq.{ser[0]["series_id"]}&select=space,starts_at&order=starts_at')
    check('first block of the series untouched, later ones moved to 7pm half', after[0]['space'] == 'full' and after[0]['starts_at'] == ser[0]['starts_at'] and all(a['space'] == 'half' for a in after[1:]) and after[1]['starts_at'] != ser[1]['starts_at'], after)
    st, r = fn(sj, {'action': 'delete_block', 'id': ser[2]['id'], 'scope': 'series'}); check('series delete removes this one and the one after', st == 200 and r['removed'] == 2 and r['renter_emailed'] is False, r)
    st, left = rest('GET', f'facility_blocks?series_id=eq.{ser[0]["series_id"]}&status=eq.approved&select=id'); check('2 of the series are left', len(left) == 2, left)
    st, r = fn(sj, {'action': 'gcal_connect'}); check('Google connect hands a coach a link to Google with the right return address', st == 200 and r.get('configured') is True and 'accounts.google.com' in r.get('url', '') and 'gcal-callback' in r.get('url', ''), r)
    st, r = fn(sj, {'action': 'save_renter', 'id': rid2, 'name': 'ZZ Test Other', 'archived': True}); check('archive a renter', st == 200 and r['renter']['archived_at'], r)
    st, r = req('GET', f'{U}/functions/v1/facility/gcal-callback?code=x&state=bad', None, {'apikey': ANON}); check('a made-up Google callback is turned away (lands back on the app, nothing stored)', st == 200 and '<html' in str(r).lower(), str(r)[:80])
finally:
    cleanup()
    st, a = rest('GET', 'facility_blocks?select=id'); st, b = rest('GET', 'facility_renters?select=id'); st, c = rest('GET', 'profiles?email=like.vtp-fac-*&select=id'); st, m = rest('GET', 'message_alerts?key=like.fac:*&select=key')
    print('left behind: blocks', len(a), 'renters', len(b), 'test logins', len(c), 'alert keys', len(m))
print('\nFAILED:' if fails else '\nALL PASSED', fails or '')
sys.exit(1 if fails else 0)
