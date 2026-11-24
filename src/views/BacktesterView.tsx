import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Play,
  RefreshCw,
  Scale,
  Shield,
  SlidersHorizontal,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../engine/apiClient';
import { HistoricalBasketData, runHistoricalBacktest } from '../engine/backtester';
import { useBot } from '../engine/botContext';
import { downloadCsv, formatPrice, formatShortDateTime, formatUsd } from '../engine/format';
import { parseBybitKlines } from '../engine/indicators';
import { ALL_SCANNER_ASSETS, BacktestParams, BacktestResult, formatBybitSymbol } from '../engine/types';

export const BacktesterView: React.FC = () => {
  const { config, updateConfig, showToast } = useBot();

  const [params, setParams] = useState<BacktestParams>({
    basket: config.activePairs,
    barsPerPair: 2000,
    initialCapital: 10000,
    slippagePct: config.slippagePct,
    makerFeePct: config.makerFeePct,
    takerFeePct: config.takerFeePct,
    syncWithLive: true,
  });

  const [isRunning, setIsRunning] = useState(false);
  const [progressText, setProgressText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);

  const executeBacktest = useCallback(async () => {
    setIsRunning(true);
    setError(null);
    setProgressText(`Pobieranie 0 / ${params.basket.length} par...`);
    try {
      const basketData: HistoricalBasketData[] = [];
      const batchSize = 4;
      let completed = 0;

      for (let i = 0; i < params.basket.length; i += batchSize) {
        const chunk = params.basket.slice(i, i + batchSize);
        await Promise.all(
          chunk.map(async (base) => {
            const { symbol, category } = formatBybitSymbol(base, config.marketType, config.quoteCurrency);
            const res = await apiFetch(
              `/api/bybit/klines-range?category=${category}&symbol=${encodeURIComponent(symbol)}&interval=${config.timeframe}&bars=${params.barsPerPair}`
            );
            if (res.status === 401) {
              throw new Error('Sesja wygasła — zaloguj się ponownie, aby uruchomić backtest.');
            }
            const json = await res.json();
            if (res.ok && json.retCode === 0 && Array.isArray(json.result?.list)) {
              const candles = parseBybitKlines(json.result.list);
              if (candles.length > 0) {
                basketData.push({ base, candles });
              }
            }
            completed += 1;
            setProgressText(`Pobieranie ${completed} / ${params.basket.length} par...`);
          })
        );
      }

      if (basketData.length === 0) {
        throw new Error('Nie udało się pobrać historycznych świec z Bybit API.');
      }

      setProgressText('Uruchamianie symulacji Mean Reversion...');
      const simConfig = {
        ...config,
        makerFeePct: params.makerFeePct,
        takerFeePct: params.takerFeePct,
        slippagePct: params.slippagePct,
      };
      const bt = runHistoricalBacktest(basketData, simConfig, params);
      setResult(bt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd uruchamiania backtestu');
    } finally {
      setIsRunning(false);
      setProgressText('');
    }
  }, [params, config]);

  // Run initial real historical backtest on mount (batched safely to avoid Bybit rate limits)
  useEffect(() => {
    void executeBacktest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleBasketAsset = (base: string) => {
    setParams((prev) => {
      const exists = prev.basket.includes(base);
      if (exists && prev.basket.length <= 1) return prev;
      return {
        ...prev,
        basket: exists ? prev.basket.filter((b) => b !== base) : [...prev.basket, base],
      };
    });
  };

  const handleExportCsv = () => {
    if (!result) return;
    const headers = [
      'ID',
      'Para',
      'Kierunek',
      'Wejscie',
      'Wyjscie',
      'Notional_USD',
      'Prowizje_USD',
      'Netto_USD',
      'Netto_Pct',
      'Powod',
      'Czas_trwania_s',
    ];
    const rows = result.trades.map((t) => [
      t.id,
      t.displayPair,
      t.side,
      t.entryPrice,
      t.exitPrice,
      t.notionalUsd.toFixed(2),
      t.feesUsd.toFixed(2),
      t.netPnlUsd.toFixed(2),
      t.netPnlPct.toFixed(3),
      t.exitReason,
      t.durationSec,
    ]);
    downloadCsv(`ScalpEngine_Backtest_${params.barsPerPair}bars.csv`, headers, rows);
    showToast('Wyeksportowano raport backtestu do CSV.', 'success');
  };

  const handleApplyToLive = async () => {
    const ok = await updateConfig(
      {
        ...config,
        activePairs: [...params.basket],
        makerFeePct: params.makerFeePct,
        takerFeePct: params.takerFeePct,
        slippagePct: params.slippagePct,
      },
      `Zastosowano koszyk z backtestu (${params.basket.length} par: ${params.basket.join(', ')}) do bota na żywo.`
    );
    if (ok) {
      showToast(`Koszyk (${params.basket.length} par) i parametry zsynchronizowane z silnikiem Live.`, 'success');
    }
  };

  // Equity & Drawdown SVG geometry
  const charts = useMemo(() => {
    if (!result || result.curve.length < 2) return null;
    const pts = result.curve;
    const values = pts.flatMap((p) => [p.equity, p.btcBenchmarkEquity]);
    const minEq = Math.min(...values) * 0.997;
    const maxEq = Math.max(...values) * 1.003;
    const rangeEq = Math.max(50, maxEq - minEq);

    const W = 800;
    const H = 220;
    const padY = 14;
    const usableH = H - padY * 2;

    const eqCoords = pts.map((p, i) => {
      const x = (i / (pts.length - 1)) * W;
      const y = padY + usableH - ((p.equity - minEq) / rangeEq) * usableH;
      const btcY = padY + usableH - ((p.btcBenchmarkEquity - minEq) / rangeEq) * usableH;
      return { x, y, btcY };
    });

    const eqPath = eqCoords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const btcPath = eqCoords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.btcY.toFixed(1)}`).join(' ');
    const eqPoly = `${eqCoords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')} ${W},${H} 0,${H}`;

    const minDd = Math.min(-1, result.maxDrawdownPct * 1.15);
    const ddCoords = pts.map((p, i) => {
      const x = (i / (pts.length - 1)) * 400;
      const y = 10 + (Math.abs(p.drawdownPct) / Math.abs(minDd)) * 200;
      return { x, y };
    });
    const ddPath = ddCoords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const ddPoly = `${ddCoords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')} 400,10 0,10`;

    return { minEq, maxEq, minDd, eqCoords, eqPath, btcPath, eqPoly, ddPath, ddPoly };
  }, [result]);

  return (
    <div className="flex flex-col w-full gap-4">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 bg-surface-container-low p-4 rounded-xl border border-white/5">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-primary font-bold">
            Bybit v5 Real Historical Replay Engine
          </span>
          <h1 className="font-display text-2xl font-bold text-on-surface tracking-tight">
            Symulator Historyczny &amp; Backtesting
          </h1>
          <p className="text-xs text-on-surface-variant">
            Ewaluacja strategii Mean Reversion (Z-Score + RSI(7) + ADX(14)) na rzeczywistych świecach z giełdy Bybit z uwzględnieniem poślizgów oraz prowizji Maker/Taker.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!result}
            className="px-3 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Raport CSV</span>
          </button>
        </div>
      </div>

      {/* Parameters Panel */}
      <div className="bg-surface-container-low p-4 rounded-xl border border-white/5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            <span className="font-display text-base font-bold text-on-surface">
              Parametry Historycznego Replayu
            </span>
          </div>
          <span className="font-mono text-[11px] text-on-surface-variant tabular-nums">
            Interwał: <strong className="text-primary">{config.timeframe}m</strong> · Z-Score:{' '}
            <strong className="text-primary">±{config.zScoreThreshold.toFixed(2)}σ</strong> · ADX &lt;{' '}
            <strong className="text-tertiary">{config.adxMax}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Basket */}
          <div className="flex flex-col gap-2 bg-surface-container p-3 rounded-lg">
            <span className="font-mono text-[10px] uppercase text-on-surface-variant">Koszyk Instrumentów ({params.basket.length})</span>
            <div className="flex flex-wrap gap-1">
              {ALL_SCANNER_ASSETS.map((asset) => {
                const active = params.basket.includes(asset);
                return (
                  <button
                    key={asset}
                    type="button"
                    onClick={() => toggleBasketAsset(asset)}
                    className={`px-2 py-1 rounded font-mono text-[11px] font-bold transition-colors ${
                      active
                        ? 'bg-primary-container text-on-primary-container'
                        : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {asset}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Window */}
          <div className="flex flex-col gap-2 bg-surface-container p-3 rounded-lg">
            <span className="font-mono text-[10px] uppercase text-on-surface-variant">
              Głębokość Historyczna (Bybit API)
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { bars: 1000, label: '1,000 sv.' },
                { bars: 2000, label: '2,000 sv.' },
                { bars: 4000, label: '4,000 sv.' },
              ].map((w) => (
                <button
                  key={w.bars}
                  type="button"
                  onClick={() => setParams((prev) => ({ ...prev, barsPerPair: w.bars }))}
                  className={`py-1.5 rounded font-mono text-[11px] font-bold transition-colors ${
                    params.barsPerPair === w.bars
                      ? 'bg-surface-container-highest text-primary'
                      : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <span className="font-mono text-[10px] text-on-surface-variant tabular-nums">
              Łącznie ~{(params.barsPerPair * params.basket.length).toLocaleString('en-US')} świec {config.timeframe}m
            </span>
          </div>

          {/* Initial Capital */}
          <div className="flex flex-col gap-2 bg-surface-container p-3 rounded-lg">
            <span className="font-mono text-[10px] uppercase text-on-surface-variant">Kapitał Początkowy</span>
            <div className="flex items-center justify-between bg-surface-container-lowest px-3 py-1.5 rounded">
              <span className="font-mono text-xs text-on-surface-variant">$</span>
              <input
                type="number"
                min="500"
                step="500"
                value={params.initialCapital}
                onChange={(e) =>
                  setParams((prev) => ({ ...prev, initialCapital: Math.max(500, Number(e.target.value) || 10000) }))
                }
                className="w-full bg-transparent font-mono text-sm text-primary font-bold text-right outline-none tabular-nums"
              />
            </div>
            <span className="font-mono text-[10px] text-on-surface-variant">
              Dźwignia: {config.leverage}x · Max poz: {config.maxConcurrentPositions}
            </span>
          </div>

          {/* Fees & Slippage */}
          <div className="flex flex-col gap-2 bg-surface-container p-3 rounded-lg">
            <span className="font-mono text-[10px] uppercase text-on-surface-variant">
              Prowizje Bybit &amp; Poślizg
            </span>
            <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
              <div className="flex flex-col bg-surface-container-lowest p-1.5 rounded">
                <span className="text-[9px] text-on-surface-variant">Maker %</span>
                <input
                  type="number"
                  step="0.005"
                  value={params.makerFeePct}
                  onChange={(e) => setParams((p) => ({ ...p, makerFeePct: Number(e.target.value) }))}
                  className="bg-transparent text-tertiary font-bold outline-none w-full tabular-nums"
                />
              </div>
              <div className="flex flex-col bg-surface-container-lowest p-1.5 rounded">
                <span className="text-[9px] text-on-surface-variant">Taker %</span>
                <input
                  type="number"
                  step="0.005"
                  value={params.takerFeePct}
                  onChange={(e) => setParams((p) => ({ ...p, takerFeePct: Number(e.target.value) }))}
                  className="bg-transparent text-error font-bold outline-none w-full tabular-nums"
                />
              </div>
              <div className="flex flex-col bg-surface-container-lowest p-1.5 rounded">
                <span className="text-[9px] text-on-surface-variant">Slippage %</span>
                <input
                  type="number"
                  step="0.005"
                  value={params.slippagePct}
                  onChange={(e) => setParams((p) => ({ ...p, slippagePct: Number(e.target.value) }))}
                  className="bg-transparent text-primary font-bold outline-none w-full tabular-nums"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={executeBacktest}
            disabled={isRunning}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-primary hover:bg-primary-fixed-dim text-on-primary font-display text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_16px_rgba(247,166,0,0.3)] transition-all disabled:opacity-60 whitespace-nowrap"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{progressText || 'Pobieranie świec Bybit i symulacja...'}</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Uruchom Backtest na danych Bybit</span>
              </>
            )}
          </button>

          {result && (
            <div className="font-mono text-[11px] text-tertiary font-semibold tabular-nums">
              Przeanalizowano {result.totalCandlesAnalyzed.toLocaleString('en-US')} świec w {result.elapsedMs}ms (
              {formatShortDateTime(result.startTimestamp)} → {formatShortDateTime(result.endTimestamp)})
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-error-container/30 border border-error/30 text-error font-mono text-xs">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      {result && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="bg-surface-container-low p-4 rounded-xl border border-white/5 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between text-on-surface-variant font-mono text-[10px] uppercase">
                <span>Zysk Netto (Po opłatach)</span>
                <TrendingUp className="w-4 h-4 text-tertiary" />
              </div>
              <div>
                <div
                  className={`font-mono text-xl font-bold tabular-nums ${
                    result.netProfitUsd >= 0 ? 'text-tertiary' : 'text-error'
                  }`}
                >
                  {formatUsd(result.netProfitUsd, true)}
                </div>
                <div className="font-mono text-[11px] text-on-surface-variant mt-1 tabular-nums">
                  {result.roiPct >= 0 ? '+' : ''}
                  {result.roiPct.toFixed(2)}% ROI vs ${result.initialCapital.toLocaleString('en-US')}
                </div>
              </div>
            </div>

            <div className="bg-surface-container-low p-4 rounded-xl border border-white/5 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between text-on-surface-variant font-mono text-[10px] uppercase">
                <span>Win Ratio</span>
              </div>
              <div>
                <div className="font-mono text-xl font-bold text-on-surface tabular-nums">
                  {result.winRatePct.toFixed(1)}%
                </div>
                <div className="font-mono text-[11px] mt-1 tabular-nums">
                  <span className="text-tertiary font-bold">{result.wins} W</span> /{' '}
                  <span className="text-error font-bold">{result.losses} L</span>{' '}
                  <span className="text-on-surface-variant">(Σ {result.totalTrades})</span>
                </div>
              </div>
            </div>

            <div className="bg-surface-container-low p-4 rounded-xl border border-white/5 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between text-on-surface-variant font-mono text-[10px] uppercase">
                <span>Profit Factor</span>
                <Scale className="w-4 h-4 text-secondary" />
              </div>
              <div>
                <div className="font-mono text-xl font-bold text-secondary tabular-nums">
                  {result.profitFactor.toFixed(2)}
                </div>
                <div className="font-mono text-[11px] text-on-surface-variant mt-1">
                  Gross Win / Gross Loss
                </div>
              </div>
            </div>

            <div className="bg-surface-container-low p-4 rounded-xl border border-white/5 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between text-on-surface-variant font-mono text-[10px] uppercase">
                <span>Max Drawdown</span>
                <Shield className="w-4 h-4 text-tertiary" />
              </div>
              <div>
                <div className="font-mono text-xl font-bold text-tertiary tabular-nums">
                  {result.maxDrawdownPct.toFixed(2)}%
                </div>
                <div className="font-mono text-[11px] text-on-surface-variant mt-1">
                  Obsunięcie od szczytu
                </div>
              </div>
            </div>

            <div className="bg-surface-container-low p-4 rounded-xl border border-white/5 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between text-on-surface-variant font-mono text-[10px] uppercase">
                <span>Śr. Zysk / Strata</span>
              </div>
              <div>
                <div className="font-mono text-sm font-bold tabular-nums">
                  <span className="text-tertiary">{formatUsd(result.avgWinUsd, true)}</span>{' '}
                  <span className="text-on-surface-variant">/</span>{' '}
                  <span className="text-error">{formatUsd(result.avgLossUsd)}</span>
                </div>
                <div className="font-mono text-[11px] text-on-surface-variant mt-1 tabular-nums">
                  R:R = <strong className="text-on-surface">{result.rrRatio.toFixed(2)}</strong>
                </div>
              </div>
            </div>

            <div className="bg-surface-container-low p-4 rounded-xl border border-white/5 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between text-on-surface-variant font-mono text-[10px] uppercase">
                <span>Maker vs Taker Fee</span>
              </div>
              <div>
                <div className="font-mono text-sm font-bold text-tertiary tabular-nums">
                  +{formatUsd(result.makerFeeSavingsUsd)} Oszczędz.
                </div>
                <div className="font-mono text-[11px] text-error mt-1 tabular-nums">
                  -{formatUsd(result.totalFeesPaidUsd)} zapłacone opłaty
                </div>
              </div>
            </div>
          </div>

          {/* Equity Curve & Drawdown */}
          {charts && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
              <div className="lg:col-span-8 bg-surface-container-low p-4 rounded-xl border border-white/5 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-display text-base font-bold text-on-surface">
                      Krzywa Kapitału (Equity Growth Curve)
                    </span>
                    <p className="text-xs text-on-surface-variant">
                      Trajektoria PnL strategii vs Buy &amp; Hold BTC na dokładnie tym samym zakresie czasowym
                    </p>
                  </div>
                  <div className="flex items-center gap-4 font-mono text-[10px] tabular-nums">
                    <span className="text-tertiary font-bold">
                      ScalpEngine ({result.roiPct >= 0 ? '+' : ''}
                      {result.roiPct.toFixed(2)}%)
                    </span>
                    <span className="text-on-surface-variant">
                      BTC B&amp;H ({result.btcBenchmarkRoiPct >= 0 ? '+' : ''}
                      {result.btcBenchmarkRoiPct.toFixed(2)}%)
                    </span>
                  </div>
                </div>

                <div className="relative w-full h-64 bg-surface-container-lowest rounded-lg p-3 flex flex-col justify-between">
                  <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 800 220">
                    <defs>
                      <linearGradient id="btEqGrad" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#4ced9f" stopOpacity="0.32" />
                        <stop offset="100%" stopColor="#4ced9f" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d={charts.btcPath}
                      fill="none"
                      stroke="#848e9c"
                      strokeDasharray="4 4"
                      strokeOpacity="0.7"
                      strokeWidth="1.5"
                    />
                    <polygon fill="url(#btEqGrad)" points={charts.eqPoly} />
                    <path d={charts.eqPath} fill="none" stroke="#4ced9f" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                  <div className="flex justify-between font-mono text-[10px] text-on-surface-variant tabular-nums">
                    <span>Start: {formatUsd(result.initialCapital)}</span>
                    <span className="text-tertiary font-bold">Koniec: {formatUsd(result.finalCapital)}</span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-4 bg-surface-container-low p-4 rounded-xl border border-white/5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-display text-base font-bold text-on-surface">
                      Obsunięcie (Underwater DD)
                    </span>
                    <p className="text-xs text-on-surface-variant">Odchylenie % od szczytu kapitału</p>
                  </div>
                  <span className="font-mono text-[11px] text-error font-bold tabular-nums">
                    Peak: {result.maxDrawdownPct.toFixed(2)}%
                  </span>
                </div>

                <div className="relative w-full h-64 bg-surface-container-lowest rounded-lg p-3 flex flex-col justify-between">
                  <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 400 220">
                    <defs>
                      <linearGradient id="btDdGrad" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#ffb4ab" stopOpacity="0" />
                        <stop offset="100%" stopColor="#ffb4ab" stopOpacity="0.45" />
                      </linearGradient>
                    </defs>
                    <polygon fill="url(#btDdGrad)" points={charts.ddPoly} />
                    <path d={charts.ddPath} fill="none" stroke="#ffb4ab" strokeWidth="1.8" />
                  </svg>
                  <div className="flex justify-between font-mono text-[10px] text-on-surface-variant tabular-nums">
                    <span>0.00% (ATH)</span>
                    <span className="text-error">Max DD: {result.maxDrawdownPct.toFixed(2)}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Per-Pair Breakdown Table */}
          <div className="bg-surface-container-low rounded-xl border border-white/5 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-display text-base font-bold text-on-surface">
                  Dekonstrukcja Wyników wg Par
                </span>
                <p className="text-xs text-on-surface-variant">
                  Rzeczywista skuteczność i zysk netto per instrument w wybranym koszyku
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-xs tabular-nums">
                <thead>
                  <tr className="bg-surface-container text-on-surface-variant text-[10px] uppercase">
                    <th className="py-2 px-3 rounded-l">Instrument</th>
                    <th className="py-2 px-3">Liczba Zleceń</th>
                    <th className="py-2 px-3">Win Rate</th>
                    <th className="py-2 px-3">Wygrane / Przegrane</th>
                    <th className="py-2 px-3">Zrealizowany PnL</th>
                    <th className="py-2 px-3">Max Drawdown</th>
                    <th className="py-2 px-3">Udział Maker</th>
                    <th className="py-2 px-3 rounded-r text-right">Śr. Czas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {result.pairBreakdown.map((row) => (
                    <tr key={row.base} className="hover:bg-surface-container/60 transition-colors">
                      <td className="py-2.5 px-3 font-display font-bold text-on-surface">{row.displayPair}</td>
                      <td className="py-2.5 px-3 text-on-surface">{row.trades} transakcji</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className="text-tertiary font-bold">{row.winRatePct.toFixed(1)}%</span>
                          <div className="w-16 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                            <div
                              className="bg-tertiary h-full rounded-full"
                              style={{ width: `${Math.min(100, row.winRatePct)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-on-surface-variant">
                        {row.wins} W / {row.losses} L
                      </td>
                      <td
                        className={`py-2.5 px-3 font-bold ${
                          row.netPnlUsd >= 0 ? 'text-tertiary' : 'text-error'
                        }`}
                      >
                        {formatUsd(row.netPnlUsd, true)}
                      </td>
                      <td className="py-2.5 px-3 text-error">{row.maxDrawdownPct.toFixed(2)}%</td>
                      <td className="py-2.5 px-3 text-on-surface">{row.makerPct.toFixed(1)}%</td>
                      <td className="py-2.5 px-3 text-right text-on-surface-variant">
                        {row.avgDurationMin.toFixed(1)} min
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sample Recent Backtest Trades */}
          {result.trades.length > 0 && (
            <div className="bg-surface-container-low rounded-xl border border-white/5 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-display text-sm font-bold text-on-surface">
                  Ostatnie Symulowane Transakcje ({Math.min(25, result.trades.length)} z {result.trades.length})
                </span>
              </div>
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-left border-collapse font-mono text-[11px] tabular-nums">
                  <thead className="sticky top-0 bg-surface-container text-on-surface-variant text-[10px] uppercase">
                    <tr>
                      <th className="py-2 px-3">Czas zamknięcia</th>
                      <th className="py-2 px-3">Para</th>
                      <th className="py-2 px-3">Kierunek</th>
                      <th className="py-2 px-3">Wejście</th>
                      <th className="py-2 px-3">Wyjście</th>
                      <th className="py-2 px-3">Powód</th>
                      <th className="py-2 px-3 text-right">PnL Netto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {result.trades.slice(0, 25).map((t) => (
                      <tr key={t.id} className="hover:bg-surface-container/50">
                        <td className="py-2 px-3 text-on-surface-variant">{formatShortDateTime(t.closedAt)}</td>
                        <td className="py-2 px-3 font-bold text-on-surface">{t.displayPair}</td>
                        <td className="py-2 px-3">
                          <span className={t.side === 'LONG' ? 'text-tertiary font-bold' : 'text-error font-bold'}>
                            {t.side}
                          </span>
                        </td>
                        <td className="py-2 px-3">{formatPrice(t.entryPrice)}</td>
                        <td className="py-2 px-3">{formatPrice(t.exitPrice)}</td>
                        <td className="py-2 px-3 text-on-surface-variant">{t.exitReason}</td>
                        <td
                          className={`py-2 px-3 text-right font-bold ${
                            t.netPnlUsd >= 0 ? 'text-tertiary' : 'text-error'
                          }`}
                        >
                          {formatUsd(t.netPnlUsd, true)} ({t.netPnlPct >= 0 ? '+' : ''}
                          {t.netPnlPct.toFixed(2)}%)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Action Footer */}
          <div className="bg-surface-container-low p-4 rounded-xl border border-white/5 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-display text-sm font-bold text-on-surface">
                  Weryfikacja Historyczna Ukończona
                </span>
                <span className="text-xs text-on-surface-variant font-mono tabular-nums">
                  Wartość oczekiwana (EV): {formatUsd(result.expectedValueUsd, true)} / transakcja
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>Eksportuj CSV</span>
              </button>
              <button
                type="button"
                onClick={handleApplyToLive}
                className="px-4 py-2 rounded-lg bg-tertiary hover:bg-tertiary-fixed text-on-tertiary font-display text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Zap className="w-4 h-4" />
                <span>Zastosuj w bocie Live</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
