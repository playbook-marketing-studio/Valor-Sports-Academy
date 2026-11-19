# Staff-only lock (Omar 11/19): while the waiver text is a draft, families see nothing and nothing can be signed or emailed.
# Runs against the deployed waiver function with throwaway .test logins, an example athlete and a ZZ team; cleans up.
# Run: set -a; source ~/Documents/Claude/Projects/playbook/.env; set +a; python3 scripts/waiver_lock_test.py
from wvtest import *
fails = []
def check(name, ok, got=None):
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  -> {str(got)[:300]}"))
    if not ok: fails.append(name)
s, cfg = rest("GET", "settings?key=eq.waiver&select=value"); ver = cfg[0]["value"]["version"]
s, t = rest("GET", f"waiver_texts?version=eq.{ver}&select=status")
check("the waiver text on file is still a draft", t and t[0]["status"] == "draft", t)
staff = session("wvlock-staff@valor.test"); sid = staff["user"]["id"]
rest("PATCH", f"profiles?id=eq.{sid}", {"role": "admin"}); staff = session("wvlock-staff@valor.test")
parent = session("wvlock-parent@valor.test"); pid = parent["user"]["id"]
S, P = staff["access_token"], parent["access_token"]
ath = team = None
try:
    s, a = rest("POST", "athletes", {"first_name": "Lock", "last_name": "Test", "parent_id": pid, "parent_email": "wvlock-parent@valor.test", "is_example": True, "app_signup_at": "2026-11-19T22:00:00Z"})
    ath = a[0]["id"]
    s, d = fn({"action": "mine"}, P)
    check("family app: no waiver, no athletes to sign, setting off", s == 200 and d["waiver"] is None and d["athletes"] == [] and d["setting"]["required"] == "off", d)
    s, d = fn({"action": "sign", "athlete_id": ath, "signer_name": "Pat Test", "signer_role": "parent", "agree": True, "version": ver}, P)
    check("family app: signing is refused", s == 423, (s, d))
    s, d = fn({"action": "sign_link", "athlete_id": ath}, S)
    tok = d["url"].rsplit("/", 1)[1]
    s, d = fn({"action": "link", "t": tok})
    check("private link / QR: opens but shows no waiver (page says not ready)", s == 200 and d["waiver"] is None and d.get("not_open"), d)
    s, d = fn({"action": "sign", "t": tok, "signer_name": "Pat Test", "signer_role": "parent", "signer_email": "pat@wvlock.test", "agree": True, "version": ver})
    check("private link: signing is refused", s == 423, (s, d))
    s, d = fn({"action": "send", "athlete_id": ath}, S)
    check("staff Email link is refused (no email goes out)", s == 423, (s, d))
    s, d = fn({"action": "team_add", "name": "ZZ Lock Team"}, S)
    check("staff can still make a team link", s == 200 and "/waiver/team/" in d.get("url", ""), (s, d))
    team = d["id"]; tt = d["url"].rsplit("/", 1)[1]
    s, d = fn({"action": "team_link", "tt": tt})
    check("team link: opens but shows no waiver", s == 200 and d["waiver"] is None and d["team"]["name"] == "ZZ Lock Team", d)
    s, d = fn({"action": "team_sign", "tt": tt, "athlete_name": "Kid Lock", "signer_name": "Pat Test", "signer_role": "parent", "signer_email": "pat@wvlock.test", "agree": True, "version": ver})
    check("team link: signing is refused", s == 423, (s, d))
    s, d = fn({"action": "list"}, S)
    check("staff page: loads, says not open, still has the text to preview", s == 200 and d["open"] is False and d["waiver"]["status"] == "draft", {k: d.get(k) for k in ("open", "waiver")})
    s, n = rest("GET", "waiver_signatures?select=id")
    check("no signatures were made", n == [], n)
finally:
    if team: rest("DELETE", f"waiver_signatures?team_id=eq.{team}"); rest("DELETE", f"waiver_teams?id=eq.{team}")
    if ath: rest("DELETE", f"waiver_requests?athlete_id=eq.{ath}"); rest("DELETE", f"athletes?id=eq.{ath}")
    for e in ["wvlock-staff@valor.test", "wvlock-parent@valor.test"]:
        s, p = rest("GET", f"profiles?email=eq.{e}&select=id")
        for x in p or []: http("DELETE", f"{U}/auth/v1/admin/users/{x['id']}", None, srh)
    print("left:", rest("GET", "waiver_teams?select=id")[1], rest("GET", "athletes?first_name=eq.Lock&last_name=eq.Test&select=id")[1], rest("GET", "profiles?email=like.wvlock-*&select=id")[1])
    print(f"\n{len(fails)} FAILED" if fails else "\nall passed")
