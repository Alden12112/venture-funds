import { Link, Navigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { legalPages } from '@/data/navigation';
import { useLanguage } from '@/context/language-context';

const copy = {
  terms: {
    title: 'Terms of use',
    text: 'This reserved legal page will carry approved terms, version history and acceptance workflow.',
  },
  privacy: {
    title: 'Privacy policy',
    text: 'This reserved legal page will carry approved collection, storage and disclosure notices.',
  },
} as const;

export function LegalPage() {
  const { t } = useLanguage();
  const { page } = useParams();
  const current = page && page in copy ? copy[page as keyof typeof copy] : null;

  if (!current) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="legal-page">
      <PageHeader eyebrow={t('legal.eyebrow')} title={page === 'terms' ? t('legal.terms') : t('legal.privacy')} description={page === 'terms' ? t('legal.termsDescription') : t('legal.privacyDescription')} />
      <article className="panel">
        <p>{t('legal.reservedHint')}</p>
        <p>{t('legal.versioned')}</p>
        <div className="auth-footer__links">
          <Link to="/auth/login">{t('legal.returnSignIn')}</Link>
          <Link to="/">{t('legal.returnHome')}</Link>
          {legalPages.map((item) => (
            <Link key={item.key} to={`/legal/${item.key}`}>{item.label}</Link>
          ))}
        </div>
      </article>
    </div>
  );
}
