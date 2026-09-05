import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Headphones, ImagePlus, MessageCircle, RefreshCw, Send, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { apiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useLanguage } from '@/context/language-context';
import { useContentSettings } from '@/context/content-settings-context';
import { SUPPORT_TELEGRAM_KEY, SUPPORT_WHATSAPP_KEY } from '@/lib/content-settings';
import { prepareSupportImage, supportImageLimit } from '@/lib/support-images';
import { countUnreadSupportMessages, markSupportMessagesRead, type SupportReadScope } from '@/lib/support-read-state';
import { buildTelegramUrl, buildWhatsappUrl } from '@/lib/support-links';
import type { SupportAttachment, SupportMessage } from '@/types';

export interface RecoverySupportSession {
  token: string;
  identity: {
    name: string;
    email: string;
    phone: string;
  };
}

function SupportChannelActions({
  whatsappUrl,
  telegramUrl,
  t,
  compact = false,
}: {
  whatsappUrl: string;
  telegramUrl: string;
  t: (key: string) => string;
  compact?: boolean;
}) {
  const whatsappLabel = `${t('support.whatsapp')} · ${whatsappUrl ? t('support.openChannel') : t('support.channelNotConfigured')}`;
  const telegramLabel = `${t('support.telegram')} · ${telegramUrl ? t('support.openChannel') : t('support.channelNotConfigured')}`;
  const linkClass = (channel: 'whatsapp' | 'telegram', configured: boolean) => [
    'support-channel-link',
    `support-channel-link--${channel}`,
    compact ? 'support-channel-link--compact' : '',
    configured ? '' : 'support-channel-link--unconfigured',
  ].filter(Boolean).join(' ');

  return (
    <div className={`support-channel-actions ${compact ? 'support-channel-actions--compact' : ''}`} aria-label={t('support.externalChannels')}>
      {whatsappUrl ? (
        <a className={linkClass('whatsapp', true)} href={whatsappUrl} target="_blank" rel="noreferrer" aria-label={compact ? whatsappLabel : undefined} title={whatsappLabel} data-channel-configured="true">
          <span className="support-channel-link__brand" aria-hidden="true"><MessageCircle size={16} /></span>
          {!compact ? <><span>{t('support.whatsapp')}</span><ExternalLink size={13} aria-hidden="true" /><span className="sr-only">{t('support.openChannel')}</span></> : null}
        </a>
      ) : (
        <span className={linkClass('whatsapp', false)} role="img" aria-disabled="true" aria-label={whatsappLabel} title={whatsappLabel} data-channel-configured="false">
          <span className="support-channel-link__brand" aria-hidden="true"><MessageCircle size={16} /></span>
          {!compact ? <span>{t('support.whatsapp')}</span> : null}
        </span>
      )}
      {telegramUrl ? (
        <a className={linkClass('telegram', true)} href={telegramUrl} target="_blank" rel="noreferrer" aria-label={compact ? telegramLabel : undefined} title={telegramLabel} data-channel-configured="true">
          <span className="support-channel-link__brand" aria-hidden="true"><Send size={15} /></span>
          {!compact ? <><span>{t('support.telegram')}</span><ExternalLink size={13} aria-hidden="true" /><span className="sr-only">{t('support.openChannel')}</span></> : null}
        </a>
      ) : (
        <span className={linkClass('telegram', false)} role="img" aria-disabled="true" aria-label={telegramLabel} title={telegramLabel} data-channel-configured="false">
          <span className="support-channel-link__brand" aria-hidden="true"><Send size={15} /></span>
          {!compact ? <span>{t('support.telegram')}</span> : null}
        </span>
      )}
    </div>
  );
}

