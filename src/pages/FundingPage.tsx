import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Building2, CheckCircle2, Clock3, Headphones, Landmark, ShieldCheck, WalletCards } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState, StatCard, StatusPill } from '@/components/Stats';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { createFundingRequest, loadFundingRate, loadFundingRequests } from '@/lib/funding';
import { loadRemoteCreditAccount } from '@/lib/credits';
import type { FundingKind, FundingMethod, FundingRequest } from '@/types';
import { useLanguage } from '@/context/language-context';
import { useAuth } from '@/context/auth-context';
import { useContentSettings } from '@/context/content-settings-context';
import { FUNDING_PROCESSING_NOTE_KEY, FUNDING_REVIEW_SAFETY_KEY } from '@/lib/content-settings';

const filters = ['All', 'deposit', 'withdraw'] as const;

const filterKeys: Record<(typeof filters)[number], string> = {
  All: 'ledger.allActivity',
  deposit: 'funding.deposit',
  withdraw: 'funding.withdraw',
};

const statusKeys: Record<FundingRequest['status'], string> = {
  approved: 'status.approved',
  pending: 'status.pending',
  rejected: 'status.rejected',
};

const bankOptions = [
  { id: 'Maybank', logo: '/assets/banks/maybank.png' },
  { id: 'CIMB Bank', logo: '/assets/banks/cimb.png' },
  { id: 'Public Bank', logo: '/assets/banks/public-bank.png' },
  { id: 'RHB Bank', logo: '/assets/banks/rhb.png' },
  { id: 'Bank Rakyat', logo: '/assets/banks/bank-rakyat.png' },
  { id: 'Bank Islam', logo: '/assets/banks/bank-islam.png' },
  { id: 'AmBank', logo: '/assets/banks/ambank.png' },
  { id: 'Alliance Bank', logo: '/assets/banks/alliance-bank.png' },
  { id: 'UOB Malaysia', logo: '/assets/banks/uob.png' },
  { id: 'OCBC Malaysia', logo: '/assets/banks/ocbc.png' },
  { id: 'Standard Chartered', logo: '/assets/banks/standard-chartered.png' },
  { id: 'Bank Muamalat', logo: '/assets/banks/bank-muamalat.png' },
] as const;

function fundingMethodName(request: FundingRequest, t: (key: string) => string) {
  return request.method === 'tng' ? t('funding.tng') : request.bankName || t('funding.bankSupport');
}

