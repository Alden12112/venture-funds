import { useEffect } from 'react';
import { Clock3, Eye, X } from 'lucide-react';
import { AssetLogo } from '@/components/AssetLogo';
import { useLanguage } from '@/context/language-context';
import { useContentSettings } from '@/context/content-settings-context';
import { formatDateTime, formatMarketPrice } from '@/lib/format';
import type { TimedMarketScenario } from '@/types';
import {
  MARKET_SCENARIO_ADMIN_NOTE_LABEL_KEY,
  MARKET_SCENARIO_SCALE_KEY,
} from '@/lib/content-settings';

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
            <AssetLogo symbol={scenario.symbol} size="md" className="scenario-result-dialog__asset-logo" />
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

        <div className="scenario-result-dialog__end-time" data-testid="scenario-result-end-time">
          <Clock3 size={16} aria-hidden="true" />
          <div><span>{t('market.scenarioExpires')}</span><strong>{formatDateTime(scenario.expiresAt)}</strong></div>
        </div>

        <div className="scenario-result-dialog__details">
          <div data-testid="scenario-result-reference-price">
            <span>{t('market.scenarioReferencePrice')}</span>
            <strong>{formatMarketPrice(scenario.referencePrice)}</strong>
          </div>
          <div data-testid="scenario-result-observation-amount">
            <span>{getContent(MARKET_SCENARIO_SCALE_KEY, language)}</span>
            <strong>{scenario.observationPoints} {t('market.scenarioScaleShort')}</strong>
          </div>
          <div className="scenario-result-dialog__detail-note" data-testid="scenario-result-note">
            <span>{getContent(MARKET_SCENARIO_ADMIN_NOTE_LABEL_KEY, language)}</span>
            <strong>{scenario.adminNote || '—'}</strong>
          </div>
        </div>

      </section>
    </div>
  );
}
