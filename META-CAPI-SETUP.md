# Meta Conversions API — Valor Sports Academy

Server-side conversion tracking for valorsportsacademywa.com. The code is
deployed and inert until the two environment variables below are set.

## How it works

| Half | Where | Fires |
|---|---|---|
| Browser pixel | `cta.js` | `PageView` everywhere; `Lead` on `/thank-you`; `CompleteRegistration` on `/giveaway-thank-you`; `Lead` inline on `/assessment` |
| Server (CAPI) | `netlify/functions/submission-created.js` | `Lead` (contact, assessment) and `CompleteRegistration` (giveaway), on every verified Netlify Forms submission |

Both halves send the **same `event_id`**, so Meta keeps one event, not two.
`cta.js` mints the id at submit time, writes it into the hidden `pb_event_id`
field, and stashes it in `sessionStorage` for the thank-you page.

Netlify registers a form's fields by parsing the HTML at deploy time, so the
`pb_*` hidden inputs live in the markup of `contact.html`, `giveaway.html` and
`assessment.html`. **Do not delete them** — a JS-injected field is not recorded.

## Setup

### 1. Generate the Conversions API token

Events Manager → the dataset → **Settings** → *Set up direct integration* →
**Generate access token**. (This is the wizard in the "Connect your web data"
screenshot: pick **Set up Conversions API** → *Direct integration* → *without
Dataset Quality API* unless you also want match-rate reporting.)

Copy the token once — Meta will not show it again.

### 2. Set the Netlify environment variables

Netlify → the Valor site → **Site configuration → Environment variables**:

| Variable | Value |
|---|---|
| `META_CAPI_DATASET_ID` | the dataset / pixel ID |
| `META_CAPI_TOKEN` | the token from step 1 |
| `META_CAPI_DATASET_ID_2` | *(optional)* second dataset, while two ad accounts run in parallel |
| `META_CAPI_TOKEN_2` | *(optional)* token for that second dataset |
| `META_CAPI_TEST_CODE` | *(optional)* Events Manager → Test Events code — **remove after testing** |

Redeploy after saving; functions only pick up new env vars on a fresh deploy.

### 3. Add the dataset to the browser pixel

If the site should also report client-side into a second dataset, add its ID to
the `PIXELS` array at the top of `cta.js`. There is a commented placeholder
line there.

## Testing

1. Events Manager → the dataset → **Test Events**, copy the code.
2. Set `META_CAPI_TEST_CODE` in Netlify, redeploy.
3. Submit the contact form on the live site.
4. Expect **one** `Lead` in Test Events showing both `Browser` and `Server` as
   sources — that is dedup working. Two separate `Lead` rows means the
   `event_id` did not match.
5. Delete `META_CAPI_TEST_CODE` and redeploy.

Function logs: Netlify → **Logs → Functions → submission-created**. Every run
prints a `[capi]` line, including why it skipped.

## Notes

- The function always returns HTTP 200. Netlify retries non-2xx submissions,
  and a retry would double-count the lead.
- Submissions with no email, phone or click id are skipped — Meta cannot match
  them and they only depress match quality.
- Email, phone and name are SHA-256 hashed before they leave Netlify. `fbc`,
  `fbp`, IP and user agent are sent in the clear, as Meta requires.
- The access token lives only in Netlify's environment. Do not commit it.
