import json, os, urllib.request, urllib.error
U = os.environ["VALOR_TRAINPRO_SUPABASE_URL"].rstrip("/"); SR = os.environ["VALOR_TRAINPRO_SUPABASE_SERVICE_ROLE_KEY"]; AN = os.environ["VALOR_TRAINPRO_SUPABASE_ANON_KEY"]
ORIGIN = "https://valor-train-82h3orli2-vegan-demons-projects.vercel.app"
def http(method, url, body=None, headers=None):
    h = {"content-type": "application/json", "User-Agent": "vtp-test"}; h.update(headers or {})
    r = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers=h, method=method)
    try:
        resp = urllib.request.urlopen(r); t = resp.read().decode(); return resp.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t
srh = {"apikey": SR, "Authorization": "Bearer " + SR}
def rest(method, path, body=None):
    return http(method, f"{U}/rest/v1/{path}", body, {**srh, "Prefer": "return=representation"})
def session(email):
    http("POST", f"{U}/auth/v1/admin/users", {"email": email, "email_confirm": True}, srh)
    s, d = http("POST", f"{U}/auth/v1/admin/generate_link", {"type": "magiclink", "email": email}, srh)
    s, v = http("POST", f"{U}/auth/v1/verify", {"type": "email", "email": email, "token": d.get("email_otp") or d["properties"]["email_otp"]}, {"apikey": AN})
    assert s == 200, (s, v); return v
def fn(body, jwt=None):
    return http("POST", f"{U}/functions/v1/waiver", body, {"apikey": AN, "Authorization": "Bearer " + (jwt or AN), "origin": ORIGIN})