export function SupportCenter({
  adminMode = false,
  initialDraft = '',
  recovery,
}: {
  adminMode?: boolean;
  initialDraft?: string;
  recovery?: RecoverySupportSession;
}) {
  const { session } = useAuth();
  const { language, t } = useLanguage();
  const { getContent } = useContentSettings();
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState(initialDraft);
  const [attachments, setAttachments] = useState<SupportAttachment[]>([]);
  const [activeThreadId, setActiveThreadId] = useState('');
  const [status, setStatus] = useState('');
  const [readVersion, setReadVersion] = useState(0);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const whatsappUrl = buildWhatsappUrl(getContent(SUPPORT_WHATSAPP_KEY, language));
  const telegramUrl = buildTelegramUrl(getContent(SUPPORT_TELEGRAM_KEY, language));
  const recoveryHeaders = recovery ? { authorization: `Bearer ${recovery.token}` } : undefined;
  const supportPath = recovery ? '/api/support/recovery/messages' : '/api/support/messages';

  const readScope: SupportReadScope = adminMode ? 'admin' : 'user';

  const loadMessages = async (preserveStatus = false) => {
    if (!session && !recovery) return;
    try {
      const remote = await apiFetch<SupportMessage[]>(supportPath, { headers: recoveryHeaders, cache: 'no-store' });
      setMessages(remote);
      if (remote.length) setActiveThreadId((current) => current || remote.at(-1)?.threadId || '');
      if (!preserveStatus) setStatus('');
      return remote;
    } catch {
      // Support is shared across devices. Do not replace the last server
      // state with a browser-only fallback, which can make each side appear
      // to be talking only to itself during a transient network failure.
      if (!preserveStatus) setStatus(t('support.unavailable'));
      return null;
    }
  };

  useEffect(() => {
    void loadMessages();
    const timer = window.setInterval(() => void loadMessages(), 2_000);
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') void loadMessages();
    };
    document.addEventListener('visibilitychange', refreshOnReturn);
    window.addEventListener('focus', refreshOnReturn);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshOnReturn);
      window.removeEventListener('focus', refreshOnReturn);
    };
  }, [session?.id, adminMode, recovery?.token]);

  useEffect(() => {
    if (!adminMode && initialDraft) setDraft((current) => current || initialDraft);
  }, [adminMode, initialDraft]);

  const threads = useMemo(() => {
    const grouped = new Map<string, SupportMessage[]>();
    messages.forEach((message) => grouped.set(message.threadId, [...(grouped.get(message.threadId) ?? []), message]));
    return Array.from(grouped.entries()).map(([threadId, threadMessages]) => {
      const unread = session ? countUnreadSupportMessages(threadMessages, readScope, session.id, threadId) : 0;
      return { threadId, messages: threadMessages, latest: threadMessages.at(-1)!, unread };
    }).sort((left, right) => Date.parse(right.latest.createdAt) - Date.parse(left.latest.createdAt));
  }, [messages, readScope, readVersion, session]);

  const selectedThread = threads.find((thread) => thread.threadId === activeThreadId) ?? threads[0];
  const visibleMessages = adminMode ? selectedThread?.messages ?? [] : messages;

  useEffect(() => {
    if (!session || recovery || !messages.length) return;
    const messagesToMark = adminMode ? selectedThread?.messages ?? [] : messages;
    if (markSupportMessagesRead(messagesToMark, readScope, session.id, adminMode ? selectedThread?.threadId : undefined)) {
      setReadVersion((version) => version + 1);
    }
  }, [adminMode, messages, readScope, recovery, selectedThread?.threadId, session]);

  const selectAttachments = async (files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) return;
    const availableSlots = supportImageLimit - attachments.length;
    if (availableSlots <= 0) {
      setStatus(t('support.imageLimit').replace('{count}', String(supportImageLimit)));
      return;
    }
    const eligibleFiles = selectedFiles.slice(0, availableSlots);
    if (selectedFiles.length > availableSlots) setStatus(t('support.imageLimit').replace('{count}', String(supportImageLimit)));

    const nextAttachments: SupportAttachment[] = [];
    for (const file of eligibleFiles) {
      const result = await prepareSupportImage(file);
      if ('attachment' in result) nextAttachments.push(result.attachment);
      else if (result.error === 'type') setStatus(t('support.imageType'));
      else if (result.error === 'size') setStatus(t('support.imageTooLarge'));
      else setStatus(t('support.deliveryFailed'));
    }
    if (nextAttachments.length) {
      setAttachments((current) => [...current, ...nextAttachments].slice(0, supportImageLimit));
      setStatus(t('support.imageAttached').replace('{count}', String(nextAttachments.length)));
    }
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  };

  const sendMessage = async () => {
    const body = draft.trim();
    if ((!body && !attachments.length) || (!session && !recovery) || (adminMode && !selectedThread)) return;
    const input = {
      body,
      attachments,
      ...(adminMode ? { threadId: selectedThread.threadId } : activeThreadId ? { threadId: activeThreadId } : {}),
    };
    try {
      const created = await apiFetch<SupportMessage>(supportPath, { method: 'POST', headers: recoveryHeaders, body: JSON.stringify(input) });
      setMessages((current) => [...current.filter((message) => message.id !== created.id), created]);
      setActiveThreadId(created.threadId);
      setDraft('');
      setAttachments([]);
      setStatus(t('support.sent'));
      await loadMessages(true);
    } catch {
      setStatus(t('support.deliveryFailed'));
    }
  };

  return (
    <section className={`support-console ${adminMode ? 'support-console--admin' : ''}`}>
      <div className="support-console__head">
        <div className="support-console__title">
          <span className="support-console__icon"><Headphones size={18} /></span>
          <div>
            <span className="eyebrow">{adminMode ? t('support.operationsDesk') : t('support.clientCare')}</span>
            <h2>{adminMode ? t('support.inbox') : recovery ? t('support.recoveryChat') : t('support.contact')}</h2>
            {adminMode ? <p>{t('support.adminDescription')}</p> : null}
            <small className="support-console__retention">{t('support.retention')}</small>
          </div>
        </div>
        <div className="support-console__actions">
          <SupportChannelActions whatsappUrl={whatsappUrl} telegramUrl={telegramUrl} t={t} compact />
          <button type="button" className="icon-button icon-button--small" onClick={() => void loadMessages()} aria-label={t('support.refresh')}><RefreshCw size={15} /></button>
        </div>
      </div>

      <div className="support-console__body">
        {adminMode ? (
          <aside className="support-threads" aria-label={t('support.inbox')}>
            {threads.length ? threads.map((thread) => (
              <button type="button" key={thread.threadId} className={`support-thread ${selectedThread?.threadId === thread.threadId ? 'is-active' : ''}`} onClick={() => { setActiveThreadId(thread.threadId); setAttachments([]); if (session && markSupportMessagesRead(thread.messages, readScope, session.id, thread.threadId)) setReadVersion((version) => version + 1); }}>
                <span className="support-thread__avatar">{thread.latest.userName.slice(0, 1).toUpperCase()}</span>
                <span><strong>{thread.latest.userName}</strong><small>{thread.latest.userEmail} · {thread.latest.userPhone || t('support.noPhone')}</small><small>{thread.latest.body || (thread.latest.attachments?.length ? t('support.imageAttached').replace('{count}', String(thread.latest.attachments.length)) : '')}</small></span>
                <time>{formatDateTime(thread.latest.createdAt)}</time>
                {thread.unread ? <span className="support-thread__unread">{t('support.unreadCount').replace('{count}', String(thread.unread))}</span> : null}
              </button>
            )) : <div className="support-empty">{t('support.noNewMessages')}</div>}
          </aside>
        ) : null}

        <div className="support-chat">
          <div className="support-chat__meta">
            <span><ShieldCheck size={14} /> {adminMode ? `${selectedThread?.latest.userEmail ?? t('support.selectThread')} · ${selectedThread?.latest.userPhone || t('support.noPhone')}` : recovery ? `${recovery.identity.email} · ${recovery.identity.phone}` : t('support.protectedChannel')}</span>
            {status ? <span className="support-chat__status">{status}</span> : null}
          </div>
          <div className="support-chat__messages">
            {visibleMessages.length ? visibleMessages.map((message) => (
              <div key={message.id} className={`support-message support-message--${message.senderRole}`}>
                <div className="support-message__bubble">
                   <strong>{message.senderRole === 'admin' ? `VENTURE FUNDS ${t('support.clientCare')}` : message.userName}</strong>
                  {message.body ? <p>{message.body}</p> : null}
                  {message.attachments?.length ? (
                    <div className="support-message__attachments" aria-label={t('support.imagePreview')}>
                      {message.attachments.map((attachment) => (
                        <a key={attachment.id} className="support-message__attachment" href={attachment.dataUrl} target="_blank" rel="noreferrer" title={attachment.name} aria-label={`${t('support.imagePreview')}: ${attachment.name}`}>
                          <img src={attachment.dataUrl} alt={attachment.name} />
                        </a>
                      ))}
                    </div>
                  ) : null}
                  <time>{formatDateTime(message.createdAt)}</time>
                </div>
              </div>
            )) : <div className="support-empty support-empty--large"><MessageCircle size={24} /><strong>{adminMode ? t('support.waiting') : recovery ? t('support.recoveryNeedHelp') : t('support.needHelp')}</strong><span>{adminMode ? t('support.waitingHint') : recovery ? t('support.recoveryNeedHelpHint') : t('support.needHelpHint')}</span></div>}
          </div>
          <div className="support-composer">
            {attachments.length ? (
              <div className="support-composer__attachments" aria-label={t('support.imagePreview')}>
                {attachments.map((attachment) => (
                  <figure key={attachment.id} className="support-composer__attachment" title={attachment.name}>
                    <img src={attachment.dataUrl} alt={attachment.name} />
                    <button type="button" onClick={() => removeAttachment(attachment.id)} aria-label={`${t('support.removeImage')}: ${attachment.name}`} title={t('support.removeImage')}><X size={13} /></button>
                  </figure>
                ))}
              </div>
            ) : null}
            <div className="support-composer__field">
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={adminMode ? t('support.replyPlaceholder') : recovery ? t('support.recoveryQuestionPlaceholder') : t('support.questionPlaceholder')} rows={2} />
              <input ref={attachmentInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={(event) => { void selectAttachments(event.target.files); event.target.value = ''; }} />
              <button type="button" className="icon-button icon-button--small support-composer__attach" onClick={() => attachmentInputRef.current?.click()} aria-label={t('support.attachImage')} title={t('support.attachImage')} disabled={attachments.length >= supportImageLimit}><ImagePlus size={17} /></button>
            </div>
            <button type="button" className="btn btn--primary support-composer__send" onClick={() => void sendMessage()} disabled={(!draft.trim() && !attachments.length) || (adminMode && !selectedThread)}><Send size={16} /> {t('support.send')}</button>
          </div>
        </div>
      </div>
    </section>
  );
}
