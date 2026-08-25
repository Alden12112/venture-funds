import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Building2, CheckCircle2, Clock3, Landmark, ShieldCheck, WalletCards } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState, StatCard, StatusPill } from '@/components/Stats';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadLedgerBundle } from '@/adapters/ledger-adapter';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { apiFetch } from '@/lib/api';
import { createFundingRequest, loadFundingRate, loadFundingRequests } from '@/lib/funding';
import { loadRemoteCreditAccount } from '@/lib/credits';
import type { FundingKind, FundingMethod, FundingRequest, TradeAuditEvent } from '@/types';
import { useLanguage } from '@/context/language-context';
import { useAuth } from '@/context/auth-context';

const filters = ['All', 'deposit', 'withdraw'] as const;

const ledgerTypeKeys: Record<(typeof filters)[number], string> = {
  All: 'ledger.allActivity',
  deposit: 'ledger.deposit',
  withdraw: 'ledger.withdraw',
};

const statusKeys: Record<string, string> = {
  approved: 'status.approved',
  settled: 'status.settled',
  pending: 'status.pending',
  rejected: 'status.rejected',
};

const bankOptions = [
  { id: 'Maybank', initials: 'M', tone: 'maybank' },
  { id: 'CIMB Bank', initials: 'C', tone: 'cimb' },
  { id: 'Public Bank', initials: 'PB', tone: 'public' },
  { id: 'RHB Bank', initials: 'R', tone: 'rhb' },
  { id: 'Hong Leong Bank', initials: 'HL', tone: 'hlb' },
  { id: 'Bank Islam', initials: 'BI', tone: 'islam' },
] as const;

function fundingMethodName(request: FundingRequest, t: (key: string) => string) {
  return request.method === 'tng' ? t('funding.tng') : request.bankName || t('funding.bankSupport');
}

