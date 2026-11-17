import crypto from 'crypto';
import { ProxyAgent, fetch as undiciFetch, type Dispatcher } from 'undici';

export const PUBLIC_BYBIT_HOSTS = ['https://api.bybit.com', 'https://api.bytick.com'];

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export type BybitEnv = 'demo' | 'testnet' | 'mainnet';

export interface BybitEnvConfig {
  env: BybitEnv;
  privateBaseUrl: string;
  apiKey: string;
  apiSecret: string;
  configured: boolean;
  keyMask: string | null;
}

export interface BybitNetworkDiagnostics {
  proxyConfigured: boolean;
  railwayRegion: string | null;
  activePublicHost: string | null;
  blockedHosts: string[];
}

export function getBybitEnvConfig(): BybitEnvConfig {
  const rawEnv = String(process.env.BYBIT_ENV || 'demo').toLowerCase();
  const env: BybitEnv =
    rawEnv === 'mainnet' ? 'mainnet' : rawEnv === 'testnet' ? 'testnet' : 'demo';

  const privateBaseUrl =
    env === 'demo'
      ? 'https://api-demo.bybit.com'
      : env === 'testnet'
        ? 'https://api-testnet.bybit.com'
        : 'https://api.bybit.com';

  const apiKey = (process.env.BYBIT_API_KEY || '').trim();
  const apiSecret = (process.env.BYBIT_API_SECRET || '').trim();
  const configured = apiKey.length > 0 && apiSecret.length > 0;
  const keyMask = configured ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : null;

  return {
    env,
    privateBaseUrl,
    apiKey,
    apiSecret,
    configured,
    keyMask,
  };
}

let cachedProxyUrl = '';
let cachedProxyAgent: Dispatcher | undefined;

function getProxyDispatcher(): Dispatcher | undefined {
  const proxyUrl = (
    process.env.BYBIT_PROXY_URL ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    ''
  ).trim();

  if (!proxyUrl) {
    cachedProxyUrl = '';
    cachedProxyAgent = undefined;
    return undefined;
  }

  if (proxyUrl !== cachedProxyUrl || !cachedProxyAgent) {
    cachedProxyUrl = proxyUrl;
    cachedProxyAgent = new ProxyAgent(proxyUrl);
  }
  return cachedProxyAgent;
}

const hostCooldownUntil = new Map<string, number>();
let lastWorkingPublicHost: string | null = null;

function getPublicBybitHosts(): string[] {
  const envCfg = getBybitEnvConfig();
  const customHost = (process.env.BYBIT_PUBLIC_HOST || '').trim().replace(/\/+$/, '');
  const baseHosts: string[] = [];

  if (customHost) baseHosts.push(customHost);
  if (envCfg.env === 'testnet') {
    baseHosts.push('https://api-testnet.bybit.com', 'https://api.bybit.com', 'https://api.bytick.com');
  } else if (envCfg.env === 'demo') {
    baseHosts.push('https://api.bybit.com', 'https://api.bytick.com', 'https://api-demo.bybit.com');
  } else {
    baseHosts.push('https://api.bybit.com', 'https://api.bytick.com');
  }

  const unique = Array.from(new Set(baseHosts));
  const now = Date.now();
  const healthy = unique.filter((h) => (hostCooldownUntil.get(h) || 0) <= now);
  const cooled = unique.filter((h) => (hostCooldownUntil.get(h) || 0) > now);

  if (lastWorkingPublicHost && healthy.includes(lastWorkingPublicHost)) {
    return [
      lastWorkingPublicHost,
      ...healthy.filter((h) => h !== lastWorkingPublicHost),
      ...cooled,
    ];
  }
  return [...healthy, ...cooled];
}

export function getBybitNetworkDiagnostics(): BybitNetworkDiagnostics {
  const now = Date.now();
  const blockedHosts = Array.from(hostCooldownUntil.entries())
    .filter(([, until]) => until > now)
    .map(([host]) => host);

  return {
    proxyConfigured: Boolean(getProxyDispatcher()),
    railwayRegion:
      process.env.RAILWAY_REGION || process.env.RAILWAY_REPLICA_REGION || null,
    activePublicHost: lastWorkingPublicHost,
    blockedHosts,
  };
}

