import { apiFetch } from '@/lib/api';
import type { FundingKind, FundingMethod, FundingRate, FundingRequest } from '@/types';

export type CreateFundingRequestInput = {
  kind: FundingKind;
  method: FundingMethod;
  amountMyr?: number;
  amountU?: number;
  bankName?: string;
  accountHolder?: string;
  /** Sent only over the authenticated request channel; the server encrypts it at rest. */
  accountReference?: string;
  /** Optional context for the internal review queue; never becomes a payment instruction. */
  customerNote?: string;
  supportRequired?: boolean;
};

export async function loadFundingRate() {
  return apiFetch<FundingRate>('/api/funding/rate');
}

export async function loadFundingRequests() {
  return apiFetch<FundingRequest[]>('/api/funding/requests');
}

export async function createFundingRequest(input: CreateFundingRequestInput) {
  return apiFetch<FundingRequest>('/api/funding/requests', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function loadAdminFundingRequests() {
  return apiFetch<FundingRequest[]>('/api/admin/funding/requests');
}

export async function reviewFundingRequest(id: string, action: 'approve' | 'reject', reviewerNote = '') {
  return apiFetch<FundingRequest>(`/api/admin/funding/requests/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    body: JSON.stringify({ reviewerNote }),
  });
}

export async function deleteFundingHistoryItem(id: string) {
  return apiFetch<{ deleted: true }>(`/api/admin/funding/requests/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function clearFundingHistory(kind: FundingKind) {
  return apiFetch<{ deleted: number }>(`/api/admin/funding/requests/history?kind=${encodeURIComponent(kind)}`, { method: 'DELETE' });
}
