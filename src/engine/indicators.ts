import { Candle, IndicatorPoint, SignalStatus, StrategyConfig } from './types';

export function parseBybitKlines(rawList: string[][]): Candle[] {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];
  const parsed: Candle[] = rawList
    .map((row) => ({
      time: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      turnover: Number(row[6] || 0),
    }))
    .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close) && c.close > 0);

  parsed.sort((a, b) => a.time - b.time);
  return parsed;
}

export function calcEMASeries(values: number[], period: number): number[] {
  const n = values.length;
  if (n === 0) return [];
  const out = new Array<number>(n);
  const k = 2 / (period + 1);
  let ema = values[0];
  out[0] = ema;
  for (let i = 1; i < n; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

export function calcSessionVWAPSeries(candles: Candle[]): number[] {
  const n = candles.length;
  if (n === 0) return [];
  const out = new Array<number>(n);
  let cumPV = 0;
  let cumVol = 0;
  let currentDay = -1;

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const day = Math.floor(c.time / 86400000);
    if (day !== currentDay) {
      cumPV = 0;
      cumVol = 0;
      currentDay = day;
    }
    const typical = (c.high + c.low + c.close) / 3;
    const vol = c.volume > 0 ? c.volume : 1;
    cumPV += typical * vol;
    cumVol += vol;
    out[i] = cumVol > 0 ? cumPV / cumVol : c.close;
  }
  return out;
}

export function calcRSISeries(closes: number[], period = 7): number[] {
  const n = closes.length;
  if (n === 0) return [];
  const out = new Array<number>(n).fill(50);
  if (n <= period) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < n; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    if (avgLoss === 0) {
      out[i] = avgGain === 0 ? 50 : 100;
    } else {
      const rs = avgGain / avgLoss;
      out[i] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}

export function calcATRSeries(candles: Candle[], period = 14): number[] {
  const n = candles.length;
  if (n === 0) return [];
  const tr = new Array<number>(n);
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    tr[i] = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  }

  const atr = new Array<number>(n).fill(tr[0]);
  if (n <= period) return atr;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  let cur = sum / period;
  for (let i = 0; i < period; i++) atr[i] = cur;
  for (let i = period; i < n; i++) {
    cur = (cur * (period - 1) + tr[i]) / period;
    atr[i] = cur;
  }
  return atr;
}

export function calcADXSeries(
  candles: Candle[],
  period = 14
): { adx: number[]; plusDi: number[]; minusDi: number[] } {
  const n = candles.length;
  const adx = new Array<number>(n).fill(20);
  const plusDi = new Array<number>(n).fill(20);
  const minusDi = new Array<number>(n).fill(20);
  if (n < period * 2 + 1) return { adx, plusDi, minusDi };

  const tr = new Array<number>(n).fill(0);
  const plusDM = new Array<number>(n).fill(0);
  const minusDM = new Array<number>(n).fill(0);

  for (let i = 1; i < n; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
  }

  let smoothTR = 0;
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;
  for (let i = 1; i <= period; i++) {
    smoothTR += tr[i];
    smoothPlusDM += plusDM[i];
    smoothMinusDM += minusDM[i];
  }

  const dx = new Array<number>(n).fill(0);
  for (let i = period; i < n; i++) {
    if (i > period) {
      smoothTR = smoothTR - smoothTR / period + tr[i];
      smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
      smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];
    }
    const pdi = smoothTR > 0 ? (100 * smoothPlusDM) / smoothTR : 0;
    const mdi = smoothTR > 0 ? (100 * smoothMinusDM) / smoothTR : 0;
    plusDi[i] = pdi;
    minusDi[i] = mdi;
    const denom = pdi + mdi;
    dx[i] = denom > 0 ? (100 * Math.abs(pdi - mdi)) / denom : 0;
  }

  let adxSum = 0;
  const startAdx = period * 2 - 1;
  for (let i = period; i <= startAdx; i++) adxSum += dx[i];
  let curAdx = adxSum / period;
  adx[startAdx] = curAdx;

  for (let i = startAdx + 1; i < n; i++) {
    curAdx = (curAdx * (period - 1) + dx[i]) / period;
    adx[i] = curAdx;
  }

  for (let i = 0; i < startAdx; i++) {
    adx[i] = adx[startAdx];
  }

  return { adx, plusDi, minusDi };
}

