import { useEffect, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpFromLine, CalendarDays, ClipboardCheck, Clock3, Eye, FileText, HandCoins, Languages, LayoutDashboard, MessageCircle, MinusCircle, Newspaper, PlusCircle, ReceiptText, ShieldBan, Trash2, UserPlus, Users, WalletCards, XCircle, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataMeta, LoadingState, StatCard, StatusPill, EmptyState } from '@/components/Stats';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadAdminBundle } from '@/adapters/admin-adapter';
import { loadNewsBundle } from '@/adapters/news-adapter';
import { formatCurrency, formatDateTime, formatMarketCurrency } from '@/lib/format';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { approveRemoteCreditRequest, grantRemoteCredits, rejectRemoteCreditRequest } from '@/lib/credits';
import { buildInternationalPhone, countryDirectory, getCountryOption, isValidCountryPhone, phoneDigitsHint } from '@/data/countries';
import { isValidEmail } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { SupportCenter } from '@/components/SupportCenter';
import { TimedScenarioResultDialog } from '@/components/TimedScenarioResultDialog';
import { BrandMark } from '@/components/BrandMark';
import { labelCountry, labelNewsCategory, labelNewsSentiment } from '@/lib/news-labels';
import { clearFundingHistory, deleteFundingHistoryItem, reviewFundingRequest } from '@/lib/funding';
import { deleteRemoteLedgerEntry } from '@/adapters/ledger-adapter';
import type { FundingRequest, LanguageCode, TimedMarketScenario } from '@/types';
import {
  getDefaultSharedContentSetting,
  FUNDING_PROCESSING_NOTE_KEY,
  FUNDING_REVIEW_SAFETY_KEY,
  MARKET_OBSERVATION_CONTENT_KEYS,
  MARKET_OBSERVATION_SAFETY_KEY,
  MARKET_SCENARIO_ADMIN_NOTE_LABEL_KEY,
  MARKET_SCENARIO_DIRECTION_HINT_KEY,
  MARKET_SCENARIO_DIALOG_SAFETY_KEY,
  MARKET_SCENARIO_INPUT_NOTE_KEY,
  MARKET_SCENARIO_SCALE_HINT_KEY,
  MARKET_SCENARIO_SCALE_KEY,
  MARKET_SCENARIO_SCALE_NOTE_KEY,
  MARKET_SCENARIO_WORKSPACE_SAFETY_KEY,
} from '@/lib/content-settings';

const tabs = ['Accounts', 'Registration Review', 'Deposit Review', 'Withdrawal Review', 'U Management', 'Ledger', 'Monthly Report', 'Trade Audit', 'Order Management', 'Activity & Alerts', 'Support Inbox', 'Content', 'Approval Flow', 'Blacklist'] as const;
type AdminTab = (typeof tabs)[number];

const tabTranslationKey: Record<AdminTab, string> = {
  Accounts: 'admin.tab.accounts',
  'Registration Review': 'admin.tab.registrationReview',
  'Deposit Review': 'admin.tab.depositReview',
  'Withdrawal Review': 'admin.tab.withdrawalReview',
  'U Management': 'admin.tab.uManagement',
  Ledger: 'admin.tab.ledger',
  'Monthly Report': 'admin.tab.monthlyReport',
  'Trade Audit': 'admin.tab.tradeAudit',
  'Order Management': 'admin.tab.orderManagement',
  'Activity & Alerts': 'admin.tab.activityAlerts',
  'Support Inbox': 'admin.tab.supportInbox',
  Content: 'admin.tab.content',
  'Approval Flow': 'admin.tab.approvalFlow',
  Blacklist: 'admin.tab.blacklist',
};

