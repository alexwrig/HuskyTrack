import * as SecureStore from 'expo-secure-store';
import type { CostOfAttendance } from '../types';
import { DEFAULT_COA } from '../types';

const KEY = 'cost_of_attendance';

export async function getCoa(): Promise<CostOfAttendance> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return { ...DEFAULT_COA };
    return { ...DEFAULT_COA, ...JSON.parse(raw) } as CostOfAttendance;
  } catch {
    return { ...DEFAULT_COA };
  }
}

export async function saveCoa(coa: CostOfAttendance): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(coa));
}
