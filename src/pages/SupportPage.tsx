import { PageHeader } from '@/components/PageHeader';
import { SupportCenter } from '@/components/SupportCenter';

export function SupportPage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Client care"
        title="客服中心"
        description="在这里直接联系后台客服；你的消息和回复会保存到当前账号的会话中。"
      />
      <SupportCenter />
    </div>
  );
}