export function LedgerPage() {
  const { t } = useLanguage();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [filter, setFilter] = useState<(typeof filters)[number]>('All');
  const [flow, setFlow] = useState<FundingKind>('deposit');
  const [method, setMethod] = useState<FundingMethod>('tng');
  const [bankName, setBankName] = useState<(typeof bankOptions)[number]['id']>('Maybank');
  const [amountInput, setAmountInput] = useState('100');
  const [accountHolder, setAccountHolder] = useState('');
  const [accountReference, setAccountReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const ledger = useAsyncResource(() => loadLedgerBundle(), [refreshKey]);
  const trades = useAsyncResource(() => apiFetch<TradeAuditEvent[]>('/api/trades'), [refreshKey]);
  const funding = useAsyncResource(async () => {
    const [rate, requests] = await Promise.all([loadFundingRate(), loadFundingRequests()]);
    return { rate, requests };
  }, [refreshKey]);
  const credit = useAsyncResource(() => session ? loadRemoteCreditAccount(session) : Promise.resolve(null), [session?.id, refreshKey]);

  const filteredRequests = useMemo(() => {
    if (funding.status !== 'success') return [];
    return funding.data.requests.filter((request) => filter === 'All' || request.kind === filter);
  }, [filter, funding]);

  if (ledger.status === 'loading' || trades.status === 'loading' || funding.status === 'loading' || credit.status === 'loading') {
    return <LoadingState label={t('ledger.loading')} />;
  }

  if (ledger.status === 'error' || trades.status === 'error' || funding.status === 'error' || credit.status === 'error') {
    const error = ledger.error ?? trades.error ?? funding.error ?? credit.error;
    return <div className="state-block state-block--error"><strong>{t('ledger.error')}</strong><p>{error}</p></div>;
  }

  if (ledger.status !== 'success' || trades.status !== 'success' || funding.status !== 'success' || credit.status !== 'success') return <LoadingState label={t('ledger.loading')} />;

  const { rate, requests } = funding.data;
  const approvedDeposits = requests.filter((request) => request.kind === 'deposit' && request.status === 'approved');
  const approvedWithdrawals = requests.filter((request) => request.kind === 'withdraw' && request.status === 'approved');
  const pending = requests.filter((request) => request.status === 'pending');
  const depositU = approvedDeposits.reduce((sum, request) => sum + request.amountU, 0);
  const withdrawalU = approvedWithdrawals.reduce((sum, request) => sum + request.amountU, 0);
  const enteredAmount = Number(amountInput) || 0;
  const quoteRate = flow === 'deposit' ? rate.depositRate : rate.withdrawalRate;
  const previewU = flow === 'deposit' ? enteredAmount / quoteRate : enteredAmount;
  const previewMyr = flow === 'deposit' ? enteredAmount : enteredAmount * quoteRate;
  const validPreview = Number.isFinite(previewU) && previewU > 0 && Number.isFinite(previewMyr) && previewMyr >= 1;

  const submitFunding = async () => {
    if (!validPreview || busy) {
      setFeedback({ tone: 'error', message: t('funding.invalidAmount') });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const request = await createFundingRequest({
        kind: flow,
        method,
        amountMyr: flow === 'deposit' ? enteredAmount : undefined,
        amountU: flow === 'withdraw' ? enteredAmount : undefined,
        bankName: method === 'bank' ? bankName : undefined,
        accountHolder: method === 'bank' ? accountHolder : undefined,
        accountReference: method === 'bank' || flow === 'withdraw' ? accountReference : undefined,
        supportRequired: method === 'bank',
      });
      setFeedback({ tone: 'success', message: method === 'bank' ? t('funding.supportQueued') : t('funding.requestQueued') });
      setRefreshKey((value) => value + 1);
      if (method === 'bank') {
        const params = new URLSearchParams({ topic: 'funding', request: request.id, kind: flow, method: 'bank', bank: bankName });
        navigate(`/app/support?${params.toString()}`);
      }
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : t('funding.requestFailed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader eyebrow={t('funding.eyebrow')} title={t('funding.title')} description={t('funding.description')} />

      <section className="funding-center" aria-label={t('funding.title')}>
        <div className="funding-center__intro">
          <div><span className="eyebrow">{t('funding.rateDesk')}</span><h2>{t('funding.todayRate')}</h2><p>{t('funding.rateDescription')}</p></div>
          <span className={`funding-center__state funding-center__state--${rate.cacheState}`}><span className="status-dot status-dot--live" /> {t(rate.cacheState === 'fallback' ? 'funding.rateFallback' : 'funding.rateDaily')}</span>
        </div>
        <div className="funding-rate-grid">
          <div><span>{t('funding.baseRate')}</span><strong>RM {rate.baseRate.toFixed(4)}</strong><small>{t('funding.perU')}</small></div>
          <div className="funding-rate-grid__deposit"><span>{t('funding.depositRate')}</span><strong>RM {rate.depositRate.toFixed(4)}</strong><small>{t('funding.rateAdjustmentIn')}</small></div>
          <div className="funding-rate-grid__withdraw"><span>{t('funding.withdrawalRate')}</span><strong>RM {rate.withdrawalRate.toFixed(4)}</strong><small>{t('funding.rateAdjustmentOut')}</small></div>
        </div>
        <div className="funding-center__foot"><Clock3 size={14} /><span>{t('funding.rateLockedHint')}</span><span className="funding-center__dot">·</span><span>{formatDateTime(rate.updatedAt)}</span></div>
      </section>

      <section className="metric-grid metric-grid--compact">
        <StatCard label={t('ledger.totalFunding')} value={`${depositU.toFixed(2)} U`} note={t('funding.approvedDeposit')} />
        <StatCard label={t('ledger.totalWithdrawals')} value={`${withdrawalU.toFixed(2)} U`} note={t('funding.approvedWithdrawal')} />
        <StatCard label={t('ledger.inReview')} value={String(pending.length)} note={t('funding.staffReview')} />
        <StatCard label={t('funding.availablePaperU')} value={`${(credit.data?.available ?? 0).toFixed(2)} U`} note={t('funding.availablePaperUHint')} />
      </section>

      <section className="funding-workbench">
        <div className="funding-workbench__main">
          <div className="funding-flow-switch" role="tablist" aria-label={t('funding.chooseFlow')}>
            <button type="button" role="tab" aria-selected={flow === 'deposit'} className={flow === 'deposit' ? 'is-active' : ''} onClick={() => { setFlow('deposit'); setFeedback(null); }}>
              <span className="funding-flow-switch__icon funding-flow-switch__icon--deposit"><ArrowDownLeft size={18} /></span><span><strong>{t('funding.deposit')}</strong><small>{t('funding.depositHint')}</small></span>
            </button>
            <button type="button" role="tab" aria-selected={flow === 'withdraw'} className={flow === 'withdraw' ? 'is-active' : ''} onClick={() => { setFlow('withdraw'); setFeedback(null); }}>
              <span className="funding-flow-switch__icon funding-flow-switch__icon--withdraw"><ArrowUpRight size={18} /></span><span><strong>{t('funding.withdraw')}</strong><small>{t('funding.withdrawHint')}</small></span>
            </button>
          </div>

          <div className="funding-section-head"><div><span className="eyebrow">{t('funding.stepOne')}</span><h2>{t('funding.chooseMethod')}</h2></div><span>{t('funding.methodHint')}</span></div>
          <div className="payment-method-grid">
            <button type="button" className={`payment-method payment-method--tng ${method === 'tng' ? 'is-selected' : ''}`} onClick={() => { setMethod('tng'); setFeedback(null); }}>
              <span className="payment-method__logo payment-method__logo--tng">TNG</span><span><strong>{t('funding.tng')}</strong><small>{t('funding.tngHint')}</small></span>{method === 'tng' ? <CheckCircle2 size={18} /> : null}
            </button>
            {bankOptions.map((bank) => (
              <button key={bank.id} type="button" className={`payment-method payment-method--bank ${method === 'bank' && bankName === bank.id ? 'is-selected' : ''}`} onClick={() => { setMethod('bank'); setBankName(bank.id); setFeedback(null); }}>
                <span className={`payment-method__logo payment-method__logo--${bank.tone}`}>{bank.initials}</span><span><strong>{bank.id}</strong><small>{t('funding.bankAssisted')}</small></span>{method === 'bank' && bankName === bank.id ? <CheckCircle2 size={18} /> : null}
              </button>
            ))}
          </div>

          <div className="funding-section-head funding-section-head--amount"><div><span className="eyebrow">{t('funding.stepTwo')}</span><h2>{t('funding.enterAmount')}</h2></div><span>{flow === 'deposit' ? t('funding.depositAmountHint') : t('funding.withdrawalAmountHint')}</span></div>
          <div className="funding-form-grid">
            <label className="field funding-field--amount"><span>{flow === 'deposit' ? t('funding.amountMyr') : t('funding.amountU')}</span><div className="funding-amount-input"><span>{flow === 'deposit' ? 'MYR' : 'U'}</span><input inputMode="decimal" type="number" min="0" step={flow === 'deposit' ? '1' : '0.01'} value={amountInput} onChange={(event) => setAmountInput(event.target.value)} /></div></label>
            {method === 'bank' ? <><label className="field"><span>{t('funding.accountHolder')}</span><input value={accountHolder} maxLength={80} onChange={(event) => setAccountHolder(event.target.value)} placeholder={t('funding.accountHolderPlaceholder')} /></label><label className="field"><span>{t('funding.accountReference')}</span><input inputMode="numeric" value={accountReference} maxLength={4} onChange={(event) => setAccountReference(event.target.value.replace(/\D/g, '').slice(-4))} placeholder={t('funding.accountReferencePlaceholder')} /></label></> : flow === 'withdraw' ? <label className="field"><span>{t('funding.walletReference')}</span><input inputMode="numeric" value={accountReference} maxLength={4} onChange={(event) => setAccountReference(event.target.value.replace(/\D/g, '').slice(-4))} placeholder={t('funding.walletReferencePlaceholder')} /></label> : null}
          </div>
          {feedback ? <div className={`notice-banner ${feedback.tone === 'error' ? 'notice-banner--error' : ''}`}>{feedback.message}</div> : null}
        </div>

        <aside className="funding-quote-card">
          <div className="funding-quote-card__head"><span className="funding-quote-card__icon">{method === 'tng' ? <WalletCards size={18} /> : <Building2 size={18} />}</span><div><span className="eyebrow">{t('funding.stepThree')}</span><h2>{method === 'tng' ? t('funding.tngConfirmation') : t('funding.bankConfirmation')}</h2></div></div>
          {method === 'tng' ? <div className="funding-tng-reference"><div className="funding-tng-reference__glyph"><span>TNG</span><WalletCards size={28} /></div><div><strong>{t('funding.sandboxReference')}</strong><p>{t('funding.tngReferenceHint')}</p></div></div> : <div className="funding-bank-reference"><Landmark size={22} /><div><strong>{bankName}</strong><p>{t('funding.bankReferenceHint')}</p></div></div>}
          <div className="funding-conversion">
            <div><span>{flow === 'deposit' ? t('funding.youEnter') : t('funding.youRequest')}</span><strong>{flow === 'deposit' ? formatCurrency(previewMyr || 0, 'MYR') : `${(previewU || 0).toFixed(4)} U`}</strong></div>
            <div><span>{t('funding.lockedRate')}</span><strong>RM {quoteRate.toFixed(4)} / U</strong></div>
            <div className="funding-conversion__total"><span>{flow === 'deposit' ? t('funding.paperUToCredit') : t('funding.myrReviewValue')}</span><strong>{flow === 'deposit' ? `${(previewU || 0).toFixed(4)} U` : formatCurrency(previewMyr || 0, 'MYR')}</strong></div>
          </div>
          <div className="funding-quote-card__safety"><ShieldCheck size={15} /><span>{t('funding.sandboxNotice')}</span></div>
          <button type="button" className="btn btn--primary btn--block" onClick={() => void submitFunding()} disabled={!validPreview || busy} aria-busy={busy}>{method === 'bank' ? t('funding.continueSupport') : flow === 'deposit' ? t('funding.submitDeposit') : t('funding.submitWithdrawal')}</button>
        </aside>
      </section>

      <section className="panel funding-request-panel">
        <div className="panel__head"><div><span className="eyebrow">{t('funding.requestTrail')}</span><h2>{t('funding.fundingLedger')}</h2><p>{t('funding.fundingLedgerHint')}</p></div><div className="chip-row">{filters.map((item) => <button key={item} type="button" className={`chip ${filter === item ? 'is-active' : ''}`} onClick={() => setFilter(item)}>{t(ledgerTypeKeys[item])}</button>)}</div></div>
        <div className="table-wrap"><table className="table table--interactive funding-table"><thead><tr><th>{t('ledger.time')}</th><th>{t('ledger.type')}</th><th>{t('funding.method')}</th><th className="text-end">{t('funding.myr')}</th><th className="text-end">{t('funding.paperU')}</th><th>{t('funding.rate')}</th><th>{t('ledger.status')}</th></tr></thead><tbody>
          {filteredRequests.length ? filteredRequests.map((request) => <tr key={request.id}><td>{formatDateTime(request.createdAt)}</td><td><strong>{request.kind === 'deposit' ? t('funding.deposit') : t('funding.withdraw')}</strong><div className="text-small text-muted">{request.supportRequired ? t('funding.supportReview') : t('funding.directReview')}</div></td><td>{fundingMethodName(request, t)}{request.accountReference ? <div className="text-small text-muted">{request.accountReference}</div> : null}</td><td className="text-end">{formatCurrency(request.amountMyr, 'MYR')}</td><td className="text-end"><strong>{request.amountU.toFixed(4)} U</strong></td><td>RM {request.rate.toFixed(4)} / U</td><td><StatusPill tone={request.status === 'approved' ? 'success' : request.status === 'pending' ? 'warning' : 'critical'}>{t(statusKeys[request.status])}</StatusPill></td></tr>) : <tr><td colSpan={7}><div className="empty-inline"><span>{t('funding.noRequests')}</span></div></td></tr>}
        </tbody></table></div>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel"><div className="panel__head"><div><h2>{t('ledger.allActivity')}</h2><p>{t('ledger.description')}</p></div></div><div className="table-wrap"><table className="table table--interactive"><thead><tr><th>{t('ledger.time')}</th><th>{t('ledger.type')}</th><th className="text-end">{t('ledger.amount')}</th><th>{t('ledger.status')}</th><th>{t('ledger.note')}</th><th>{t('ledger.referenceId')}</th></tr></thead><tbody>
          {ledger.data.entries.length ? ledger.data.entries.map((entry) => <tr key={entry.id}><td>{formatDateTime(entry.time)}</td><td>{entry.type === 'deposit' ? t('funding.deposit') : entry.type === 'withdraw' ? t('funding.withdraw') : entry.type}</td><td className="text-end">{entry.amount.toFixed(2)} {entry.currency}</td><td><StatusPill tone={entry.status === 'approved' || entry.status === 'settled' ? 'success' : entry.status === 'pending' ? 'warning' : 'critical'}>{statusKeys[entry.status] ? t(statusKeys[entry.status]) : entry.status}</StatusPill></td><td>{entry.note}</td><td>{entry.refId}</td></tr>) : <tr><td colSpan={6}><div className="empty-inline"><span>{t('ledger.noFunding')}</span></div></td></tr>}
        </tbody></table></div></article>
        <article className="panel"><div className="panel__head"><div><h2>{t('ledger.tradeAudit')}</h2><p>{t('ledger.tradeAuditHint')}</p></div></div><div className="table-wrap"><table className="table"><thead><tr><th>{t('ledger.time')}</th><th>{t('ledger.instrument')}</th><th>{t('ledger.action')}</th><th>{t('ledger.lots')}</th><th className="text-end">{t('ledger.referencePrice')}</th><th className="text-end">{t('ledger.pnl')}</th></tr></thead><tbody>
          {trades.data.length ? trades.data.map((trade) => { const closed = trade.action === 'close' || trade.action === 'partial-close'; return <tr key={trade.id}><td>{formatDateTime(trade.createdAt)}</td><td><strong>{trade.symbol}</strong><div className="text-small text-muted">{trade.side === 'long' ? t('market.long') : t('market.short')}</div></td><td><StatusPill tone={closed ? 'info' : 'success'}>{trade.action === 'open' ? t('ledger.open') : trade.action === 'partial-close' ? t('ledger.partialClose') : trade.action === 'close' ? t('ledger.close') : t('ledger.riskUpdate')}</StatusPill></td><td>{trade.lots.toFixed(2)}</td><td className="text-end">{trade.price.toFixed(4)}</td><td className={`text-end ${trade.pnl == null ? 'text-muted' : trade.pnl >= 0 ? 'trend trend--up' : 'trend trend--down'}`}>{trade.pnl == null ? '—' : `${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)} U`}</td></tr>; }) : <tr><td colSpan={6}><div className="empty-inline"><span>{t('ledger.noTrades')}</span></div></td></tr>}
        </tbody></table></div></article>
      </section>
    </div>
  );
}
