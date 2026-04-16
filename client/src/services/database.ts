import * as SQLite from 'expo-sqlite';
import type { SQLiteBindParams } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import type {
  Receipt, ReceiptCreate, ReceiptUpdate, ReceiptFilters,
  CategorySummary, ReportSummary, MonthlySpend,
  CoaUtilization, CostOfAttendance, MerchantSummary,
} from '../types';
import { QUALIFIED_CATEGORIES, HOUSING_FOOD_CATEGORIES } from '../types';

// ── Open / migrate ─────────────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!_db) _db = SQLite.openDatabaseSync('edutrack.db');
  return _db;
}

export async function initDatabase(): Promise<void> {
  const db = getDb();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS receipts (
      id            TEXT PRIMARY KEY,
      date          TEXT NOT NULL,
      merchant      TEXT NOT NULL,
      amount        REAL NOT NULL CHECK(amount >= 0),
      category      TEXT NOT NULL DEFAULT 'Other',
      purpose_sub   TEXT,
      purpose       TEXT,
      card_last_four TEXT,
      image_uri     TEXT,
      is_qualified  INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_receipts_date     ON receipts(date DESC);
    CREATE INDEX IF NOT EXISTS idx_receipts_category ON receipts(category);
    CREATE INDEX IF NOT EXISTS idx_receipts_merchant ON receipts(merchant);
  `);

  // Add purpose_sub column if it doesn't exist (migration for older schemas)
  try {
    await db.execAsync(`ALTER TABLE receipts ADD COLUMN purpose_sub TEXT;`);
  } catch {
    // Column already exists — ignore
  }

  // Migrate renamed categories
  await db.execAsync(`
    UPDATE receipts SET category = 'Books & Course Supplies', is_qualified = 1
      WHERE category = 'Books & Supplies';
  `);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowToReceipt(row: Record<string, unknown>): Receipt {
  return {
    id: row.id as string,
    date: row.date as string,
    merchant: row.merchant as string,
    amount: row.amount as number,
    category: row.category as Receipt['category'],
    purpose_sub: (row.purpose_sub as string | null) ?? null,
    purpose: (row.purpose as string | null) ?? null,
    card_last_four: (row.card_last_four as string | null) ?? null,
    image_uri: (row.image_uri as string | null) ?? null,
    is_qualified: Boolean(row.is_qualified),
    created_at: row.created_at as string,
  };
}

function isQualified(category: string): boolean {
  return (QUALIFIED_CATEGORIES as string[]).includes(category);
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createReceipt(data: ReceiptCreate): Promise<Receipt> {
  const db = getDb();
  const id = Crypto.randomUUID();
  const qualified = isQualified(data.category) ? 1 : 0;

  await db.runAsync(
    `INSERT INTO receipts (id, date, merchant, amount, category, purpose_sub, purpose, card_last_four, image_uri, is_qualified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.date, data.merchant, data.amount, data.category,
     data.purpose_sub ?? null, data.purpose ?? null,
     data.card_last_four ?? null, data.image_uri ?? null, qualified],
  );

  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM receipts WHERE id = ?', [id],
  );
  return rowToReceipt(row!);
}

