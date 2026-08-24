import { Link, Navigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { legalPages } from '@/data/navigation';

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
  const { page } = useParams();
  const current = page && page in copy ? copy[page as keyof typeof copy] : null;

  if (!current) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="legal-page">
      <PageHeader eyebrow="LEGAL & COMPLIANCE" title={current.title} description={current.text} />
      <article className="panel">
        <p>This section is reserved for approved legal text and is not a substitute for a final compliance review.</p>
        <p>It can be replaced with versioned copy, approval records and electronic acceptance state.</p>
        <div className="auth-footer__links">
          <Link to="/auth/login">Return to sign-in</Link>
          <Link to="/">Return to home</Link>
          {legalPages.map((item) => (
            <Link key={item.key} to={`/legal/${item.key}`}>{item.label}</Link>
          ))}
        </div>
      </article>
    </div>
  );
}