export function FundingPage() {
  const { t } = useLanguage();
  const { language } = useLanguage();
  const { getContent } = useContentSettings();
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
  const [customerNote, setCustomerNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const funding = useAsyncResource(async () => {
    const [rate, requests] = await Promise.all([loadFundingRate(), loadFundingRequests()]);
    return { rate, requests };
  }, [refreshKey]);
  const credit = useAsyncResource(() => session ? loadRemoteCreditAccount(session) : Promise.resolve(null), [session?.id, refreshKey]);

  const filteredRequests = useMemo(() => {
    if (funding.status !== 'success') return [];
    return funding.data.requests.filter((request) => filter === 'All' || request.kind === filter);
  }, [filter, funding]);

  if (funding.status === 'loading' || credit.status === 'loading') return <LoadingState label={t('ledger.loading')} />;
  if (funding.status === 'error' || credit.status === 'error') {
    return <div className="state-block state-block--error"><strong>{t('ledger.error')}</strong><p>{funding.error ?? credit.error}</p></div>;
  }
  if (funding.status !== 'success' || credit.status !== 'success') return <LoadingState label={t('ledger.loading')} />;

  const { rate, requests } = funding.data;
  const selectedBank = bankOptions.find((bank) => bank.id === bankName) ?? bankOptions[0];
  const approvedDeposits = requests.filter((request) => request.kind === 'deposit' && request.status === 'approved');
  const approvedWithdrawals = requests.filter((request) => request.kind === 'withdraw' && request.status === 'approved');
  const pending = requests.filter((request) => request.status === 'pending');
  const depositU = approvedDeposits.reduce((sum, request) => sum + request.amountU, 0);
  const withdrawalU = approvedWithdrawals.reduce((sum, request) => sum + request.amountU, 0);
  const enteredAmount = Number(amountInput) || 0;
  const quoteRate = flow === 'deposit' ? rate.depositRate : rate.withdrawalRate;
  const previewU = flow === 'deposit' ? enteredAmount / quoteRate : enteredAmount;
  const previewMyr = flow === 'deposit' ? enteredAmount : enteredAmount * quoteRate;
  const minimumAmount = flow === 'deposit' ? 100 : 25;
  const requiresAccountDetails = flow === 'withdraw';
  const validAccountDetails = !requiresAccountDetails || (accountHolder.trim().length >= 2 && accountReference.length >= 7);
  const validPreview = Number.isFinite(previewU) && previewU > 0 && Number.isFinite(previewMyr)
    && (flow === 'deposit' ? previewMyr >= minimumAmount : previewU >= minimumAmount) && validAccountDetails;

  const submitFunding = async () => {
    if (!validPreview || busy) {
      setFeedback({ tone: 'error', message: validAccountDetails ? t('funding.invalidAmount') : t('funding.accountDetailsRequired') });
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
        accountHolder: requiresAccountDetails ? accountHolder.trim() : undefined,
        accountReference: requiresAccountDetails ? accountReference : undefined,
        customerNote: customerNote.trim() || undefined,
        supportRequired: method === 'bank',
      });
      setFeedback({ tone: 'success', message: method === 'bank' ? t('funding.supportQueued') : t('funding.requestQueued') });
      setRefreshKey((value) => value + 1);
      setCustomerNote('');
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
          <span className="funding-center__state"><span className="status-dot status-dot--live" /> {t('funding.rateDaily')}</span>
        </div>
        <div className="funding-rate-grid">
          <div className="funding-rate-grid__deposit"><span>{t('funding.depositRate')}</span><strong>RM {rate.depositRate.toFixed(4)}</strong><small>{t('funding.perU')}</small></div>
          <div className="funding-rate-grid__withdraw"><span>{t('funding.withdrawalRate')}</span><strong>RM {rate.withdrawalRate.toFixed(4)}</strong><small>{t('funding.perU')}</small></div>
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
              <span className="funding-flow-switch__icon funding-flow-switch__icon--deposit"><ArrowDownLeft size={18} /></span><span><strong>{t('funding.deposit')}</strong></span>
            </button>
            <button type="button" role="tab" aria-selected={flow === 'withdraw'} className={flow === 'withdraw' ? 'is-active' : ''} onClick={() => { setFlow('withdraw'); setFeedback(null); }}>
              <span className="funding-flow-switch__icon funding-flow-switch__icon--withdraw"><ArrowUpRight size={18} /></span><span><strong>{t('funding.withdraw')}</strong></span>
            </button>
          </div>

          <div className="funding-section-head"><div><span className="eyebrow">{t('funding.stepOne')}</span><h2>{t('funding.chooseMethod')}</h2></div><span>{t('funding.methodHint')}</span></div>
          {method === 'bank' ? <div className="funding-processing-note"><Headphones size={16} /><span>{getContent(FUNDING_PROCESSING_NOTE_KEY, language)}</span></div> : null}
          <div className="payment-method-grid">
            <button type="button" className={`payment-method payment-method--tng ${method === 'tng' ? 'is-selected' : ''}`} onClick={() => { setMethod('tng'); setFeedback(null); }}>
              <span className="payment-method__logo payment-method__logo--tng"><WalletCards size={14} /><b>TNG</b></span><span><strong>{t('funding.tng')}</strong><small>{t('funding.tngHint')}</small></span>{method === 'tng' ? <CheckCircle2 size={18} /> : null}
            </button>
            {bankOptions.map((bank) => (
              <button key={bank.id} type="button" className={`payment-method payment-method--bank ${method === 'bank' && bankName === bank.id ? 'is-selected' : ''}`} onClick={() => { setMethod('bank'); setBankName(bank.id); setFeedback(null); }}>
                <span className="payment-method__logo payment-method__logo--bank-logo"><img src={bank.logo} alt="" loading="lazy" decoding="async" /></span><span><strong>{bank.id}</strong><small>{t('funding.bankAssisted')}</small></span>{method === 'bank' && bankName === bank.id ? <CheckCircle2 size={18} /> : null}
              </button>
            ))}
          </div>

          <div className="funding-section-head funding-section-head--amount"><div><span className="eyebrow">{t('funding.stepTwo')}</span><h2>{t('funding.enterAmount')}</h2></div></div>
          <div className="funding-form-grid">
            <label className="field funding-field--amount"><span>{flow === 'deposit' ? t('funding.amountMyr') : t('funding.amountU')}</span><div className="funding-amount-input"><span>{flow === 'deposit' ? 'MYR' : 'U'}</span><input inputMode="decimal" type="number" min={minimumAmount} step={flow === 'deposit' ? '1' : '0.01'} value={amountInput} onChange={(event) => setAmountInput(event.target.value)} /></div></label>
            {requiresAccountDetails ? <>
              <label className="field"><span>{t('funding.accountHolder')}</span><input autoComplete="off" value={accountHolder} maxLength={80} onChange={(event) => setAccountHolder(event.target.value)} placeholder={t('funding.accountHolderPlaceholder')} /></label>
              <label className="field"><span>{method === 'tng' ? t('funding.walletReference') : t('funding.accountReference')}</span><input autoComplete="off" inputMode="numeric" value={accountReference} maxLength={24} onChange={(event) => setAccountReference(event.target.value.replace(/\D/g, '').slice(0, 24))} placeholder={method === 'tng' ? t('funding.walletReferencePlaceholder') : t('funding.accountReferencePlaceholder')} /><small className="field-hint">{t('funding.accountDetailsHint')}</small></label>
            </> : null}
            <label className="field funding-note-field"><span>{t('funding.requestNote')}</span><textarea value={customerNote} maxLength={320} rows={3} onChange={(event) => setCustomerNote(event.target.value)} placeholder={t('funding.requestNotePlaceholder')} /><small className="field-hint">{t('funding.requestNoteHint')}</small></label>
          </div>
          {feedback ? <div className={`notice-banner ${feedback.tone === 'error' ? 'notice-banner--error' : ''}`}>{feedback.message}</div> : null}
        </div>

        <aside className="funding-quote-card">
          <div className="funding-quote-card__head"><span className="funding-quote-card__icon">{method === 'tng' ? <WalletCards size={18} /> : <Building2 size={18} />}</span><div><span className="eyebrow">{t('funding.stepThree')}</span><h2>{method === 'tng' ? t('funding.tngConfirmation') : t('funding.bankConfirmation')}</h2></div></div>
          {method === 'tng' ? <div className="funding-tng-reference"><div className="funding-tng-reference__glyph"><span>TNG</span><WalletCards size={28} /></div><div><strong>{t('funding.sandboxReference')}</strong><p>{t('funding.tngReferenceHint')}</p></div></div> : <div className="funding-bank-reference funding-bank-reference--visual"><img src={selectedBank.logo} alt="" loading="lazy" decoding="async" /><Landmark size={22} /><div><strong>{selectedBank.id}</strong><p>{t('funding.bankReferenceHint')}</p></div></div>}
          <div className="funding-conversion">
            <div><span>{flow === 'deposit' ? t('funding.youEnter') : t('funding.youRequest')}</span><strong>{flow === 'deposit' ? formatCurrency(previewMyr || 0, 'MYR') : `${(previewU || 0).toFixed(4)} U`}</strong></div>
            <div><span>{t('funding.lockedRate')}</span><strong>RM {quoteRate.toFixed(4)} / U</strong></div>
            <div className="funding-conversion__total"><span>{flow === 'deposit' ? t('funding.paperUToCredit') : t('funding.myrReviewValue')}</span><strong>{flow === 'deposit' ? `${(previewU || 0).toFixed(4)} U` : formatCurrency(previewMyr || 0, 'MYR')}</strong></div>
          </div>
          <div className="funding-quote-card__safety"><ShieldCheck size={15} /><span>{getContent(FUNDING_REVIEW_SAFETY_KEY, language)}</span></div>
          <button type="button" className="btn btn--primary btn--block" onClick={() => void submitFunding()} disabled={!validPreview || busy} aria-busy={busy}>{method === 'bank' ? t('funding.continueSupport') : flow === 'deposit' ? t('funding.submitDeposit') : t('funding.submitWithdrawal')}</button>
        </aside>
      </section>

      <section className="panel funding-request-panel">
        <div className="panel__head"><div><span className="eyebrow">{t('funding.requestTrail')}</span><h2>{t('funding.fundingLedger')}</h2><p>{t('funding.fundingLedgerHint')}</p></div><div className="chip-row">{filters.map((item) => <button key={item} type="button" className={`chip ${filter === item ? 'is-active' : ''}`} onClick={() => setFilter(item)}>{t(filterKeys[item])}</button>)}</div></div>
        <div className="table-wrap funding-history-scroll" tabIndex={0}><table className="table table--interactive funding-table"><thead><tr><th>{t('ledger.time')}</th><th>{t('ledger.type')}</th><th>{t('funding.method')}</th><th>{t('funding.requestNote')}</th><th className="text-end">{t('funding.myr')}</th><th className="text-end">{t('funding.paperU')}</th><th>{t('funding.rate')}</th><th>{t('ledger.status')}</th></tr></thead><tbody>
          {filteredRequests.length ? filteredRequests.map((request) => <tr key={request.id}><td>{formatDateTime(request.createdAt)}</td><td><strong>{request.kind === 'deposit' ? t('funding.deposit') : t('funding.withdraw')}</strong><div className="text-small text-muted">{request.supportRequired ? t('funding.supportReview') : t('funding.directReview')}</div></td><td>{fundingMethodName(request, t)}{request.accountReference ? <div className="text-small text-muted">{request.accountReference}</div> : null}</td><td className="funding-request-note">{request.customerNote || '—'}{request.reviewerNote ? <div className="text-small text-muted">{t('funding.reviewNote')}: {request.reviewerNote}</div> : null}</td><td className="text-end">{formatCurrency(request.amountMyr, 'MYR')}</td><td className="text-end"><strong>{request.amountU.toFixed(4)} U</strong></td><td>RM {request.rate.toFixed(4)} / U</td><td><StatusPill tone={request.status === 'approved' ? 'success' : request.status === 'pending' ? 'warning' : 'critical'}>{t(statusKeys[request.status])}</StatusPill></td></tr>) : <tr><td colSpan={8}><div className="empty-inline"><span>{t('funding.noRequests')}</span></div></td></tr>}
        </tbody></table></div>
      </section>
    </div>
  );
}
