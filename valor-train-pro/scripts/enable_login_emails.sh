#!/usr/bin/env bash
# THE SWITCH for Valor-branded login emails (parent invites, login links, password resets).
# Prereq: Michael creates a Gmail app password for valorsportsacademywa@gmail.com
#   (Google Account → Security → 2-Step Verification on → App passwords → "Valor app")
#   and Omar adds to ~/Documents/Claude/Projects/playbook/.env:
#     VALOR_GMAIL_USER=valorsportsacademywa@gmail.com
#     VALOR_GMAIL_APP_PASSWORD=<16 characters, no spaces>
# Then:  scripts/enable_login_emails.sh              (login emails only)
#        scripts/enable_login_emails.sh --bookings   (also turns on website self-booking emails, same password)
# Needs $SUPABASE_ACCESS_TOKEN and the supabase CLI.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source ~/Documents/Claude/Projects/playbook/.env; set +a
: "${VALOR_GMAIL_USER:?add VALOR_GMAIL_USER to the vault}"; : "${VALOR_GMAIL_APP_PASSWORD:?add VALOR_GMAIL_APP_PASSWORD to the vault}"
PASS="${VALOR_GMAIL_APP_PASSWORD// /}"
python3 - "$VALOR_GMAIL_USER" "$PASS" <<'PY'
import json, os, sys, urllib.request
user, pw = sys.argv[1], sys.argv[2]
body = {"smtp_host": "smtp.gmail.com", "smtp_port": "465", "smtp_user": user, "smtp_pass": pw,
        "smtp_admin_email": user, "smtp_sender_name": "Valor Sports Academy", "smtp_max_frequency": 30, "rate_limit_email_sent": 30}
req = urllib.request.Request("https://api.supabase.com/v1/projects/gpotwyuttkkygvxzktep/config/auth", data=json.dumps(body).encode(), method="PATCH",
    headers={"Authorization": f"Bearer {os.environ['SUPABASE_ACCESS_TOKEN']}", "content-type": "application/json", "User-Agent": "valor-train-pro"})
d = json.loads(urllib.request.urlopen(req).read())
print("smtp:", d.get("smtp_host"), d.get("smtp_admin_email"), "| sender:", d.get("smtp_sender_name"), "| limit/hr:", d.get("rate_limit_email_sent"))
PY
scripts/push_email_templates.sh
supabase secrets set AUTH_EMAIL_ENABLED=true --project-ref gpotwyuttkkygvxzktep >/dev/null && echo "app: Email it to them is on"
if [ "${1:-}" = "--bookings" ]; then
  supabase secrets set VALOR_GMAIL_USER="$VALOR_GMAIL_USER" VALOR_GMAIL_APP_PASSWORD="$PASS" --project-ref jggwanbbfaygsjobzjcj >/dev/null && echo "website self-booking: on (assessment-booking now emails and shows the Saturday picker)"
fi
echo "Test: open an athlete with your own email as parent, tap Email it to them, check the inbox (and spam)."
