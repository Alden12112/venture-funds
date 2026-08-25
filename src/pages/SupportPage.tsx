import { PageHeader } from '@/components/PageHeader';
import { SupportCenter } from '@/components/SupportCenter';
import { useLanguage } from '@/context/language-context';

export function SupportPage() {
  const { t } = useLanguage();
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={t('support.clientCare')}
        title={t('support.contact')}
        description={t('support.clientDescription')}
      />
      <SupportCenter />
    </div>
  );
}
