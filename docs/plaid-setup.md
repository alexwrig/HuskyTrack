# Plaid setup

Plaid Transactions is how bank and card spending gets into HuskyTrack. Every Plaid call runs server-side. The browser only ever sees short-lived link and public tokens. Access tokens are stored encrypted (AES-256-GCM) and never leave the server.

## How it fits together

| Piece | File |
| --- | --- |
| Plaid client, env validation, error logging | `src/lib/plaid.ts` |
| `/transactions/sync` engine (cursor per item, lock, retries) | `src/lib/plaidSync.ts` |
| Link token (new link or update mode) | `app/api/plaid/create-link-token` |
| Public token exchange | `app/api/plaid/exchange-public-token` |
| Manual sync ("Sync now") | `app/api/plaid/sync` |
| List / remove linked accounts | `app/api/plaid/items`, `app/api/plaid/items/[id]` |
| Webhooks (JWT-verified) | `app/api/plaid/webhook` |
| OAuth bank redirect target | `app/oauth-return` |
| UI | `src/components/PlaidAccounts.tsx`, `PlaidLinkButton.tsx`, `usePlaidLinkFlow.ts` |

Behavior worth knowing:

- **Expenses only.** Plaid's sign convention is positive = money out. Only positive amounts are stored, matching the spreadsheet importer. Refunds and deposits are skipped, and a charge that later flips negative gets removed.
- **Two years of history** (`days_requested: 730`) is requested when an account is first linked. That can't be changed afterwards without relinking.
- **Categories stick.** Only new transactions get AI classification. Re-syncs, and a pending charge posting under a new id, keep the existing category, including manual edits.
- `location.city` / `location.region` are stored as city / state. Many banks leave location empty, so expect gaps. Sandbox data has none at all.

## 1. Get keys from the Plaid Dashboard

From https://dashboard.plaid.com → **Developers → Keys**, copy:

- `client_id` (same value for every environment)
- **Sandbox** secret, which you use first
- **Production** secret, which only works once production access is approved (see section 5)

Generate the encryption key yourself:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Keep `PLAID_ENCRYPTION_KEY` identical everywhere that shares the same database. If it changes, every stored token and transaction becomes unreadable.

## 2. Environment variables

| Variable | Local `.env.local` | Vercel Production | Notes |
| --- | --- | --- | --- |
| `PLAID_CLIENT_ID` | yes | yes | |
| `PLAID_SECRET` | Sandbox secret | Sandbox secret now, Production secret later | Must match `PLAID_ENV` |
| `PLAID_ENV` | `sandbox` | `sandbox` now, `production` later | Anything else fails loudly |
| `PLAID_ENCRYPTION_KEY` | yes | yes (same value) | |
| `PLAID_WEBHOOK_URL` | leave empty | `https://huskytrack.vercel.app/api/plaid/webhook` | Plaid can't reach localhost |
| `PLAID_REDIRECT_URI` | leave empty | `https://huskytrack.vercel.app/oauth-return` | Required in Production for OAuth banks |

None of these may use the `NEXT_PUBLIC_` prefix. See `.env.local.example` for comments on each one.

On Vercel, go to **Project → Settings → Environment Variables**, add or update each variable for Production, then redeploy. Env changes only take effect on new deployments. You can do the same from the CLI with `vercel env add PLAID_WEBHOOK_URL production`.

The webhook URL must be the stable production domain. The per-deployment `*.vercel.app` URLs are behind Deployment Protection, so Plaid would get a 401.

## 3. Plaid Dashboard settings

- **Developers → API → Allowed redirect URIs:** add `https://huskytrack.vercel.app/oauth-return`. It must match `PLAID_REDIRECT_URI` exactly.
- Nothing needs configuring in the dashboard for webhooks. The URL is sent with each link token, so items pick up `PLAID_WEBHOOK_URL` when they're linked.

## 4. Test in Sandbox

1. `npm run dev`, sign in, tick the privacy checkbox, then click **Connect**.
2. Pick any institution (for example First Platypus Bank) and log in with **`user_good` / `pass_good`**. If asked for an MFA code, use `1234`.
3. The account appears under *Bank Accounts & Cards* and the first sync runs. Sandbox may only return a handful of transactions at first. Click **Sync now** after a few seconds to pull the rest of the history.
4. Click **Sync now** again. It should report "Up to date." and the transaction count shouldn't change, which shows the sync is idempotent.
5. Test reconnecting:
   ```sh
   node --env-file=.env.local scripts/plaid-sandbox.mjs list
   node --env-file=.env.local scripts/plaid-sandbox.mjs reset-login <id>
   ```
   Click **Sync now**. The item should show *Needs reconnecting* with a **Reconnect** button, which opens Link in update mode.
6. Test webhooks against the deployed app, since Plaid can't call localhost. Link a sandbox account on huskytrack.vercel.app with `PLAID_WEBHOOK_URL` set, then:
   ```sh
   node --env-file=.env.local scripts/plaid-sandbox.mjs fire-webhook <id>
   ```
   In Vercel logs you should see `[plaid] webhook received` followed by the sync. If you see `webhook rejected`, the signature check failed.
7. Test removal: click **Remove** and confirm. The item, its accounts and its transactions are deleted, and the access token is revoked at Plaid.

Sandbox and production share the database, so remove sandbox items before going live.

## 5. Switching to Production

1. In the Plaid Dashboard, request **Production access** for the Transactions product. That means completing the company profile and security questionnaire. Production is billed per connected item.
2. Once approved:
   - add `https://huskytrack.vercel.app/oauth-return` to **Allowed redirect URIs** (if you haven't already)
   - complete the **OAuth institution registration** steps the dashboard lists (Chase, for example, has its own approval)
3. In Vercel Production, set `PLAID_ENV=production`, set `PLAID_SECRET` to the **Production** secret, and set `PLAID_WEBHOOK_URL` and `PLAID_REDIRECT_URI` as above. Then redeploy.
4. Remove any sandbox-linked accounts in the app. Their tokens won't work against production.
5. Link a real account and check that transactions arrive.

## Troubleshooting

Server logs print `[plaid] <operation> failed` with `error_code` and `request_id`. Quote the `request_id` to Plaid support.

| error_code | Meaning / fix |
| --- | --- |
| `INVALID_API_KEYS` | `PLAID_SECRET` doesn't match `PLAID_ENV` (for example a sandbox secret with `production`) |
| `INVALID_FIELD` on `redirect_uri` | `PLAID_REDIRECT_URI` isn't on the dashboard's Allowed redirect URIs list |
| `ITEM_LOGIN_REQUIRED` | The bank needs re-authentication. Use **Reconnect** |
| `PRODUCT_NOT_READY` / empty first sync | Normal right after linking. The webhook or **Sync now** picks up the data |
| Webhook never arrives | Check `PLAID_WEBHOOK_URL` was set **when the item was linked**, and that it's the public production domain |
