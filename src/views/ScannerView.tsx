import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CandlestickChart,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  Zap,
} from 'lucide-react';
import { LosingPairsToggleButton } from '../components/LosingPairsToggleButton';
import { useBot } from '../engine/botContext';
import { formatPrice, formatUsd } from '../engine/format';
import { MarketType, PairTelemetry } from '../engine/types';

export const ScannerView: React.FC = () => {
  const {
    config,
    updateConfig,
    executionMode,
    privateStatus,
    equity,
    activePositions,
    pairTelemetries,
    selectedPairBase,
    setSelectedPairBase,
    isLoadingMarket,
    marketError,
    refreshMarketData,
    wsStatus,
    forceMakerOrder,
    togglePausePair,
    showToast,
  } = useBot();

  const [filterTab, setFilterTab] = useState<'all' | 'signal' | 'position' | 'adx' | 'paused'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [submittingSide, setSubmittingSide] = useState<'LONG' | 'SHORT' | null>(null);
  const [confirmLiveOrder, setConfirmLiveOrder] = useState<{
    base: string;
    displayPair: string;
    side: 'LONG' | 'SHORT';
    price: number;
  } | null>(null);

  const isRealMainnet = executionMode === 'exchange' && privateStatus.env === 'mainnet';

  const counts = useMemo(() => {
    const signal = pairTelemetries.filter((p) =>
      ['SIGNAL_LONG', 'SIGNAL_SHORT', 'NEAR_LONG', 'NEAR_SHORT'].includes(p.status)
    ).length;
    const position = pairTelemetries.filter((p) =>
      ['IN_POSITION_LONG', 'IN_POSITION_SHORT'].includes(p.status)
    ).length;
    const adx = pairTelemetries.filter((p) =>
      ['BLOCKED_ADX', 'BLOCKED_ATR', 'BLOCKED_TREND', 'BLOCKED_WICK'].includes(p.status)
    ).length;
    const paused = pairTelemetries.filter((p) => config.pausedPairs.includes(p.base)).length;
    return { all: pairTelemetries.length, signal, position, adx, paused };
  }, [pairTelemetries, config.pausedPairs]);

  const filteredPairs = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    return pairTelemetries.filter((p) => {
      if (q && !p.base.includes(q) && !p.symbol.includes(q)) return false;
      if (filterTab === 'signal') {
        return ['SIGNAL_LONG', 'SIGNAL_SHORT', 'NEAR_LONG', 'NEAR_SHORT'].includes(p.status);
      }
      if (filterTab === 'position') {
        return ['IN_POSITION_LONG', 'IN_POSITION_SHORT'].includes(p.status);
      }
      if (filterTab === 'adx') {
        return ['BLOCKED_ADX', 'BLOCKED_ATR', 'BLOCKED_TREND', 'BLOCKED_WICK'].includes(p.status);
      }
      if (filterTab === 'paused') {
        return config.pausedPairs.includes(p.base);
      }
      return true;
    });
  }, [pairTelemetries, searchQuery, filterTab, config.pausedPairs]);

  const selectedPair: PairTelemetry | undefined = useMemo(() => {
    return (
      pairTelemetries.find((p) => p.base === selectedPairBase) ||
      filteredPairs[0] ||
      pairTelemetries[0]
    );
  }, [pairTelemetries, filteredPairs, selectedPairBase]);

  const switchMarket = async (marketType: MarketType) => {
    if (marketType === config.marketType) return;
    if (activePositions.length > 0) {
      showToast(
        `Zamknij najpierw ${activePositions.length} otwartych pozycji przed zmianą kategorii rynku Bybit.`,
        'warning'
      );
      return;
    }
    const ok = await updateConfig({ ...config, marketType }, `Zmieniono rynek na ${marketType}`);
    if (ok) {
      showToast('Przełączono kategorię rynku Bybit — odświeżanie danych...', 'success');
    }
  };

  const executeManualOrder = async (base: string, side: 'LONG' | 'SHORT') => {
    if (submittingSide) return;
    setSubmittingSide(side);
    try {
      await forceMakerOrder(base, side);
    } finally {
      setSubmittingSide(null);
      setConfirmLiveOrder(null);
    }
  };

  const handleManualOrderClick = (pair: PairTelemetry, side: 'LONG' | 'SHORT') => {
    if (submittingSide) return;
    if (isRealMainnet) {
      setConfirmLiveOrder({
        base: pair.base,
        displayPair: pair.displayPair,
        side,
        price: side === 'LONG' ? pair.bidPrice : pair.askPrice,
      });
      return;
    }
    void executeManualOrder(pair.base, side);
  };

  // Build SVG Candlestick Chart data from real Bybit series (last 48 candles)
  const chartData = useMemo(() => {
    if (!selectedPair || selectedPair.series.length === 0) return null;
    const slice = selectedPair.series.slice(-48);
    const prices = slice.flatMap((c) => [c.high, c.low, c.upperBand, c.lowerBand]);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const rangeP = Math.max(minP * 0.001, maxP - minP);

    const W = 1000;
    const H = 280;
    const padY = 18;
    const usableH = H - padY * 2;
    const toY = (p: number) => padY + usableH - ((p - minP) / rangeP) * usableH;

    const emaPath = slice
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${((idx + 0.5) / slice.length) * W},${toY(c.ema20).toFixed(1)}`)
      .join(' ');
    const vwapPath = slice
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${((idx + 0.5) / slice.length) * W},${toY(c.vwap).toFixed(1)}`)
      .join(' ');
    const upperPath = slice
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${((idx + 0.5) / slice.length) * W},${toY(c.upperBand).toFixed(1)}`)
      .join(' ');
    const lowerPath = slice
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${((idx + 0.5) / slice.length) * W},${toY(c.lowerBand).toFixed(1)}`)
      .join(' ');

    const rsiPath = slice
      .map((c, idx) => {
        const x = ((idx + 0.5) / slice.length) * 500;
        const y = 76 - (Math.min(100, Math.max(0, c.rsi7)) / 100) * 68;
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

    const adxPath = slice
      .map((c, idx) => {
        const x = ((idx + 0.5) / slice.length) * 500;
        const y = 76 - (Math.min(60, Math.max(0, c.adx14)) / 60) * 68;
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

    return { slice, minP, maxP, toY, emaPath, vwapPath, upperPath, lowerPath, rsiPath, adxPath, W, H };
  }, [selectedPair]);

  const statusBadge = (p: PairTelemetry) => {
    switch (p.status) {
      case 'SIGNAL_LONG':
        return <span className="px-2 py-0.5 rounded bg-tertiary text-on-tertiary font-mono text-[10px] font-bold">SYGNAŁ LONG</span>;
      case 'SIGNAL_SHORT':
        return <span className="px-2 py-0.5 rounded bg-error text-on-error font-mono text-[10px] font-bold">SYGNAŁ SHORT</span>;
      case 'NEAR_LONG':
        return <span className="px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container font-mono text-[10px] font-bold">BLISKO LONG</span>;
      case 'NEAR_SHORT':
        return <span className="px-2 py-0.5 rounded bg-error-container text-on-error-container font-mono text-[10px] font-bold">BLISKO SHORT</span>;
      case 'IN_POSITION_LONG':
        return <span className="px-2 py-0.5 rounded bg-tertiary-container text-on-tertiary-container font-mono text-[10px] font-bold">W POZYCJI (LONG)</span>;
      case 'IN_POSITION_SHORT':
        return <span className="px-2 py-0.5 rounded bg-error-container text-on-error-container font-mono text-[10px] font-bold">W POZYCJI (SHORT)</span>;
      case 'BLOCKED_ADX':
        return <span className="px-2 py-0.5 rounded bg-surface-container-highest text-error font-mono text-[10px] font-bold">BLOKADA ADX</span>;
      case 'BLOCKED_ATR':
        return <span className="px-2 py-0.5 rounded bg-surface-container-highest text-primary font-mono text-[10px] font-bold">ANTI-CRASH ATR</span>;
      case 'BLOCKED_TREND':
        return <span className="px-2 py-0.5 rounded bg-surface-container-highest text-error font-mono text-[10px] font-bold">BLOKADA HTF</span>;
      case 'BLOCKED_WICK':
        return <span className="px-2 py-0.5 rounded bg-surface-container-highest text-primary font-mono text-[10px] font-bold">BRAK KNOTA</span>;
      case 'PAUSED':
        return <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-mono text-[10px] font-bold">WSTRZYMANA</span>;
      default:
        return <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-mono text-[10px] font-bold">NEUTRALNY</span>;
    }
  };

  return (
    <div className="flex flex-col w-full gap-3">
      {/* Top Control Ribbon & Filter Matrix */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 p-3 rounded-lg bg-surface-container-low border border-white/5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-surface-container-lowest p-1 rounded-lg gap-1 overflow-x-auto">
            {(
              [
                { id: 'all', label: 'Wszystkie pary', count: counts.all },
                { id: 'signal', label: 'Blisko sygnału', count: counts.signal },
                { id: 'position', label: 'Pozycje aktywne', count: counts.position },
                { id: 'adx', label: 'Zablokowane', count: counts.adx },
                { id: 'paused', label: 'Wstrzymane', count: counts.paused },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id)}
                className={`px-3 py-1.5 rounded font-mono text-[10px] uppercase font-bold tracking-wider transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  filterTab === tab.id
                    ? 'bg-surface-container-high text-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span>{tab.label}</span>
                <span className="text-on-surface-variant/80">({tab.count})</span>
              </button>
            ))}
          </div>

          <div className="flex items-center bg-surface-container-lowest p-1 rounded-lg gap-1">
            {(
              [
                { id: 'perp_usdt', label: 'Perp USDT' },
                { id: 'perp_usdc', label: 'Perp USDC' },
                { id: 'spot_margin', label: 'Spot Margin (EU)' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => switchMarket(m.id)}
                className={`px-2.5 py-1.5 rounded font-mono text-[10px] uppercase font-bold tracking-wider transition-colors whitespace-nowrap shrink-0 ${
                  config.marketType === m.id
                    ? 'bg-surface-container-highest text-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-end">
          <LosingPairsToggleButton size="sm" />

          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-2.5 text-on-surface-variant pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Szukaj monety (SOL, BTC, SUI)..."
              className="bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant font-mono text-xs pl-8 pr-3 py-1.5 rounded-lg border border-white/5 focus:outline-none focus:border-primary/50 w-44 sm:w-52"
            />
          </div>

          <button
            type="button"
            onClick={() => refreshMarketData()}
            className="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono text-[11px] font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMarket ? 'animate-spin text-primary' : 'text-tertiary'}`} />
            <span>{wsStatus.latencyMs > 0 ? `${wsStatus.latencyMs}ms` : 'Odśwież'}</span>
          </button>
        </div>
      </div>

      {marketError && (
        <div className="p-3 rounded-lg bg-error-container/30 border border-error/30 text-error font-mono text-xs flex items-center justify-between">
          <span>Problem z połączeniem Bybit API: {marketError}</span>
          <button
            type="button"
            onClick={() => refreshMarketData()}
            className="px-3 py-1 rounded bg-error text-on-error font-bold"
          >
            Ponów
          </button>
        </div>
      )}

      {/* Live Multi-Pair Monitor Grid Table */}
      <div className="w-full rounded-lg bg-surface-container-low border border-white/5 overflow-hidden">
        <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-surface-container-high text-on-surface-variant font-mono text-[10px] uppercase">
              <tr>
                <th className="py-2.5 px-3">Para / Rynek</th>
                <th className="py-2.5 px-3 text-right">Ostatnia Cena ({config.timeframe}m)</th>
                <th className="py-2.5 px-3 text-right">Spread %</th>
                <th className="py-2.5 px-3 text-center">Z-Score (-3σ / +3σ)</th>
                <th className="py-2.5 px-3 text-right">RSI (7)</th>
                <th className="py-2.5 px-3 text-right">ADX (14)</th>
                <th className="py-2.5 px-3 text-right">ATR %</th>
                <th className="py-2.5 px-3 text-center">Status Silnika</th>
                <th className="py-2.5 px-3 text-right">Działanie</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs divide-y divide-white/5 tabular-nums">
              {isLoadingMarket && pairTelemetries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-on-surface-variant">
                    Ładowanie rzeczywistych świec i orderbooka z Bybit v5 API...
                  </td>
                </tr>
              ) : filteredPairs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-on-surface-variant">
                    Brak par spełniających wybrane kryteria filtra.
                  </td>
                </tr>
              ) : (
                filteredPairs.map((p) => {
                  const isSelected = selectedPair?.base === p.base;
                  const zClamped = Math.max(-3, Math.min(3, p.zScore));
                  const barWidthPct = (Math.abs(zClamped) / 3) * 50;
                  const isPaused = config.pausedPairs.includes(p.base);

                  return (
                    <tr
                      key={p.symbol}
                      onClick={() => setSelectedPairBase(p.base)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-surface-container-high/70' : 'hover:bg-surface-container/60'
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center font-bold text-primary text-[10px]">
                            {p.base.slice(0, 2)}
                          </div>
                          <div className="flex flex-col">
                            <span
                              className={`font-display text-sm font-bold ${
                                isSelected ? 'text-primary' : 'text-on-surface'
                              }`}
                            >
                              {p.displayPair}
                            </span>
                            <span className="text-[10px] text-on-surface-variant">
                              {p.category === 'spot' ? 'Bybit Spot' : 'Bybit Linear'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-bold text-on-surface">{formatPrice(p.lastPrice)}</span>
                          <span
                            className={`text-[10px] ${
                              p.change24hPct >= 0 ? 'text-tertiary' : 'text-error'
                            }`}
                          >
                            {p.change24hPct >= 0 ? '+' : ''}
                            {p.change24hPct.toFixed(2)}%
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-right text-tertiary font-semibold">
                        {p.spreadPct.toFixed(3)}%
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex flex-col items-center gap-1 w-32 mx-auto">
                          <span
                            className={`font-bold text-[10px] ${
                              p.zScore <= -config.zScoreThreshold * 0.78
                                ? 'text-secondary'
                                : p.zScore >= config.zScoreThreshold * 0.78
                                  ? 'text-error'
                                  : 'text-on-surface-variant'
                            }`}
                          >
                            {p.zScore >= 0 ? '+' : ''}
                            {p.zScore.toFixed(2)}σ
                          </span>
                          <div className="w-full h-1.5 bg-surface-container-lowest rounded-full overflow-hidden relative">
                            <div className="absolute inset-y-0 left-1/2 w-[1px] bg-white/20 z-10" />
                            {zClamped < 0 ? (
                              <div
                                className="absolute top-0 bottom-0 bg-secondary-container rounded-l"
                                style={{
                                  right: '50%',
                                  width: `${barWidthPct}%`,
                                }}
                              />
                            ) : (
                              <div
                                className="absolute top-0 bottom-0 bg-error rounded-r"
                                style={{
                                  left: '50%',
                                  width: `${barWidthPct}%`,
                                }}
                              />
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <span
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold ${
                            p.rsi7 <= config.rsiLongMax
                              ? 'bg-secondary-container/25 text-secondary'
                              : p.rsi7 >= config.rsiShortMin
                                ? 'bg-error-container/30 text-error'
                                : 'text-on-surface'
                          }`}
                        >
                          {p.rsi7 <= config.rsiLongMax && <ArrowDown className="w-3 h-3" />}
                          {p.rsi7 >= config.rsiShortMin && <ArrowUp className="w-3 h-3" />}
                          {p.rsi7.toFixed(1)}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold ${
                            p.adx14 <= config.adxMax
                              ? 'bg-tertiary-container/15 text-tertiary'
                              : 'bg-error-container/30 text-error'
                          }`}
                        >
                          {p.adx14.toFixed(1)} {p.adx14 <= config.adxMax ? '(OK)' : '(Trend)'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right text-on-surface">
                        {p.atrPct.toFixed(2)}%
                      </td>

                      <td className="py-2.5 px-3 text-center">{statusBadge(p)}</td>

                      <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedPairBase(p.base)}
                            className="p-1.5 rounded bg-surface-container-highest text-primary hover:bg-primary hover:text-on-primary transition-colors"
                            title="Pokaż wykres"
                          >
                            <CandlestickChart className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => togglePausePair(p.base)}
                            className={`p-1.5 rounded bg-surface-container-highest transition-colors ${
                              isPaused
                                ? 'text-tertiary hover:text-on-surface'
                                : 'text-on-surface-variant hover:text-error'
                            }`}
                            title={isPaused ? 'Wznów parę' : 'Wstrzymaj parę'}
                          >
                            {isPaused ? (
                              <PlayCircle className="w-3.5 h-3.5" />
                            ) : (
                              <PauseCircle className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Workspace: Real Bybit Candlestick Chart & Synchronized Oscillators */}
      {selectedPair && chartData && (
        <div className="flex flex-col rounded-lg bg-surface-container-low border border-white/5 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-surface-container-high/70 gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display text-sm font-bold text-on-surface">
                {selectedPair.displayPair} · {config.timeframe}m Bybit
              </span>
              <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] tabular-nums">
                <span className="text-on-surface-variant">
                  EMA(20): <span className="text-primary font-bold">{formatPrice(selectedPair.ema20)}</span>
                </span>
                <span className="text-on-surface-variant">
                  VWAP: <span className="text-secondary font-bold">{formatPrice(selectedPair.vwap)}</span>
                </span>
                <span className="text-on-surface-variant">
                  +{config.zScoreThreshold.toFixed(2)}σ:{' '}
                  <span className="text-error font-bold">{formatPrice(selectedPair.upperBand)}</span>
                </span>
                <span className="text-on-surface-variant">
                  -{config.zScoreThreshold.toFixed(2)}σ:{' '}
                  <span className="text-tertiary font-bold">{formatPrice(selectedPair.lowerBand)}</span>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={Boolean(submittingSide)}
                onClick={() => handleManualOrderClick(selectedPair, 'LONG')}
                className="px-3 py-1.5 rounded-lg bg-tertiary text-on-tertiary hover:bg-tertiary-fixed font-mono text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors whitespace-nowrap disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{submittingSide === 'LONG' ? 'Wysyłanie...' : 'Maker LONG'}</span>
              </button>
              <button
                type="button"
                disabled={Boolean(submittingSide)}
                onClick={() => handleManualOrderClick(selectedPair, 'SHORT')}
                className="px-3 py-1.5 rounded-lg bg-error-container text-on-error-container hover:bg-error hover:text-on-error font-mono text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors whitespace-nowrap disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{submittingSide === 'SHORT' ? 'Wysyłanie...' : 'Maker SHORT'}</span>
              </button>
            </div>
          </div>

          {/* Candlestick SVG Chart */}
          <div className="relative w-full h-72 bg-surface-container-lowest p-3 select-none">
            <svg className="w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${chartData.W} ${chartData.H}`}>
              {/* Horizontal grid lines */}
              {[0.2, 0.4, 0.6, 0.8].map((r) => (
                <line
                  key={r}
                  x1="0"
                  x2={chartData.W}
                  y1={chartData.H * r}
                  y2={chartData.H * r}
                  stroke="#3b424d"
                  strokeDasharray="3,3"
                  strokeOpacity="0.4"
                />
              ))}

              {/* Z-Score Bands */}
              <path d={chartData.upperPath} fill="none" stroke="#ffb4ab" strokeDasharray="4,4" strokeWidth="1.2" opacity="0.8" />
              <path d={chartData.lowerPath} fill="none" stroke="#4ced9f" strokeDasharray="4,4" strokeWidth="1.2" opacity="0.8" />
              {/* VWAP & EMA(20) */}
              <path d={chartData.vwapPath} fill="none" stroke="#adc6ff" strokeWidth="1.4" opacity="0.7" />
              <path d={chartData.emaPath} fill="none" stroke="#f7a600" strokeWidth="2.1" />

              {/* Real Candles */}
              {chartData.slice.map((c, idx) => {
                const slotW = chartData.W / chartData.slice.length;
                const cx = (idx + 0.5) * slotW;
                const bodyW = Math.max(4, slotW * 0.56);
                const isBull = c.close >= c.open;
                const color = isBull ? '#4ced9f' : '#ffb4ab';
                const yHigh = chartData.toY(c.high);
                const yLow = chartData.toY(c.low);
                const yOpen = chartData.toY(c.open);
                const yClose = chartData.toY(c.close);
                const bodyTop = Math.min(yOpen, yClose);
                const bodyH = Math.max(2, Math.abs(yClose - yOpen));

                return (
                  <g key={c.time}>
                    <line x1={cx} x2={cx} y1={yHigh} y2={yLow} stroke={color} strokeWidth="1.5" />
                    <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} rx="1" />
                  </g>
                );
              })}

              {/* Current Price Line */}
              <line
                x1="0"
                x2={chartData.W}
                y1={chartData.toY(selectedPair.lastPrice)}
                y2={chartData.toY(selectedPair.lastPrice)}
                stroke="#ffc97d"
                strokeDasharray="2,2"
                strokeWidth="1"
              />
            </svg>

            {/* Floating Bid/Ask & Sizing Card */}
            <div className="absolute top-3 right-3 bg-surface-container-high/90 backdrop-blur-md p-2.5 rounded-lg border border-white/10 font-mono text-[11px] flex flex-col gap-1 tabular-nums">
              <div className="flex justify-between gap-4">
                <span className="text-on-surface-variant">Bid / Ask:</span>
                <span className="text-tertiary font-bold">
                  {formatPrice(selectedPair.bidPrice)} / {formatPrice(selectedPair.askPrice)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-on-surface-variant">Status:</span>
                <span className="text-on-surface font-semibold">{selectedPair.statusReason}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-on-surface-variant">24h Obrót:</span>
                <span className="text-on-surface">{formatUsd(selectedPair.volume24hUsd)}</span>
              </div>
            </div>
          </div>

          {/* Synchronized Oscillators */}
          <div className="grid grid-cols-1 md:grid-cols-2 bg-surface-container-low gap-2 p-2">
            {/* RSI(7) */}
            <div className="flex flex-col bg-surface-container-lowest p-3 rounded-lg">
              <div className="flex items-center justify-between mb-1.5 font-mono">
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="font-bold text-on-surface uppercase">RSI (7) FAST SCALP</span>
                  <span className="text-error">OB: {config.rsiShortMin}</span>
                  <span className="text-secondary">OS: {config.rsiLongMax}</span>
                </div>
                <span className="text-xs font-bold text-secondary tabular-nums">
                  {selectedPair.rsi7.toFixed(1)}
                </span>
              </div>
              <div className="w-full h-20">
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 500 80">
                  <line
                    x1="0"
                    x2="500"
                    y1={76 - (config.rsiShortMin / 100) * 68}
                    y2={76 - (config.rsiShortMin / 100) * 68}
                    stroke="#ffb4ab"
                    strokeDasharray="3,3"
                    opacity="0.6"
                  />
                  <line
                    x1="0"
                    x2="500"
                    y1={76 - (config.rsiLongMax / 100) * 68}
                    y2={76 - (config.rsiLongMax / 100) * 68}
                    stroke="#adc6ff"
                    strokeDasharray="3,3"
                    opacity="0.6"
                  />
                  <path d={chartData.rsiPath} fill="none" stroke="#adc6ff" strokeWidth="1.8" />
                </svg>
              </div>
            </div>

            {/* ADX(14) */}
            <div className="flex flex-col bg-surface-container-lowest p-3 rounded-lg">
              <div className="flex items-center justify-between mb-1.5 font-mono">
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="font-bold text-on-surface uppercase">ADX (14) TREND FILTER</span>
                  <span className="text-tertiary">GATE: &lt; {config.adxMax.toFixed(1)}</span>
                </div>
                <span
                  className={`text-xs font-bold tabular-nums ${
                    selectedPair.adx14 <= config.adxMax ? 'text-tertiary' : 'text-error'
                  }`}
                >
                  {selectedPair.adx14.toFixed(1)} ({selectedPair.adx14 <= config.adxMax ? 'RANGE OK' : 'TREND LOCK'})
                </span>
              </div>
              <div className="w-full h-20">
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 500 80">
                  <line
                    x1="0"
                    x2="500"
                    y1={76 - (Math.min(60, config.adxMax) / 60) * 68}
                    y2={76 - (Math.min(60, config.adxMax) / 60) * 68}
                    stroke="#ffb4ab"
                    strokeDasharray="3,3"
                    opacity="0.7"
                  />
                  <path
                    d={chartData.adxPath}
                    fill="none"
                    stroke={selectedPair.adx14 <= config.adxMax ? '#4ced9f' : '#ffb4ab'}
                    strokeWidth="1.8"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REAL Mainnet Manual Order Confirmation Modal */}
      {confirmLiveOrder && (
        <div className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-high border border-error/40 rounded-xl max-w-md w-full p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3 text-error">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-display text-base font-bold">
                Potwierdź Zlecenie na BYBIT REAL LIVE
              </h3>
            </div>
            <p className="text-xs text-on-surface leading-relaxed">
              Wysyłasz ręczne zlecenie <strong>Limit Post-Only</strong> na prawdziwym koncie{' '}
              <strong className="text-error">Bybit REAL Mainnet</strong>:
            </p>
            <div className="bg-surface-container-lowest rounded-lg p-3 font-mono text-xs flex flex-col gap-1.5 tabular-nums border border-white/5">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Instrument:</span>
                <span className="font-bold text-on-surface">{confirmLiveOrder.displayPair}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Kierunek &amp; Dźwignia:</span>
                <span
                  className={
                    confirmLiveOrder.side === 'LONG' ? 'text-tertiary font-bold' : 'text-error font-bold'
                  }
                >
                  {confirmLiveOrder.side} {config.leverage}x
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Cena Limit (Bid/Ask):</span>
                <span className="text-on-surface font-semibold">{formatPrice(confirmLiveOrder.price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Szac. wartość (Notional):</span>
                <span className="text-primary font-bold">
                  {formatUsd(
                    config.sizingMode === 'percent'
                      ? Math.max(25, Math.max(100, equity) * (config.positionPercent / 100) * config.leverage)
                      : Math.max(25, Math.min(Math.max(100, equity) * 0.5, config.positionFixedUsd / Math.max(1, config.leverage)) * config.leverage)
                  )}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={Boolean(submittingSide)}
                onClick={() => setConfirmLiveOrder(null)}
                className="px-3.5 py-2 rounded-lg bg-surface-container hover:bg-surface-container-highest text-on-surface text-xs font-semibold"
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={Boolean(submittingSide)}
                onClick={() => void executeManualOrder(confirmLiveOrder.base, confirmLiveOrder.side)}
                className={`px-4 py-2 rounded-lg font-mono text-xs font-bold uppercase disabled:opacity-50 ${
                  confirmLiveOrder.side === 'LONG'
                    ? 'bg-tertiary text-on-tertiary hover:bg-tertiary-fixed'
                    : 'bg-error text-on-error hover:opacity-90'
                }`}
              >
                {submittingSide ? 'Wysyłanie...' : `Wyślij REAL ${confirmLiveOrder.side}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
