# Facility calendar tests

Both run against the real Supabase project with throwaway rows and `.test` logins, and clean up after themselves.
Load the vault first (`VALOR_TRAINPRO_SUPABASE_URL`, `..._ANON_KEY`, `..._SERVICE_ROLE_KEY`, `VALOR_TRAINPRO_FACILITY_ENC_KEY`).

- `python3 scripts/facility_e2e.py` : the deployed `facility` function end to end (invites, requests, approvals,
  double booking, edits, who can see what). 59 checks.
- `cd scripts && DENO_NO_PACKAGE_JSON=1 deno run --allow-net --allow-env --no-check facility_gcal_test.ts` :
  the Google Calendar link against a stand-in Google server on port 8787 (connect, read in, write out). 16 checks.
  It needs the `vtp-fac-staff@valortrainpro.test` coach login and a "ZZ Test Maniacs" renter to exist; make them
  first or run it right after seeding sample data.

# Autopay "card saved, $0 today" test

`cd scripts && DENO_NO_PACKAGE_JSON=1 deno run --allow-net --allow-env --allow-run --allow-read --no-check autopay_no_invoice_test.ts`
needs the vault loaded (also `VALOR_STRIPE_SECRET_KEY`, `VALOR_STRIPE_WEBHOOK_SECRET`). It makes ONE real unpaid Stripe
Checkout session (expired at the end, no card), runs stripe-webhook locally on port 8000 and sends it signed
`evt_selftest_*` events. Set `WEBHOOK_URL` to test a deployed handler instead of the local one. 13 checks.
