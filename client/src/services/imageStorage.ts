import * as FileSystem from 'expo-file-system';

const RECEIPTS_DIR = `${FileSystem.documentDirectory}receipts/`;

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(RECEIPTS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(RECEIPTS_DIR, { intermediates: true });
  }
}

/**
 * Copy a receipt image into the app's permanent documents directory.
 * Returns the new permanent file:// URI.
 */
export async function saveReceiptImage(tempUri: string): Promise<string> {
  await ensureDir();
  const ext = tempUri.split('.').pop()?.split('?')[0] ?? 'jpg';
  const filename = `receipt_${Date.now()}.${ext}`;
  const dest = RECEIPTS_DIR + filename;
  await FileSystem.copyAsync({ from: tempUri, to: dest });
  return dest;
}

/**
 * Delete a saved receipt image from local storage.
 */
export async function deleteReceiptImage(uri: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}

/**
 * Read an image from a URI and return it as base64.
 */
export async function readImageAsBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: 'base64' as FileSystem.EncodingType });
}
