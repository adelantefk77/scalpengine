import React, { useState } from 'react';
import {
  AlertTriangle,
  CandlestickChart,
  CheckCircle2,
  History,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  Pause,
  Play,
  SlidersHorizontal,
  Terminal,
  X,
} from 'lucide-react';
import { useAuth } from './AuthGate';
import { useBot } from '../engine/botContext';
import { formatUsd } from '../engine/format';
import { NavRoute } from '../engine/types';

interface NavItem {
  id: NavRoute;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-[18px] h-[18px]" /> },
  { id: 'skaner-rynku', label: 'Skaner Rynku', icon: <CandlestickChart className="w-[18px] h-[18px]" /> },
  { id: 'historia-i-analityka', label: 'Historia i Analityka', icon: <LineChart className="w-[18px] h-[18px]" /> },
  { id: 'strategia-i-ryzyko', label: 'Strategia i Ryzyko', icon: <SlidersHorizontal className="w-[18px] h-[18px]" /> },
  { id: 'backtester', label: 'Backtester', icon: <History className="w-[18px] h-[18px]" /> },
  { id: 'api-i-system', label: 'API i System', icon: <Terminal className="w-[18px] h-[18px]" /> },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    activeRoute,
    setActiveRoute,
    config,
    botState,
    executionMode,
    setExecutionMode,
    privateStatus,
    togglePauseBot,
    resumeFromKillSwitch,
    triggerKillSwitch,
    equity,
    todayRealizedPnl,
    unrealizedPnl,
    wsStatus,
    activePositions,
    toast,
  } = useBot();
  const { authEnabled, expiresAt, logout } = useAuth();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [killModalOpen, setKillModalOpen] = useState(false);

  const marketLabel =
    config.marketType === 'spot_margin'
      ? 'BYBIT / SPOT MARGIN'
      : config.marketType === 'perp_usdc'
        ? 'BYBIT / PERP USDC'
        : 'BYBIT / PERP USDT';

  const envLabel = `BYBIT ${privateStatus.env.toUpperCase()}`;

  const totalTodayPnl = todayRealizedPnl + unrealizedPnl;
  const totalTodayPct = equity > 0 ? (totalTodayPnl / equity) * 100 : 0;

  return (
    <div className="min-h-screen bg-surface-container-lowest text-on-surface flex">
      {/* Mobile drawer backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-surface-container-low z-50 flex flex-col justify-between border-r border-white/5 shadow-[0_1px_12px_rgba(0,0,0,0.45)] transition-transform duration-200 lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col">
          <div className="h-16 px-4 flex items-center justify-between bg-surface-container-lowest border-b border-white/5">
            <button
              type="button"
              onClick={() => {
                setActiveRoute('dashboard');
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-3 text-left"
            >
              {/* Custom inline SVG brand mark */}
              <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center border border-primary/25">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                  <path
                    d="M4 16L9 10L13 13.5L20 6"
                    stroke="#4ced9f"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M16 6H20V10"
                    stroke="#f7a600"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="9" cy="10" r="1.8" fill="#ffc97d" />
                  <circle cx="13" cy="13.5" r="1.8" fill="#ffc97d" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="font-display text-[15px] font-bold text-on-surface tracking-tight leading-tight">
                  ScalpEngine
                </span>
                <span className="font-mono text-[10px] font-semibold text-on-surface-variant tracking-wider uppercase">
                  Bybit v5 Terminal
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded text-on-surface-variant hover:text-on-surface"
              aria-label="Zamknij menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex flex-col gap-1 p-3 mt-1">
            {NAV_ITEMS.map((item) => {
              const isActive = activeRoute === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveRoute(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-surface-container-highest text-primary font-semibold'
                      : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface font-medium'
                  }`}
                >
                  <span className={isActive ? 'text-primary' : 'text-on-surface-variant'}>{item.icon}</span>
                  <span className="font-display text-[14px] leading-tight">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Real WS Status + Session */}
        <div className="p-3 m-3 flex flex-col gap-2">
          {authEnabled && (
            <div className="p-2.5 rounded-lg bg-surface-container border border-white/5 flex items-center justify-between gap-2">
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-tertiary">
                  Sesja 4h Aktywna
                </span>
                <span className="font-mono text-[10px] text-on-surface-variant tabular-nums">
                  {expiresAt
                    ? `Wygasa o ${new Date(expiresAt).toLocaleTimeString('pl-PL', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`
                    : 'Chronione hasłem'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                title="Wyloguj z terminala"
                className="p-1.5 rounded-md bg-surface-container-high hover:bg-error-container hover:text-on-error-container text-on-surface-variant transition-colors shrink-0"
                aria-label="Wyloguj"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="p-3 rounded-lg bg-surface-container border border-white/5 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    wsStatus.connected ? 'bg-tertiary' : 'bg-primary-container'
                  }`}
                />
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  Bybit Feed
                </span>
              </div>
              <span
                className={`font-mono text-[11px] font-bold tabular-nums ${
                  wsStatus.connected ? 'text-tertiary' : 'text-primary'
                }`}
              >
                {wsStatus.latencyMs > 0 ? `${wsStatus.latencyMs}ms` : 'REST'}
              </span>
            </div>
            <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant">
              <span>{wsStatus.connected ? 'WebSocket Live' : 'REST Fallback'}</span>
              <span className="tabular-nums">{wsStatus.messagesReceived.toLocaleString('en-US')} msg</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="lg:pl-64 flex-1 flex flex-col min-h-screen w-full">
        {/* Top Fixed Header */}
        <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-surface/90 backdrop-blur-xl z-30 px-4 lg:px-5 border-b border-white/5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
              aria-label="Otwórz menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-high whitespace-nowrap shrink-0">
              <span className="h-2 w-2 rounded-full bg-primary-container" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface font-bold">
                {marketLabel}
              </span>
            </div>

            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-low whitespace-nowrap shrink-0">
              <span
                className={`h-2 w-2 rounded-full ${
                  wsStatus.connected ? 'bg-tertiary' : 'bg-primary-container'
                }`}
              />
              <span className="font-mono text-[11px] text-on-surface font-medium tabular-nums">
                Bybit WS:{' '}
                <span className={wsStatus.connected ? 'text-tertiary' : 'text-primary'}>
                  {wsStatus.connected ? `Connected (${wsStatus.latencyMs || 1} ms)` : 'REST Sync'}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Execution Mode Switcher: Paper vs Bybit Demo */}
              <div
                className="flex items-center p-0.5 rounded-lg bg-surface-container border border-white/10 shrink-0"
                title={
                  privateStatus.configured
                    ? `Przełącz tryb egzekucji (${privateStatus.baseUrl})`
                    : 'Dodaj BYBIT_API_KEY i BYBIT_API_SECRET do pliku .env, aby aktywować Bybit Demo'
                }
              >
                <button
                  type="button"
                  onClick={() => void setExecutionMode('paper')}
                  className={`px-2 py-1 rounded-md font-mono text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${
                    executionMode === 'paper'
                      ? 'bg-primary-container/25 text-primary'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  PAPER
                </button>
                <button
                  type="button"
                  onClick={() => void setExecutionMode('exchange')}
                  className={`px-2 py-1 rounded-md font-mono text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1 whitespace-nowrap ${
                    executionMode === 'exchange'
                      ? 'bg-tertiary-container/25 text-tertiary'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      privateStatus.configured ? 'bg-tertiary' : 'bg-outline'
                    }`}
                  />
                  <span>{envLabel}</span>
                </button>
              </div>

              <span
                className={`px-2.5 py-1 rounded font-mono text-[10px] font-bold tracking-wider uppercase whitespace-nowrap ${
                  botState === 'RUNNING'
                    ? 'bg-tertiary-container/15 text-tertiary'
                    : botState === 'PAUSED'
                      ? 'bg-primary-container/15 text-primary'
                      : 'bg-error-container/40 text-error'
                }`}
              >
                {botState}
              </span>

              {botState === 'HALTED' ? (
                <button
                  type="button"
                  onClick={resumeFromKillSwitch}
                  className="px-3 py-1.5 rounded-lg bg-tertiary text-on-tertiary hover:bg-tertiary-fixed font-sans text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Wznów silnik</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={togglePauseBot}
                  className="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface hover:bg-surface-container-highest font-sans text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  {botState === 'RUNNING' ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Pauza bota</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-tertiary" />
                      <span className="hidden sm:inline">Wznów bota</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Right Header Telemetry & Kill Switch */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden xl:flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container font-mono text-[10px] text-on-surface-variant">
              <span className={config.quoteCurrency === 'USDT' ? 'text-primary font-bold' : ''}>USDT</span>
              <span>/</span>
              <span className={config.quoteCurrency === 'USDC' ? 'text-primary font-bold' : ''}>USDC</span>
              <span>/</span>
              <span className={config.quoteCurrency === 'EURQ' ? 'text-primary font-bold' : ''}>EURQ</span>
            </div>

            <div className="flex items-center gap-3 px-3 py-1 rounded-lg bg-surface-container-low">
              <div className="flex flex-col">
                <span className="font-mono text-[9px] text-on-surface-variant uppercase tracking-wider">
                  Equity
                </span>
                <span className="font-mono text-[13px] font-bold text-on-surface tabular-nums">
                  {formatUsd(equity)}
                </span>
              </div>
              <div className="h-6 w-[1px] bg-surface-container-high hidden sm:block" />
              <div className="hidden sm:flex flex-col">
                <span className="font-mono text-[9px] text-on-surface-variant uppercase tracking-wider">
                  Dzisiejszy PnL
                </span>
                <span
                  className={`font-mono text-[13px] font-bold tabular-nums ${
                    totalTodayPnl >= 0 ? 'text-tertiary' : 'text-error'
                  }`}
                >
                  {formatUsd(totalTodayPnl, true)} ({totalTodayPct >= 0 ? '+' : ''}
                  {totalTodayPct.toFixed(2)}%)
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setKillModalOpen(true)}
              className="px-3.5 py-2 rounded-lg bg-error-container text-on-error-container hover:bg-error hover:text-on-error font-mono text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_12px_rgba(246,70,93,0.3)] transition-all whitespace-nowrap shrink-0"
            >
              <AlertTriangle className="w-4 h-4" />
              <span className="hidden sm:inline">KILL SWITCH</span>
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="w-full pt-20 pb-8 px-3 lg:px-4 flex-1 bg-surface-container-lowest">
          {children}
        </main>
      </div>

      {/* Kill Switch Confirmation Modal */}
      {killModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container border border-error/40 rounded-xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3 text-error">
              <div className="w-10 h-10 rounded-lg bg-error-container/40 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-on-surface">
                  Awaryjne zatrzymanie (Kill Switch)
                </h3>
                <p className="text-xs text-on-surface-variant">
                  {executionMode === 'exchange'
                    ? `Natychmiastowa likwidacja otwartych pozycji na Bybit ${privateStatus.env.toUpperCase()}`
                    : 'Natychmiastowa likwidacja otwartych pozycji symulacyjnych (Paper)'}
                </p>
              </div>
            </div>

            <p className="text-sm text-on-surface-variant leading-relaxed">
              Potwierdzenie zamknie wszystkie aktywne pozycje ({activePositions.length}) po bieżącej cenie rynkowej Bybit, anuluje oczekujące zlecenia Post-Only i przełączy silnik w stan{' '}
              <strong className="text-error font-mono">HALTED</strong>.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setKillModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-sm font-medium transition-colors"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerKillSwitch();
                  setKillModalOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-error-container hover:bg-error text-on-error-container hover:text-on-error font-mono text-xs font-bold uppercase tracking-wider transition-colors"
              >
                Potwierdź Kill Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-lg bg-surface-container-highest border border-white/10 text-on-surface shadow-2xl max-w-md">
          <CheckCircle2
            className={`w-5 h-5 shrink-0 ${
              toast.type === 'error'
                ? 'text-error'
                : toast.type === 'warning'
                  ? 'text-primary'
                  : 'text-tertiary'
            }`}
          />
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}
    </div>
  );
};