export async function listReceipts(filters: ReceiptFilters = {}): Promise<Receipt[]> {
  const db = getDb();
  const conditions: string[] = [];
  const params: SQLiteBindParams = [];

  if (filters.start_date) { conditions.push('date >= ?'); params.push(filters.start_date); }
  if (filters.end_date)   { conditions.push('date <= ?'); params.push(filters.end_date); }
  if (filters.category)   { conditions.push('category = ?'); params.push(filters.category); }
  if (filters.card_last_four) { conditions.push('card_last_four = ?'); params.push(filters.card_last_four); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const allowedCols = new Set(['date', 'amount', 'merchant', 'created_at']);
  const col = allowedCols.has(filters.sort_by ?? '') ? filters.sort_by : 'date';
  const order = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM receipts ${where} ORDER BY ${col} ${order}`,
    params,
  );
  return rows.map(rowToReceipt);
}

export async function getReceipt(id: string): Promise<Receipt | null> {
  const db = getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM receipts WHERE id = ?', [id],
  );
  return row ? rowToReceipt(row) : null;
}

export async function updateReceipt(id: string, data: ReceiptUpdate): Promise<Receipt | null> {
  const db = getDb();
  const sets: string[] = [];
  const params: SQLiteBindParams = [];

  const fields: (keyof ReceiptUpdate)[] = [
    'date', 'merchant', 'amount', 'category', 'purpose_sub', 'purpose', 'card_last_four', 'image_uri',
  ];

  for (const key of fields) {
    if (key in data) {
      sets.push(`${key} = ?`);
      params.push(data[key] ?? null);
    }
  }

  if (data.category !== undefined) {
    sets.push('is_qualified = ?');
    params.push(isQualified(data.category) ? 1 : 0);
  }

  if (sets.length === 0) return getReceipt(id);

  params.push(id);
  await db.runAsync(
    `UPDATE receipts SET ${sets.join(', ')} WHERE id = ?`,
    params,
  );
  return getReceipt(id);
}

export async function deleteReceipt(id: string): Promise<void> {
  const db = getDb();
  await db.runAsync('DELETE FROM receipts WHERE id = ?', [id]);
}

// ── Dedup check (for import) ──────────────────────────────────────────────────

export async function receiptExists(
  date: string, merchant: string, amount: number,
): Promise<boolean> {
  const db = getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) as n FROM receipts WHERE date=? AND merchant=? AND amount=?',
    [date, merchant, amount],
  );
  return (row?.n ?? 0) > 0;
}

// ── Reports ───────────────────────────────────────────────────────────────────

export async function getReportSummary(
  startDate?: string,
  endDate?: string,
): Promise<ReportSummary> {
  const db = getDb();
  const conditions: string[] = [];
  const params: SQLiteBindParams = [];

  if (startDate) { conditions.push('date >= ?'); params.push(startDate); }
  if (endDate)   { conditions.push('date <= ?'); params.push(endDate); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const catRows = await db.getAllAsync<{ category: string; total: number; count: number }>(
    `SELECT category, SUM(amount) as total, COUNT(*) as count
     FROM receipts ${where} GROUP BY category ORDER BY total DESC`,
    params,
  );

  const monthRows = await db.getAllAsync<{
    year: number; month: number; category: string; total: number; count: number;
  }>(
    `SELECT strftime('%Y', date) * 1 as year,
            strftime('%m', date) * 1 as month,
            category,
            SUM(amount) as total,
            COUNT(*) as count
     FROM receipts ${where}
     GROUP BY year, month, category
     ORDER BY year, month`,
    params,
  );

  const by_category: CategorySummary[] = catRows.map((r) => ({
    category: r.category as CategorySummary['category'],
    total: r.total,
    count: r.count,
    is_qualified: isQualified(r.category),
  }));

  const monthMap = new Map<string, MonthlySpend>();
  for (const r of monthRows) {
    const key = `${r.year}-${r.month}`;
    if (!monthMap.has(key)) {
      monthMap.set(key, { year: r.year, month: r.month, total: 0, by_category: [] });
    }
    const m = monthMap.get(key)!;
    m.total += r.total;
    m.by_category.push({
      category: r.category as CategorySummary['category'],
      total: r.total, count: r.count,
      is_qualified: isQualified(r.category),
    });
  }

  const total_qualified = by_category.filter((c) => c.is_qualified).reduce((s, c) => s + c.total, 0);
  const total_non_qualified = by_category.filter((c) => !c.is_qualified).reduce((s, c) => s + c.total, 0);

  return {
    start_date: startDate ?? '',
    end_date: endDate ?? '',
    total_qualified,
    total_non_qualified,
    by_category,
    by_month: Array.from(monthMap.values()),
  };
}

// ── Top Merchants ─────────────────────────────────────────────────────────────

export async function getTopMerchants(
  limit: number = 10,
  startDate?: string,
  endDate?: string,
): Promise<MerchantSummary[]> {
  const db = getDb();
  const conditions: string[] = [];
  const params: SQLiteBindParams = [];

  if (startDate) { conditions.push('date >= ?'); params.push(startDate); }
  if (endDate)   { conditions.push('date <= ?'); params.push(endDate); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  return db.getAllAsync<MerchantSummary>(
    `SELECT merchant, SUM(amount) as total, COUNT(*) as count
     FROM receipts ${where}
     GROUP BY merchant
     ORDER BY total DESC
     LIMIT ?`,
    [...params, limit],
  );
}

// ── COA Utilization ───────────────────────────────────────────────────────────

export async function getCoaUtilization(
  coa: CostOfAttendance,
  startDate?: string,
  endDate?: string,
): Promise<CoaUtilization> {
  const db = getDb();
  const conditions: string[] = [];
  const params: SQLiteBindParams = [];

  if (startDate) { conditions.push('date >= ?'); params.push(startDate); }
  if (endDate)   { conditions.push('date <= ?'); params.push(endDate); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await db.getAllAsync<{ category: string; total: number }>(
    `SELECT category, SUM(amount) as total FROM receipts ${where} GROUP BY category`,
    params,
  );

  let tuition_spent = 0;
  let housing_food_spent = 0;
  let books_supplies_spent = 0;

  for (const row of rows) {
    if (row.category === 'Tuition & Fees') {
      tuition_spent += row.total;
    } else if ((HOUSING_FOOD_CATEGORIES as string[]).includes(row.category)) {
      housing_food_spent += row.total;
    } else if (row.category === 'Books & Course Supplies') {
      books_supplies_spent += row.total;
    }
  }

  return {
    tuition_spent,
    housing_food_spent,
    books_supplies_spent,
    tuition_limit: coa.tuition,
    housing_food_limit: coa.housing_food,
    books_supplies_limit: coa.books_supplies,
  };
}
