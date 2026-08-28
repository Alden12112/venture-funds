import { useEffect } from 'react';
import { Clock3, Eye, ShieldCheck, X } from 'lucide-react';
import { useLanguage } from '@/context/language-context';
import { useContentSettings } from '@/context/content-settings-context';
import { formatDateTime, formatMarketPrice } from '@/lib/format';
import type { TimedMarketScenario } from '@/types';

function remainingSeconds(scenario: TimedMarketScenario, now: number) {
  return Math.max(0, Math.ceil((new Date(scenario.expiresAt).getTime() - now) / 1000));
}

function progressPercent(scenario: TimedMarketScenario, now: number) {
  if (!scenario.durationSeconds) return 100;
  const remaining = remainingSeconds(scenario, now);
  return Math.max(0, Math.min(100, ((scenario.durationSeconds - remaining) / scenario.durationSeconds) * 100));
}

function formatCountdown(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return hours
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function directionLabel(scenario: TimedMarketScenario, t: (key: string) => string) {
  return scenario.direction === 'up' ? t('market.scenarioUp') : t('market.scenarioDown');
}

function resultLabel(scenario: TimedMarketScenario, t: (key: string) => string) {
  if (scenario.status === 'void') return t('market.scenarioCancelled');
  if (scenario.status === 'active') return t('market.scenarioWaiting');
  return t('market.scenarioRecorded');
}

function scoreLabel(scenario: TimedMarketScenario, t: (key: string) => string) {
  if (scenario.status === 'void') return t('market.scenarioScoreUnavailable');
  return `${scenario.observationPoints} ${t('market.scenarioScaleShort')}`;
}

export function TimedScenarioResultDialog({
  scenario,
  now,
  onClose,
}: {
  scenario: TimedMarketScenario;
  now: number;
  onClose: () => void;
}) {
  const { language, t } = useLanguage();
  const { getContent } = useContentSettings();
  const remaining = remainingSeconds(scenario, now);
  const active = scenario.status === 'active' && remaining > 0;
  const awaitingQuote = scenario.status === 'active' && remaining <= 0;
  const status = awaitingQuote ? t('market.scenarioAwaitingConfirmation') : resultLabel(scenario, t);
  const tone = active ? 'active' : scenario.status === 'void' ? 'void' : 'recorded';

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="scenario-result-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="scenario-result-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scenario-result-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="scenario-result-dialog__head">
          <div>
            <span className="scenario-result-dialog__eyebrow"><Eye size={13} /> {t('market.scenarioDialogEyebrow')}</span>
            <h2 id="scenario-result-dialog-title">{active || awaitingQuote ? t('market.scenarioDialogActiveTitle') : t('market.scenarioDialogResultTitle')}</h2>
            <p>{active || awaitingQuote ? t('market.scenarioDialogActiveHint') : t('market.scenarioDialogResultHint')}</p>
          </div>
          <button type="button" className="scenario-result-dialog__close" onClick={onClose} aria-label={t('market.scenarioDialogClose')}>
            <X size={18} />
          </button>
        </header>

        <div className="scenario-result-dialog__identity">
          <div className="scenario-result-dialog__instrument">
            <span>{scenario.symbol}</span>
            <div><strong>{directionLabel(scenario, t)}</strong></div>
          </div>
          <div className={`scenario-result-dialog__state scenario-result-dialog__state--${tone}`}>
            {active ? <Clock3 size={16} /> : null}
            <strong>{status}</strong>
          </div>
        </div>

        <div className={`scenario-result-dialog__timer scenario-result-dialog__timer--${tone}`}>
          <span>{active ? t('market.scenarioRemaining') : awaitingQuote ? t('market.scenarioAwaitingConfirmation') : t('market.scenarioDialogResultLabel')}</span>
          <strong>{active ? formatCountdown(remaining) : awaitingQuote ? '—' : status}</strong>
          <div className="scenario-result-dialog__progress" aria-hidden="true"><span style={{ width: `${progressPercent(scenario, now)}%` }} /></div>
        </div>

        <div className="scenario-result-dialog__details">
          <div><span>{t('market.scenarioSelected')}</span><strong>{scenario.symbol}</strong></div>
          <div><span>{t('market.scenarioDialogDirection')}</span><strong>{directionLabel(scenario, t)}</strong></div>
          <div><span>{t('market.scenarioReferencePrice')}</span><strong>{formatMarketPrice(scenario.referencePrice)}</strong></div>
          <div><span>{t('market.scenarioScore')}</span><strong>{scoreLabel(scenario, t)}</strong></div>
          <div><span>{t('market.scenarioExpires')}</span><strong>{formatDateTime(scenario.expiresAt)}</strong></div>
        </div>

        <footer className="scenario-result-dialog__footer">
          <ShieldCheck size={15} />
          <strong>{getContent('market.observationSafety', language)}</strong>
        </footer>
      </section>
    </div>
  );
}
