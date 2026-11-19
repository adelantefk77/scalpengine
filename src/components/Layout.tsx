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
import { formatPrice, formatUsd } from '../engine/format';
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
    pairTelemetries,
    selectedPairBase,
    setSelectedPairBase,
    activePositions,
    toast,
  } = useBot();
  const { authEnabled, expiresAt, logout } = useAuth();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [killModalOpen, setKillModalOpen] = useState(false);
  const [liveModalOpen, setLiveModalOpen] = useState(false);
  const [switchingLive, setSwitchingLive] = useState(false);

  const marketLabel =
    config.marketType === 'spot_margin'
      ? 'BYBIT / SPOT MARGIN'
      : config.marketType === 'perp_usdc'
        ? 'BYBIT / PERP USDC'
        : 'BYBIT / PERP USDT';

  const isDemoActive = executionMode === 'exchange' && privateStatus.env !== 'mainnet';
  const isLiveActive = executionMode === 'exchange' && privateStatus.env === 'mainnet';
  const demoSlot = privateStatus.accounts?.demo;
  const liveSlot = privateStatus.accounts?.mainnet;

  const totalTodayPnl = todayRealizedPnl + unrealizedPnl;
  const totalTodayPct = equity > 0 ? (totalTodayPnl / equity) * 100 : 0;

  const activePositionBases = new Set(activePositions.map((p) => p.base));
  const tickerPairs = config.activePairs
    .map((base) => pairTelemetries.find((p) => p.base === base))
    .filter((p): p is NonNullable<typeof p> => Boolean(p && p.lastPrice > 0));

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
        <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-surface/90 backdrop-blur-xl z-30 px-3 lg:px-4 border-b border-white/5 flex items-center justify-between gap-2.5 overflow-hidden">
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg bg-surface-container-high text-on-surface hover:bg-surface-container-highest shrink-0"
              aria-label="Otwórz menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="hidden xl:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-container-high whitespace-nowrap shrink-0">
              <span className="h-2 w-2 rounded-full bg-primary-container" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface font-bold">
                {marketLabel}
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Execution Mode Switcher: Paper vs Bybit Demo vs Bybit REAL LIVE */}
              <div
                className={`flex items-center p-0.5 rounded-lg bg-surface-container border shrink-0 ${
                  isLiveActive ? 'border-error/60 shadow-[0_0_12px_rgba(246,70,93,0.25)]' : 'border-white/10'
                }`}
                title="Przełącz środowisko egzekucji: Paper / Bybit Demo / Bybit REAL (Mainnet)"
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
                  onClick={() => void setExecutionMode('exchange', 'demo')}
                  className={`px-2 py-1 rounded-md font-mono text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1 whitespace-nowrap ${
                    isDemoActive
                      ? 'bg-tertiary-container/25 text-tertiary'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      demoSlot?.configured ? 'bg-tertiary' : 'bg-outline'
                    }`}
                  />
                  <span>DEMO</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isLiveActive) return;
                    setLiveModalOpen(true);
                  }}
                  className={`px-2 py-1 rounded-md font-mono text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1 whitespace-nowrap ${
                    isLiveActive
                      ? 'bg-error text-on-error shadow-[0_0_10px_rgba(246,70,93,0.4)]'
                      : 'text-on-surface-variant hover:text-error'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isLiveActive
                        ? 'bg-white animate-pulse'
                        : liveSlot?.configured
                          ? 'bg-error'
                          : 'bg-outline'
                    }`}
                  />
                  <span>
                    REAL<span className="hidden 2xl:inline"> LIVE</span>
                  </span>
                </button>
              </div>

              <span
                className={`hidden sm:inline-flex px-2 py-1 rounded font-mono text-[10px] font-bold tracking-wider uppercase whitespace-nowrap shrink-0 ${
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
                  title="Wznów silnik"
                  className="px-2.5 py-1.5 rounded-lg bg-tertiary text-on-tertiary hover:bg-tertiary-fixed font-sans text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">Wznów silnik</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={togglePauseBot}
                  title={botState === 'RUNNING' ? 'Pauza bota' : 'Wznów bota'}
                  className="px-2.5 py-1.5 rounded-lg bg-surface-container-high text-on-surface hover:bg-surface-container-highest font-sans text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  {botState === 'RUNNING' ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span className="hidden xl:inline">Pauza</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-tertiary" />
                      <span className="hidden xl:inline">Wznów</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Center Auto-Scrolling Live Crypto Price Ticker Tape (md+ desktop/tablet/preview) */}
          <div
            className="hidden md:flex flex-1 min-w-0 h-9 items-center rounded-lg bg-surface-container border border-white/10 overflow-hidden ticker-marquee-container ticker-marquee-mask"
            title="Ceny na żywo aktywnych par skanera (najedź aby zatrzymać, kliknij aby przejść do wykresu)"
          >
            {tickerPairs.length > 0 ? (
              <div className="ticker-marquee-track">
                {[0, 1].map((dupIdx) => (
                  <div key={dupIdx} className="flex items-center shrink-0">
                    {tickerPairs.map((pair) => {
                      const isUp = pair.change24hPct >= 0;
                      const isSelected = selectedPairBase === pair.base;
                      const hasOpenPos = activePositionBases.has(pair.base);
                      return (
                        <button
                          key={`${dupIdx}-${pair.base}`}
                          type="button"
                          onClick={() => {
                            setSelectedPairBase(pair.base);
                            if (activeRoute !== 'dashboard') {
                              setActiveRoute('dashboard');
                            }
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1 font-mono text-[11px] whitespace-nowrap transition-colors border-r border-white/5 hover:bg-surface-container-high/80 ${
                            isSelected ? 'text-primary' : 'text-on-surface'
                          }`}
                        >
                          {hasOpenPos && (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-tertiary animate-pulse shrink-0"
                              title="Otwarta pozycja"
                            />
                          )}
                          <span className="font-bold tracking-tight">{pair.base}</span>
                          <span className="tabular-nums text-on-surface font-semibold">
                            {formatPrice(pair.lastPrice)}
                          </span>
                          <span
                            className={`tabular-nums text-[10px] font-bold ${
                              isUp ? 'text-tertiary' : 'text-error'
                            }`}
                          >
                            {isUp ? '+' : ''}
                            {pair.change24hPct.toFixed(2)}%
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-3 font-mono text-[11px] text-on-surface-variant whitespace-nowrap">
                Synchronizacja cen Bybit...
              </div>
            )}
          </div>

          {/* Right Header Telemetry & Kill Switch */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-2.5 px-2.5 py-1 rounded-lg bg-surface-container-low whitespace-nowrap">
              <div className="flex flex-col">
                <span className="font-mono text-[9px] text-on-surface-variant uppercase tracking-wider">
                  Equity
                </span>
                <span className="font-mono text-[13px] font-bold text-on-surface tabular-nums">
                  {formatUsd(equity)}
                </span>
              </div>
              <div className="h-6 w-[1px] bg-surface-container-high hidden lg:block" />
              <div className="hidden lg:flex flex-col">
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
              title="Awaryjne zatrzymanie (Kill Switch)"
              className="px-2.5 sm:px-3 py-2 rounded-lg bg-error-container text-on-error-container hover:bg-error hover:text-on-error font-mono text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_12px_rgba(246,70,93,0.3)] transition-all whitespace-nowrap shrink-0"
            >
              <AlertTriangle className="w-4 h-4" />
              <span className="hidden sm:inline">KILL SWITCH</span>
            </button>
          </div>
        </header>

        {/* Mobile / Narrow Preview Sub-Header Ticker Tape (< md) */}
        <div className="md:hidden fixed top-16 left-0 right-0 h-8 bg-surface/95 backdrop-blur-md z-20 border-b border-white/5 flex items-center overflow-hidden ticker-marquee-container ticker-marquee-mask">
          {tickerPairs.length > 0 ? (
            <div className="ticker-marquee-track">
              {[0, 1].map((dupIdx) => (
                <div key={dupIdx} className="flex items-center shrink-0">
                  {tickerPairs.map((pair) => {
                    const isUp = pair.change24hPct >= 0;
                    const isSelected = selectedPairBase === pair.base;
                    const hasOpenPos = activePositionBases.has(pair.base);
                    return (
                      <button
                        key={`m-${dupIdx}-${pair.base}`}
                        type="button"
                        onClick={() => {
                          setSelectedPairBase(pair.base);
                          if (activeRoute !== 'dashboard') {
                            setActiveRoute('dashboard');
                          }
                        }}
                        className={`flex items-center gap-1.5 px-2.5 py-0.5 font-mono text-[11px] whitespace-nowrap border-r border-white/5 ${
                          isSelected ? 'text-primary' : 'text-on-surface'
                        }`}
                      >
                        {hasOpenPos && (
                          <span className="h-1.5 w-1.5 rounded-full bg-tertiary animate-pulse shrink-0" />
                        )}
                        <span className="font-bold">{pair.base}</span>
                        <span className="tabular-nums font-semibold">{formatPrice(pair.lastPrice)}</span>
                        <span className={`tabular-nums text-[10px] font-bold ${isUp ? 'text-tertiary' : 'text-error'}`}>
                          {isUp ? '+' : ''}
                          {pair.change24hPct.toFixed(2)}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-3 font-mono text-[10px] text-on-surface-variant">
              Synchronizacja cen Bybit...
            </div>
          )}
        </div>

        {/* Main Viewport */}
        <main className="w-full pt-28 md:pt-20 pb-8 px-3 lg:px-4 flex-1 bg-surface-container-lowest">
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
                    ? `Natychmiastowa likwidacja otwartych pozycji na Bybit ${privateStatus.env === 'mainnet' ? 'REAL LIVE' : privateStatus.env.toUpperCase()}`
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

      {/* REAL Mainnet Activation Confirmation Modal */}
      {liveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container border border-error/50 rounded-xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3 text-error">
              <div className="w-10 h-10 rounded-lg bg-error-container/40 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-on-surface">
                  Przełączenie na konto REAL (Mainnet)
                </h3>
                <p className="font-mono text-[11px] text-error">
                  https://api.bybit.com · PRAWDZIWE ŚRODKI
                </p>
              </div>
            </div>

            {liveSlot?.configured ? (
              <>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  Bot 24/7 zacznie wysyłać <strong className="text-on-surface">prawdziwe zlecenia</strong> na Twoje konto Bybit Mainnet przy użyciu klucza{' '}
                  <code className="font-mono text-tertiary bg-surface-container-lowest px-1.5 py-0.5 rounded">
                    {liveSlot.keyMask}
                  </code>
                  . Upewnij się, że rozmiar pozycji, dźwignia ({config.leverage}x) i Daily Max Loss ({config.dailyMaxLossPct}%) są poprawnie ustawione.
                </p>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setLiveModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-sm font-medium transition-colors"
                  >
                    Anuluj
                  </button>
                  <button
                    type="button"
                    disabled={switchingLive}
                    onClick={async () => {
                      setSwitchingLive(true);
                      try {
                        const ok = await setExecutionMode('exchange', 'mainnet', true);
                        if (ok) setLiveModalOpen(false);
                      } finally {
                        setSwitchingLive(false);
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-error hover:bg-error/90 text-on-error font-mono text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                  >
                    {switchingLive ? 'Łączenie...' : 'Aktywuj REAL LIVE'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  Klucze realnego konta Bybit nie są jeszcze ustawione na serwerze. Dodaj je w{' '}
                  <strong className="text-on-surface">Railway → Variables</strong> (bez uprawnienia Withdraw / Wypłaty!):
                </p>
                <pre className="p-3 rounded-lg bg-surface-container-lowest border border-white/10 font-mono text-[11px] text-tertiary overflow-x-auto">
{`BYBIT_LIVE_API_KEY="TWOJ_KLUCZ_REAL"
BYBIT_LIVE_API_SECRET="TWOJ_SEKRET_REAL"`}
                </pre>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setLiveModalOpen(false);
                      setActiveRoute('api-i-system');
                    }}
                    className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container hover:bg-primary text-xs font-bold transition-colors"
                  >
                    Przejdź do API i System
                  </button>
                  <button
                    type="button"
                    onClick={() => setLiveModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-medium transition-colors"
                  >
                    Zamknij
                  </button>
                </div>
              </>
            )}
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
