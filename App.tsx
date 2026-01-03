
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, LineChart, Line
} from 'recharts';
import { Trade, TradeType, Side, MarketData, BotSettings, AIAnalysisResponse, Exchange, PerformanceStats, AccountType, LogEntry, Timeframe, StrategyType } from './types';
import { getTradingSignal } from './services/geminiService';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const INITIAL_DEMO_BALANCE = 10000;
const AVAILABLE_ASSETS = ['BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'LINK', 'MATIC', 'AVAX', 'XRP', 'DOGE'];

const generateChartData = (basePrice: number) => {
  return Array.from({ length: 60 }, (_, i) => {
    const price = basePrice + Math.random() * (basePrice * 0.015) - (basePrice * 0.0075);
    return {
      time: i,
      price: price,
      ma21: price * 1.002,
      ma55: price * 0.998,
      ma200: price * 0.99,
      b_upper: price * 1.02,
      b_lower: price * 0.98,
    };
  });
};

const TradingViewWidget: React.FC<{ symbol: string; timeframe: string; exchange: Exchange }> = ({ symbol, timeframe, exchange }) => {
  const container = useRef<HTMLDivElement>(null);
  
  // Mapeamento de timeframes para o padrão TradingView
  const getTvInterval = (tf: string) => {
    switch (tf) {
      case '5m': return '5';
      case '15m': return '15';
      case '30m': return '30';
      case '1h': return '60';
      case '4h': return '240';
      case '1d': return 'D';
      default: return '15';
    }
  };

  const tvTimeframe = getTvInterval(timeframe);
  const tvExchange = exchange === Exchange.BINANCE ? 'BINANCE' : exchange === Exchange.BYBIT ? 'BYBIT' : 'MEXC';

  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = '';
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      "autosize": true,
      "symbol": `${tvExchange}:${symbol}USDT`,
      "interval": tvTimeframe,
      "timezone": "Etc/UTC",
      "theme": "dark",
      "style": "1",
      "locale": "br",
      "enable_publishing": false,
      "hide_top_toolbar": false,
      "allow_symbol_change": true,
      "calendar": false,
      "studies": [
        "STD;Supertrend",
        "STD;Volume_Profile_Fixed_Range",
        "MAExp@tv-basicstudies",
        "MAExp@tv-basicstudies",
        "RSI@tv-basicstudies",
        "MACD@tv-basicstudies"
      ],
      "container_id": "tradingview_analysis_chart",
      "support_host": "https://www.tradingview.com"
    });
    container.current.appendChild(script);
  }, [symbol, timeframe, exchange]);

  return (
    <div className="tradingview-widget-container h-full w-full" ref={container}>
      <div id="tradingview_analysis_chart" className="h-full w-full"></div>
    </div>
  );
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'dashboard' | 'trades' | 'bot' | 'analysis' | 'strategy' | 'positions' | 'exchanges'>('overview');
  const [demoBalance, setDemoBalance] = useState(INITIAL_DEMO_BALANCE);
  const [realBalance, setRealBalance] = useState(0);
  const [activeTrades, setActiveTrades] = useState<Trade[]>([]);
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const [currentAsset, setCurrentAsset] = useState('BTC');
  const [activityLogs, setActivityLogs] = useState<LogEntry[]>([]);
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  const [apiKeys, setApiKeys] = useState<Record<Exchange, { key: string; secret: string; connected: boolean }>>({
    [Exchange.BINANCE]: { key: '', secret: '', connected: false },
    [Exchange.BYBIT]: { key: '', secret: '', connected: false },
    [Exchange.MEXC]: { key: '', secret: '', connected: false }
  });

  const [assetPrices, setAssetPrices] = useState<Record<string, number>>(
    AVAILABLE_ASSETS.reduce((acc, curr) => ({ ...acc, [curr]: 65000 + (Math.random() * 2000) }), {})
  );

  const [botSettings, setBotSettings] = useState<BotSettings>({
    isActive: false,
    strategy: 'SCALP',
    timeframe: '15m',
    leverage: 20,
    riskPerTrade: 2.0,
    maxSimultaneousTrades: 5,
    takeProfitPct: 2.5,
    stopLossPct: 1.2,
    selectedPairs: ['BTC/USDT', 'ETH/USDT'],
    exchange: Exchange.BINANCE,
    learningMode: true,
    notificationsEnabled: true,
    accountType: AccountType.DEMO
  });

  const [marketData, setMarketData] = useState<MarketData>({
    price: 65000,
    change24h: 0.5,
    volume: 1200000,
    rsi: 54,
    macd: { value: 0.05, signal: 0.02, histogram: 0.03 },
    bollinger: { upper: 66500, middle: 65000, lower: 63500, width: 2.5 },
    ma21: 65200,
    ma55: 64800,
    ma200: 62000,
    support: 64100,
    resistance: 66200,
    lta: true,
    ltb: false,
    volatility: 1.5
  });

  const [chartData, setChartData] = useState(generateChartData(65000));

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  };

  const unrealizedPnL = useMemo(() => {
    return activeTrades.reduce((acc, trade) => {
      const currentPrice = assetPrices[trade.pair.split('/')[0]] || trade.entryPrice;
      const isLong = trade.side === Side.LONG;
      const leverage = botSettings.leverage;
      const margin = (trade.amount * trade.entryPrice) / leverage;
      const pnlPct = ((isLong ? (currentPrice - trade.entryPrice) : (trade.entryPrice - currentPrice)) / trade.entryPrice) * 100 * leverage;
      return acc + ((pnlPct / 100) * margin);
    }, 0);
  }, [activeTrades, assetPrices, botSettings.leverage]);

  const activeBalance = useMemo(() => {
    const base = botSettings.accountType === AccountType.DEMO ? demoBalance : realBalance;
    return base + unrealizedPnL;
  }, [botSettings.accountType, demoBalance, realBalance, unrealizedPnL]);

  const totalPnL = useMemo(() => tradeHistory.reduce((acc, t) => acc + (t.pnl || 0), 0), [tradeHistory]);
  const winRate = useMemo(() => {
    if (tradeHistory.length === 0) return 0;
    return (tradeHistory.filter(t => (t.pnl || 0) > 0).length / tradeHistory.length) * 100;
  }, [tradeHistory]);

  const currentExchangePrice = useMemo(() => {
    const base = assetPrices[currentAsset] || 0;
    const offset = botSettings.exchange === Exchange.BINANCE ? 0 : 
                   botSettings.exchange === Exchange.BYBIT ? base * 0.0001 : 
                   -base * 0.0001;
    return base + offset;
  }, [assetPrices, currentAsset, botSettings.exchange]);

  const addLog = (message: string, type: LogEntry['type'] = 'INFO', pair?: string) => {
    setActivityLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      message,
      type,
      pair
    }, ...prev].slice(0, 100));
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setAssetPrices(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(asset => {
          const change = next[asset] * (Math.random() * 0.0008 - 0.0004);
          next[asset] += change;
        });
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const price = currentExchangePrice;
    setMarketData(prev => ({
      ...prev,
      price,
      rsi: Math.max(10, Math.min(90, prev.rsi + (Math.random() * 2 - 1))),
      bollinger: {
        ...prev.bollinger,
        upper: price * 1.025,
        lower: price * 0.975
      },
      ma21: price * (1 + (Math.random() * 0.002 - 0.001)),
      ma55: price * (0.99 + (Math.random() * 0.002 - 0.001)),
      ma200: price * (0.95 + (Math.random() * 0.002 - 0.001))
    }));
  }, [currentExchangePrice]);

  const handleToggleBot = () => {
    const newStatus = !botSettings.isActive;
    setBotSettings(prev => ({ ...prev, isActive: newStatus }));
    addLog(newStatus ? "Motor de Análise IA Iniciado." : "Estratégia Pausada.", newStatus ? "SUCCESS" : "WARNING");
  };

  const saveApiKey = (exchange: Exchange) => {
    const { key, secret } = apiKeys[exchange];
    if (key.length > 5 && secret.length > 5) {
      setApiKeys(prev => ({ ...prev, [exchange]: { ...prev[exchange], connected: true } }));
      addLog(`API ${exchange} vinculada com sucesso.`, "SUCCESS");
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4') as any; 
    doc.setFontSize(22);
    doc.setTextColor(16, 185, 129);
    doc.text("CryptoAI Pro - Performance Report", 14, 22);
    const tableData = tradeHistory.map(t => [
      new Date(t.timestamp).toLocaleDateString(),
      t.pair, t.exchange, t.side, `$${t.entryPrice.toFixed(2)}`, `$${t.exitPrice?.toFixed(2)}`,
      `${t.pnlPercentage?.toFixed(2)}%`, `$${t.pnl?.toFixed(2)}`
    ]);
    doc.autoTable({
      head: [["Data", "Par", "Exchange", "Lado", "Entrada", "Saída", "ROI", "PnL"]],
      body: tableData,
      startY: 40,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] }
    });
    doc.save(`CryptoAI_Report_${Date.now()}.pdf`);
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen overflow-hidden bg-[#0b0f1a] text-gray-100 safe-area-bottom">
      
      <aside className="fixed bottom-0 left-0 w-full md:relative md:w-64 border-t md:border-t-0 md:border-r border-gray-800 bg-[#0f172a]/95 backdrop-blur-xl md:bg-[#0f172a] flex flex-row md:flex-col z-[100] pb-safe md:pb-0 h-[70px] md:h-full">
        <div className="hidden md:flex px-6 py-8 items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <i className="fas fa-microchip text-white text-xl"></i>
          </div>
          <h1 className="text-xl font-black tracking-tighter">Crypto<span className="text-emerald-500">AI</span></h1>
        </div>
        
        <nav className="flex-1 flex flex-row md:flex-col justify-around md:justify-start px-1 md:px-4 py-2 md:gap-2 w-full">
          <NavBtn active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon="fa-th-large" label="Painel" />
          <NavBtn active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon="fa-chart-line" label="Monitor" />
          <NavBtn active={activeTab === 'analysis'} onClick={() => setActiveTab('analysis')} icon="fa-eye" label="Análise" />
          <NavBtn active={activeTab === 'strategy'} onClick={() => setActiveTab('strategy')} icon="fa-sliders-h" label="Estratégia" />
          <NavBtn active={activeTab === 'positions'} onClick={() => setActiveTab('positions')} icon="fa-layer-group" label="Posições" />
          <NavBtn active={activeTab === 'exchanges'} onClick={() => setActiveTab('exchanges')} icon="fa-building-columns" label="APIs" />
          <NavBtn active={activeTab === 'bot'} onClick={() => setActiveTab('bot')} icon="fa-robot" label="Setup" />
          <NavBtn active={activeTab === 'trades'} onClick={() => setActiveTab('trades')} icon="fa-history" label="Histórico" className="hidden md:flex" />
        </nav>

        {installPrompt && (
          <div className="hidden md:block p-4 mt-auto">
            <button onClick={handleInstallClick} className="w-full bg-emerald-600/10 border border-emerald-500/20 text-emerald-500 p-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all">
              <i className="fas fa-download mr-2"></i> Instalar App
            </button>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-y-auto relative flex flex-col pb-[80px] md:pb-0">
        <header className="sticky top-0 z-50 flex items-center justify-between px-4 md:px-8 py-4 glass border-b border-gray-800 shadow-2xl">
          <div className="flex items-center gap-4 md:gap-8">
            <div className="flex flex-col">
              <h2 className="text-[9px] text-gray-500 font-black uppercase tracking-widest">Equity {botSettings.accountType}</h2>
              <p className="text-lg md:text-2xl font-black text-white leading-none">
                ${activeBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="h-8 w-[1px] bg-gray-800 hidden sm:block"></div>
            <div className="flex flex-col">
              <h2 className="text-[9px] text-gray-500 font-black uppercase tracking-widest">Real-time {botSettings.exchange}</h2>
              <div className="flex items-center gap-2">
                 <select value={currentAsset} onChange={(e) => setCurrentAsset(e.target.value)} className="bg-transparent border-none text-[10px] md:text-sm font-black outline-none cursor-pointer">
                    {AVAILABLE_ASSETS.map(a => <option key={a} value={a} className="bg-[#0f172a]">{a}/USDT</option>)}
                 </select>
                 <span className="text-xs md:text-sm font-black text-emerald-400 animate-live">
                   ${currentExchangePrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                 </span>
              </div>
            </div>
          </div>
          <button onClick={handleToggleBot} className={`px-4 py-2 rounded-xl text-[9px] font-black border transition-all ${botSettings.isActive ? 'bg-emerald-500 border-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-rose-500/10 border-rose-500 text-rose-500'}`}>
            {botSettings.isActive ? 'OPERANDO' : 'DESATIVADO'}
          </button>
        </header>

        <div className="p-4 md:p-8 space-y-6 flex-1 flex flex-col">
          
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-in fade-in duration-500">
               <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
                  <StatCard label="Patrimônio" value={`$${activeBalance.toLocaleString()}`} icon="fa-wallet" color="text-white" />
                  <StatCard label="PNL Acumulado" value={`$${totalPnL.toFixed(2)}`} icon="fa-chart-pie" color={totalPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'} />
                  <StatCard label="Win Rate" value={`${winRate.toFixed(1)}%`} icon="fa-brain" color="text-blue-500" className="col-span-2 md:col-span-1" />
               </div>
               
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <div className="glass p-6 md:p-8 rounded-[2rem] border border-gray-800 shadow-xl">
                    <h3 className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-6 flex items-center gap-2">
                       <i className="fas fa-wave-square text-emerald-500"></i> Alinhamento de Médias Móveis
                    </h3>
                    <div className="space-y-4">
                       <MAIndicator label="MA 21 (SHORT)" value={marketData.ma21} current={currentExchangePrice} color="text-amber-500" />
                       <MAIndicator label="MA 55 (MID)" value={marketData.ma55} current={currentExchangePrice} color="text-blue-500" />
                       <MAIndicator label="MA 200 (LONG)" value={marketData.ma200} current={currentExchangePrice} color="text-rose-500" />
                    </div>
                 </div>
                 
                 <div className="glass rounded-[2rem] border border-gray-800 flex flex-col h-[350px] overflow-hidden">
                    <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/20">
                      <h3 className="text-[10px] font-black uppercase text-gray-500 tracking-widest">IA Intelligence Stream</h3>
                      <button onClick={() => setActivityLogs([])} className="text-[9px] font-black text-rose-500 uppercase">Clear</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-[10px]">
                      {activityLogs.map(log => (
                        <div key={log.id} className="border-l-2 border-gray-800 pl-3 py-1">
                          <span className="opacity-40 block mb-1">{new Date(log.timestamp).toLocaleTimeString()}</span>
                          <p className={`inline leading-relaxed ${log.type === 'SUCCESS' ? 'text-emerald-400 font-bold' : log.type === 'ERROR' ? 'text-rose-400' : 'text-gray-300'}`}>{log.message}</p>
                        </div>
                      ))}
                    </div>
                 </div>
               </div>
            </div>
          )}

          {activeTab === 'analysis' && (
            <div className="flex-1 flex flex-col border border-gray-800 rounded-[2.5rem] overflow-hidden min-h-[500px] glass">
               <div className="p-4 border-b border-gray-800 flex flex-wrap items-center justify-between gap-4 bg-gray-900/30">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                      <i className="fas fa-chart-line text-emerald-500 text-xs"></i>
                    </div>
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">TradingView Advanced <span className="text-white">| {currentAsset}</span></h3>
                  </div>
                  <div className="flex bg-gray-900/50 p-1 rounded-xl border border-gray-800">
                     {['5m', '15m', '30m', '1h', '4h', '1d'].map(tf => (
                       <button 
                        key={tf} 
                        onClick={() => setBotSettings(s => ({...s, timeframe: tf as Timeframe}))}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${botSettings.timeframe === tf ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-gray-500 hover:text-gray-300'}`}
                       >
                         {tf}
                       </button>
                     ))}
                  </div>
               </div>
               <div className="flex-1 relative">
                 <TradingViewWidget symbol={currentAsset} timeframe={botSettings.timeframe} exchange={botSettings.exchange} />
                 {/* Overlay de Preço Real-Time */}
                 <div className="absolute top-4 right-4 z-10 glass px-4 py-2 rounded-xl border border-emerald-500/20 pointer-events-none">
                    <p className="text-[8px] font-black text-gray-500 uppercase">Live {currentAsset}</p>
                    <p className="text-sm font-black text-emerald-400 animate-live">${currentExchangePrice.toLocaleString()}</p>
                 </div>
               </div>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="flex flex-col gap-4 h-[calc(100vh-200px)]">
               <div className="glass rounded-[2.5rem] p-4 md:p-8 flex-1 flex flex-col relative overflow-hidden border border-gray-800">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                     <div>
                       <h3 className="text-xl font-black">{currentAsset}/USDT <span className="text-emerald-500 text-[10px] ml-2 font-black uppercase">Deep Neural Flow</span></h3>
                       <div className="flex flex-wrap gap-2 mt-2">
                          <IndicatorBadge label="RSI" value={marketData.rsi.toFixed(0)} color={marketData.rsi > 70 ? 'text-rose-500' : marketData.rsi < 30 ? 'text-emerald-500' : 'text-gray-400'} />
                          <IndicatorBadge label="BOL W" value={`${marketData.bollinger.width.toFixed(1)}%`} color="text-blue-400" />
                          <IndicatorBadge label="TREND" value={marketData.price > marketData.ma200 ? 'BULL' : 'BEAR'} color={marketData.price > marketData.ma200 ? 'text-emerald-500' : 'text-rose-500'} />
                       </div>
                     </div>
                  </div>
                  <div className="flex-1 min-h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                       <AreaChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} opacity={0.3} />
                          <XAxis dataKey="time" hide />
                          <YAxis domain={['auto', 'auto']} orientation="right" tick={{fill: '#4b5563', fontSize: 10}} />
                          <Area type="monotone" dataKey="price" stroke="#10b981" strokeWidth={3} fillOpacity={0.1} fill="#10b981" />
                          <Line type="monotone" dataKey="ma21" stroke="#f59e0b" strokeWidth={1} dot={false} strokeDasharray="5 5" />
                          <Line type="monotone" dataKey="ma55" stroke="#3b82f6" strokeWidth={1} dot={false} strokeDasharray="5 5" />
                       </AreaChart>
                    </ResponsiveContainer>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'bot' && (
            <div className="max-w-5xl mx-auto w-full space-y-8 py-4 animate-in fade-in duration-500">
               <div className="flex justify-between items-center px-4">
                  <h2 className="text-2xl font-black text-white">Central de Setup <span className="text-emerald-500">IA</span></h2>
                  <div className={`px-4 py-2 rounded-xl text-[10px] font-black border ${botSettings.isActive ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-rose-500/10 border-rose-500 text-rose-500'}`}>
                    {botSettings.isActive ? 'SISTEMA ONLINE' : 'SISTEMA OFFLINE'}
                  </div>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Janela de Configurações */}
                  <div className="lg:col-span-7 glass rounded-[2.5rem] p-8 md:p-10 border border-gray-800 space-y-10">
                     <div className="grid grid-cols-2 gap-4">
                        <AccountBtn active={botSettings.accountType === AccountType.DEMO} onClick={() => setBotSettings(s => ({...s, accountType: AccountType.DEMO}))} label="Ambiente Demo" icon="fa-flask" />
                        <AccountBtn active={botSettings.accountType === AccountType.REAL} onClick={() => setBotSettings(s => ({...s, accountType: AccountType.REAL}))} label="Ambiente Real" icon="fa-bolt" />
                     </div>

                     <div className="space-y-6">
                        <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Configuração Operacional</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                           <RangeInput label="Risco por Trade" value={botSettings.riskPerTrade} min={0.1} max={5} step={0.1} onChange={(v) => setBotSettings(s => ({...s, riskPerTrade: v}))} color="accent-emerald-500" />
                           <RangeInput label="Alavancagem" value={botSettings.leverage} min={1} max={125} step={1} onChange={(v) => setBotSettings(s => ({...s, leverage: v}))} color="accent-amber-500" />
                        </div>
                     </div>

                     <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Pares Selecionados</h4>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                           {AVAILABLE_ASSETS.map(asset => {
                             const pair = `${asset}/USDT`;
                             const isSelected = botSettings.selectedPairs.includes(pair);
                             return (
                               <button 
                                key={asset} 
                                onClick={() => setBotSettings(s => ({...s, selectedPairs: isSelected ? s.selectedPairs.filter(p => p !== pair) : [...s.selectedPairs, pair]}))}
                                className={`py-3 rounded-xl border text-[9px] font-black transition-all ${isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-500'}`}
                               >
                                 {asset}
                               </button>
                             );
                           })}
                        </div>
                     </div>
                  </div>

                  {/* Janela de Apresentação dos Dados (Operational Summary) */}
                  <div className="lg:col-span-5 space-y-6 h-full">
                     <div className="glass p-10 rounded-[3rem] border border-emerald-500/20 bg-emerald-500/5 h-full relative overflow-hidden flex flex-col">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full"></div>
                        <h3 className="text-xs font-black uppercase text-emerald-500 tracking-widest mb-8 flex items-center gap-2">
                          <i className="fas fa-microchip animate-pulse"></i> Resumo Operacional IA
                        </h3>
                        
                        <div className="flex-1 space-y-6">
                           <DataRow label="Exchange Ativa" value={botSettings.exchange} />
                           <DataRow label="Modo Operacional" value={botSettings.strategy} />
                           <DataRow label="Timeframe Monitorado" value={botSettings.timeframe} />
                           <DataRow label="Margem de Risco" value={`${botSettings.riskPerTrade}%`} />
                           <DataRow label="Stop Automático" value={`${botSettings.stopLossPct}%`} color="text-rose-500" />
                           <DataRow label="Alvo Médio" value={`${botSettings.takeProfitPct}%`} color="text-emerald-500" />
                           
                           <div className="mt-8 p-6 bg-gray-900/40 rounded-[1.5rem] border border-gray-800 space-y-3">
                              <p className="text-[9px] font-black text-gray-500 uppercase">Estado da Rede Neural</p>
                              <div className="flex items-center gap-2">
                                 <div className={`w-2 h-2 rounded-full ${botSettings.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-700'}`}></div>
                                 <span className="text-[10px] font-bold text-gray-300">{botSettings.isActive ? 'Monitorando Sinais' : 'Sincronização Pendente'}</span>
                              </div>
                              <p className="text-[8px] text-gray-500 leading-relaxed mt-2 italic">
                                "A IA está pronta para executar ordens {botSettings.strategy} no timeframe de {botSettings.timeframe} com alavancagem de {botSettings.leverage}x na {botSettings.exchange}."
                              </p>
                           </div>
                        </div>

                        <button 
                          onClick={handleToggleBot}
                          className={`mt-10 w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-2xl active:scale-95 ${botSettings.isActive ? 'bg-rose-600 shadow-rose-600/30' : 'bg-emerald-600 shadow-emerald-600/30'}`}
                        >
                          {botSettings.isActive ? 'Desligar Motores' : 'Iniciar Ciclo IA'}
                        </button>
                     </div>
                  </div>
               </div>
            </div>
          )}

          {/* Outras abas permanecem com o comportamento original */}
          {activeTab === 'strategy' && (
            <div className="max-w-6xl mx-auto w-full space-y-6 animate-in slide-in-from-bottom-4 duration-500">
               <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-7 glass rounded-[2.5rem] p-6 md:p-10 border border-gray-800 space-y-8">
                     <div className="flex flex-col">
                        <h2 className="text-2xl font-black text-white">Configuração da IA</h2>
                        <p className="text-gray-500 text-[10px] font-black uppercase mt-1 tracking-widest">Ajuste o comportamento neural</p>
                     </div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <StrategyOption active={botSettings.strategy === 'SCALP'} onClick={() => setBotSettings(s => ({...s, strategy: 'SCALP'}))} title="HFT Scalping" desc="Ciclos de 5m. Foco em bandas de Bollinger e RSI extremo." />
                        <StrategyOption active={botSettings.strategy === 'DAY_TRADE'} onClick={() => setBotSettings(s => ({...s, strategy: 'DAY_TRADE'}))} title="Trend Following" desc="Ciclos de 1h. Foco em cruzamento de MA 21/55/200." />
                     </div>
                     <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Risk Management</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <RangeInput label="Alvo de Take Profit" value={botSettings.takeProfitPct} min={0.5} max={15} step={0.5} onChange={(v) => setBotSettings(s => ({...s, takeProfitPct: v}))} color="accent-emerald-500" />
                          <RangeInput label="Limite de Stop Loss" value={botSettings.stopLossPct} min={0.5} max={10} step={0.1} onChange={(v) => setBotSettings(s => ({...s, stopLossPct: v}))} color="accent-rose-500" />
                        </div>
                     </div>
                  </div>
                  
                  <div className="lg:col-span-5 glass p-6 md:p-10 rounded-[2.5rem] border border-emerald-500/10 bg-emerald-500/5 space-y-6">
                     <h3 className="text-sm font-black uppercase text-emerald-500 tracking-widest flex items-center gap-2">
                        <i className="fas fa-brain animate-pulse"></i> Neural Analytics Live
                     </h3>
                     <div className="space-y-6">
                        <div className="flex justify-between items-end border-b border-gray-800/50 pb-4">
                           <div>
                              <p className="text-[9px] text-gray-500 uppercase font-black">Market Sentiment</p>
                              <p className={`text-xl font-black ${marketData.price > marketData.ma200 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                 {marketData.price > marketData.ma200 ? 'Bullish (Alta)' : 'Bearish (Baixa)'}
                              </p>
                           </div>
                           <div className="text-right">
                              <p className="text-[9px] text-gray-500 uppercase font-black">AI Confidence</p>
                              <p className="text-xl font-black text-white">88.4%</p>
                           </div>
                        </div>
                        <div className="bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20 text-[11px] leading-relaxed text-emerald-100 font-medium italic">
                           "A inteligência detectou suporte institucional na MA 55 em {botSettings.timeframe}. Recomenda-se cautela em novas posições até confirmação de volume nas Bandas de Bollinger."
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'exchanges' && (
            <div className="max-w-4xl mx-auto w-full space-y-6 animate-in fade-in duration-500">
               <div className="glass rounded-[2.5rem] p-6 md:p-10 border border-gray-800 space-y-8 shadow-2xl">
                  <div className="flex flex-col">
                    <h2 className="text-2xl font-black text-emerald-500">Broker API Sync</h2>
                    <p className="text-gray-500 text-[10px] font-black uppercase mt-1 tracking-widest">Conecte sua conta para operações em tempo real</p>
                  </div>
                  <div className="grid grid-cols-1 gap-6">
                     {[Exchange.BINANCE, Exchange.BYBIT, Exchange.MEXC].map(ex => (
                       <div key={ex} className="bg-gray-900/40 p-6 rounded-[1.5rem] border border-gray-800 space-y-4 group hover:border-emerald-500/20 transition-all">
                          <div className="flex justify-between items-center">
                             <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center text-emerald-500">
                                   <i className="fas fa-link"></i>
                                </div>
                                <div>
                                   <h4 className="text-sm font-black">{ex}</h4>
                                   <p className="text-[9px] font-black uppercase text-gray-500">Status: {apiKeys[ex].connected ? 'Conectado' : 'Offline'}</p>
                                </div>
                             </div>
                             {apiKeys[ex].connected && <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-lg shadow-emerald-500/50"></div>}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                             <input type="text" placeholder="API Key" className="w-full bg-black/40 border border-gray-800 rounded-xl px-4 py-3 text-[10px] font-mono outline-none focus:border-emerald-500 transition-all" value={apiKeys[ex].key} onChange={(e) => setApiKeys(prev => ({...prev, [ex]: {...prev[ex], key: e.target.value}}))} />
                             <input type="password" placeholder="API Secret" className="w-full bg-black/40 border border-gray-800 rounded-xl px-4 py-3 text-[10px] font-mono outline-none focus:border-emerald-500 transition-all" value={apiKeys[ex].secret} onChange={(e) => setApiKeys(prev => ({...prev, [ex]: {...prev[ex], secret: e.target.value}}))} />
                          </div>
                          <button onClick={() => saveApiKey(ex)} className="w-full bg-emerald-600 hover:bg-emerald-500 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all">Link {ex} API</button>
                       </div>
                     ))}
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'positions' && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-2xl font-black flex items-center gap-3">
                      Posições Abertas <span className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full text-[10px] font-black">{activeTrades.length} Ativas</span>
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {activeTrades.length === 0 ? (
                        <div className="col-span-full py-20 text-center glass rounded-[2rem] border-dashed border-2 border-gray-800">
                           <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Nenhuma posição em aberto no momento</p>
                        </div>
                      ) : activeTrades.map(trade => {
                        const price = assetPrices[trade.pair.split('/')[0]] || trade.entryPrice;
                        const pnl = ((trade.side === Side.LONG ? price - trade.entryPrice : trade.entryPrice - price) / trade.entryPrice) * 100 * botSettings.leverage;
                        return (
                          <div key={trade.id} className="glass p-5 rounded-[1.5rem] border border-gray-800 group hover:border-emerald-500/30 transition-all">
                             <div className="flex justify-between items-start mb-4">
                                <div>
                                   <h4 className="text-sm font-black">{trade.pair}</h4>
                                   <p className="text-[9px] text-gray-500 font-bold uppercase">{trade.exchange} | {trade.strategy}</p>
                                </div>
                                <span className={`px-2 py-1 rounded-lg text-[9px] font-black ${trade.side === Side.LONG ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                  {trade.side} {botSettings.leverage}x
                                </span>
                             </div>
                             <div className={`p-4 rounded-xl mb-4 flex justify-between items-center ${pnl >= 0 ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-rose-500/10 border border-rose-500/20'}`}>
                                <span className="text-[9px] font-black text-gray-500 uppercase">Unrealized PnL</span>
                                <span className={`text-lg font-black ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                   {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
                                </span>
                             </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div className="glass p-6 md:p-8 rounded-[2.5rem] border border-gray-800 h-fit space-y-6">
                     <h3 className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Wallet Insights</h3>
                     <div className="space-y-4">
                        <InsightRow label="Margem Utilizada" value={`$${(activeTrades.length * (activeBalance * botSettings.riskPerTrade / 100)).toFixed(2)}`} />
                        <InsightRow label="Floating PnL" value={`$${unrealizedPnL.toFixed(2)}`} color={unrealizedPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'} />
                        <InsightRow label="Risco Atual" value="Baixo / IA Protegida" color="text-blue-400" />
                     </div>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'trades' && (
            <div className="space-y-6 pb-10">
               <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-black">Histórico Geral</h2>
                  <button onClick={exportToPDF} className="bg-emerald-600 px-5 py-3 rounded-xl text-[9px] font-black flex items-center gap-2 hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/20">
                    <i className="fas fa-file-pdf"></i> RELATÓRIO PDF
                  </button>
               </div>
               <div className="glass rounded-[2rem] overflow-hidden border border-gray-800 overflow-x-auto">
                  <table className="w-full text-left text-[10px] md:text-xs">
                     <thead>
                        <tr className="font-black text-gray-500 uppercase border-b border-gray-800 bg-gray-900/40">
                           <th className="px-6 py-5">Ativo / Exchange</th>
                           <th className="px-6 py-5">Tipo</th>
                           <th className="px-6 py-5">PnL (%)</th>
                           <th className="px-6 py-5">Líquido ($)</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-800/40">
                        {tradeHistory.map(t => (
                          <tr key={t.id} className="hover:bg-emerald-500/5 transition-all">
                             <td className="px-6 py-5">
                               <div className="font-black text-white">{t.pair}</div>
                               <div className="opacity-40">{t.exchange}</div>
                             </td>
                             <td className="px-6 py-5">
                               <span className={`px-2 py-0.5 rounded text-[8px] font-black ${t.accountType === AccountType.REAL ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'}`}>{t.accountType}</span>
                             </td>
                             <td className={`px-6 py-5 font-black ${t.pnlPercentage && t.pnlPercentage >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {t.pnlPercentage?.toFixed(2)}%
                             </td>
                             <td className={`px-6 py-5 font-black ${t.pnl && t.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                ${t.pnl?.toFixed(2)}
                             </td>
                          </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

// UI REUSABLE COMPONENTS
const InsightRow = ({ label, value, color = "text-white" }: any) => (
  <div className="flex justify-between items-center border-b border-gray-800/40 pb-3">
    <span className="text-[9px] font-black text-gray-500 uppercase">{label}</span>
    <span className={`text-xs font-black ${color}`}>{value}</span>
  </div>
);

const DataRow = ({ label, value, color = "text-white" }: any) => (
  <div className="flex justify-between items-center border-b border-gray-800/20 pb-2">
    <span className="text-[8px] font-black text-gray-500 uppercase tracking-tighter">{label}</span>
    <span className={`text-[10px] font-black ${color}`}>{value}</span>
  </div>
);

const NavBtn = ({ active, onClick, icon, label, className = "" }: any) => (
  <button onClick={onClick} className={`flex flex-col md:flex-row items-center gap-1 md:gap-4 px-2 md:px-5 py-2 md:py-4 rounded-xl transition-all ${active ? 'bg-emerald-500/10 text-emerald-500' : 'text-gray-500 hover:text-gray-300'} ${className}`}>
    <i className={`fas ${icon} text-lg md:text-sm`}></i>
    <span className="text-[8px] md:text-[10px] font-black uppercase tracking-tighter md:tracking-widest">{label}</span>
  </button>
);

const StatCard = ({ label, value, icon, color, className = "" }: any) => (
  <div className={`glass p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] flex flex-col justify-between border border-gray-800 hover:border-emerald-500/20 transition-all ${className}`}>
    <div className="flex justify-between items-start mb-2">
      <span className="text-[8px] md:text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
      <i className={`fas ${icon} ${color} text-xs`}></i>
    </div>
    <p className={`text-sm md:text-xl font-black ${color}`}>{value}</p>
  </div>
);

const IndicatorBadge = ({ label, value, color }: any) => (
  <div className="flex items-center gap-2 bg-black/30 px-2 py-1 rounded-lg border border-gray-800">
    <span className="text-[8px] font-black text-gray-500 uppercase">{label}</span>
    <span className={`text-[10px] font-black ${color}`}>{value}</span>
  </div>
);

const MAIndicator = ({ label, value, current, color }: any) => {
  const isAbove = current > value;
  return (
    <div className="flex items-center justify-between p-3 md:p-4 bg-gray-900/40 rounded-xl border border-gray-800/50">
       <span className={`text-[9px] font-black uppercase ${color}`}>{label}</span>
       <div className="text-right">
          <p className="text-[10px] font-mono font-black text-white">${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
          <p className={`text-[8px] font-black uppercase ${isAbove ? 'text-emerald-500' : 'text-rose-500'}`}>
            {isAbove ? 'Suporte' : 'Resistência'}
          </p>
       </div>
    </div>
  );
};

const RangeInput = ({ label, value, min, max, step, onChange, color }: any) => (
  <div className="space-y-2">
    <div className="flex justify-between text-[9px] font-black text-gray-500 uppercase">
      <span>{label}</span>
      <span className="text-white">{value}%</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className={`w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer ${color}`} />
  </div>
);

const StrategyOption = ({ active, onClick, title, desc }: any) => (
  <button onClick={onClick} className={`p-5 rounded-2xl border-2 text-left transition-all h-full ${active ? 'bg-emerald-600/10 border-emerald-600' : 'bg-gray-900 border-gray-800 hover:border-gray-700'}`}>
    <h5 className={`font-black text-[11px] mb-1 ${active ? 'text-emerald-500' : 'text-gray-300'}`}>{title}</h5>
    <p className="text-[9px] text-gray-500 font-bold leading-tight">{desc}</p>
  </button>
);

const AccountBtn = ({ active, onClick, label, icon }: any) => (
  <button onClick={onClick} className={`flex-1 py-4 rounded-xl border-2 font-black text-[9px] flex items-center justify-center gap-2 uppercase transition-all ${active ? 'bg-emerald-600 border-emerald-600 text-white shadow-xl' : 'bg-gray-900 border-gray-800 text-gray-600'}`}>
    <i className={`fas ${icon}`}></i> {label}
  </button>
);

export default App;
