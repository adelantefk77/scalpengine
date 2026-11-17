export type NavRoute =
  | 'dashboard'
  | 'skaner-rynku'
  | 'historia-i-analityka'
  | 'strategia-i-ryzyko'
  | 'backtester'
  | 'api-i-system';

export type MarketType = 'spot_margin' | 'perp_usdc' | 'perp_usdt';
export type QuoteCurrency = 'USDC' | 'USDT' | 'EURQ';
export type Timeframe = '1' | '3' | '5';
export type MeanAnchor = 'ema20' | 'vwap';
export type SizingMode = 'percent' | 'fixed';
export type TpMode = 'mean' | 'atr';
export type PresetId = 'conservative' | 'balanced' | 'aggressive';

export type BotRunState = 'RUNNING' | 'PAUSED' | 'HALTED';
export type ExecutionMode = 'paper' | 'exchange';
export type PrivateEnv = 'demo' | 'testnet' | 'mainnet';

export interface PrivateExchangeStatus {
  configured: boolean;
  env: PrivateEnv;
  baseUrl: string;
  keyMask: string | null;
}

export interface PrivateAccountSnapshot {
  equity: number;
  availableBalance: number;
  walletBalance: number;
  unrealizedPnl: number;
  updatedAt: number | null;
  error: string | null;
}

export interface StrategyConfig {
  preset: PresetId;
  marketType: MarketType;
  quoteCurrency: QuoteCurrency;
  timeframe: Timeframe;
  activePairs: string[]; // base assets e.g. ['SOL', 'ETH', 'BTC', ...]
  pausedPairs: string[];
  postOnly: boolean;
  limitOffsetTicks: number;
  orderTtlSec: number;
  meanAnchor: MeanAnchor;
  zScoreThreshold: number;
  rsiLongMax: number;
  rsiShortMin: number;
  adxMax: number;
  antiCrashAtrMult: number;
  sizingMode: SizingMode;
  positionPercent: number;
  positionFixedUsd: number;
  leverage: number;
  tpMode: TpMode;
  tpAtrMult: number;
  slAtrMult: number;
  timeStopMinutes: number;
  maxConcurrentPositions: number;
  dailyMaxLossPct: number;
  maxConsecutiveLosses: number;
  cooldownMinutes: number;
  makerFeePct: number; // e.g. 0.02 or -0.005 rebate
  takerFeePct: number; // e.g. 0.055
  slippagePct: number; // e.g. 0.02
}

export interface Candle {
  time: number; // ms epoch
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
}

export interface IndicatorPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema20: number;
  vwap: number;
  anchor: number;
  stdDev: number;
  zScore: number;
  upperBand: number;
  lowerBand: number;
  rsi7: number;
  atr14: number;
  atrPct: number;
  adx14: number;
  plusDi: number;
  minusDi: number;
}

export type SignalStatus =
  | 'SIGNAL_LONG'
  | 'SIGNAL_SHORT'
  | 'NEAR_LONG'
  | 'NEAR_SHORT'
  | 'BLOCKED_ADX'
  | 'BLOCKED_ATR'
  | 'IN_POSITION_LONG'
  | 'IN_POSITION_SHORT'
  | 'PAUSED'
  | 'NEUTRAL';

export interface PairTelemetry {
  base: string;
  symbol: string; // e.g. SOLUSDC
  displayPair: string; // e.g. SOL/USDC
  category: 'spot' | 'linear';
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
  spreadPct: number;
  change24hPct: number;
  volume24hUsd: number;
  zScore: number;
  rsi7: number;
  adx14: number;
  atr14: number;
  atrPct: number;
  ema20: number;
  vwap: number;
  upperBand: number;
  lowerBand: number;
  status: SignalStatus;
  statusReason: string;
  series: IndicatorPoint[];
  updatedAt: number;
}

export interface PendingOrder {
  id: string;
  base: string;
  symbol: string;
  displayPair: string;
  side: 'LONG' | 'SHORT';
  limitPrice: number;
  notionalUsd: number;
  qty: number;
  leverage: number;
  tpPrice: number;
  slPrice: number;
  createdAt: number;
  ttlSec: number;
  expiresAt: number;
  zScoreAtEntry: number;
  rsiAtEntry: number;
  adxAtEntry: number;
}

