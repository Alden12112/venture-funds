import { PageHeader } from '@/components/PageHeader';
import { SupportCenter } from '@/components/SupportCenter';

export function SupportPage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Client care"
        title="Client Support"
        description="Message the AD88 operations desk directly. Your conversation and replies stay attached to this secure account thread."
      />
      <SupportCenter />
    </div>
  );
}
