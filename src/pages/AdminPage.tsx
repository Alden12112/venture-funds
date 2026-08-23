import { useMemo, useState } from 'react';
import { ArrowRight, HandCoins, PlusCircle, Trash2, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataMeta, LoadingState, StatCard, StatusPill, EmptyState } from '@/components/Stats';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadAdminBundle } from '@/adapters/admin-adapter';
import { loadNewsBundle } from '@/adapters/news-adapter';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { readStorage, writeStorage } from '@/lib/storage';
import { Link, useLocation } from 'react-router-dom';
import { approveCreditRequest, grantCredits } from '@/lib/credits';
import type { RegisteredUser } from '@/types';
import { buildInternationalPhone, countryDirectory, getCountryOption, isValidCountryPhone, phoneDigitsHint } from '@/data/countries';
import { hashSecret, isValidEmail } from '@/lib/auth';
import { apiFetch, ApiError, isApiUnavailable } from '@/lib/api';

const tabs = ['全部账号', '注册审核', '积分管理', '月报', '交易评分', '流水通知', '内容配置', '审核流'] as const;

export function AdminPage({ standalone = false }: { standalone?: boolean }) {
  const { session } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const initialQuery = new URLSearchParams(location.search).get('query') ?? '';
  const [tab, setTab] = useState<(typeof tabs)[number]>('全部账号');
  const [query, setQuery] = useState(initialQuery);
  const [refreshKey, setRefreshKey] = useState(0);
  const [grantTarget, setGrantTarget] = useState(initialQuery);
  const [grantAmount, setGrantAmount] = useState(100);
  const [accountForm, setAccountForm] = useState({ name: '', email: '', phone: '', country: 'Malaysia', password: '' });
  const [accountMessage, setAccountMessage] = useState('');
  const admin = useAsyncResource(() => loadAdminBundle(), [refreshKey]);
  const news = useAsyncResource(() => loadNewsBundle(), []);

  if (session?.role !== 'admin') {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="权限"
          title="后台管理"
          description="当前会话没有管理员权限。请用管理员账户从 /auth/login 登录后再进入 /admin。"
        />
        <EmptyState
          title="无权限访问"
          text="后台页已和前台分离，需要管理员身份。"
          action={
            <Link to="/auth/login" className="btn btn--primary">
              去登录 <ArrowRight size={16} />
            </Link>
          }
        />
      </div>
    );
  }

  if (admin.status === 'loading' || news.status === 'loading') {
    return <LoadingState label="正在载入后台" />;
  }

  if (admin.status === 'error' || news.status === 'error') {
    return <div className="state-block state-block--error"><strong>后台数据暂不可用</strong><p>请稍后重试。</p></div>;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const matches = (value: string | undefined) => !normalizedQuery || (value ?? '').toLowerCase().includes(normalizedQuery);
  const visibleUsers = admin.data.users.filter((user) => matches(user.name) || matches(user.email) || matches(user.phone) || matches(user.country));
  const visibleRegistrations = admin.data.registrations.filter((item) => matches(item.fullName) || matches(item.gmail) || matches(item.phone) || matches(item.country));
  const visiblePositions = admin.data.paperPositions.filter((item) => matches(item.userName) || matches(item.userId) || matches(item.symbol));
  const visibleLedger = admin.data.ledgerEntries.filter((item) => matches(item.refId) || matches(item.note) || matches(item.type));
  const visibleNotifications = admin.data.notifications.filter((item) => matches(item.title) || matches(item.body) || matches(item.category));
  const visibleCreditAccounts = admin.data.creditAccounts.filter((item) => matches(item.userName) || matches(item.email) || matches(item.userId));
  const pendingCreditRequests = admin.data.creditRequests.filter((item) => item.status === 'pending');
  const totalCredits = admin.data.creditAccounts.reduce((sum, account) => sum + account.balance, 0);
  const pendingCredits = pendingCreditRequests.reduce((sum, request) => sum + request.amount, 0);
  const currentMonth = new Date();
  const isCurrentMonth = (value: string) => {
    const date = new Date(value);
    return date.getFullYear() === currentMonth.getFullYear() && date.getMonth() === currentMonth.getMonth();
  };
  const monthRegistrations = admin.data.registrations.filter((item) => isCurrentMonth(item.submittedAt));
  const monthLedger = admin.data.ledgerEntries.filter((item) => isCurrentMonth(item.time));
  const monthPositions = admin.data.paperPositions.filter((item) => isCurrentMonth(item.openedAt));
  const monthNotifications = admin.data.notifications.filter((item) => isCurrentMonth(item.createdAt));
  const contentCount = news.data.items.length;
  const report = admin.data.report;
  const creditByEmail = new Map(admin.data.creditAccounts.map((account) => [account.email.toLowerCase(), account]));
  const grantLookup = grantTarget.trim().toLowerCase();
  const grantAccount = admin.data.creditAccounts.find((account) =>
    account.email.toLowerCase().includes(grantLookup) ||
    account.userName.toLowerCase().includes(grantLookup) ||
    account.userId.toLowerCase().includes(grantLookup),
  );
  const grantUser = admin.data.users.find((user) =>
    user.email.toLowerCase().includes(grantLookup) ||
    user.name.toLowerCase().includes(grantLookup) ||
    user.id.toLowerCase().includes(grantLookup),
  );
  const accountCountry = getCountryOption(accountForm.country);
  const accountPhoneMaxLength = Array.isArray(accountCountry.digits) ? accountCountry.digits[1] : accountCountry.digits;

  const grantToTarget = () => {
    const target = grantAccount ?? (grantUser ? { userId: grantUser.id, userName: grantUser.name, email: grantUser.email } : null);
    if (!target || grantAmount <= 0) return;
    grantCredits({ id: target.userId, name: target.userName, email: target.email }, Math.round(grantAmount));
    setRefreshKey((value) => value + 1);
  };

  const approveRequest = (id: string) => {
    approveCreditRequest(id, session?.name ?? 'AD88 Admin');
    setRefreshKey((value) => value + 1);
  };

  const reviewRegistration = (id: string, status: RegisteredUser['status']) => {
    const registrations = readStorage<RegisteredUser[]>('pendingRegistrations', []);
    writeStorage('pendingRegistrations', registrations.map((item) => item.id === id ? { ...item, status } : item));
    setRefreshKey((value) => value + 1);
  };

  const createAccount = async () => {
    if (!accountForm.name.trim() || !isValidEmail(accountForm.email) || !isValidCountryPhone(accountCountry, accountForm.phone) || accountForm.password.length < 8) {
      setAccountMessage(`请填写完整资料：有效邮箱、${phoneDigitsHint(accountCountry)} 位手机号，以及至少 8 位密码。`);
      return;
    }
    const registrations = readStorage<RegisteredUser[]>('pendingRegistrations', []);
    const duplicate = registrations.some((item) => item.gmail.toLowerCase() === accountForm.email.trim().toLowerCase() || item.phone.replace(/\D/g, '') === buildInternationalPhone(accountCountry, accountForm.phone).replace(/\D/g, ''));
    if (duplicate) {
      setAccountMessage('这个邮箱或手机号已经存在。');
      return;
    }
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ name: accountForm.name.trim(), email: accountForm.email.trim(), phone: buildInternationalPhone(accountCountry, accountForm.phone), country: accountCountry.name, password: accountForm.password }),
      });
      setAccountForm({ name: '', email: '', phone: '', country: accountCountry.name, password: '' });
      setAccountMessage('账号已创建并自动通过审核，已同步到服务器。');
      setRefreshKey((value) => value + 1);
      return;
    } catch (error) {
      if (!(error instanceof ApiError) || !isApiUnavailable(error)) {
        setAccountMessage(error instanceof Error ? error.message : '创建账号失败。');
        return;
      }
    }
    const next: RegisteredUser = {
      id: crypto.randomUUID(),
      fullName: accountForm.name.trim(),
      gmail: accountForm.email.trim(),
      phone: buildInternationalPhone(accountCountry, accountForm.phone),
      country: accountCountry.name,
      status: 'approved',
      submittedAt: new Date().toISOString(),
      tradingScore: 60,
      passwordDigest: await hashSecret(accountForm.password),
    };
    writeStorage('pendingRegistrations', [next, ...registrations]);
    setAccountForm({ name: '', email: '', phone: '', country: accountCountry.name, password: '' });
    setAccountMessage('账号已创建并自动通过审核。');
    setRefreshKey((value) => value + 1);
  };

  const deleteAccount = async (id: string) => {
    const target = admin.data.users.find((user) => user.id === id);
    if (!target || target.role === 'admin' || !admin.data.registrations.some((item) => item.id === id)) return;
    if (!window.confirm(`确定要删除账号「${target.name}」吗？`)) return;
    if (!window.confirm('请再次确认：删除后该账号的注册资料将从当前工作区移除。')) return;
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setAccountMessage(`已删除账号：${target.name}`);
      setRefreshKey((value) => value + 1);
      return;
    } catch (error) {
      if (!(error instanceof ApiError) || !isApiUnavailable(error)) {
        setAccountMessage(error instanceof Error ? error.message : '删除账号失败。');
        return;
      }
    }
    const registrations = readStorage<RegisteredUser[]>('pendingRegistrations', []);
    writeStorage('pendingRegistrations', registrations.filter((item) => item.id !== id));
    setAccountMessage(`已删除账号：${target.name}`);
    setRefreshKey((value) => value + 1);
  };

  return (
    <div className={standalone ? 'admin-standalone page-stack' : 'page-stack'}>
      {standalone ? (
        <div className="admin-topbar">
          <Link to="/" className="brand-lockup">
            <span className="brand-lockup__mark">AD88</span>
            <span className="brand-lockup__name">{t('admin.console')}</span>
          </Link>
          <Link to="/app/dashboard" className="btn btn--ghost">{t('admin.backUser')}</Link>
        </div>
      ) : null}
      <PageHeader
        eyebrow={t('admin.eyebrow')}
        title={t('admin.title')}
        description={t('admin.description')}
        meta={<DataMeta source={admin.data.source} />}
      />

      <section className="metric-grid metric-grid--compact">
        <StatCard label={t('admin.metricAccounts')} value={String(report.totalAccounts)} note={t('admin.metricAccountsNote')} />
        <StatCard label={t('admin.metricNew')} value={String(report.monthlyRegistrations)} note={report.monthLabel} />
        <StatCard label={t('admin.metricLedger')} value={String(report.monthlyLedgerEntries)} note={`${t('admin.metricDeposit')} ${formatCurrency(report.monthlyInflow)}`} />
        <StatCard label="积分余额" value={String(totalCredits)} note={`待审 ${pendingCredits}`} />
      </section>

      <section className="panel panel--controls">
        <label className="search-field admin-search">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('admin.searchPlaceholder')} />
        </label>
        <div className="chip-row">
          {tabs.map((item) => (
            <button key={item} type="button" className={`chip ${tab === item ? 'is-active' : ''}`} onClick={() => setTab(item)}>
              {item}
            </button>
          ))}
        </div>
      </section>

      {tab === '全部账号' ? (
        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>{t('admin.accountsTitle')}</h2>
              <p>{t('admin.accountsHint')}</p>
            </div>
            <StatusPill tone="info">{String(visibleUsers.length)} {t('admin.people')}</StatusPill>
          </div>
          <div className="admin-account-create">
            <div className="admin-account-create__intro">
              <UserPlus size={20} />
              <div>
                <strong>后台创建账号</strong>
                <span>新账号自动通过审核；资料会和前台注册共用同一账号池。</span>
              </div>
            </div>
            <div className="form-grid">
              <label className="field"><span>姓名</span><input value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} /></label>
              <label className="field"><span>邮箱</span><input type="email" value={accountForm.email} onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })} /></label>
              <label className="field"><span>国家 / 地区</span><select value={accountForm.country} onChange={(event) => setAccountForm({ ...accountForm, country: event.target.value, phone: '' })}>{countryDirectory.map((country) => <option key={`${country.code}-${country.name}`} value={country.name}>{country.name} (+{country.dialCode})</option>)}</select></label>
              <label className="field"><span>手机号（{phoneDigitsHint(accountCountry)} 位）</span><div className="phone-input"><span className="phone-input__prefix">+{accountCountry.dialCode}</span><input type="tel" inputMode="numeric" maxLength={accountPhoneMaxLength} value={accountForm.phone} onChange={(event) => setAccountForm({ ...accountForm, phone: event.target.value.replace(/\D/g, '').slice(0, accountPhoneMaxLength) })} /></div></label>
              <label className="field"><span>初始密码</span><input type="password" autoComplete="new-password" value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} /></label>
            </div>
            <div className="admin-account-create__actions"><button type="button" className="btn btn--primary" onClick={createAccount}><UserPlus size={16} />创建并通过</button>{accountMessage ? <span className="field-hint">{accountMessage}</span> : null}</div>
          </div>
          <div className="table-wrap">
            <table className="table table--interactive">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>邮箱</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>地区</th>
                  <th>等级</th>
                  <th className="text-end">积分余额</th>
                  <th className="text-end">交易评分</th>
                  <th>加入时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((user) => {
                  const credit = creditByEmail.get(user.email.toLowerCase());
                  return (
                    <tr key={user.id}>
                      <td><strong>{user.name}</strong></td>
                      <td>{user.email}</td>
                      <td>{user.role}</td>
                      <td><StatusPill tone={user.status === 'active' ? 'success' : user.status === 'pending' ? 'warning' : 'critical'}>{user.status}</StatusPill></td>
                      <td>{user.country}</td>
                      <td>{user.tier}</td>
                      <td className="text-end">{credit?.balance ?? 0}</td>
                      <td className="text-end">{user.tradingScore ?? 0}</td>
                      <td>{formatDateTime(user.joinedAt)}</td>
                      <td>{admin.data.registrations.some((item) => item.id === user.id) ? <button type="button" className="btn btn--danger btn--sm" onClick={() => deleteAccount(user.id)}><Trash2 size={14} />删除</button> : <span className="text-muted">系统账号</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {tab === '注册审核' ? (
        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>{t('admin.regTitle')}</h2>
              <p>{t('admin.regHint')}</p>
            </div>
            <StatusPill tone="warning">{String(visibleRegistrations.length)} {t('admin.items')}</StatusPill>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Full name</th>
                  <th>Gmail</th>
                  <th>Phone</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th className="text-end">Score</th>
                  <th>Submitted</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRegistrations.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.fullName}</strong></td>
                    <td>{item.gmail}</td>
                    <td>{item.phone}</td>
                    <td>{item.country}</td>
                    <td><StatusPill tone={item.status === 'approved' ? 'success' : item.status === 'pending' ? 'warning' : 'critical'}>{item.status}</StatusPill></td>
                    <td className="text-end">{item.tradingScore}</td>
                    <td>{formatDateTime(item.submittedAt)}</td>
                    <td>
                      {item.status === 'pending' ? (
                        <div className="table-actions">
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => reviewRegistration(item.id, 'approved')}>通过</button>
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => reviewRegistration(item.id, 'rejected')}>拒绝</button>
                        </div>
                      ) : <span className="text-muted">已处理</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {tab === '积分管理' ? (
        <section className="content-grid content-grid--two">
          <article className="panel credit-admin">
            <div className="panel__head">
              <div>
                <h2>积分发放</h2>
                <p>输入账号、邮箱或点击下面账户，再输入要发放的积分。</p>
              </div>
              <StatusPill tone={grantAccount || grantUser ? 'success' : 'warning'}>{grantAccount || grantUser ? '已选账号' : '等待选择'}</StatusPill>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>账号 / 邮箱 / 姓名</span>
                <input value={grantTarget} onChange={(event) => setGrantTarget(event.target.value)} placeholder="输入账号或点击账户" />
              </label>
              <label className="field">
                <span>发放积分</span>
                <input type="number" min="1" step="1" value={grantAmount} onChange={(event) => setGrantAmount(Number(event.target.value))} />
              </label>
            </div>
            <button type="button" className="btn btn--primary" onClick={grantToTarget} disabled={!grantLookup || (!grantAccount && !grantUser) || grantAmount <= 0}>
              <PlusCircle size={16} />
              发放积分
            </button>
            <div className="table-wrap">
              <table className="table table--interactive">
                <thead>
                  <tr>
                    <th>账号</th>
                    <th>邮箱</th>
                    <th className="text-end">余额</th>
                    <th className="text-end">可用</th>
                    <th className="text-end">待审</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCreditAccounts.map((account) => (
                    <tr key={account.userId}>
                      <td><strong>{account.userName}</strong></td>
                      <td>{account.email}</td>
                      <td className="text-end">{account.balance}</td>
                      <td className="text-end">{account.available}</td>
                      <td className="text-end">{account.pending}</td>
                      <td>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setGrantTarget(account.email)}>
                          选择
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel">
            <div className="panel__head">
              <div>
                <h2>积分申请审核</h2>
                <p>前台提交的申请会在这里等待批准。</p>
              </div>
              <StatusPill tone={pendingCreditRequests.length ? 'warning' : 'muted'}>{pendingCreditRequests.length} 待审</StatusPill>
            </div>
            {admin.data.creditRequests.length ? (
              <div className="stack-list">
                {admin.data.creditRequests.map((request) => (
                  <div key={request.id} className="stack-list__row">
                    <div>
                      <strong>{request.userName} / {request.amount} 积分</strong>
                      <span>{request.email}</span>
                      <span>{request.reason}</span>
                    </div>
                    <div className="stack-list__meta">
                      <StatusPill tone={request.status === 'approved' ? 'success' : request.status === 'pending' ? 'warning' : 'critical'}>{request.status}</StatusPill>
                      {request.status === 'pending' ? (
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => approveRequest(request.id)}>
                          <HandCoins size={14} />
                          批准
                        </button>
                      ) : (
                        <span>{request.reviewedAt ? formatDateTime(request.reviewedAt) : formatDateTime(request.requestedAt)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="state-block">
                <strong>暂无积分申请</strong>
                <p>用户在前台提交后，这里会出现审核动作。</p>
              </div>
            )}
          </article>
        </section>
      ) : null}

      {tab === '月报' ? (
        <section className="content-grid content-grid--two">
          <article className="panel">
            <div className="panel__head">
              <div>
                <h2>{report.monthLabel} {t('admin.reportTitle')}</h2>
                <p>{t('admin.reportHint')}</p>
              </div>
            </div>
            <section className="metric-grid metric-grid--compact">
              <StatCard label={t('admin.reportApproved')} value={String(report.monthlyApproved)} note={t('admin.reportRegistrations')} />
              <StatCard label={t('admin.reportPositions')} value={String(report.monthlyPositions)} note={t('admin.reportMarket')} />
              <StatCard label={t('admin.reportUnread')} value={String(report.unreadNotifications)} note={t('admin.reportMonthScope')} />
              <StatCard label={t('admin.reportAverage')} value={String(report.averageTradingScore)} note={t('admin.reportAccountsScope')} />
            </section>
          </article>
          <article className="panel">
            <div className="panel__head">
              <div>
                <h2>{t('admin.summaryTitle')}</h2>
                <p>{t('admin.summaryHint')}</p>
              </div>
            </div>
            <div className="stack-list">
              <div className="stack-list__row">
                <div>
                  <strong>{t('admin.summaryRegistrations')}</strong>
                  <span>{monthRegistrations.length} {t('admin.summaryCount')}，本月 {monthRegistrations.filter((item) => item.status === 'pending').length} {t('admin.summaryPending')}。</span>
                </div>
                <div className="stack-list__meta">
                  <StatusPill tone={monthRegistrations.length ? 'info' : 'muted'}>{String(monthRegistrations.length)}</StatusPill>
                  <span>{report.monthLabel}</span>
                </div>
              </div>
              <div className="stack-list__row">
                <div>
                  <strong>{t('admin.summaryLedger')}</strong>
                  <span>{monthLedger.length} {t('admin.summaryLedgerCount')}，{t('admin.summaryOutflow')} {formatCurrency(report.monthlyOutflow)}，{t('admin.summaryInflow')} {formatCurrency(report.monthlyInflow)}。</span>
                </div>
                <div className="stack-list__meta">
                  <StatusPill tone={report.monthlyInflow >= report.monthlyOutflow ? 'success' : 'warning'}>{String(monthLedger.length)}</StatusPill>
                  <span>{report.monthLabel}</span>
                </div>
              </div>
              <div className="stack-list__row">
                <div>
                  <strong>{t('admin.summaryFlow')}</strong>
                  <span>{monthPositions.length} {t('admin.summaryPositions')}，{monthNotifications.length} {t('admin.summaryNotifications')}。</span>
                </div>
                <div className="stack-list__meta">
                  <StatusPill tone="info">{String(monthPositions.length + monthNotifications.length)}</StatusPill>
                  <span>{t('admin.summaryComposite')}</span>
                </div>
              </div>
            </div>
          </article>
        </section>
      ) : null}

      {tab === '交易评分' ? (
        <article className="panel">
          <div className="stack-list">
            {visiblePositions.map((item) => (
              <div key={item.id} className="stack-list__row">
                <div>
                  <strong>{item.userName ?? item.userId ?? 'Unknown'} / {item.symbol} {item.side.toUpperCase()}</strong>
                  <span>{item.lots} lots / leverage {item.leverage}x / entry {formatCurrency(item.entryPrice)}</span>
                </div>
                <div className="stack-list__meta">
                  <StatusPill tone={item.margin < 1000 ? 'success' : item.margin < 3000 ? 'warning' : 'critical'}>{formatCurrency(item.margin)}</StatusPill>
                  <span>{formatDateTime(item.openedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      {tab === '流水通知' ? (
        <section className="content-grid content-grid--two">
          <article className="panel">
            <div className="panel__head"><div><h2>{t('admin.ledgerTitle')}</h2><p>{t('admin.ledgerHint')}</p></div></div>
            <div className="stack-list">
              {visibleLedger.map((item) => (
                <div key={item.id} className="stack-list__row">
                  <div><strong>{item.refId}</strong><span>{item.note}</span></div>
                  <div className="stack-list__meta"><StatusPill tone={item.status === 'approved' || item.status === 'settled' ? 'success' : item.status === 'pending' ? 'warning' : 'critical'}>{item.status}</StatusPill><span>{formatCurrency(item.amount)}</span></div>
                </div>
              ))}
            </div>
          </article>
          <article className="panel">
            <div className="panel__head"><div><h2>{t('admin.notificationsTitle')}</h2><p>{t('admin.notificationsHint')}</p></div></div>
            <div className="stack-list">
              {visibleNotifications.map((item) => (
                <div key={item.id} className="stack-list__row">
                  <div><strong>{item.title}</strong><span>{item.body}</span></div>
                  <div className="stack-list__meta"><StatusPill tone={item.read ? 'muted' : 'warning'}>{item.read ? 'read' : 'unread'}</StatusPill><span>{formatDateTime(item.createdAt)}</span></div>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {tab === '内容配置' ? (
        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>{t('admin.contentTitle')}</h2>
              <p>{t('admin.contentHint')}</p>
            </div>
            <StatusPill tone="info">{String(contentCount)} {t('admin.articles')}</StatusPill>
          </div>
          <div className="stack-list">
            {news.data.items.slice(0, 6).map((item) => (
              <div key={item.id} className="stack-list__row">
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.category} / {item.source}</span>
                </div>
                <div className="stack-list__meta">
                  <StatusPill tone={item.tone === 'positive' ? 'success' : item.tone === 'alert' ? 'critical' : 'info'}>{item.tone}</StatusPill>
                  <span>{formatDateTime(item.publishedAt)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>键</th>
                  <th>值</th>
                  <th>范围</th>
                </tr>
              </thead>
              <tbody>
                {admin.data.configs.map((config) => (
                  <tr key={config.key}>
                    <td>{config.key}</td>
                    <td>{config.value.includes('://') || config.value.startsWith('http') ? 'Configured server-side' : config.value}</td>
                    <td>{config.scope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {tab === '审核流' ? (
        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>{t('admin.approvalTitle')}</h2>
              <p>{t('admin.approvalHint')}</p>
            </div>
          </div>
          <div className="stack-list">
            {admin.data.approvals.map((approval) => (
              <div key={approval.id} className="stack-list__row">
                <div>
                  <strong>{approval.subject}</strong>
                  <span>{approval.owner}</span>
                </div>
                <div className="stack-list__meta">
                  <StatusPill tone={approval.status === 'approved' ? 'success' : approval.status === 'pending' ? 'warning' : 'critical'}>{approval.status}</StatusPill>
                  <span>{formatDateTime(approval.updatedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      ) : null}
    </div>
  );
}