function formatBybitHttpError(status: number, host: string, rawText: string): string {
  const lower = rawText.toLowerCase();
  if (status === 403 || lower.includes('cloudfront') || lower.includes('access denied')) {
    const region = process.env.RAILWAY_REGION || process.env.RAILWAY_REPLICA_REGION;
    const regionHint = region ? ` [region: ${region}]` : '';
    return `HTTP 403 z ${host}${regionHint} — blokada CloudFront/geo-IP (w Railway przełącz Deploy Region na EU West / Singapore lub ustaw BYBIT_PROXY_URL).`;
  }
  const cleanSnippet = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
  return cleanSnippet ? `HTTP ${status} from ${host}: ${cleanSnippet}` : `HTTP ${status} from ${host}`;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

export async function fetchBybitJson<T>(
  endpointPath: string,
  cacheTtlMs = 2000
): Promise<{ data: T; latencyMs: number; host: string }> {
  const now = Date.now();
  const cached = cache.get(endpointPath);
  if (cached && cached.expiresAt > now) {
    return { data: cached.data as T, latencyMs: 1, host: 'cache' };
  }

  const hosts = getPublicBybitHosts();
  const dispatcher = getProxyDispatcher();
  let lastError: unknown = null;

  for (const host of hosts) {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await undiciFetch(`${host}${endpointPath}`, {
        signal: controller.signal,
        dispatcher,
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': BROWSER_USER_AGENT,
        },
      });
      const rawText = await res.text();

      if (!res.ok) {
        if (res.status === 403 || res.status >= 500) {
          hostCooldownUntil.set(host, Date.now() + 60000);
        }
        throw new Error(formatBybitHttpError(res.status, host, rawText));
      }

      let json: { retCode?: number; retMsg?: string } & T;
      try {
        json = JSON.parse(rawText) as { retCode?: number; retMsg?: string } & T;
      } catch {
        throw new Error(`Nieprawidłowa odpowiedź JSON z ${host}`);
      }

      if (typeof json.retCode === 'number' && json.retCode !== 0) {
        throw new Error(`Bybit retCode ${json.retCode}: ${json.retMsg || 'Unknown error'}`);
      }

      hostCooldownUntil.delete(host);
      lastWorkingPublicHost = host;
      const latencyMs = Date.now() - start;
      cache.set(endpointPath, { data: json, expiresAt: Date.now() + cacheTtlMs });
      return { data: json as T, latencyMs, host };
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Failed to fetch from Bybit API');
}

export async function signedBybitRequest<T>(
  method: 'GET' | 'POST',
  apiPath: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const cfg = getBybitEnvConfig();
  if (!cfg.configured) {
    throw new Error('Brak kluczy BYBIT_API_KEY / BYBIT_API_SECRET w zmiennych środowiskowych (.env).');
  }

  const timestamp = Date.now().toString();
  const recvWindow = (process.env.BYBIT_RECV_WINDOW || '5000').trim() || '5000';

  let queryString = '';
  let bodyString = '';
  if (method === 'GET') {
    const entries = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    queryString = entries.join('&');
  } else {
    bodyString = JSON.stringify(params);
  }

  const preSignPayload =
    method === 'GET'
      ? `${timestamp}${cfg.apiKey}${recvWindow}${queryString}`
      : `${timestamp}${cfg.apiKey}${recvWindow}${bodyString}`;

  const signature = crypto
    .createHmac('sha256', cfg.apiSecret)
    .update(preSignPayload)
    .digest('hex');

  const url = `${cfg.privateBaseUrl}${apiPath}${queryString ? `?${queryString}` : ''}`;
  const dispatcher = getProxyDispatcher();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await undiciFetch(url, {
      method,
      signal: controller.signal,
      dispatcher,
      headers: {
        'X-BAPI-API-KEY': cfg.apiKey,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': recvWindow,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': BROWSER_USER_AGENT,
      },
      body: method === 'POST' ? bodyString : undefined,
    });

    const rawText = await res.text();
    let json: { retCode?: number; retMsg?: string; result?: T } | null = null;
    try {
      json = JSON.parse(rawText) as { retCode?: number; retMsg?: string; result?: T };
    } catch {
      json = null;
    }

    if (!res.ok) {
      if (json?.retMsg) {
        throw new Error(`HTTP ${res.status}: ${json.retMsg}`);
      }
      throw new Error(formatBybitHttpError(res.status, cfg.privateBaseUrl, rawText));
    }

    if (!json) {
      throw new Error(`Nieprawidłowa odpowiedź z ${cfg.privateBaseUrl}`);
    }

    if (typeof json.retCode === 'number' && json.retCode !== 0) {
      throw new Error(`Bybit [${json.retCode}]: ${json.retMsg || 'Unknown error'}`);
    }
    return json as unknown as T;
  } finally {
    clearTimeout(timeout);
  }
}