export function buildIndicatorSeries(candles: Candle[], config: StrategyConfig): IndicatorPoint[] {
  const n = candles.length;
  if (n === 0) return [];

  const closes = candles.map((c) => c.close);
  const ema20 = calcEMASeries(closes, 20);
  const ema50 = calcEMASeries(closes, 50);
  const ema100 = calcEMASeries(closes, 100);
  const vwap = calcSessionVWAPSeries(candles);
  const rsi7 = calcRSISeries(closes, 7);
  const atr14 = calcATRSeries(candles, 14);
  const { adx, plusDi, minusDi } = calcADXSeries(candles, 14);

  const window = 20;
  const out: IndicatorPoint[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const anchor = config.meanAnchor === 'vwap' ? vwap[i] : ema20[i];

    const startIdx = Math.max(0, i - window + 1);
    const sliceLen = i - startIdx + 1;
    let sumSqDiff = 0;
    for (let j = startIdx; j <= i; j++) {
      const diff = closes[j] - (config.meanAnchor === 'vwap' ? vwap[j] : ema20[j]);
      sumSqDiff += diff * diff;
    }
    const variance = sliceLen > 1 ? sumSqDiff / sliceLen : 0;
    const minStd = c.close * 0.0005; // floor to avoid division by zero on flat bars
    const stdDev = Math.max(minStd, Math.sqrt(variance));
    const zScore = (c.close - anchor) / stdDev;

    out[i] = {
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      ema20: ema20[i],
      ema50: ema50[i],
      ema100: ema100[i],
      vwap: vwap[i],
      anchor,
      stdDev,
      zScore,
      upperBand: anchor + config.zScoreThreshold * stdDev,
      lowerBand: anchor - config.zScoreThreshold * stdDev,
      rsi7: rsi7[i],
      atr14: atr14[i],
      atrPct: c.close > 0 ? (atr14[i] / c.close) * 100 : 0,
      adx14: adx[i],
      plusDi: plusDi[i],
      minusDi: minusDi[i],
    };
  }

  return out;
}

