import { getPlaidClient } from './plaid'
import { decrypt } from './crypto'
import { classifyPlaidTransactions } from './anthropic'
import {
  getPlaidItem,
  getPlaidItemAccessTokenEncrypted,
  updatePlaidItemCursor,
  upsertPlaidAccounts,
  upsertPlaidTransactions,
  deletePlaidTransactionsByPlaidIds,
  type PlaidTransactionUpsert,
} from './db'
import type { Transaction } from 'plaid'

export interface SyncResult {
  added: number
  modified: number
  removed: number
}

export async function syncPlaidItem(plaidItemId: string): Promise<SyncResult> {
  const item = await getPlaidItem(plaidItemId)
  if (!item) throw new Error(`Unknown Plaid item: ${plaidItemId}`)

  const encryptedToken = await getPlaidItemAccessTokenEncrypted(plaidItemId)
  if (!encryptedToken) throw new Error(`No access token stored for Plaid item: ${plaidItemId}`)
  const accessToken = decrypt(encryptedToken)

  const client = getPlaidClient()

  let cursor = item.cursor ?? undefined
  let hasMore = true
  const added: Transaction[] = []
  const modified: Transaction[] = []
  const removedIds: string[] = []

  while (hasMore) {
    const response = await client.transactionsSync({
      access_token: accessToken,
      cursor,
      options: { include_personal_finance_category: true },
    })
    const data = response.data

    added.push(...data.added)
    modified.push(...data.modified)
    removedIds.push(...data.removed.map((r) => r.transaction_id))

    // Accounts only need to be upserted once we actually have transaction
    // data to relate them to; harmless to repeat across pages.
    if (data.accounts.length > 0) {
      await upsertPlaidAccounts(plaidItemId, data.accounts.map((a) => ({
        account_id: a.account_id,
        name: a.name,
        mask: a.mask,
        type: a.type,
        subtype: a.subtype,
      })))
    }

    cursor = data.next_cursor
    hasMore = data.has_more
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
    const classifications = await classifyPlaidTransactions(toUpsert.map((t) => ({
      merchant: t.merchant_name ?? t.name,
      plaidCategory: t.personal_finance_category?.primary ?? null,
      amount: t.amount,
    })))

    const upserts: PlaidTransactionUpsert[] = toUpsert.map((t, i) => ({
      plaid_transaction_id: t.transaction_id,
      account_id:           t.account_id,
      date:                 t.date,
      amount:               t.amount,
      merchant:             t.merchant_name ?? t.name,
      plaid_category:       t.personal_finance_category?.primary ?? null,
      category:             classifications[i].category,
      category_confidence:  classifications[i].confidence,
      city:                 t.location?.city ?? null,
      state:                t.location?.region ?? null,
      pending:              t.pending,
    }))

    await upsertPlaidTransactions(upserts)
  }

  const toRemove = [...removedIds, ...noLongerPositiveIds]
  if (toRemove.length > 0) {
    await deletePlaidTransactionsByPlaidIds(toRemove)
  }

  if (cursor) await updatePlaidItemCursor(plaidItemId, cursor)

  return { added: added.length, modified: modified.length, removed: toRemove.length }
}
