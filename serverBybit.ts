import crypto from 'crypto';

export const PUBLIC_BYBIT_HOSTS = ['https://api.bybit.com', 'https://api.bytick.com'];

export type BybitEnv = 'demo' | 'testnet' | 'mainnet';

export interface BybitEnvConfig {
  env: BybitEnv;
  privateBaseUrl: string;
  apiKey: string;
  apiSecret: string;
  configured: boolean;
  keyMask: string | null;
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

  let lastError: unknown = null;
  for (const host of PUBLIC_BYBIT_HOSTS) {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${host}${endpointPath}`, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ScalpEngine/1.0',
        },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from ${host}`);
      }
      const json = (await res.json()) as { retCode?: number; retMsg?: string } & T;
      if (typeof json.retCode === 'number' && json.retCode !== 0) {
        throw new Error(`Bybit retCode ${json.retCode}: ${json.retMsg || 'Unknown error'}`);
      }
      const latencyMs = Date.now() - start;
      cache.set(endpointPath, { data: json, expiresAt: Date.now() + cacheTtlMs });
      return { data: json as T, latencyMs, host };
    } catch (err) {
      lastError = err;
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
  const recvWindow = '5000';

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const res = await fetch(url, {
    method,
    signal: controller.signal,
    headers: {
      'X-BAPI-API-KEY': cfg.apiKey,
      'X-BAPI-SIGN': signature,
      'X-BAPI-SIGN-TYPE': '2',
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': recvWindow,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: method === 'POST' ? bodyString : undefined,
  });
  clearTimeout(timeout);

  const json = (await res.json()) as { retCode?: number; retMsg?: string; result?: T };
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${json.retMsg || 'Bybit error'}`);
  }
  if (typeof json.retCode === 'number' && json.retCode !== 0) {
    throw new Error(`Bybit [${json.retCode}]: ${json.retMsg || 'Unknown error'}`);
  }
  return json as unknown as T;
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
