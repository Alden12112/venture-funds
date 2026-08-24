import { useEffect, useState } from 'react';
import { ArrowRight, HandCoins, PlusCircle, Trash2, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataMeta, LoadingState, StatCard, StatusPill, EmptyState } from '@/components/Stats';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadAdminBundle } from '@/adapters/admin-adapter';
import { loadNewsBundle } from '@/adapters/news-adapter';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { approveRemoteCreditRequest, grantRemoteCredits } from '@/lib/credits';
import { buildInternationalPhone, countryDirectory, getCountryOption, isValidCountryPhone, phoneDigitsHint } from '@/data/countries';
import { isValidEmail } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { SupportCenter } from '@/components/SupportCenter';

const tabs = ['全部账号', '注册审核', 'U 管理', '月报', '交易记录', '流水通知', '客服中心', '内容配置', '审核流', '黑名单记录'] as const;

export function AdminPage({ standalone = false }: { standalone?: boolean }) {
  const { session, signOut } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const initialQuery = new URLSearchParams(location.search).get('query') ?? '';
  const [tab, setTab] = useState<(typeof tabs)[number]>('全部账号');
  const [query, setQuery] = useState(initialQuery);
  const [refreshKey, setRefreshKey] = useState(0);
  const [grantTarget, setGrantTarget] = useState(initialQuery);
  const [grantAmount, setGrantAmount] = useState(100);
  const [accountForm, setAccountForm] = useState({ name: '', email: '', phone: '', country: 'Malaysia', password: '', role: 'user' as 'user' | 'admin' });
  const [accountMessage, setAccountMessage] = useState('');
  const admin = useAsyncResource(() => loadAdminBundle(), [refreshKey]);
  const news = useAsyncResource(() => loadNewsBundle(), []);

  useEffect(() => {
    const refresh = (event: Event) => {
      const key = (event as CustomEvent<{ key?: string }>).detail?.key;
      if (key === 'creditAccounts' || key === 'creditRequests' || key === 'paperPositions') setRefreshKey((value) => value + 1);
    };
    window.addEventListener('ad88:storage-sync', refresh);
    return () => window.removeEventListener('ad88:storage-sync', refresh);
  }, []);

  useEffect(() => {
    // Keep the independent admin console aligned with registrations, U
    // balances, support state and trade audit events created from another
    // device. The backend remains the source of truth; this only schedules a
    // lightweight read of the shared bundle.
    const timer = window.setInterval(() => setRefreshKey((value) => value + 1), 8_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (admin.status === 'error' && admin.error === 'unauthorized') {
      signOut();
      navigate('/admin/login', { replace: true });
    }
  }, [admin.error, admin.status, navigate, signOut]);

  if (session?.role !== 'admin') {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="权限"
          title="后台管理"
          description="当前会话没有管理员权限。请从独立的 /admin/login 入口进入后台。"
        />
        <EmptyState
          title="无权限访问"
          text="后台页已和前台分离，需要管理员身份。"
          action={
            <Link to="/admin/login" className="btn btn--primary">
              去登录 <ArrowRight size={16} />
            </Link>
          }
        />
      </div>
    );
  }

  if (admin.status === 'loading') {
    return <LoadingState label="正在载入后台" />;
  }

  if (admin.status === 'error') {
    return (
      <div className="page-stack">
        <PageHeader eyebrow="后台状态" title="后台暂时无法载入" description="账号接口或管理员会话没有返回有效数据。" />
        <div className="state-block state-block--error">
          <strong>后台数据暂不可用</strong>
          <p>{admin.error || '共享后台接口暂时不可用，请稍后重试。'}</p>
          <div className="state-block__action">
            <button type="button" className="btn btn--ghost" onClick={() => setRefreshKey((value) => value + 1)}>重新加载</button>
            <button type="button" className="btn btn--primary" onClick={() => { signOut(); navigate('/admin/login'); }}>重新登录</button>
          </div>
        </div>
      </div>
    );
  }

  const normalizedQuery = query.trim().toLowerCase();
  const matches = (value: string | undefined) => !normalizedQuery || (value ?? '').toLowerCase().includes(normalizedQuery);
  const visibleUsers = admin.data.users.filter((user) => matches(user.name) || matches(user.email) || matches(user.phone) || matches(user.country));
  const visibleRegistrations = admin.data.registrations.filter((item) => matches(item.fullName) || matches(item.gmail) || matches(item.phone) || matches(item.country));
  const visiblePositions = admin.data.paperPositions.filter((item) => matches(item.userName) || matches(item.userId) || matches(item.symbol));
  const visibleTradeEvents = admin.data.tradeEvents.filter((item) => matches(item.userName) || matches(item.userEmail) || matches(item.userId) || matches(item.symbol) || matches(item.action));
  const visibleLedger = admin.data.ledgerEntries.filter((item) => matches(item.userEmail) || matches(item.userName) || matches(item.note) || matches(item.type));
  const visibleNotifications = admin.data.notifications.filter((item) => matches(item.title) || matches(item.body) || matches(item.category));
  const visibleCreditAccounts = admin.data.creditAccounts.filter((item) => matches(item.userName) || matches(item.email) || matches(item.userId));
  const visibleBlacklist = admin.data.blacklist.filter((item) => matches(item.name) || matches(item.email) || matches(item.phone) || matches(item.reason));
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
  const newsItems = news.status === 'success' ? news.data.items : [];
  const contentCount = newsItems.length;
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

  const grantToTarget = async () => {
    const target = grantAccount ?? (grantUser ? { userId: grantUser.id, userName: grantUser.name, email: grantUser.email } : null);
    if (!target || grantAmount <= 0) return;
    await grantRemoteCredits({ id: target.userId, name: target.userName, email: target.email }, Math.round(grantAmount));
    setRefreshKey((value) => value + 1);
  };

  const approveRequest = async (id: string) => {
    await approveRemoteCreditRequest(id, session?.name ?? 'AD88 Admin');
    setRefreshKey((value) => value + 1);
  };

  const createAccount = async () => {
    if (!accountForm.name.trim() || !isValidEmail(accountForm.email) || !isValidCountryPhone(accountCountry, accountForm.phone) || accountForm.password.length < 8) {
      setAccountMessage(`请填写完整资料：有效邮箱、${phoneDigitsHint(accountCountry)} 位手机号，以及至少 8 位密码。`);
      return;
    }
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ name: accountForm.name.trim(), email: accountForm.email.trim(), phone: buildInternationalPhone(accountCountry, accountForm.phone), country: accountCountry.name, password: accountForm.password, role: accountForm.role }),
      });
      setAccountForm({ name: '', email: '', phone: '', country: accountCountry.name, password: '', role: 'user' });
      setAccountMessage('账号已创建并自动通过审核，已同步到服务器。');
      setRefreshKey((value) => value + 1);
      return;
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : '创建账号失败。');
      return;
    }
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
      setAccountMessage(error instanceof Error ? error.message : '删除账号失败。');
      return;
    }
  };

  const blacklistAccount = async (id: string) => {
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(id)}/blacklist`, { method: 'POST', body: JSON.stringify({ reason: '注册审核不通过' }) });
      setAccountMessage('账号已拉黑；同一邮箱或手机号不能再次注册。');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : '拉黑账号失败。');
    }
  };

  const restoreBlacklist = async (id: string) => {
    try {
      await apiFetch(`/api/admin/blacklist/${encodeURIComponent(id)}/restore`, { method: 'POST' });
      setAccountMessage('已解除拉黑，账号可再次登录或注册。');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : '解除拉黑失败。');
    }
  };

  return (
    <div className={standalone ? 'admin-standalone page-stack' : 'page-stack'}>
      {standalone ? (
        <div className="admin-topbar">
          <Link to="/" className="brand-lockup">
            <span className="brand-lockup__mark">AD88</span>
            <span className="brand-lockup__name">{t('admin.console')}</span>
          </Link>
          <button type="button" className="btn btn--ghost" onClick={() => { signOut(); navigate('/admin/login'); }}>退出后台</button>
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
        <StatCard label="U 余额" value={String(totalCredits)} note={`待审 ${pendingCredits} U`} />
        <StatCard
          label="行情同步"
          value={admin.data.marketStatus.status === 'healthy' ? '正常' : admin.data.marketStatus.status === 'degraded' ? '检查' : '离线'}
          note={`${admin.data.marketStatus.quoteCount} 个品种 · ${admin.data.marketStatus.ageSeconds ?? '—'} 秒前`}
        />
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
              <label className="field"><span>账号角色</span><select value={accountForm.role} onChange={(event) => setAccountForm({ ...accountForm, role: event.target.value as 'user' | 'admin' })}><option value="user">普通用户</option><option value="admin">管理员</option></select></label>
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
                  <th className="text-end">U 余额</th>
                  <th>加入时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.length ? visibleUsers.map((user) => {
                  const credit = creditByEmail.get(user.email.toLowerCase());
                  return (
                    <tr key={user.id}>
                      <td><strong>{user.name}</strong></td>
                      <td>{user.email}</td>
                      <td>{user.role}</td>
                      <td><StatusPill tone={user.status === 'active' ? 'success' : user.status === 'pending' ? 'warning' : 'critical'}>{user.status}</StatusPill></td>
                      <td>{user.country}</td>
                      <td>{user.tier}</td>
                      <td className="text-end">{credit?.balance ?? 0} U</td>
                      <td>{formatDateTime(user.joinedAt)}</td>
                      <td>{user.role !== 'admin' ? <button type="button" className="btn btn--danger btn--sm" onClick={() => deleteAccount(user.id)}><Trash2 size={14} />删除</button> : <span className="text-muted">管理员受保护</span>}</td>
                    </tr>
                  );
                }) : <tr><td colSpan={9}><div className="empty-inline"><span>还没有账号。前台注册或后台创建后会同步显示。</span></div></td></tr>}
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
                  <th>Submitted</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRegistrations.length ? visibleRegistrations.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.fullName}</strong></td>
                    <td>{item.gmail}</td>
                    <td>{item.phone}</td>
                    <td>{item.country}</td>
                    <td><StatusPill tone={item.status === 'approved' ? 'success' : item.status === 'pending' ? 'warning' : 'critical'}>{item.status}</StatusPill></td>
                    <td>{formatDateTime(item.submittedAt)}</td>
                    <td>{item.status === 'rejected' ? <span className="text-muted">已拉黑</span> : <button type="button" className="btn btn--danger btn--sm" onClick={() => void blacklistAccount(item.id)}>不通过并拉黑</button>}</td>
                  </tr>
                )) : <tr><td colSpan={7}><div className="empty-inline"><span>暂无注册记录。</span></div></td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {tab === 'U 管理' ? (
        <section className="content-grid content-grid--two">
          <article className="panel credit-admin">
            <div className="panel__head">
              <div>
                <h2>U 发放</h2>
                <p>输入账号、邮箱或点击下面账户，再输入要发放的 U。</p>
              </div>
              <StatusPill tone={grantAccount || grantUser ? 'success' : 'warning'}>{grantAccount || grantUser ? '已选账号' : '等待选择'}</StatusPill>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>账号 / 邮箱 / 姓名</span>
                <input value={grantTarget} onChange={(event) => setGrantTarget(event.target.value)} placeholder="输入账号或点击账户" />
              </label>
              <label className="field">
                <span>发放 U</span>
                <input type="number" min="1" step="1" value={grantAmount} onChange={(event) => setGrantAmount(Number(event.target.value))} />
              </label>
            </div>
            <button type="button" className="btn btn--primary" onClick={() => void grantToTarget()} disabled={!grantLookup || (!grantAccount && !grantUser) || grantAmount <= 0}>
              <PlusCircle size={16} />
              发放 U
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
                <h2>U 申请审核</h2>
                <p>前台提交的申请会在这里等待批准。</p>
              </div>
              <StatusPill tone={pendingCreditRequests.length ? 'warning' : 'muted'}>{pendingCreditRequests.length} 待审</StatusPill>
            </div>
            {admin.data.creditRequests.length ? (
              <div className="stack-list">
                {admin.data.creditRequests.map((request) => (
                  <div key={request.id} className="stack-list__row">
                    <div>
                      <strong>{request.userName} / {request.amount} U</strong>
                      <span>{request.email}</span>
                      <span>{request.reason}</span>
                    </div>
                    <div className="stack-list__meta">
                      <StatusPill tone={request.status === 'approved' ? 'success' : request.status === 'pending' ? 'warning' : 'critical'}>{request.status}</StatusPill>
                      {request.status === 'pending' ? (
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void approveRequest(request.id)}>
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
                <strong>暂无 U 申请</strong>
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
              <StatCard label="交易事件" value={String(visibleTradeEvents.length)} note="跨设备审计记录" />
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

      {tab === '交易记录' ? (
        <section className="content-grid content-grid--two">
          <article className="panel">
            <div className="panel__head">
              <div><h2>交易审计记录</h2><p>前台沙盒开仓、平仓和风控更新会实时同步到这里。</p></div>
              <StatusPill tone={visibleTradeEvents.length ? 'info' : 'muted'}>{visibleTradeEvents.length} 条</StatusPill>
            </div>
            <div className="stack-list">
              {visibleTradeEvents.length ? visibleTradeEvents.map((item) => (
                <div key={item.id} className="stack-list__row">
                  <div>
                    <strong>{item.userName ?? item.userEmail ?? item.userId} / {item.symbol} {item.side.toUpperCase()}</strong>
                    <span>{item.action} · {item.lots} lots · {formatCurrency(item.price)}</span>
                  </div>
                  <div className="stack-list__meta"><StatusPill tone={item.action === 'open' ? 'success' : item.action === 'risk-update' ? 'info' : 'warning'}>{item.action}</StatusPill><span>{formatDateTime(item.createdAt)}</span></div>
                </div>
              )) : <div className="state-block"><strong>暂无跨设备交易事件</strong><p>用户完成一次沙盒操作后，记录会出现在这里。</p></div>}
            </div>
          </article>
          <article className="panel">
            <div className="panel__head"><div><h2>当前沙盒持仓</h2><p>同浏览器的持仓快照，用于辅助风险查看。</p></div></div>
            <div className="stack-list">
              {visiblePositions.map((item) => (
                <div key={item.id} className="stack-list__row">
                  <div><strong>{item.userName ?? item.userId ?? 'Unknown'} / {item.symbol} {item.side.toUpperCase()}</strong><span>{item.lots} lots / leverage {item.leverage}x / entry {formatCurrency(item.entryPrice)}</span></div>
                  <div className="stack-list__meta"><StatusPill tone={item.margin < 1000 ? 'success' : item.margin < 3000 ? 'warning' : 'critical'}>{formatCurrency(item.margin)}</StatusPill><span>{formatDateTime(item.openedAt)}</span></div>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {tab === '流水通知' ? (
        <section className="content-grid content-grid--two">
          <article className="panel">
            <div className="panel__head"><div><h2>{t('admin.ledgerTitle')}</h2><p>全部账户的资金流水集中显示；搜索邮箱即可定位申请人。</p></div></div>
            <div className="stack-list">
              {visibleLedger.length ? visibleLedger.map((item) => (
                <div key={item.id} className="stack-list__row">
                  <div><strong>{item.userEmail ?? '已删除账号'}</strong><span>{item.userName ?? '—'} · {item.note || item.type}</span></div>
                  <div className="stack-list__meta"><StatusPill tone={item.status === 'approved' || item.status === 'settled' ? 'success' : item.status === 'pending' ? 'warning' : 'critical'}>{item.status}</StatusPill><span>{item.amount.toFixed(2)} {item.currency}</span></div>
                </div>
              )) : <div className="state-block"><strong>暂无资金流水</strong><p>发生入金或出金后，会按账户邮箱在这里显示。</p></div>}
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

      {tab === '客服中心' ? <SupportCenter adminMode /> : null}

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
            {newsItems.slice(0, 6).map((item) => (
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
        <section className="content-grid content-grid--two">
          <article className="panel">
            <div className="panel__head"><div><h2>{t('admin.approvalTitle')}</h2><p>前台注册会自动通过；这里保留进入时间与后续审核状态。</p></div></div>
            <div className="stack-list">
              {admin.data.approvals.length ? admin.data.approvals.map((approval) => (
                <div key={approval.id} className="stack-list__row">
                  <div><strong>{approval.subject}</strong><span>{approval.owner}</span></div>
                  <div className="stack-list__meta"><StatusPill tone={approval.status === 'approved' ? 'success' : approval.status === 'pending' ? 'warning' : 'critical'}>{approval.status === 'approved' ? '自动通过' : approval.status === 'rejected' ? '已拉黑' : '待处理'}</StatusPill><span>{formatDateTime(approval.updatedAt)}</span></div>
                </div>
              )) : <div className="state-block"><strong>暂无审核记录</strong><p>前台注册后会同步出现在这里。</p></div>}
            </div>
          </article>
          <article className="panel">
            <div className="panel__head"><div><h2>黑名单记录</h2><p>可在右侧独立页查看完整名单与恢复操作。</p></div><StatusPill tone={admin.data.blacklist.length ? 'critical' : 'muted'}>{admin.data.blacklist.length} 人</StatusPill></div>
            <div className="stack-list">
              {admin.data.blacklist.slice(0, 5).map((entry) => <div key={entry.id} className="stack-list__row"><div><strong>{entry.name}</strong><span>{entry.email}</span></div><div className="stack-list__meta"><StatusPill tone="critical">已拉黑</StatusPill><span>{formatDateTime(entry.blacklistedAt)}</span></div></div>)}
              {!admin.data.blacklist.length ? <div className="state-block"><strong>暂无黑名单</strong><p>点击注册审核中的“不通过并拉黑”后会显示在这里。</p></div> : null}
            </div>
          </article>
        </section>
      ) : null}

      {tab === '黑名单记录' ? (
        <article className="panel">
          <div className="panel__head"><div><h2>黑名单记录</h2><p>被拉黑后，同一邮箱或手机号不能再次注册；可在这里解除拉黑。</p></div><StatusPill tone={visibleBlacklist.length ? 'critical' : 'muted'}>{visibleBlacklist.length} 人</StatusPill></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>姓名</th><th>邮箱</th><th>手机号</th><th>地区</th><th>原因</th><th>拉黑时间</th><th>操作</th></tr></thead>
              <tbody>
                {visibleBlacklist.length ? visibleBlacklist.map((entry) => <tr key={entry.id}><td><strong>{entry.name}</strong></td><td>{entry.email}</td><td>{entry.phone}</td><td>{entry.country}</td><td>{entry.reason}</td><td>{formatDateTime(entry.blacklistedAt)}</td><td><button type="button" className="btn btn--ghost btn--sm" onClick={() => void restoreBlacklist(entry.id)}>解除拉黑</button></td></tr>) : <tr><td colSpan={7}><div className="empty-inline"><span>暂无黑名单记录。</span></div></td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </div>
  );
}
