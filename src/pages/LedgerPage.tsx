import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { DataMeta, LoadingState, StatCard, StatusPill } from '@/components/Stats';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadLedgerBundle } from '@/adapters/ledger-adapter';
import { formatCurrency, formatDateTime } from '@/lib/format';

const filters = ['全部', 'deposit', 'withdraw', 'transfer', 'review'] as const;

export function LedgerPage() {
  const navigate = useNavigate();
  const bundle = useAsyncResource(() => loadLedgerBundle(), []);
  const [filter, setFilter] = useState<(typeof filters)[number]>('全部');

  const filtered = useMemo(() => {
    if (bundle.status !== 'success') return [];
    return bundle.data.entries.filter((entry) => filter === '全部' || entry.type === filter);
  }, [bundle, filter]);

  if (bundle.status === 'loading') {
    return <LoadingState label="正在载入资金流水" />;
  }

  if (bundle.status === 'error') {
    return <div className="state-block state-block--error"><strong>流水页暂时不可用</strong><p>{bundle.error}</p></div>;
  }

  const approved = bundle.data.entries.filter((entry) => entry.status === 'approved' || entry.status === 'settled');
  const pending = bundle.data.entries.filter((entry) => entry.status === 'pending');
  const inflow = bundle.data.entries.filter((entry) => entry.direction === 'in').reduce((sum, entry) => sum + entry.amount, 0);
  const outflow = bundle.data.entries.filter((entry) => entry.direction === 'out').reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="账本"
        title="资金流水"
        description="充值、提现、转账和审核流只保留沙盒记录。"
        meta={<DataMeta source={bundle.data.source} />}
      />

      <section className="metric-grid metric-grid--compact">
        <StatCard label="入金合计" value={formatCurrency(inflow)} note="沙盒记录" />
        <StatCard label="出金合计" value={formatCurrency(outflow)} note="沙盒记录" />
        <StatCard label="已通过/已结清" value={String(approved.length)} note="审核结果" />
        <StatCard label="待审核" value={String(pending.length)} note="人工复核" />
      </section>

      <section className="panel panel--controls">
        <div className="chip-row">
          {filters.map((item) => (
            <button key={item} type="button" className={`chip ${filter === item ? 'is-active' : ''}`} onClick={() => setFilter(item)}>
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel">
          <div className="table-wrap">
            <table className="table table--interactive">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>类型</th>
                  <th className="text-end">金额</th>
                  <th>状态</th>
                  <th>备注</th>
                  <th>引用 ID</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.id} onClick={() => navigate(`/admin?query=${encodeURIComponent(entry.refId)}`)}>
                    <td>{formatDateTime(entry.time)}</td>
                    <td>{entry.type}</td>
                    <td className="text-end">{formatCurrency(entry.amount)}</td>
                    <td>
                      <StatusPill tone={entry.status === 'approved' || entry.status === 'settled' ? 'success' : entry.status === 'pending' ? 'warning' : 'critical'}>
                        {entry.status}
                      </StatusPill>
                    </td>
                    <td>{entry.note}</td>
                    <td>{entry.refId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>审核流</h2>
              <p>模拟的资金审核状态流转。</p>
            </div>
          </div>
          <div className="stack-list">
            {bundle.data.entries.slice(0, 4).map((entry) => (
              <div key={entry.id} className="stack-list__row">
                <div>
                  <strong>{entry.refId}</strong>
                  <span>{entry.note}</span>
                </div>
                <div className="stack-list__meta">
                  <StatusPill tone={entry.status === 'approved' || entry.status === 'settled' ? 'success' : entry.status === 'pending' ? 'warning' : 'critical'}>{entry.status}</StatusPill>
                  <span>{formatDateTime(entry.time)}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
