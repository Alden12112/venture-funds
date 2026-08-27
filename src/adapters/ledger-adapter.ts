import type { LedgerBundle, LedgerEntry } from '@/types';
import { apiFetch } from '@/lib/api';

/** A new account starts empty; this adapter never invents deposit records. */
export async function loadLedgerBundle(scope: 'self' | 'all' = 'self'): Promise<LedgerBundle> {
  const entries = await apiFetch<LedgerEntry[]>(`/api/ledger${scope === 'all' ? '?scope=all' : ''}`);
  return {
    entries,
    source: {
      provider: 'VENTURE FUNDS account ledger API',
      mode: 'api',
      updatedAt: new Date().toISOString(),
      cacheState: 'fresh',
      health: 'healthy',
      lineage: 'account ledger → VENTURE FUNDS API → workspace',
    },
  };
}

/**
 * Administrative cleanup only. The server detaches any funding reference
 * before removing the visual ledger row, so this cannot change U balances,
 * funding decisions or paper positions.
 */
export async function deleteRemoteLedgerEntry(id: string) {
  return apiFetch<{ ok: boolean; id: string }>(`/api/ledger/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
