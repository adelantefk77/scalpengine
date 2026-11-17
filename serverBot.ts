import fs from 'fs';
import path from 'path';
import {
  cancelBybitOrder,
  fetchBybitJson,
  fetchBybitPrivateAccount,
  fetchBybitPrivateState,
  getBybitEnvConfig,
  placeBybitOrder,
  triggerBybitKillSwitch,
} from './serverBybit';
import { buildIndicatorSeries, evaluatePointSignal, parseBybitKlines } from './src/engine/indicators';
import {
  ALL_SCANNER_ASSETS,
  ActivePosition,
  BotEvent,
  BotRunState,
  Candle,
  ClosedTrade,
  DEFAULT_STRATEGY_CONFIG,
  ExecutionMode,
  IndicatorPoint,
  PendingOrder,
  PrivateAccountSnapshot,
  PrivateExchangeStatus,
  StrategyConfig,
  formatBybitSymbol,
  resolveBybitCategory,
} from './src/engine/types';

interface TickerQuote {
  symbol: string;
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
  price24hPcnt: number;
  turnover24h: number;
}

interface SignalSnapshot {
  base: string;
  symbol: string;
  displayPair: string;
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
  zScore: number;
  rsi7: number;
  adx14: number;
  atr14: number;
  ema20: number;
  vwap: number;
  lastBarTime: number;
}

interface PersistedBotState {
  config: StrategyConfig;
  executionMode: ExecutionMode;
  botState: BotRunState;
  paperEquity: number;
  closedTrades: ClosedTrade[];
  events: BotEvent[];
}

const DEFAULT_START_EQUITY = 25000;
const STATE_FILE_PATH = path.resolve(process.cwd(), '.scalpengine-state.json');

class ServerBotDaemon {
  private config: StrategyConfig = { ...DEFAULT_STRATEGY_CONFIG };
  private executionMode: ExecutionMode = 'paper';
  private botState: BotRunState = 'RUNNING';
  private paperEquity: number = DEFAULT_START_EQUITY;

  private activePositions: ActivePosition[] = [];
  private pendingOrders: PendingOrder[] = [];
  private closedTrades: ClosedTrade[] = [];
  private events: BotEvent[] = [];

  private privateAccount: PrivateAccountSnapshot = {
    equity: 0,
    availableBalance: 0,
    walletBalance: 0,
    unrealizedPnl: 0,
    updatedAt: null,
    error: null,
  };

  private candlesByBase: Record<string, Candle[]> = {};
  private tickersBySymbol: Record<string, TickerQuote> = {};
  private latestSignalsByBase: Record<string, SignalSnapshot> = {};

  private consecutiveLosses = 0;
  private cooldownUntil = 0;
  private lastSignalBarByBase: Record<string, number> = {};
  private lastAdxWarnByBase: Record<string, number> = {};
  private inFlightOrders = new Set<string>();
  private inFlightClosures = new Set<string>();
  private orderMetaBySymbol: Record<
    string,
    {
      zScoreAtEntry: number;
      rsiAtEntry: number;
      adxAtEntry: number;
      tpPrice: number;
      slPrice: number;
      expiresAt: number;
    }
  > = {};

