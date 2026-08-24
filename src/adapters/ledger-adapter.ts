import type { LedgerBundle, LedgerEntry } from '@/types';
import { apiFetch } from '@/lib/api';

/** A new account starts empty; this adapter never invents deposit records. */
export async function loadLedgerBundle(scope: 'self' | 'all' = 'self'): Promise<LedgerBundle> {
  const entries = await apiFetch<LedgerEntry[]>(`/api/ledger${scope === 'all' ? '?scope=all' : ''}`);
  return {
    entries,
    source: {
      provider: 'AD88 account ledger API',
      mode: 'api',
      updatedAt: new Date().toISOString(),
      cacheState: 'fresh',
      health: 'healthy',
      lineage: 'account ledger → AD88 API → workspace',
    },
  };
}
