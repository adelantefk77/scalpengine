import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { buildIndicatorSeries, evaluatePointSignal, parseBybitKlines } from './indicators';
import {
  ALL_SCANNER_ASSETS,
  ActivePosition,
  BotEvent,
  BotRunState,
  Candle,
  ClosedTrade,
  DEFAULT_STRATEGY_CONFIG,
  ExecutionMode,
  NavRoute,
  PairTelemetry,
  PendingOrder,
  PrivateAccountSnapshot,
  PrivateExchangeStatus,
  StrategyConfig,
  formatBybitSymbol,
  resolveBybitCategory,
} from './types';

interface TickerQuote {
  symbol: string;
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
  price24hPcnt: number;
  turnover24h: number;
}

interface WsStatusState {
  connected: boolean;
  latencyMs: number;
  endpoint: string;
  messagesReceived: number;
  lastHeartbeatAt: number | null;
  error: string | null;
}

interface DaemonSnapshotResponse {
  ok?: boolean;
  error?: string;
  message?: string;
  serverDaemon?: boolean;
  startedAt?: number;
  lastMarketSyncAt?: number | null;
  botState: BotRunState;
  executionMode: ExecutionMode;
  config: StrategyConfig;
  equity: number;
  startingEquity: number;
  availableBalance: number;
  todayRealizedPnl: number;
  unrealizedPnl: number;
  effectiveLeverage: number;
  drawdownPct: number;
  activePositions: ActivePosition[];
  pendingOrders: PendingOrder[];
  closedTrades: ClosedTrade[];
  events: BotEvent[];
  privateStatus: PrivateExchangeStatus;
  privateAccount: PrivateAccountSnapshot;
}

interface BotContextValue {
  activeRoute: NavRoute;
  setActiveRoute: (route: NavRoute) => void;
  config: StrategyConfig;
  updateConfig: (next: StrategyConfig, logMessage?: string) => void;
  botState: BotRunState;
  executionMode: ExecutionMode;
  setExecutionMode: (mode: ExecutionMode) => Promise<void>;
  privateStatus: PrivateExchangeStatus;
  privateAccount: PrivateAccountSnapshot;
  serverStartedAt: number | null;
  serverLastMarketSyncAt: number | null;
  refreshPrivateAccount: () => Promise<boolean>;
  togglePauseBot: () => void;
  resumeFromKillSwitch: () => void;
  triggerKillSwitch: () => void;
  equity: number;
  startingEquity: number;
  availableBalance: number;
  todayRealizedPnl: number;
  unrealizedPnl: number;
  effectiveLeverage: number;
  drawdownPct: number;
  pairTelemetries: PairTelemetry[];
  selectedPairBase: string;
  setSelectedPairBase: (base: string) => void;
  activePositions: ActivePosition[];
  pendingOrders: PendingOrder[];
  closedTrades: ClosedTrade[];
  events: BotEvent[];
  wsStatus: WsStatusState;
  isLoadingMarket: boolean;
  marketError: string | null;
  refreshMarketData: () => Promise<void>;
  forceMakerOrder: (base: string, side: 'LONG' | 'SHORT') => void;
  closePositionMarket: (positionId: string) => void;
  cancelPendingOrder: (orderId: string) => void;
  togglePausePair: (base: string) => void;
  resetPaperAccount: () => void;
  toast: { message: string; type: 'success' | 'warning' | 'error' } | null;
  showToast: (message: string, type?: 'success' | 'warning' | 'error') => void;
}

const DEFAULT_START_EQUITY = 25000;

const BotContext = createContext<BotContextValue | null>(null);

