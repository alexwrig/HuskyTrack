// Sandbox-only helpers for testing the Plaid integration end to end.
//
//   node --env-file=.env.local scripts/plaid-sandbox.mjs list
//   node --env-file=.env.local scripts/plaid-sandbox.mjs fire-webhook <plaid_items.id>
//   node --env-file=.env.local scripts/plaid-sandbox.mjs reset-login  <plaid_items.id>
//
// fire-webhook asks Plaid to send a real, signed SYNC_UPDATES_AVAILABLE
// webhook to the URL the item was linked with (PLAID_WEBHOOK_URL at link
// time), exercising signature verification + the webhook-triggered sync.
// reset-login forces ITEM_LOGIN_REQUIRED so the Reconnect (update mode)
// flow can be tested.

import { createDecipheriv } from 'crypto'
import { neon } from '@neondatabase/serverless'
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

if ((process.env.PLAID_ENV ?? 'sandbox') !== 'sandbox') {
  console.error('Refusing to run: PLAID_ENV is not "sandbox".')
  process.exit(1)
}

const [command, itemId] = process.argv.slice(2)
const sql = neon(process.env.DATABASE_URL ?? process.env.POSTGRES_URL)
const plaid = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments.sandbox,
  baseOptions: { headers: { 'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID, 'PLAID-SECRET': process.env.PLAID_SECRET } },
}))

function decrypt(stored) {
  const [iv, tag, ciphertext] = stored.split(':')
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(process.env.PLAID_ENCRYPTION_KEY, 'base64'), Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(tag, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]).toString('utf8')
}

async function accessTokenFor(id) {
  const rows = await sql`SELECT access_token_encrypted FROM plaid_items WHERE id = ${id}`
  if (!rows[0]) throw new Error(`No plaid_items row with id ${id} (run "list")`)
  return decrypt(rows[0].access_token_encrypted)
}

try {
  if (command === 'list') {
    const rows = await sql`SELECT id, status, error_code, last_synced_at FROM plaid_items ORDER BY created_at`
    console.table(rows)
  } else if (command === 'fire-webhook' && itemId) {
    const { data } = await plaid.sandboxItemFireWebhook({ access_token: await accessTokenFor(itemId), webhook_code: 'SYNC_UPDATES_AVAILABLE' })
    console.log('Webhook fired:', data.webhook_fired, '- check Vercel logs for "[plaid] webhook received"')
  } else if (command === 'reset-login' && itemId) {
    await plaid.sandboxItemResetLogin({ access_token: await accessTokenFor(itemId) })
    console.log('Item now requires login. Click "Sync now", then "Reconnect" in the app.')
  } else {
    console.log('Usage: list | fire-webhook <id> | reset-login <id>')
    process.exit(1)
  }
} catch (err) {
  console.error(err.response?.data ?? err.message)
  process.exit(1)
}
