import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Headphones, ImagePlus, MessageCircle, RefreshCw, Send, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { apiFetch, ApiError, isApiUnavailable } from '@/lib/api';
import { readStorage, writeStorage } from '@/lib/storage';
import { formatDateTime } from '@/lib/format';
import { useLanguage } from '@/context/language-context';
import { useContentSettings } from '@/context/content-settings-context';
import { SUPPORT_TELEGRAM_KEY, SUPPORT_WHATSAPP_KEY } from '@/lib/content-settings';
import { buildTelegramUrl, buildWhatsappUrl } from '@/lib/support-links';
import type { SupportAttachment, SupportMessage } from '@/types';

const supportImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const supportImageLimit = 3;
const supportImageMaxBytes = 1_500_000;

function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('image read failed')));
    reader.addEventListener('error', () => reject(new Error('image read failed')));
    reader.readAsDataURL(file);
  });
}

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
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const whatsappUrl = buildWhatsappUrl(getContent(SUPPORT_WHATSAPP_KEY, language));
  const telegramUrl = buildTelegramUrl(getContent(SUPPORT_TELEGRAM_KEY, language));
  const recoveryHeaders = recovery ? { authorization: `Bearer ${recovery.token}` } : undefined;
  const supportPath = recovery ? '/api/support/recovery/messages' : '/api/support/messages';
  const storageOwner = adminMode ? 'admin' : recovery ? `recovery.${recovery.identity.email}` : session?.id;

  const loadMessages = async () => {
    if (!session && !recovery) return;
    try {
      const remote = await apiFetch<SupportMessage[]>(supportPath, { headers: recoveryHeaders });
      setMessages(remote);
      if (remote[0]) setActiveThreadId((current) => current || remote[0].threadId);
      if (!recovery && storageOwner) writeStorage(`supportMessages.${storageOwner}`, remote, { sync: false });
    } catch (error) {
      if (!(error instanceof ApiError) || !isApiUnavailable(error)) {
        setStatus(error instanceof Error ? error.message : t('support.unavailable'));
        return;
      }
      if (recovery || !storageOwner) return;
      const local = readStorage<SupportMessage[]>(`supportMessages.${storageOwner}`, []);
      setMessages(local);
      if (local[0]) setActiveThreadId((current) => current || local[0].threadId);
    }
  };

  useEffect(() => {
    void loadMessages();
    const timer = window.setInterval(() => void loadMessages(), 5000);
    return () => window.clearInterval(timer);
  }, [session?.id, adminMode, recovery?.token]);

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
      if (!supportImageMimeTypes.has(file.type)) {
        setStatus(t('support.imageType'));
        continue;
      }
      if (file.size <= 0 || file.size > supportImageMaxBytes) {
        setStatus(t('support.imageTooLarge'));
        continue;
      }
      try {
        nextAttachments.push({
          id: crypto.randomUUID(),
          name: file.name.trim().slice(0, 120) || 'image',
          mimeType: file.type,
          dataUrl: await fileAsDataUrl(file),
        });
      } catch {
        setStatus(t('support.deliveryFailed'));
      }
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
      setMessages((current) => [...current, created]);
      setActiveThreadId(created.threadId);
      setDraft('');
      setAttachments([]);
      setStatus(t('support.sent'));
    } catch (error) {
      if (recovery || !(error instanceof ApiError) || !isApiUnavailable(error)) {
        setStatus(error instanceof Error ? error.message : t('support.deliveryFailed'));
        return;
      }
      const created: SupportMessage = {
        id: crypto.randomUUID(),
        threadId: activeThreadId || `support-${crypto.randomUUID()}`,
        userId: adminMode ? selectedThread?.latest.userId ?? '' : session?.id ?? '',
        userName: adminMode ? selectedThread?.latest.userName ?? '' : session?.name ?? '',
        userEmail: adminMode ? selectedThread?.latest.userEmail ?? '' : session?.email ?? '',
        userPhone: adminMode ? selectedThread?.latest.userPhone ?? '' : session?.phone ?? '',
        senderRole: adminMode ? 'admin' : 'user',
        body,
        attachments,
        createdAt: new Date().toISOString(),
      };
      const next = [...messages, created];
      setMessages(next);
      setActiveThreadId(created.threadId);
      if (storageOwner) writeStorage(`supportMessages.${storageOwner}`, next, { sync: false });
      setDraft('');
      setAttachments([]);
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
              <button type="button" key={thread.threadId} className={`support-thread ${selectedThread?.threadId === thread.threadId ? 'is-active' : ''}`} onClick={() => { setActiveThreadId(thread.threadId); setAttachments([]); }}>
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