export interface InstrumentFilters {
  tickSize: string;
  qtyStep: string;
  minOrderQty: string;
}

function decimalsFromStep(stepStr: string): number {
  if (!stepStr.includes('.')) return 0;
  const trimmed = stepStr.replace(/0+$/, '');
  const idx = trimmed.indexOf('.');
  return idx === -1 ? 0 : trimmed.length - idx - 1;
}

export function roundToStep(
  value: number,
  stepStr: string,
  mode: 'floor' | 'round' = 'floor'
): string {
  const step = Number(stepStr);
  if (!Number.isFinite(step) || step <= 0) return String(value);
  const decimals = decimalsFromStep(stepStr);
  const factor = Math.pow(10, decimals);
  const scaledStep = Math.round(step * factor);
  const scaledVal = value * factor;
  const stepsCount =
    mode === 'floor' ? Math.floor(scaledVal / scaledStep) : Math.round(scaledVal / scaledStep);
  const result = (stepsCount * scaledStep) / factor;
  return result.toFixed(decimals);
}

export async function getInstrumentFilters(
  category: 'spot' | 'linear',
  symbol: string
): Promise<InstrumentFilters> {
  const endpoint = `/v5/market/instruments-info?category=${encodeURIComponent(category)}&symbol=${encodeURIComponent(symbol)}`;
  const { data } = await fetchBybitJson<{
    result?: {
      list?: Array<{
        priceFilter?: { tickSize?: string };
        lotSizeFilter?: {
          qtyStep?: string;
          basePrecision?: string;
          minOrderQty?: string;
        };
      }>;
    };
  }>(endpoint, 60000);

  const info = data?.result?.list?.[0];
  const tickSize = info?.priceFilter?.tickSize || '0.01';
  const qtyStep =
    info?.lotSizeFilter?.qtyStep || info?.lotSizeFilter?.basePrecision || '0.001';
  const minOrderQty = info?.lotSizeFilter?.minOrderQty || qtyStep;
  return { tickSize, qtyStep, minOrderQty };
}

export interface PrivateOrderPayload {
  category: 'spot' | 'linear';
  symbol: string;
  side: 'Buy' | 'Sell';
  orderType: 'Limit' | 'Market';
  qtyUsd?: number;
  qtyBase?: number;
  price?: number;
  postOnly?: boolean;
  leverage?: number;
  isSpotMargin?: boolean;
  tpPrice?: number;
  slPrice?: number;
  reduceOnly?: boolean;
}

export async function placeBybitOrder(body: PrivateOrderPayload): Promise<{
  orderId?: string;
  orderLinkId?: string;
  symbol: string;
  category: 'spot' | 'linear';
  side: 'Buy' | 'Sell';
  orderType: 'Limit' | 'Market';
  qty: string;
  price: string | number;
}> {
  const {
    category = 'linear',
    symbol,
    side,
    orderType = 'Limit',
    qtyUsd,
    qtyBase,
    price,
    postOnly = true,
    leverage,
    isSpotMargin = false,
    tpPrice,
    slPrice,
    reduceOnly = false,
  } = body;

  if (!symbol || !side) {
    throw new Error('Brak wymaganego symbolu lub kierunku zlecenia.');
  }

  const filters = await getInstrumentFilters(category, symbol);

  if (category === 'linear' && !reduceOnly && leverage && leverage >= 1) {
    try {
      await signedBybitRequest('POST', '/v5/position/set-leverage', {
        category: 'linear',
        symbol,
        buyLeverage: String(leverage),
        sellLeverage: String(leverage),
      });
    } catch (levErr) {
      const msg = levErr instanceof Error ? levErr.message : '';
      if (!msg.includes('110043')) {
        console.warn('Set leverage note:', msg);
      }
    }
  }

  let referencePrice = Number(price || 0);
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
    const { data: tickData } = await fetchBybitJson<{
      result?: { list?: Array<{ lastPrice?: string }> };
    }>(`/v5/market/tickers?category=${category}&symbol=${encodeURIComponent(symbol)}`, 500);
    referencePrice = Number(tickData?.result?.list?.[0]?.lastPrice || 0);
  }

  let rawQty = Number(qtyBase || 0);
  if ((!Number.isFinite(rawQty) || rawQty <= 0) && qtyUsd && referencePrice > 0) {
    rawQty = qtyUsd / referencePrice;
  }
  if (!Number.isFinite(rawQty) || rawQty <= 0) {
    throw new Error('Nieprawidłowa ilość zlecenia.');
  }

  const minQty = Number(filters.minOrderQty);
  const formattedQty = roundToStep(Math.max(rawQty, minQty), filters.qtyStep, 'floor');

  const orderPayload: Record<string, unknown> = {
    category,
    symbol,
    side,
    orderType,
    qty: formattedQty,
  };

  if (category === 'spot') {
    if (orderType === 'Market') {
      orderPayload.marketUnit = 'baseCoin';
    }
    if (isSpotMargin) {
      orderPayload.isLeverage = 1;
    }
  }

  if (orderType === 'Limit') {
    orderPayload.price = roundToStep(referencePrice, filters.tickSize, 'round');
    orderPayload.timeInForce = postOnly ? 'PostOnly' : 'GTC';
  } else {
    orderPayload.timeInForce = 'IOC';
  }

  if (category === 'linear') {
    if (reduceOnly) {
      orderPayload.reduceOnly = true;
    } else {
      if (tpPrice && Number.isFinite(tpPrice) && tpPrice > 0) {
        orderPayload.takeProfit = roundToStep(tpPrice, filters.tickSize, 'round');
        orderPayload.tpTriggerBy = 'LastPrice';
      }
      if (slPrice && Number.isFinite(slPrice) && slPrice > 0) {
        orderPayload.stopLoss = roundToStep(slPrice, filters.tickSize, 'round');
        orderPayload.slTriggerBy = 'LastPrice';
      }
    }
  }

  const createRes = await signedBybitRequest<{
    result?: { orderId?: string; orderLinkId?: string };
  }>('POST', '/v5/order/create', orderPayload);

  return {
    orderId: createRes.result?.orderId,
    orderLinkId: createRes.result?.orderLinkId,
    symbol,
    category,
    side,
    orderType,
    qty: formattedQty,
    price: (orderPayload.price as string | undefined) ?? referencePrice,
  };
}

