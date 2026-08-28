import { useEffect, useMemo, useState } from 'react';
import { Headphones, MessageCircle, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { apiFetch, ApiError, isApiUnavailable } from '@/lib/api';
import { readStorage, writeStorage } from '@/lib/storage';
import { formatDateTime } from '@/lib/format';
import { useLanguage } from '@/context/language-context';
import type { SupportMessage } from '@/types';

export function SupportCenter({ adminMode = false, initialDraft = '' }: { adminMode?: boolean; initialDraft?: string }) {
  const { session } = useAuth();
  const { t } = useLanguage();
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState(initialDraft);
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
        setStatus(error instanceof Error ? error.message : t('support.unavailable'));
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

  useEffect(() => {
    if (!adminMode && initialDraft) setDraft((current) => current || initialDraft);
  }, [adminMode, initialDraft]);

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
      setStatus(t('support.sent'));
    } catch (error) {
      if (!(error instanceof ApiError) || !isApiUnavailable(error)) {
        setStatus(error instanceof Error ? error.message : t('support.deliveryFailed'));
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
      setStatus(t('support.sent'));
    }
  };

  return (
    <section className={`support-console ${adminMode ? 'support-console--admin' : ''}`}>
      <div className="support-console__head">
        <div className="support-console__title">
          <span className="support-console__icon"><Headphones size={18} /></span>
          <div>
            <span className="eyebrow">{adminMode ? t('support.operationsDesk') : t('support.clientCare')}</span>
            <h2>{adminMode ? t('support.inbox') : t('support.contact')}</h2>
            <p>{adminMode ? t('support.adminDescription') : t('support.clientDescription')}</p>
            <small className="support-console__retention">{t('support.retention')}</small>
          </div>
        </div>
        <div className="support-console__actions">
          <button type="button" className="icon-button icon-button--small" onClick={() => void loadMessages()} aria-label={t('support.refresh')}><RefreshCw size={15} /></button>
        </div>
      </div>

      <div className="support-console__body">
        {adminMode ? (
          <aside className="support-threads" aria-label={t('support.inbox')}>
            {threads.length ? threads.map((thread) => (
              <button type="button" key={thread.threadId} className={`support-thread ${selectedThread?.threadId === thread.threadId ? 'is-active' : ''}`} onClick={() => setActiveThreadId(thread.threadId)}>
                <span className="support-thread__avatar">{thread.latest.userName.slice(0, 1).toUpperCase()}</span>
                <span><strong>{thread.latest.userName}</strong><small>{thread.latest.userEmail} · {thread.latest.userPhone || t('support.noPhone')}</small><small>{thread.latest.body}</small></span>
                <time>{formatDateTime(thread.latest.createdAt)}</time>
                {thread.unread ? <span className="support-thread__unread">{t('support.unreadCount').replace('{count}', String(thread.unread))}</span> : null}
              </button>
            )) : <div className="support-empty">{t('support.noNewMessages')}</div>}
          </aside>
        ) : null}

        <div className="support-chat">
          <div className="support-chat__meta">
            <span><ShieldCheck size={14} /> {adminMode ? `${selectedThread?.latest.userEmail ?? t('support.selectThread')} · ${selectedThread?.latest.userPhone || t('support.noPhone')}` : t('support.protectedChannel')}</span>
            {status ? <span className="support-chat__status">{status}</span> : null}
          </div>
          <div className="support-chat__messages">
            {visibleMessages.length ? visibleMessages.map((message) => (
              <div key={message.id} className={`support-message support-message--${message.senderRole}`}>
                <div className="support-message__bubble">
                   <strong>{message.senderRole === 'admin' ? `VENTURE FUNDS ${t('support.clientCare')}` : message.userName}</strong>
                  <p>{message.body}</p>
                  <time>{formatDateTime(message.createdAt)}</time>
                </div>
              </div>
            )) : <div className="support-empty support-empty--large"><MessageCircle size={24} /><strong>{adminMode ? t('support.waiting') : t('support.needHelp')}</strong><span>{adminMode ? t('support.waitingHint') : t('support.needHelpHint')}</span></div>}
          </div>
          <div className="support-composer">
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={adminMode ? t('support.replyPlaceholder') : t('support.questionPlaceholder')} rows={2} />
            <button type="button" className="btn btn--primary" onClick={() => void sendMessage()} disabled={!draft.trim() || (adminMode && !selectedThread)}><Send size={16} /> {t('support.send')}</button>
          </div>
        </div>
      </div>
    </section>
  );
}
