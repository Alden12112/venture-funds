import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Clock3, Eye, LoaderCircle, ShieldCheck, XCircle } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { apiFetch } from '@/lib/api';
import { formatDateTime, formatMarketPrice } from '@/lib/format';
import type { TimedMarketScenario, TimedScenarioDirection, TimedScenarioUnit } from '@/types';

type Preset = {
  value: number;
  unit: TimedScenarioUnit;
};

const presets: Preset[] = [
  { value: 30, unit: 'sec' },
  { value: 60, unit: 'sec' },
  { value: 5, unit: 'min' },
  { value: 15, unit: 'min' },
  { value: 1, unit: 'hour' },
  { value: 4, unit: 'hour' },
];

function secondsFor(value: string, unit: TimedScenarioUnit) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  const multiplier = unit === 'hour' ? 60 * 60 : unit === 'min' ? 60 : 1;
  return Math.round(parsed * multiplier);
}

function formatDuration(seconds: number, t: (key: string) => string) {
  if (seconds >= 60 * 60) {
    const hours = Math.floor(seconds / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);
    return `${hours}${t('market.scenarioHours')}${minutes ? ` ${minutes}${t('market.scenarioMinutes')}` : ''}`;
  }
  if (seconds >= 60) {
    return `${Math.floor(seconds / 60)}${t('market.scenarioMinutes')}${seconds % 60 ? ` ${seconds % 60}${t('market.scenarioSeconds')}` : ''}`;
  }
  return `${seconds}${t('market.scenarioSeconds')}`;
}

function remainingSeconds(scenario: TimedMarketScenario, now: number) {
  return Math.max(0, Math.ceil((new Date(scenario.expiresAt).getTime() - now) / 1000));
}

function directionLabel(direction: TimedScenarioDirection, t: (key: string) => string) {
  return direction === 'up' ? t('market.scenarioUp') : t('market.scenarioDown');
}

function resultLabel(scenario: TimedMarketScenario, t: (key: string) => string) {
  if (scenario.status === 'void') return t('market.scenarioCancelled');
  if (scenario.status === 'active') return t('market.scenarioWaiting');
  if (scenario.result === 'confirmed') return t('market.scenarioConfirmed');
  if (scenario.result === 'flat') return t('market.scenarioFlat');
  return t('market.scenarioNotConfirmed');
}

