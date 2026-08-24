import { readStorage, writeStorage } from '@/lib/storage';
import { apiFetch } from '@/lib/api';
import type { CreditAccount, CreditRequest, SessionRole, UserProfile } from '@/types';

type CreditIdentity = {
  id: string;
  name: string;
  email: string;
  role?: SessionRole;
};

const accountKey = 'creditAccounts';
const requestKey = 'creditRequests';

function now() {
  return new Date().toISOString();
}

function openingBalance(role?: SessionRole) {
  return 0;
}

export function readCreditAccounts() {
  return readStorage<CreditAccount[]>(accountKey, []);
}

export function writeCreditAccounts(accounts: CreditAccount[]) {
  writeStorage(accountKey, accounts);
}

export function readCreditRequests() {
  return readStorage<CreditRequest[]>(requestKey, []);
}

export function writeCreditRequests(requests: CreditRequest[]) {
  writeStorage(requestKey, requests);
}

export function ensureCreditAccount(identity: CreditIdentity, accounts = readCreditAccounts()) {
  const existing = accounts.find((account) => account.userId === identity.id || account.email.toLowerCase() === identity.email.toLowerCase());
  if (existing) return { account: existing, accounts };

  const next: CreditAccount = {
    userId: identity.id,
    userName: identity.name,
    email: identity.email,
    balance: openingBalance(identity.role),
    available: openingBalance(identity.role),
    pending: 0,
    grantedTotal: openingBalance(identity.role),
    updatedAt: now(),
  };
  const nextAccounts = [next, ...accounts];
  writeCreditAccounts(nextAccounts);
  return { account: next, accounts: nextAccounts };
}

export function hydrateCreditAccounts(users: UserProfile[]) {
  const stored = readCreditAccounts();
  const merged = [...stored];
  users.forEach((user) => {
    if (merged.some((account) => account.userId === user.id || account.email.toLowerCase() === user.email.toLowerCase())) return;
    merged.push({
      userId: user.id,
      userName: user.name,
      email: user.email,
      balance: openingBalance(user.role),
      available: openingBalance(user.role),
      pending: 0,
      grantedTotal: openingBalance(user.role),
      updatedAt: now(),
    });
  });
  if (merged.length !== stored.length) {
    writeCreditAccounts(merged);
  }
  return merged;
}

export function createCreditRequest(identity: CreditIdentity, amount: number, reason: string) {
  const request: CreditRequest = {
    id: crypto.randomUUID(),
    userId: identity.id,
    userName: identity.name,
    email: identity.email,
    amount,
    reason,
    status: 'pending',
    requestedAt: now(),
  };
  const requests = [request, ...readCreditRequests()];
  writeCreditRequests(requests);
  const { accounts } = ensureCreditAccount(identity);
  writeCreditAccounts(
    accounts.map((account) =>
      account.userId === identity.id
        ? { ...account, pending: account.pending + amount, updatedAt: now() }
        : account,
    ),
  );
  return request;
}

export function grantCredits(identity: CreditIdentity, amount: number) {
  const { accounts } = ensureCreditAccount(identity);
  const nextAccounts = accounts.map((account) =>
    account.userId === identity.id || account.email.toLowerCase() === identity.email.toLowerCase()
      ? {
          ...account,
          userName: identity.name,
          email: identity.email,
          balance: account.balance + amount,
          available: account.available + amount,
          grantedTotal: account.grantedTotal + amount,
          updatedAt: now(),
        }
      : account,
  );
  writeCreditAccounts(nextAccounts);
  return nextAccounts;
}

export function approveCreditRequest(requestId: string, reviewer: string) {
  const requests = readCreditRequests();
  const target = requests.find((request) => request.id === requestId);
  if (!target || target.status !== 'pending') return { requests, accounts: readCreditAccounts() };

  const nextRequests = requests.map((request) =>
    request.id === requestId
      ? { ...request, status: 'approved' as const, reviewedAt: now(), reviewer }
      : request,
  );
  writeCreditRequests(nextRequests);

  const { accounts } = ensureCreditAccount({
    id: target.userId,
    name: target.userName,
    email: target.email,
  });
  const nextAccounts = accounts.map((account) =>
    account.userId === target.userId
      ? {
          ...account,
          balance: account.balance + target.amount,
          available: account.available + target.amount,
          pending: Math.max(0, account.pending - target.amount),
          grantedTotal: account.grantedTotal + target.amount,
          updatedAt: now(),
        }
      : account,
  );
  writeCreditAccounts(nextAccounts);
  return { requests: nextRequests, accounts: nextAccounts };
}

export async function loadRemoteCreditAccount(identity: CreditIdentity) {
  const account = await apiFetch<CreditAccount>('/api/credits/account');
  const accounts = readCreditAccounts().filter((item) => item.userId !== identity.id && item.email.toLowerCase() !== identity.email.toLowerCase());
  writeStorage('creditAccounts', [account, ...accounts], { sync: false, notify: false });
  return account;
}

export async function loadRemoteCreditRequests(identity: CreditIdentity) {
  const requests = await apiFetch<CreditRequest[]>('/api/credits/requests');
  const current = readCreditRequests().filter((item) => item.userId !== identity.id && item.email.toLowerCase() !== identity.email.toLowerCase());
  writeStorage('creditRequests', [...requests, ...current], { sync: false, notify: false });
  return requests;
}

export async function createRemoteCreditRequest(identity: CreditIdentity, amount: number, reason: string) {
  const request = await apiFetch<CreditRequest>('/api/credits/requests', { method: 'POST', body: JSON.stringify({ amount, reason }) });
  const requests = readCreditRequests().filter((item) => item.id !== request.id);
  writeCreditRequests([request, ...requests]);
  return request;
}

export async function reserveRemoteMargin(amount: number) {
  try {
    return await apiFetch<CreditAccount>('/api/credits/reserve', { method: 'POST', body: JSON.stringify({ amount }) });
  } catch {
    return null;
  }
}

export async function settleRemoteMargin(amount: number, pnl: number) {
  try {
    return await apiFetch<CreditAccount>('/api/credits/settle', { method: 'POST', body: JSON.stringify({ amount, pnl }) });
  } catch {
    return null;
  }
}

export async function loadRemoteAdminCredits() {
  const [accounts, requests] = await Promise.all([
    apiFetch<CreditAccount[]>('/api/admin/credits/accounts'),
    apiFetch<CreditRequest[]>('/api/admin/credits/requests'),
  ]);
  writeStorage('creditAccounts', accounts, { sync: false, notify: false });
  writeStorage('creditRequests', requests, { sync: false, notify: false });
  return { accounts, requests };
}

export async function grantRemoteCredits(identity: CreditIdentity, amount: number) {
  const account = await apiFetch<CreditAccount>('/api/admin/credits/grant', { method: 'POST', body: JSON.stringify({ userId: identity.id, amount }) });
  const accounts = readCreditAccounts().filter((item) => item.userId !== account.userId);
  writeStorage('creditAccounts', [account, ...accounts], { sync: false, notify: false });
  return account;
}

export async function approveRemoteCreditRequest(requestId: string, reviewer: string) {
  const request = await apiFetch<CreditRequest>('/api/admin/credits/approve', { method: 'POST', body: JSON.stringify({ id: requestId }) });
  const requests = readCreditRequests().map((item) => item.id === request.id ? request : item);
  writeStorage('creditRequests', requests, { sync: false, notify: false });
  return request;
}
