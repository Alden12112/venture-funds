import { useEffect, useState } from 'react';
import { ArrowRight, HandCoins, Languages, PlusCircle, Trash2, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataMeta, LoadingState, StatCard, StatusPill, EmptyState } from '@/components/Stats';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadAdminBundle } from '@/adapters/admin-adapter';
import { loadNewsBundle } from '@/adapters/news-adapter';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { approveRemoteCreditRequest, grantRemoteCredits } from '@/lib/credits';
import { buildInternationalPhone, countryDirectory, getCountryOption, isValidCountryPhone, phoneDigitsHint } from '@/data/countries';
import { isValidEmail } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { SupportCenter } from '@/components/SupportCenter';

const tabs = ['Accounts', 'Registration Review', 'U Management', 'Monthly Report', 'Trade Audit', 'Activity & Alerts', 'Support Inbox', 'Content', 'Approval Flow', 'Blacklist'] as const;
type AdminTab = (typeof tabs)[number];

const tabTranslationKey: Record<AdminTab, string> = {
  Accounts: 'admin.tab.accounts',
  'Registration Review': 'admin.tab.registrationReview',
  'U Management': 'admin.tab.uManagement',
  'Monthly Report': 'admin.tab.monthlyReport',
  'Trade Audit': 'admin.tab.tradeAudit',
  'Activity & Alerts': 'admin.tab.activityAlerts',
  'Support Inbox': 'admin.tab.supportInbox',
  Content: 'admin.tab.content',
  'Approval Flow': 'admin.tab.approvalFlow',
  Blacklist: 'admin.tab.blacklist',
};

function isAdminTab(value: string | null): value is AdminTab {
  return value !== null && tabs.includes(value as AdminTab);
}

function initialAdminTab(search: string): AdminTab {
  const requested = new URLSearchParams(search).get('tab');
  if (isAdminTab(requested)) return requested;
  if (typeof window !== 'undefined') {
    const saved = window.sessionStorage.getItem('ad88.admin.active-tab');
    if (isAdminTab(saved)) return saved;
  }
  return 'Accounts';
}

function saveAdminTab(tab: AdminTab) {
  if (typeof window !== 'undefined') window.sessionStorage.setItem('ad88.admin.active-tab', tab);
}

