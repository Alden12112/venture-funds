import { useEffect, useMemo, useState } from 'react';
import { Headphones, MessageCircle, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { apiFetch, ApiError, isApiUnavailable } from '@/lib/api';
import { readStorage, writeStorage } from '@/lib/storage';
import { formatDateTime } from '@/lib/format';
import type { SupportMessage } from '@/types';

const whatsappUrl = 'https://wa.me/60178541111';
const telegramUrl = 'https://t.me/Alden_1022';

export function SupportCenter({ adminMode = false }: { adminMode?: boolean }) {
  const { session } = useAuth();
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [activeThreadId, setActiveThreadId] = useState('');
  const [status, setStatus] = useState('');

  const loadMessages = async () => {
    if (!session) return;
    try {
      const remote = await apiFetch<SupportMessage[]>('/api/support/messages');
      setMessages(remote);
      if (!activeThreadId && remote[0]) setActiveThreadId(remote[0].threadId);
      writeStorage(`supportMessages.${adminMode ? 'admin' : session.id}`, remote, { sync: false });
    } catch (error) {
      if (!(error instanceof ApiError) || !isApiUnavailable(error)) {
        setStatus(error instanceof Error ? error.message : '客服消息暂时不可用');
        return;
      }
      const local = readStorage<SupportMessage[]>(`supportMessages.${adminMode ? 'admin' : session.id}`, []);
      setMessages(local);
      if (!activeThreadId && local[0]) setActiveThreadId(local[0].threadId);
    }
  };

  useEffect(() => {
    void loadMessages();
    const timer = window.setInterval(() => void loadMessages(), 5000);
    return () => window.clearInterval(timer);
  }, [session?.id, adminMode]);

  const threads = useMemo(() => {
    const grouped = new Map<string, SupportMessage[]>();
    messages.forEach((message) => grouped.set(message.threadId, [...(grouped.get(message.threadId) ?? []), message]));
    return Array.from(grouped.entries()).map(([threadId, threadMessages]) => {
      const lastAdminMessage = threadMessages.map((message, index) => message.senderRole === 'admin' ? index : -1).reduce((latest, index) => Math.max(latest, index), -1);
      const unread = threadMessages.slice(lastAdminMessage + 1).filter((message) => message.senderRole === 'user').length;
      return { threadId, messages: threadMessages, latest: threadMessages.at(-1)!, unread };
    });
  }, [messages]);

  const selectedThread = threads.find((thread) => thread.threadId === activeThreadId) ?? threads[0];
  const visibleMessages = adminMode ? selectedThread?.messages ?? [] : messages;

  const sendMessage = async () => {
    const body = draft.trim();
    if (!body || !session || (adminMode && !selectedThread)) return;
    const input = { body, ...(adminMode ? { threadId: selectedThread.threadId } : activeThreadId ? { threadId: activeThreadId } : {}) };
    try {
      const created = await apiFetch<SupportMessage>('/api/support/messages', { method: 'POST', body: JSON.stringify(input) });
      setMessages((current) => [...current, created]);
      setActiveThreadId(created.threadId);
      setDraft('');
      setStatus('已发送');
    } catch (error) {
      if (!(error instanceof ApiError) || !isApiUnavailable(error)) {
        setStatus(error instanceof Error ? error.message : '发送失败');
        return;
      }
      const created: SupportMessage = {
        id: crypto.randomUUID(),
        threadId: activeThreadId || `support-${crypto.randomUUID()}`,
        userId: adminMode ? selectedThread?.latest.userId ?? '' : session.id,
        userName: adminMode ? selectedThread?.latest.userName ?? '' : session.name,
        userEmail: adminMode ? selectedThread?.latest.userEmail ?? '' : session.email,
        userPhone: adminMode ? selectedThread?.latest.userPhone ?? '' : session.phone ?? '',
        senderRole: adminMode ? 'admin' : 'user',
        body,
        createdAt: new Date().toISOString(),
      };
      const next = [...messages, created];
      setMessages(next);
      setActiveThreadId(created.threadId);
      writeStorage(`supportMessages.${adminMode ? 'admin' : session.id}`, next, { sync: false });
      setDraft('');
      setStatus('已保存到本地工作区');
    }
  };

  return (
    <section className={`support-console ${adminMode ? 'support-console--admin' : ''}`}>
      <div className="support-console__head">
        <div className="support-console__title">
          <span className="support-console__icon"><Headphones size={18} /></span>
          <div>
            <span className="eyebrow">{adminMode ? 'Operations desk' : 'Client care'}</span>
            <h2>{adminMode ? '客服收件箱' : '联系 AD88 客服'}</h2>
            <p>{adminMode ? '集中处理用户消息，回复会同步回前台账号。' : '你的消息会进入后台客服收件箱，回复后会在这里显示。'}</p>
            <small className="support-console__retention">消息记录保留 1 年 · 联系渠道已置于右侧</small>
          </div>
        </div>
        <div className="support-console__actions">
          <a className="support-channel support-channel--whatsapp" href={whatsappUrl} target="_blank" rel="noreferrer" aria-label="打开 WhatsApp">
            <MessageCircle size={16} /> WhatsApp
          </a>
          <a className="support-channel support-channel--telegram" href={telegramUrl} target="_blank" rel="noreferrer" aria-label="打开 Telegram">
            <Send size={16} /> Telegram
          </a>
          <button type="button" className="icon-button icon-button--small" onClick={() => void loadMessages()} aria-label="刷新客服消息"><RefreshCw size={15} /></button>
        </div>
      </div>

      <div className="support-console__body">
        {adminMode ? (
          <aside className="support-threads" aria-label="客服会话列表">
            {threads.length ? threads.map((thread) => (
              <button type="button" key={thread.threadId} className={`support-thread ${selectedThread?.threadId === thread.threadId ? 'is-active' : ''}`} onClick={() => setActiveThreadId(thread.threadId)}>
                <span className="support-thread__avatar">{thread.latest.userName.slice(0, 1).toUpperCase()}</span>
                <span><strong>{thread.latest.userName}</strong><small>{thread.latest.userEmail} · {thread.latest.userPhone || '未留手机号'}</small><small>{thread.latest.body}</small></span>
                <time>{formatDateTime(thread.latest.createdAt)}</time>
                {thread.unread ? <span className="support-thread__unread">{thread.unread} 条新消息</span> : null}
              </button>
            )) : <div className="support-empty">还没有新消息。</div>}
          </aside>
        ) : null}

        <div className="support-chat">
          <div className="support-chat__meta">
            <span><ShieldCheck size={14} /> {adminMode ? `${selectedThread?.latest.userEmail ?? '选择会话'} · ${selectedThread?.latest.userPhone || '未留手机号'}` : '加密客服通道'}</span>
            {status ? <span className="support-chat__status">{status}</span> : null}
          </div>
          <div className="support-chat__messages">
            {visibleMessages.length ? visibleMessages.map((message) => (
              <div key={message.id} className={`support-message support-message--${message.senderRole}`}>
                <div className="support-message__bubble">
                  <strong>{message.senderRole === 'admin' ? 'AD88 Support' : message.userName}</strong>
                  <p>{message.body}</p>
                  <time>{formatDateTime(message.createdAt)}</time>
                </div>
              </div>
            )) : <div className="support-empty support-empty--large"><MessageCircle size={24} /><strong>{adminMode ? '等待用户发来消息' : '需要帮助吗？'}</strong><span>{adminMode ? '新消息会自动出现在左侧收件箱。' : '发送一条消息，后台客服会在这里回复。'}</span></div>}
          </div>
          <div className="support-composer">
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={adminMode ? '回复当前会话…' : '输入你的问题…'} rows={2} />
            <button type="button" className="btn btn--primary" onClick={() => void sendMessage()} disabled={!draft.trim() || (adminMode && !selectedThread)}><Send size={16} />发送</button>
          </div>
        </div>
      </div>
    </section>
  );
}
