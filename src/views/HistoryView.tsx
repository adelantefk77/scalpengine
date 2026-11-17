import React, { useMemo, useState } from 'react';
import { Download, Filter, LineChart, Search, Trash2 } from 'lucide-react';
import { useBot } from '../engine/botContext';
import { downloadCsv, formatPrice, formatShortDateTime, formatUsd } from '../engine/format';

export const HistoryView: React.FC = () => {
  const { closedTrades, resetPaperAccount, setActiveRoute, showToast } = useBot();
  const [sideFilter, setSideFilter] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | 'WIN' | 'LOSS'>('ALL');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    return closedTrades.filter((t) => {
      if (sideFilter !== 'ALL' && t.side !== sideFilter) return false;
      if (outcomeFilter === 'WIN' && t.netPnlUsd <= 0) return false;
      if (outcomeFilter === 'LOSS' && t.netPnlUsd > 0) return false;
      if (q && !t.displayPair.toUpperCase().includes(q) && !t.exitReason.toUpperCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [closedTrades, sideFilter, outcomeFilter, query]);

  const analytics = useMemo(() => {
    const total = closedTrades.length;
    const wins = closedTrades.filter((t) => t.netPnlUsd > 0);
    const losses = closedTrades.filter((t) => t.netPnlUsd <= 0);
    const totalNet = closedTrades.reduce((a, t) => a + t.netPnlUsd, 0);
    const totalFees = closedTrades.reduce((a, t) => a + t.feesUsd, 0);
    const grossWin = wins.reduce((a, t) => a + t.netPnlUsd, 0);
    const grossLoss = Math.abs(losses.reduce((a, t) => a + t.netPnlUsd, 0));
    const avgDurationSec = total > 0 ? closedTrades.reduce((a, t) => a + t.durationSec, 0) / total : 0;

    // Exit reason distribution
    const byReason: Record<string, { count: number; pnl: number }> = {};
    for (const t of closedTrades) {
      if (!byReason[t.exitReason]) byReason[t.exitReason] = { count: 0, pnl: 0 };
      byReason[t.exitReason].count += 1;
      byReason[t.exitReason].pnl += t.netPnlUsd;
    }

    // By pair summary
    const byPairMap = new Map<string, { pair: string; trades: number; wins: number; net: number }>();
    for (const t of closedTrades) {
      const cur = byPairMap.get(t.displayPair) || { pair: t.displayPair, trades: 0, wins: 0, net: 0 };
      cur.trades += 1;
      if (t.netPnlUsd > 0) cur.wins += 1;
      cur.net += t.netPnlUsd;
      byPairMap.set(t.displayPair, cur);
    }

    return {
      total,
      winRate: total > 0 ? (wins.length / total) * 100 : 0,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 9.99 : 0,
      totalNet,
      totalFees,
      avgDurationMin: avgDurationSec / 60,
      byReason,
      byPair: Array.from(byPairMap.values()).sort((a, b) => b.net - a.net),
    };
  }, [closedTrades]);

  const handleExport = () => {
    if (filtered.length === 0) return;
    const headers = [
      'ID',
      'Czas_zamkniecia',
      'Para',
      'Kierunek',
      'Wejscie',
      'Wyjscie',
      'Notional',
      'Prowizje',
      'PnL_Netto',
      'PnL_Pct',
      'Powod',
      'Czas_s',
    ];
    const rows = filtered.map((t) => [
      t.id,
      new Date(t.closedAt).toISOString(),
      t.displayPair,
      t.side,
      t.entryPrice,
      t.exitPrice,
      t.notionalUsd.toFixed(2),
      t.feesUsd.toFixed(2),
      t.netPnlUsd.toFixed(2),
      t.netPnlPct.toFixed(3),
      t.exitReason,
      t.durationSec,
    ]);
    downloadCsv('ScalpEngine_Historia_Transakcji.csv', headers, rows);
    showToast('Wyeksportowano historię transakcji do CSV.', 'success');
  };

  return (
    <div className="flex flex-col w-full gap-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface-container-low p-4 rounded-xl border border-white/5">
        <div>
          <h1 className="font-display text-xl font-bold text-on-surface">Historia i Analityka Zagrań</h1>
          <p className="text-xs text-on-surface-variant">
            Pełny dziennik zamkniętych transakcji z sesji na żywo wraz z podziałem powodów wyjścia i par.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="px-3 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Eksport CSV</span>
          </button>
          <button
            type="button"
            onClick={resetPaperAccount}
            className="px-3 py-2 rounded-lg bg-surface-container-high hover:bg-error-container hover:text-on-error-container text-on-surface-variant text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Wyczyść i Resetuj ($25k)</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-surface-container-low p-4 rounded-xl border border-white/5">
          <span className="font-mono text-[10px] uppercase text-on-surface-variant">Łącznie transakcji</span>
          <div className="font-mono text-xl font-bold text-on-surface mt-1 tabular-nums">{analytics.total}</div>
        </div>
        <div className="bg-surface-container-low p-4 rounded-xl border border-white/5">
          <span className="font-mono text-[10px] uppercase text-on-surface-variant">Win Rate</span>
          <div className="font-mono text-xl font-bold text-tertiary mt-1 tabular-nums">
            {analytics.total > 0 ? `${analytics.winRate.toFixed(1)}%` : '—'}
          </div>
        </div>
        <div className="bg-surface-container-low p-4 rounded-xl border border-white/5">
          <span className="font-mono text-[10px] uppercase text-on-surface-variant">Profit Factor</span>
          <div className="font-mono text-xl font-bold text-secondary mt-1 tabular-nums">
            {analytics.total > 0 ? analytics.profitFactor.toFixed(2) : '—'}
          </div>
        </div>
        <div className="bg-surface-container-low p-4 rounded-xl border border-white/5">
          <span className="font-mono text-[10px] uppercase text-on-surface-variant">PnL Netto</span>
          <div
            className={`font-mono text-xl font-bold mt-1 tabular-nums ${
              analytics.totalNet >= 0 ? 'text-tertiary' : 'text-error'
            }`}
          >
            {formatUsd(analytics.totalNet, true)}
          </div>
        </div>
        <div className="bg-surface-container-low p-4 rounded-xl border border-white/5">
          <span className="font-mono text-[10px] uppercase text-on-surface-variant">Śr. czas pozycji</span>
          <div className="font-mono text-xl font-bold text-on-surface mt-1 tabular-nums">
            {analytics.total > 0 ? `${analytics.avgDurationMin.toFixed(1)} min` : '—'}
          </div>
        </div>
      </div>

      {/* Breakdown row */}
      {analytics.total > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-surface-container-low p-4 rounded-xl border border-white/5 flex flex-col gap-2">
            <span className="font-display text-sm font-bold text-on-surface">Rozkład Powodów Zamknięcia</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs tabular-nums">
              {Object.entries(analytics.byReason).map(([reason, stats]) => (
                <div key={reason} className="bg-surface-container-lowest p-2.5 rounded-lg">
                  <div className="text-[10px] text-on-surface-variant">{reason}</div>
                  <div className="font-bold text-on-surface mt-0.5">{stats.count}x</div>
                  <div className={stats.pnl >= 0 ? 'text-tertiary text-[11px]' : 'text-error text-[11px]'}>
                    {formatUsd(stats.pnl, true)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface-container-low p-4 rounded-xl border border-white/5 flex flex-col gap-2">
            <span className="font-display text-sm font-bold text-on-surface">Skuteczność wg Par</span>
            <div className="flex flex-wrap gap-2 font-mono text-xs tabular-nums">
              {analytics.byPair.map((bp) => (
                <div key={bp.pair} className="bg-surface-container-lowest px-3 py-2 rounded-lg flex items-center gap-3">
                  <span className="font-bold text-on-surface">{bp.pair}</span>
                  <span className="text-on-surface-variant">
                    {((bp.wins / bp.trades) * 100).toFixed(0)}% ({bp.trades})
                  </span>
                  <span className={bp.net >= 0 ? 'text-tertiary font-bold' : 'text-error font-bold'}>
                    {formatUsd(bp.net, true)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters + Table */}
      <div className="bg-surface-container-low rounded-xl border border-white/5 p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-surface-container-lowest p-1 rounded-lg">
              <Filter className="w-3.5 h-3.5 text-on-surface-variant ml-1.5 mr-1" />
              {(['ALL', 'LONG', 'SHORT'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSideFilter(s)}
                  className={`px-2.5 py-1 rounded font-mono text-[10px] font-bold transition-colors ${
                    sideFilter === s
                      ? 'bg-surface-container-highest text-primary'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {s === 'ALL' ? 'Wszystkie' : s}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-surface-container-lowest p-1 rounded-lg">
              {(['ALL', 'WIN', 'LOSS'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOutcomeFilter(o)}
                  className={`px-2.5 py-1 rounded font-mono text-[10px] font-bold transition-colors ${
                    outcomeFilter === o
                      ? 'bg-surface-container-highest text-primary'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {o === 'ALL' ? 'Zysk & Strata' : o === 'WIN' ? 'Zyskowne' : 'Stratne'}
                </button>
              ))}
            </div>
          </div>

          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-2.5 text-on-surface-variant pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtruj parę lub powód..."
              className="bg-surface-container-lowest text-on-surface font-mono text-xs pl-8 pr-3 py-1.5 rounded-lg border border-white/5 focus:outline-none w-52"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-lg p-8 flex flex-col items-center justify-center text-center gap-3">
            <LineChart className="w-8 h-8 text-on-surface-variant" />
            <div className="font-display text-sm font-semibold text-on-surface">
              Brak zamkniętych transakcji w dzienniku sesji
            </div>
            <p className="text-xs text-on-surface-variant max-w-md">
              Gdy automatyczny silnik zamknie pierwszą pozycję na żywych danych Bybit (lub zamkniesz ręcznie pozycję z Skanera), pełne statystyki pojawią się w tym miejscu.
            </p>
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => setActiveRoute('skaner-rynku')}
                className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-primary text-xs font-bold"
              >
                Przejdź do Skanera Rynku
              </button>
              <button
                type="button"
                onClick={() => setActiveRoute('backtester')}
                className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container hover:bg-primary text-xs font-bold"
              >
                Przetestuj w Backtesterze
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs tabular-nums">
              <thead>
                <tr className="bg-surface-container text-on-surface-variant text-[10px] uppercase">
                  <th className="py-2 px-3">Czas zamknięcia</th>
                  <th className="py-2 px-3">Para</th>
                  <th className="py-2 px-3">Kierunek</th>
                  <th className="py-2 px-3">Wejście</th>
                  <th className="py-2 px-3">Wyjście</th>
                  <th className="py-2 px-3">Notional</th>
                  <th className="py-2 px-3">Opłaty</th>
                  <th className="py-2 px-3">Powód</th>
                  <th className="py-2 px-3 text-right">PnL Netto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-container/60">
                    <td className="py-2 px-3 text-on-surface-variant">{formatShortDateTime(t.closedAt)}</td>
                    <td className="py-2 px-3 font-bold text-on-surface">{t.displayPair}</td>
                    <td className="py-2 px-3">
                      <span className={t.side === 'LONG' ? 'text-tertiary font-bold' : 'text-error font-bold'}>
                        {t.side} {t.leverage}x
                      </span>
                    </td>
                    <td className="py-2 px-3">{formatPrice(t.entryPrice)}</td>
                    <td className="py-2 px-3">{formatPrice(t.exitPrice)}</td>
                    <td className="py-2 px-3">{formatUsd(t.notionalUsd)}</td>
                    <td className="py-2 px-3 text-on-surface-variant">{formatUsd(t.feesUsd)}</td>
                    <td className="py-2 px-3 text-on-surface-variant">{t.exitReason}</td>
                    <td
                      className={`py-2 px-3 text-right font-bold ${
                        t.netPnlUsd >= 0 ? 'text-tertiary' : 'text-error'
                      }`}
                    >
                      {formatUsd(t.netPnlUsd, true)} ({t.netPnlPct >= 0 ? '+' : ''}
                      {t.netPnlPct.toFixed(2)}%)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
