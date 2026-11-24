import { buildIndicatorSeries, evaluatePointSignal } from './indicators';
import {
  BacktestPairBreakdown,
  BacktestParams,
  BacktestPoint,
  BacktestResult,
  Candle,
  ClosedTrade,
  IndicatorPoint,
  StrategyConfig,
  formatBybitSymbol,
} from './types';

interface SimPending {
  base: string;
  symbol: string;
  displayPair: string;
  side: 'LONG' | 'SHORT';
  limitPrice: number;
  notionalUsd: number;
  tpAnchorAtEntry: number;
  atrAtEntry: number;
  createdBarIdx: number;
  createdTime: number;
  zScoreAtEntry: number;
  rsiAtEntry: number;
  adxAtEntry: number;
}

interface SimPosition {
  base: string;
  symbol: string;
  displayPair: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  notionalUsd: number;
  qty: number;
  leverage: number;
  tpPrice: number;
  slPrice: number;
  entryFeeUsd: number;
  isMakerEntry: boolean;
  openedAt: number;
  openedBarIdx: number;
  zScoreAtEntry: number;
  rsiAtEntry: number;
  adxAtEntry: number;
}

export interface HistoricalBasketData {
  base: string;
  candles: Candle[];
}

export function runHistoricalBacktest(
  basketData: HistoricalBasketData[],
  strategy: StrategyConfig,
  params: BacktestParams
): BacktestResult {
  const startTimePerf = performance.now();

  const timeframeMinutes = Number(strategy.timeframe) || 1;
  const timeStopBars = Math.max(1, Math.round(strategy.timeStopMinutes / timeframeMinutes));
  const ttlBars = Math.max(1, Math.ceil(strategy.orderTtlSec / (timeframeMinutes * 60)));

  const makerFeeRate = params.makerFeePct / 100;
  const takerFeeRate = params.takerFeePct / 100;
  const slippageRate = params.slippagePct / 100;

  // Build indicator series per pair
  const pairSeriesMap = new Map<string, { displayPair: string; symbol: string; series: IndicatorPoint[] }>();
  let totalCandlesAnalyzed = 0;

  // Build unified timeline of timestamps across all basket pairs
  const timestampSet = new Set<number>();
  for (const item of basketData) {
    if (item.candles.length < 40) continue;
    totalCandlesAnalyzed += item.candles.length;
    const { symbol, displayPair } = formatBybitSymbol(item.base, strategy.marketType, strategy.quoteCurrency);
    const series = buildIndicatorSeries(item.candles, strategy);
    pairSeriesMap.set(item.base, { displayPair, symbol, series });
    for (let i = 30; i < series.length; i++) {
      timestampSet.add(series[i].time);
    }
  }

  const timeline = Array.from(timestampSet).sort((a, b) => a - b);
  if (timeline.length === 0) {
    return {
      ranAt: Date.now(),
      elapsedMs: Math.round(performance.now() - startTimePerf),
      totalCandlesAnalyzed: 0,
      startTimestamp: Date.now(),
      endTimestamp: Date.now(),
      initialCapital: params.initialCapital,
      finalCapital: params.initialCapital,
      netProfitUsd: 0,
      roiPct: 0,
      btcBenchmarkRoiPct: 0,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRatePct: 0,
      profitFactor: 0,
      maxDrawdownPct: 0,
      maxDrawdownAt: Date.now(),
      avgWinUsd: 0,
      avgLossUsd: 0,
      rrRatio: 0,
      totalFeesPaidUsd: 0,
      makerFeeSavingsUsd: 0,
      expectedValueUsd: 0,
      curve: [],
      pairBreakdown: [],
      trades: [],
    };
  }

  // Index map: pair -> Map<timestamp, { point, idx }>
  const pairTimeIndex = new Map<string, Map<number, { pt: IndicatorPoint; idx: number }>>();
  for (const [base, data] of pairSeriesMap.entries()) {
    const map = new Map<number, { pt: IndicatorPoint; idx: number }>();
    data.series.forEach((pt, idx) => map.set(pt.time, { pt, idx }));
    pairTimeIndex.set(base, map);
  }

  // Benchmark series (prefer BTC, else first available asset)
  const btcItem = basketData.find((b) => b.base === 'BTC' && b.candles.length > 30) || basketData[0];
  const btcCloseByTime = new Map<number, number>();
  let btcStartPrice = 0;
  if (btcItem) {
    for (const c of btcItem.candles) {
      if (c.time >= timeline[0] && btcStartPrice === 0) btcStartPrice = c.close;
      btcCloseByTime.set(c.time, c.close);
    }
    if (btcStartPrice === 0 && btcItem.candles.length > 0) btcStartPrice = btcItem.candles[0].close;
  }

  let equity = params.initialCapital;
  let highWaterMark = params.initialCapital;
  let maxDrawdownPct = 0;
  let maxDrawdownAt = timeline[0];

  const openPositions = new Map<string, SimPosition>();
  const pendingOrders = new Map<string, SimPending>();
  const closedTrades: ClosedTrade[] = [];

  let consecutiveLosses = 0;
  let cooldownUntilTs = 0;
  let currentDay = -1;
  let dayStartEquity = equity;
  let haltedForDay = false;

  const curve: BacktestPoint[] = [];
  const curveSampleStep = Math.max(1, Math.floor(timeline.length / 180));

  for (let tIdx = 0; tIdx < timeline.length; tIdx++) {
    const ts = timeline[tIdx];
    const day = Math.floor(ts / 86400000);
    if (day !== currentDay) {
      currentDay = day;
      dayStartEquity = equity;
      haltedForDay = false;
    }

    // Check daily max loss guard
    const dailyDrawdownPct = dayStartEquity > 0 ? ((dayStartEquity - equity) / dayStartEquity) * 100 : 0;
    if (dailyDrawdownPct >= strategy.dailyMaxLossPct) {
      haltedForDay = true;
    }

    // 1. Manage open positions (check TP, SL, Time-Stop)
    for (const [base, pos] of Array.from(openPositions.entries())) {
      const lookup = pairTimeIndex.get(base)?.get(ts);
      if (!lookup) continue;
      const pt = lookup.pt;

      // Update dynamic TP if TP mode is 'mean'
      const activeTp =
        strategy.tpMode === 'mean'
          ? pos.side === 'LONG'
            ? Math.max(pos.entryPrice * 1.0012, pt.anchor)
            : Math.min(pos.entryPrice * 0.9988, pt.anchor)
          : pos.tpPrice;

      let exitReason: ClosedTrade['exitReason'] | null = null;
      let exitPrice = pt.close;
      let isMakerExit = false;

      if (pos.side === 'LONG') {
        const hitSl = pt.low <= pos.slPrice;
        const hitTp = pt.high >= activeTp;
        if (hitSl && hitTp) {
          // Conservative: SL first if open closer to SL or same bar
          exitReason = 'SL_HIT';
          exitPrice = pos.slPrice * (1 - slippageRate);
        } else if (hitSl) {
          exitReason = 'SL_HIT';
          exitPrice = pos.slPrice * (1 - slippageRate);
        } else if (hitTp) {
          exitReason = 'TP_HIT';
          isMakerExit = Boolean(strategy.makerTakeProfit);
          exitPrice = isMakerExit ? activeTp : activeTp * (1 - slippageRate);
        }
      } else {
        const hitSl = pt.high >= pos.slPrice;
        const hitTp = pt.low <= activeTp;
        if (hitSl && hitTp) {
          exitReason = 'SL_HIT';
          exitPrice = pos.slPrice * (1 + slippageRate);
        } else if (hitSl) {
          exitReason = 'SL_HIT';
          exitPrice = pos.slPrice * (1 + slippageRate);
        } else if (hitTp) {
          exitReason = 'TP_HIT';
          isMakerExit = Boolean(strategy.makerTakeProfit);
          exitPrice = isMakerExit ? activeTp : activeTp * (1 + slippageRate);
        }
      }

      if (!exitReason && tIdx - pos.openedBarIdx >= timeStopBars) {
        exitReason = 'TIME_STOP';
        exitPrice = pos.side === 'LONG' ? pt.close * (1 - slippageRate) : pt.close * (1 + slippageRate);
        isMakerExit = false;
      }

      if (exitReason) {
        const exitFeeRate = isMakerExit ? makerFeeRate : takerFeeRate;
        const exitNotional = pos.qty * exitPrice;
        const exitFeeUsd = exitNotional * exitFeeRate;
        const grossPnlUsd =
          pos.side === 'LONG'
            ? (exitPrice - pos.entryPrice) * pos.qty
            : (pos.entryPrice - exitPrice) * pos.qty;
        const totalFees = pos.entryFeeUsd + exitFeeUsd;
        const netPnlUsd = grossPnlUsd - totalFees;
        const netPnlPct = pos.notionalUsd > 0 ? (netPnlUsd / pos.notionalUsd) * 100 : 0;

        equity += netPnlUsd;

        if (netPnlUsd < 0) {
          consecutiveLosses += 1;
          if (consecutiveLosses >= strategy.maxConsecutiveLosses) {
            cooldownUntilTs = ts + strategy.cooldownMinutes * 60000;
            consecutiveLosses = 0;
          }
        } else {
          consecutiveLosses = 0;
        }

        closedTrades.push({
          id: `BT-${closedTrades.length + 1}`,
          base: pos.base,
          symbol: pos.symbol,
          displayPair: pos.displayPair,
          side: pos.side,
          entryPrice: pos.entryPrice,
          exitPrice,
          notionalUsd: pos.notionalUsd,
          qty: pos.qty,
          leverage: pos.leverage,
          grossPnlUsd,
          feesUsd: totalFees,
          netPnlUsd,
          netPnlPct,
          isMakerEntry: pos.isMakerEntry,
          isMakerExit,
          exitReason,
          openedAt: pos.openedAt,
          closedAt: ts,
          durationSec: Math.max(60, Math.round((ts - pos.openedAt) / 1000)),
          zScoreAtEntry: pos.zScoreAtEntry,
          rsiAtEntry: pos.rsiAtEntry,
          adxAtEntry: pos.adxAtEntry,
        });

        openPositions.delete(base);
      }
    }

    // 2. Check pending Maker Post-Only orders
    for (const [base, pend] of Array.from(pendingOrders.entries())) {
      if (openPositions.has(base) || openPositions.size >= strategy.maxConcurrentPositions || haltedForDay) {
        pendingOrders.delete(base);
        continue;
      }

      const lookup = pairTimeIndex.get(base)?.get(ts);
      if (!lookup) continue;
      const pt = lookup.pt;

      const filled =
        pend.side === 'LONG' ? pt.low <= pend.limitPrice : pt.high >= pend.limitPrice;

      if (filled) {
        const entryPrice = pend.limitPrice;
        const qty = pend.notionalUsd / entryPrice;
        const entryFeeUsd = pend.notionalUsd * (strategy.postOnly ? makerFeeRate : takerFeeRate);
        const tpPrice =
          strategy.tpMode === 'mean'
            ? pend.side === 'LONG'
              ? Math.max(entryPrice * 1.0015, pend.tpAnchorAtEntry)
              : Math.min(entryPrice * 0.9985, pend.tpAnchorAtEntry)
            : pend.side === 'LONG'
              ? entryPrice + strategy.tpAtrMult * pend.atrAtEntry
              : entryPrice - strategy.tpAtrMult * pend.atrAtEntry;

        const slDistance = Math.max(entryPrice * 0.0022, strategy.slAtrMult * pend.atrAtEntry);
        const slPrice =
          pend.side === 'LONG' ? entryPrice - slDistance : entryPrice + slDistance;

        openPositions.set(base, {
          base,
          symbol: pend.symbol,
          displayPair: pend.displayPair,
          side: pend.side,
          entryPrice,
          notionalUsd: pend.notionalUsd,
          qty,
          leverage: strategy.leverage,
          tpPrice,
          slPrice,
          entryFeeUsd,
          isMakerEntry: strategy.postOnly,
          openedAt: ts,
          openedBarIdx: tIdx,
          zScoreAtEntry: pend.zScoreAtEntry,
          rsiAtEntry: pend.rsiAtEntry,
          adxAtEntry: pend.adxAtEntry,
        });

        pendingOrders.delete(base);
      } else if (tIdx - pend.createdBarIdx >= ttlBars) {
        pendingOrders.delete(base);
      }
    }

    // 3. Scan for new entry signals
    if (!haltedForDay && ts >= cooldownUntilTs && openPositions.size < strategy.maxConcurrentPositions) {
      for (const [base, meta] of pairSeriesMap.entries()) {
        if (openPositions.has(base) || pendingOrders.has(base)) continue;
        if (openPositions.size + pendingOrders.size >= strategy.maxConcurrentPositions) break;

        const lookup = pairTimeIndex.get(base)?.get(ts);
        if (!lookup) continue;
        const pt = lookup.pt;

        const evalRes = evaluatePointSignal(pt, strategy);
        if (evalRes.status !== 'SIGNAL_LONG' && evalRes.status !== 'SIGNAL_SHORT') continue;

        const side: 'LONG' | 'SHORT' = evalRes.status === 'SIGNAL_LONG' ? 'LONG' : 'SHORT';
        const maxSameSide = Math.max(1, strategy.maxSameSidePositions || strategy.maxConcurrentPositions);
        let sameSideCount = 0;
        for (const op of openPositions.values()) {
          if (op.side === side) sameSideCount += 1;
        }
        for (const po of pendingOrders.values()) {
          if (po.side === side) sameSideCount += 1;
        }
        if (sameSideCount >= maxSameSide) continue;
        const marginAllocation =
          strategy.sizingMode === 'percent'
            ? equity * (strategy.positionPercent / 100)
            : Math.min(equity * 0.5, strategy.positionFixedUsd / Math.max(1, strategy.leverage));
        const notionalUsd = Math.max(50, marginAllocation * strategy.leverage);

        const tickSize = pt.close * 0.0001;
        const limitOffset = strategy.postOnly ? strategy.limitOffsetTicks * tickSize : 0;
        const limitPrice =
          side === 'LONG'
            ? pt.close - limitOffset
            : pt.close + limitOffset;

        if (!strategy.postOnly) {
          // Immediate taker entry with slippage
          const entryPrice = side === 'LONG' ? pt.close * (1 + slippageRate) : pt.close * (1 - slippageRate);
          const qty = notionalUsd / entryPrice;
          const entryFeeUsd = notionalUsd * takerFeeRate;
          const tpPrice =
            strategy.tpMode === 'mean'
              ? side === 'LONG'
                ? Math.max(entryPrice * 1.0015, pt.anchor)
                : Math.min(entryPrice * 0.9985, pt.anchor)
              : side === 'LONG'
                ? entryPrice + strategy.tpAtrMult * pt.atr14
                : entryPrice - strategy.tpAtrMult * pt.atr14;
          const slDistance = Math.max(entryPrice * 0.0022, strategy.slAtrMult * pt.atr14);
          const slPrice = side === 'LONG' ? entryPrice - slDistance : entryPrice + slDistance;

          openPositions.set(base, {
            base,
            symbol: meta.symbol,
            displayPair: meta.displayPair,
            side,
            entryPrice,
            notionalUsd,
            qty,
            leverage: strategy.leverage,
            tpPrice,
            slPrice,
            entryFeeUsd,
            isMakerEntry: false,
            openedAt: ts,
            openedBarIdx: tIdx,
            zScoreAtEntry: pt.zScore,
            rsiAtEntry: pt.rsi7,
            adxAtEntry: pt.adx14,
          });
        } else {
          pendingOrders.set(base, {
            base,
            symbol: meta.symbol,
            displayPair: meta.displayPair,
            side,
            limitPrice,
            notionalUsd,
            tpAnchorAtEntry: pt.anchor,
            atrAtEntry: pt.atr14,
            createdBarIdx: tIdx,
            createdTime: ts,
            zScoreAtEntry: pt.zScore,
            rsiAtEntry: pt.rsi7,
            adxAtEntry: pt.adx14,
          });
        }
      }
    }

    // Track Drawdown & Equity Curve
    if (equity > highWaterMark) highWaterMark = equity;
    const ddPct = highWaterMark > 0 ? -((highWaterMark - equity) / highWaterMark) * 100 : 0;
    if (ddPct < maxDrawdownPct) {
      maxDrawdownPct = ddPct;
      maxDrawdownAt = ts;
    }

    if (tIdx % curveSampleStep === 0 || tIdx === timeline.length - 1) {
      const btcClose = btcCloseByTime.get(ts) ?? btcStartPrice;
      const btcBenchmarkEquity =
        btcStartPrice > 0 ? params.initialCapital * (btcClose / btcStartPrice) : params.initialCapital;
      curve.push({
        time: ts,
        equity,
        btcBenchmarkEquity,
        drawdownPct: ddPct,
      });
    }
  }

  // Aggregate summary KPIs
  const winsList = closedTrades.filter((t) => t.netPnlUsd > 0);
  const lossesList = closedTrades.filter((t) => t.netPnlUsd <= 0);
  const grossWin = winsList.reduce((acc, t) => acc + t.netPnlUsd, 0);
  const grossLossAbs = Math.abs(lossesList.reduce((acc, t) => acc + t.netPnlUsd, 0));
  const totalFeesPaidUsd = closedTrades.reduce((acc, t) => acc + t.feesUsd, 0);

  // Compare total fees paid vs hypothetical all-taker fees to measure Maker savings
  const hypotheticalAllTakerFees = closedTrades.reduce(
    (acc, t) => acc + t.notionalUsd * takerFeeRate * 2,
    0
  );
  const makerFeeSavingsUsd = Math.max(0, hypotheticalAllTakerFees - totalFeesPaidUsd);

  const avgWinUsd = winsList.length > 0 ? grossWin / winsList.length : 0;
  const avgLossUsd = lossesList.length > 0 ? -grossLossAbs / lossesList.length : 0;
  const rrRatio = avgLossUsd !== 0 ? Math.abs(avgWinUsd / avgLossUsd) : avgWinUsd > 0 ? 2.0 : 0;

  const netProfitUsd = equity - params.initialCapital;
  const roiPct = params.initialCapital > 0 ? (netProfitUsd / params.initialCapital) * 100 : 0;
  const lastCurvePoint = curve[curve.length - 1];
  const btcBenchmarkRoiPct =
    lastCurvePoint && params.initialCapital > 0
      ? ((lastCurvePoint.btcBenchmarkEquity - params.initialCapital) / params.initialCapital) * 100
      : 0;

  // Per-pair breakdown
  const pairBreakdown: BacktestPairBreakdown[] = [];
  for (const [base, meta] of pairSeriesMap.entries()) {
    const pTrades = closedTrades.filter((t) => t.base === base);
    const pWins = pTrades.filter((t) => t.netPnlUsd > 0).length;
    const pLosses = pTrades.length - pWins;
    const pNet = pTrades.reduce((acc, t) => acc + t.netPnlUsd, 0);

    // Pair drawdown relative to initial capital
    let pEq = 0;
    let pHwm = 0;
    let pMaxDd = 0;
    let makerLegs = 0;
    let totalDurationSec = 0;

    for (const t of pTrades) {
      pEq += t.netPnlUsd;
      if (pEq > pHwm) pHwm = pEq;
      const dd = -((pHwm - pEq) / params.initialCapital) * 100;
      if (dd < pMaxDd) pMaxDd = dd;
      if (t.isMakerEntry) makerLegs++;
      if (t.isMakerExit) makerLegs++;
      totalDurationSec += t.durationSec;
    }

    pairBreakdown.push({
      base,
      displayPair: meta.displayPair,
      trades: pTrades.length,
      wins: pWins,
      losses: pLosses,
      winRatePct: pTrades.length > 0 ? (pWins / pTrades.length) * 100 : 0,
      netPnlUsd: pNet,
      maxDrawdownPct: pMaxDd,
      makerPct: pTrades.length > 0 ? (makerLegs / (pTrades.length * 2)) * 100 : 0,
      avgDurationMin: pTrades.length > 0 ? totalDurationSec / pTrades.length / 60 : 0,
    });
  }

  pairBreakdown.sort((a, b) => b.netPnlUsd - a.netPnlUsd);

  return {
    ranAt: Date.now(),
    elapsedMs: Math.max(12, Math.round(performance.now() - startTimePerf)),
    totalCandlesAnalyzed,
    startTimestamp: timeline[0],
    endTimestamp: timeline[timeline.length - 1],
    initialCapital: params.initialCapital,
    finalCapital: equity,
    netProfitUsd,
    roiPct,
    btcBenchmarkRoiPct,
    totalTrades: closedTrades.length,
    wins: winsList.length,
    losses: lossesList.length,
    winRatePct: closedTrades.length > 0 ? (winsList.length / closedTrades.length) * 100 : 0,
    profitFactor: grossLossAbs > 0 ? grossWin / grossLossAbs : grossWin > 0 ? 9.99 : 0,
    maxDrawdownPct,
    maxDrawdownAt,
    avgWinUsd,
    avgLossUsd,
    rrRatio,
    totalFeesPaidUsd,
    makerFeeSavingsUsd,
    expectedValueUsd: closedTrades.length > 0 ? netProfitUsd / closedTrades.length : 0,
    curve,
    pairBreakdown,
    trades: closedTrades.slice().reverse(),
  };
}
