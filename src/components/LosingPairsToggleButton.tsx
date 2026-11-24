import React, { useMemo, useState } from 'react';
import { PauseCircle, PlayCircle } from 'lucide-react';
import { useBot } from '../engine/botContext';
import { formatUsd } from '../engine/format';

interface LosingPairsToggleButtonProps {
  size?: 'sm' | 'xs';
}

export const LosingPairsToggleButton: React.FC<LosingPairsToggleButtonProps> = ({ size = 'sm' }) => {
  const { config, losingPairs, setPausedPairsBatch } = useBot();
  const [busyAction, setBusyAction] = useState<'pause' | 'resume' | null>(null);

  const { activeLosing, pausedLosing, otherPausedBases } = useMemo(() => {
    const pausedSet = new Set(config.pausedPairs);
    const activeLosingList = losingPairs.filter((p) => !pausedSet.has(p.base));
    const pausedLosingList = losingPairs.filter((p) => pausedSet.has(p.base));
    const losingSet = new Set(losingPairs.map((p) => p.base));
    const activeSet = new Set(config.activePairs);
    const otherPaused = config.pausedPairs.filter((b) => activeSet.has(b) && !losingSet.has(b));
    return {
      activeLosing: activeLosingList,
      pausedLosing: pausedLosingList,
      otherPausedBases: otherPaused,
    };
  }, [config.pausedPairs, config.activePairs, losingPairs]);

  const padClass =
    size === 'xs'
      ? 'px-2.5 py-1 text-[10px] gap-1'
      : 'px-3 py-1.5 text-[11px] gap-1.5';
  const iconClass = size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  const handleDisableLosing = async () => {
    if (busyAction || activeLosing.length === 0) return;
    setBusyAction('pause');
    try {
      await setPausedPairsBatch(
        activeLosing.map((p) => p.base),
        true,
        'tracące pary'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleEnablePaused = async (bases: string[], label: string) => {
    if (busyAction || bases.length === 0) return;
    setBusyAction('resume');
    try {
      await setPausedPairsBatch(bases, false, label);
    } finally {
      setBusyAction(null);
    }
  };

  // Case 1: Zero losing pairs and zero paused pairs
  if (losingPairs.length === 0 && otherPausedBases.length === 0) {
    return (
      <button
        type="button"
        disabled
        title="Żadna aktywna para nie ma obecnie ujemnego wyniku netto w historii zamkniętych transakcji."
        className={`rounded-lg bg-surface-container-high/60 border border-white/5 text-on-surface-variant/70 font-mono font-bold uppercase tracking-wider flex items-center whitespace-nowrap shrink-0 cursor-not-allowed ${padClass}`}
      >
        <PauseCircle className={iconClass} />
        <span>Brak tracących par</span>
      </button>
    );
  }

  // Case 2: Zero losing pairs, but some manually paused pairs exist -> 1-click resume all paused
  if (losingPairs.length === 0 && otherPausedBases.length > 0) {
    return (
      <button
        type="button"
        disabled={busyAction !== null}
        onClick={() => void handleEnablePaused(otherPausedBases, 'wstrzymane pary')}
        title={`Włącz ponownie wstrzymane pary: ${otherPausedBases.join(', ')}`}
        className={`rounded-lg bg-tertiary-container/20 border border-tertiary/40 text-tertiary hover:bg-tertiary hover:text-on-tertiary font-mono font-bold uppercase tracking-wider flex items-center transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${padClass}`}
      >
        <PlayCircle className={iconClass} />
        <span>
          {busyAction === 'resume' ? 'Włączanie...' : `Włącz wstrzymane (${otherPausedBases.length})`}
        </span>
      </button>
    );
  }

  const activeLosingTooltip = activeLosing
    .map((p) => `${p.base} (${formatUsd(p.netPnlUsd, true)})`)
    .join(', ');
  const pausedLosingTooltip = pausedLosing
    .map((p) => `${p.base} (${formatUsd(p.netPnlUsd, true)})`)
    .join(', ');

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {activeLosing.length > 0 && (
        <button
          type="button"
          disabled={busyAction !== null}
          onClick={() => void handleDisableLosing()}
          title={`Jednym kliknięciem wstrzymaj nowe wejścia na parach ze stratą netto: ${activeLosingTooltip}`}
          className={`rounded-lg bg-error-container/25 border border-error/40 text-error hover:bg-error hover:text-on-error font-mono font-bold uppercase tracking-wider flex items-center transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${padClass}`}
        >
          <PauseCircle className={iconClass} />
          <span>
            {busyAction === 'pause'
              ? 'Wyłączanie...'
              : pausedLosing.length > 0
                ? `Wyłącz kolejne tracące (${activeLosing.length})`
                : `Wyłącz tracące (${activeLosing.length})`}
          </span>
        </button>
      )}

      {pausedLosing.length > 0 && (
        <button
          type="button"
          disabled={busyAction !== null}
          onClick={() =>
            void handleEnablePaused(
              pausedLosing.map((p) => p.base),
              'tracące pary'
            )
          }
          title={`Włącz ponownie wstrzymane tracące pary: ${pausedLosingTooltip}`}
          className={`rounded-lg bg-tertiary-container/20 border border-tertiary/40 text-tertiary hover:bg-tertiary hover:text-on-tertiary font-mono font-bold uppercase tracking-wider flex items-center transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${padClass}`}
        >
          <PlayCircle className={iconClass} />
          <span>
            {busyAction === 'resume' ? 'Włączanie...' : `Włącz tracące (${pausedLosing.length})`}
          </span>
        </button>
      )}
    </div>
  );
};
