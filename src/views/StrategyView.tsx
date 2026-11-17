import React, { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  CheckCircle2,
  Landmark,
  Plus,
  RotateCcw,
  Shield,
  SlidersHorizontal,
  Terminal,
  X,
  Zap,
} from 'lucide-react';
import { useBot } from '../engine/botContext';
import {
  ALL_SCANNER_ASSETS,
  DEFAULT_STRATEGY_CONFIG,
  PRESET_CONFIGS,
  PresetId,
  StrategyConfig,
} from '../engine/types';

export const StrategyView: React.FC = () => {
  const { config, updateConfig, showToast } = useBot();
  const [draft, setDraft] = useState<StrategyConfig>(config);
  const [syncAt, setSyncAt] = useState<string>(new Date().toLocaleTimeString('pl-PL'));
  const [hotReloadBanner, setHotReloadBanner] = useState(false);
  const [addPairOpen, setAddPairOpen] = useState(false);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const applyPreset = (presetId: PresetId) => {
    const patch = PRESET_CONFIGS[presetId];
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleHotReload = () => {
    updateConfig(
      draft,
      `Hot-Reload: Z-Score ${draft.zScoreThreshold.toFixed(2)}σ | RSI(${draft.rsiLongMax}/${draft.rsiShortMin}) | ADX<${draft.adxMax} | ${draft.leverage}x`
    );
    setSyncAt(new Date().toLocaleTimeString('pl-PL'));
    setHotReloadBanner(true);
    showToast('Parametry strategii zaktualizowane i przeładowane w silniku.', 'success');
    window.setTimeout(() => setHotReloadBanner(false), 4000);
  };

  const handleReset = () => {
    setDraft(DEFAULT_STRATEGY_CONFIG);
    updateConfig(DEFAULT_STRATEGY_CONFIG, 'Przywrócono domyślne parametry strategii.');
    showToast('Przywrócono domyślne parametry strategii.', 'success');
  };

  const removePair = (base: string) => {
    if (draft.activePairs.length <= 1) {
      showToast('Musi pozostać co najmniej jedna aktywna para.', 'warning');
      return;
    }
    setDraft((prev) => ({
      ...prev,
      activePairs: prev.activePairs.filter((b) => b !== base),
    }));
  };

  const addPair = (base: string) => {
    if (!draft.activePairs.includes(base)) {
      setDraft((prev) => ({ ...prev, activePairs: [...prev.activePairs, base] }));
    }
    setAddPairOpen(false);
  };

  const availableToAdd = ALL_SCANNER_ASSETS.filter((a) => !draft.activePairs.includes(a));

  // Estimated daily signal frequency & theoretical win rate based on Z-Score + ADX gate
  const estimatedSignalsPerDay = useMemo(() => {
    const perPair = 3.2 * Math.exp(-0.95 * (draft.zScoreThreshold - 1.5));
    const tfFactor = draft.timeframe === '1' ? 2.4 : draft.timeframe === '3' ? 1.3 : 1.0;
    return Math.max(4, Math.round(perPair * draft.activePairs.length * tfFactor));
  }, [draft.zScoreThreshold, draft.activePairs.length, draft.timeframe]);

  const estimatedWinRate = useMemo(() => {
    const tpBonus = draft.tpMode === 'atr' && draft.tpAtrMult <= 1.5 ? 5.5 : 0;
    const base = 54 + (draft.zScoreThreshold - 1.5) * 8.0 + (28 - Math.min(28, draft.adxMax)) * 0.6 + tpBonus;
    return Math.min(76.0, Math.max(45.0, base));
  }, [draft.zScoreThreshold, draft.adxMax, draft.tpMode, draft.tpAtrMult]);

  // Dynamic Gaussian Bell SVG x-positions for Z-Score thresholds
  const zOffsetPx = Math.min(115, Math.max(40, (draft.zScoreThreshold / 3.0) * 110));
  const leftLineX = 150 - zOffsetPx;
  const rightLineX = 150 + zOffsetPx;

  return (
    <div className="flex flex-col w-full gap-4">
      {/* Top Presets & Hot Reload Action Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 p-4 rounded-xl bg-surface-container border border-white/5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-container-low text-on-surface-variant font-mono text-[10px] uppercase tracking-wider">
            <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
            <span>Preset Profil:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'conservative', label: 'Konserwatywny' },
                { id: 'balanced', label: 'Zrównoważony (Optymalny)' },
                { id: 'aggressive', label: 'Agresywny High-WR' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`px-3 py-1.5 rounded-lg font-display text-xs transition-all whitespace-nowrap shrink-0 ${
                  draft.preset === p.id
                    ? 'bg-primary-container text-on-primary-container font-bold shadow-[0_0_12px_rgba(247,166,0,0.28)]'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface font-medium'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 justify-between xl:justify-end">
          <div className="flex flex-col text-right font-mono">
            <span className="text-[10px] uppercase text-on-surface-variant">Konfiguracja Runtime</span>
            <span className="text-xs text-on-surface tabular-nums">
              Sync: <strong className="text-tertiary">{syncAt}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Resetuj domyślne</span>
            </button>
            <button
              type="button"
              onClick={handleHotReload}
              className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container hover:bg-primary font-display text-xs font-bold flex items-center gap-1.5 shadow-[0_0_14px_rgba(247,166,0,0.35)] transition-all whitespace-nowrap shrink-0"
            >
              <Zap className="w-4 h-4" />
              <span>Zapisz i Przeładuj (Hot Reload)</span>
            </button>
          </div>
        </div>
      </div>

      {hotReloadBanner && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-tertiary-container text-on-tertiary-container text-xs font-semibold">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>Parametry zaktualizowane w pamięci silnika bez przerywania aktywnych pozycji.</span>
          </div>
          <span className="font-mono text-[11px]">HOT-RELOAD OK</span>
        </div>
      )}

      {/* 3-Column Core Grid Architecture */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* CARD 1: Rynek & Egzekucja */}
        <div className="flex flex-col gap-4 p-4 rounded-xl bg-surface-container border border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Landmark className="w-5 h-5 text-primary" />
              <h2 className="font-display text-base font-bold text-on-surface">1. Rynek &amp; Egzekucja</h2>
            </div>
            <span className="font-mono text-[10px] font-bold text-tertiary tracking-wider uppercase">
              {draft.marketType === 'spot_margin' ? 'MiCA READY' : 'BYBIT V5'}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase text-on-surface-variant">Typ Rynku Bybit</span>
            {(
              [
                {
                  id: 'perp_usdt',
                  title: 'Perpetual Futures (USDT)',
                  desc: 'Najwyższa płynność i największy wolumen par na Bybit Linear',
                },
                {
                  id: 'perp_usdc',
                  title: 'Perpetual Futures (USDC)',
                  desc: 'Rozliczenie w Circle USDC dla kontraktów BTC/ETH/SOL',
                },
                {
                  id: 'spot_margin',
                  title: 'Spot Margin (Bybit EU / MiCA)',
                  desc: 'W pełni zgodny obrót na rynku Spot z marginesem USDC',
                },
              ] as const
            ).map((opt) => {
              const checked = draft.marketType === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, marketType: opt.id }))}
                  className={`text-left p-2.5 rounded-lg border transition-colors ${
                    checked
                      ? 'bg-surface-container-highest border-primary/40'
                      : 'bg-surface-container-low border-transparent hover:bg-surface-container-high'
                  }`}
                >
                  <div className={`text-xs font-bold ${checked ? 'text-primary' : 'text-on-surface'}`}>
                    {opt.title}
                  </div>
                  <div className="text-[11px] text-on-surface-variant mt-0.5">{opt.desc}</div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase text-on-surface-variant">Kwotowanie (Quote)</span>
              <div className="grid grid-cols-3 gap-1 bg-surface-container-low p-1 rounded-lg">
                {(['USDC', 'EURQ', 'USDT'] as const).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, quoteCurrency: q }))}
                    className={`py-1 rounded font-mono text-[11px] font-bold transition-colors ${
                      draft.quoteCurrency === q
                        ? 'bg-surface-container-highest text-primary'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase text-on-surface-variant">Interwał Świec</span>
              <div className="grid grid-cols-3 gap-1 bg-surface-container-low p-1 rounded-lg">
                {(['1', '3', '5'] as const).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, timeframe: tf }))}
                    className={`py-1 rounded font-mono text-[11px] font-bold transition-colors ${
                      draft.timeframe === tf
                        ? 'bg-primary-container text-on-primary-container'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {tf}m
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Active Pairs Multi-Selector */}
          <div className="flex flex-col gap-1.5 relative">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase text-on-surface-variant">
              <span>Aktywne Pary (Scanner Pool)</span>
              <span className="tabular-nums">{draft.activePairs.length}/16 par</span>
            </div>
            <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg bg-surface-container-lowest min-h-[76px] items-center content-start">
              {draft.activePairs.map((base) => (
                <span
                  key={base}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-container-high text-on-surface font-mono text-[11px]"
                >
                  <span>{base}/{draft.marketType === 'perp_usdt' ? 'USDT' : draft.quoteCurrency}</span>
                  <button
                    type="button"
                    onClick={() => removePair(base)}
                    className="text-on-surface-variant hover:text-error"
                    aria-label={`Usuń ${base}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {availableToAdd.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAddPairOpen((v) => !v)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-container-low text-primary hover:bg-surface-container font-mono text-[11px] font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Dodaj Symbol</span>
                </button>
              )}
            </div>

            {addPairOpen && availableToAdd.length > 0 && (
              <div className="flex flex-wrap gap-1 p-2 rounded-lg bg-surface-container-highest border border-white/10">
                {availableToAdd.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => addPair(a)}
                    className="px-2 py-1 rounded bg-surface-container-low hover:bg-primary hover:text-on-primary font-mono text-[11px] font-bold transition-colors"
                  >
                    + {a}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Post-Only Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low">
            <div className="flex flex-col pr-3">
              <span className="font-display text-xs font-bold text-on-surface">Wymuś Limit Post-Only</span>
              <span className="text-[11px] text-on-surface-variant">
                Prowizja Maker {draft.makerFeePct.toFixed(3)}% zamiast Taker {draft.takerFeePct.toFixed(3)}%
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDraft((prev) => ({ ...prev, postOnly: !prev.postOnly }))}
              className={`w-11 h-6 rounded-full p-0.5 transition-colors flex items-center shrink-0 ${
                draft.postOnly ? 'bg-primary-container justify-end' : 'bg-surface-container-highest justify-start'
              }`}
              aria-label="Przełącz Post-Only"
            >
              <span className="w-5 h-5 rounded-full bg-on-surface" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[10px] uppercase text-on-surface-variant">Offset Ceny Limit</label>
              <div className="flex items-center px-2.5 py-1.5 rounded-lg bg-surface-container-lowest">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="15"
                  value={draft.limitOffsetTicks}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, limitOffsetTicks: Math.max(0, Number(e.target.value) || 0) }))
                  }
                  className="w-full bg-transparent font-mono text-xs text-on-surface outline-none text-right pr-2 tabular-nums"
                />
                <span className="font-mono text-[10px] text-on-surface-variant uppercase">ticka</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[10px] uppercase text-on-surface-variant">Order TTL</label>
              <div className="flex items-center px-2.5 py-1.5 rounded-lg bg-surface-container-lowest">
                <input
                  type="number"
                  step="1"
                  min="5"
                  max="120"
                  value={draft.orderTtlSec}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, orderTtlSec: Math.max(5, Number(e.target.value) || 15) }))
                  }
                  className="w-full bg-transparent font-mono text-xs text-on-surface outline-none text-right pr-2 tabular-nums"
                />
                <span className="font-mono text-[10px] text-on-surface-variant uppercase">sek</span>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 2: Mean Reversion Core */}
        <div className="flex flex-col gap-4 p-4 rounded-xl bg-surface-container border border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              <h2 className="font-display text-base font-bold text-on-surface">2. Mean Reversion Core</h2>
            </div>
            <span className="font-mono text-[10px] font-bold text-primary tracking-wider uppercase">
              STATYSTYKA
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase text-on-surface-variant">Baza Powrotu do Średniej (Anchor)</span>
            <div className="grid grid-cols-2 gap-1.5 bg-surface-container-low p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, meanAnchor: 'ema20' }))}
                className={`py-1.5 px-2 rounded font-display text-xs font-semibold transition-colors ${
                  draft.meanAnchor === 'ema20'
                    ? 'bg-surface-container-highest text-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Wykładnicza EMA(20)
              </button>
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, meanAnchor: 'vwap' }))}
                className={`py-1.5 px-2 rounded font-display text-xs font-semibold transition-colors ${
                  draft.meanAnchor === 'vwap'
                    ? 'bg-surface-container-highest text-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                VWAP Sesyjny
              </button>
            </div>
          </div>

          {/* Z-Score Deviation Slider */}
          <div className="flex flex-col gap-2 p-3 rounded-lg bg-surface-container-low">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase text-on-surface-variant">Próg Wejścia (Z-Score)</span>
              <span className="font-mono text-base text-primary font-bold tabular-nums">
                {draft.zScoreThreshold.toFixed(2)} σ
              </span>
            </div>
            <input
              type="range"
              min="1.5"
              max="3.0"
              step="0.05"
              value={draft.zScoreThreshold}
              onChange={(e) => setDraft((prev) => ({ ...prev, zScoreThreshold: Number(e.target.value) }))}
              className="w-full accent-primary-container cursor-pointer"
            />
            <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant tabular-nums">
              <span>1.50 (Często)</span>
              <span className="text-tertiary font-bold">~{estimatedSignalsPerDay} sygnałów / dobę</span>
              <span>3.00 (Snajper)</span>
            </div>
          </div>

          {/* Dynamic Gaussian Bell Curve */}
          <div className="p-3 rounded-lg bg-surface-container-lowest flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase text-on-surface-variant">
              <span>Rozkład Gaussa &amp; Progi</span>
              <span className="text-primary font-bold tabular-nums">±{draft.zScoreThreshold.toFixed(2)}σ</span>
            </div>
            <div className="w-full h-16">
              <svg className="w-full h-full" viewBox="0 0 300 70">
                <path
                  d="M 10 65 Q 80 65 110 50 Q 150 5 190 50 Q 220 65 290 65"
                  fill="none"
                  opacity="0.45"
                  stroke="#9ba3b0"
                  strokeWidth="1.5"
                />
                <line stroke="#9ba3b0" strokeDasharray="2,2" opacity="0.5" x1="150" x2="150" y1="5" y2="65" />
                <line stroke="#4ced9f" strokeWidth="2" x1={leftLineX} x2={leftLineX} y1="16" y2="65" />
                <rect fill="#4ced9f" height="49" opacity="0.14" width={Math.max(5, leftLineX - 10)} x="10" y="16" />
                <line stroke="#f7a600" strokeWidth="2" x1={rightLineX} x2={rightLineX} y1="16" y2="65" />
                <rect fill="#f7a600" height="49" opacity="0.14" width={Math.max(5, 290 - rightLineX)} x={rightLineX} y="16" />
                <text fill="#4ced9f" fontFamily="JetBrains Mono" fontSize="8" fontWeight="bold" x="14" y="34">
                  LONG (-{draft.zScoreThreshold.toFixed(1)}σ)
                </text>
                <text fill="#ffc97d" fontFamily="JetBrains Mono" fontSize="8" fontWeight="bold" x="220" y="34">
                  SHORT (+{draft.zScoreThreshold.toFixed(1)}σ)
                </text>
              </svg>
            </div>
          </div>

          {/* RSI(7) Thresholds */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-mono text-[10px]">
              <span className="uppercase text-on-surface-variant">Filtr Pędu RSI(7)</span>
              <span className="text-tertiary tabular-nums">
                OS &lt; {draft.rsiLongMax} | OB &gt; {draft.rsiShortMin}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-surface-container-low">
                <span className="text-xs text-on-surface-variant">Long (OS):</span>
                <input
                  type="number"
                  min="10"
                  max="45"
                  value={draft.rsiLongMax}
                  onChange={(e) => setDraft((prev) => ({ ...prev, rsiLongMax: Number(e.target.value) || 24 }))}
                  className="w-14 bg-surface-container-highest rounded px-1.5 py-0.5 text-center font-mono text-xs text-tertiary font-bold outline-none tabular-nums"
                />
              </div>
              <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-surface-container-low">
                <span className="text-xs text-on-surface-variant">Short (OB):</span>
                <input
                  type="number"
                  min="55"
                  max="90"
                  value={draft.rsiShortMin}
                  onChange={(e) => setDraft((prev) => ({ ...prev, rsiShortMin: Number(e.target.value) || 76 }))}
                  className="w-14 bg-surface-container-highest rounded px-1.5 py-0.5 text-center font-mono text-xs text-primary font-bold outline-none tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* ADX Gate & Anti-Crash */}
          <div className="flex flex-col gap-2">
            <div className="p-3 rounded-lg bg-surface-container-low flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase text-on-surface-variant">Filtr Trendu ADX(14) Max</span>
                <input
                  type="number"
                  step="0.5"
                  min="15"
                  max="45"
                  value={draft.adxMax}
                  onChange={(e) => setDraft((prev) => ({ ...prev, adxMax: Number(e.target.value) || 28 }))}
                  className="w-16 bg-surface-container-highest rounded px-2 py-0.5 text-center font-mono text-xs text-on-surface font-bold outline-none tabular-nums"
                />
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Gdy ADX &gt; {draft.adxMax.toFixed(1)}, rynek jest w silnym trendzie — wejścia przeciw trendowi są blokowane dla ochrony Win Ratio.
              </p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low">
              <div className="flex flex-col">
                <span className="font-display text-xs font-bold text-on-surface">Anti-Crash Filter</span>
                <span className="text-[11px] text-on-surface-variant">Maks. zakres pojedynczej świecy</span>
              </div>
              <div className="flex items-center gap-1 bg-surface-container-highest px-2 py-1 rounded font-mono text-xs text-primary font-bold">
                <input
                  type="number"
                  step="0.5"
                  min="1.5"
                  max="6.0"
                  value={draft.antiCrashAtrMult}
                  onChange={(e) => setDraft((prev) => ({ ...prev, antiCrashAtrMult: Number(e.target.value) || 3 }))}
                  className="w-10 bg-transparent text-right outline-none tabular-nums"
                />
                <span>x ATR</span>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 3: Ryzyko & Ochrona */}
        <div className="flex flex-col gap-4 p-4 rounded-xl bg-surface-container border border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-error" />
              <h2 className="font-display text-base font-bold text-on-surface">3. Ryzyko &amp; Ochrona</h2>
            </div>
            <span className="font-mono text-[10px] font-bold text-error tracking-wider uppercase">
              GUARD ACTIVE
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase text-on-surface-variant">Rozmiar Pojedynczej Pozycji</span>
            <div className="grid grid-cols-2 gap-1.5 bg-surface-container-low p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, sizingMode: 'percent' }))}
                className={`py-1.5 rounded font-mono text-[11px] font-bold transition-colors ${
                  draft.sizingMode === 'percent'
                    ? 'bg-surface-container-highest text-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                % Kapitału: {draft.positionPercent}%
              </button>
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, sizingMode: 'fixed' }))}
                className={`py-1.5 rounded font-mono text-[11px] font-bold transition-colors ${
                  draft.sizingMode === 'fixed'
                    ? 'bg-surface-container-highest text-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Stała: ${draft.positionFixedUsd}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2 p-3 rounded-lg bg-surface-container-low">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase text-on-surface-variant">Dźwignia (Leverage)</span>
              <span className="font-mono text-base text-tertiary font-bold tabular-nums">{draft.leverage}x</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={draft.leverage}
              onChange={(e) => setDraft((prev) => ({ ...prev, leverage: Number(e.target.value) }))}
              className="w-full accent-tertiary cursor-pointer"
            />
            <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant">
              <span>1x (Spot)</span>
              <span className="text-tertiary">Optymalne: 2x–4x</span>
              <span>10x (Max)</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1.5 p-2.5 rounded-lg bg-surface-container-low">
              <span className="font-mono text-[10px] uppercase text-tertiary font-bold">Take Profit (TP)</span>
              <label className="flex items-center gap-1.5 text-xs text-on-surface cursor-pointer">
                <input
                  type="radio"
                  name="tp_mode"
                  checked={draft.tpMode === 'mean'}
                  onChange={() => setDraft((prev) => ({ ...prev, tpMode: 'mean' }))}
                  className="accent-tertiary"
                />
                <span>Powrót do średniej</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-on-surface-variant cursor-pointer">
                <input
                  type="radio"
                  name="tp_mode"
                  checked={draft.tpMode === 'atr'}
                  onChange={() => setDraft((prev) => ({ ...prev, tpMode: 'atr' }))}
                  className="accent-tertiary"
                />
                <span>Sztywny {draft.tpAtrMult}x ATR</span>
              </label>
            </div>

            <div className="flex flex-col justify-between p-2.5 rounded-lg bg-surface-container-low">
              <span className="font-mono text-[10px] uppercase text-error font-bold">Stop Loss (SL)</span>
              <div className="flex items-center justify-between">
                <input
                  type="number"
                  step="0.1"
                  min="0.8"
                  max="4.0"
                  value={draft.slAtrMult}
                  onChange={(e) => setDraft((prev) => ({ ...prev, slAtrMult: Number(e.target.value) || 1.8 }))}
                  className="w-14 bg-surface-container-highest rounded px-1.5 py-0.5 text-center font-mono text-xs text-error font-bold outline-none tabular-nums"
                />
                <span className="font-mono text-xs text-on-surface-variant">x ATR</span>
              </div>
              <span className="text-[11px] text-on-surface-variant">Adaptacyjny SL zmienności</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1 p-2.5 rounded-lg bg-surface-container-low">
              <label className="font-mono text-[10px] uppercase text-on-surface-variant">Time-Stop</label>
              <div className="flex items-center justify-between">
                <input
                  type="number"
                  min="3"
                  max="60"
                  value={draft.timeStopMinutes}
                  onChange={(e) => setDraft((prev) => ({ ...prev, timeStopMinutes: Number(e.target.value) || 12 }))}
                  className="w-14 bg-surface-container-highest rounded px-1.5 py-0.5 text-center font-mono text-xs text-on-surface font-bold outline-none tabular-nums"
                />
                <span className="text-xs text-on-surface-variant">minut</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 p-2.5 rounded-lg bg-surface-container-low">
              <label className="font-mono text-[10px] uppercase text-on-surface-variant">Maks. Pozycje</label>
              <div className="flex items-center justify-between">
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={draft.maxConcurrentPositions}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, maxConcurrentPositions: Number(e.target.value) || 3 }))
                  }
                  className="w-14 bg-surface-container-highest rounded px-1.5 py-0.5 text-center font-mono text-xs text-on-surface font-bold outline-none tabular-nums"
                />
                <span className="text-xs text-on-surface-variant">równolegle</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-error-container/20 border border-error/20">
            <span className="font-display text-xs font-bold text-on-error-container">
              Globalne Bezpieczniki Awaryjne
            </span>
            <div className="flex items-center justify-between text-xs text-on-surface">
              <span>Daily Max Loss:</span>
              <span className="font-mono font-bold text-error tabular-nums">{draft.dailyMaxLossPct.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between text-xs text-on-surface">
              <span>Cooldown po stratach z rzędu:</span>
              <span className="font-mono font-bold text-error tabular-nums">
                {draft.maxConsecutiveLosses} serie → {draft.cooldownMinutes}m
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Expectancy Summary */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 p-4 rounded-xl bg-surface-container-low border border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary">
            <Terminal className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-display text-sm font-semibold text-on-surface">
              Profil Strategii: Z-Score Mean Reversion + RSI(7) + ADX(14) Gate
            </span>
            <span className="text-xs text-on-surface-variant font-mono tabular-nums">
              Szacowany Win-Rate: ~{estimatedWinRate.toFixed(1)}% · Częstotliwość: ~{estimatedSignalsPerDay} transakcji/24h · Time-Stop: {draft.timeStopMinutes}m
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums">
          <span className="px-2.5 py-1 rounded bg-surface-container text-on-surface">
            Maker Fee: <strong className="text-tertiary">{draft.makerFeePct.toFixed(3)}%</strong>
          </span>
          <span className="px-2.5 py-1 rounded bg-surface-container text-on-surface">
            Taker Fee: <strong className="text-error">{draft.takerFeePct.toFixed(3)}%</strong>
          </span>
          <span className="px-2.5 py-1 rounded bg-surface-container text-on-surface">
            Slippage: <strong className="text-primary">{draft.slippagePct.toFixed(2)}%</strong>
          </span>
        </div>
      </div>
    </div>
  );
};
