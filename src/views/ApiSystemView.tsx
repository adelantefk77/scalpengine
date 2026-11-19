import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Flame,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  X,
} from 'lucide-react';
import { useBot } from '../engine/botContext';
import { formatTimeHms, formatUsd } from '../engine/format';
import { PrivateEnv } from '../engine/types';

interface AccountTestResult {
  ok: boolean;
  equity?: number;
  availableBalance?: number;
  error?: string;
  testedAt: number;
}

export const ApiSystemView: React.FC = () => {
  const {
    wsStatus,
    config,
    botState,
    executionMode,
    setExecutionMode,
    testBybitAccount,
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
  const [testingEnv, setTestingEnv] = useState<PrivateEnv | null>(null);
  const [testResults, setTestResults] = useState<Partial<Record<PrivateEnv, AccountTestResult>>>({});
  const [liveModalOpen, setLiveModalOpen] = useState(false);
  const [switchingLive, setSwitchingLive] = useState(false);

  const demoSlot = privateStatus.accounts?.demo ?? {
    env: 'demo' as const,
    configured: privateStatus.env === 'demo' ? privateStatus.configured : false,
    baseUrl: 'https://api-demo.bybit.com',
    keyMask: privateStatus.env === 'demo' ? privateStatus.keyMask : null,
  };

  const mainnetSlot = privateStatus.accounts?.mainnet ?? {
    env: 'mainnet' as const,
    configured: privateStatus.env === 'mainnet' ? privateStatus.configured : false,
    baseUrl: 'https://api.bybit.com',
    keyMask: privateStatus.env === 'mainnet' ? privateStatus.keyMask : null,
  };

  const isRealLiveActive = executionMode === 'exchange' && privateStatus.env === 'mainnet';
  const isDemoActive = executionMode === 'exchange' && privateStatus.env === 'demo';
  const envLabel = privateStatus.env === 'mainnet' ? 'REAL MAINNET' : 'DEMO';

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

  const runAccountTest = async (env: PrivateEnv) => {
    setTestingEnv(env);
    try {
      const result = await testBybitAccount(env);
      setTestResults((prev) => ({
        ...prev,
        [env]: {
          ok: result.ok,
          equity: result.equity,
          availableBalance: result.availableBalance,
          error: result.error,
          testedAt: Date.now(),
        },
      }));
      if (env === privateStatus.env && result.ok) {
        await refreshPrivateAccount();
      }
      const label = env === 'mainnet' ? 'REAL MAINNET' : 'DEMO';
      showToast(
        result.ok
          ? `Bybit ${label} OK — Equity: ${formatUsd(result.equity ?? 0)}`
          : `Błąd Bybit ${label}: ${result.error || 'sprawdź zmienne API'}`,
        result.ok ? 'success' : 'error'
      );
    } finally {
      setTestingEnv(null);
    }
  };

  const handleConfirmRealLive = async () => {
    setSwitchingLive(true);
    try {
      const ok = await setExecutionMode('exchange', 'mainnet', true);
      if (ok) {
        setLiveModalOpen(false);
      }
    } finally {
      setSwitchingLive(false);
    }
  };

  return (
    <div className="flex flex-col w-full gap-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface-container-low p-4 rounded-xl border border-white/5">
        <div>
          <h1 className="font-display text-xl font-bold text-on-surface">API i System Bybit v5</h1>
          <p className="text-xs text-on-surface-variant">
            Podłączenie osobnych kont Bybit DEMO oraz Bybit REAL (Mainnet), testy połączeń HMAC-SHA256 i bezpieczny przełącznik egzekucji.
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
            onClick={() => void runAccountTest(privateStatus.env)}
            disabled={testingEnv !== null}
            className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-display text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap border border-white/10"
          >
            <KeyRound
              className={`w-3.5 h-3.5 ${
                privateStatus.env === 'mainnet' ? 'text-error' : 'text-tertiary'
              } ${testingEnv === privateStatus.env ? 'animate-spin' : ''}`}
            />
            <span>Odśwież {envLabel}</span>
          </button>
        </div>
      </div>

      {/* Dual Account & Mode Switcher Card */}
      <div
        className={`bg-surface-container-low p-5 rounded-xl border flex flex-col gap-4 ${
          isRealLiveActive ? 'border-error/40' : 'border-white/5'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
                isRealLiveActive
                  ? 'bg-error-container/30 border-error/40 text-error'
                  : privateStatus.configured
                    ? 'bg-tertiary-container/20 border-tertiary/30 text-tertiary'
                    : 'bg-primary-container/15 border-primary/30 text-primary'
              }`}
            >
              {isRealLiveActive ? (
                <Flame className="w-5 h-5" />
              ) : privateStatus.configured ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <ShieldAlert className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-base font-bold text-on-surface">
                  Przełącznik Konta Egzekucji (Server-Side HMAC-SHA256)
                </h2>
                <span
                  className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase ${
                    isRealLiveActive
                      ? 'bg-error text-on-error'
                      : isDemoActive
                        ? 'bg-tertiary-container/20 text-tertiary'
                        : 'bg-primary-container/25 text-primary'
                  }`}
                >
                  {isRealLiveActive
                    ? 'AKTYWNE: REAL MAINNET'
                    : isDemoActive
                      ? 'AKTYWNE: BYBIT DEMO'
                      : 'AKTYWNE: PAPER'}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Aktywny endpoint prywatny:{' '}
                <span className="font-mono text-on-surface">{privateStatus.baseUrl}</span>{' '}
                (przełączenie między DEMO a REAL automatycznie czyści cache pozycji i pobiera stan docelowego konta).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
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
              onClick={() => void setExecutionMode('exchange', 'demo')}
              className={`px-3.5 py-2 rounded-lg font-mono text-xs font-bold uppercase transition-colors ${
                isDemoActive
                  ? 'bg-tertiary text-on-tertiary'
                  : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Bybit DEMO
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isRealLiveActive) {
                  setLiveModalOpen(true);
                }
              }}
              className={`px-3.5 py-2 rounded-lg font-mono text-xs font-bold uppercase transition-colors flex items-center gap-1.5 ${
                isRealLiveActive
                  ? 'bg-error text-on-error'
                  : 'bg-error-container/20 text-error hover:bg-error-container/35 border border-error/30'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Bybit REAL LIVE</span>
            </button>
          </div>
        </div>

        {/* Two Independent Account Slots: DEMO vs REAL MAINNET */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Slot 1: Bybit DEMO */}
          <div
            className={`bg-surface-container-lowest p-4 rounded-lg border flex flex-col justify-between gap-3 ${
              isDemoActive ? 'border-tertiary/40' : 'border-white/5'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display text-sm font-bold text-on-surface">
                    Konto Bybit DEMO
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase ${
                      demoSlot.configured
                        ? 'bg-tertiary-container/20 text-tertiary'
                        : 'bg-surface-container-high text-on-surface-variant'
                    }`}
                  >
                    {demoSlot.configured ? `Skonfigurowane (${demoSlot.keyMask})` : 'Brak kluczy DEMO'}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-on-surface-variant mt-1">
                  Endpoint: <span className="text-on-surface">{demoSlot.baseUrl}</span>
                </div>
                <div className="font-mono text-[10px] text-on-surface-variant mt-0.5">
                  Zmienne: <span className="text-tertiary">BYBIT_DEMO_API_KEY</span> /{' '}
                  <span className="text-tertiary">BYBIT_DEMO_API_SECRET</span> (lub legacy{' '}
                  <span className="text-on-surface">BYBIT_API_KEY</span>)
                </div>
              </div>
              <button
                type="button"
                onClick={() => void runAccountTest('demo')}
                disabled={testingEnv !== null || !demoSlot.configured}
                className="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest disabled:opacity-40 text-on-surface font-mono text-[11px] font-bold flex items-center gap-1.5 shrink-0 border border-white/10"
              >
                <RefreshCw className={`w-3 h-3 text-tertiary ${testingEnv === 'demo' ? 'animate-spin' : ''}`} />
                <span>Testuj DEMO</span>
              </button>
            </div>

            {testResults.demo && (
              <div
                className={`px-3 py-2 rounded border font-mono text-[11px] ${
                  testResults.demo.ok
                    ? 'bg-tertiary-container/15 border-tertiary/30 text-tertiary'
                    : 'bg-error-container/25 border-error/30 text-error'
                }`}
              >
                {testResults.demo.ok
                  ? `Połączenie OK (${formatTimeHms(testResults.demo.testedAt)}) · Equity: ${formatUsd(
                      testResults.demo.equity ?? 0
                    )} · Dostępne: ${formatUsd(testResults.demo.availableBalance ?? 0)}`
                  : `Błąd testu DEMO: ${testResults.demo.error}`}
              </div>
            )}
          </div>

          {/* Slot 2: Bybit REAL MAINNET */}
          <div
            className={`bg-surface-container-lowest p-4 rounded-lg border flex flex-col justify-between gap-3 ${
              isRealLiveActive ? 'border-error/50' : 'border-white/5'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display text-sm font-bold text-on-surface">
                    Konto Bybit REAL (Mainnet)
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase ${
                      mainnetSlot.configured
                        ? 'bg-error-container/30 text-error'
                        : 'bg-surface-container-high text-on-surface-variant'
                    }`}
                  >
                    {mainnetSlot.configured
                      ? `Gotowe (${mainnetSlot.keyMask})`
                      : 'Brak kluczy REAL'}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-on-surface-variant mt-1">
                  Endpoint: <span className="text-on-surface">{mainnetSlot.baseUrl}</span>
                </div>
                <div className="font-mono text-[10px] text-on-surface-variant mt-0.5">
                  Zmienne: <span className="text-error">BYBIT_LIVE_API_KEY</span> /{' '}
                  <span className="text-error">BYBIT_LIVE_API_SECRET</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void runAccountTest('mainnet')}
                disabled={testingEnv !== null || !mainnetSlot.configured}
                className="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest disabled:opacity-40 text-on-surface font-mono text-[11px] font-bold flex items-center gap-1.5 shrink-0 border border-error/25"
              >
                <RefreshCw className={`w-3 h-3 text-error ${testingEnv === 'mainnet' ? 'animate-spin' : ''}`} />
                <span>Testuj REAL</span>
              </button>
            </div>

            {testResults.mainnet && (
              <div
                className={`px-3 py-2 rounded border font-mono text-[11px] ${
                  testResults.mainnet.ok
                    ? 'bg-tertiary-container/15 border-tertiary/30 text-tertiary'
                    : 'bg-error-container/25 border-error/30 text-error'
                }`}
              >
                {testResults.mainnet.ok
                  ? `Połączenie REAL OK (${formatTimeHms(testResults.mainnet.testedAt)}) · Equity: ${formatUsd(
                      testResults.mainnet.equity ?? 0
                    )} · Dostępne: ${formatUsd(testResults.mainnet.availableBalance ?? 0)}`
                  : `Błąd testu REAL: ${testResults.mainnet.error}`}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Active Unified Account Balance Summary */}
          <div className="bg-surface-container-lowest p-4 rounded-lg border border-white/5 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                Saldo Aktywnego Konta Unified ({envLabel})
              </span>
              <span className="font-mono text-[10px] text-on-surface-variant tabular-nums">
                {privateAccount.updatedAt
                  ? `Sync: ${formatTimeHms(privateAccount.updatedAt)}`
                  : 'Oczekuje na synchronizację'}
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

          {/* .env / Railway Variables Setup Instructions (no client-side secret inputs) */}
          <div className="bg-surface-container-lowest p-4 rounded-lg border border-white/5 flex flex-col gap-2">
            <div className="font-mono text-[10px] uppercase tracking-wider text-primary font-bold">
              Konfiguracja obu kont (Railway → Variables lub .env)
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Sekrety pozostają wyłącznie po stronie serwera (brak formularzy w przeglądarce). Możesz podłączyć{' '}
              <strong className="text-on-surface">jednocześnie konto DEMO i REAL</strong> w{' '}
              <strong className="text-on-surface">Railway → Variables</strong> (region{' '}
              <strong className="text-tertiary">EU West</strong>). Dotychczasowe{' '}
              <code className="font-mono text-on-surface bg-surface-container-high px-1 py-0.5 rounded">BYBIT_API_KEY</code>{' '}
              nadal działa dla DEMO:
            </p>
            <pre className="p-2.5 rounded bg-surface-container font-mono text-[11px] text-tertiary overflow-x-auto leading-relaxed border border-white/5">
{`# Konto DEMO (api-demo.bybit.com)
BYBIT_DEMO_API_KEY="KLUCZ_DEMO_Z_BYBIT"
BYBIT_DEMO_API_SECRET="SEKRET_DEMO_Z_BYBIT"

# Konto REAL MAINNET (api.bybit.com)
BYBIT_LIVE_API_KEY="KLUCZ_REAL_Z_BYBIT_MAINNET"
BYBIT_LIVE_API_SECRET="SEKRET_REAL_Z_BYBIT_MAINNET"

# Logowanie do panelu (sesja 4h)
APP_PASSWORD="TWOJE_HASLO_LOGOWANIA"`}
            </pre>
            <div className="flex items-start gap-2 text-[11px] text-on-surface-variant pt-0.5">
              <AlertTriangle className="w-3.5 h-3.5 text-error shrink-0 mt-0.5" />
              <span>
                Dla klucza <strong className="text-on-surface">REAL Mainnet</strong> włącz w Bybit wyłącznie uprawnienia{' '}
                <strong className="text-on-surface">Contract / Unified Trading (Read-Write)</strong> i zostaw{' '}
                <strong className="text-error">Withdrawals (Wypłaty) WYŁĄCZONE</strong>.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Real Mainnet Confirmation Modal */}
      {liveModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-surface-container border border-error/40 rounded-xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-error-container/25 border-b border-error/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-error">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h2 className="font-display font-bold text-base">Przełączenie na REAL Bybit Mainnet</h2>
              </div>
              <button
                type="button"
                onClick={() => setLiveModalOpen(false)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded"
                aria-label="Zamknij"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-3 text-xs text-on-surface-variant leading-relaxed">
              {mainnetSlot.configured ? (
                <>
                  <p className="text-on-surface font-medium">
                    Zamierzasz przełączyć bota 24/7 na <strong className="text-error">prawdziwe konto Bybit Mainnet</strong>{' '}
                    (<span className="font-mono">https://api.bybit.com</span>). Wszystkie zlecenia będą składane za realny kapitał.
                  </p>
                  <div className="p-3 rounded-lg bg-surface-container-lowest border border-white/5 font-mono text-[11px] flex flex-col gap-1">
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Aktywny klucz REAL:</span>
                      <span className="text-error font-bold">{mainnetSlot.keyMask}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Tryb egzekucji:</span>
                      <span className="text-on-surface">Unified Trading (REAL)</span>
                    </div>
                  </div>
                  <p>
                    Zalecamy najpierw kliknąć <strong className="text-on-surface">Testuj REAL</strong> oraz sprawdzić dźwignię i{' '}
                    <strong className="text-on-surface">Risk/Trade</strong> w zakładce Strategia i Ryzyko.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-on-surface font-medium">
                    Klucze dla konta <strong className="text-error">REAL Bybit Mainnet</strong> nie są jeszcze skonfigurowane na serwerze.
                  </p>
                  <p>
                    Dodaj zmienne w <strong className="text-on-surface">Railway → Variables</strong> (lub lokalnym{' '}
                    <code className="font-mono text-on-surface">.env</code>) i zrestartuj deployment:
                  </p>
                  <pre className="p-2.5 rounded bg-surface-container-lowest border border-white/10 font-mono text-[11px] text-tertiary overflow-x-auto">
{`BYBIT_LIVE_API_KEY="TWOJ_KLUCZ_REAL"
BYBIT_LIVE_API_SECRET="TWOJ_SEKRET_REAL"`}
                  </pre>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setLiveModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono text-xs font-bold"
                >
                  Anuluj
                </button>
                {mainnetSlot.configured && (
                  <button
                    type="button"
                    disabled={switchingLive}
                    onClick={() => void handleConfirmRealLive()}
                    className="px-4 py-2 rounded-lg bg-error hover:bg-error/90 text-on-error font-mono text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Flame className="w-3.5 h-3.5" />
                    <span>{switchingLive ? 'Przełączanie...' : 'Aktywuj REAL MAINNET'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