const tabIcons: Record<AdminTab, LucideIcon> = {
  Accounts: Users,
  'Registration Review': ClipboardCheck,
  'Deposit Review': ArrowDownToLine,
  'Withdrawal Review': ArrowUpFromLine,
  'U Management': WalletCards,
  Ledger: ReceiptText,
  'Monthly Report': CalendarDays,
  'Trade Audit': Activity,
  'Order Management': ClipboardCheck,
  'Activity & Alerts': LayoutDashboard,
  'Support Inbox': MessageCircle,
  Content: Newspaper,
  'Approval Flow': FileText,
  Blacklist: ShieldBan,
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

const defaultMarketObservationCopy = Object.fromEntries(
  MARKET_OBSERVATION_CONTENT_KEYS.map((key) => [key, getDefaultSharedContentSetting(key).values]),
) as Record<(typeof MARKET_OBSERVATION_CONTENT_KEYS)[number], Record<LanguageCode, string>>;
type MarketObservationContentKey = (typeof MARKET_OBSERVATION_CONTENT_KEYS)[number];
type MarketObservationContentDraft = Record<MarketObservationContentKey, Record<LanguageCode, string>>;

function timedScenarioRemainingSeconds(scenario: TimedMarketScenario, now: number) {
  return Math.max(0, Math.ceil((new Date(scenario.expiresAt).getTime() - now) / 1000));
}

function timedScenarioProgress(scenario: TimedMarketScenario, now: number) {
  if (!scenario.durationSeconds) return 100;
  const remaining = timedScenarioRemainingSeconds(scenario, now);
  return Math.max(0, Math.min(100, ((scenario.durationSeconds - remaining) / scenario.durationSeconds) * 100));
}

function formatAdminCountdown(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return hours ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function FundingReviewPanel({
  kind,
  requests,
  t,
  onReview,
  onDelete,
  onClearHistory,
  message,
}: {
  kind: 'deposit' | 'withdraw';
  requests: FundingRequest[];
  t: (key: string) => string;
  onReview: (id: string, action: 'approve' | 'reject', reviewerNote: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClearHistory: (kind: 'deposit' | 'withdraw') => Promise<void>;
  message: string;
}) {
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const queue = requests.filter((request) => request.status === 'pending');
  const history = requests.filter((request) => request.status !== 'pending');
  const title = kind === 'deposit' ? t('admin.depositReview') : t('admin.withdrawalReview');
  const empty = kind === 'deposit' ? t('admin.noDepositRequests') : t('admin.noWithdrawalRequests');
  const statusLabel = (status: FundingRequest['status']) => t(status === 'approved' ? 'status.approved' : status === 'rejected' ? 'status.rejected' : 'status.pending');
  const methodLabel = (request: FundingRequest) => request.method === 'tng' ? t('funding.tng') : request.bankName || t('funding.bankSupport');

  return (
    <section className={`content-grid content-grid--two funding-admin-grid funding-admin-grid--${kind}`}>
      <article className="panel funding-admin-queue-panel">
        <div className="panel__head"><div><span className="eyebrow">{kind === 'deposit' ? t('funding.deposit') : t('funding.withdraw')}</span><h2>{title}</h2><p>{t('admin.fundingReviewHint')}</p></div><StatusPill tone={queue.length ? 'warning' : 'muted'}>{queue.length} {t('admin.pending')}</StatusPill></div>
        {message ? <div className={`notice-banner ${message === t('admin.fundingReviewFailed') ? 'notice-banner--error' : ''}`}>{message}</div> : null}
        <div className="table-wrap admin-funding-queue-scroll"><table className="table table--interactive funding-admin-table"><thead><tr><th>{t('admin.requester')}</th><th>{t('admin.fundingMethod')}</th><th>{t('funding.requestNote')}</th><th className="text-end">{t('admin.myrValue')}</th><th className="text-end">{t('admin.paperUValue')}</th><th>{t('admin.fundingRate')}</th><th>{t('admin.submitted')}</th><th>{t('admin.action')}</th></tr></thead><tbody>
          {queue.length ? queue.map((request) => <tr key={request.id}><td><strong>{request.userName}</strong><div className="text-small text-muted">{request.email}</div>{request.accountHolder ? <div className="text-small text-muted">{t('funding.accountHolder')}: {request.accountHolder}</div> : null}{request.accountReference ? <div className="text-small text-muted">{t('funding.accountNumber')}: {request.accountReference}</div> : null}</td><td>{methodLabel(request)}<div className="text-small text-muted">{request.supportRequired ? t('funding.supportReview') : t('funding.directReview')}</div></td><td className="funding-request-note">{request.customerNote || t('admin.noCustomerNote')}</td><td className="text-end">{formatCurrency(request.amountMyr, 'MYR')}</td><td className="text-end"><strong>{request.amountU.toFixed(4)} U</strong></td><td>RM {request.rate.toFixed(4)} / U</td><td>{formatDateTime(request.createdAt)}</td><td><div className="admin-funding-review"><label className="field admin-funding-review__note"><span>{t('admin.fundingReviewNote')}</span><textarea rows={2} maxLength={320} value={reviewNotes[request.id] ?? ''} onChange={(event) => setReviewNotes((current) => ({ ...current, [request.id]: event.target.value }))} placeholder={t('admin.fundingReviewNotePlaceholder')} /></label><div className="admin-funding-actions"><button type="button" className="btn btn--primary btn--sm" onClick={() => void onReview(request.id, 'approve', reviewNotes[request.id] ?? '')}>{t('admin.approve')}</button><button type="button" className="btn btn--danger btn--sm" onClick={() => void onReview(request.id, 'reject', reviewNotes[request.id] ?? '')}>{t('admin.reject')}</button></div></div></td></tr>) : <tr><td colSpan={8}><div className="empty-inline"><span>{empty}</span></div></td></tr>}
        </tbody></table></div>
      </article>
      <article className="panel funding-admin-history-panel">
        <div className="panel__head"><div><h2>{t('admin.fundingHistory')}</h2><p>{t('admin.fundingHistoryHint')}</p></div><div className="history-actions"><StatusPill tone={history.length ? 'info' : 'muted'}>{history.length} {t('admin.records')}</StatusPill><button type="button" className="btn btn--danger btn--sm" disabled={!history.length} onClick={() => void onClearHistory(kind)}><Trash2 size={14} />{t('admin.clearFundingHistory')}</button></div></div>
        <div className="stack-list funding-history-scroll funding-history-scroll--stack admin-funding-history" tabIndex={0}>
          {history.length ? history.map((request) => <div key={request.id} className="stack-list__row"><div><strong>{request.email}</strong><span>{methodLabel(request)} · {formatCurrency(request.amountMyr, 'MYR')} · {request.amountU.toFixed(4)} U</span>{request.accountHolder ? <span>{t('funding.accountHolder')}: {request.accountHolder}</span> : null}{request.accountReference ? <span>{t('funding.accountNumber')}: {request.accountReference}</span> : null}{request.customerNote ? <span className="funding-request-note"><b>{t('funding.requestNote')}:</b> {request.customerNote}</span> : null}{request.reviewerNote ? <span className="funding-review-note"><b>{t('admin.fundingReviewNote')}:</b> {request.reviewerNote}</span> : null}<span>{request.reviewer ? `${t('admin.reviewedBy')}: ${request.reviewer}` : t('admin.review')}</span></div><div className="stack-list__meta"><StatusPill tone={request.status === 'approved' ? 'success' : 'critical'}>{statusLabel(request.status)}</StatusPill><span>{formatDateTime(request.reviewedAt ?? request.createdAt)}</span><button type="button" className="btn btn--ghost btn--sm" onClick={() => void onDelete(request.id)}><Trash2 size={14} />{t('admin.delete')}</button></div></div>) : <div className="state-block"><strong>{t('admin.fundingHistory')}</strong><p>{t('admin.fundingHistoryHint')}</p></div>}
        </div>
      </article>
    </section>
  );
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
  const [fundingMessage, setFundingMessage] = useState('');
  const [creditMessage, setCreditMessage] = useState('');
  const [adminNow, setAdminNow] = useState(() => Date.now());
  const [selectedTimedScenarioId, setSelectedTimedScenarioId] = useState<string | null>(null);
  const [timedScenarioNoteEditorId, setTimedScenarioNoteEditorId] = useState<string | null>(null);
  const [timedScenarioNoteDraft, setTimedScenarioNoteDraft] = useState('');
  const [timedScenarioNoteSavingId, setTimedScenarioNoteSavingId] = useState<string | null>(null);
  const [timedScenarioNoteMessage, setTimedScenarioNoteMessage] = useState('');
  const [contentDraft, setContentDraft] = useState<MarketObservationContentDraft>(() => structuredClone(defaultMarketObservationCopy));
  const [contentDirty, setContentDirty] = useState(false);
  const [contentSaving, setContentSaving] = useState(false);
  const [contentMessage, setContentMessage] = useState('');
  const admin = useAsyncResource(() => loadAdminBundle(), [refreshKey]);
  const news = useAsyncResource(() => loadNewsBundle(), []);

  const serverContentSettings = admin.status === 'success'
    ? new Map(admin.data.contentSettings.map((setting) => [setting.key, setting]))
    : new Map();
  const contentFields: Array<{ key: MarketObservationContentKey; label: string; location: string; rows: number }> = [
    { key: MARKET_SCENARIO_SCALE_KEY, label: t('admin.contentObservationTitle'), location: t('admin.contentLocationAmountTitle'), rows: 2 },
    { key: MARKET_SCENARIO_SCALE_HINT_KEY, label: t('admin.contentObservationAmountHint'), location: t('admin.contentLocationAmountTitle'), rows: 2 },
    { key: MARKET_SCENARIO_SCALE_NOTE_KEY, label: t('admin.contentObservationAmountNote'), location: t('admin.contentLocationAmountNote'), rows: 3 },
    { key: MARKET_SCENARIO_INPUT_NOTE_KEY, label: t('admin.contentObservationInputLabel'), location: t('admin.contentLocationAmountNote'), rows: 2 },
    { key: MARKET_SCENARIO_DIRECTION_HINT_KEY, label: t('admin.contentObservationDirectionHint'), location: t('admin.contentLocationDirection'), rows: 2 },
    { key: MARKET_OBSERVATION_SAFETY_KEY, label: t('admin.contentObservationSharedSafety'), location: t('admin.contentLocationSharedSafety'), rows: 3 },
    { key: MARKET_SCENARIO_WORKSPACE_SAFETY_KEY, label: t('admin.contentObservationWorkspaceSafety'), location: t('admin.contentLocationWorkspaceSafety'), rows: 3 },
    { key: MARKET_SCENARIO_DIALOG_SAFETY_KEY, label: t('admin.contentObservationDialogSafety'), location: t('admin.contentLocationDialogSafety'), rows: 3 },
    { key: MARKET_SCENARIO_ADMIN_NOTE_LABEL_KEY, label: t('admin.contentObservationAdminNote'), location: t('admin.contentLocationResultNote'), rows: 2 },
    { key: FUNDING_PROCESSING_NOTE_KEY, label: t('admin.contentFundingProcessing'), location: t('admin.contentLocationFundingProcessing'), rows: 3 },
    { key: FUNDING_REVIEW_SAFETY_KEY, label: t('admin.contentFundingSafety'), location: t('admin.contentLocationFundingSafety'), rows: 3 },
  ];

  const statusLabel = (status: string) => {
    if (status === 'approved') return t('status.approved');
    if (status === 'settled') return t('status.settled');
    if (status === 'pending') return t('status.pending');
    if (status === 'rejected') return t('status.rejected');
    if (status === 'active') return t('settings.active');
    if (status === 'read') return t('admin.read');
    if (status === 'unread') return t('admin.unread');
    return status;
  };
  const tradeActionLabel = (action: string) => {
    if (action === 'open') return t('ledger.open');
    if (action === 'close') return t('ledger.close');
    if (action === 'partial-close') return t('ledger.partialClose');
    if (action === 'risk-update') return t('ledger.riskUpdate');
    if (action === 'liquidation') return t('ledger.liquidation');
    return action;
  };
  const sideLabel = (side: string) => side === 'long' ? t('market.long') : t('market.short');

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
    if (!contentDirty) {
      setContentDraft((current) => Object.fromEntries(
        MARKET_OBSERVATION_CONTENT_KEYS.map((key) => [key, serverContentSettings.get(key)?.values ?? current[key] ?? defaultMarketObservationCopy[key]]),
      ) as MarketObservationContentDraft);
    }
  }, [contentDirty, admin.status, admin.data?.contentSettings]);

  useEffect(() => {
    const timer = window.setInterval(() => setAdminNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
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
          eyebrow={t('admin.accessControl')}
          title={t('admin.consoleTitle')}
          description={t('admin.accessRequiredHint')}
        />
        <EmptyState
          title={t('admin.accessRequired')}
          text={t('admin.accessRequiredHint')}
          action={
            <Link to="/admin/login" className="btn btn--primary">
              {t('auth.login')} <ArrowRight size={16} />
            </Link>
          }
        />
      </div>
    );
  }

  if (admin.status === 'loading') {
    return <LoadingState label={t('admin.loading')} />;
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
        <PageHeader eyebrow={t('admin.statusEyebrow')} title={t('admin.unavailableTitle')} description={t('admin.unavailableHint')} />
        <div className="state-block state-block--error">
          <strong>{t('admin.unavailableTitle')}</strong>
          <p>{admin.error || t('admin.sharedApiError')}</p>
          <div className="state-block__action">
          <button type="button" className="btn btn--ghost" onClick={() => setRefreshKey((value) => value + 1)}>{t('admin.reload')}</button>
            <button type="button" className="btn btn--primary" onClick={() => { signOut(); navigate('/admin/login'); }}>{t('auth.login')}</button>
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
  const visibleTimedScenarios = admin.data.timedScenarios.filter((item) => matches(item.userName) || matches(item.userEmail) || matches(item.userId) || matches(item.symbol) || matches(item.direction) || matches(item.status));
  const selectedTimedScenario = selectedTimedScenarioId
    ? admin.data.timedScenarios.find((item) => item.id === selectedTimedScenarioId) ?? null
    : null;
  const visibleLedger = admin.data.ledgerEntries.filter((item) => matches(item.userEmail) || matches(item.userName) || matches(item.note) || matches(item.type));
  const visibleNotifications = admin.data.notifications.filter((item) => matches(item.title) || matches(item.body) || matches(item.category));
  const visibleCreditAccounts = admin.data.creditAccounts.filter((item) => matches(item.userName) || matches(item.email) || matches(item.userId));
  const visibleBlacklist = admin.data.blacklist.filter((item) => matches(item.name) || matches(item.email) || matches(item.phone) || matches(item.reason));
  const visibleFundingRequests = admin.data.fundingRequests.filter((item) => matches(item.userName) || matches(item.email) || matches(item.bankName) || matches(item.method) || matches(item.status));
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
  const monthDepositRequests = admin.data.fundingRequests.filter((item) => item.kind === 'deposit' && item.status === 'approved' && isCurrentMonth(item.createdAt));
  const monthWithdrawalRequests = admin.data.fundingRequests.filter((item) => item.kind === 'withdraw' && item.status === 'approved' && isCurrentMonth(item.createdAt));
  const monthDepositU = monthDepositRequests.reduce((sum, item) => sum + item.amountU, 0);
  const monthWithdrawalU = monthWithdrawalRequests.reduce((sum, item) => sum + item.amountU, 0);
  const monthDepositMyr = monthDepositRequests.reduce((sum, item) => sum + item.amountMyr, 0);
  const monthWithdrawalMyr = monthWithdrawalRequests.reduce((sum, item) => sum + item.amountMyr, 0);
  const newsItems = news.status === 'success' ? news.data.items : [];
  const contentCount = contentFields.length;
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
  const fundingMethodLabel = (request: FundingRequest) => request.method === 'tng' ? t('funding.tng') : request.bankName || t('funding.bankSupport');

  const adjustUForTarget = async (delta: number) => {
    const target = grantAccount ?? (grantUser ? { userId: grantUser.id, userName: grantUser.name, email: grantUser.email } : null);
    if (!target || grantAmount <= 0) return;
    try {
      await grantRemoteCredits({ id: target.userId, name: target.userName, email: target.email }, Math.round(delta * grantAmount));
      setAccountMessage(t('admin.adjustmentSuccess'));
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : t('admin.selectAccount'));
    }
  };

  const reviewCreditRequest = async (id: string, action: 'approve' | 'reject') => {
    try {
      if (action === 'approve') {
        await approveRemoteCreditRequest(id, session?.name ?? 'VENTURE FUNDS Admin');
      } else {
        await rejectRemoteCreditRequest(id, session?.name ?? 'VENTURE FUNDS Admin');
      }
      setCreditMessage(action === 'approve' ? t('admin.uApproved') : t('admin.uRejected'));
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setCreditMessage(error instanceof Error ? error.message : t('admin.uReviewFailed'));
    }
  };

  const deleteLedger = async (id: string) => {
    if (!window.confirm(t('admin.deleteLedgerConfirm'))) return;
    try {
      await deleteRemoteLedgerEntry(id);
      setCreditMessage(t('admin.ledgerDeleted'));
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setCreditMessage(error instanceof Error ? error.message : t('admin.ledgerDeleteFailed'));
    }
  };

  const reviewFunding = async (id: string, action: 'approve' | 'reject', reviewerNote = '') => {
    try {
      await reviewFundingRequest(id, action, reviewerNote);
      setFundingMessage(action === 'approve' ? t('admin.fundingApproved') : t('admin.fundingRejected'));
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setFundingMessage(error instanceof Error ? error.message : t('admin.fundingReviewFailed'));
    }
  };

  const deleteFundingHistory = async (id: string) => {
    if (!window.confirm(t('admin.deleteFundingConfirm'))) return;
    try {
      await deleteFundingHistoryItem(id);
      setFundingMessage(t('admin.fundingHistoryDeleted'));
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setFundingMessage(error instanceof Error ? error.message : t('admin.fundingHistoryDeleteFailed'));
    }
  };

  const clearFundingHistoryForKind = async (kind: 'deposit' | 'withdraw') => {
    if (!window.confirm(t('admin.clearFundingHistoryConfirm'))) return;
    if (!window.confirm(t('admin.clearFundingHistoryConfirmAgain'))) return;
    try {
      const result = await clearFundingHistory(kind);
      setFundingMessage(t('admin.fundingHistoryCleared').replace('{count}', String(result.deleted)));
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setFundingMessage(error instanceof Error ? error.message : t('admin.fundingHistoryDeleteFailed'));
    }
  };

  const createAccount = async () => {
    if (!accountForm.name.trim() || !isValidEmail(accountForm.email) || !isValidCountryPhone(accountCountry, accountForm.phone) || accountForm.password.length < 8) {
      setAccountMessage(t('admin.completeAccountFields').replace('{digits}', phoneDigitsHint(accountCountry)));
      return;
    }
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ name: accountForm.name.trim(), email: accountForm.email.trim(), phone: buildInternationalPhone(accountCountry, accountForm.phone), country: accountCountry.name, password: accountForm.password, role: accountForm.role }),
      });
      setAccountForm({ name: '', email: '', phone: '', country: accountCountry.name, password: '', role: 'user' });
      setAccountMessage(t('admin.accountCreated'));
      setRefreshKey((value) => value + 1);
      return;
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : t('admin.accountCreationFailed'));
      return;
    }
  };

  const deleteAccount = async (id: string) => {
    const target = admin.data.users.find((user) => user.id === id);
    if (!target || target.role === 'admin' || !admin.data.registrations.some((item) => item.id === id)) return;
    if (!window.confirm(t('admin.deleteConfirm').replace('{name}', target.name))) return;
    if (!window.confirm(t('admin.deleteConfirmAgain'))) return;
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setAccountMessage(t('admin.deletedAccount').replace('{name}', target.name));
      setRefreshKey((value) => value + 1);
      return;
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : t('admin.accountDeletionFailed'));
      return;
    }
  };

  const blacklistAccount = async (id: string) => {
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(id)}/blacklist`, { method: 'POST', body: JSON.stringify({ reason: 'Registration review declined' }) });
      setAccountMessage(t('admin.blacklistSuccess'));
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : t('admin.blacklistFailed'));
    }
  };

  const restoreBlacklist = async (id: string) => {
    try {
      await apiFetch(`/api/admin/blacklist/${encodeURIComponent(id)}/restore`, { method: 'POST' });
      setAccountMessage(t('admin.restoreSuccess'));
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : t('admin.restoreFailed'));
    }
  };

  const voidTimedScenario = async (scenario: TimedMarketScenario) => {
    const reason = window.prompt(t('admin.orderVoidPrompt'))?.trim();
    if (!reason) return;
    try {
      await apiFetch(`/api/admin/market-scenarios/${encodeURIComponent(scenario.id)}/void`, { method: 'POST', body: JSON.stringify({ reason }) });
      setAccountMessage(t('admin.orderVoided'));
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : t('admin.orderVoidFailed'));
    }
  };

  const openTimedScenarioNoteEditor = (scenario: TimedMarketScenario) => {
    setTimedScenarioNoteEditorId(scenario.id);
    setTimedScenarioNoteDraft(scenario.adminNote ?? '');
    setTimedScenarioNoteMessage('');
    window.requestAnimationFrame(() => {
      document.getElementById(`admin-order-record-${scenario.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  };

  const cancelTimedScenarioNote = () => {
    setTimedScenarioNoteEditorId(null);
    setTimedScenarioNoteDraft('');
  };

  const saveTimedScenarioNote = async (scenario: TimedMarketScenario) => {
    if (timedScenarioNoteSavingId) return;
    setTimedScenarioNoteSavingId(scenario.id);
    setTimedScenarioNoteMessage('');
    try {
      await apiFetch(`/api/admin/market-scenarios/${encodeURIComponent(scenario.id)}/note`, {
        method: 'PATCH',
        body: JSON.stringify({ note: timedScenarioNoteDraft }),
      });
      setTimedScenarioNoteMessage(t('admin.orderNoteSaved'));
      cancelTimedScenarioNote();
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setTimedScenarioNoteMessage(error instanceof Error ? error.message : t('admin.orderNoteSaveFailed'));
    } finally {
      setTimedScenarioNoteSavingId(null);
    }
  };

  const saveContentSettings = async () => {
    if (contentSaving) return;
    setContentSaving(true);
    setContentMessage('');
    try {
      await apiFetch('/api/admin/content-settings', {
        method: 'PUT',
        body: JSON.stringify({ settings: MARKET_OBSERVATION_CONTENT_KEYS.map((key) => ({ key, values: contentDraft[key] })) }),
      });
      setContentDirty(false);
      setContentMessage(t('admin.contentSaved'));
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setContentMessage(error instanceof Error ? error.message : t('admin.contentSaveFailed'));
    } finally {
      setContentSaving(false);
    }
  };

  return (
    <div className={standalone ? 'admin-standalone page-stack' : 'page-stack'}>
      {standalone ? (
        <div className="admin-topbar">
          <Link to="/" className="brand-lockup">
            <BrandMark />
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
        meta={<DataMeta source={admin.data.source} refreshing={admin.refreshing} refreshError={admin.refreshError} />}
      />

      <section className="metric-grid metric-grid--compact">
        <StatCard label={t('admin.metricAccounts')} value={String(report.totalAccounts)} note={t('admin.metricAccountsNote')} />
        <StatCard label={t('admin.metricNew')} value={String(report.monthlyRegistrations)} note={report.monthLabel} />
        <StatCard label={t('admin.metricLedger')} value={String(report.monthlyLedgerEntries)} note={`${t('admin.metricDeposit')} ${formatCurrency(report.monthlyInflow)}`} />
        <StatCard label={t('admin.monthlyDeposits')} value={`${monthDepositU.toFixed(2)} U`} note={formatCurrency(monthDepositMyr, 'MYR')} />
        <StatCard label={t('admin.monthlyWithdrawals')} value={`${monthWithdrawalU.toFixed(2)} U`} note={formatCurrency(monthWithdrawalMyr, 'MYR')} />
         <StatCard label={t('admin.uBalance')} value={String(totalCredits)} note={`${pendingCredits}${t('admin.uPending')}`} />
         <StatCard
           label={t('admin.marketSync')}
           value={admin.data.marketStatus.status === 'healthy' ? t('admin.healthy') : admin.data.marketStatus.status === 'degraded' ? t('admin.monitoring') : t('admin.offline')}
           note={`${admin.data.marketStatus.quoteCount}${t('admin.instrumentsAgo').replace('{age}', String(admin.data.marketStatus.ageSeconds ?? '—')).replace(/^\d+/, '')}`}
        />
      </section>

      <section className="panel panel--controls">
        <label className="search-field admin-search">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('admin.searchPlaceholder')} />
        </label>
        <div className="admin-tab-grid">
          {tabs.map((item) => (
            <button key={item} type="button" className={`chip admin-tab-chip ${tab === item ? 'is-active' : ''}`} onClick={() => selectTab(item)}>
              {(() => { const Icon = tabIcons[item]; return <Icon size={15} strokeWidth={1.8} aria-hidden="true" />; })()}
              <span>{t(tabTranslationKey[item])}</span>
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
                <strong>{t('admin.createAccount')}</strong>
                <span>{t('admin.createAccountHint')}</span>
              </div>
            </div>
            <div className="form-grid">
              <label className="field"><span>{t('admin.fullName')}</span><input value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} /></label>
              <label className="field"><span>{t('admin.email')}</span><input type="email" value={accountForm.email} onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })} /></label>
              <label className="field"><span>{t('admin.countryRegion')}</span><select value={accountForm.country} onChange={(event) => setAccountForm({ ...accountForm, country: event.target.value, phone: '' })}>{countryDirectory.map((country) => <option key={`${country.code}-${country.name}`} value={country.name}>{country.name} (+{country.dialCode})</option>)}</select></label>
              <label className="field"><span>{t('admin.phoneDigits').replace('{digits}', phoneDigitsHint(accountCountry))}</span><div className="phone-input"><span className="phone-input__prefix">+{accountCountry.dialCode}</span><input type="tel" inputMode="numeric" maxLength={accountPhoneMaxLength} value={accountForm.phone} onChange={(event) => setAccountForm({ ...accountForm, phone: event.target.value.replace(/\D/g, '').slice(0, accountPhoneMaxLength) })} /></div></label>
              <label className="field"><span>{t('admin.initialPassword')}</span><input type="password" autoComplete="new-password" value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} /></label>
              <label className="field"><span>{t('admin.accountRole')}</span><select value={accountForm.role} onChange={(event) => setAccountForm({ ...accountForm, role: event.target.value as 'user' | 'admin' })}><option value="user">{t('admin.client')}</option><option value="admin">{t('admin.administrator')}</option></select></label>
            </div>
            <div className="admin-account-create__actions"><button type="button" className="btn btn--primary" onClick={createAccount}><UserPlus size={16} />{t('admin.createAndApprove')}</button>{accountMessage ? <span className="field-hint">{accountMessage}</span> : null}</div>
          </div>
          <div className="table-wrap">
            <table className="table table--interactive">
              <thead>
                <tr>
                  <th>{t('admin.fullName')}</th><th>{t('admin.email')}</th><th>{t('admin.role')}</th><th>{t('admin.status')}</th><th>{t('admin.region')}</th><th>{t('admin.tier')}</th><th className="text-end">{t('admin.balance')}</th><th>{t('admin.joined')}</th><th>{t('admin.action')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.length ? visibleUsers.map((user) => {
                  const credit = creditByEmail.get(user.email.toLowerCase());
                  return (
                    <tr key={user.id}>
                      <td><strong>{user.name}</strong></td>
                      <td>{user.email}</td>
                      <td>{user.role === 'admin' ? t('admin.administrator') : t('admin.client')}</td>
                      <td><StatusPill tone={user.status === 'active' ? 'success' : user.status === 'pending' ? 'warning' : 'critical'}>{statusLabel(user.status)}</StatusPill></td>
                       <td>{labelCountry(user.country ?? '', t)}</td>
                      <td>{user.tier}</td>
                      <td className="text-end">{credit?.balance ?? 0} U</td>
                      <td>{formatDateTime(user.joinedAt)}</td>
                      <td>{user.role !== 'admin' ? <button type="button" className="btn btn--danger btn--sm" onClick={() => deleteAccount(user.id)}><Trash2 size={14} />{t('admin.delete')}</button> : <span className="text-muted">{t('admin.adminProtected')}</span>}</td>
                    </tr>
                  );
                }) : <tr><td colSpan={9}><div className="empty-inline"><span>{t('admin.noAccounts')}</span></div></td></tr>}
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
                  <th>{t('admin.fullName')}</th>
                  <th>{t('admin.gmail')}</th>
                  <th>{t('auth.phone')}</th>
                  <th>{t('admin.region')}</th>
                  <th>{t('admin.status')}</th>
                  <th>{t('admin.submitted')}</th>
                  <th>{t('admin.action')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRegistrations.length ? visibleRegistrations.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.fullName}</strong></td>
                    <td>{item.gmail}</td>
                    <td>{item.phone}</td>
                     <td>{labelCountry(item.country, t)}</td>
                    <td><StatusPill tone={item.status === 'approved' ? 'success' : item.status === 'pending' ? 'warning' : 'critical'}>{statusLabel(item.status)}</StatusPill></td>
                    <td>{formatDateTime(item.submittedAt)}</td>
                    <td>{item.status === 'rejected' ? <span className="text-muted">{t('admin.blacklisted')}</span> : <button type="button" className="btn btn--danger btn--sm" onClick={() => void blacklistAccount(item.id)}>{t('admin.declineBlacklist')}</button>}</td>
                  </tr>
                )) : <tr><td colSpan={7}><div className="empty-inline"><span>{t('admin.noRegistrations')}</span></div></td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {tab === 'Deposit Review' ? (
        <FundingReviewPanel
          kind="deposit"
          requests={visibleFundingRequests.filter((request) => request.kind === 'deposit')}
          t={t}
          onReview={reviewFunding}
          onDelete={deleteFundingHistory}
          onClearHistory={clearFundingHistoryForKind}
          message={fundingMessage}
        />
      ) : null}

      {tab === 'Withdrawal Review' ? (
        <FundingReviewPanel
          kind="withdraw"
          requests={visibleFundingRequests.filter((request) => request.kind === 'withdraw')}
          t={t}
          onReview={reviewFunding}
          onDelete={deleteFundingHistory}
          onClearHistory={clearFundingHistoryForKind}
          message={fundingMessage}
        />
      ) : null}

      {tab === 'U Management' ? (
        <section className="content-grid content-grid--two admin-u-grid">
          <article className="panel credit-admin">
            <div className="panel__head">
              <div>
                <h2>{t('admin.uAllocation')}</h2>
                <p>{t('admin.uAllocationHint')}</p>
              </div>
              <StatusPill tone={grantAccount || grantUser ? 'success' : 'warning'}>{grantAccount || grantUser ? t('admin.accountSelected') : t('admin.selectAccount')}</StatusPill>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>{t('admin.accountEmailName')}</span>
                <input value={grantTarget} onChange={(event) => setGrantTarget(event.target.value)} placeholder={t('admin.searchAccount')} />
              </label>
              <label className="field">
                <span>{t('admin.adjustU')}</span>
                <input type="number" min="1" step="1" value={grantAmount} onChange={(event) => setGrantAmount(Number(event.target.value))} />
              </label>
            </div>
            <p className="field-hint">{t('admin.adjustUHint')}</p>
            <div className="admin-u-actions">
              <button type="button" className="btn btn--primary" onClick={() => void adjustUForTarget(1)} disabled={!grantLookup || (!grantAccount && !grantUser) || grantAmount <= 0}>
                <PlusCircle size={16} /> {t('admin.increaseU')}
              </button>
              <button type="button" className="btn btn--danger" onClick={() => void adjustUForTarget(-1)} disabled={!grantLookup || (!grantAccount && !grantUser) || grantAmount <= 0}>
                <MinusCircle size={16} /> {t('admin.decreaseU')}
              </button>
            </div>
            {creditMessage ? <div className="notice-banner">{creditMessage}</div> : null}
            <div className="table-wrap">
              <table className="table table--interactive">
                <thead>
                  <tr>
                    <th>{t('admin.accountEmailName')}</th><th>{t('auth.email')}</th><th className="text-end">{t('admin.balance')}</th><th className="text-end">{t('admin.available')}</th><th className="text-end">{t('admin.pending')}</th><th>{t('admin.select')}</th>
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
                           {t('admin.select')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel admin-u-review-panel">
            <div className="panel__head">
              <div>
                <h2>{t('admin.uReview')}</h2>
                <p>{t('admin.uReviewHint')}</p>
              </div>
              <StatusPill tone={pendingCreditRequests.length ? 'warning' : 'muted'}>{pendingCreditRequests.length} {t('admin.pending')}</StatusPill>
            </div>
            {admin.data.creditRequests.length ? (
              <div className="stack-list admin-u-review-list">
                {admin.data.creditRequests.map((request) => (
                  <div key={request.id} className="stack-list__row admin-u-review-row">
                    <div>
                      <strong>{request.userName} / {request.amount} U</strong>
                      <span>{request.email}</span>
                      <span>{request.reason}</span>
                    </div>
                    <div className="stack-list__meta">
                       <StatusPill tone={request.status === 'approved' ? 'success' : request.status === 'pending' ? 'warning' : 'critical'}>{statusLabel(request.status)}</StatusPill>
                      {request.status === 'pending' ? (
                        <div className="admin-credit-actions">
                          <button type="button" className="btn btn--primary btn--sm" onClick={() => void reviewCreditRequest(request.id, 'approve')}>
                            <HandCoins size={14} /> {t('admin.approve')}
                          </button>
                          <button type="button" className="btn btn--danger btn--sm" onClick={() => void reviewCreditRequest(request.id, 'reject')}>
                            {t('admin.reject')}
                          </button>
                        </div>
                      ) : (
                        <span>{request.reviewedAt ? formatDateTime(request.reviewedAt) : formatDateTime(request.requestedAt)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="state-block">
                <strong>{t('admin.noURequests')}</strong>
                <p>{t('admin.noURequestsHint')}</p>
              </div>
            )}
          </article>
        </section>
      ) : null}

      {tab === 'Ledger' ? (
        <article className="panel admin-ledger-panel">
          <div className="panel__head">
            <div><span className="eyebrow">{t('admin.ledgerEyebrow')}</span><h2>{t('admin.ledgerWorkspaceTitle')}</h2><p>{t('admin.ledgerWorkspaceHint')}</p></div>
            <div className="history-actions"><StatusPill tone={visibleLedger.length ? 'info' : 'muted'}>{visibleLedger.length} {t('admin.records')}</StatusPill>{creditMessage ? <span className="field-hint">{creditMessage}</span> : null}</div>
          </div>
          <div className="table-wrap admin-ledger-scroll" tabIndex={0}>
            <table className="table table--interactive admin-ledger-table">
              <thead><tr><th>{t('admin.email')}</th><th>{t('admin.name')}</th><th>{t('ledger.type')}</th><th>{t('ledger.note')}</th><th>{t('ledger.time')}</th><th className="text-end">{t('ledger.amount')}</th><th>{t('ledger.status')}</th><th>{t('admin.action')}</th></tr></thead>
              <tbody>
                {visibleLedger.length ? visibleLedger.map((item) => <tr key={item.id}>
                  <td><strong>{item.userEmail ?? t('admin.deletedAccountLabel')}</strong><div className="text-small text-muted">{item.refId}</div></td>
                  <td>{item.userName ?? '—'}</td>
                  <td>{item.type === 'deposit' ? t('ledger.deposit') : item.type === 'withdraw' ? t('ledger.withdraw') : item.type === 'review' ? t('ledger.review') : t('ledger.transfer')}</td>
                  <td className="admin-ledger-table__note">{item.note || '—'}</td>
                  <td>{formatDateTime(item.time)}</td>
                  <td className="text-end"><strong>{item.amount.toFixed(2)} {item.currency}</strong></td>
                  <td><StatusPill tone={item.status === 'approved' || item.status === 'settled' ? 'success' : item.status === 'pending' ? 'warning' : 'critical'}>{statusLabel(item.status)}</StatusPill></td>
                  <td><button type="button" className="btn btn--danger btn--sm" onClick={() => void deleteLedger(item.id)}><Trash2 size={14} /> {t('admin.delete')}</button></td>
                </tr>) : <tr><td colSpan={8}><div className="empty-inline"><span>{t('admin.noFunding')}</span></div></td></tr>}
              </tbody>
            </table>
          </div>
        </article>
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
               <StatCard label={t('admin.tradeEvents')} value={String(visibleTradeEvents.length)} note={t('admin.crossDeviceAudit')} />
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
               <div><h2>{t('admin.tradeAuditTitleShort')}</h2><p>{t('admin.tradeAuditHintShort')}</p></div>
               <StatusPill tone={visibleTradeEvents.length ? 'info' : 'muted'}>{visibleTradeEvents.length}{t('admin.events')}</StatusPill>
            </div>
            <div className="stack-list">
              {visibleTradeEvents.length ? visibleTradeEvents.map((item) => (
                <div key={item.id} className="stack-list__row">
                  <div>
                     <strong>{item.userName ?? item.userEmail ?? item.userId} / {item.symbol} {sideLabel(item.side)}</strong>
                     <span>{tradeActionLabel(item.action)} · {item.lots} {t('ledger.lots')} · {formatMarketCurrency(item.price)}</span>
                  </div>
                   <div className="stack-list__meta"><StatusPill tone={item.action === 'open' ? 'success' : item.action === 'risk-update' ? 'info' : item.action === 'liquidation' ? 'critical' : 'warning'}>{tradeActionLabel(item.action)}</StatusPill><span>{formatDateTime(item.createdAt)}</span></div>
                </div>
               )) : <div className="state-block"><strong>{t('admin.noCrossDeviceTradeEvents')}</strong><p>{t('admin.noCrossDeviceTradeEventsHint')}</p></div>}
            </div>
          </article>
          <article className="panel">
             <div className="panel__head"><div><h2>{t('admin.currentPaperPositions')}</h2><p>{t('admin.currentPaperPositionsHint')}</p></div></div>
            <div className="stack-list">
              {visiblePositions.map((item) => (
                 <div key={item.id} className="stack-list__row">
                   <div><strong>{item.userName ?? item.userId ?? t('ui.unknown')} / {item.symbol} {sideLabel(item.side)}</strong><span>{item.lots} {t('ledger.lots')} / {t('market.leverage')} {item.leverage}x / {t('market.entry')} {formatMarketCurrency(item.entryPrice)}</span></div>
                  <div className="stack-list__meta"><StatusPill tone={item.margin < 1000 ? 'success' : item.margin < 3000 ? 'warning' : 'critical'}>{formatCurrency(item.margin)}</StatusPill><span>{formatDateTime(item.openedAt)}</span></div>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {tab === 'Order Management' ? (
        <section className="content-grid content-grid--two admin-order-grid">
          <article className="panel admin-order-hero">
            <div className="panel__head">
              <div><span className="eyebrow"><ClipboardCheck size={13} /> {t('admin.orderManagementEyebrow')}</span><h2>{t('admin.orderManagementTitle')}</h2><p>{t('admin.orderManagementHint')}</p></div>
              <StatusPill tone={visibleTimedScenarios.some((item) => item.status === 'active') ? 'warning' : 'muted'}>{visibleTimedScenarios.filter((item) => item.status === 'active').length} {t('admin.active')}</StatusPill>
            </div>
            <div className="admin-order-status-note"><Clock3 size={15} /><span>{t('admin.orderServerResolution')}</span></div>
            {timedScenarioNoteMessage ? <div className="admin-order-note-feedback" role="status" aria-live="polite"><FileText size={14} /> <span>{timedScenarioNoteMessage}</span></div> : null}
            <div className="metric-grid metric-grid--compact admin-order-metrics">
              <StatCard label={t('admin.orderTotal')} value={String(visibleTimedScenarios.length)} note={t('admin.crossDeviceAudit')} />
              <StatCard label={t('admin.orderActive')} value={String(visibleTimedScenarios.filter((item) => item.status === 'active').length)} note={t('admin.orderAwaitingExpiry')} />
              <StatCard label={t('admin.orderSettled')} value={String(visibleTimedScenarios.filter((item) => item.status === 'settled').length)} note={t('admin.orderAutoResolved')} />
            </div>
          </article>
          <article className="panel">
            <div className="panel__head"><div><h2>{t('admin.orderQueueTitle')}</h2><p>{t('admin.orderQueueHint')}</p></div><StatusPill tone="info">{visibleTimedScenarios.length} {t('admin.records')}</StatusPill></div>
            <div className="admin-order-list">
              {visibleTimedScenarios.length ? visibleTimedScenarios.map((scenario) => {
                const active = scenario.status === 'active';
                const remaining = timedScenarioRemainingSeconds(scenario, adminNow);
                const running = active && remaining > 0;
                const progress = timedScenarioProgress(scenario, adminNow);
                const direction = scenario.direction === 'up' ? t('market.scenarioUp') : t('market.scenarioDown');
                const result = scenario.status === 'settled' ? (scenario.result === 'confirmed' ? t('market.scenarioSuccess') : scenario.result === 'flat' ? t('market.scenarioFlat') : t('market.scenarioFailure')) : scenario.status === 'void' ? t('market.scenarioCancelled') : t('market.scenarioWaiting');
                return (
                  <div key={scenario.id} id={`admin-order-record-${scenario.id}`} className={`admin-order-record ${running ? 'admin-order-record--running' : ''} ${timedScenarioNoteEditorId === scenario.id ? 'admin-order-record--editing' : ''}`}>
                    <div className="admin-order-row">
                    <div className="admin-order-row__main">
                      <div className="admin-order-row__title"><strong>{scenario.symbol}</strong><span>{direction}</span><StatusPill tone={running ? 'warning' : scenario.result === 'confirmed' ? 'success' : scenario.status === 'void' ? 'critical' : 'info'}>{result}</StatusPill></div>
                      <span>{scenario.userName} · {scenario.userEmail}</span>
                      <span>{t('admin.orderReference')} {formatMarketCurrency(scenario.referencePrice)} · {t('market.scenarioScale')} {scenario.observationPoints} · {formatDateTime(scenario.createdAt)}</span>
                      {running ? <div className="admin-order-progress"><span style={{ width: `${progress}%` }} /></div> : null}
                      <div className="admin-order-row__details">
                        {running ? <span><Clock3 size={13} /> {t('admin.orderRemaining')} {formatAdminCountdown(remaining)}</span> : null}
                        <span>{t('admin.orderExpiresAt')} {formatDateTime(scenario.expiresAt)}</span>
                        {scenario.settledAt ? <span>{t('admin.orderSettledAt')} {formatDateTime(scenario.settledAt)}</span> : null}
                        {scenario.voidReason ? <span>{t('admin.orderVoidReason')} {scenario.voidReason}</span> : null}
                      </div>
                    </div>
                    <div className="admin-order-row__actions">
                      {scenario.settlementPrice ? <span>{t('admin.orderExpiry')} {formatMarketCurrency(scenario.settlementPrice)}</span> : null}
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedTimedScenarioId(scenario.id)}><Eye size={14} /> {t('admin.orderResult')}</button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => openTimedScenarioNoteEditor(scenario)}><FileText size={14} /> {scenario.adminNote ? t('admin.editNote') : t('admin.addNote')}</button>
                      {running ? <button type="button" className="btn btn--danger btn--sm" onClick={() => void voidTimedScenario(scenario)}><XCircle size={14} /> {t('admin.orderVoid')}</button> : null}
                    </div>
                    </div>
                    {timedScenarioNoteEditorId === scenario.id ? (
                      <div className="admin-order-note-editor">
                        <label className="field">
                          <span>{t('admin.orderNoteLabel')}</span>
                          <textarea value={timedScenarioNoteDraft} maxLength={600} rows={5} onChange={(event) => setTimedScenarioNoteDraft(event.target.value)} placeholder={t('admin.orderNotePlaceholder')} />
                        </label>
                        <div className="admin-order-note-editor__footer">
                          <span>{timedScenarioNoteDraft.length} / 600</span>
                          <div>
                            <button type="button" className="btn btn--ghost btn--sm" onClick={cancelTimedScenarioNote}>{t('admin.cancel')}</button>
                            <button type="button" className="btn btn--primary btn--sm" onClick={() => void saveTimedScenarioNote(scenario)} disabled={timedScenarioNoteSavingId === scenario.id}>
                              {timedScenarioNoteSavingId === scenario.id ? t('admin.saving') : t('admin.saveNote')}
                            </button>
                          </div>
                        </div>
                        <small>{t('admin.orderNoteVisibility')}</small>
                      </div>
                    ) : scenario.adminNote ? (
                      <div className="admin-order-note-preview"><FileText size={13} /><span><strong>{t('admin.orderNoteLabel')}</strong>{scenario.adminNote}</span></div>
                    ) : null}
                  </div>
                );
              }) : <div className="state-block"><strong>{t('admin.orderNoRecords')}</strong><p>{t('admin.orderNoRecordsHint')}</p></div>}
            </div>
          </article>
        </section>
      ) : null}

      {tab === 'Activity & Alerts' ? (
        <section className="content-grid content-grid--two">
          <article className="panel">
            <div className="panel__head"><div><h2>{t('admin.notificationsTitle')}</h2><p>{t('admin.notificationsHint')}</p></div><StatusPill tone={visibleNotifications.length ? 'info' : 'muted'}>{visibleNotifications.length} {t('admin.records')}</StatusPill></div>
            <div className="stack-list">
              {visibleNotifications.length ? visibleNotifications.map((item) => (
                <div key={item.id} className="stack-list__row">
                  <div><strong>{item.title}</strong><span>{item.body}</span></div>
                  <div className="stack-list__meta"><StatusPill tone={item.read ? 'muted' : 'warning'}>{item.read ? t('admin.read') : t('admin.unread')}</StatusPill><span>{formatDateTime(item.createdAt)}</span></div>
                </div>
              )) : <div className="state-block"><strong>{t('admin.noNotifications')}</strong><p>{t('admin.notificationsHint')}</p></div>}
            </div>
          </article>
          <article className="panel">
            <div className="panel__head"><div><h2>{t('admin.marketSync')}</h2><p>{t('admin.marketStatusHint')}</p></div></div>
            <div className="stack-list">
              <div className="stack-list__row"><div><strong>{t('admin.marketSync')}</strong><span>{t('admin.marketStatusHint')}</span></div><div className="stack-list__meta"><StatusPill tone={admin.data.marketStatus.status === 'healthy' ? 'success' : admin.data.marketStatus.status === 'degraded' ? 'warning' : 'critical'}>{admin.data.marketStatus.status === 'healthy' ? t('admin.healthy') : admin.data.marketStatus.status === 'degraded' ? t('admin.monitoring') : t('admin.offline')}</StatusPill><span>{admin.data.marketStatus.quoteCount} {t('admin.instruments')}</span></div></div>
              <div className="stack-list__row"><div><strong>{t('admin.dataPath')}</strong><span>{t('admin.dataPathHint')}</span></div><div className="stack-list__meta"><StatusPill tone="info">{t('admin.connected')}</StatusPill><span>{admin.data.marketStatus.cacheSeconds}s</span></div></div>
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
          <section className="admin-content-editor" data-content-key="market-observation-copy">
            <div className="admin-content-editor__head">
              <div className="admin-content-editor__title">
                <FileText size={19} aria-hidden="true" />
                <div>
                  <h3>{t('admin.contentEditorTitle')}</h3>
                  <p>{t('admin.contentEditorHint')}</p>
                </div>
              </div>
              <StatusPill tone={serverContentSettings.size ? 'success' : 'warning'}>{serverContentSettings.size ? t('admin.connected') : t('admin.monitoring')}</StatusPill>
            </div>
            <div className="admin-content-editor__sections">
              {contentFields.map(({ key, label, location, rows }) => (
                <section className="admin-content-editor__section" key={key}>
                  <div className="admin-content-editor__section-head">
                    <div><strong>{label}</strong><span>{location}</span></div>
                    <code>{key}</code>
                  </div>
                  <div className="form-grid admin-content-editor__fields">
                    <label className="field"><span>{t('admin.contentChinese')}</span><textarea rows={rows} value={contentDraft[key].zh} onChange={(event) => { setContentDirty(true); setContentMessage(''); setContentDraft((current) => ({ ...current, [key]: { ...current[key], zh: event.target.value } })); }} /></label>
                    <label className="field"><span>{t('admin.contentMalay')}</span><textarea rows={rows} value={contentDraft[key].ms} onChange={(event) => { setContentDirty(true); setContentMessage(''); setContentDraft((current) => ({ ...current, [key]: { ...current[key], ms: event.target.value } })); }} /></label>
                    <label className="field"><span>{t('admin.contentEnglish')}</span><textarea rows={rows} value={contentDraft[key].en} onChange={(event) => { setContentDirty(true); setContentMessage(''); setContentDraft((current) => ({ ...current, [key]: { ...current[key], en: event.target.value } })); }} /></label>
                  </div>
                </section>
              ))}
            </div>
            <div className="admin-content-editor__footer">
              <span className="field-hint">{t('admin.contentEditorFieldHint')}{serverContentSettings.get(MARKET_SCENARIO_WORKSPACE_SAFETY_KEY)?.updatedAt ? ` · ${formatDateTime(serverContentSettings.get(MARKET_SCENARIO_WORKSPACE_SAFETY_KEY)?.updatedAt ?? '')}` : ''}</span>
              <div className="admin-content-editor__actions">
                <button type="button" className="btn btn--primary" onClick={() => void saveContentSettings()} disabled={!contentDirty || contentSaving}>
                  {contentSaving ? <Clock3 size={15} className="spin" /> : <FileText size={15} />}
                  {t('admin.saveContent')}
                </button>
                {contentMessage ? <span className="admin-content-editor__message" role="status">{contentMessage}</span> : null}
              </div>
            </div>
          </section>
          <div className="stack-list">
            {newsItems.slice(0, 6).map((item) => (
              <div key={item.id} className="stack-list__row">
                <div>
                  <strong>{item.title}</strong>
                   <span>{labelNewsCategory(item.category, t)} / {item.source}</span>
                </div>
                <div className="stack-list__meta">
                   <StatusPill tone={item.tone === 'positive' ? 'success' : item.tone === 'alert' ? 'critical' : 'info'}>{labelNewsSentiment(item.tone, t)}</StatusPill>
                  <span>{formatDateTime(item.publishedAt)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('admin.key')}</th><th>{t('admin.value')}</th><th>{t('admin.scope')}</th>
                </tr>
              </thead>
              <tbody>
                {admin.data.configs.map((config) => (
                  <tr key={config.key}>
                    <td>{config.key}</td>
                     <td>{config.value.includes('://') || config.value.startsWith('http') ? t('admin.configuredServerSide') : config.value}</td>
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
            <div className="panel__head"><div><h2>{t('admin.approvalTitle')}</h2><p>{t('admin.approvalFlowHint')}</p></div></div>
            <div className="stack-list">
              {admin.data.approvals.length ? admin.data.approvals.map((approval) => (
                <div key={approval.id} className="stack-list__row">
                  <div><strong>{approval.subject}</strong><span>{approval.owner}</span></div>
                  <div className="stack-list__meta"><StatusPill tone={approval.status === 'approved' ? 'success' : approval.status === 'pending' ? 'warning' : 'critical'}>{approval.status === 'approved' ? t('admin.autoApproved') : approval.status === 'rejected' ? t('admin.blacklisted') : t('admin.pendingStatus')}</StatusPill><span>{formatDateTime(approval.updatedAt)}</span></div>
                </div>
              )) : <div className="state-block"><strong>{t('admin.noApproval')}</strong><p>{t('admin.noApprovalHint')}</p></div>}
            </div>
          </article>
          <article className="panel">
            <div className="panel__head"><div><h2>{t('admin.blacklistTitle')}</h2><p>{t('admin.blacklistHint')}</p></div><StatusPill tone={admin.data.blacklist.length ? 'critical' : 'muted'}>{admin.data.blacklist.length}{t('admin.records')}</StatusPill></div>
            <div className="stack-list">
              {admin.data.blacklist.slice(0, 5).map((entry) => <div key={entry.id} className="stack-list__row"><div><strong>{entry.name}</strong><span>{entry.email}</span></div><div className="stack-list__meta"><StatusPill tone="critical">{t('admin.blacklisted')}</StatusPill><span>{formatDateTime(entry.blacklistedAt)}</span></div></div>)}
              {!admin.data.blacklist.length ? <div className="state-block"><strong>{t('admin.noBlacklist')}</strong><p>{t('admin.blacklistHint')}</p></div> : null}
            </div>
          </article>
        </section>
      ) : null}

      {tab === 'Blacklist' ? (
        <article className="panel">
          <div className="panel__head"><div><h2>{t('admin.blacklistTitle')}</h2><p>{t('admin.blacklistFullHint')}</p></div><StatusPill tone={visibleBlacklist.length ? 'critical' : 'muted'}>{visibleBlacklist.length}{t('admin.records')}</StatusPill></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('admin.name')}</th><th>{t('admin.email')}</th><th>{t('admin.phone')}</th><th>{t('admin.region')}</th><th>{t('admin.reason')}</th><th>{t('admin.blacklistColumn')}</th><th>{t('admin.action')}</th></tr></thead>
              <tbody>
                 {visibleBlacklist.length ? visibleBlacklist.map((entry) => <tr key={entry.id}><td><strong>{entry.name}</strong></td><td>{entry.email}</td><td>{entry.phone}</td><td>{labelCountry(entry.country, t)}</td><td>{entry.reason}</td><td>{formatDateTime(entry.blacklistedAt)}</td><td><button type="button" className="btn btn--ghost btn--sm" onClick={() => void restoreBlacklist(entry.id)}>{t('admin.restoreAccess')}</button></td></tr>) : <tr><td colSpan={7}><div className="empty-inline"><span>{t('admin.noBlacklist')}</span></div></td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
      {selectedTimedScenario ? <TimedScenarioResultDialog scenario={selectedTimedScenario} now={adminNow} onClose={() => setSelectedTimedScenarioId(null)} /> : null}
    </div>
  );
}
