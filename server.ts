import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getAuthStatusFromRequest,
  handleLoginRequest,
  handleLogoutRequest,
  isAuthEnabled,
  requireAuthMiddleware,
  requireCsrfProtection,
  securityHeadersMiddleware,
} from './serverAuth';
import { serverBot } from './serverBot';
import {
  cancelBybitOrder,
  fetchBybitJson,
  fetchBybitPrivateAccount,
  fetchBybitPrivateState,
  getAllBybitAccountsStatus,
  getBybitEnvConfig,
  getBybitNetworkDiagnostics,
  placeBybitOrder,
  triggerBybitKillSwitch,
  type BybitEnv,
  type PrivateOrderPayload,
} from './serverBybit';
import type { ExecutionMode, PrivateEnv, StrategyConfig } from './src/engine/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(securityHeadersMiddleware);
  app.use(express.json({ limit: '256kb' }));

  // Start autonomous 24/7 server-side trading engine immediately
  serverBot.start();

  // Public health endpoint (for Railway healthcheck)
  app.get('/api/health', async (_req, res) => {
    const netDiag = getBybitNetworkDiagnostics();
    const envCfg = getBybitEnvConfig(serverBot.getPrivateEnv());
    try {
      const start = Date.now();
      const result = await fetchBybitJson<{ result?: { timeSecond?: string; timeNano?: string } }>(
        '/v5/market/time',
        1000
      );
      res.json({
        ok: true,
        serverTimeMs: Date.now(),
        bybitLatencyMs: result.latencyMs || Date.now() - start,
        bybitHost: result.host,
        bybitServerTime: result.data.result ?? null,
        privateEnv: envCfg.env,
        privateConfigured: envCfg.configured,
        accountsConfigured: {
          demo: getBybitEnvConfig('demo').configured,
          mainnet: getBybitEnvConfig('mainnet').configured,
        },
        authEnabled: isAuthEnabled(),
        serverDaemon: true,
        networkDiagnostics: { ...netDiag, activePublicHost: result.host },
      });
    } catch (err) {
      res.status(502).json({
        ok: false,
        privateEnv: envCfg.env,
        privateConfigured: envCfg.configured,
        authEnabled: isAuthEnabled(),
        serverDaemon: true,
        networkDiagnostics: netDiag,
        error: err instanceof Error ? err.message : 'Bybit unreachable',
      });
    }
  });

  // =========================================================================
  // Terminal Authentication API (4-hour HttpOnly HMAC Session)
  // =========================================================================

  app.get('/api/auth/status', (req, res) => {
    res.json({ ok: true, ...getAuthStatusFromRequest(req) });
  });

  app.post('/api/auth/login', requireCsrfProtection, handleLoginRequest);
  app.post('/api/auth/logout', requireCsrfProtection, handleLogoutRequest);

  // Protect all trading daemon & Bybit proxy endpoints when APP_PASSWORD is set + enforce CSRF/Origin guard on mutations
  app.use(['/api/bot', '/api/bybit'], requireAuthMiddleware, requireCsrfProtection);

  // =========================================================================
  // 24/7 Autonomous Bot Daemon Control & Telemetry API
  // =========================================================================

  app.get('/api/bot/state', (_req, res) => {
    res.json({ ok: true, ...serverBot.getSnapshot() });
  });

  app.post('/api/bot/config', (req, res) => {
    const { config, logMessage } = req.body as {
      config?: Partial<StrategyConfig>;
      logMessage?: string;
    };
    if (!config || typeof config !== 'object' || !Array.isArray(config.activePairs)) {
      res.status(400).json({ ok: false, error: 'Nieprawidłowy obiekt konfiguracji strategii.' });
      return;
    }
    const result = serverBot.updateConfig(config, logMessage);
    res.status(result.ok ? 200 : 400).json({ ...result, ...serverBot.getSnapshot() });
  });

  app.post('/api/bot/mode', async (req, res) => {
    const { mode, env, confirmLive } = req.body as {
      mode?: ExecutionMode;
      env?: PrivateEnv;
      confirmLive?: boolean;
    };
    if (mode !== 'paper' && mode !== 'exchange') {
      res.status(400).json({ ok: false, error: 'Nieprawidłowy tryb egzekucji.' });
      return;
    }
    if (env !== undefined && env !== 'demo' && env !== 'mainnet' && env !== 'testnet') {
      res.status(400).json({ ok: false, error: 'Nieprawidłowe środowisko Bybit (demo / mainnet).' });
      return;
    }
    const result = await serverBot.setExecutionMode(mode, env, Boolean(confirmLive));
    res.status(result.ok ? 200 : 400).json({
      ...result,
      ...serverBot.getSnapshot(),
    });
  });

  app.post('/api/bot/control', async (req, res) => {
    const { action, base, bases, paused, reason } = req.body as {
      action?: string;
      base?: string;
      bases?: unknown;
      paused?: unknown;
      reason?: string;
    };

    switch (action) {
      case 'toggle_pause': {
        serverBot.togglePauseBot();
        res.json({ ok: true, ...serverBot.getSnapshot() });
        return;
      }
      case 'resume_kill_switch': {
        serverBot.resumeFromKillSwitch();
        res.json({ ok: true, ...serverBot.getSnapshot() });
        return;
      }
      case 'kill_switch': {
        const result = await serverBot.triggerKillSwitch();
        res.status(result.ok ? 200 : 400).json({
          ...result,
          ...serverBot.getSnapshot(),
        });
        return;
      }
      case 'reset_paper': {
        serverBot.resetPaperAccount();
        res.json({ ok: true, ...serverBot.getSnapshot() });
        return;
      }
      case 'toggle_pair': {
        if (!base) {
          res.status(400).json({ ok: false, error: 'Brak parametru base.' });
          return;
        }
        const isPaused = serverBot.togglePausePair(base);
        res.json({ ok: true, paused: isPaused, ...serverBot.getSnapshot() });
        return;
      }
      case 'set_paused_pairs': {
        if (!Array.isArray(bases) || typeof paused !== 'boolean') {
          res.status(400).json({ ok: false, error: 'Nieprawidłowe parametry listy par lub flagi paused.' });
          return;
        }
        const safeBases = bases.filter((item): item is string => typeof item === 'string');
        const result = serverBot.setPausedPairsBatch(
          safeBases,
          paused,
          typeof reason === 'string' ? reason.slice(0, 60) : undefined
        );
        res.json({ ok: true, ...result, ...serverBot.getSnapshot() });
        return;
      }
      case 'refresh_private': {
        const synced = await serverBot.syncExchangeState(true);
        res.json({ ok: synced, ...serverBot.getSnapshot() });
        return;
      }
      default:
        res.status(400).json({ ok: false, error: 'Nieznana akcja sterowania.' });
    }
  });

  app.post('/api/bot/order', async (req, res) => {
    const { base, side } = req.body as { base?: string; side?: 'LONG' | 'SHORT' };
    if (!base || (side !== 'LONG' && side !== 'SHORT')) {
      res.status(400).json({ ok: false, error: 'Brak symbolu lub kierunku LONG/SHORT.' });
      return;
    }
    const result = await serverBot.forceMakerOrder(base, side);
    res.status(result.ok ? 200 : 400).json({ ...result, ...serverBot.getSnapshot() });
  });

  app.post('/api/bot/cancel-order', async (req, res) => {
    const { orderId } = req.body as { orderId?: string };
    if (!orderId) {
      res.status(400).json({ ok: false, error: 'Brak orderId.' });
      return;
    }
    const result = await serverBot.cancelPendingOrder(orderId);
    res.status(result.ok ? 200 : 400).json({ ...result, ...serverBot.getSnapshot() });
  });

  app.post('/api/bot/close-position', async (req, res) => {
    const { positionId } = req.body as { positionId?: string };
    if (!positionId) {
      res.status(400).json({ ok: false, error: 'Brak positionId.' });
      return;
    }
    const result = await serverBot.closePositionMarket(positionId);
    res.status(result.ok ? 200 : 400).json({ ...result, ...serverBot.getSnapshot() });
  });

  // =========================================================================
  // Public Bybit Market Data Endpoints
  // =========================================================================

  app.get('/api/bybit/tickers', async (req, res) => {
    const category = String(req.query.category || 'linear');
    const symbol = req.query.symbol ? `&symbol=${encodeURIComponent(String(req.query.symbol))}` : '';
    try {
      const endpoint = `/v5/market/tickers?category=${encodeURIComponent(category)}${symbol}`;
      const result = await fetchBybitJson<Record<string, unknown>>(endpoint, 1500);
      res.json({ ...result.data, _meta: { latencyMs: result.latencyMs, host: result.host } });
    } catch (err) {
      res.status(502).json({
        retCode: -1,
        retMsg: err instanceof Error ? err.message : 'Upstream error',
      });
    }
  });

  app.get('/api/bybit/klines', async (req, res) => {
    const category = String(req.query.category || 'linear');
    const symbol = String(req.query.symbol || 'SOLUSDT');
    const interval = String(req.query.interval || '5');
    const limit = Math.min(1000, Math.max(10, Number(req.query.limit || 200)));
    const end = req.query.end ? `&end=${encodeURIComponent(String(req.query.end))}` : '';
    const start = req.query.start ? `&start=${encodeURIComponent(String(req.query.start))}` : '';

    try {
      const endpoint = `/v5/market/kline?category=${encodeURIComponent(category)}&symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}${start}${end}`;
      const result = await fetchBybitJson<Record<string, unknown>>(endpoint, 3000);
      res.json({ ...result.data, _meta: { latencyMs: result.latencyMs, host: result.host } });
    } catch (err) {
      res.status(502).json({
        retCode: -1,
        retMsg: err instanceof Error ? err.message : 'Upstream error',
      });
    }
  });

  app.get('/api/bybit/klines-range', async (req, res) => {
    const category = String(req.query.category || 'linear');
    const symbol = String(req.query.symbol || 'SOLUSDT');
    const interval = String(req.query.interval || '5');
    const targetBars = Math.min(5000, Math.max(200, Number(req.query.bars || 1500)));

    try {
      const collected: string[][] = [];
      let endCursor: number | undefined = undefined;
      let pages = 0;
      const maxPages = Math.ceil(targetBars / 1000);

      while (collected.length < targetBars && pages < maxPages) {
        const batchLimit = Math.min(1000, targetBars - collected.length);
        const endParam: string = endCursor !== undefined ? `&end=${endCursor}` : '';
        const endpoint: string = `/v5/market/kline?category=${encodeURIComponent(category)}&symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${batchLimit}${endParam}`;
        const { data } = await fetchBybitJson<{ result?: { list?: string[][] } }>(endpoint, 15000);
        const list: string[][] = data?.result?.list ?? [];
        if (list.length === 0) break;

        collected.push(...list);
        const oldestTimestamp = Number(list[list.length - 1][0]);
        if (!Number.isFinite(oldestTimestamp)) break;
        endCursor = oldestTimestamp - 1;
        pages++;
        if (list.length < batchLimit) break;
      }

      const byTs = new Map<number, string[]>();
      for (const row of collected) {
        const ts = Number(row[0]);
        if (Number.isFinite(ts)) byTs.set(ts, row);
      }
      const sorted = Array.from(byTs.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, row]) => row);

      res.json({
        retCode: 0,
        result: {
          category,
          symbol,
          interval,
          count: sorted.length,
          list: sorted,
        },
      });
    } catch (err) {
      res.status(502).json({
        retCode: -1,
        retMsg: err instanceof Error ? err.message : 'Failed to fetch historical range',
      });
    }
  });

  app.get('/api/bybit/orderbook', async (req, res) => {
    const category = String(req.query.category || 'linear');
    const symbol = String(req.query.symbol || 'SOLUSDT');
    const limit = Math.min(50, Math.max(5, Number(req.query.limit || 25)));
    try {
      const endpoint = `/v5/market/orderbook?category=${encodeURIComponent(category)}&symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
      const result = await fetchBybitJson<Record<string, unknown>>(endpoint, 1000);
      res.json({ ...result.data, _meta: { latencyMs: result.latencyMs, host: result.host } });
    } catch (err) {
      res.status(502).json({
        retCode: -1,
        retMsg: err instanceof Error ? err.message : 'Upstream error',
      });
    }
  });

  // =========================================================================
  // Direct Private Bybit v5 Trading Endpoints
  // =========================================================================

  const parseRequestedEnv = (raw: unknown): BybitEnv => {
    if (raw === 'mainnet' || raw === 'live' || raw === 'real') return 'mainnet';
    if (raw === 'testnet') return 'testnet';
    if (raw === 'demo') return 'demo';
    return serverBot.getPrivateEnv();
  };

  app.get('/api/bybit/private/status', (_req, res) => {
    const cfg = getBybitEnvConfig(serverBot.getPrivateEnv());
    res.json({
      configured: cfg.configured,
      env: cfg.env,
      baseUrl: cfg.privateBaseUrl,
      keyMask: cfg.keyMask,
      accounts: getAllBybitAccountsStatus(),
    });
  });

  app.get('/api/bybit/private/account', async (req, res) => {
    const targetEnv = parseRequestedEnv(req.query.env);
    const cfg = getBybitEnvConfig(targetEnv);
    try {
      const acct = await fetchBybitPrivateAccount(targetEnv);
      res.json({ ok: true, env: cfg.env, baseUrl: cfg.privateBaseUrl, ...acct });
    } catch (err) {
      res.status(400).json({
        ok: false,
        env: cfg.env,
        baseUrl: cfg.privateBaseUrl,
        error: err instanceof Error ? err.message : 'Account fetch error',
      });
    }
  });

  app.get('/api/bybit/private/state', async (req, res) => {
    const category = String(req.query.category || 'linear') as 'spot' | 'linear';
    const targetEnv = parseRequestedEnv(req.query.env);
    try {
      const state = await fetchBybitPrivateState(category, targetEnv);
      res.json({ ok: true, env: targetEnv, ...state });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'State fetch error',
      });
    }
  });

  app.post('/api/bybit/private/order', async (req, res) => {
    try {
      const payload = req.body as Partial<PrivateOrderPayload>;
      if (
        !payload ||
        typeof payload.symbol !== 'string' ||
        !/^[A-Z0-9]{4,20}$/.test(payload.symbol) ||
        (payload.side !== 'Buy' && payload.side !== 'Sell') ||
        (payload.category !== 'linear' && payload.category !== 'spot')
      ) {
        res.status(400).json({ ok: false, error: 'Nieprawidłowe parametry zlecenia giełdowego.' });
        return;
      }
      const safeLeverage =
        payload.leverage !== undefined
          ? Math.min(10, Math.max(1, Math.round(Number(payload.leverage) || 1)))
          : undefined;
      const result = await placeBybitOrder(
        { ...(payload as PrivateOrderPayload), leverage: safeLeverage },
        serverBot.getPrivateEnv()
      );
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Order creation failed',
      });
    }
  });

  app.post('/api/bybit/private/cancel', async (req, res) => {
    try {
      const { category = 'linear', symbol, orderId } = req.body as {
        category: 'spot' | 'linear';
        symbol: string;
        orderId: string;
      };
      if (!symbol || !orderId || (category !== 'linear' && category !== 'spot')) {
        res.status(400).json({ ok: false, error: 'Brak wymaganych parametrów do anulowania zlecenia.' });
        return;
      }
      const result = await cancelBybitOrder(category, symbol, orderId, serverBot.getPrivateEnv());
      res.json({ ok: true, result });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Order cancel failed',
      });
    }
  });

  app.post('/api/bybit/private/kill-switch', async (_req, res) => {
    try {
      const result = await triggerBybitKillSwitch(serverBot.getPrivateEnv());
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Kill switch failed',
      });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  const httpServer = app.listen(port, '0.0.0.0', () => {
    const envCfg = getBybitEnvConfig();
    console.log(
      `ScalpEngine 24/7 server listening on http://0.0.0.0:${port} (Bybit Private Env: ${envCfg.env.toUpperCase()}, API Keys: ${envCfg.configured ? 'CONFIGURED' : 'NOT SET'})`
    );
  });

  let shuttingDown = false;
  const handleShutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`ScalpEngine received ${signal} — flushing bot state to disk...`);
    serverBot.flushPersistNow();
    httpServer.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 2500).unref();
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

startServer();