export interface ActivePosition {
  id: string;
  base: string;
  symbol: string;
  displayPair: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  markPrice: number;
  notionalUsd: number;
  qty: number;
  leverage: number;
  tpPrice: number;
  slPrice: number;
  entryFeeUsd: number;
  isMakerEntry: boolean;
  openedAt: number;
  timeStopMinutes: number;
  zScoreAtEntry: number;
  rsiAtEntry: number;
  adxAtEntry: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPct: number;
}

export type ExitReason = 'TP_HIT' | 'SL_HIT' | 'TIME_STOP' | 'MANUAL_MARKET' | 'KILL_SWITCH' | 'EXCHANGE_CLOSE';

export interface ClosedTrade {
  id: string;
  base: string;
  symbol: string;
  displayPair: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  notionalUsd: number;
  qty: number;
  leverage: number;
  grossPnlUsd: number;
  feesUsd: number;
  netPnlUsd: number;
  netPnlPct: number;
  isMakerEntry: boolean;
  isMakerExit: boolean;
  exitReason: ExitReason;
  openedAt: number;
  closedAt: number;
  durationSec: number;
  zScoreAtEntry: number;
  rsiAtEntry: number;
  adxAtEntry: number;
}

export type BotEventCategory = 'SIGNAL' | 'FILL' | 'EXIT' | 'WARNING' | 'SYSTEM';

export interface BotEvent {
  id: string;
  timestamp: number;
  category: BotEventCategory;
  tag: string;
  symbol?: string;
  pnlUsd?: number;
  badgeText?: string;
  message: string;
}

export interface BacktestParams {
  basket: string[]; // base assets e.g. ['SOL', 'ETH', 'BTC']
  barsPerPair: number; // e.g. 1500, 3000, 4500
  initialCapital: number;
  slippagePct: number;
  makerFeePct: number;
  takerFeePct: number;
  syncWithLive: boolean;
}

export interface BacktestPairBreakdown {
  base: string;
  displayPair: string;
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  netPnlUsd: number;
  maxDrawdownPct: number;
  makerPct: number;
  avgDurationMin: number;
}

export interface BacktestPoint {
  time: number;
  equity: number;
  btcBenchmarkEquity: number;
  drawdownPct: number;
}

export interface BacktestResult {
  ranAt: number;
  elapsedMs: number;
  totalCandlesAnalyzed: number;
  startTimestamp: number;
  endTimestamp: number;
  initialCapital: number;
  finalCapital: number;
  netProfitUsd: number;
  roiPct: number;
  btcBenchmarkRoiPct: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  maxDrawdownAt: number;
  avgWinUsd: number;
  avgLossUsd: number;
  rrRatio: number;
  totalFeesPaidUsd: number;
  makerFeeSavingsUsd: number;
  expectedValueUsd: number;
  curve: BacktestPoint[];
  pairBreakdown: BacktestPairBreakdown[];
  trades: ClosedTrade[];
}

export const ALL_SCANNER_ASSETS = [
  'SOL',
  'ETH',
  'BTC',
  'NEAR',
  'AVAX',
  'SUI',
  'DOGE',
  'XRP',
  'LINK',
  'ADA',
  'APT',
  'ARB',
  'OP',
  'DOT',
  'LTC',
  'UNI',
];

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  preset: 'balanced',
  marketType: 'perp_usdt',
  quoteCurrency: 'USDT',
  timeframe: '5',
  activePairs: [...ALL_SCANNER_ASSETS],
  pausedPairs: [],
  postOnly: true,
  limitOffsetTicks: 5,
  orderTtlSec: 60,
  meanAnchor: 'ema20',
  zScoreThreshold: 2.1,
  rsiLongMax: 22,
  rsiShortMin: 78,
  adxMax: 25.0,
  antiCrashAtrMult: 3.0,
  sizingMode: 'percent',
  positionPercent: 15,
  positionFixedUsd: 3500,
  leverage: 3,
  tpMode: 'mean',
  tpAtrMult: 1.4,
  slAtrMult: 2.5,
  timeStopMinutes: 30,
  maxConcurrentPositions: 4,
  dailyMaxLossPct: 3.0,
  maxConsecutiveLosses: 3,
  cooldownMinutes: 60,
  makerFeePct: 0.02,
  takerFeePct: 0.055,
  slippagePct: 0.02,
};

