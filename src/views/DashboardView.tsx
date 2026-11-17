import React, { useMemo, useState } from 'react';
import {
  Activity,
  CandlestickChart,
  History,
  PieChart,
  Shield,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';
import { useBot } from '../engine/botContext';
import { formatPrice, formatTimeHms, formatUsd } from '../engine/format';
import { BotEventCategory } from '../engine/types';

export const DashboardView: React.FC = () => {
  const {
    equity,
    startingEquity,
    availableBalance,
    todayRealizedPnl,
    unrealizedPnl,
    effectiveLeverage,
    drawdownPct,
    config,
    activePositions,
    pendingOrders,
    closedTrades,
    events,
    wsStatus,
    closePositionMarket,
    cancelPendingOrder,
    setActiveRoute,
  } = useBot();

  const [winRateScope, setWinRateScope] = useState<'today' | '7d'>('today');
  const [chartWindow, setChartWindow] = useState<'24H' | '7D' | '30D' | 'ALL'>('24H');
  const [showCumFees, setShowCumFees] = useState(true);
  const [feedFilter, setFeedFilter] = useState<'ALL' | 'SIGNAL' | 'FILL' | 'WARNING'>('ALL');
  const [autoScroll, setAutoScroll] = useState(true);

  const now = Date.now();

  // Win rate stats
  const scopedTrades = useMemo(() => {
    if (winRateScope === 'today') {
      const sod = new Date();
      sod.setHours(0, 0, 0, 0);
      return closedTrades.filter((t) => t.closedAt >= sod.getTime());
    }
    const weekAgo = now - 7 * 86400000;
    return closedTrades.filter((t) => t.closedAt >= weekAgo);
  }, [closedTrades, winRateScope, now]);

  const winsCount = scopedTrades.filter((t) => t.netPnlUsd > 0).length;
  const lossesCount = scopedTrades.length - winsCount;
  const winRatePct = scopedTrades.length > 0 ? (winsCount / scopedTrades.length) * 100 : 0;
  const wlRatio = lossesCount > 0 ? winsCount / lossesCount : winsCount;

  // Maker efficiency
  const makerStats = useMemo(() => {
    if (closedTrades.length === 0) {
      return { makerPct: config.postOnly ? 100 : 0, netFees: 0, totalOrders: 0 };
    }
    let makerLegs = 0;
    let totalFees = 0;
    for (const t of closedTrades) {
      if (t.isMakerEntry) makerLegs++;
      if (t.isMakerExit) makerLegs++;
      totalFees += t.feesUsd;
    }
    return {
      makerPct: (makerLegs / (closedTrades.length * 2)) * 100,
      netFees: -totalFees,
      totalOrders: closedTrades.length,
    };
  }, [closedTrades, config.postOnly]);

  // Equity curve points from real closedTrades
  const equityCurve = useMemo(() => {
    const cutoff =
      chartWindow === '24H'
        ? now - 86400000
        : chartWindow === '7D'
          ? now - 7 * 86400000
          : chartWindow === '30D'
            ? now - 30 * 86400000
            : 0;

    const sorted = closedTrades
      .slice()
      .sort((a, b) => a.closedAt - b.closedAt)
      .filter((t) => t.closedAt >= cutoff);

    // Reconstruct running equity backwards from current equity if trades exist
    const totalWindowNet = sorted.reduce((acc, t) => acc + t.netPnlUsd, 0);
    let runningEq = equity - totalWindowNet;
    let runningFees = 0;

    const pts: Array<{ time: number; equity: number; cumFees: number }> = [
      { time: sorted[0]?.openedAt ?? now - 3600000, equity: runningEq, cumFees: 0 },
    ];
    for (const t of sorted) {
      runningEq += t.netPnlUsd;
      runningFees += t.feesUsd;
      pts.push({ time: t.closedAt, equity: runningEq, cumFees: runningFees });
    }
    pts.push({ time: now, equity: equity + unrealizedPnl, cumFees: runningFees });
    return pts;
  }, [closedTrades, chartWindow, equity, unrealizedPnl, now]);

  const highWaterMark = useMemo(() => {
    return Math.max(startingEquity, ...equityCurve.map((p) => p.equity));
  }, [equityCurve, startingEquity]);

  const minCurveEq = Math.min(...equityCurve.map((p) => p.equity), startingEquity * 0.99);
  const maxCurveEq = Math.max(...equityCurve.map((p) => p.equity), startingEquity * 1.01);
  const eqRange = Math.max(50, maxCurveEq - minCurveEq);

  const svgPoints = useMemo(() => {
    const W = 1000;
    const H = 190;
    const padTop = 14;
    const padBot = 16;
    const usableH = H - padTop - padBot;

    return equityCurve.map((p, idx) => {
      const x = equityCurve.length > 1 ? (idx / (equityCurve.length - 1)) * W : W;
      const y = padTop + usableH - ((p.equity - minCurveEq) / eqRange) * usableH;
      const feeRatio = Math.min(1, Math.abs(p.cumFees) / Math.max(50, eqRange * 0.3));
      const feeY = H - 8 - feeRatio * 36;
      return { x, y, feeY };
    });
  }, [equityCurve, minCurveEq, eqRange]);

  const linePath = svgPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath =
    svgPoints.length > 0
      ? `${linePath} L ${svgPoints[svgPoints.length - 1].x.toFixed(1)},190 L 0,190 Z`
      : '';
  const feePath = svgPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.feeY.toFixed(1)}`)
    .join(' ');

  const totalNotional = activePositions.reduce((acc, p) => acc + p.notionalUsd, 0);
  const totalTodayPnl = todayRealizedPnl + unrealizedPnl;
  const totalTodayPct = equity > 0 ? (totalTodayPnl / equity) * 100 : 0;

  // Drawdown guard progress
  const absDd = Math.abs(drawdownPct);
  const ddLimit = config.dailyMaxLossPct;
  const ddProgressPct = ddLimit > 0 ? Math.min(100, (absDd / ddLimit) * 100) : 0;
  const ddRemaining = Math.max(0, ddLimit - absDd);

  const filteredEvents = useMemo(() => {
    if (feedFilter === 'ALL') return events;
    const map: Record<'SIGNAL' | 'FILL' | 'WARNING', BotEventCategory[]> = {
      SIGNAL: ['SIGNAL'],
      FILL: ['FILL', 'EXIT'],
      WARNING: ['WARNING'],
    };
    return events.filter((e) => map[feedFilter].includes(e.category));
  }, [events, feedFilter]);

  return (
    <div className="flex flex-col w-full gap-3">
      {/* Top 5 Micro-Telemetry KPI Matrix */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {/* Card 1: Equity & Leverage */}
        <div className="bg-surface-container-low rounded-lg p-4 flex flex-col justify-between border border-white/5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-primary" />
              Kapitał (Total Equity)
            </span>
            <span className="font-mono text-[10px] text-on-surface-variant font-semibold">
              {config.marketType === 'spot_margin' ? 'SPOT MARGIN' : 'PERP'}
            </span>
          </div>
          <div className="my-2">
            <div className="font-mono text-2xl font-bold text-on-surface tracking-tight tabular-nums">
              {formatUsd(equity + unrealizedPnl)}
            </div>
          </div>
          <div className="flex flex-col gap-1 font-mono text-[11px] text-on-surface-variant tabular-nums">
            <div className="flex justify-between items-center">
              <span>Available:</span>
              <span className="text-on-surface font-semibold">{formatUsd(availableBalance)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Dźwignia efekt.:</span>
              <span className="text-primary font-bold">
                {effectiveLeverage.toFixed(1)}x{' '}
                <span className="text-on-surface-variant/70 font-normal">/ {config.leverage}.0x Max</span>
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Daily Net PnL */}
        <div className="bg-surface-container-low rounded-lg p-4 flex flex-col justify-between border border-white/5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
              <TrendingUp className={`w-3.5 h-3.5 ${totalTodayPnl >= 0 ? 'text-tertiary' : 'text-error'}`} />
              PnL Dzisiaj (Netto)
            </span>
            <span className="font-mono text-[10px] text-on-surface-variant">
              {closedTrades.length} zamk.
            </span>
          </div>
          <div className="my-2 flex items-baseline gap-2">
            <span
              className={`font-mono text-2xl font-bold tracking-tight tabular-nums ${
                totalTodayPnl >= 0 ? 'text-tertiary' : 'text-error'
              }`}
            >
              {formatUsd(totalTodayPnl, true)}
            </span>
            <span
              className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded tabular-nums ${
                totalTodayPnl >= 0 ? 'bg-tertiary/10 text-tertiary' : 'bg-error/10 text-error'
              }`}
            >
              {totalTodayPct >= 0 ? '+' : ''}
              {totalTodayPct.toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between items-center font-mono text-[11px] text-on-surface-variant tabular-nums">
            <span>Niezrealizowany (uPnL):</span>
            <span className={`font-semibold ${unrealizedPnl >= 0 ? 'text-tertiary' : 'text-error'}`}>
              {formatUsd(unrealizedPnl, true)}
            </span>
          </div>
        </div>

        {/* Card 3: Win Ratio */}
        <div className="bg-surface-container-low rounded-lg p-4 flex flex-col justify-between border border-white/5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
              <PieChart className="w-3.5 h-3.5 text-primary" />
              Skuteczność (Win Rate)
            </span>
            <div className="flex items-center bg-surface-container rounded p-0.5">
              <button
                type="button"
                onClick={() => setWinRateScope('today')}
                className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold transition-colors ${
                  winRateScope === 'today'
                    ? 'bg-primary-container text-on-primary-container'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Dziś
              </button>
              <button
                type="button"
                onClick={() => setWinRateScope('7d')}
                className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold transition-colors ${
                  winRateScope === '7d'
                    ? 'bg-primary-container text-on-primary-container'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                7D
              </button>
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-on-surface tabular-nums">
              {scopedTrades.length > 0 ? `${winRatePct.toFixed(1)}%` : '—'}
            </span>
            <span className="font-mono text-[10px] text-tertiary font-bold tracking-wider">
              {winRatePct >= 65 ? 'PRO TARGET' : 'Z-SCORE MR'}
            </span>
          </div>
          <div className="flex justify-between items-center font-mono text-[11px] tabular-nums">
            <div className="flex items-center gap-1 text-on-surface-variant">
              <span>Stosunek:</span>
              <span className="text-tertiary font-bold">{winsCount}W</span>
              <span>/</span>
              <span className="text-error font-bold">{lossesCount}L</span>
            </div>
            <span className="text-on-surface-variant/80">W/L: {wlRatio.toFixed(2)}</span>
          </div>
        </div>

        {/* Card 4: Execution Efficiency */}
        <div className="bg-surface-container-low rounded-lg p-4 flex flex-col justify-between border border-white/5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-secondary" />
              Efektywność Maker
            </span>
            <span className="font-mono text-[10px] text-secondary font-bold">
              {config.postOnly ? 'POST-ONLY' : 'MARKET'}
            </span>
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-bold text-secondary tabular-nums">
              {makerStats.makerPct.toFixed(1)}%
            </span>
            <span className="font-mono text-[11px] text-on-surface-variant tabular-nums">
              / {makerStats.totalOrders} zleceń
            </span>
          </div>
          <div className="flex justify-between items-center font-mono text-[11px] text-on-surface-variant tabular-nums">
            <span>Opłaty netto:</span>
            <span className="text-on-surface font-semibold">
              {formatUsd(makerStats.netFees)}{' '}
              <span className="text-tertiary text-[10px]">({config.makerFeePct.toFixed(3)}%)</span>
            </span>
          </div>
        </div>

        {/* Card 5: Drawdown Guard */}
        <div className="bg-surface-container-low rounded-lg p-4 flex flex-col justify-between border border-white/5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-primary" />
              Drawdown Guard
            </span>
            <span
              className={`font-mono text-[10px] font-bold uppercase tracking-wider ${
                ddProgressPct >= 80 ? 'text-error' : 'text-tertiary'
              }`}
            >
              {ddProgressPct >= 80 ? 'OSTRZEŻENIE' : 'BEZPIECZNIK OK'}
            </span>
          </div>
          <div className="my-2">
            <div className="flex justify-between items-baseline mb-1.5 font-mono tabular-nums">
              <span className="text-xl font-bold text-on-surface">
                -{absDd.toFixed(2)}%
              </span>
              <span className="text-[11px] text-on-surface-variant">
                Max: <span className="text-error font-semibold">-{ddLimit.toFixed(1)}%</span>
              </span>
            </div>
            <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden flex">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  ddProgressPct >= 75 ? 'bg-error' : 'bg-tertiary'
                }`}
                style={{ width: `${Math.max(4, ddProgressPct)}%` }}
              />
            </div>
          </div>
          <div className="flex justify-between items-center font-mono text-[11px] text-on-surface-variant tabular-nums">
            <span>Status limitu:</span>
            <span className="text-tertiary font-bold">{ddRemaining.toFixed(2)}% do Auto-Kill</span>
          </div>
        </div>
      </section>

      {/* Main Trading Core Layout (65% / 35% Split) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        {/* LEFT MAIN DESK */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          {/* Panel A: Equity Curve Terminal */}
          <div className="bg-surface-container-low rounded-lg p-4 border border-white/5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="font-display text-[15px] font-semibold text-on-surface">
                  Krzywa Kapitału &amp; Wolumen PnL
                </span>
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-surface-container font-mono text-[11px] tabular-nums">
                  <span className="text-on-surface-variant">High-Water Mark:</span>
                  <span className="text-tertiary font-bold">{formatUsd(highWaterMark)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer select-none text-on-surface-variant hover:text-on-surface">
                  <input
                    type="checkbox"
                    checked={showCumFees}
                    onChange={(e) => setShowCumFees(e.target.checked)}
                    className="accent-primary-container h-3.5 w-3.5 rounded"
                  />
                  <span className="font-mono text-[10px] uppercase tracking-wider">Prowizje skumulowane</span>
                </label>

                <div className="flex items-center bg-surface-container rounded p-0.5">
                  {(['24H', '7D', '30D', 'ALL'] as const).map((tf) => (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setChartWindow(tf)}
                      className={`px-2.5 py-0.5 rounded font-mono text-[10px] font-bold transition-colors ${
                        chartWindow === tf
                          ? 'bg-surface-container-highest text-primary'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative w-full h-56 bg-surface-container-lowest rounded-lg p-3 overflow-hidden flex flex-col justify-between">
              {/* Grid */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none p-4 opacity-25">
                <div className="w-full h-[1px] bg-surface-container-high" />
                <div className="w-full h-[1px] bg-surface-container-high" />
                <div className="w-full h-[1px] bg-surface-container-high" />
                <div className="w-full h-[1px] bg-surface-container-high" />
              </div>

              {/* Y-Axis Labels */}
              <div className="absolute right-3 top-2 bottom-6 flex flex-col justify-between pointer-events-none font-mono text-[10px] text-on-surface-variant text-right tabular-nums z-20">
                <span>{formatUsd(maxCurveEq)}</span>
                <span>{formatUsd(minCurveEq + eqRange * 0.66)}</span>
                <span>{formatUsd(minCurveEq + eqRange * 0.33)}</span>
                <span>{formatUsd(minCurveEq)}</span>
              </div>

              <div className="w-full h-full relative z-10 pr-16">
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 1000 190">
                  <defs>
                    <linearGradient id="dashEqGrad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#4ced9f" stopOpacity="0.32" />
                      <stop offset="90%" stopColor="#4ced9f" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  {showCumFees && feePath && (
                    <path
                      d={feePath}
                      fill="none"
                      stroke="#ffb94f"
                      strokeDasharray="4 4"
                      strokeWidth="1.5"
                      opacity="0.75"
                    />
                  )}
                  {areaPath && <polygon fill="url(#dashEqGrad)" points={`${svgPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} 1000,190 0,190`} />}
                  {linePath && (
                    <path
                      d={linePath}
                      fill="none"
                      stroke="#4ced9f"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  {svgPoints.length > 0 && (
                    <circle
                      cx={svgPoints[svgPoints.length - 1].x}
                      cy={svgPoints[svgPoints.length - 1].y}
                      r="4.5"
                      fill="#4ced9f"
                    />
                  )}
                </svg>
              </div>

              <div className="flex justify-between items-center text-on-surface-variant font-mono text-[10px] z-10 pr-16 tabular-nums">
                <span>Start: {formatTimeHms(equityCurve[0]?.time ?? now)}</span>
                <span>{closedTrades.length === 0 ? 'Brak zamkniętych transakcji w tej sesji — oczekuję na sygnał lub test ręczny' : `Transakcji w oknie: ${equityCurve.length - 2}`}</span>
                <span>Teraz: {formatTimeHms(now)}</span>
              </div>
            </div>
          </div>

          {/* Panel B: Live Active Positions Matrix */}
          <div className="bg-surface-container-low rounded-lg p-4 border border-white/5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="font-display text-[15px] font-semibold text-on-surface">
                  Aktywne Pozycje Scalp
                </span>
                <span className="px-2 py-0.5 rounded bg-tertiary-container/15 text-tertiary font-mono text-[10px] font-bold">
                  {activePositions.length} AKTYWNE
                </span>
              </div>
              <span className="font-mono text-[11px] text-on-surface-variant tabular-nums">
                Ekspozycja łączna: <strong className="text-on-surface">{formatUsd(totalNotional)}</strong>
              </span>
            </div>

            {activePositions.length === 0 ? (
              <div className="bg-surface-container-lowest rounded-lg p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-white/5">
                <div className="flex flex-col gap-1">
                  <span className="font-display text-sm font-semibold text-on-surface">
                    Brak otwartych pozycji w tym momencie
                  </span>
                  <span className="text-xs text-on-surface-variant">
                    Silnik skanuje {config.activePairs.length} par na Bybit co sekundę. Możesz także otworzyć zlecenie testowe w Skanerze Rynku lub uruchomić Backtest historyczny.
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveRoute('skaner-rynku')}
                    className="px-3 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-primary font-mono text-[11px] font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <CandlestickChart className="w-3.5 h-3.5" />
                    <span>Skaner Rynku</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveRoute('backtester')}
                    className="px-3 py-2 rounded-lg bg-primary-container text-on-primary-container hover:bg-primary font-mono text-[11px] font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Backtester Bybit</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-[11px] tabular-nums">
                  <thead>
                    <tr className="bg-surface-container text-[10px] text-on-surface-variant uppercase">
                      <th className="py-2 px-3 rounded-l">Para / Kierunek</th>
                      <th className="py-2 px-3">Wartość (Notional)</th>
                      <th className="py-2 px-3">Wejście / Mark</th>
                      <th className="py-2 px-3">TP / SL</th>
                      <th className="py-2 px-3">Time-Stop ({config.timeStopMinutes}m)</th>
                      <th className="py-2 px-3">PnL Netto</th>
                      <th className="py-2 px-3 text-right rounded-r">Akcja</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {activePositions.map((pos) => {
                      const elapsedSec = Math.max(0, Math.floor((now - pos.openedAt) / 1000));
                      const totalSec = pos.timeStopMinutes * 60;
                      const pctElapsed = Math.min(100, (elapsedSec / totalSec) * 100);
                      const mins = Math.floor(elapsedSec / 60);
                      const secs = elapsedSec % 60;

                      return (
                        <tr key={pos.id} className="hover:bg-surface-container/60 transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <span className="font-display font-bold text-xs text-on-surface">
                                {pos.displayPair}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  pos.side === 'LONG'
                                    ? 'bg-tertiary/15 text-tertiary'
                                    : 'bg-error-container/40 text-error'
                                }`}
                              >
                                {pos.side} {pos.leverage}x
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-col">
                              <span className="font-bold text-on-surface">{formatUsd(pos.notionalUsd)}</span>
                              <span className="text-[10px] text-on-surface-variant">
                                {pos.qty.toFixed(pos.qty > 10 ? 2 : 4)} {pos.base}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-col">
                              <span className="text-on-surface-variant">{formatPrice(pos.entryPrice)}</span>
                              <span className="text-on-surface font-semibold">{formatPrice(pos.markPrice)}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-col">
                              <span className="text-tertiary">TP: {formatPrice(pos.tpPrice)}</span>
                              <span className="text-error">SL: {formatPrice(pos.slPrice)}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-col gap-1 w-24">
                              <div className="flex justify-between text-[10px] text-on-surface-variant">
                                <span>
                                  {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
                                </span>
                                <span>{pos.timeStopMinutes}:00</span>
                              </div>
                              <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    pctElapsed > 70 ? 'bg-primary-container' : 'bg-secondary-container'
                                  }`}
                                  style={{ width: `${pctElapsed}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-col">
                              <span
                                className={`font-bold ${
                                  pos.unrealizedPnlUsd >= 0 ? 'text-tertiary' : 'text-error'
                                }`}
                              >
                                {formatUsd(pos.unrealizedPnlUsd, true)}
                              </span>
                              <span
                                className={`text-[10px] ${
                                  pos.unrealizedPnlPct >= 0 ? 'text-tertiary' : 'text-error'
                                }`}
                              >
                                {pos.unrealizedPnlPct >= 0 ? '+' : ''}
                                {pos.unrealizedPnlPct.toFixed(2)}%
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => closePositionMarket(pos.id)}
                              className="px-2.5 py-1 rounded bg-surface-container text-error hover:bg-error-container hover:text-on-error-container font-mono text-[10px] font-bold uppercase transition-colors whitespace-nowrap"
                            >
                              Zamknij Mkt
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Panel C: Pending Maker Orders (Post-Only Desk) */}
          <div className="bg-surface-container-low rounded-lg p-4 border border-white/5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="font-display text-[15px] font-semibold text-on-surface">
                  Oczekujące Zlecenia Maker
                </span>
                <span className="px-2 py-0.5 rounded bg-secondary-container/20 text-secondary font-mono text-[10px] font-bold">
                  {pendingOrders.length} LIMIT POST-ONLY
                </span>
              </div>
              <span className="font-mono text-[10px] text-on-surface-variant uppercase">
                Max TTL: {config.orderTtlSec} sek.
              </span>
            </div>

            {pendingOrders.length === 0 ? (
              <div className="bg-surface-container-lowest rounded-lg p-4 text-xs text-on-surface-variant font-mono">
                Brak oczekujących zleceń Limit Post-Only w arkuszu.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pendingOrders.map((ord) => {
                  const remainingSec = Math.max(0, Math.ceil((ord.expiresAt - now) / 1000));
                  const pctLeft = Math.min(100, (remainingSec / ord.ttlSec) * 100);
                  return (
                    <div
                      key={ord.id}
                      className="bg-surface-container-lowest p-3 rounded-lg border border-white/5 flex items-center justify-between gap-3"
                    >
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[13px] font-bold text-on-surface">
                            {ord.displayPair}
                          </span>
                          <span
                            className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              ord.side === 'LONG'
                                ? 'bg-tertiary/15 text-tertiary'
                                : 'bg-error-container/30 text-error'
                            }`}
                          >
                            {ord.side === 'LONG' ? 'BUY ENTRY' : 'SELL ENTRY'}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-on-surface-variant tabular-nums">
                          Limit: <span className="text-on-surface font-semibold">{formatPrice(ord.limitPrice)}</span> ·{' '}
                          {formatUsd(ord.notionalUsd)}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end font-mono tabular-nums">
                          <span className="text-[11px] text-secondary font-bold">
                            TTL: {remainingSec}s / {ord.ttlSec}s
                          </span>
                          <div className="w-16 h-1 bg-surface-container rounded-full overflow-hidden mt-1">
                            <div
                              className="h-full bg-secondary rounded-full transition-all"
                              style={{ width: `${pctLeft}%` }}
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => cancelPendingOrder(ord.id)}
                          className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface font-mono text-[10px] uppercase transition-colors"
                        >
                          Anuluj
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT DESK: REAL-TIME TELEMETRY FEED */}
        <div className="lg:col-span-4 flex flex-col">
          <div className="bg-surface-container-low rounded-lg p-4 border border-white/5 flex flex-col h-full min-h-[540px] justify-between gap-3">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  <span className="font-display text-[15px] font-semibold text-on-surface">
                    Live Event Feed
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setAutoScroll((v) => !v)}
                  className="flex items-center gap-2 font-mono text-[10px] uppercase text-on-surface-variant hover:text-on-surface"
                >
                  <span>Auto-Scroll</span>
                  <span
                    className={`w-7 h-4 rounded-full p-0.5 flex items-center transition-colors ${
                      autoScroll ? 'bg-primary-container justify-end' : 'bg-surface-container-highest justify-start'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full bg-surface-container-lowest" />
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-1 overflow-x-auto">
                {(
                  [
                    { id: 'ALL', label: 'Wszystkie' },
                    { id: 'SIGNAL', label: 'Sygnały' },
                    { id: 'FILL', label: 'Fills' },
                    { id: 'WARNING', label: 'Ostrzeżenia' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFeedFilter(tab.id)}
                    className={`px-2.5 py-1 rounded font-mono text-[10px] font-bold transition-colors whitespace-nowrap shrink-0 ${
                      feedFilter === tab.id
                        ? 'bg-surface-container-highest text-primary'
                        : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto max-h-[460px] pr-1 font-mono text-[11px]">
              {filteredEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="p-2.5 rounded-lg bg-surface-container-lowest/90 hover:bg-surface-container transition-colors flex flex-col gap-1 border border-white/5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-on-surface-variant text-[10px] tabular-nums">
                        {formatTimeHms(ev.timestamp)}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                          ev.category === 'EXIT' && (ev.pnlUsd ?? 0) >= 0
                            ? 'bg-tertiary-container/20 text-tertiary'
                            : ev.category === 'WARNING' || (ev.category === 'EXIT' && (ev.pnlUsd ?? 0) < 0)
                              ? 'bg-error-container/30 text-error'
                              : ev.category === 'FILL'
                                ? 'bg-secondary-container/20 text-secondary'
                                : ev.category === 'SIGNAL'
                                  ? 'bg-primary/20 text-primary'
                                  : 'bg-surface-container text-on-surface-variant'
                        }`}
                      >
                        {ev.tag}
                      </span>
                    </div>
                    {typeof ev.pnlUsd === 'number' ? (
                      <span className={`font-bold tabular-nums ${ev.pnlUsd >= 0 ? 'text-tertiary' : 'text-error'}`}>
                        {formatUsd(ev.pnlUsd, true)}
                      </span>
                    ) : ev.badgeText ? (
                      <span className="text-on-surface-variant text-[10px]">{ev.badgeText}</span>
                    ) : null}
                  </div>
                  <div className="text-on-surface font-sans text-xs leading-snug">{ev.message}</div>
                </div>
              ))}
            </div>

            <div className="bg-surface-container-lowest p-2.5 rounded-lg flex items-center justify-between font-mono text-[11px]">
              <span className="text-on-surface font-semibold">
                {wsStatus.connected ? 'Bybit WS Stream: Active' : 'Bybit REST Sync: Active'}
              </span>
              <span className="text-on-surface-variant tabular-nums">
                {wsStatus.messagesReceived.toLocaleString('en-US')} msg
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