  private startedAt = Date.now();
  private lastMarketSyncAt: number | null = null;
  private lastExchangeSyncAt = 0;
  private isRefreshingKlines = false;
  private isEvaluatingTick = false;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.loadPersistedState();
    const envCfg = getBybitEnvConfig();
    if (!envCfg.configured) {
      this.executionMode = 'paper';
    }
    this.pushEvent({
      category: 'SYSTEM',
      tag: '24/7 DAEMON',
      badgeText: `BYBIT ${envCfg.env.toUpperCase()}`,
      message: envCfg.configured
        ? `Uruchomiono autonomiczny silnik 24/7 na serwerze (Tryb: ${this.executionMode === 'exchange' ? `BYBIT ${envCfg.env.toUpperCase()}` : 'PAPER'}, Klucz: ${envCfg.keyMask}).`
        : 'Uruchomiono autonomiczny silnik 24/7 na serwerze w trybie PAPER (brak kluczy BYBIT_API_KEY w zmiennych środowiskowych).',
    });
  }

  private loadPersistedState() {
    const envCfg = getBybitEnvConfig();
    try {
      if (fs.existsSync(STATE_FILE_PATH)) {
        const raw = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<PersistedBotState>;
        if (parsed.config) {
          this.config = { ...DEFAULT_STRATEGY_CONFIG, ...parsed.config };
        }
        if (parsed.botState === 'RUNNING' || parsed.botState === 'PAUSED' || parsed.botState === 'HALTED') {
          this.botState = parsed.botState;
        }
        if (typeof parsed.paperEquity === 'number' && Number.isFinite(parsed.paperEquity) && parsed.paperEquity > 0) {
          this.paperEquity = parsed.paperEquity;
        }
        if (Array.isArray(parsed.closedTrades)) {
          this.closedTrades = parsed.closedTrades.slice(0, 500);
        }
        if (Array.isArray(parsed.events)) {
          this.events = parsed.events.slice(0, 100);
        }
        if (parsed.executionMode === 'exchange' && envCfg.configured) {
          this.executionMode = 'exchange';
        } else if (parsed.executionMode === 'paper') {
          this.executionMode = 'paper';
        } else if (envCfg.configured) {
          this.executionMode = 'exchange';
        }
        return;
      }
    } catch {
      // ignore invalid state file
    }

    // Fresh container (e.g. Railway deploy with env vars set): auto-enable exchange mode if configured!
    if (envCfg.configured) {
      this.executionMode = 'exchange';
    }
  }

  private schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      try {
        const payload: PersistedBotState = {
          config: this.config,
          executionMode: this.executionMode,
          botState: this.botState,
          paperEquity: this.paperEquity,
          closedTrades: this.closedTrades.slice(0, 500),
          events: this.events.slice(0, 100),
        };
        fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(payload), 'utf-8');
      } catch {
        // ignore read-only container filesystem
      }
    }, 1000);
  }

  private pushEvent(ev: Omit<BotEvent, 'id' | 'timestamp'>) {
    this.events = [
      {
        ...ev,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
      },
      ...this.events.slice(0, 99),
    ];
    this.schedulePersist();
  }

  public start() {
    void this.refreshKlines();
    if (getBybitEnvConfig().configured) {
      void this.syncExchangeState();
    }

    setInterval(() => {
      void this.refreshKlines();
    }, 15000);

    setInterval(() => {
      void this.tickLoop();
    }, 2000);
  }

  private async refreshKlines() {
    if (this.isRefreshingKlines) return;
    this.isRefreshingKlines = true;
    try {
      const cfg = this.config;
      const basesToLoad = Array.from(new Set([...ALL_SCANNER_ASSETS, ...cfg.activePairs]));
      const batchSize = 6;

      for (let i = 0; i < basesToLoad.length; i += batchSize) {
        const chunk = basesToLoad.slice(i, i + batchSize);
        await Promise.all(
          chunk.map(async (base) => {
            const { symbol, category } = formatBybitSymbol(base, cfg.marketType, cfg.quoteCurrency);
            try {
              const endpoint = `/v5/market/kline?category=${encodeURIComponent(category)}&symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(cfg.timeframe)}&limit=120`;
              const { data } = await fetchBybitJson<{ result?: { list?: string[][] } }>(endpoint, 3000);
              if (Array.isArray(data?.result?.list)) {
                const parsed = parseBybitKlines(data.result.list);
                if (parsed.length > 0) {
                  this.candlesByBase[base] = parsed;
                }
              }
            } catch {
              // ignore single-pair transient errors
            }
          })
        );
      }
      this.lastMarketSyncAt = Date.now();
    } finally {
      this.isRefreshingKlines = false;
    }
  }

  private resolveSymbolDisplay(symbol: string): {
    base: string;
    displayPair: string;
    snapshot?: SignalSnapshot;
  } {
    const bySymbol = Object.values(this.latestSignalsByBase).find((s) => s.symbol === symbol);
    if (bySymbol) {
      return { base: bySymbol.base, displayPair: bySymbol.displayPair, snapshot: bySymbol };
    }
    for (const base of ALL_SCANNER_ASSETS) {
      const formatted = formatBybitSymbol(base, this.config.marketType, this.config.quoteCurrency);
      if (formatted.symbol === symbol || symbol.startsWith(base)) {
        return {
          base,
          displayPair: symbol.endsWith('PERP')
            ? `${base}/USDC Perp`
            : symbol.endsWith('USDT')
              ? `${base}/USDT`
              : symbol.endsWith('USDC')
                ? `${base}/USDC`
                : symbol,
          snapshot: this.latestSignalsByBase[base],
        };
      }
    }
    return { base: symbol.replace(/(USDT|USDC|PERP)$/, ''), displayPair: symbol };
  }

  private recordClosedTrade(
    pos: ActivePosition,
    exitPrice: number,
    exitReason: ClosedTrade['exitReason'],
    isMakerExit: boolean
  ) {
    const cfg = this.config;
    const feeRate = (isMakerExit ? cfg.makerFeePct : cfg.takerFeePct) / 100;
    const exitFeeUsd = pos.qty * exitPrice * feeRate;
    const grossPnlUsd =
      pos.side === 'LONG'
        ? (exitPrice - pos.entryPrice) * pos.qty
        : (pos.entryPrice - exitPrice) * pos.qty;
    const totalFees = pos.entryFeeUsd + exitFeeUsd;
    const netPnlUsd = grossPnlUsd - totalFees;
    const netPnlPct = pos.notionalUsd > 0 ? (netPnlUsd / pos.notionalUsd) * 100 : 0;
    const now = Date.now();

    const closed: ClosedTrade = {
      id: pos.id,
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
      closedAt: now,
      durationSec: Math.max(1, Math.round((now - pos.openedAt) / 1000)),
      zScoreAtEntry: pos.zScoreAtEntry,
      rsiAtEntry: pos.rsiAtEntry,
      adxAtEntry: pos.adxAtEntry,
    };

    this.closedTrades = [closed, ...this.closedTrades.slice(0, 499)];
    if (this.executionMode === 'paper') {
      this.paperEquity += netPnlUsd;
    }

    if (netPnlUsd < 0) {
      this.consecutiveLosses += 1;
      if (this.consecutiveLosses >= cfg.maxConsecutiveLosses) {
        this.cooldownUntil = now + cfg.cooldownMinutes * 60000;
        this.consecutiveLosses = 0;
        this.pushEvent({
          category: 'WARNING',
          tag: 'COOLDOWN',
          symbol: pos.displayPair,
          message: `Osiągnięto limit ${cfg.maxConsecutiveLosses} strat z rzędu — pauza nowych wejść na ${cfg.cooldownMinutes} min.`,
        });
      }
    } else {
      this.consecutiveLosses = 0;
    }

    this.pushEvent({
      category: 'EXIT',
      tag:
        exitReason === 'TP_HIT'
          ? 'TP HIT'
          : exitReason === 'SL_HIT'
            ? 'SL HIT'
            : exitReason === 'TIME_STOP'
              ? 'TIME-STOP'
              : 'ZAMKNIĘCIE',
      symbol: pos.displayPair,
      pnlUsd: netPnlUsd,
      message: `${pos.displayPair} (${pos.side}) zamknięto po $${exitPrice.toFixed(exitPrice > 100 ? 2 : 4)} (${netPnlPct >= 0 ? '+' : ''}${netPnlPct.toFixed(2)}% netto).`,
    });
    this.schedulePersist();
  }

  public async syncExchangeState(): Promise<boolean> {
    const envCfg = getBybitEnvConfig();
    if (!envCfg.configured) {
      this.privateAccount = {
        equity: 0,
        availableBalance: 0,
        walletBalance: 0,
        unrealizedPnl: 0,
        updatedAt: null,
        error: 'Brak kluczy BYBIT_API_KEY / BYBIT_API_SECRET w zmiennych środowiskowych.',
      };
      return false;
    }

    const cfg = this.config;
    const category = resolveBybitCategory(cfg.marketType);
    try {
      const [acct, state] = await Promise.all([
        fetchBybitPrivateAccount(),
        fetchBybitPrivateState(category),
      ]);

      this.privateAccount = {
        equity: acct.equity,
        availableBalance: acct.availableBalance,
        walletBalance: acct.walletBalance,
        unrealizedPnl: acct.unrealizedPnl,
        updatedAt: Date.now(),
        error: null,
      };
      this.lastExchangeSyncAt = Date.now();

      if (this.executionMode !== 'exchange') {
        return true;
      }

      const nextOrders: PendingOrder[] = state.orders.map((o) => {
        const { base, displayPair, snapshot } = this.resolveSymbolDisplay(o.symbol);
        const meta = this.orderMetaBySymbol[o.symbol];
        const limitPrice = Number(o.price || snapshot?.lastPrice || 0);
        const qty = Number(o.qty || 0);
        const createdAt = Number(o.createdTime || Date.now());
        return {
          id: o.orderId,
          base,
          symbol: o.symbol,
          displayPair,
          side: o.side === 'Buy' ? 'LONG' : 'SHORT',
          limitPrice,
          notionalUsd: limitPrice * qty,
          qty,
          leverage: cfg.leverage,
          tpPrice: Number(o.takeProfit || meta?.tpPrice || limitPrice),
          slPrice: Number(o.stopLoss || meta?.slPrice || limitPrice),
          createdAt,
          ttlSec: cfg.orderTtlSec,
          expiresAt: meta?.expiresAt ?? createdAt + cfg.orderTtlSec * 1000,
          zScoreAtEntry: meta?.zScoreAtEntry ?? snapshot?.zScore ?? 0,
          rsiAtEntry: meta?.rsiAtEntry ?? snapshot?.rsi7 ?? 50,
          adxAtEntry: meta?.adxAtEntry ?? snapshot?.adx14 ?? 20,
        };
      });

      const nextPositions: ActivePosition[] = state.positions.map((p) => {
        const symbol = String(p.symbol || '');
        const { base, displayPair, snapshot } = this.resolveSymbolDisplay(symbol);
        const meta = this.orderMetaBySymbol[symbol];
        const entryPrice = Number(p.avgPrice || p.entryPrice || 0);
        const markPrice = Number(p.markPrice || snapshot?.lastPrice || entryPrice);
        const qty = Number(p.size || 0);
        const notionalUsd = Number(p.positionValue || qty * markPrice);
        const leverage = Number(p.leverage || cfg.leverage || 1);
        const uPnlUsd = Number(p.unrealisedPnl || 0);
        const side: 'LONG' | 'SHORT' = p.side === 'Buy' ? 'LONG' : 'SHORT';
        const tpPrice = Number(
          p.takeProfit || meta?.tpPrice || (side === 'LONG' ? entryPrice * 1.003 : entryPrice * 0.997)
        );
        const slPrice = Number(
          p.stopLoss || meta?.slPrice || (side === 'LONG' ? entryPrice * 0.995 : entryPrice * 1.005)
        );
        const openedAt = Number(p.updatedTime || p.createdTime || Date.now());

        return {
          id: `${symbol}-${p.side}`,
          base,
          symbol,
          displayPair,
          side,
          entryPrice,
          markPrice,
          notionalUsd,
          qty,
          leverage,
          tpPrice,
          slPrice,
          entryFeeUsd: notionalUsd * ((cfg.postOnly ? cfg.makerFeePct : cfg.takerFeePct) / 100),
          isMakerEntry: cfg.postOnly,
          openedAt,
          timeStopMinutes: cfg.timeStopMinutes,
          zScoreAtEntry: meta?.zScoreAtEntry ?? snapshot?.zScore ?? 0,
          rsiAtEntry: meta?.rsiAtEntry ?? snapshot?.rsi7 ?? 50,
          adxAtEntry: meta?.adxAtEntry ?? snapshot?.adx14 ?? 20,
          unrealizedPnlUsd: uPnlUsd,
          unrealizedPnlPct: notionalUsd > 0 ? (uPnlUsd / notionalUsd) * 100 : 0,
        };
      });

      // Detect positions closed directly on Bybit (e.g. TP/SL hit)
      for (const prevPos of this.activePositions) {
        const stillOpen = nextPositions.some(
          (np) => np.symbol === prevPos.symbol && np.side === prevPos.side
        );
        if (!stillOpen && !this.inFlightClosures.has(prevPos.id)) {
          const { snapshot } = this.resolveSymbolDisplay(prevPos.symbol);
          const exitPrice = snapshot?.lastPrice ?? prevPos.markPrice;
          const tpDist = Math.abs(exitPrice - prevPos.tpPrice);
          const slDist = Math.abs(exitPrice - prevPos.slPrice);
          const inferredReason: ClosedTrade['exitReason'] = tpDist <= slDist ? 'TP_HIT' : 'SL_HIT';
          this.recordClosedTrade(prevPos, exitPrice, inferredReason, false);
        }
      }

      this.pendingOrders = nextOrders;
      this.activePositions = nextPositions;
      return true;
    } catch (err) {
      this.privateAccount = {
        ...this.privateAccount,
        error: err instanceof Error ? err.message : 'Błąd połączenia z Bybit Private API',
      };
      return false;
    }
  }

  private async submitExchangeOrder(params: {
    snapshot: SignalSnapshot;
    side: 'LONG' | 'SHORT';
    limitPrice: number;
    notionalUsd: number;
    tpPrice: number;
    slPrice: number;
    isManual: boolean;
  }): Promise<{ ok: boolean; error?: string; orderId?: string }> {
    const { snapshot: s, side, limitPrice, notionalUsd, tpPrice, slPrice, isManual } = params;
    if (this.inFlightOrders.has(s.symbol)) {
      return { ok: false, error: 'Zlecenie jest już wysyłane dla tej pary.' };
    }
    this.inFlightOrders.add(s.symbol);

    const cfg = this.config;
    const category = resolveBybitCategory(cfg.marketType);
    const now = Date.now();
    this.orderMetaBySymbol[s.symbol] = {
      zScoreAtEntry: s.zScore,
      rsiAtEntry: s.rsi7,
      adxAtEntry: s.adx14,
      tpPrice,
      slPrice,
      expiresAt: now + cfg.orderTtlSec * 1000,
    };

    try {
      const res = await placeBybitOrder({
        category,
        symbol: s.symbol,
        side: side === 'LONG' ? 'Buy' : 'Sell',
        orderType: isManual || cfg.postOnly ? 'Limit' : 'Market',
        qtyUsd: notionalUsd,
        price: limitPrice,
        postOnly: isManual ? true : cfg.postOnly,
        leverage: cfg.leverage,
        isSpotMargin: cfg.marketType === 'spot_margin',
        tpPrice: category === 'linear' ? tpPrice : undefined,
        slPrice: category === 'linear' ? slPrice : undefined,
      });

      const envUpper = getBybitEnvConfig().env.toUpperCase();
      this.pushEvent({
        category: 'SIGNAL',
        tag: isManual ? 'BYBIT RĘCZNE' : 'BYBIT SYGNAŁ',
        symbol: s.displayPair,
        badgeText: side,
        message: `${s.displayPair} Wysłano zlecenie ${side} na Bybit ${envUpper} (${res.qty} @ $${res.price}, ID: ${String(res.orderId || '').slice(-6)}).`,
      });
      await this.syncExchangeState();
      return { ok: true, orderId: res.orderId };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Błąd wysyłki zlecenia';
      this.pushEvent({
        category: 'WARNING',
        tag: 'BŁĄD BYBIT',
        symbol: s.displayPair,
        message: `${s.displayPair} ${side} odrzucone: ${errMsg}`,
      });
      return { ok: false, error: errMsg };
    } finally {
      this.inFlightOrders.delete(s.symbol);
    }
  }

  private async tickLoop() {
    if (this.isEvaluatingTick) return;
    this.isEvaluatingTick = true;

    try {
      const cfg = this.config;
      const category = resolveBybitCategory(cfg.marketType);

      // 1. Refresh public tickers
      try {
        const { data } = await fetchBybitJson<{
          result?: {
            list?: Array<{
              symbol: string;
              lastPrice: string;
              bid1Price?: string;
              ask1Price?: string;
              price24hPcnt?: string;
              turnover24h?: string;
            }>;
          };
        }>(`/v5/market/tickers?category=${encodeURIComponent(category)}`, 1500);

        for (const t of data?.result?.list ?? []) {
          const last = Number(t.lastPrice);
          if (!Number.isFinite(last) || last <= 0) continue;
          const bid = Number(t.bid1Price || last);
          const ask = Number(t.ask1Price || last);
          this.tickersBySymbol[t.symbol] = {
            symbol: t.symbol,
            lastPrice: last,
            bidPrice: bid > 0 ? bid : last,
            askPrice: ask > 0 ? ask : last,
            price24hPcnt: Number(t.price24hPcnt || 0) * 100,
            turnover24h: Number(t.turnover24h || 0),
          };
        }
      } catch {
        // continue using last known tickers if transient error
      }

      // 2. Sync exchange balance / positions / orders every 3s if in exchange mode
      const now = Date.now();
      if (this.executionMode === 'exchange' && now - this.lastExchangeSyncAt >= 3000) {
        await this.syncExchangeState();
      }

      // 3. Recompute latest indicators & signals per pair
      const signalResults: Array<{
        snapshot: SignalSnapshot;
        status: ReturnType<typeof evaluatePointSignal>['status'];
      }> = [];

      for (const base of ALL_SCANNER_ASSETS) {
        const candles = this.candlesByBase[base];
        if (!candles || candles.length === 0) continue;

        const { symbol, displayPair } = formatBybitSymbol(base, cfg.marketType, cfg.quoteCurrency);
        const ticker = this.tickersBySymbol[symbol];

        const liveCandles = candles.slice();
        const lastCandle = { ...liveCandles[liveCandles.length - 1] };
        const livePrice = ticker?.lastPrice ?? lastCandle.close;
        lastCandle.close = livePrice;
        if (livePrice > lastCandle.high) lastCandle.high = livePrice;
        if (livePrice < lastCandle.low) lastCandle.low = livePrice;
        liveCandles[liveCandles.length - 1] = lastCandle;

        const series: IndicatorPoint[] = buildIndicatorSeries(liveCandles, cfg);
        const latest = series[series.length - 1];
        if (!latest) continue;

        const bidPrice = ticker?.bidPrice ?? livePrice;
        const askPrice = ticker?.askPrice ?? livePrice;
        const openPos = this.activePositions.find((p) => p.base === base);
        const evalRes = evaluatePointSignal(latest, cfg, {
          isPausedPair: cfg.pausedPairs.includes(base),
          openSide: openPos?.side ?? null,
        });

        const snapshot: SignalSnapshot = {
          base,
          symbol,
          displayPair,
          lastPrice: livePrice,
          bidPrice,
          askPrice,
          zScore: latest.zScore,
          rsi7: latest.rsi7,
          adx14: latest.adx14,
          atr14: latest.atr14,
          ema20: latest.ema20,
          vwap: latest.vwap,
          lastBarTime: latest.time,
        };
        this.latestSignalsByBase[base] = snapshot;
        signalResults.push({ snapshot, status: evalRes.status });
      }

      if (signalResults.length === 0) return;

      // 4. Update active positions uPnL & check exits
      const nextPositions: ActivePosition[] = [];
      for (const pos of this.activePositions) {
        const snap = this.latestSignalsByBase[pos.base];
        const markPrice = snap?.lastPrice ?? pos.markPrice;

        let dynamicTp = pos.tpPrice;
        if (this.executionMode === 'paper' && cfg.tpMode === 'mean' && snap) {
          const anchor = cfg.meanAnchor === 'vwap' ? snap.vwap : snap.ema20;
          dynamicTp =
            pos.side === 'LONG'
              ? Math.max(pos.entryPrice * 1.0012, anchor)
              : Math.min(pos.entryPrice * 0.9988, anchor);
        }

        const grossU =
          pos.side === 'LONG'
            ? (markPrice - pos.entryPrice) * pos.qty
            : (pos.entryPrice - markPrice) * pos.qty;
        const uPnlUsd = grossU - pos.entryFeeUsd;
        const uPnlPct = pos.notionalUsd > 0 ? (uPnlUsd / pos.notionalUsd) * 100 : 0;

        if (this.botState === 'RUNNING') {
          const elapsedMin = (now - pos.openedAt) / 60000;
          if (this.executionMode === 'paper') {
            if (pos.side === 'LONG' && markPrice >= dynamicTp) {
              this.recordClosedTrade(pos, dynamicTp, 'TP_HIT', cfg.postOnly);
              continue;
            }
            if (pos.side === 'SHORT' && markPrice <= dynamicTp) {
              this.recordClosedTrade(pos, dynamicTp, 'TP_HIT', cfg.postOnly);
              continue;
            }
            if (pos.side === 'LONG' && markPrice <= pos.slPrice) {
              this.recordClosedTrade(pos, markPrice, 'SL_HIT', false);
              continue;
            }
            if (pos.side === 'SHORT' && markPrice >= pos.slPrice) {
              this.recordClosedTrade(pos, markPrice, 'SL_HIT', false);
              continue;
            }
            if (elapsedMin >= pos.timeStopMinutes) {
              this.recordClosedTrade(pos, markPrice, 'TIME_STOP', false);
              continue;
            }
          } else {
            if (elapsedMin >= pos.timeStopMinutes && !this.inFlightClosures.has(pos.id)) {
              void this.closePositionMarket(pos.id, 'TIME_STOP');
            }
          }
        }

        nextPositions.push({
          ...pos,
          markPrice,
          tpPrice: dynamicTp,
          unrealizedPnlUsd: uPnlUsd,
          unrealizedPnlPct: uPnlPct,
        });
      }
      this.activePositions = nextPositions;

      if (this.botState !== 'RUNNING') return;

      // 5. Check Daily Max Loss Guard
      const eq = this.getEffectiveEquity();
      const ddPct = this.getDrawdownPct();
      if (eq > 0 && Math.abs(ddPct) >= cfg.dailyMaxLossPct && ddPct < 0) {
        this.botState = 'PAUSED';
        this.pushEvent({
          category: 'WARNING',
          tag: 'DAILY LOSS GUARD',
          message: `Przekroczono dzienny limit strat (${ddPct.toFixed(2)}% >= -${cfg.dailyMaxLossPct}%). Wstrzymano nowe wejścia (PAUSED).`,
        });
        this.schedulePersist();
        return;
      }

      // 6. Process pending Maker orders
      if (this.executionMode === 'paper' && this.pendingOrders.length > 0) {
        const remainingPending: PendingOrder[] = [];
        for (const ord of this.pendingOrders) {
          const snap = this.latestSignalsByBase[ord.base];
          if (!snap) {
            remainingPending.push(ord);
            continue;
          }
          const touched =
            ord.side === 'LONG'
              ? snap.bidPrice <= ord.limitPrice || snap.lastPrice <= ord.limitPrice
              : snap.askPrice >= ord.limitPrice || snap.lastPrice >= ord.limitPrice;

          if (touched) {
            const entryFeeUsd =
              ord.notionalUsd * ((cfg.postOnly ? cfg.makerFeePct : cfg.takerFeePct) / 100);
            this.activePositions.unshift({
              id: ord.id,
              base: ord.base,
              symbol: ord.symbol,
              displayPair: ord.displayPair,
              side: ord.side,
              entryPrice: ord.limitPrice,
              markPrice: snap.lastPrice,
              notionalUsd: ord.notionalUsd,
              qty: ord.qty,
              leverage: ord.leverage,
              tpPrice: ord.tpPrice,
              slPrice: ord.slPrice,
              entryFeeUsd,
              isMakerEntry: cfg.postOnly,
              openedAt: now,
              timeStopMinutes: cfg.timeStopMinutes,
              zScoreAtEntry: ord.zScoreAtEntry,
              rsiAtEntry: ord.rsiAtEntry,
              adxAtEntry: ord.adxAtEntry,
              unrealizedPnlUsd: -entryFeeUsd,
              unrealizedPnlPct: (-entryFeeUsd / ord.notionalUsd) * 100,
            });
            this.pushEvent({
              category: 'FILL',
              tag: 'FILL',
              symbol: ord.displayPair,
              badgeText: cfg.postOnly ? 'Post-Only' : 'Market',
              message: `${ord.displayPair} ${ord.side} zrealizowany po $${ord.limitPrice.toFixed(ord.limitPrice > 100 ? 2 : 4)}. Prowizja: $${entryFeeUsd.toFixed(2)}.`,
            });
          } else if (now >= ord.expiresAt) {
            this.pushEvent({
              category: 'SYSTEM',
              tag: 'TTL EXPIRED',
              symbol: ord.displayPair,
              message: `${ord.displayPair} zlecenie Post-Only wygasło po ${ord.ttlSec}s bez wypełnienia.`,
            });
          } else {
            remainingPending.push(ord);
          }
        }
        this.pendingOrders = remainingPending;
      } else if (this.executionMode === 'exchange' && this.pendingOrders.length > 0) {
        for (const ord of this.pendingOrders) {
          if (now >= ord.expiresAt) {
            void this.cancelPendingOrder(ord.id);
          }
        }
      }

      // 7. Scan active pairs for new signals
      if (now < this.cooldownUntil) return;
      const totalSlots = this.activePositions.length + this.pendingOrders.length;
      if (totalSlots >= cfg.maxConcurrentPositions) return;

      for (const base of cfg.activePairs) {
        if (cfg.pausedPairs.includes(base)) continue;
        if (this.activePositions.some((p) => p.base === base)) continue;
        if (this.pendingOrders.some((o) => o.base === base)) continue;

        const match = signalResults.find((r) => r.snapshot.base === base);
        if (!match) continue;
        const { snapshot: s, status } = match;
        if (this.inFlightOrders.has(s.symbol)) continue;

        if (status === 'BLOCKED_ADX') {
          if (this.lastAdxWarnByBase[base] !== s.lastBarTime) {
            this.lastAdxWarnByBase[base] = s.lastBarTime;
            this.pushEvent({
              category: 'WARNING',
              tag: 'BLOKADA ADX',
              symbol: s.displayPair,
              badgeText: `ADX ${s.adx14.toFixed(1)}`,
              message: `${s.displayPair} Odrzucono wejście: ADX ${s.adx14.toFixed(1)} > limit ${cfg.adxMax.toFixed(1)} (silny trend).`,
            });
          }
          continue;
        }

        if (status !== 'SIGNAL_LONG' && status !== 'SIGNAL_SHORT') continue;
        if (this.lastSignalBarByBase[base] === s.lastBarTime) continue;

        this.lastSignalBarByBase[base] = s.lastBarTime;
        const side: 'LONG' | 'SHORT' = status === 'SIGNAL_LONG' ? 'LONG' : 'SHORT';

        const activeEq = Math.max(100, eq);
        const marginAlloc =
          cfg.sizingMode === 'percent'
            ? activeEq * (cfg.positionPercent / 100)
            : Math.min(activeEq * 0.5, cfg.positionFixedUsd / Math.max(1, cfg.leverage));
        const notionalUsd = Math.max(25, marginAlloc * cfg.leverage);
        const tick = s.lastPrice * 0.0001;
        const offset = cfg.postOnly ? cfg.limitOffsetTicks * tick : 0;
        const limitPrice = side === 'LONG' ? s.bidPrice - offset : s.askPrice + offset;
        const qty = notionalUsd / limitPrice;
        const anchor = cfg.meanAnchor === 'vwap' ? s.vwap : s.ema20;
        const tpPrice =
          cfg.tpMode === 'mean'
            ? side === 'LONG'
              ? Math.max(limitPrice * 1.0015, anchor)
              : Math.min(limitPrice * 0.9985, anchor)
            : side === 'LONG'
              ? limitPrice + cfg.tpAtrMult * s.atr14
              : limitPrice - cfg.tpAtrMult * s.atr14;
        const slDist = Math.max(limitPrice * 0.0022, cfg.slAtrMult * s.atr14);
        const slPrice = side === 'LONG' ? limitPrice - slDist : limitPrice + slDist;

        if (this.executionMode === 'exchange') {
          void this.submitExchangeOrder({
            snapshot: s,
            side,
            limitPrice,
            notionalUsd,
            tpPrice,
            slPrice,
            isManual: false,
          });
          break;
        }

        const newOrder: PendingOrder = {
          id: `ORD-${Date.now().toString().slice(-5)}-${base}`,
          base,
          symbol: s.symbol,
          displayPair: s.displayPair,
          side,
          limitPrice,
          notionalUsd,
          qty,
          leverage: cfg.leverage,
          tpPrice,
          slPrice,
          createdAt: now,
          ttlSec: cfg.orderTtlSec,
          expiresAt: now + cfg.orderTtlSec * 1000,
          zScoreAtEntry: s.zScore,
          rsiAtEntry: s.rsi7,
          adxAtEntry: s.adx14,
        };
        this.pendingOrders.unshift(newOrder);
        this.pushEvent({
          category: 'SIGNAL',
          tag: 'SYGNAŁ',
          symbol: s.displayPair,
          badgeText: side,
          message: `${s.displayPair} Mean Reversion: Z ${s.zScore.toFixed(2)}σ, RSI ${s.rsi7.toFixed(1)}, ADX ${s.adx14.toFixed(1)} → Limit ${side}.`,
        });
        break;
      }
    } finally {
      this.isEvaluatingTick = false;
    }
  }

  public async forceMakerOrder(
    base: string,
    side: 'LONG' | 'SHORT'
  ): Promise<{ ok: boolean; error?: string }> {
    const snap = this.latestSignalsByBase[base];
    if (!snap) {
      return { ok: false, error: 'Brak danych rynkowych dla wybranej pary (poczekaj kilka sekund na sync).' };
    }
    if (this.activePositions.some((p) => p.base === base)) {
      return { ok: false, error: `Pozycja dla ${snap.displayPair} jest już otwarta.` };
    }

    const cfg = this.config;
    const now = Date.now();
    const activeEq = Math.max(100, this.getEffectiveEquity());
    const marginAlloc =
      cfg.sizingMode === 'percent'
        ? activeEq * (cfg.positionPercent / 100)
        : Math.min(activeEq * 0.5, cfg.positionFixedUsd / Math.max(1, cfg.leverage));
    const notionalUsd = Math.max(25, marginAlloc * cfg.leverage);
    const limitPrice = side === 'LONG' ? snap.bidPrice : snap.askPrice;
    const qty = notionalUsd / limitPrice;
    const anchor = cfg.meanAnchor === 'vwap' ? snap.vwap : snap.ema20;
    const tpPrice =
      cfg.tpMode === 'mean'
        ? side === 'LONG'
          ? Math.max(limitPrice * 1.0018, anchor)
          : Math.min(limitPrice * 0.9982, anchor)
        : side === 'LONG'
          ? limitPrice + cfg.tpAtrMult * snap.atr14
          : limitPrice - cfg.tpAtrMult * snap.atr14;
    const slDist = Math.max(limitPrice * 0.0025, cfg.slAtrMult * snap.atr14);
    const slPrice = side === 'LONG' ? limitPrice - slDist : limitPrice + slDist;

    if (this.executionMode === 'exchange') {
      return this.submitExchangeOrder({
        snapshot: snap,
        side,
        limitPrice,
        notionalUsd,
        tpPrice,
        slPrice,
        isManual: true,
      });
    }

    this.pendingOrders.unshift({
      id: `MAN-${Date.now().toString().slice(-5)}-${base}`,
      base,
      symbol: snap.symbol,
      displayPair: snap.displayPair,
      side,
      limitPrice,
      notionalUsd,
      qty,
      leverage: cfg.leverage,
      tpPrice,
      slPrice,
      createdAt: now,
      ttlSec: cfg.orderTtlSec,
      expiresAt: now + cfg.orderTtlSec * 1000,
      zScoreAtEntry: snap.zScore,
      rsiAtEntry: snap.rsi7,
      adxAtEntry: snap.adx14,
    });
    this.pushEvent({
      category: 'SIGNAL',
      tag: 'RĘCZNE MAKER',
      symbol: snap.displayPair,
      badgeText: side,
      message: `${snap.displayPair} Wymuszone zlecenie Post-Only ${side} po $${limitPrice.toFixed(limitPrice > 100 ? 2 : 4)}.`,
    });
    return { ok: true };
  }

  public async cancelPendingOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
    const ord = this.pendingOrders.find((o) => o.id === orderId);
    if (!ord) {
      return { ok: false, error: 'Zlecenie nie istnieje lub zostało już wypełnione.' };
    }

    if (this.executionMode === 'exchange') {
      const category = resolveBybitCategory(this.config.marketType);
      try {
        await cancelBybitOrder(category, ord.symbol, orderId);
        this.pendingOrders = this.pendingOrders.filter((o) => o.id !== orderId);
        this.pushEvent({
          category: 'SYSTEM',
          tag: 'BYBIT ANULOWANO',
          symbol: ord.displayPair,
          message: `Anulowano zlecenie ${ord.displayPair} na Bybit (${orderId.slice(-6)}).`,
        });
        void this.syncExchangeState();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Błąd anulowania na Bybit' };
      }
    }

    this.pendingOrders = this.pendingOrders.filter((o) => o.id !== orderId);
    this.pushEvent({
      category: 'SYSTEM',
      tag: 'ANULOWANO',
      symbol: ord.displayPair,
      message: `Anulowano oczekujące zlecenie Maker dla ${ord.displayPair}.`,
    });
    return { ok: true };
  }

  public async closePositionMarket(
    positionId: string,
    reason: ClosedTrade['exitReason'] = 'MANUAL_MARKET'
  ): Promise<{ ok: boolean; error?: string }> {
    const pos = this.activePositions.find((p) => p.id === positionId);
    if (!pos) return { ok: false, error: 'Pozycja nie znaleziona.' };

    const snap = this.latestSignalsByBase[pos.base];
    const exitPrice = snap?.lastPrice ?? pos.markPrice;

    if (this.executionMode === 'exchange') {
      if (this.inFlightClosures.has(positionId)) {
        return { ok: false, error: 'Zamykanie już w toku.' };
      }
      this.inFlightClosures.add(positionId);
      const category = resolveBybitCategory(this.config.marketType);
      try {
        await placeBybitOrder({
          category,
          symbol: pos.symbol,
          side: pos.side === 'LONG' ? 'Sell' : 'Buy',
          orderType: 'Market',
          qtyBase: pos.qty,
          reduceOnly: category === 'linear',
          isSpotMargin: this.config.marketType === 'spot_margin',
        });
        this.activePositions = this.activePositions.filter((p) => p.id !== positionId);
        this.recordClosedTrade(pos, exitPrice, reason, false);
        await this.syncExchangeState();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Błąd zamykania pozycji na Bybit' };
      } finally {
        this.inFlightClosures.delete(positionId);
      }
    }

    this.activePositions = this.activePositions.filter((p) => p.id !== positionId);
    this.recordClosedTrade(pos, exitPrice, reason, false);
    return { ok: true };
  }

  public updateConfig(next: StrategyConfig, logMessage?: string) {
    const tfChanged = next.timeframe !== this.config.timeframe;
    const marketChanged =
      next.marketType !== this.config.marketType || next.quoteCurrency !== this.config.quoteCurrency;
    this.config = { ...next };
    this.pushEvent({
      category: 'SYSTEM',
      tag: 'HOT-RELOAD',
      message:
        logMessage ||
        `Zaktualizowano konfigurację strategii (Z-Score ${next.zScoreThreshold.toFixed(2)}σ, ADX max ${next.adxMax}).`,
    });
    this.schedulePersist();
    if (tfChanged || marketChanged) {
      void this.refreshKlines();
    }
  }

  public async setExecutionMode(mode: ExecutionMode): Promise<{ ok: boolean; error?: string }> {
    const envCfg = getBybitEnvConfig();
    if (mode === 'paper') {
      this.executionMode = 'paper';
      this.activePositions = [];
      this.pendingOrders = [];
      this.pushEvent({
        category: 'SYSTEM',
        tag: 'TRYB PAPER',
        message: 'Przełączono silnik 24/7 na lokalną symulację Paper Trading.',
      });
      this.schedulePersist();
      return { ok: true };
    }

    if (!envCfg.configured) {
      const error =
        'Brak kluczy BYBIT_API_KEY / BYBIT_API_SECRET w zmiennych środowiskowych serwera.';
      this.pushEvent({
        category: 'WARNING',
        tag: 'BRAK KLUCZY',
        message: `Próba włączenia trybu Bybit ${envCfg.env.toUpperCase()} odrzucona — brak kluczy API na serwerze.`,
      });
      return { ok: false, error };
    }

    this.executionMode = 'exchange';
    this.activePositions = [];
    this.pendingOrders = [];
    const synced = await this.syncExchangeState();
    this.pushEvent({
      category: 'SYSTEM',
      tag: `BYBIT ${envCfg.env.toUpperCase()}`,
      badgeText: envCfg.keyMask ?? undefined,
      message: synced
        ? `Połączono silnik 24/7 z kontem Bybit ${envCfg.env.toUpperCase()} (${envCfg.privateBaseUrl}).`
        : `Przełączono na Bybit ${envCfg.env.toUpperCase()}, ale wystąpił błąd odczytu konta.`,
    });
    this.schedulePersist();
    return { ok: synced, error: synced ? undefined : this.privateAccount.error || undefined };
  }

  public togglePauseBot(): BotRunState {
    this.botState = this.botState === 'RUNNING' ? 'PAUSED' : 'RUNNING';
    this.pushEvent({
      category: 'SYSTEM',
      tag: this.botState,
      message:
        this.botState === 'PAUSED'
          ? 'Silnik egzekucji 24/7 wstrzymany przez operatora.'
          : 'Wznowiono automatyczną egzekucję sygnałów 24/7.',
    });
    this.schedulePersist();
    return this.botState;
  }

  public resumeFromKillSwitch(): BotRunState {
    this.botState = 'RUNNING';
    this.pushEvent({
      category: 'SYSTEM',
      tag: 'RUNNING',
      message: 'Zresetowano Kill Switch i wznowiono pracę silnika 24/7.',
    });
    this.schedulePersist();
    return this.botState;
  }

  public async triggerKillSwitch(): Promise<{ ok: boolean; message: string }> {
    this.botState = 'HALTED';
    if (this.executionMode === 'exchange') {
      try {
        const res = await triggerBybitKillSwitch();
        this.pendingOrders = [];
        this.activePositions = [];
        const msg = `Awaryjne zatrzymanie Bybit! Zamknięto pozycji: ${res.closed.length}, anulowano (${res.cancelled.join(', ') || 'brak'}).`;
        this.pushEvent({
          category: 'WARNING',
          tag: 'KILL SWITCH BYBIT',
          message: msg,
        });
        await this.syncExchangeState();
        this.schedulePersist();
        return { ok: true, message: msg };
      } catch (err) {
        const msg = `Kill Switch błąd: ${err instanceof Error ? err.message : 'Network error'}`;
        this.pushEvent({ category: 'WARNING', tag: 'KILL SWITCH BŁĄD', message: msg });
        this.schedulePersist();
        return { ok: false, message: msg };
      }
    }

    this.pendingOrders = [];
    const toClose = [...this.activePositions];
    for (const pos of toClose) {
      const snap = this.latestSignalsByBase[pos.base];
      this.recordClosedTrade(pos, snap?.lastPrice ?? pos.markPrice, 'KILL_SWITCH', false);
    }
    this.activePositions = [];
    const msg = `Awaryjne zatrzymanie! Zamknięto ${toClose.length} pozycji i anulowano oczekujące zlecenia.`;
    this.pushEvent({ category: 'WARNING', tag: 'KILL SWITCH', message: msg });
    this.schedulePersist();
    return { ok: true, message: msg };
  }

  public resetPaperAccount() {
    if (this.executionMode === 'paper') {
      this.activePositions = [];
      this.pendingOrders = [];
    }
    this.closedTrades = [];
    this.paperEquity = DEFAULT_START_EQUITY;
    this.consecutiveLosses = 0;
    this.cooldownUntil = 0;
    this.pushEvent({
      category: 'SYSTEM',
      tag: 'RESET KONTA',
      message: `Zresetowano konto symulacyjne do $${DEFAULT_START_EQUITY.toLocaleString('en-US')}.`,
    });
    this.schedulePersist();
  }

  public togglePausePair(base: string): boolean {
    const exists = this.config.pausedPairs.includes(base);
    this.config = {
      ...this.config,
      pausedPairs: exists
        ? this.config.pausedPairs.filter((b) => b !== base)
        : [...this.config.pausedPairs, base],
    };
    this.schedulePersist();
    return !exists;
  }

  private getTodayRealizedPnl(): number {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const ts = startOfDay.getTime();
    return this.closedTrades
      .filter((t) => t.closedAt >= ts)
      .reduce((acc, t) => acc + t.netPnlUsd, 0);
  }

  private getUnrealizedPnl(): number {
    if (this.executionMode === 'exchange' && this.activePositions.length === 0) {
      return this.privateAccount.unrealizedPnl;
    }
    return this.activePositions.reduce((acc, p) => acc + p.unrealizedPnlUsd, 0);
  }

  private getEffectiveEquity(): number {
    return this.executionMode === 'exchange' ? this.privateAccount.equity : this.paperEquity;
  }

  private getDrawdownPct(): number {
    const eq = this.getEffectiveEquity();
    const totalToday = this.getTodayRealizedPnl() + this.getUnrealizedPnl();
    if (totalToday >= 0 || eq <= 0) return 0;
    return (totalToday / eq) * 100;
  }

  public getSnapshot() {
    const envCfg = getBybitEnvConfig();
    const privateStatus: PrivateExchangeStatus = {
      configured: envCfg.configured,
      env: envCfg.env,
      baseUrl: envCfg.privateBaseUrl,
      keyMask: envCfg.keyMask,
    };

    const equity = this.getEffectiveEquity();
    const totalNotional = this.activePositions.reduce((acc, p) => acc + p.notionalUsd, 0);
    const usedMargin = this.activePositions.reduce(
      (acc, p) => acc + p.notionalUsd / Math.max(1, p.leverage),
      0
    );
    const availableBalance =
      this.executionMode === 'exchange'
        ? this.privateAccount.availableBalance
        : Math.max(0, this.paperEquity - usedMargin);

    return {
      serverDaemon: true,
      startedAt: this.startedAt,
      lastMarketSyncAt: this.lastMarketSyncAt,
      botState: this.botState,
      executionMode: this.executionMode,
      config: this.config,
      equity,
      startingEquity:
        this.executionMode === 'exchange'
          ? Math.max(this.privateAccount.walletBalance || this.privateAccount.equity, 1)
          : DEFAULT_START_EQUITY,
      availableBalance,
      todayRealizedPnl: this.getTodayRealizedPnl(),
      unrealizedPnl: this.getUnrealizedPnl(),
      effectiveLeverage: equity > 0 ? totalNotional / equity : 0,
      drawdownPct: this.getDrawdownPct(),
      activePositions: this.activePositions,
      pendingOrders: this.pendingOrders,
      closedTrades: this.closedTrades,
      events: this.events,
      privateStatus,
      privateAccount: this.privateAccount,
    };
  }
}

export const serverBot = new ServerBotDaemon();
