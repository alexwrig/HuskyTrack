import aliases from './merchantAliases.json'

// Canonical display names for merchants whose bank/receipt names vary or are
// mis-enriched by Plaid. Each `match` is a case-insensitive regex tested
// against the raw merchant name; first match wins. Kept as JSON so
// scripts/apply-merchant-aliases.mjs can backfill existing rows with the
// same list.
const MERCHANT_ALIASES = aliases.map((a) => ({ name: a.name, pattern: new RegExp(a.match, 'i') }))

export function normalizeMerchant(merchant: string): string {
  return MERCHANT_ALIASES.find((a) => a.pattern.test(merchant))?.name ?? merchant
}