export async function fetchBybitPrivateAccount(): Promise<{
  equity: number;
  availableBalance: number;
  walletBalance: number;
  unrealizedPnl: number;
  coins: Array<Record<string, string>>;
}> {
  const data = await signedBybitRequest<{
    result?: {
      list?: Array<{
        totalEquity?: string;
        totalAvailableBalance?: string;
        totalWalletBalance?: string;
        totalPerpUPL?: string;
        coin?: Array<Record<string, string>>;
      }>;
    };
  }>('GET', '/v5/account/wallet-balance', { accountType: 'UNIFIED' });

  const acct = data.result?.list?.[0];
  return {
    equity: Number(acct?.totalEquity || 0),
    availableBalance: Number(acct?.totalAvailableBalance || acct?.totalWalletBalance || 0),
    walletBalance: Number(acct?.totalWalletBalance || 0),
    unrealizedPnl: Number(acct?.totalPerpUPL || 0),
    coins: acct?.coin ?? [],
  };
}

export interface RawBybitOrder {
  orderId: string;
  symbol: string;
  side: string;
  orderType: string;
  price: string;
  qty: string;
  cumExecQty: string;
  orderStatus: string;
  timeInForce: string;
  createdTime: string;
  takeProfit?: string;
  stopLoss?: string;
}

export async function fetchBybitPrivateState(category: 'spot' | 'linear'): Promise<{
  orders: RawBybitOrder[];
  positions: Array<Record<string, string>>;
}> {
  const [ordersSettled, positionsSettled] = await Promise.all([
    category === 'linear'
      ? Promise.allSettled([
          signedBybitRequest<{ result?: { list?: RawBybitOrder[] } }>('GET', '/v5/order/realtime', {
            category: 'linear',
            settleCoin: 'USDT',
          }),
          signedBybitRequest<{ result?: { list?: RawBybitOrder[] } }>('GET', '/v5/order/realtime', {
            category: 'linear',
            settleCoin: 'USDC',
          }),
        ])
      : Promise.allSettled([
          signedBybitRequest<{ result?: { list?: RawBybitOrder[] } }>('GET', '/v5/order/realtime', {
            category: 'spot',
            openOnly: 0,
          }),
        ]),
    category === 'linear'
      ? Promise.allSettled([
          signedBybitRequest<{
            result?: { list?: Array<Record<string, string>> };
          }>('GET', '/v5/position/list', { category: 'linear', settleCoin: 'USDT' }),
          signedBybitRequest<{
            result?: { list?: Array<Record<string, string>> };
          }>('GET', '/v5/position/list', { category: 'linear', settleCoin: 'USDC' }),
        ])
      : Promise.resolve([]),
  ]);

  const rawOrders: RawBybitOrder[] = [];
  let orderError: string | null = null;
  for (const o of ordersSettled) {
    if (o.status === 'fulfilled') {
      rawOrders.push(...(o.value.result?.list ?? []));
    } else {
      orderError = o.reason instanceof Error ? o.reason.message : String(o.reason);
    }
  }

  const rawPositions: Array<Record<string, string>> = [];
  for (const p of positionsSettled) {
    if (p.status === 'fulfilled') {
      const list = p.value.result?.list ?? [];
      for (const row of list) {
        if (Number(row.size || 0) > 0) rawPositions.push(row);
      }
    }
  }

  if (
    rawOrders.length === 0 &&
    rawPositions.length === 0 &&
    orderError &&
    ordersSettled.every((r) => r.status === 'rejected')
  ) {
    throw new Error(orderError);
  }

  return { orders: rawOrders, positions: rawPositions };
}

