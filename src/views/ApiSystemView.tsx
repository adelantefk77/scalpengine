import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Cpu,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import { useBot } from '../engine/botContext';
import { formatTimeHms, formatUsd } from '../engine/format';

export const ApiSystemView: React.FC = () => {
  const {
    wsStatus,
    config,
    botState,
    executionMode,
    setExecutionMode,
    privateStatus,
    privateAccount,
    serverStartedAt,
    serverLastMarketSyncAt,
    serverMarketError,
    networkDiagnostics,
    refreshPrivateAccount,
    refreshMarketData,
    resetPaperAccount,
    showToast,
  } = useBot();

  const [healthInfo, setHealthInfo] = useState<{
    ok: boolean;
    bybitLatencyMs?: number;
    bybitHost?: string;
    error?: string;
  } | null>(null);
  const [testingHealth, setTestingHealth] = useState(false);
  const [testingPrivate, setTestingPrivate] = useState(false);

  const testHealth = async () => {
    setTestingHealth(true);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealthInfo(data);
      await refreshMarketData();
      showToast(
        data.ok
          ? `Połączenie z Bybit v5 REST zweryfikowane (${data.bybitLatencyMs}ms).`
          : `Błąd Bybit REST: ${data.error}`,
        data.ok ? 'success' : 'error'
      );
    } catch (err) {
      setHealthInfo({ ok: false, error: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setTestingHealth(false);
    }
  };

  const testPrivateConnection = async () => {
    setTestingPrivate(true);
    try {
      const ok = await refreshPrivateAccount();
      showToast(
        ok
          ? `Połączenie Bybit ${privateStatus.env.toUpperCase()} API OK (Saldo zweryfikowane).`
          : 'Nie udało się połączyć z Bybit Private API — sprawdź klucze w .env.',
        ok ? 'success' : 'error'
      );
    } finally {
      setTestingPrivate(false);
    }
  };

  const envUpper = privateStatus.env.toUpperCase();

  return (
    <div className="flex flex-col w-full gap-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface-container-low p-4 rounded-xl border border-white/5">
        <div>
          <h1 className="font-display text-xl font-bold text-on-surface">API i System Bybit v5</h1>
          <p className="text-xs text-on-surface-variant">
            Diagnostyka połączeń WebSocket/REST, integracja Bybit {envUpper} Trading oraz zarządzanie trybem egzekucji.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={testHealth}
            disabled={testingHealth}
            className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container hover:bg-primary font-display text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testingHealth ? 'animate-spin' : ''}`} />
            <span>Testuj Public REST</span>
          </button>
          <button
            type="button"
            onClick={testPrivateConnection}
            disabled={testingPrivate}
            className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-display text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap border border-white/10"
          >
            <KeyRound className={`w-3.5 h-3.5 text-tertiary ${testingPrivate ? 'animate-spin' : ''}`} />
            <span>Sprawdź Klucz {envUpper}</span>
          </button>
        </div>
      </div>

      {/* Private Demo Trading Integration Card */}
      <div className="bg-surface-container-low p-5 rounded-xl border border-white/5 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
                privateStatus.configured
                  ? 'bg-tertiary-container/20 border-tertiary/30 text-tertiary'
                  : 'bg-primary-container/15 border-primary/30 text-primary'
              }`}
            >
              {privateStatus.configured ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <ShieldAlert className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-base font-bold text-on-surface">
                  Bybit {envUpper} Trading API (Server-Side HMAC-SHA256)
                </h2>
                <span
                  className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase ${
                    privateStatus.configured
                      ? 'bg-tertiary-container/20 text-tertiary'
                      : 'bg-error-container/30 text-error'
                  }`}
                >
                  {privateStatus.configured ? `Klucze Aktywne (${privateStatus.keyMask})` : 'Brak Kluczy w .env'}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Endpoint prywatny: <span className="font-mono text-on-surface">{privateStatus.baseUrl}</span>{' '}
                (dane rynkowe pobierane równolegle z Mainnet WebSocket/REST).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void setExecutionMode('paper')}
              className={`px-3.5 py-2 rounded-lg font-mono text-xs font-bold uppercase transition-colors ${
                executionMode === 'paper'
                  ? 'bg-primary-container text-on-primary-container'
                  : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Tryb Paper
            </button>
            <button
              type="button"
              onClick={() => void setExecutionMode('exchange')}
              className={`px-3.5 py-2 rounded-lg font-mono text-xs font-bold uppercase transition-colors ${
                executionMode === 'exchange'
                  ? 'bg-tertiary text-on-tertiary'
                  : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Tryb Bybit {envUpper}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Live Unified Demo Account Summary */}
          <div className="bg-surface-container-lowest p-4 rounded-lg border border-white/5 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                Konto Unified Trading ({envUpper})
              </span>
              <span className="font-mono text-[10px] text-on-surface-variant tabular-nums">
                {privateAccount.updatedAt ? `Sync: ${formatTimeHms(privateAccount.updatedAt)}` : 'Oczekuje na synchronizację'}
              </span>
            </div>

            {privateAccount.error && (
              <div className="px-3 py-2 rounded bg-error-container/25 border border-error/30 font-mono text-[11px] text-error break-words">
                {privateAccount.error}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div>
                <div className="font-mono text-[10px] text-on-surface-variant uppercase">Total Equity</div>
                <div className="font-mono text-sm font-bold text-on-surface tabular-nums mt-0.5">
                  {privateStatus.configured ? formatUsd(privateAccount.equity) : '—'}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-on-surface-variant uppercase">Dostępne</div>
                <div className="font-mono text-sm font-bold text-tertiary tabular-nums mt-0.5">
                  {privateStatus.configured ? formatUsd(privateAccount.availableBalance) : '—'}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-on-surface-variant uppercase">Wallet Bal.</div>
                <div className="font-mono text-sm font-bold text-on-surface tabular-nums mt-0.5">
                  {privateStatus.configured ? formatUsd(privateAccount.walletBalance) : '—'}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-on-surface-variant uppercase">Perp uPnL</div>
                <div
                  className={`font-mono text-sm font-bold tabular-nums mt-0.5 ${
                    privateAccount.unrealizedPnl >= 0 ? 'text-tertiary' : 'text-error'
                  }`}
                >
                  {privateStatus.configured ? formatUsd(privateAccount.unrealizedPnl, true) : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* .env Setup Instructions (no client-side secret inputs) */}
          <div className="bg-surface-container-lowest p-4 rounded-lg border border-white/5 flex flex-col gap-2">
            <div className="font-mono text-[10px] uppercase tracking-wider text-primary font-bold">
              Konfiguracja sekretów (.env lub Railway Variables)
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Klucze API przechowywane są wyłącznie po stronie serwera. Wygeneruj klucz w panelu{' '}
              <strong className="text-on-surface">Bybit → Demo Trading → API Management</strong> i ustaw zmienne w{' '}
              <code className="font-mono text-on-surface bg-surface-container-high px-1 py-0.5 rounded">.env</code> lub w{' '}
              <strong className="text-on-surface">Railway → Variables</strong> (region <strong className="text-tertiary">EU West</strong>):
            </p>
            <pre className="p-2.5 rounded bg-surface-container font-mono text-[11px] text-tertiary overflow-x-auto leading-relaxed border border-white/5">
{`BYBIT_ENV="demo"
BYBIT_API_KEY="TWOJ_KLUCZ_DEMO_Z_BYBIT"
BYBIT_API_SECRET="TWOJ_SEKRET_DEMO_Z_BYBIT"
# Opcjonalnie przy błędzie HTTP 403 na Railway:
BYBIT_PROXY_URL="http://user:pass@proxy-host:port"`}
            </pre>
          </div>
        </div>
      </div>

      {/* Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-surface-container-low p-4 rounded-xl border border-white/5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase text-on-surface-variant">WebSocket Public Stream</span>
            <Wifi className={`w-4 h-4 ${wsStatus.connected ? 'text-tertiary' : 'text-primary'}`} />
          </div>
          <div className="font-mono text-base font-bold text-on-surface">
            {wsStatus.connected ? 'Connected (Live Ticks)' : 'REST Polling Fallback'}
          </div>
          <div className="font-mono text-[11px] text-on-surface-variant break-all">{wsStatus.endpoint}</div>
          <div className="flex justify-between font-mono text-[11px] pt-1 border-t border-white/5 tabular-nums">
            <span className="text-on-surface-variant">RTT Ping:</span>
            <span className="text-tertiary font-bold">{wsStatus.latencyMs || '—'} ms</span>
          </div>
          <div className="flex justify-between font-mono text-[11px] tabular-nums">
            <span className="text-on-surface-variant">Odebrane ramki:</span>
            <span className="text-on-surface">{wsStatus.messagesReceived.toLocaleString('en-US')}</span>
          </div>
        </div>

        <div className="bg-surface-container-low p-4 rounded-xl border border-white/5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase text-on-surface-variant">Autonomiczny Silnik 24/7 (Server)</span>
            <Server className={`w-4 h-4 ${serverMarketError ? 'text-error' : 'text-tertiary'}`} />
          </div>
          <div className="font-mono text-base font-bold text-on-surface">
            {serverMarketError
              ? 'Błąd sieci Bybit (Serwer)'
              : healthInfo
                ? healthInfo.ok
                  ? 'Daemon 24/7 + Bybit OK'
                  : 'Błąd REST'
                : 'Daemon 24/7 Aktywny'}
          </div>
          <div className="font-mono text-[11px] text-on-surface-variant">
            {serverMarketError ? (
              <span className="text-error break-words">{serverMarketError}</span>
            ) : (
              'Działa w tle na serwerze również po zamknięciu przeglądarki'
            )}
          </div>
          <div className="flex justify-between font-mono text-[11px] pt-1 border-t border-white/5 tabular-nums">
            <span className="text-on-surface-variant">Start / Sync świec:</span>
            <span className="text-on-surface">
              {serverStartedAt ? formatTimeHms(serverStartedAt) : '—'} /{' '}
              {serverLastMarketSyncAt ? formatTimeHms(serverLastMarketSyncAt) : '—'}
            </span>
          </div>
          <div className="flex justify-between font-mono text-[11px]">
            <span className="text-on-surface-variant">Region / Proxy / Host:</span>
            <span className="text-on-surface truncate max-w-[60%] text-right">
              {networkDiagnostics?.railwayRegion || 'local'} ·{' '}
              {networkDiagnostics?.proxyConfigured ? 'Proxy ON' : 'Direct'} ·{' '}
              {networkDiagnostics?.activePublicHost?.replace('https://', '') || '—'}
            </span>
          </div>
          <div className="flex justify-between font-mono text-[11px]">
            <span className="text-on-surface-variant">Stan silnika 24/7:</span>
            <span className="text-primary font-bold">{botState}</span>
          </div>
        </div>

        <div className="bg-surface-container-low p-4 rounded-xl border border-white/5 flex flex-col justify-between gap-3">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase text-on-surface-variant">Konto Symulacyjne (Paper)</span>
              <ShieldCheck className="w-4 h-4 text-tertiary" />
            </div>
            <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
              W trybie PAPER wszystkie sygnały i zlecenia działają lokalnie na rzeczywistych cenach Bybit v5 bez wysyłania zleceń na API giełdy.
            </p>
          </div>
          <button
            type="button"
            onClick={resetPaperAccount}
            className="w-full px-3 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Resetuj Saldo Paper do $25,000.00</span>
          </button>
        </div>
      </div>

      {/* Strategy Explanation Card */}
      <div className="bg-surface-container-low p-5 rounded-xl border border-white/5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-primary" />
          <h2 className="font-display text-base font-bold text-on-surface">
            Dlaczego ta strategia daje wysoki Win Ratio + dużą liczbę transakcji na Bybit?
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-on-surface-variant leading-relaxed">
          <div className="bg-surface-container-lowest p-3 rounded-lg border border-white/5">
            <div className="font-display font-bold text-on-surface mb-1">1. Multi-Pair Basket ({config.timeframe}m)</div>
            Skanowanie {config.activePairs.length} płynnych par jednocześnie na świecach {config.timeframe}m generuje dziesiątki statystycznych okazji dziennie bez obniżania wymogów jakościowych pojedynczego wejścia.
          </div>
          <div className="bg-surface-container-lowest p-3 rounded-lg border border-white/5">
            <div className="font-display font-bold text-on-surface mb-1">2. Z-Score (±{config.zScoreThreshold.toFixed(2)}σ) + RSI(7)</div>
            Łączy odchylenie ceny od średniej ({config.meanAnchor.toUpperCase()}) z krótkim oscylatorem pędu RSI(7), łapiąc krótkoterminowe przegrzania, które statystycznie wracają do średniej.
          </div>
          <div className="bg-surface-container-lowest p-3 rounded-lg border border-white/5">
            <div className="font-display font-bold text-on-surface mb-1">3. ADX(14) &amp; Anti-Crash Gate</div>
            Blokuje wejścia przy ADX &gt; {config.adxMax.toFixed(1)} oraz przy świecach &gt; {config.antiCrashAtrMult}x ATR, eliminując łapanie spadających noży w trakcie silnych wybić trendowych.
          </div>
          <div className="bg-surface-container-lowest p-3 rounded-lg border border-white/5">
            <div className="font-display font-bold text-on-surface mb-1">4. Maker Post-Only + Time-Stop</div>
            Zlecenia Limit Post-Only redukują prowizję z 0.055% do {config.makerFeePct.toFixed(3)}%, a {config.timeStopMinutes}-minutowy Time-Stop uwalnia kapitał ze stagnacji.
          </div>
        </div>
      </div>

      {/* Active Endpoints */}
      <div className="bg-surface-container-low p-4 rounded-xl border border-white/5 flex items-center justify-between font-mono text-xs">
        <div className="flex items-center gap-2 text-on-surface-variant">
          <Activity className="w-4 h-4 text-tertiary" />
          <span>Aktywny koszyk skanera: {config.activePairs.join(', ')}</span>
        </div>
        <span className="text-on-surface-variant">
          Interwał: <strong className="text-primary">{config.timeframe}m</strong>
        </span>
      </div>
    </div>
  );
};
