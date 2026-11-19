# Team sign link tests against the deployed waiver function. Throwaway .test logins and a ZZ test team; cleans up.
from wvtest import *
fails = []
def check(name, ok, got=None):
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  -> {str(got)[:300]}"))
    if not ok: fails.append(name)
staff = session("wvteam-staff@valor.test"); sid = staff["user"]["id"]
rest("PATCH", f"profiles?id=eq.{sid}", {"role": "admin"}); staff = session("wvteam-staff@valor.test")
parent = session("wvteam-parent@valor.test")
S = staff["access_token"]
team_ids = []
try:
    s, d = fn({"action": "team_add", "name": "ZZ Test Team"}, parent["access_token"])
    check("a parent can't make a team link", s in (401, 403, 404), (s, d))
    s, d = fn({"action": "team_add", "name": "ZZ Test Team"}, S)
    check("staff make a team link", s == 200 and "/waiver/team/" in d.get("url", ""), (s, d))
    team_ids.append(d["id"]); tt = d["url"].rsplit("/", 1)[1]
    s, d = fn({"action": "team_link", "tt": tt})
    check("the link opens with no login: team name + waiver", s == 200 and d["team"]["name"] == "ZZ Test Team" and d["waiver"]["version"], (s, d))
    ver = d["waiver"]["version"]
    s, d = fn({"action": "team_link", "tt": "x" * 22})
    check("a made-up link is refused", s == 404, (s, d))
    base = {"action": "team_sign", "tt": tt, "signer_role": "parent", "agree": True, "version": ver}
    s, d = fn({**base, "athlete_name": "Kid", "signer_name": "Pat Parent", "signer_email": "pat@wvteam.test"})
    check("athlete needs first and last name", s == 400 and "athlete" in d["error"], (s, d))
    s, d = fn({**base, "athlete_name": "Kid One", "signer_name": "Pat Parent", "signer_email": ""})
    check("email required", s == 400, (s, d))
    s, d = fn({**base, "agree": False, "athlete_name": "Kid One", "signer_name": "Pat Parent", "signer_email": "pat@wvteam.test"})
    check("checkbox required", s == 400, (s, d))
    s, d = fn({**base, "version": "old", "athlete_name": "Kid One", "signer_name": "Pat Parent", "signer_email": "pat@wvteam.test"})
    check("wrong version refused", s == 409, (s, d))
    s, d = fn({**base, "athlete_name": "Kid One", "signer_name": "Pat Parent", "signer_email": "pat@wvteam.test"})
    check("a parent signs for a kid", s == 200 and d.get("signed") and d["signature"]["athlete_name"] == "Kid One" and d["emailed"] is False, (s, d))
    sig1 = d["signature"]["id"]
    s, d = fn({**base, "athlete_name": "kid one", "signer_name": "Pat Parent", "signer_email": "PAT@wvteam.test"})
    check("same kid + same email again = already signed", s == 200 and d.get("already"), (s, d))
    s, d = fn({**base, "athlete_name": "Kid Two", "signer_name": "Pat Parent", "signer_email": "pat@wvteam.test"})
    check("same parent signs a second kid", s == 200 and d.get("signed"), (s, d))
    s, d = fn({**base, "signer_role": "athlete", "athlete_name": "", "signer_name": "Adult Athlete", "signer_email": "adult@wvteam.test"})
    check("an adult athlete signs for themself (athlete name = their name)", s == 200 and d["signature"]["athlete_name"] == "Adult Athlete", (s, d))
    s, row = rest("GET", f"waiver_signatures?id=eq.{sig1}&select=*")
    r = row[0]
    check("stored: method team, team id, no athlete, text hash, ip, device", r["method"] == "team" and r["team_id"] == team_ids[0] and r["athlete_id"] is None and len(r["body_sha256"]) == 64 and r["ip"] and r["user_agent"], r)
    s, d = fn({"action": "list"}, S)
    t = [x for x in d.get("teams", []) if x["id"] == team_ids[0]]
    ts = [x for x in d.get("team_signatures", []) if x["team_id"] == team_ids[0]]
    check("staff list: the team with 3 signed + the link", t and t[0]["signed"] == 3 and t[0]["url"].endswith(tt), t)
    check("staff list: team signatures labeled with the team", len(ts) == 3 and all(x["team"] == "ZZ Test Team" and x["method"] == "team" for x in ts), ts)
    check("  team signatures are not in the athlete list", not any(a.get("signature") and a["signature"]["id"] == sig1 for a in d["athletes"]))
    s, d = fn({"action": "copy", "signature_id": sig1}, S)
    check("staff can open the signed copy", s == 200 and d["signature"]["athlete_name"] == "Kid One" and d["waiver"]["body"], (s, d))
    s, d = fn({"action": "copy", "signature_id": sig1}, parent["access_token"])
    check("a family login can't open a team copy", s == 403, (s, d))
    s, d = rest("GET", f"waiver_signatures?id=eq.{sig1}&select=ip"); ip = d[0]["ip"]
    rows = [{"team_id": team_ids[0], "version": ver, "body_sha256": "x" * 64, "athlete_name": f"Flood {i}", "signer_name": "Flood Test", "signer_role": "parent", "signer_email": f"f{i}@wvteam.test", "method": "team", "agreed": True, "ip": ip} for i in range(13)]
    rest("POST", "waiver_signatures", rows)
    s, d = fn({**base, "athlete_name": "Kid Sixteen", "signer_name": "Pat Parent", "signer_email": "pat@wvteam.test"})
    check("throttle: 15 from the same IP in an hour, the 16th is refused", s == 429, (s, d))
    s, d = fn({"action": "team_set", "team_id": team_ids[0], "active": False}, S)
    check("staff turn the link off", s == 200 and d["active"] is False, (s, d))
    s, d = fn({"action": "team_link", "tt": tt})
    check("  a turned-off link says so", s == 410, (s, d))
    s, d = fn({**base, "athlete_name": "Kid Three", "signer_name": "Pat Parent", "signer_email": "pat@wvteam.test"})
    check("  and can't be signed", s == 410, (s, d))
    s, d = fn({"action": "team_set", "team_id": team_ids[0], "active": True}, S)
    s, d = fn({"action": "team_link", "tt": tt})
    check("turn it back on: the same link works again", s == 200, (s, d))
finally:
    for t in team_ids:
        rest("DELETE", f"waiver_signatures?team_id=eq.{t}"); rest("DELETE", f"waiver_teams?id=eq.{t}")
    for e in ["wvteam-staff@valor.test", "wvteam-parent@valor.test"]:
        s, p = rest("GET", f"profiles?email=eq.{e}&select=id")
        for x in p or []: http("DELETE", f"{U}/auth/v1/admin/users/{x['id']}", None, srh)
    print("left:", rest("GET", "waiver_signatures?select=id")[1], rest("GET", "waiver_teams?select=id")[1], rest("GET", "profiles?email=like.wvteam-*&select=id")[1])
    print(f"\n{len(fails)} FAILED" if fails else "\nall passed")
