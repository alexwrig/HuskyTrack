import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Receipt } from '../types';

export async function exportXlsx(receipts: Receipt[]): Promise<void> {
  const data = receipts.map((r) => ({
    Date: r.date,
    Merchant: r.merchant,
    Amount: r.amount,
    Category: r.category,
    Purpose: r.purpose ?? '',
    'Card (last 4)': r.card_last_four ?? '',
    'Qualified?': r.is_qualified ? 'Yes' : 'No',
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Expenses');

  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const uri = `${FileSystem.cacheDirectory}EduTrack_Expenses.xlsx`;

  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: 'base64' as FileSystem.EncodingType,
  });

  await Sharing.shareAsync(uri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: 'Save or Share EduTrack Spreadsheet',
  });
}
