#!/usr/bin/env python3
"""Bring Valor's real assessment requests from the Playbook portal (leads, page=assessment)
into Valor Train Pro. DRY RUN unless --apply.
- Skips Corey's own test (coreybibe30@) and entries with no athlete.
- One row per kid: a repeat submission for the same kid (same athlete first name + phone or
  parent surname) keeps the newest and notes the other parent.
- If the kid is already on the app roster (imported from Corey's workbook), it fills in the
  parent contact + form answers on that athlete instead of adding a request.
- Everyone else goes through ingest-booking as status "requested" (shows under
  "Asked for a different time" / "Waiting on a text" so staff can text to set a time)."""
import json, os, re, sys, urllib.request, uuid
APPLY = "--apply" in sys.argv
TOK = os.environ["SUPABASE_ACCESS_TOKEN"]; KEY = os.environ["VALOR_TRAINPRO_SUPABASE_SERVICE_ROLE_KEY"]; INGEST = os.environ["VALOR_TRAINPRO_INGEST_KEY"]
APP = "https://gpotwyuttkkygvxzktep.supabase.co"
def sql(ref, q):
    r = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}/database/query", data=json.dumps({"query": q}).encode(),
        headers={"Authorization": f"Bearer {TOK}", "content-type": "application/json", "User-Agent": "valor-import"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())
def rest(method, path, body=None):
    r = urllib.request.Request(f"{APP}/rest/v1/{path}", data=json.dumps(body).encode() if body is not None else None, method=method,
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "content-type": "application/json", "Prefer": "return=representation"})
    return json.loads(urllib.request.urlopen(r).read() or b"null")
leads = sql("jggwanbbfaygsjobzjcj", """select id, occurred_at, name, email, phone, source, message from leads
  where client_id='8f39e5e3-37ae-436d-b3e1-249a27704630' and page='assessment' order by occurred_at""")
def field(msg, k):
    m = re.search(rf"{k}:\s*([^|]*)", msg or ""); v = (m.group(1).strip() if m else "")
    return "" if v.lower() in ("", "not answered") else v
digits = lambda p: re.sub(r"\D", "", p or "")[-10:]
SRC = {"Facebook/Meta Ads": "facebook", "Instagram/Facebook (self-reported)": "instagram", "Google (self-reported)": "google",
       "Coach or school (self-reported)": "coach_or_school", "Referral (self-reported)": "referral", "chatgpt.com": "chatgpt", "Direct": "direct"}
kids = {}
for l in leads:
    ath = field(l["message"], "Athlete")
    if not ath or (l["email"] or "").lower() == "coreybibe30@gmail.com": print("  skip:", l["email"], "(no athlete / Corey test)"); continue
    surname = (l["name"] or "").split()[-1].lower() if l["name"] and len(l["name"].split()) > 1 else ""
    key = (ath.split()[0].lower(), field(l["message"], "Age"), field(l["message"], "Primary sport").lower())
    prev = kids.get(key)
    if prev: print(f"  merge repeat: {ath} ({prev['name']} + {l['name']})"); l["also"] = prev["name"]
    kids[key] = {**l, "ath": ath, "also": l.get("also") or (prev and prev.get("name"))}
roster = rest("GET", "athletes?select=id,first_name,last_name,sport,parent_email,notes")
def roster_match(k):
    """Same first name AND same sport AND a surname signal (athlete last name, parent surname, or email)."""
    words = k["ath"].split(); first = words[0].lower(); last = (words[1:] or [""])[0].lower()
    psur = k["name"].split()[-1].lower() if k["name"] and len(k["name"].split()) > 1 else ""
    email = (k["email"] or "").lower(); sport = field(k["message"], "Primary sport").lower()[:6]
    for a in roster:
        if a["first_name"].lower() != first or a.get("parent_email"): continue
        al = (a["last_name"] or "").lower()
        if not al: continue
        rs = (a.get("sport") or "").lower()[:6]
        if sport and rs and sport != rs: continue
        if al == last or al == psur or (len(al) > 3 and (al[:4] == psur[:4] or al[:3] in email.split("@")[0])): return a
    return None
todo_ingest, todo_patch = [], []
DONE = {"eric.davis@rsd.edu", "salazar1788@yahoo.com", "bryan.deshaw@gmail.com"}
for k in kids.values():
    m = k["message"]; d = k["occurred_at"][:10]
    note_bits = [f"Website form {d}", f"City: {field(m,'City')}" if field(m,'City') else "", f"Heard about us: {field(m,'How they heard about us')}" if field(m,'How they heard about us') else "",
                 f"Training: {field(m,'Years training')}" if field(m,'Years training') else "", f"Level: {field(m,'Competes at')}" if field(m,'Competes at') else "",
                 f"Trains {field(m,'Trains per week')}/wk" if field(m,'Trains per week') else "", f"Strength: {field(m,'Strength program')}" if field(m,'Strength program') else "",
                 f"Recognition: {field(m,'Recognition')}" if field(m,'Recognition') else "", f"Other parent: {k['also']}" if k.get("also") else ""]
    note = ". ".join(b for b in note_bits if b)
    rm = None if "--ingest-only" in sys.argv else roster_match(k)
    if "--ingest-only" in sys.argv and (k["email"] or "").lower() in DONE: print("  already merged:", k["ath"]); continue
    if rm:
        todo_patch.append((rm, {"parent_name": k["name"], "parent_email": (k["email"] or "").lower(), "parent_phone": k["phone"],
                                "age": int(field(m,'Age')) if field(m,'Age').isdigit() else None,
                                "notes": ((rm.get("notes") or "") + ("\n" if rm.get("notes") else "") + note)[:2000]}))
        print(f"  roster match: {k['ath']} -> {rm['first_name']} {rm['last_name'] or ''} (add parent {k['name']} {k['email']})")
    else:
        todo_ingest.append({"id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"valor-portal-lead-{k['id']}")), "status": "requested", "athlete_name": k["ath"], "athlete_age": field(m, "Age"),
            "sport": field(m, "Primary sport") or None, "quiz_result": field(m, "Result") or None, "parent_name": k["name"] or (k["email"] or ""),
            "email": (k["email"] or "").lower(), "phone": k["phone"], "note": note[:500], "utm_source": SRC.get(k["source"], k["source"])})
        print(f"  request: {k['ath']} ({field(m,'Age') or '?'}, {field(m,'Primary sport') or '?'}) parent {k['name']} · {k['source']} · {d}")
print(f"\n{len(todo_ingest)} requests to add, {len(todo_patch)} roster athletes to fill in")
if not APPLY: print("dry run: nothing written. Re-run with --apply."); sys.exit()
for rm, patch in todo_patch: rest("PATCH", f"athletes?id=eq.{rm['id']}", {k: v for k, v in patch.items() if v not in (None, "")})
if todo_ingest:
    r = urllib.request.Request(f"{APP}/functions/v1/ingest-booking", data=json.dumps({"bookings": todo_ingest}).encode(), method="POST",
        headers={"x-ingest-key": INGEST, "content-type": "application/json"})
    print(urllib.request.urlopen(r).read().decode()[:500])