export function AdminPage({ standalone = false }: { standalone?: boolean }) {
  const { session, signOut } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const initialQuery = new URLSearchParams(location.search).get('query') ?? '';
  const [tab, setTab] = useState<AdminTab>(() => initialAdminTab(location.search));
  const [query, setQuery] = useState(initialQuery);
  const [refreshKey, setRefreshKey] = useState(0);
  const [grantTarget, setGrantTarget] = useState(initialQuery);
  const [grantAmount, setGrantAmount] = useState(100);
  const [accountForm, setAccountForm] = useState({ name: '', email: '', phone: '', country: 'Malaysia', password: '', role: 'user' as 'user' | 'admin' });
  const [accountMessage, setAccountMessage] = useState('');
  const admin = useAsyncResource(() => loadAdminBundle(), [refreshKey]);
  const news = useAsyncResource(() => loadNewsBundle(), []);

  const selectTab = (nextTab: AdminTab) => {
    setTab(nextTab);
    saveAdminTab(nextTab);
    const params = new URLSearchParams(location.search);
    params.set('tab', nextTab);
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
  };

  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('tab');
    if (!isAdminTab(requested) || requested === tab) return;
    saveAdminTab(requested);
    setTab(requested);
  }, [location.search, tab]);

  useEffect(() => {
    const refresh = (event: Event) => {
      const key = (event as CustomEvent<{ key?: string }>).detail?.key;
      if (key === 'creditAccounts' || key === 'creditRequests' || key === 'paperPositions') setRefreshKey((value) => value + 1);
    };
    window.addEventListener('ad88:storage-sync', refresh);
    return () => window.removeEventListener('ad88:storage-sync', refresh);
  }, []);

  useEffect(() => {
    // Keep the independent admin console aligned with registrations, U
    // balances, support state and trade audit events created from another
    // device. The backend remains the source of truth; this only schedules a
    // lightweight read of the shared bundle.
    const timer = window.setInterval(() => setRefreshKey((value) => value + 1), 8_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (admin.status === 'error' && admin.error === 'unauthorized') {
      signOut();
      navigate('/admin/login?reason=session', { replace: true });
    }
  }, [admin.error, admin.status, navigate, signOut]);

  if (session?.role !== 'admin') {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="ACCESS CONTROL"
          title="Administrator Console"
          description="This session does not have administrator access. Use the independent /admin/login entry point."
        />
        <EmptyState
          title="Administrator access required"
          text="The administrative workspace is separated from the client-facing platform."
          action={
            <Link to="/admin/login" className="btn btn--primary">
              Sign in <ArrowRight size={16} />
            </Link>
          }
        />
      </div>
    );
  }

  if (admin.status === 'loading') {
    return <LoadingState label="Loading administrator console" />;
  }

  if (admin.status === 'error' && admin.error === 'unauthorized') {
    // The redirect effect above clears the local token. Keep the old console
    // from flashing an alarming error state while React moves back to the
    // dedicated login page.
    return <Navigate to="/admin/login?reason=session" replace />;
  }

  if (admin.status === 'error') {
    return (
      <div className="page-stack">
        <PageHeader eyebrow="ADMINISTRATOR STATUS" title="Console is temporarily unavailable" description="The protected account API or admin session did not return valid data." />
        <div className="state-block state-block--error">
          <strong>Administrator data is unavailable</strong>
          <p>{admin.error || 'The shared administrator API is temporarily unavailable. Please retry shortly.'}</p>
          <div className="state-block__action">
            <button type="button" className="btn btn--ghost" onClick={() => setRefreshKey((value) => value + 1)}>Reload</button>
            <button type="button" className="btn btn--primary" onClick={() => { signOut(); navigate('/admin/login'); }}>Sign in again</button>
          </div>
        </div>
      </div>
    );
  }

  const normalizedQuery = query.trim().toLowerCase();
  const matches = (value: string | undefined) => !normalizedQuery || (value ?? '').toLowerCase().includes(normalizedQuery);
  const visibleUsers = admin.data.users.filter((user) => matches(user.name) || matches(user.email) || matches(user.phone) || matches(user.country));
  const visibleRegistrations = admin.data.registrations.filter((item) => matches(item.fullName) || matches(item.gmail) || matches(item.phone) || matches(item.country));
  const visiblePositions = admin.data.paperPositions.filter((item) => matches(item.userName) || matches(item.userId) || matches(item.symbol));
  const visibleTradeEvents = admin.data.tradeEvents.filter((item) => matches(item.userName) || matches(item.userEmail) || matches(item.userId) || matches(item.symbol) || matches(item.action));
  const visibleLedger = admin.data.ledgerEntries.filter((item) => matches(item.userEmail) || matches(item.userName) || matches(item.note) || matches(item.type));
  const visibleNotifications = admin.data.notifications.filter((item) => matches(item.title) || matches(item.body) || matches(item.category));
  const visibleCreditAccounts = admin.data.creditAccounts.filter((item) => matches(item.userName) || matches(item.email) || matches(item.userId));
  const visibleBlacklist = admin.data.blacklist.filter((item) => matches(item.name) || matches(item.email) || matches(item.phone) || matches(item.reason));
  const pendingCreditRequests = admin.data.creditRequests.filter((item) => item.status === 'pending');
  const totalCredits = admin.data.creditAccounts.reduce((sum, account) => sum + account.balance, 0);
  const pendingCredits = pendingCreditRequests.reduce((sum, request) => sum + request.amount, 0);
  const currentMonth = new Date();
  const isCurrentMonth = (value: string) => {
    const date = new Date(value);
    return date.getFullYear() === currentMonth.getFullYear() && date.getMonth() === currentMonth.getMonth();
  };
  const monthRegistrations = admin.data.registrations.filter((item) => isCurrentMonth(item.submittedAt));
  const monthLedger = admin.data.ledgerEntries.filter((item) => isCurrentMonth(item.time));
  const monthPositions = admin.data.paperPositions.filter((item) => isCurrentMonth(item.openedAt));
  const monthNotifications = admin.data.notifications.filter((item) => isCurrentMonth(item.createdAt));
  const newsItems = news.status === 'success' ? news.data.items : [];
  const contentCount = newsItems.length;
  const report = admin.data.report;
  const creditByEmail = new Map(admin.data.creditAccounts.map((account) => [account.email.toLowerCase(), account]));
  const grantLookup = grantTarget.trim().toLowerCase();
  const grantAccount = admin.data.creditAccounts.find((account) =>
    account.email.toLowerCase().includes(grantLookup) ||
    account.userName.toLowerCase().includes(grantLookup) ||
    account.userId.toLowerCase().includes(grantLookup),
  );
  const grantUser = admin.data.users.find((user) =>
    user.email.toLowerCase().includes(grantLookup) ||
    user.name.toLowerCase().includes(grantLookup) ||
    user.id.toLowerCase().includes(grantLookup),
  );
  const accountCountry = getCountryOption(accountForm.country);
  const accountPhoneMaxLength = Array.isArray(accountCountry.digits) ? accountCountry.digits[1] : accountCountry.digits;

  const grantToTarget = async () => {
    const target = grantAccount ?? (grantUser ? { userId: grantUser.id, userName: grantUser.name, email: grantUser.email } : null);
    if (!target || grantAmount <= 0) return;
    await grantRemoteCredits({ id: target.userId, name: target.userName, email: target.email }, Math.round(grantAmount));
    setRefreshKey((value) => value + 1);
  };

  const approveRequest = async (id: string) => {
    await approveRemoteCreditRequest(id, session?.name ?? 'AD88 Admin');
    setRefreshKey((value) => value + 1);
  };

  const createAccount = async () => {
    if (!accountForm.name.trim() || !isValidEmail(accountForm.email) || !isValidCountryPhone(accountCountry, accountForm.phone) || accountForm.password.length < 8) {
      setAccountMessage(`Complete all fields: valid email, ${phoneDigitsHint(accountCountry)} phone digits and a password of at least 8 characters.`);
      return;
    }
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ name: accountForm.name.trim(), email: accountForm.email.trim(), phone: buildInternationalPhone(accountCountry, accountForm.phone), country: accountCountry.name, password: accountForm.password, role: accountForm.role }),
      });
      setAccountForm({ name: '', email: '', phone: '', country: accountCountry.name, password: '', role: 'user' });
      setAccountMessage('Account created, automatically approved and synchronized to the server.');
      setRefreshKey((value) => value + 1);
      return;
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : 'Account creation failed.');
      return;
    }
  };

  const deleteAccount = async (id: string) => {
    const target = admin.data.users.find((user) => user.id === id);
    if (!target || target.role === 'admin' || !admin.data.registrations.some((item) => item.id === id)) return;
    if (!window.confirm(`Delete account “${target.name}”?`)) return;
    if (!window.confirm('Confirm again: the registration record will be removed from this workspace.')) return;
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setAccountMessage(`Deleted account: ${target.name}`);
      setRefreshKey((value) => value + 1);
      return;
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : 'Account deletion failed.');
      return;
    }
  };

  const blacklistAccount = async (id: string) => {
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(id)}/blacklist`, { method: 'POST', body: JSON.stringify({ reason: 'Registration review declined' }) });
      setAccountMessage('Account is blacklisted; the same email or phone cannot register again.');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : 'Unable to blacklist this account.');
    }
  };

  const restoreBlacklist = async (id: string) => {
    try {
      await apiFetch(`/api/admin/blacklist/${encodeURIComponent(id)}/restore`, { method: 'POST' });
      setAccountMessage('Blacklist removed. This account can sign in or register again.');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : 'Unable to restore this account.');
    }
  };

  return (
    <div className={standalone ? 'admin-standalone page-stack' : 'page-stack'}>
      {standalone ? (
        <div className="admin-topbar">
          <Link to="/" className="brand-lockup">
            <span className="brand-lockup__mark">AD88</span>
            <span className="brand-lockup__name">{t('admin.console')}</span>
          </Link>
          <div className="admin-topbar__actions">
            <label className="locale-picker">
              <Languages size={16} aria-hidden="true" />
              <span className="sr-only">{t('admin.language')}</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label={t('admin.language')}>
                <option value="en">EN</option>
                <option value="zh">中文</option>
                <option value="ms">BM</option>
              </select>
            </label>
            <button type="button" className="btn btn--ghost" onClick={() => { signOut(); navigate('/admin/login'); }}>{t('admin.signOut')}</button>
          </div>
        </div>
      ) : null}
      <PageHeader
        eyebrow={t('admin.eyebrow')}
        title={t('admin.title')}
        description={t('admin.description')}
        meta={<DataMeta source={admin.data.source} />}
      />

      <section className="metric-grid metric-grid--compact">
        <StatCard label={t('admin.metricAccounts')} value={String(report.totalAccounts)} note={t('admin.metricAccountsNote')} />
        <StatCard label={t('admin.metricNew')} value={String(report.monthlyRegistrations)} note={report.monthLabel} />
        <StatCard label={t('admin.metricLedger')} value={String(report.monthlyLedgerEntries)} note={`${t('admin.metricDeposit')} ${formatCurrency(report.monthlyInflow)}`} />
        <StatCard label="U balance" value={String(totalCredits)} note={`${pendingCredits} U pending`} />
        <StatCard
          label="Market synchronization"
          value={admin.data.marketStatus.status === 'healthy' ? 'Healthy' : admin.data.marketStatus.status === 'degraded' ? 'Monitoring' : 'Offline'}
          note={`${admin.data.marketStatus.quoteCount} instruments · ${admin.data.marketStatus.ageSeconds ?? '—'}s ago`}
        />
      </section>

      <section className="panel panel--controls">
        <label className="search-field admin-search">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('admin.searchPlaceholder')} />
        </label>
        <div className="chip-row">
          {tabs.map((item) => (
            <button key={item} type="button" className={`chip ${tab === item ? 'is-active' : ''}`} onClick={() => selectTab(item)}>
              {t(tabTranslationKey[item])}
            </button>
          ))}
        </div>
      </section>

      {tab === 'Accounts' ? (
        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>{t('admin.accountsTitle')}</h2>
              <p>{t('admin.accountsHint')}</p>
            </div>
            <StatusPill tone="info">{String(visibleUsers.length)} {t('admin.people')}</StatusPill>
          </div>
          <div className="admin-account-create">
            <div className="admin-account-create__intro">
              <UserPlus size={20} />
              <div>
                <strong>Create account from admin</strong>
                <span>New accounts are approved automatically and share the same account pool as client registration.</span>
              </div>
            </div>
            <div className="form-grid">
              <label className="field"><span>Full name</span><input value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} /></label>
              <label className="field"><span>Email</span><input type="email" value={accountForm.email} onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })} /></label>
              <label className="field"><span>Country / region</span><select value={accountForm.country} onChange={(event) => setAccountForm({ ...accountForm, country: event.target.value, phone: '' })}>{countryDirectory.map((country) => <option key={`${country.code}-${country.name}`} value={country.name}>{country.name} (+{country.dialCode})</option>)}</select></label>
              <label className="field"><span>Phone ({phoneDigitsHint(accountCountry)} digits)</span><div className="phone-input"><span className="phone-input__prefix">+{accountCountry.dialCode}</span><input type="tel" inputMode="numeric" maxLength={accountPhoneMaxLength} value={accountForm.phone} onChange={(event) => setAccountForm({ ...accountForm, phone: event.target.value.replace(/\D/g, '').slice(0, accountPhoneMaxLength) })} /></div></label>
              <label className="field"><span>Initial password</span><input type="password" autoComplete="new-password" value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} /></label>
              <label className="field"><span>Account role</span><select value={accountForm.role} onChange={(event) => setAccountForm({ ...accountForm, role: event.target.value as 'user' | 'admin' })}><option value="user">Client</option><option value="admin">Administrator</option></select></label>
            </div>
            <div className="admin-account-create__actions"><button type="button" className="btn btn--primary" onClick={createAccount}><UserPlus size={16} />Create and approve</button>{accountMessage ? <span className="field-hint">{accountMessage}</span> : null}</div>
          </div>
          <div className="table-wrap">
            <table className="table table--interactive">
              <thead>
                <tr>
                  <th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Region</th><th>Tier</th><th className="text-end">U balance</th><th>Joined</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.length ? visibleUsers.map((user) => {
                  const credit = creditByEmail.get(user.email.toLowerCase());
                  return (
                    <tr key={user.id}>
                      <td><strong>{user.name}</strong></td>
                      <td>{user.email}</td>
                      <td>{user.role}</td>
                      <td><StatusPill tone={user.status === 'active' ? 'success' : user.status === 'pending' ? 'warning' : 'critical'}>{user.status}</StatusPill></td>
                      <td>{user.country}</td>
                      <td>{user.tier}</td>
                      <td className="text-end">{credit?.balance ?? 0} U</td>
                      <td>{formatDateTime(user.joinedAt)}</td>
                      <td>{user.role !== 'admin' ? <button type="button" className="btn btn--danger btn--sm" onClick={() => deleteAccount(user.id)}><Trash2 size={14} />Delete</button> : <span className="text-muted">Administrator protected</span>}</td>
                    </tr>
                  );
                }) : <tr><td colSpan={9}><div className="empty-inline"><span>No accounts yet. Client registration and admin-created accounts synchronize here.</span></div></td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {tab === 'Registration Review' ? (
        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>{t('admin.regTitle')}</h2>
              <p>{t('admin.regHint')}</p>
            </div>
            <StatusPill tone="warning">{String(visibleRegistrations.length)} {t('admin.items')}</StatusPill>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Full name</th>
                  <th>Gmail</th>
                  <th>Phone</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRegistrations.length ? visibleRegistrations.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.fullName}</strong></td>
                    <td>{item.gmail}</td>
                    <td>{item.phone}</td>
                    <td>{item.country}</td>
                    <td><StatusPill tone={item.status === 'approved' ? 'success' : item.status === 'pending' ? 'warning' : 'critical'}>{item.status}</StatusPill></td>
                    <td>{formatDateTime(item.submittedAt)}</td>
                    <td>{item.status === 'rejected' ? <span className="text-muted">Blacklisted</span> : <button type="button" className="btn btn--danger btn--sm" onClick={() => void blacklistAccount(item.id)}>Decline and blacklist</button>}</td>
                  </tr>
                )) : <tr><td colSpan={7}><div className="empty-inline"><span>No registration records.</span></div></td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {tab === 'U Management' ? (
        <section className="content-grid content-grid--two">
          <article className="panel credit-admin">
            <div className="panel__head">
              <div>
                <h2>U allocation</h2>
                <p>Search by account or email, then assign a paper U amount.</p>
              </div>
              <StatusPill tone={grantAccount || grantUser ? 'success' : 'warning'}>{grantAccount || grantUser ? 'Account selected' : 'Select an account'}</StatusPill>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Account / email / name</span>
                <input value={grantTarget} onChange={(event) => setGrantTarget(event.target.value)} placeholder="Search account or select below" />
              </label>
              <label className="field">
                <span>Allocate U</span>
                <input type="number" min="1" step="1" value={grantAmount} onChange={(event) => setGrantAmount(Number(event.target.value))} />
              </label>
            </div>
            <button type="button" className="btn btn--primary" onClick={() => void grantToTarget()} disabled={!grantLookup || (!grantAccount && !grantUser) || grantAmount <= 0}>
              <PlusCircle size={16} />
              Allocate U
            </button>
            <div className="table-wrap">
              <table className="table table--interactive">
                <thead>
                  <tr>
                    <th>Account</th><th>Email</th><th className="text-end">Balance</th><th className="text-end">Available</th><th className="text-end">Pending</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCreditAccounts.map((account) => (
                    <tr key={account.userId}>
                      <td><strong>{account.userName}</strong></td>
                      <td>{account.email}</td>
                      <td className="text-end">{account.balance}</td>
                      <td className="text-end">{account.available}</td>
                      <td className="text-end">{account.pending}</td>
                      <td>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setGrantTarget(account.email)}>
                          Select
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel">
            <div className="panel__head">
              <div>
                <h2>U allocation review</h2>
                <p>Client-submitted requests wait here for administrator approval.</p>
              </div>
              <StatusPill tone={pendingCreditRequests.length ? 'warning' : 'muted'}>{pendingCreditRequests.length} pending</StatusPill>
            </div>
            {admin.data.creditRequests.length ? (
              <div className="stack-list">
                {admin.data.creditRequests.map((request) => (
                  <div key={request.id} className="stack-list__row">
                    <div>
                      <strong>{request.userName} / {request.amount} U</strong>
                      <span>{request.email}</span>
                      <span>{request.reason}</span>
                    </div>
                    <div className="stack-list__meta">
                      <StatusPill tone={request.status === 'approved' ? 'success' : request.status === 'pending' ? 'warning' : 'critical'}>{request.status}</StatusPill>
                      {request.status === 'pending' ? (
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void approveRequest(request.id)}>
                          <HandCoins size={14} />
                          Approve
                        </button>
                      ) : (
                        <span>{request.reviewedAt ? formatDateTime(request.reviewedAt) : formatDateTime(request.requestedAt)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="state-block">
                <strong>No U requests</strong>
                <p>Client-submitted requests will appear here for review.</p>
              </div>
            )}
          </article>
        </section>
      ) : null}

      {tab === 'Monthly Report' ? (
        <section className="content-grid content-grid--two">
          <article className="panel">
            <div className="panel__head">
              <div>
                <h2>{report.monthLabel} {t('admin.reportTitle')}</h2>
                <p>{t('admin.reportHint')}</p>
              </div>
            </div>
            <section className="metric-grid metric-grid--compact">
              <StatCard label={t('admin.reportApproved')} value={String(report.monthlyApproved)} note={t('admin.reportRegistrations')} />
              <StatCard label={t('admin.reportPositions')} value={String(report.monthlyPositions)} note={t('admin.reportMarket')} />
              <StatCard label={t('admin.reportUnread')} value={String(report.unreadNotifications)} note={t('admin.reportMonthScope')} />
              <StatCard label="Trade events" value={String(visibleTradeEvents.length)} note="Cross-device audit records" />
            </section>
          </article>
          <article className="panel">
            <div className="panel__head">
              <div>
                <h2>{t('admin.summaryTitle')}</h2>
                <p>{t('admin.summaryHint')}</p>
              </div>
            </div>
            <div className="stack-list">
              <div className="stack-list__row">
                <div>
                  <strong>{t('admin.summaryRegistrations')}</strong>
                  <span>{monthRegistrations.length} {t('admin.summaryCount')}; {monthRegistrations.filter((item) => item.status === 'pending').length} {t('admin.summaryPending')} this month.</span>
                </div>
                <div className="stack-list__meta">
                  <StatusPill tone={monthRegistrations.length ? 'info' : 'muted'}>{String(monthRegistrations.length)}</StatusPill>
                  <span>{report.monthLabel}</span>
                </div>
              </div>
              <div className="stack-list__row">
                <div>
                  <strong>{t('admin.summaryLedger')}</strong>
                  <span>{monthLedger.length} {t('admin.summaryLedgerCount')}; {t('admin.summaryOutflow')} {formatCurrency(report.monthlyOutflow)}; {t('admin.summaryInflow')} {formatCurrency(report.monthlyInflow)}.</span>
                </div>
                <div className="stack-list__meta">
                  <StatusPill tone={report.monthlyInflow >= report.monthlyOutflow ? 'success' : 'warning'}>{String(monthLedger.length)}</StatusPill>
                  <span>{report.monthLabel}</span>
                </div>
              </div>
              <div className="stack-list__row">
                <div>
                  <strong>{t('admin.summaryFlow')}</strong>
                  <span>{monthPositions.length} {t('admin.summaryPositions')}; {monthNotifications.length} {t('admin.summaryNotifications')}.</span>
                </div>
                <div className="stack-list__meta">
                  <StatusPill tone="info">{String(monthPositions.length + monthNotifications.length)}</StatusPill>
                  <span>{t('admin.summaryComposite')}</span>
                </div>
              </div>
            </div>
          </article>
        </section>
      ) : null}

      {tab === 'Trade Audit' ? (
        <section className="content-grid content-grid--two">
          <article className="panel">
            <div className="panel__head">
              <div><h2>Trade audit records</h2><p>Client paper opens, closes and risk updates synchronize here.</p></div>
              <StatusPill tone={visibleTradeEvents.length ? 'info' : 'muted'}>{visibleTradeEvents.length} events</StatusPill>
            </div>
            <div className="stack-list">
              {visibleTradeEvents.length ? visibleTradeEvents.map((item) => (
                <div key={item.id} className="stack-list__row">
                  <div>
                    <strong>{item.userName ?? item.userEmail ?? item.userId} / {item.symbol} {item.side.toUpperCase()}</strong>
                    <span>{item.action} · {item.lots} lots · {formatCurrency(item.price)}</span>
                  </div>
                  <div className="stack-list__meta"><StatusPill tone={item.action === 'open' ? 'success' : item.action === 'risk-update' ? 'info' : 'warning'}>{item.action}</StatusPill><span>{formatDateTime(item.createdAt)}</span></div>
                </div>
              )) : <div className="state-block"><strong>No cross-device trade events</strong><p>Events appear here after a client performs a paper action.</p></div>}
            </div>
          </article>
          <article className="panel">
            <div className="panel__head"><div><h2>Current paper positions</h2><p>A shared position snapshot for risk oversight.</p></div></div>
            <div className="stack-list">
              {visiblePositions.map((item) => (
                <div key={item.id} className="stack-list__row">
                  <div><strong>{item.userName ?? item.userId ?? 'Unknown'} / {item.symbol} {item.side.toUpperCase()}</strong><span>{item.lots} lots / leverage {item.leverage}x / entry {formatCurrency(item.entryPrice)}</span></div>
                  <div className="stack-list__meta"><StatusPill tone={item.margin < 1000 ? 'success' : item.margin < 3000 ? 'warning' : 'critical'}>{formatCurrency(item.margin)}</StatusPill><span>{formatDateTime(item.openedAt)}</span></div>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {tab === 'Activity & Alerts' ? (
        <section className="content-grid content-grid--two">
          <article className="panel">
            <div className="panel__head"><div><h2>{t('admin.ledgerTitle')}</h2><p>Funding activity across all accounts is centralized here; search by email to find an applicant.</p></div></div>
            <div className="stack-list">
              {visibleLedger.length ? visibleLedger.map((item) => (
                <div key={item.id} className="stack-list__row">
                  <div><strong>{item.userEmail ?? 'Deleted account'}</strong><span>{item.userName ?? '—'} · {item.note || item.type}</span></div>
                  <div className="stack-list__meta"><StatusPill tone={item.status === 'approved' || item.status === 'settled' ? 'success' : item.status === 'pending' ? 'warning' : 'critical'}>{item.status}</StatusPill><span>{item.amount.toFixed(2)} {item.currency}</span></div>
                </div>
              )) : <div className="state-block"><strong>No funding activity</strong><p>Funding or withdrawal events appear here under the client email.</p></div>}
            </div>
          </article>
          <article className="panel">
            <div className="panel__head"><div><h2>{t('admin.notificationsTitle')}</h2><p>{t('admin.notificationsHint')}</p></div></div>
            <div className="stack-list">
              {visibleNotifications.map((item) => (
                <div key={item.id} className="stack-list__row">
                  <div><strong>{item.title}</strong><span>{item.body}</span></div>
                  <div className="stack-list__meta"><StatusPill tone={item.read ? 'muted' : 'warning'}>{item.read ? 'read' : 'unread'}</StatusPill><span>{formatDateTime(item.createdAt)}</span></div>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {tab === 'Support Inbox' ? <SupportCenter adminMode /> : null}

      {tab === 'Content' ? (
        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>{t('admin.contentTitle')}</h2>
              <p>{t('admin.contentHint')}</p>
            </div>
            <StatusPill tone="info">{String(contentCount)} {t('admin.articles')}</StatusPill>
          </div>
          <div className="stack-list">
            {newsItems.slice(0, 6).map((item) => (
              <div key={item.id} className="stack-list__row">
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.category} / {item.source}</span>
                </div>
                <div className="stack-list__meta">
                  <StatusPill tone={item.tone === 'positive' ? 'success' : item.tone === 'alert' ? 'critical' : 'info'}>{item.tone}</StatusPill>
                  <span>{formatDateTime(item.publishedAt)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Key</th><th>Value</th><th>Scope</th>
                </tr>
              </thead>
              <tbody>
                {admin.data.configs.map((config) => (
                  <tr key={config.key}>
                    <td>{config.key}</td>
                    <td>{config.value.includes('://') || config.value.startsWith('http') ? 'Configured server-side' : config.value}</td>
                    <td>{config.scope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {tab === 'Approval Flow' ? (
        <section className="content-grid content-grid--two">
          <article className="panel">
            <div className="panel__head"><div><h2>{t('admin.approvalTitle')}</h2><p>Client registrations are auto-approved; admission time and follow-up review state remain visible here.</p></div></div>
            <div className="stack-list">
              {admin.data.approvals.length ? admin.data.approvals.map((approval) => (
                <div key={approval.id} className="stack-list__row">
                  <div><strong>{approval.subject}</strong><span>{approval.owner}</span></div>
                  <div className="stack-list__meta"><StatusPill tone={approval.status === 'approved' ? 'success' : approval.status === 'pending' ? 'warning' : 'critical'}>{approval.status === 'approved' ? 'Auto-approved' : approval.status === 'rejected' ? 'Blacklisted' : 'Pending'}</StatusPill><span>{formatDateTime(approval.updatedAt)}</span></div>
                </div>
              )) : <div className="state-block"><strong>No approval records</strong><p>Client registration records synchronize here automatically.</p></div>}
            </div>
          </article>
          <article className="panel">
            <div className="panel__head"><div><h2>Blacklist records</h2><p>Use the dedicated tab for the full list and restoration controls.</p></div><StatusPill tone={admin.data.blacklist.length ? 'critical' : 'muted'}>{admin.data.blacklist.length} records</StatusPill></div>
            <div className="stack-list">
              {admin.data.blacklist.slice(0, 5).map((entry) => <div key={entry.id} className="stack-list__row"><div><strong>{entry.name}</strong><span>{entry.email}</span></div><div className="stack-list__meta"><StatusPill tone="critical">Blacklisted</StatusPill><span>{formatDateTime(entry.blacklistedAt)}</span></div></div>)}
              {!admin.data.blacklist.length ? <div className="state-block"><strong>No blacklist records</strong><p>Records appear here after a registration is declined and blacklisted.</p></div> : null}
            </div>
          </article>
        </section>
      ) : null}

      {tab === 'Blacklist' ? (
        <article className="panel">
          <div className="panel__head"><div><h2>Blacklist records</h2><p>After blacklisting, the same email or phone cannot register again. Restore access here when appropriate.</p></div><StatusPill tone={visibleBlacklist.length ? 'critical' : 'muted'}>{visibleBlacklist.length} records</StatusPill></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Region</th><th>Reason</th><th>Blacklisted</th><th>Action</th></tr></thead>
              <tbody>
                {visibleBlacklist.length ? visibleBlacklist.map((entry) => <tr key={entry.id}><td><strong>{entry.name}</strong></td><td>{entry.email}</td><td>{entry.phone}</td><td>{entry.country}</td><td>{entry.reason}</td><td>{formatDateTime(entry.blacklistedAt)}</td><td><button type="button" className="btn btn--ghost btn--sm" onClick={() => void restoreBlacklist(entry.id)}>Restore access</button></td></tr>) : <tr><td colSpan={7}><div className="empty-inline"><span>No blacklist records.</span></div></td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </div>
  );
}
