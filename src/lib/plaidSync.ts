import 'server-only'
import { getPlaidClient, getPlaidErrorInfo, logPlaidError } from './plaid'
import { decrypt } from './crypto'
import { classifyPlaidTransactions } from './anthropic'
import {
  getPlaidItem,
  getPlaidItemAccessTokenEncrypted,
  updatePlaidItemCursor,
  upsertPlaidAccounts,
  upsertPlaidTransactions,
  deletePlaidTransactionsByPlaidIds,
  getPlaidCategoriesByPlaidIds,
  acquirePlaidSyncLock,
  releasePlaidSyncLock,
  forceReleasePlaidSyncLock,
  markPlaidItemSynced,
  setPlaidItemStatus,
  type PlaidTransactionUpsert,
} from './db'
import type { Transaction, TransactionsSyncResponse } from 'plaid'

export interface SyncResult {
  added: number
  modified: number
  removed: number
  // true when another sync of this item was already running; that sync
  // picks up this request when it finishes, so nothing is lost.
  skipped?: boolean
}

// Plaid errors that mean the user has to re-authenticate via Link update mode.
const LOGIN_REQUIRED_CODES = new Set(['ITEM_LOGIN_REQUIRED', 'PENDING_EXPIRATION', 'ACCESS_NOT_GRANTED'])

const MAX_PAGINATION_RESTARTS = 3

interface PulledUpdates {
  added: Transaction[]
  modified: Transaction[]
  removedIds: string[]
  accounts: TransactionsSyncResponse['accounts']
  nextCursor: string | undefined
}

