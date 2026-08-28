import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Clock3, Eye, Gauge, LoaderCircle, MessageSquareText, ShieldCheck, TimerReset, XCircle } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { useContentSettings } from '@/context/content-settings-context';
import { apiFetch } from '@/lib/api';
import { formatDateTime, formatMarketPrice } from '@/lib/format';
import type { TimedMarketScenario, TimedScenarioDirection, TimedScenarioUnit } from '@/types';
import { TimedScenarioResultDialog } from '@/components/TimedScenarioResultDialog';
import {
  MARKET_SCENARIO_DIRECTION_HINT_KEY,
  MARKET_SCENARIO_INPUT_NOTE_KEY,
  MARKET_SCENARIO_SCALE_HINT_KEY,
  MARKET_SCENARIO_SCALE_KEY,
  MARKET_SCENARIO_SCALE_NOTE_KEY,
  MARKET_SCENARIO_WORKSPACE_SAFETY_KEY,
} from '@/lib/content-settings';

type Preset = { value: number; unit: TimedScenarioUnit };

const presets: Preset[] = [
  { value: 30, unit: 'sec' }, { value: 60, unit: 'sec' }, { value: 5, unit: 'min' },
  { value: 15, unit: 'min' }, { value: 1, unit: 'hour' }, { value: 4, unit: 'hour' },
];
const pointPresets = [10, 25, 50, 100];

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
  if (seconds >= 60) return `${Math.floor(seconds / 60)}${t('market.scenarioMinutes')}${seconds % 60 ? ` ${seconds % 60}${t('market.scenarioSeconds')}` : ''}`;
  return `${seconds}${t('market.scenarioSeconds')}`;
}

