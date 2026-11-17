import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { serverBot } from './serverBot';
import {
  cancelBybitOrder,
  fetchBybitJson,
  fetchBybitPrivateAccount,
  fetchBybitPrivateState,
  getBybitEnvConfig,
  getBybitNetworkDiagnostics,
  placeBybitOrder,
  triggerBybitKillSwitch,
  type PrivateOrderPayload,
} from './serverBybit';
import type { ExecutionMode, StrategyConfig } from './src/engine/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(express.json());

  // Start autonomous 24/7 server-side trading engine immediately
  serverBot.start();

  // Public health endpoint
  app.get('/api/health', async (_req, res) => {
    const netDiag = getBybitNetworkDiagnostics();
    const envCfg = getBybitEnvConfig();
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
        serverDaemon: true,
        networkDiagnostics: { ...netDiag, activePublicHost: result.host },
      });
    } catch (err) {
      res.status(502).json({
        ok: false,
        privateEnv: envCfg.env,
        privateConfigured: envCfg.configured,
        serverDaemon: true,
        networkDiagnostics: netDiag,
        error: err instanceof Error ? err.message : 'Bybit unreachable',
      });
    }
  });

  // =========================================================================
  // 24/7 Autonomous Bot Daemon Control & Telemetry API
  // =========================================================================

  app.get('/api/bot/state', (_req, res) => {
    res.json({ ok: true, ...serverBot.getSnapshot() });
  });

  app.post('/api/bot/config', (req, res) => {
    const { config, logMessage } = req.body as {
      config?: StrategyConfig;
      logMessage?: string;
    };
    if (!config || !Array.isArray(config.activePairs)) {
      res.status(400).json({ ok: false, error: 'Nieprawidłowy obiekt konfiguracji strategii.' });
      return;
    }
    serverBot.updateConfig(config, logMessage);
    res.json({ ok: true, ...serverBot.getSnapshot() });
  });

  app.post('/api/bot/mode', async (req, res) => {
    const { mode } = req.body as { mode?: ExecutionMode };
    if (mode !== 'paper' && mode !== 'exchange') {
      res.status(400).json({ ok: false, error: 'Nieprawidłowy tryb egzekucji.' });
      return;
    }
    const result = await serverBot.setExecutionMode(mode);
    res.status(result.ok ? 200 : 400).json({
      ...result,
      ...serverBot.getSnapshot(),
    });
  });

  app.post('/api/bot/control', async (req, res) => {
    const { action, base } = req.body as {
      action?: string;
      base?: string;
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
        const paused = serverBot.togglePausePair(base);
        res.json({ ok: true, paused, ...serverBot.getSnapshot() });
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

  app.get('/api/bybit/private/status', (_req, res) => {
    const cfg = getBybitEnvConfig();
    res.json({
      configured: cfg.configured,
      env: cfg.env,
      baseUrl: cfg.privateBaseUrl,
      keyMask: cfg.keyMask,
    });
  });

  app.get('/api/bybit/private/account', async (_req, res) => {
    try {
      const acct = await fetchBybitPrivateAccount();
      res.json({ ok: true, ...acct });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Account fetch error',
      });
    }
  });

  app.get('/api/bybit/private/state', async (req, res) => {
    const category = String(req.query.category || 'linear') as 'spot' | 'linear';
    try {
      const state = await fetchBybitPrivateState(category);
      res.json({ ok: true, ...state });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'State fetch error',
      });
    }
  });

  app.post('/api/bybit/private/order', async (req, res) => {
    try {
      const result = await placeBybitOrder(req.body as PrivateOrderPayload);
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
      const result = await cancelBybitOrder(category, symbol, orderId);
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
      const result = await triggerBybitKillSwitch();
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
  app.listen(port, '0.0.0.0', () => {
    const envCfg = getBybitEnvConfig();
    console.log(
      `ScalpEngine 24/7 server listening on http://0.0.0.0:${port} (Bybit Private Env: ${envCfg.env.toUpperCase()}, API Keys: ${envCfg.configured ? 'CONFIGURED' : 'NOT SET'})`
    );
  });
}

startServer();