export const PRESET_CONFIGS: Record<PresetId, Partial<StrategyConfig>> = {
  conservative: {
    preset: 'conservative',
    timeframe: '5',
    activePairs: ['SOL', 'ETH', 'BTC', 'NEAR', 'AVAX', 'SUI', 'DOGE', 'XRP', 'LINK', 'APT'],
    limitOffsetTicks: 5,
    orderTtlSec: 90,
    zScoreThreshold: 2.35,
    rsiLongMax: 20,
    rsiShortMin: 80,
    adxMax: 23.0,
    antiCrashAtrMult: 2.5,
    leverage: 2,
    positionPercent: 12,
    tpMode: 'mean',
    slAtrMult: 2.5,
    timeStopMinutes: 30,
    maxConcurrentPositions: 3,
  },
  balanced: {
    preset: 'balanced',
    timeframe: '5',
    activePairs: [...ALL_SCANNER_ASSETS],
    limitOffsetTicks: 5,
    orderTtlSec: 60,
    zScoreThreshold: 2.1,
    rsiLongMax: 22,
    rsiShortMin: 78,
    adxMax: 25.0,
    antiCrashAtrMult: 3.0,
    leverage: 3,
    positionPercent: 15,
    tpMode: 'mean',
    slAtrMult: 2.5,
    timeStopMinutes: 30,
    maxConcurrentPositions: 4,
  },
  aggressive: {
    preset: 'aggressive',
    timeframe: '5',
    activePairs: [...ALL_SCANNER_ASSETS],
    limitOffsetTicks: 5,
    orderTtlSec: 60,
    zScoreThreshold: 2.1,
    rsiLongMax: 22,
    rsiShortMin: 78,
    adxMax: 25.0,
    antiCrashAtrMult: 3.2,
    leverage: 4,
    positionPercent: 15,
    tpMode: 'atr',
    tpAtrMult: 1.4,
    slAtrMult: 2.5,
    timeStopMinutes: 30,
    maxConcurrentPositions: 5,
  },
};

export function resolveBybitCategory(marketType: MarketType): 'spot' | 'linear' {
  return marketType === 'spot_margin' ? 'spot' : 'linear';
}

export function resolveBybitQuote(marketType: MarketType, quote: QuoteCurrency): string {
  if (marketType === 'perp_usdt') return 'USDT';
  if (marketType === 'perp_usdc') {
    // Bybit linear USDC perpetuals use -PERP or USDC suffix depending on pair, while USDT pairs are standard on linear.
    // For spot_margin we support USDC or USDT directly; for perp_usdc Bybit uses BTC-PERP / ETH-PERP or SOLPERP;
    // Wait: on Bybit v5 linear, USDC perpetual symbols like BTCPERP, ETHPERP, SOLPERP exist, whereas USDT perpetuals are BTCUSDT, SOLUSDT.
    return 'USDT';
  }
  if (quote === 'EURQ') return 'USDC'; // Fallback if EURQ not listed for all pairs on Bybit public spot
  return quote;
}

export function formatBybitSymbol(base: string, marketType: MarketType, quote: QuoteCurrency): {
  symbol: string;
  displayPair: string;
  category: 'spot' | 'linear';
} {
  const category = resolveBybitCategory(marketType);
  if (marketType === 'perp_usdt') {
    return {
      symbol: `${base}USDT`,
      displayPair: `${base}/USDT`,
      category: 'linear',
    };
  }
  if (marketType === 'perp_usdc') {
    // Major Bybit USDC perpetuals use <BASE>PERP
    const perpSupported = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'AVAX', 'LINK', 'SUI', 'APT', 'ADA', 'LTC'];
    if (perpSupported.includes(base)) {
      return {
        symbol: `${base}PERP`,
        displayPair: `${base}/USDC Perp`,
        category: 'linear',
      };
    }
    return {
      symbol: `${base}USDT`,
      displayPair: `${base}/USDT Perp`,
      category: 'linear',
    };
  }
  // spot_margin
  const effectiveQuote = quote === 'USDT' ? 'USDT' : 'USDC';
  return {
    symbol: `${base}${effectiveQuote}`,
    displayPair: `${base}/${effectiveQuote}`,
    category: 'spot',
  };
}
