import React from 'react';
import { Layout } from './components/Layout';
import { BotProvider, useBot } from './engine/botContext';
import { ApiSystemView } from './views/ApiSystemView';
import { BacktesterView } from './views/BacktesterView';
import { DashboardView } from './views/DashboardView';
import { HistoryView } from './views/HistoryView';
import { ScannerView } from './views/ScannerView';
import { StrategyView } from './views/StrategyView';

const ActiveRouteView: React.FC = () => {
  const { activeRoute } = useBot();

  switch (activeRoute) {
    case 'dashboard':
      return <DashboardView />;
    case 'skaner-rynku':
      return <ScannerView />;
    case 'historia-i-analityka':
      return <HistoryView />;
    case 'strategia-i-ryzyko':
      return <StrategyView />;
    case 'backtester':
      return <BacktesterView />;
    case 'api-i-system':
      return <ApiSystemView />;
    default:
      return <DashboardView />;
  }
};

export default function App() {
  return (
    <BotProvider>
      <Layout>
        <ActiveRouteView />
      </Layout>
    </BotProvider>
  );
}