// Pulls every page since `startCursor`. If Plaid reports the data changed
// mid-pagination, the whole loop must restart from the original cursor
// (not just the failed page), per Plaid's /transactions/sync docs.
async function pullUpdates(accessToken: string, startCursor: string | undefined): Promise<PulledUpdates> {
  const client = getPlaidClient()

  for (let attempt = 0; ; attempt++) {
    const result: PulledUpdates = { added: [], modified: [], removedIds: [], accounts: [], nextCursor: startCursor }
    let hasMore = true
    try {
      while (hasMore) {
        const { data } = await client.transactionsSync({
          access_token: accessToken,
          cursor: result.nextCursor,
          count: 500,
          options: { include_personal_finance_category: true },
        })
        result.added.push(...data.added)
        result.modified.push(...data.modified)
        result.removedIds.push(...data.removed.map((r) => r.transaction_id))
        if (data.accounts.length > 0) result.accounts = data.accounts
        result.nextCursor = data.next_cursor
        hasMore = data.has_more
      }
      return result
    } catch (err) {
      const { error_code } = getPlaidErrorInfo(err)
      if (error_code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' && attempt < MAX_PAGINATION_RESTARTS) continue
      throw err
    }
  }
}

async function applyUpdates(plaidItemId: string, updates: PulledUpdates): Promise<SyncResult> {
  const { added, modified, removedIds, accounts } = updates

  if (accounts.length > 0) {
    await upsertPlaidAccounts(plaidItemId, accounts.map((a) => ({
      account_id: a.account_id,
      name: a.name,
      mask: a.mask,
      type: a.type,
      subtype: a.subtype,
    })))
  }

  // Plaid represents outflows (purchases) as positive amounts and inflows
  // (refunds/deposits/payments) as negative. This app only tracks expenses
  // -- the existing spreadsheet importer skips credits the same way -- so
  // non-positive transactions are never stored. A modified transaction that
  // flips from positive to non-positive (e.g. a pending charge reversed)
  // needs to be actively removed rather than just left stale.
  const toUpsert = [...added, ...modified].filter((t) => t.amount > 0)
  const noLongerPositiveIds = modified.filter((t) => t.amount <= 0).map((t) => t.transaction_id)

  if (toUpsert.length > 0) {
    // Already-stored transactions keep their category (which may be a manual
    // edit). A pending charge that posts arrives as a new transaction_id
    // with pending_transaction_id pointing at the old one, so it inherits
    // that row's category too. Only genuinely new spending hits Claude.
    const existing = await getPlaidCategoriesByPlaidIds([
      ...toUpsert.map((t) => t.transaction_id),
      ...toUpsert.flatMap((t) => (t.pending_transaction_id ? [t.pending_transaction_id] : [])),
    ])
    const inherited = (t: Transaction) => (t.pending_transaction_id ? existing.get(t.pending_transaction_id) : undefined)
    const needsClassification = toUpsert.filter((t) => !existing.has(t.transaction_id) && !inherited(t))

    const classifications = await classifyPlaidTransactions(needsClassification.map((t) => ({
      merchant: t.merchant_name ?? t.name,
      plaidCategory: t.personal_finance_category?.primary ?? null,
      amount: t.amount,
    })))
    const classified = new Map(needsClassification.map((t, i) => [t.transaction_id, classifications[i]]))

    const upserts: PlaidTransactionUpsert[] = toUpsert.map((t) => {
      const fresh = classified.get(t.transaction_id)
      const fromPending = inherited(t)
      return {
        plaid_transaction_id: t.transaction_id,
        account_id:           t.account_id,
        date:                 t.date,
        amount:               t.amount,
        merchant:             t.merchant_name ?? t.name,
        plaid_category:       t.personal_finance_category?.primary ?? null,
        category:             fresh?.category ?? fromPending ?? null,
        category_confidence:  fresh?.confidence ?? null,
        city:                 t.location?.city ?? null,
        state:                t.location?.region ?? null,
        pending:              t.pending,
      }
    })

    await upsertPlaidTransactions(upserts)
  }

  const toRemove = [...removedIds, ...noLongerPositiveIds]
  if (toRemove.length > 0) {
    await deletePlaidTransactionsByPlaidIds(toRemove)
  }

  // Cursor is only advanced after everything above is written, so a crash
  // mid-sync just replays the same updates next time (upserts are idempotent).
  if (updates.nextCursor) await updatePlaidItemCursor(plaidItemId, updates.nextCursor)

  return { added: added.length, modified: modified.length, removed: toRemove.length }
}

// Syncs one item (our internal plaid_items.id). Safe to call concurrently:
// a second caller returns { skipped: true } and the running sync loops once
// more to pick up anything new. Plaid errors are recorded on the item
// (e.g. status='login_required') and rethrown for the caller to surface.
export async function syncPlaidItem(plaidItemId: string): Promise<SyncResult> {
  if (!await getPlaidItem(plaidItemId)) throw new Error(`Unknown Plaid item: ${plaidItemId}`)

  const encryptedToken = await getPlaidItemAccessTokenEncrypted(plaidItemId)
  if (!encryptedToken) throw new Error(`No access token stored for Plaid item: ${plaidItemId}`)
  const accessToken = decrypt(encryptedToken)

  if (!await acquirePlaidSyncLock(plaidItemId)) {
    return { added: 0, modified: 0, removed: 0, skipped: true }
  }

  const total: SyncResult = { added: 0, modified: 0, removed: 0 }
  let lockReleased = false
  try {
    do {
      // Re-read each pass so a re-run starts from the cursor just saved.
      const item = await getPlaidItem(plaidItemId)
      const updates = await pullUpdates(accessToken, item?.cursor ?? undefined)
      const result = await applyUpdates(plaidItemId, updates)
      total.added += result.added
      total.modified += result.modified
      total.removed += result.removed
      await markPlaidItemSynced(plaidItemId)
    } while (await releasePlaidSyncLock(plaidItemId))
    lockReleased = true
    return total
  } catch (err) {
    const info = logPlaidError(`sync item ${plaidItemId}`, err)
    if (info.error_code) {
      await setPlaidItemStatus(
        plaidItemId,
        LOGIN_REQUIRED_CODES.has(info.error_code) ? 'login_required' : 'error',
        info.error_code,
      )
    }
    throw err
  } finally {
    if (!lockReleased) await forceReleasePlaidSyncLock(plaidItemId).catch(() => {})
  }
}
