#!/usr/bin/env bash
# Push the branded login emails (supabase/templates/*.html + subjects.json) to Supabase Auth.
# Needs $SUPABASE_ACCESS_TOKEN (Supabase CLI token). Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
import json, os, urllib.request
ref = "gpotwyuttkkygvxzktep"
subj = json.load(open("supabase/templates/subjects.json"))
body = {}
for k, s in subj.items():
    body[f"mailer_subjects_{k}"] = s
    body[f"mailer_templates_{k}_content"] = open(f"supabase/templates/{k}.html").read()
req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}/config/auth", data=json.dumps(body).encode(), method="PATCH",
    headers={"Authorization": f"Bearer {os.environ['SUPABASE_ACCESS_TOKEN']}", "content-type": "application/json", "User-Agent": "valor-train-pro"})
d = json.loads(urllib.request.urlopen(req).read())
print("pushed:", {k: d.get(f"mailer_subjects_{k}") for k in subj})
PY