function formatCountdown(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return hours ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function remainingSeconds(scenario: TimedMarketScenario, now: number) {
  return Math.max(0, Math.ceil((new Date(scenario.expiresAt).getTime() - now) / 1000));
}

function progressPercent(scenario: TimedMarketScenario, now: number) {
  const remaining = remainingSeconds(scenario, now);
  if (!scenario.durationSeconds) return 100;
  return Math.max(0, Math.min(100, ((scenario.durationSeconds - remaining) / scenario.durationSeconds) * 100));
}

function directionLabel(direction: TimedScenarioDirection, t: (key: string) => string) {
  return direction === 'up' ? t('market.scenarioUp') : t('market.scenarioDown');
}

function resultLabel(scenario: TimedMarketScenario, t: (key: string) => string) {
  if (scenario.status === 'void') return t('market.scenarioCancelled');
  if (scenario.status === 'active') return t('market.scenarioWaiting');
  return t('market.scenarioRecorded');
}

export function TimedScenarioWorkspace({ symbol, price }: { symbol: string; price: number }) {
  const { session } = useAuth();
  const { language, t } = useLanguage();
  const { getContent } = useContentSettings();
  const [durationValue, setDurationValue] = useState('60');
  const [durationUnit, setDurationUnit] = useState<TimedScenarioUnit>('sec');
  const [observationPoints, setObservationPoints] = useState('10');
  const [direction, setDirection] = useState<TimedScenarioDirection>('up');
  const [scenarios, setScenarios] = useState<TimedMarketScenario[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [focusedScenarioId, setFocusedScenarioId] = useState<string | null>(null);

  const durationSeconds = secondsFor(durationValue, durationUnit);
  const points = Number(observationPoints);
  const durationValid = Number.isInteger(durationSeconds) && durationSeconds >= 1 && durationSeconds <= 7 * 24 * 60 * 60;
  const pointsValid = Number.isFinite(points) && Number.isInteger(points) && points >= 10;

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
    const refresh = window.setInterval(() => void loadScenarios(), 2_000);
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') void loadScenarios();
    };
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(refresh);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [session?.id]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timeout = window.setTimeout(() => setFeedback(null), 5_000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const visibleScenarios = useMemo(() => scenarios.slice(0, 5), [scenarios]);
  const focusedScenario = focusedScenarioId ? scenarios.find((item) => item.id === focusedScenarioId) ?? null : null;
  const activeCount = scenarios.filter((item) => item.status === 'active').length;
  const activeScenario = scenarios.find((item) => item.status === 'active' && remainingSeconds(item, now) > 0);
  const activeRemaining = activeScenario ? remainingSeconds(activeScenario, now) : 0;
  const activeProgress = activeScenario ? progressPercent(activeScenario, now) : 0;
  const elapsedSeconds = activeScenario ? Math.max(0, activeScenario.durationSeconds - activeRemaining) : 0;

  const selectPreset = (preset: Preset) => { setDurationValue(String(preset.value)); setDurationUnit(preset.unit); };

  const createScenario = async () => {
    if (!session || busy) return;
    if (!durationValid || !pointsValid) { setFeedback({ tone: 'error', message: t('market.scenarioValidation') }); return; }
    setBusy(true);
    try {
      const scenario = await apiFetch<TimedMarketScenario>('/api/market-scenarios', {
        method: 'POST',
        body: JSON.stringify({ symbol, direction, observationPoints: Math.round(points), durationSeconds }),
      });
      setScenarios((current) => [scenario, ...current.filter((item) => item.id !== scenario.id)]);
      setFocusedScenarioId(scenario.id);
      setFeedback({ tone: 'success', message: t('market.scenarioCreated') });
    } catch { setFeedback({ tone: 'error', message: t('market.scenarioFailed') }); }
    finally { setBusy(false); }
  };

  return (
    <section className="panel scenario-workspace" aria-labelledby="scenario-workspace-title">
      <div className="panel__head scenario-workspace__head">
        <div><span className="eyebrow"><Eye size={13} /> {t('market.scenarioEyebrow')}</span><h2 id="scenario-workspace-title">{t('market.scenarioTitle')}</h2><p>{t('market.scenarioHint')}</p></div>
        <div className="scenario-workspace__head-status"><span className="scenario-live-dot" aria-hidden="true" /><span>{activeCount} {t('market.scenarioActive')}</span></div>
      </div>

      <div className="scenario-instrument-strip">
        <div className="scenario-instrument-strip__asset"><span className="scenario-symbol-badge">{symbol.slice(0, 3)}</span><div><span>{t('market.scenarioSelected')}</span><strong>{symbol}</strong></div></div>
        <div className="scenario-instrument-strip__quote"><span>{t('market.scenarioCurrent')}</span><strong>{formatMarketPrice(price)}</strong></div>
        <div className="scenario-instrument-strip__status"><ShieldCheck size={15} /> {t('market.scenarioServerCapture')}</div>
      </div>

      {feedback ? <div className={`notice-banner notice-banner--${feedback.tone}`} role="status" aria-live="polite">{feedback.tone === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}<span>{feedback.message}</span></div> : null}

      <div className="scenario-workspace__grid scenario-workspace__grid--three">
        <div className="scenario-step scenario-step--duration">
          <div className="scenario-step__title"><span>01</span><div><strong>{t('market.scenarioDuration')}</strong><small>{t('market.scenarioDurationHint')}</small></div></div>
          <div className="scenario-preset-grid">{presets.map((preset) => { const active = durationValue === String(preset.value) && durationUnit === preset.unit; return <button key={`${preset.value}-${preset.unit}`} type="button" className={`scenario-preset ${active ? 'is-active' : ''}`} onClick={() => selectPreset(preset)}>{preset.value} {t(`market.scenarioUnit.${preset.unit}`)}</button>; })}</div>
          <div className="scenario-custom-duration"><label className="field"><span>{t('market.scenarioCustomDuration')}</span><input type="number" min="1" step="1" value={durationValue} onChange={(event) => setDurationValue(event.target.value)} aria-invalid={!durationValid} /></label><label className="field"><span>{t('market.scenarioUnitLabel')}</span><select value={durationUnit} onChange={(event) => setDurationUnit(event.target.value as TimedScenarioUnit)}><option value="sec">{t('market.scenarioUnit.sec')}</option><option value="min">{t('market.scenarioUnit.min')}</option><option value="hour">{t('market.scenarioUnit.hour')}</option></select></label></div>
          <div className="scenario-duration-readout"><Clock3 size={15} /><strong>{durationSeconds ? formatDuration(durationSeconds, t) : '—'}</strong><span>{t('market.scenarioDurationPreview')}</span></div>
        </div>

        <div className="scenario-step scenario-step--points">
          <div className="scenario-step__title"><span>02</span><div><strong>{getContent(MARKET_SCENARIO_SCALE_KEY, language)}</strong><small>{getContent(MARKET_SCENARIO_SCALE_HINT_KEY, language)}</small></div></div>
          <label className="field scenario-points-field"><span>{getContent(MARKET_SCENARIO_SCALE_KEY, language)}</span><div className="scenario-points-input"><input type="number" min="10" step="1" value={observationPoints} onChange={(event) => setObservationPoints(event.target.value)} aria-invalid={!pointsValid} /><b aria-hidden="true">USDT</b></div></label>
          <div className="scenario-points-note" role="note" data-content-key={MARKET_SCENARIO_SCALE_NOTE_KEY}><MessageSquareText size={14} aria-hidden="true" /><div><strong>{getContent(MARKET_SCENARIO_INPUT_NOTE_KEY, language)}</strong><p>{getContent(MARKET_SCENARIO_SCALE_NOTE_KEY, language)}</p></div></div>
          <div className="scenario-points-presets" aria-label={t('market.scenarioScalePresets')}>{pointPresets.map((value) => <button key={value} type="button" className={`scenario-points-preset ${points === value ? 'is-active' : ''}`} onClick={() => setObservationPoints(String(value))}>{value}</button>)}</div>
        </div>

        <div className="scenario-step scenario-step--direction">
          <div className="scenario-step__title"><span>03</span><div><strong>{t('market.scenarioDirection')}</strong><small>{getContent(MARKET_SCENARIO_DIRECTION_HINT_KEY, language)}</small></div></div>
          <div className="scenario-direction-grid"><button type="button" className={`scenario-direction scenario-direction--up ${direction === 'up' ? 'is-active' : ''}`} onClick={() => setDirection('up')}><ArrowUpRight size={21} /><strong>{t('market.scenarioUp')}</strong></button><button type="button" className={`scenario-direction scenario-direction--down ${direction === 'down' ? 'is-active' : ''}`} onClick={() => setDirection('down')}><ArrowDownRight size={21} /><strong>{t('market.scenarioDown')}</strong></button></div>
          <div className="scenario-direction-readout"><Gauge size={15} /><span>{directionLabel(direction, t)}</span><strong>{formatDuration(durationSeconds, t)}</strong></div>
        </div>
      </div>

      <div className="scenario-submit-row"><div className="scenario-submit-summary"><TimerReset size={16} /><span>{t('market.scenarioSubmitSummary').replace('{duration}', durationSeconds ? formatDuration(durationSeconds, t) : '—').replace('{scale}', Number.isFinite(points) ? String(points) : '—')}</span></div><button type="button" className="btn btn--primary scenario-submit" onClick={() => void createScenario()} disabled={!session || busy || !durationValid || !pointsValid} aria-busy={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Eye size={16} />} {busy ? t('market.scenarioSubmitting') : t('market.scenarioCreate')}</button></div>

      {activeScenario ? <section className="scenario-active-card" aria-live="polite"><div className="scenario-active-card__head"><div className="scenario-active-card__identity"><span className="scenario-active-card__pulse" /><div><span>{t('market.scenarioActiveNow')}</span><strong>{activeScenario.symbol} · {directionLabel(activeScenario.direction, t)}</strong></div></div><div className="scenario-active-card__countdown"><span>{t('market.scenarioRemaining')}</span><strong>{formatCountdown(activeRemaining)}</strong></div></div><div className="scenario-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(activeProgress)} aria-label={t('market.scenarioProgress')}><span style={{ width: `${activeProgress}%` }} /></div><div className="scenario-active-card__meta"><span><small>{t('market.scenarioReferencePrice')}</small><strong>{formatMarketPrice(activeScenario.referencePrice)}</strong></span><span><small>{t('market.scenarioElapsed')}</small><strong>{formatCountdown(elapsedSeconds)}</strong></span><span><small>{t('market.scenarioExpires')}</small><strong>{formatDateTime(activeScenario.expiresAt)}</strong></span></div></section> : null}

      <div className="scenario-safety-note"><ShieldCheck size={15} /><span>{getContent(MARKET_SCENARIO_WORKSPACE_SAFETY_KEY, language)}</span></div>
      <div className="scenario-history"><div className="scenario-history__head"><div><strong>{t('market.scenarioHistory')}</strong><span>{t('market.scenarioHistoryHint')}</span></div><span className="status-pill status-pill--muted">{visibleScenarios.length} / 5</span></div><div className="scenario-history__list">{visibleScenarios.length ? visibleScenarios.map((scenario) => { const remaining = remainingSeconds(scenario, now); const active = scenario.status === 'active' && remaining > 0; const displayStatus = active ? t('market.scenarioWaiting') : resultLabel(scenario, t); return <div key={scenario.id} className={`scenario-history__row scenario-history__row--${active ? 'active' : scenario.status}`}><div className="scenario-history__identity"><span className="scenario-history__symbol">{scenario.symbol}</span><div><strong>{directionLabel(scenario.direction, t)}</strong><span>{formatDuration(scenario.durationSeconds, t)} · {scenario.observationPoints} {t('market.scenarioScaleShort')}</span></div></div><div className="scenario-history__reference"><span>{t('market.scenarioReferencePrice')}</span><strong>{formatMarketPrice(scenario.referencePrice)}</strong></div><div className="scenario-history__clock">{active ? <><Clock3 size={14} /><strong>{formatCountdown(remaining)}</strong><span>{t('market.scenarioRemaining')}</span><span className="scenario-history__mini-progress"><span style={{ width: `${progressPercent(scenario, now)}%` }} /></span></> : <><strong>{displayStatus}</strong><span>{formatDateTime(scenario.settledAt ?? scenario.createdAt)}</span></>}<button type="button" className="scenario-history__view" onClick={() => setFocusedScenarioId(scenario.id)} aria-label={`${t('market.scenarioViewResult')}: ${scenario.symbol}`}>{t('market.scenarioViewResult')}</button></div></div>; }) : <div className="state-block scenario-history__empty"><strong>{t('market.scenarioNoRecords')}</strong><p>{t('market.scenarioNoRecordsHint')}</p></div>}</div></div>
      {focusedScenario ? <TimedScenarioResultDialog scenario={focusedScenario} now={now} onClose={() => setFocusedScenarioId(null)} /> : null}
    </section>
  );
}
