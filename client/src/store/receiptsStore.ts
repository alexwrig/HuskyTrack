import { create } from 'zustand';
import type { Receipt, ReceiptFilters } from '../types';
import * as db from '../services/database';

interface ReceiptsState {
  receipts: Receipt[];
  isLoading: boolean;
  error: string | null;

  fetchReceipts: (filters?: ReceiptFilters) => Promise<void>;
  addReceipt: (receipt: Receipt) => void;
  updateReceipt: (receipt: Receipt) => void;
  removeReceipt: (id: string) => void;
}

export const useReceiptsStore = create<ReceiptsState>((set) => ({
  receipts: [],
  isLoading: false,
  error: null,

  async fetchReceipts(filters) {
    set({ isLoading: true, error: null });
    try {
      const receipts = await db.listReceipts(filters);
      set({ receipts, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load', isLoading: false });
    }
  },

  addReceipt(receipt) {
    set((s) => ({ receipts: [receipt, ...s.receipts] }));
  },

  updateReceipt(receipt) {
    set((s) => ({
      receipts: s.receipts.map((r) => (r.id === receipt.id ? receipt : r)),
    }));
  },

  removeReceipt(id) {
    set((s) => ({ receipts: s.receipts.filter((r) => r.id !== id) }));
  },
}));