export const BotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeRoute, setActiveRoute] = useState<NavRoute>('dashboard');
  const [config, setConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
  const [botState, setBotState] = useState<BotRunState>('RUNNING');
  const [executionMode, setExecutionModeState] = useState<ExecutionMode>('paper');
  const [privateStatus, setPrivateStatus] = useState<PrivateExchangeStatus>({
    configured: false,
    env: 'demo',
    baseUrl: 'https://api-demo.bybit.com',
    keyMask: null,
  });
  const [privateAccount, setPrivateAccount] = useState<PrivateAccountSnapshot>({
    equity: 0,
    availableBalance: 0,
    walletBalance: 0,
    unrealizedPnl: 0,
    updatedAt: null,
    error: null,
  });
  const [serverStartedAt, setServerStartedAt] = useState<number | null>(null);
  const [serverLastMarketSyncAt, setServerLastMarketSyncAt] = useState<number | null>(null);

  const [equity, setEquity] = useState<number>(DEFAULT_START_EQUITY);
  const [startingEquity, setStartingEquity] = useState<number>(DEFAULT_START_EQUITY);
  const [availableBalance, setAvailableBalance] = useState<number>(DEFAULT_START_EQUITY);
  const [todayRealizedPnl, setTodayRealizedPnl] = useState<number>(0);
  const [serverUnrealizedPnl, setServerUnrealizedPnl] = useState<number>(0);
  const [effectiveLeverage, setEffectiveLeverage] = useState<number>(0);
  const [drawdownPct, setDrawdownPct] = useState<number>(0);

  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);
  const [rawActivePositions, setRawActivePositions] = useState<ActivePosition[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [events, setEvents] = useState<BotEvent[]>([]);

  const [selectedPairBase, setSelectedPairBase] = useState<string>('SOL');
  const [isLoadingMarket, setIsLoadingMarket] = useState<boolean>(true);
  const [marketError, setMarketError] = useState<string | null>(null);

  const [candlesByBase, setCandlesByBase] = useState<Record<string, Candle[]>>({});
  const [tickersBySymbol, setTickersBySymbol] = useState<Record<string, TickerQuote>>({});

  const [wsStatus, setWsStatus] = useState<WsStatusState>({
    connected: false,
    latencyMs: 0,
    endpoint: 'wss://stream.bybit.com/v5/public/linear',
    messagesReceived: 0,
    lastHeartbeatAt: null,
    error: null,
  });

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'warning' | 'error' = 'success') => {
    setToast({ message, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  const configRef = useRef(config);
  configRef.current = config;

  const applyDaemonSnapshot = useCallback((data: DaemonSnapshotResponse) => {
    if (!data || !data.config) return;
    if (data.startedAt) setServerStartedAt(data.startedAt);
    if (data.lastMarketSyncAt !== undefined) setServerLastMarketSyncAt(data.lastMarketSyncAt);
    setBotState(data.botState);
    setExecutionModeState(data.executionMode);
    setConfig(data.config);
    setEquity(Number(data.equity || 0));
    setStartingEquity(Number(data.startingEquity || DEFAULT_START_EQUITY));
    setAvailableBalance(Number(data.availableBalance || 0));
    setTodayRealizedPnl(Number(data.todayRealizedPnl || 0));
    setServerUnrealizedPnl(Number(data.unrealizedPnl || 0));
    setEffectiveLeverage(Number(data.effectiveLeverage || 0));
    setDrawdownPct(Number(data.drawdownPct || 0));
    setRawActivePositions(Array.isArray(data.activePositions) ? data.activePositions : []);
    setPendingOrders(Array.isArray(data.pendingOrders) ? data.pendingOrders : []);
    setClosedTrades(Array.isArray(data.closedTrades) ? data.closedTrades : []);
    setEvents(Array.isArray(data.events) ? data.events : []);
    if (data.privateStatus) setPrivateStatus(data.privateStatus);
    if (data.privateAccount) setPrivateAccount(data.privateAccount);
  }, []);

  const syncDaemonState = useCallback(async () => {
    try {
      const res = await fetch('/api/bot/state');
      if (!res.ok) return;
      const json = (await res.json()) as DaemonSnapshotResponse;
      if (json.ok) {
        applyDaemonSnapshot(json);
      }
    } catch {
      // ignore transient polling error
    }
  }, [applyDaemonSnapshot]);

  // Poll 24/7 server bot daemon state every 1.5s
  useEffect(() => {
    void syncDaemonState();
    const timer = window.setInterval(() => {
      void syncDaemonState();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [syncDaemonState]);

  // Fetch public tickers + klines for live chart & scanner UI
  const refreshMarketData = useCallback(async () => {
    const cfg = configRef.current;
    const category = resolveBybitCategory(cfg.marketType);
    const basesToLoad = Array.from(new Set([...ALL_SCANNER_ASSETS, ...cfg.activePairs]));

    try {
      const tStart = performance.now();
      const tickersRes = await fetch(`/api/bybit/tickers?category=${encodeURIComponent(category)}`);
      const tickersJson = await tickersRes.json();

      if (!tickersRes.ok || tickersJson.retCode !== 0) {
        throw new Error(tickersJson.retMsg || 'Błąd pobierania tickerów z Bybit');
      }

      const tickerList = (tickersJson.result?.list ?? []) as Array<{
        symbol: string;
        lastPrice: string;
        bid1Price?: string;
        ask1Price?: string;
        price24hPcnt?: string;
        turnover24h?: string;
      }>;

      const nextTickers: Record<string, TickerQuote> = {};
      for (const t of tickerList) {
        const last = Number(t.lastPrice);
        if (!Number.isFinite(last) || last <= 0) continue;
        const bid = Number(t.bid1Price || last);
        const ask = Number(t.ask1Price || last);
        nextTickers[t.symbol] = {
          symbol: t.symbol,
          lastPrice: last,
          bidPrice: bid > 0 ? bid : last,
          askPrice: ask > 0 ? ask : last,
          price24hPcnt: Number(t.price24hPcnt || 0) * 100,
          turnover24h: Number(t.turnover24h || 0),
        };
      }
      setTickersBySymbol((prev) => ({ ...prev, ...nextTickers }));

      const klineResults: Record<string, Candle[]> = {};
      const batchSize = 6;
      for (let i = 0; i < basesToLoad.length; i += batchSize) {
        const chunk = basesToLoad.slice(i, i + batchSize);
        await Promise.all(
          chunk.map(async (base) => {
            const { symbol, category: symCat } = formatBybitSymbol(base, cfg.marketType, cfg.quoteCurrency);
            try {
              const res = await fetch(
                `/api/bybit/klines?category=${symCat}&symbol=${encodeURIComponent(symbol)}&interval=${cfg.timeframe}&limit=120`
              );
              if (!res.ok) return;
              const data = await res.json();
              if (data.retCode === 0 && Array.isArray(data.result?.list)) {
                const parsed = parseBybitKlines(data.result.list);
                if (parsed.length > 0) {
                  klineResults[base] = parsed;
                }
              }
            } catch {
              // ignore individual symbol error
            }
          })
        );
      }

      if (Object.keys(klineResults).length > 0) {
        setCandlesByBase((prev) => ({ ...prev, ...klineResults }));
      }

      const restLatency = Math.round(performance.now() - tStart);
      setWsStatus((prev) => ({
        ...prev,
        latencyMs: prev.connected && prev.latencyMs > 0 ? prev.latencyMs : restLatency,
      }));

      setMarketError(null);
    } catch (err) {
      setMarketError(err instanceof Error ? err.message : 'Błąd połączenia z Bybit API');
    } finally {
      setIsLoadingMarket(false);
    }
  }, []);

  useEffect(() => {
    setIsLoadingMarket(true);
    void refreshMarketData();
    const interval = window.setInterval(() => {
      void refreshMarketData();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [config.marketType, config.quoteCurrency, config.timeframe, refreshMarketData]);

  // Live Bybit WebSocket stream for sub-second chart updates & RTT telemetry
  useEffect(() => {
    const category = resolveBybitCategory(config.marketType);
    const wsUrl =
      category === 'spot'
        ? 'wss://stream.bybit.com/v5/public/spot'
        : 'wss://stream.bybit.com/v5/public/linear';

    let ws: WebSocket | null = null;
    let pingTimer: number | null = null;
    let reconnectTimer: number | null = null;
    let pingSentAt = 0;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        setWsStatus((prev) => ({
          ...prev,
          connected: false,
          endpoint: wsUrl,
          error: err instanceof Error ? err.message : 'WS error',
        }));
        return;
      }

      ws.onopen = () => {
        if (disposed || !ws) return;
        const topics = ALL_SCANNER_ASSETS.map((base) => {
          const { symbol } = formatBybitSymbol(base, config.marketType, config.quoteCurrency);
          return `tickers.${symbol}`;
        });
        ws.send(JSON.stringify({ op: 'subscribe', args: topics.slice(0, 10) }));
        if (topics.length > 10) {
          ws.send(JSON.stringify({ op: 'subscribe', args: topics.slice(10) }));
        }

        pingSentAt = performance.now();
        ws.send(JSON.stringify({ op: 'ping' }));

        setWsStatus((prev) => ({
          ...prev,
          connected: true,
          endpoint: wsUrl,
          error: null,
          lastHeartbeatAt: Date.now(),
        }));

        pingTimer = window.setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            pingSentAt = performance.now();
            ws.send(JSON.stringify({ op: 'ping' }));
          }
        }, 12000);
      };

      ws.onmessage = (msg) => {
        if (disposed) return;
        try {
          const payload = JSON.parse(msg.data);
          if (payload.op === 'pong' || payload.ret_msg === 'pong') {
            const rtt = Math.max(1, Math.round(performance.now() - pingSentAt));
            setWsStatus((prev) => ({
              ...prev,
              connected: true,
              latencyMs: rtt,
              lastHeartbeatAt: Date.now(),
              messagesReceived: prev.messagesReceived + 1,
            }));
            return;
          }

          if (payload.topic && String(payload.topic).startsWith('tickers.') && payload.data) {
            const d = payload.data;
            const symbol = String(d.symbol || String(payload.topic).replace('tickers.', ''));
            setTickersBySymbol((prev) => {
              const existing = prev[symbol];
              const lastPrice = Number(d.lastPrice ?? existing?.lastPrice ?? 0);
              if (!Number.isFinite(lastPrice) || lastPrice <= 0) return prev;
              const bidPrice = Number(d.bid1Price ?? existing?.bidPrice ?? lastPrice);
              const askPrice = Number(d.ask1Price ?? existing?.askPrice ?? lastPrice);
              const price24hPcnt =
                d.price24hPcnt !== undefined
                  ? Number(d.price24hPcnt) * 100
                  : existing?.price24hPcnt ?? 0;
              const turnover24h =
                d.turnover24h !== undefined ? Number(d.turnover24h) : existing?.turnover24h ?? 0;

              return {
                ...prev,
                [symbol]: {
                  symbol,
                  lastPrice,
                  bidPrice: bidPrice > 0 ? bidPrice : lastPrice,
                  askPrice: askPrice > 0 ? askPrice : lastPrice,
                  price24hPcnt,
                  turnover24h,
                },
              };
            });

            setWsStatus((prev) => ({
              ...prev,
              messagesReceived: prev.messagesReceived + 1,
            }));
          }
        } catch {
          // ignore malformed WS frames
        }
      };

      ws.onerror = () => {
        if (disposed) return;
        setWsStatus((prev) => ({
          ...prev,
          connected: false,
          error: 'WebSocket fallback to REST polling',
        }));
      };

      ws.onclose = () => {
        if (disposed) return;
        if (pingTimer) window.clearInterval(pingTimer);
        setWsStatus((prev) => ({ ...prev, connected: false }));
        reconnectTimer = window.setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (pingTimer) window.clearInterval(pingTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };
  }, [config.marketType, config.quoteCurrency]);

  // Patch active positions with live WS markPrice for smooth UI ticks between 1.5s server polls
  const activePositions = useMemo<ActivePosition[]>(() => {
    return rawActivePositions.map((pos) => {
      const ticker = tickersBySymbol[pos.symbol];
      if (!ticker) return pos;
      const markPrice = ticker.lastPrice;
      const grossU =
        pos.side === 'LONG'
          ? (markPrice - pos.entryPrice) * pos.qty
          : (pos.entryPrice - markPrice) * pos.qty;
      const uPnlUsd = grossU - pos.entryFeeUsd;
      const uPnlPct = pos.notionalUsd > 0 ? (uPnlUsd / pos.notionalUsd) * 100 : 0;
      return {
        ...pos,
        markPrice,
        unrealizedPnlUsd: uPnlUsd,
        unrealizedPnlPct: uPnlPct,
      };
    });
  }, [rawActivePositions, tickersBySymbol]);

  const unrealizedPnl = useMemo(() => {
    if (activePositions.length === 0) return serverUnrealizedPnl;
    return activePositions.reduce((acc, p) => acc + p.unrealizedPnlUsd, 0);
  }, [activePositions, serverUnrealizedPnl]);

  // Compute live pair telemetries for Scanner & Dashboard charts
  const pairTelemetries = useMemo<PairTelemetry[]>(() => {
    const out: PairTelemetry[] = [];
    for (const base of ALL_SCANNER_ASSETS) {
      const candles = candlesByBase[base];
      if (!candles || candles.length === 0) continue;

      const { symbol, displayPair, category } = formatBybitSymbol(
        base,
        config.marketType,
        config.quoteCurrency
      );
      const ticker = tickersBySymbol[symbol];

      const liveCandles = candles.slice();
      const lastCandle = { ...liveCandles[liveCandles.length - 1] };
      const livePrice = ticker?.lastPrice ?? lastCandle.close;
      lastCandle.close = livePrice;
      if (livePrice > lastCandle.high) lastCandle.high = livePrice;
      if (livePrice < lastCandle.low) lastCandle.low = livePrice;
      liveCandles[liveCandles.length - 1] = lastCandle;

      const series = buildIndicatorSeries(liveCandles, config);
      const latest = series[series.length - 1];
      if (!latest) continue;

      const bidPrice = ticker?.bidPrice ?? livePrice;
      const askPrice = ticker?.askPrice ?? livePrice;
      const spreadPct =
        livePrice > 0 && askPrice >= bidPrice ? ((askPrice - bidPrice) / livePrice) * 100 : 0.01;

      const openPos = activePositions.find((p) => p.base === base);
      const isPausedPair = config.pausedPairs.includes(base);
      const evalRes = evaluatePointSignal(latest, config, {
        isPausedPair,
        openSide: openPos?.side ?? null,
      });

      out.push({
        base,
        symbol,
        displayPair,
        category,
        lastPrice: livePrice,
        bidPrice,
        askPrice,
        spreadPct,
        change24hPct: ticker?.price24hPcnt ?? 0,
        volume24hUsd: ticker?.turnover24h ?? 0,
        zScore: latest.zScore,
        rsi7: latest.rsi7,
        adx14: latest.adx14,
        atr14: latest.atr14,
        atrPct: latest.atrPct,
        ema20: latest.ema20,
        vwap: latest.vwap,
        upperBand: latest.upperBand,
        lowerBand: latest.lowerBand,
        status: evalRes.status,
        statusReason: evalRes.reason,
        series,
        updatedAt: Date.now(),
      });
    }
    return out;
  }, [candlesByBase, tickersBySymbol, config, activePositions]);

  // =========================================================================
  // Server-backed Actions (all mutations execute on the 24/7 backend daemon)
  // =========================================================================

  const updateConfig = useCallback(
    (next: StrategyConfig, logMessage?: string) => {
      setConfig(next);
      void (async () => {
        try {
          const res = await fetch('/api/bot/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: next, logMessage }),
          });
          const data = (await res.json()) as DaemonSnapshotResponse;
          if (res.ok && data.ok) {
            applyDaemonSnapshot(data);
          }
        } catch {
          showToast('Nie udało się zapisać konfiguracji na serwerze.', 'error');
        }
      })();
    },
    [applyDaemonSnapshot, showToast]
  );

  const setExecutionMode = useCallback(
    async (mode: ExecutionMode) => {
      try {
        const res = await fetch('/api/bot/mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        });
        const data = (await res.json()) as DaemonSnapshotResponse;
        applyDaemonSnapshot(data);
        if (!res.ok || !data.ok) {
          showToast(
            data.error ||
              'Brak kluczy BYBIT_API_KEY / BYBIT_API_SECRET w zmiennych środowiskowych serwera.',
            'error'
          );
          return;
        }
        const envUpper = (data.privateStatus?.env || 'demo').toUpperCase();
        showToast(
          mode === 'exchange'
            ? `Silnik 24/7 przełączony na Bybit ${envUpper} (${data.privateStatus?.baseUrl}).`
            : 'Silnik 24/7 przełączony na tryb Paper Trading.',
          'success'
        );
      } catch (err) {
        showToast(
          `Błąd zmiany trybu: ${err instanceof Error ? err.message : 'Network error'}`,
          'error'
        );
      }
    },
    [applyDaemonSnapshot, showToast]
  );

  const refreshPrivateAccount = useCallback(async () => {
    try {
      const res = await fetch('/api/bot/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh_private' }),
      });
      const data = (await res.json()) as DaemonSnapshotResponse;
      applyDaemonSnapshot(data);
      return Boolean(data.ok);
    } catch {
      return false;
    }
  }, [applyDaemonSnapshot]);

  const togglePauseBot = useCallback(() => {
    void (async () => {
      try {
        const res = await fetch('/api/bot/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'toggle_pause' }),
        });
        const data = (await res.json()) as DaemonSnapshotResponse;
        if (data.config) applyDaemonSnapshot(data);
        showToast(
          data.botState === 'PAUSED' ? 'Bot wstrzymany (PAUSED).' : 'Bot uruchomiony (RUNNING).',
          data.botState === 'PAUSED' ? 'warning' : 'success'
        );
      } catch {
        showToast('Błąd komunikacji z serwerem.', 'error');
      }
    })();
  }, [applyDaemonSnapshot, showToast]);

  const resumeFromKillSwitch = useCallback(() => {
    void (async () => {
      try {
        const res = await fetch('/api/bot/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'resume_kill_switch' }),
        });
        const data = (await res.json()) as DaemonSnapshotResponse;
        if (data.config) applyDaemonSnapshot(data);
        showToast('Kill Switch odblokowany — bot 24/7 RUNNING.', 'success');
      } catch {
        showToast('Błąd komunikacji z serwerem.', 'error');
      }
    })();
  }, [applyDaemonSnapshot, showToast]);

  const triggerKillSwitch = useCallback(() => {
    void (async () => {
      try {
        const res = await fetch('/api/bot/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'kill_switch' }),
        });
        const data = (await res.json()) as DaemonSnapshotResponse;
        if (data.config) applyDaemonSnapshot(data);
        showToast(
          data.message || 'KILL SWITCH AKTYWOWANY: Zlecenia anulowane, pozycje zamknięte.',
          'error'
        );
      } catch {
        showToast('Błąd sieci przy aktywacji Kill Switch.', 'error');
      }
    })();
  }, [applyDaemonSnapshot, showToast]);

  const resetPaperAccount = useCallback(() => {
    void (async () => {
      try {
        const res = await fetch('/api/bot/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reset_paper' }),
        });
        const data = (await res.json()) as DaemonSnapshotResponse;
        if (data.config) applyDaemonSnapshot(data);
        showToast('Konto symulacyjne zresetowane do $25,000.00.', 'success');
      } catch {
        showToast('Błąd resetu konta.', 'error');
      }
    })();
  }, [applyDaemonSnapshot, showToast]);

  const togglePausePair = useCallback(
    (base: string) => {
      void (async () => {
        try {
          const res = await fetch('/api/bot/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'toggle_pair', base }),
          });
          const data = (await res.json()) as DaemonSnapshotResponse & { paused?: boolean };
          if (data.config) applyDaemonSnapshot(data);
          showToast(
            data.paused ? `Wstrzymano parę ${base} w skanerze 24/7.` : `Wznowiono skanowanie pary ${base}.`,
            'success'
          );
        } catch {
          showToast('Błąd komunikacji z serwerem.', 'error');
        }
      })();
    },
    [applyDaemonSnapshot, showToast]
  );

  const forceMakerOrder = useCallback(
    (base: string, side: 'LONG' | 'SHORT') => {
      void (async () => {
        try {
          const res = await fetch('/api/bot/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base, side }),
          });
          const data = (await res.json()) as DaemonSnapshotResponse;
          if (data.config) applyDaemonSnapshot(data);
          if (!res.ok || !data.ok) {
            showToast(data.error || 'Odrzucono zlecenie.', 'error');
            return;
          }
          showToast(`Wysłano zlecenie Post-Only ${side} dla ${base}.`, 'success');
        } catch (err) {
          showToast(`Błąd zlecenia: ${err instanceof Error ? err.message : 'Network error'}`, 'error');
        }
      })();
    },
    [applyDaemonSnapshot, showToast]
  );

  const cancelPendingOrder = useCallback(
    (orderId: string) => {
      void (async () => {
        try {
          const res = await fetch('/api/bot/cancel-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId }),
          });
          const data = (await res.json()) as DaemonSnapshotResponse;
          if (data.config) applyDaemonSnapshot(data);
          if (!res.ok || !data.ok) {
            showToast(data.error || 'Nie udało się anulować zlecenia.', 'error');
            return;
          }
          showToast('Anulowano oczekujące zlecenie.', 'success');
        } catch {
          showToast('Błąd anulowania zlecenia.', 'error');
        }
      })();
    },
    [applyDaemonSnapshot, showToast]
  );

  const closePositionMarket = useCallback(
    (positionId: string) => {
      void (async () => {
        try {
          const res = await fetch('/api/bot/close-position', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ positionId }),
          });
          const data = (await res.json()) as DaemonSnapshotResponse;
          if (data.config) applyDaemonSnapshot(data);
          if (!res.ok || !data.ok) {
            showToast(data.error || 'Nie udało się zamknąć pozycji.', 'error');
            return;
          }
          showToast('Zamknięto pozycję po cenie rynkowej.', 'warning');
        } catch {
          showToast('Błąd zamykania pozycji.', 'error');
        }
      })();
    },
    [applyDaemonSnapshot, showToast]
  );

  const value: BotContextValue = {
    activeRoute,
    setActiveRoute,
    config,
    updateConfig,
    botState,
    executionMode,
    setExecutionMode,
    privateStatus,
    privateAccount,
    serverStartedAt,
    serverLastMarketSyncAt,
    refreshPrivateAccount,
    togglePauseBot,
    resumeFromKillSwitch,
    triggerKillSwitch,
    equity,
    startingEquity,
    availableBalance,
    todayRealizedPnl,
    unrealizedPnl,
    effectiveLeverage,
    drawdownPct,
    pairTelemetries,
    selectedPairBase,
    setSelectedPairBase,
    activePositions,
    pendingOrders,
    closedTrades,
    events,
    wsStatus,
    isLoadingMarket,
    marketError,
    refreshMarketData,
    forceMakerOrder,
    closePositionMarket,
    cancelPendingOrder,
    togglePausePair,
    resetPaperAccount,
    toast,
    showToast,
  };

  return <BotContext.Provider value={value}>{children}</BotContext.Provider>;
};

export function useBot() {
  const ctx = useContext(BotContext);
  if (!ctx) throw new Error('useBot must be used within BotProvider');
  return ctx;
}