export async function cancelBybitOrder(
  category: 'spot' | 'linear',
  symbol: string,
  orderId: string
): Promise<unknown> {
  return signedBybitRequest('POST', '/v5/order/cancel', {
    category,
    symbol,
    orderId,
  });
}

export async function triggerBybitKillSwitch(): Promise<{
  cancelled: string[];
  closed: string[];
}> {
  const cancelled: string[] = [];
  const closed: string[] = [];

  for (const reqParams of [
    { category: 'linear', settleCoin: 'USDT' },
    { category: 'linear', settleCoin: 'USDC' },
    { category: 'spot' },
  ]) {
    try {
      await signedBybitRequest('POST', '/v5/order/cancel-all', reqParams);
      cancelled.push(reqParams.category + (reqParams.settleCoin ? `:${reqParams.settleCoin}` : ''));
    } catch {
      // ignore empty categories
    }
  }

  for (const settleCoin of ['USDT', 'USDC']) {
    try {
      const posRes = await signedBybitRequest<{
        result?: { list?: Array<Record<string, string>> };
      }>('GET', '/v5/position/list', { category: 'linear', settleCoin });

      const list = posRes.result?.list ?? [];
      for (const pos of list) {
        const size = Number(pos.size || 0);
        if (size <= 0) continue;
        const closeSide = pos.side === 'Buy' ? 'Sell' : 'Buy';
        await signedBybitRequest('POST', '/v5/order/create', {
          category: 'linear',
          symbol: pos.symbol,
          side: closeSide,
          orderType: 'Market',
          qty: pos.size,
          reduceOnly: true,
          timeInForce: 'IOC',
        });
        closed.push(`${pos.symbol} (${pos.size})`);
      }
    } catch {
      // ignore
    }
  }

  return { cancelled, closed };
}

export interface RawBybitClosedPnl {
  symbol: string;
  orderId: string;
  side: string; // closing order side: Sell = closed LONG, Buy = closed SHORT
  qty: string;
  orderPrice: string;
  orderType: string;
  execType: string;
  closedSize: string;
  cumEntryValue: string;
  avgEntryPrice: string;
  cumExitValue: string;
  avgExitPrice: string;
  closedPnl: string;
  fillCount: string;
  leverage: string;
  openFee?: string;
  closeFee?: string;
  createdTime: string;
  updatedTime: string;
}

export async function fetchBybitClosedPnl(days = 28): Promise<RawBybitClosedPnl[]> {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000 - 60_000;
  const weeks = Math.max(1, Math.min(8, Math.ceil(days / 7)));

  const windows: Array<{ startTime: number; endTime: number }> = [];
  for (let w = 0; w < weeks; w++) {
    const endTime = now - w * weekMs;
    const startTime = endTime - weekMs;
    windows.push({ startTime, endTime });
  }

  const results = await Promise.allSettled(
    windows.map((win) =>
      signedBybitRequest<{ result?: { list?: RawBybitClosedPnl[] } }>(
        'GET',
        '/v5/position/closed-pnl',
        {
          category: 'linear',
          startTime: win.startTime,
          endTime: win.endTime,
          limit: 100,
        }
      )
    )
  );

  const byId = new Map<string, RawBybitClosedPnl>();
  for (const res of results) {
    if (res.status !== 'fulfilled') continue;
    for (const row of res.value.result?.list ?? []) {
      const key = `${row.orderId}-${row.updatedTime}`;
      if (!byId.has(key)) {
        byId.set(key, row);
      }
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => Number(b.updatedTime || 0) - Number(a.updatedTime || 0)
  );
}