export function TimedScenarioWorkspace({ symbol, price }: { symbol: string; price: number }) {
  const { session } = useAuth();
  const { t } = useLanguage();
  const [durationValue, setDurationValue] = useState('60');
  const [durationUnit, setDurationUnit] = useState<TimedScenarioUnit>('sec');
  const [observationPoints, setObservationPoints] = useState('10');
  const [direction, setDirection] = useState<TimedScenarioDirection>('up');
  const [scenarios, setScenarios] = useState<TimedMarketScenario[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const durationSeconds = secondsFor(durationValue, durationUnit);
  const points = Number(observationPoints);

  const loadScenarios = async () => {
    if (!session?.id) return;
    try {
      const data = await apiFetch<TimedMarketScenario[]>('/api/market-scenarios');
      setScenarios(Array.isArray(data) ? data : []);
    } catch {
      // Keep the last known state visible while a transient read is retried.
    }
  };

  useEffect(() => {
    void loadScenarios();
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    const refresh = window.setInterval(() => void loadScenarios(), 5_000);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(refresh);
    };
  }, [session?.id]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timeout = window.setTimeout(() => setFeedback(null), 5_000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const visibleScenarios = useMemo(() => scenarios.slice(0, 5), [scenarios]);
  const activeCount = scenarios.filter((item) => item.status === 'active').length;

  const selectPreset = (preset: Preset) => {
    setDurationValue(String(preset.value));
    setDurationUnit(preset.unit);
  };

  const createScenario = async () => {
    if (!session || busy || durationSeconds < 1 || !Number.isFinite(points) || points < 10) return;
    setBusy(true);
    try {
      const scenario = await apiFetch<TimedMarketScenario>('/api/market-scenarios', {
        method: 'POST',
        body: JSON.stringify({ symbol, direction, observationPoints: Math.round(points), durationSeconds }),
      });
      setScenarios((current) => [scenario, ...current.filter((item) => item.id !== scenario.id)]);
      setFeedback({ tone: 'success', message: t('market.scenarioCreated') });
    } catch {
      setFeedback({ tone: 'error', message: t('market.scenarioFailed') });
    } finally {
      setBusy(false);
    }
  };

  const activeScenario = visibleScenarios.find((item) => item.status === 'active');

  return (
    <section className="panel scenario-workspace" aria-labelledby="scenario-workspace-title">
      <div className="panel__head scenario-workspace__head">
        <div>
          <span className="eyebrow"><Eye size={13} /> {t('market.scenarioEyebrow')}</span>
          <h2 id="scenario-workspace-title">{t('market.scenarioTitle')}</h2>
          <p>{t('market.scenarioHint')}</p>
        </div>
        <div className="scenario-workspace__head-status">
          <span className="scenario-live-dot" aria-hidden="true" />
          <span>{activeCount} {t('market.scenarioActive')}</span>
        </div>
      </div>

      <div className="scenario-instrument-strip">
        <div className="scenario-instrument-strip__asset">
          <span className="scenario-symbol-badge">{symbol.slice(0, 3)}</span>
          <div><span>{t('market.scenarioSelected')}</span><strong>{symbol}</strong></div>
        </div>
        <div className="scenario-instrument-strip__quote">
          <span>{t('market.scenarioCurrent')}</span>
          <strong>{formatMarketPrice(price)}</strong>
        </div>
        <div className="scenario-instrument-strip__status"><ShieldCheck size={15} /> {t('market.scenarioServerCapture')}</div>
      </div>

      {feedback ? (
        <div className={`notice-banner notice-banner--${feedback.tone}`} role="status" aria-live="polite">
          {feedback.tone === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          <span>{feedback.message}</span>
        </div>
      ) : null}

      <div className="scenario-workspace__grid">
        <div className="scenario-step scenario-step--duration">
          <div className="scenario-step__title"><span>01</span><div><strong>{t('market.scenarioDuration')}</strong><small>{t('market.scenarioDurationHint')}</small></div></div>
          <div className="scenario-preset-grid">
            {presets.map((preset) => {
              const active = durationValue === String(preset.value) && durationUnit === preset.unit;
              return <button key={`${preset.value}-${preset.unit}`} type="button" className={`scenario-preset ${active ? 'is-active' : ''}`} onClick={() => selectPreset(preset)}>{preset.value} {t(`market.scenarioUnit.${preset.unit}`)}</button>;
            })}
          </div>
          <div className="scenario-custom-duration">
            <label className="field"><span>{t('market.scenarioCustomDuration')}</span><input type="number" min="1" step="1" value={durationValue} onChange={(event) => setDurationValue(event.target.value)} /></label>
            <label className="field"><span>{t('market.scenarioUnitLabel')}</span><select value={durationUnit} onChange={(event) => setDurationUnit(event.target.value as TimedScenarioUnit)}><option value="sec">{t('market.scenarioUnit.sec')}</option><option value="min">{t('market.scenarioUnit.min')}</option><option value="hour">{t('market.scenarioUnit.hour')}</option></select></label>
          </div>
          <div className="scenario-duration-readout"><Clock3 size={15} /><strong>{durationSeconds ? formatDuration(durationSeconds, t) : '—'}</strong><span>{t('market.scenarioDurationPreview')}</span></div>
        </div>

        <div className="scenario-step scenario-step--direction">
          <div className="scenario-step__title"><span>02</span><div><strong>{t('market.scenarioDirection')}</strong><small>{t('market.scenarioDirectionHint')}</small></div></div>
          <label className="field scenario-points-field"><span>{t('market.scenarioPoints')}</span><input type="number" min="10" step="1" value={observationPoints} onChange={(event) => setObservationPoints(event.target.value)} /></label>
          <small className="field-hint">{t('market.scenarioPointsHint')}</small>
          <div className="scenario-direction-grid">
            <button type="button" className={`scenario-direction scenario-direction--up ${direction === 'up' ? 'is-active' : ''}`} onClick={() => setDirection('up')}><ArrowUpRight size={21} /><strong>{t('market.scenarioUp')}</strong><small>{t('market.scenarioUpHint')}</small></button>
            <button type="button" className={`scenario-direction scenario-direction--down ${direction === 'down' ? 'is-active' : ''}`} onClick={() => setDirection('down')}><ArrowDownRight size={21} /><strong>{t('market.scenarioDown')}</strong><small>{t('market.scenarioDownHint')}</small></button>
          </div>
          <button type="button" className="btn btn--primary btn--block scenario-submit" onClick={() => void createScenario()} disabled={!session || busy || durationSeconds < 1 || !Number.isFinite(points) || points < 10} aria-busy={busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Eye size={16} />} {busy ? t('market.scenarioSubmitting') : t('market.scenarioCreate')}
          </button>
        </div>
      </div>

      <div className="scenario-safety-note"><ShieldCheck size={15} /><span>{t('market.scenarioSafety')}</span></div>

      <div className="scenario-history">
        <div className="scenario-history__head"><div><strong>{t('market.scenarioHistory')}</strong><span>{t('market.scenarioHistoryHint')}</span></div><span className="status-pill status-pill--muted">{visibleScenarios.length} / 5</span></div>
        <div className="scenario-history__list">
          {visibleScenarios.length ? visibleScenarios.map((scenario) => {
            const remaining = remainingSeconds(scenario, now);
            const active = scenario.status === 'active' && remaining > 0;
            const displayStatus = active ? t('market.scenarioWaiting') : resultLabel(scenario, t);
            return (
              <div key={scenario.id} className={`scenario-history__row scenario-history__row--${active ? 'active' : scenario.result ?? scenario.status}`}>
                <div className="scenario-history__identity"><span className="scenario-history__symbol">{scenario.symbol}</span><div><strong>{directionLabel(scenario.direction, t)}</strong><span>{formatDuration(scenario.durationSeconds, t)} · {scenario.observationPoints} {t('market.scenarioPointsShort')}</span></div></div>
                <div className="scenario-history__reference"><span>{t('market.scenarioReferencePrice')}</span><strong>{formatMarketPrice(scenario.referencePrice)}</strong></div>
                <div className="scenario-history__clock">{active ? <><Clock3 size={14} /><strong>{formatDuration(remaining, t)}</strong><span>{t('market.scenarioRemaining')}</span></> : <><span className="scenario-result-dot" /><strong>{displayStatus}</strong><span>{scenario.settlementPrice ? `${t('market.scenarioSettlementPrice')} ${formatMarketPrice(scenario.settlementPrice)}` : formatDateTime(scenario.settledAt ?? scenario.createdAt)}</span></>}</div>
              </div>
            );
          }) : <div className="state-block scenario-history__empty"><strong>{t('market.scenarioNoRecords')}</strong><p>{t('market.scenarioNoRecordsHint')}</p></div>}
        </div>
      </div>
    </section>
  );
}
