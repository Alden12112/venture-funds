import { Link, Navigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { legalPages } from '@/data/navigation';

const copy = {
  terms: {
    title: '用户协议',
    text: '这是协议占位页，用来承载后端正式文本、版本号和签署流程。',
  },
  privacy: {
    title: '隐私政策',
    text: '这是隐私政策占位页，用来接入正式采集、存储和共享说明。',
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
      <PageHeader eyebrow="法务" title={current.title} description={current.text} />
      <article className="panel">
        <p>此页面保留正式条款接入位置，当前仅作占位展示。</p>
        <p>后续可替换为版本化文案、审批记录与电子签署状态。</p>
        <div className="auth-footer__links">
          <Link to="/auth/login">返回登录</Link>
          <Link to="/">返回首页</Link>
          {legalPages.map((item) => (
            <Link key={item.key} to={`/legal/${item.key}`}>{item.label}</Link>
          ))}
        </div>
      </article>
    </div>
  );
}