export function evaluatePointSignal(
  point: IndicatorPoint,
  config: StrategyConfig,
  options?: { isPausedPair?: boolean; openSide?: 'LONG' | 'SHORT' | null }
): { status: SignalStatus; reason: string } {
  if (options?.isPausedPair) {
    return { status: 'PAUSED', reason: 'Para wstrzymana ręcznie' };
  }
  if (options?.openSide === 'LONG') {
    return { status: 'IN_POSITION_LONG', reason: 'Aktywna pozycja LONG' };
  }
  if (options?.openSide === 'SHORT') {
    return { status: 'IN_POSITION_SHORT', reason: 'Aktywna pozycja SHORT' };
  }

  const candleRange = point.high - point.low;
  if (point.atr14 > 0 && candleRange > config.antiCrashAtrMult * point.atr14) {
    return {
      status: 'BLOCKED_ATR',
      reason: `Anti-Crash: świeca ${(candleRange / point.atr14).toFixed(1)}x ATR (> ${config.antiCrashAtrMult}x)`,
    };
  }

  if (point.adx14 > config.adxMax) {
    return {
      status: 'BLOCKED_ADX',
      reason: `ADX ${point.adx14.toFixed(1)} > ${config.adxMax.toFixed(1)} (silny trend)`,
    };
  }

  // Entry signals + optional HTF trend & rejection wick confirmation filters
  const rawLong = point.zScore <= -config.zScoreThreshold && point.rsi7 <= config.rsiLongMax;
  const rawShort = point.zScore >= config.zScoreThreshold && point.rsi7 >= config.rsiShortMin;

  if (rawLong) {
    if (
      config.htfTrendFilter &&
      point.ema50 > 0 &&
      point.ema100 > 0 &&
      point.ema50 < point.ema100 * 0.9985 &&
      point.minusDi > point.plusDi + 6
    ) {
      return {
        status: 'BLOCKED_TREND',
        reason: `Filtr HTF: silny trend spadkowy (EMA50<EMA100, -DI ${point.minusDi.toFixed(0)} > +DI ${point.plusDi.toFixed(0)})`,
      };
    }
    if (config.wickConfirmFilter) {
      const minRatio = Math.max(0.05, Math.min(0.6, (config.minWickRatioPct || 20) / 100));
      const range = Math.max(1e-9, point.high - point.low);
      const lowerWickRatio = (Math.min(point.open, point.close) - point.low) / range;
      if (lowerWickRatio < minRatio) {
        return {
          status: 'BLOCKED_WICK',
          reason: `Brak dolnego knota odrzucenia (${(lowerWickRatio * 100).toFixed(0)}% < ${(minRatio * 100).toFixed(0)}%)`,
        };
      }
    }
    return {
      status: 'SIGNAL_LONG',
      reason: `Z ${point.zScore.toFixed(2)}σ <= -${config.zScoreThreshold.toFixed(2)}σ & RSI ${point.rsi7.toFixed(1)}`,
    };
  }
  if (rawShort) {
    if (
      config.htfTrendFilter &&
      point.ema50 > 0 &&
      point.ema100 > 0 &&
      point.ema50 > point.ema100 * 1.0015 &&
      point.plusDi > point.minusDi + 6
    ) {
      return {
        status: 'BLOCKED_TREND',
        reason: `Filtr HTF: silny trend wzrostowy (EMA50>EMA100, +DI ${point.plusDi.toFixed(0)} > -DI ${point.minusDi.toFixed(0)})`,
      };
    }
    if (config.wickConfirmFilter) {
      const minRatio = Math.max(0.05, Math.min(0.6, (config.minWickRatioPct || 20) / 100));
      const range = Math.max(1e-9, point.high - point.low);
      const upperWickRatio = (point.high - Math.max(point.open, point.close)) / range;
      if (upperWickRatio < minRatio) {
        return {
          status: 'BLOCKED_WICK',
          reason: `Brak górnego knota odrzucenia (${(upperWickRatio * 100).toFixed(0)}% < ${(minRatio * 100).toFixed(0)}%)`,
        };
      }
    }
    return {
      status: 'SIGNAL_SHORT',
      reason: `Z +${point.zScore.toFixed(2)}σ >= +${config.zScoreThreshold.toFixed(2)}σ & RSI ${point.rsi7.toFixed(1)}`,
    };
  }

  // Near signal thresholds (within 80% of Z-Score threshold)
  const nearZ = config.zScoreThreshold * 0.78;
  if (point.zScore <= -nearZ && point.rsi7 <= config.rsiLongMax + 12) {
    return {
      status: 'NEAR_LONG',
      reason: `Blisko strefy Long (Z ${point.zScore.toFixed(2)}σ, RSI ${point.rsi7.toFixed(1)})`,
    };
  }
  if (point.zScore >= nearZ && point.rsi7 >= config.rsiShortMin - 12) {
    return {
      status: 'NEAR_SHORT',
      reason: `Blisko strefy Short (Z +${point.zScore.toFixed(2)}σ, RSI ${point.rsi7.toFixed(1)})`,
    };
  }

  return {
    status: 'NEUTRAL',
    reason: `Zakres neutralny (Z ${point.zScore >= 0 ? '+' : ''}${point.zScore.toFixed(2)}σ)`,
  };
}
