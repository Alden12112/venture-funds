import { PageHeader } from '@/components/PageHeader';
import { SupportCenter } from '@/components/SupportCenter';
import { useLanguage } from '@/context/language-context';
import { useLocation } from 'react-router-dom';

export function SupportPage() {
  const { t } = useLanguage();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const isFundingContext = params.get('topic') === 'funding';
  const kind = params.get('kind') === 'withdraw' ? t('funding.withdraw') : t('funding.deposit');
  const bank = params.get('bank') || t('funding.bankSupport');
  const reference = params.get('request') || '—';
  const initialDraft = isFundingContext
    ? t('support.fundingDraft').replace('{context}', `${kind} · ${bank} · ${reference}`)
    : '';
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={t('support.clientCare')}
        title={t('support.contact')}
        description={t('support.clientDescription')}
      />
      <SupportCenter initialDraft={initialDraft} />
    </div>
  );
}
