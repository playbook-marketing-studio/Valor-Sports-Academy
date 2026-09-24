#!/usr/bin/env bash
# Connect Valor's Stripe account to Train Pro (test or live), in one step.
# Prereq: Valor adds omar@playbookmarketing.studio to their Stripe account as a Developer.
# 1. In Stripe (top right toggle) pick Test mode (or live later) → Developers → API keys → reveal Secret key.
# 2. Put it in ~/Documents/Claude/Projects/playbook/.env as VALOR_STRIPE_SECRET_KEY=sk_test_... (sk_live_... for live)
# 3. Run:  scripts/connect_stripe.sh
# The script creates (or reuses) the webhook endpoint for the app, saves its signing secret to the vault as
# VALOR_STRIPE_WEBHOOK_SECRET, and sets both as Supabase secrets. Card payments then work in the app.
set -euo pipefail
cd "$(dirname "$0")/.."
VAULT=~/Documents/Claude/Projects/playbook/.env
set -a; source "$VAULT"; set +a
: "${VALOR_STRIPE_SECRET_KEY:?add VALOR_STRIPE_SECRET_KEY to the vault first}"
URL="https://gpotwyuttkkygvxzktep.supabase.co/functions/v1/stripe-webhook"
MODE=$([[ "$VALOR_STRIPE_SECRET_KEY" == sk_live_* ]] && echo live || echo test)
EXISTING=$(curl -s -u "$VALOR_STRIPE_SECRET_KEY:" "https://api.stripe.com/v1/webhook_endpoints?limit=100" | python3 -c "import json,sys;d=json.load(sys.stdin);print(next((w['id'] for w in d.get('data',[]) if w['url']=='$URL'),''))")
if [ -n "$EXISTING" ]; then
  echo "webhook already exists ($EXISTING, $MODE). Stripe only shows its signing secret once; if VALOR_STRIPE_WEBHOOK_SECRET is missing, delete that endpoint in the Stripe dashboard and re-run."
else
  SECRET=$(curl -s -u "$VALOR_STRIPE_SECRET_KEY:" https://api.stripe.com/v1/webhook_endpoints \
    -d url="$URL" -d description="Valor Train Pro (app.valorsportsacademywa.com)" \
    -d "enabled_events[]=checkout.session.completed" -d "enabled_events[]=checkout.session.async_payment_succeeded" \
    -d "enabled_events[]=checkout.session.async_payment_failed" -d "enabled_events[]=checkout.session.expired" \
    -d "enabled_events[]=charge.refunded" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('secret') or ''); sys.stderr.write(str(d.get('error',''))+'\n' if not d.get('secret') else '')")
  [ -n "$SECRET" ] || { echo "could not create the webhook"; exit 1; }
  grep -v '^VALOR_STRIPE_WEBHOOK_SECRET=' "$VAULT" > "$VAULT.tmp" && mv "$VAULT.tmp" "$VAULT"
  echo "VALOR_STRIPE_WEBHOOK_SECRET=$SECRET" >> "$VAULT"
  VALOR_STRIPE_WEBHOOK_SECRET=$SECRET
  echo "webhook created ($MODE), signing secret saved to the vault"
fi
: "${VALOR_STRIPE_WEBHOOK_SECRET:?VALOR_STRIPE_WEBHOOK_SECRET missing (see note above)}"
supabase secrets set STRIPE_SECRET_KEY="$VALOR_STRIPE_SECRET_KEY" STRIPE_WEBHOOK_SECRET="$VALOR_STRIPE_WEBHOOK_SECRET" --project-ref gpotwyuttkkygvxzktep >/dev/null
echo "Stripe connected in $MODE mode. Test: open an athlete, pick a class, Card: show QR to scan, pay with 4242 4242 4242 4242 (any future date, any CVC). The screen flips to Paid."
