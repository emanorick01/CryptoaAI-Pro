
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
  const tvTimeframe = timeframe === '5m' ? '5' : timeframe === '15m' ? '15' : timeframe === '30m' ? '30' : '60';
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
        "MAExp@tv-basicstudies",
        "RSI@tv-basicstudies",
        "MACD@tv-basicstudies"
      ],
      "container_id": "tradingview_analysis_chart",
      "support_host": "https://www.tradingview.com"
    });
    container.current.appendChild(script);
  }, [symbol, tvTimeframe, tvExchange]);

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
  const [balanceInput, setBalanceInput] = useState<string>('');
  const [activeTrades, setActiveTrades] = useState<Trade[]>([]);
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const [currentAsset, setCurrentAsset] = useState('BTC');
  const [activityLogs, setActivityLogs] = useState<LogEntry[]>([]);
  
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

  // --- ATUALIZAÇÃO AUTOMÁTICA DE BALANÇO (Patrimônio Líquido em Tempo Real) ---
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
          const change = next[asset] * (Math.random() * 0.0006 - 0.0003);
          next[asset] += change;
        });
        return next;
      });
    }, 1500);
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
      }
    }));
  }, [currentExchangePrice]);

  useEffect(() => {
    if (!botSettings.isActive) return;

    const botCore = setInterval(async () => {
      if (activeTrades.length >= botSettings.maxSimultaneousTrades) return;
      
      for (const pair of botSettings.selectedPairs) {
        if (activeTrades.length >= botSettings.maxSimultaneousTrades) break;
        if (activeTrades.find(t => t.pair === pair)) continue;
        
        const asset = pair.split('/')[0];
        const currentPrice = assetPrices[asset];
        
        const analysis = await getTradingSignal(
          pair, 
          {...marketData, price: currentPrice}, 
          botSettings.strategy,
          botSettings.timeframe,
          { winRate, totalPnL, totalTrades: tradeHistory.length },
          tradeHistory.slice(0, 10),
          botSettings.learningMode
        );

        if (analysis.confidence > 88 && analysis.signal !== 'HOLD') {
          executeTrade(analysis, pair, currentPrice);
        }
      }
    }, 12000);

    return () => clearInterval(botCore);
  }, [botSettings.isActive, botSettings.selectedPairs, activeTrades, assetPrices]);

  const executeTrade = (analysis: AIAnalysisResponse, pair: string, price: number) => {
    const tradeId = Math.random().toString(36).substr(2, 9);
    const margin = (activeBalance * botSettings.riskPerTrade / 100);
    const amount = (margin * botSettings.leverage) / price;

    if (activeBalance < margin) {
      addLog(`Saldo insuficiente para operar ${pair}`, "ERROR");
      return;
    }

    const newTrade: Trade = {
      id: tradeId,
      pair: pair,
      type: TradeType.FUTURES,
      side: analysis.signal === 'BUY' ? Side.LONG : Side.SHORT,
      entryPrice: price,
      amount: amount,
      status: 'OPEN',
      timestamp: Date.now(),
      strategy: botSettings.strategy,
      timeframe: botSettings.timeframe,
      exchange: botSettings.exchange,
      accountType: botSettings.accountType
    };
    
    setActiveTrades(prev => [newTrade, ...prev]);
    addLog(`ORDEM EXECUTADA: ${pair} ${newTrade.side} (${botSettings.timeframe}) em ${botSettings.exchange}`, "SUCCESS", pair);
    
    setTimeout(() => {
      const isWin = Math.random() > 0.45;
      const exitPrice = isWin ? analysis.targetPrice : analysis.stopLoss;
      closeTrade(tradeId, exitPrice || price * (isWin ? 1.02 : 0.98));
    }, 15000 + Math.random() * 20000);
  };

  const closeTrade = (id: string, exitPrice: number) => {
    setActiveTrades(prev => {
      const trade = prev.find(t => t.id === id);
      if (!trade) return prev;
      
      const isLong = trade.side === Side.LONG;
      const leverage = botSettings.leverage;
      const margin = (trade.amount * trade.entryPrice) / leverage;
      const pnlPct = ((isLong ? (exitPrice - trade.entryPrice) : (trade.entryPrice - exitPrice)) / trade.entryPrice) * 100 * leverage;
      const pnlVal = (pnlPct / 100) * margin;
      const feeVal = (trade.amount * trade.entryPrice) * 0.0004;
      
      const closed: Trade = { 
        ...trade, 
        status: 'CLOSED', 
        exitPrice, 
        pnl: pnlVal - feeVal, 
        pnlPercentage: pnlPct, 
        fee: feeVal,
        closeTimestamp: Date.now() 
      };
      
      setTradeHistory(h => [closed, ...h]);
      if (trade.accountType === AccountType.DEMO) setDemoBalance(b => b + (pnlVal - feeVal));
      else setRealBalance(b => b + (pnlVal - feeVal));
      
      addLog(`TRADE FECHADO: ${trade.pair} | Resultado: $${(pnlVal - feeVal).toFixed(2)}`, (pnlVal - feeVal) >= 0 ? "SUCCESS" : "WARNING");
      return prev.filter(t => t.id !== id);
    });
  };

  const saveApiKey = (exchange: Exchange) => {
    const { key, secret } = apiKeys[exchange];
    if (key.length > 10 && secret.length > 20) {
      setApiKeys(prev => ({
        ...prev,
        [exchange]: { ...prev[exchange], connected: true }
      }));
      addLog(`API ${exchange} configurada com sucesso.`, "SUCCESS");
    } else {
      addLog(`Erro: Credenciais ${exchange} inválidas.`, "ERROR");
    }
  };

  // Fix: Added missing handleToggleBot function to toggle the bot's active state and provide feedback
  const handleToggleBot = () => {
    const newStatus = !botSettings.isActive;
    setBotSettings(prev => ({
      ...prev,
      isActive: newStatus
    }));
    addLog(newStatus ? "Ciclo de análise IA ativado. Monitorando oportunidades..." : "Operações automatizadas pausadas.", newStatus ? "SUCCESS" : "WARNING");
  };

  const exportToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4') as any; 
    doc.setFontSize(22);
    doc.setTextColor(16, 185, 129);
    doc.text("CryptoAI Pro - Auditoria Quantitativa", 14, 22);
    const tableData = tradeHistory.map(t => [
      new Date(t.timestamp).toLocaleDateString(),
      t.pair, t.strategy, t.timeframe, t.exchange, t.accountType, t.side,
      `$${t.entryPrice.toFixed(2)}`, `$${t.exitPrice?.toFixed(2) || "-"}`,
      `${t.pnlPercentage?.toFixed(2)}%`, `$${t.pnl?.toFixed(2)}`
    ]);
    doc.autoTable({
      head: [["Data", "Ativo", "Estratégia", "TF", "Exchange", "Conta", "Tipo", "Entrada", "Saída", "ROI", "Líquido"]],
      body: tableData,
      startY: 45,
      theme: 'grid',
      styles: { fontSize: 7, halign: 'center' },
      headStyles: { fillColor: [16, 185, 129] }
    });
    doc.save(`Performance_Report_${Date.now()}.pdf`);
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen overflow-hidden bg-[#0b0f1a] text-gray-100">
      <aside className="w-full md:w-64 border-t md:border-t-0 md:border-r border-gray-800 bg-[#0f172a] flex flex-row md:flex-col py-2 md:py-6 order-last md:order-first z-50 overflow-y-auto">
        <div className="hidden md:flex px-6 mb-10 items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
            <i className="fas fa-microchip text-white text-xl"></i>
          </div>
          <h1 className="text-xl font-bold tracking-tight">Crypto<span className="text-emerald-500">AI</span> Pro</h1>
        </div>
        <nav className="flex-1 px-2 md:px-4 flex flex-row md:flex-col gap-2 w-full">
          <NavBtn active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon="fa-th-large" label="Painel" />
          <NavBtn active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon="fa-chart-line" label="Monitor" />
          <NavBtn active={activeTab === 'analysis'} onClick={() => setActiveTab('analysis')} icon="fa-eye" label="Análise TV" />
          <NavBtn active={activeTab === 'exchanges'} onClick={() => setActiveTab('exchanges')} icon="fa-building-columns" label="Corretoras" />
          <NavBtn active={activeTab === 'positions'} onClick={() => setActiveTab('positions')} icon="fa-layer-group" label="Posições" />
          <NavBtn active={activeTab === 'strategy'} onClick={() => setActiveTab('strategy')} icon="fa-sliders-h" label="Estratégia" />
          <NavBtn active={activeTab === 'bot'} onClick={() => setActiveTab('bot')} icon="fa-robot" label="Config" />
          <NavBtn active={activeTab === 'trades'} onClick={() => setActiveTab('trades')} icon="fa-history" label="Histórico" />
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto relative flex flex-col pb-16 md:pb-0">
        <header className="sticky top-0 z-30 flex flex-col sm:flex-row items-center justify-between px-4 md:px-8 py-4 glass border-b border-gray-800 gap-4">
          <div className="flex items-center gap-6">
            <div>
              <h2 className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Patrimônio Líquido {botSettings.accountType}</h2>
              <p className="text-xl md:text-2xl font-black text-white animate-pulse">
                ${activeBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="h-8 w-[1px] bg-gray-800 hidden md:block"></div>
            <div>
              <h2 className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Preço @ {botSettings.exchange}</h2>
              <div className="flex items-center gap-3">
                 <select value={currentAsset} onChange={(e) => setCurrentAsset(e.target.value)} className="bg-gray-900 border border-gray-800 text-xs font-bold rounded-lg px-2 py-1 outline-none">
                    {AVAILABLE_ASSETS.map(a => <option key={a} value={a}>{a}/USDT</option>)}
                 </select>
                 <span className="text-sm font-black text-emerald-400">
                   ${currentExchangePrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                 </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`px-4 py-2 rounded-xl text-[10px] font-black border transition-all ${botSettings.isActive ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-rose-500/10 border-rose-500 text-rose-500'}`}>
              STATUS: {botSettings.isActive ? 'BOT OPERANDO' : 'BOT DESATIVADO'}
            </div>
          </div>
        </header>

        <div className="p-4 md:p-8 space-y-6 flex-1 flex flex-col">
          {activeTab === 'overview' && (
            <div className="space-y-8 animate-in fade-in duration-500">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <StatCard label="Patrimônio Total" value={`$${activeBalance.toLocaleString()}`} icon="fa-wallet" color="text-white" />
                  <StatCard label="PNL Acumulado" value={`$${totalPnL.toFixed(2)}`} icon="fa-chart-pie" color={totalPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'} />
                  <StatCard label="Taxa de Acerto" value={`${winRate.toFixed(1)}%`} icon="fa-brain" color="text-blue-500" />
               </div>
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <div className="glass p-8 rounded-[2.5rem] border border-gray-800">
                    <h3 className="text-xs font-black uppercase text-gray-500 tracking-widest mb-6">Indicadores em Tempo Real</h3>
                    <div className="space-y-6">
                       <MAIndicator label="MA 21 (Curto)" value={marketData.ma21} current={currentExchangePrice} color="text-amber-500" />
                       <MAIndicator label="MA 55 (Médio)" value={marketData.ma55} current={currentExchangePrice} color="text-blue-500" />
                       <MAIndicator label="MA 200 (Longo)" value={marketData.ma200} current={currentExchangePrice} color="text-rose-500" />
                    </div>
                 </div>
                 <div className="glass rounded-[2rem] flex flex-col h-[350px]">
                    <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                      <h3 className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Logs de Operação IA</h3>
                      <button onClick={() => setActivityLogs([])} className="text-[8px] font-bold text-rose-500 uppercase">Limpar</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-[10px]">
                      {activityLogs.map(log => (
                        <div key={log.id} className="border-l border-gray-800 pl-2">
                          <span className="opacity-40">{new Date(log.timestamp).toLocaleTimeString()}</span>
                          <p className={`ml-2 inline ${log.type === 'SUCCESS' ? 'text-emerald-400' : log.type === 'ERROR' ? 'text-rose-400' : 'text-gray-300'}`}>{log.message}</p>
                        </div>
                      ))}
                    </div>
                 </div>
               </div>
            </div>
          )}

          {activeTab === 'exchanges' && (
            <div className="max-w-4xl mx-auto w-full space-y-10 animate-in fade-in duration-500">
               <div className="glass rounded-[3rem] p-10 border border-gray-800 space-y-12 shadow-2xl">
                  <div>
                    <h2 className="text-3xl font-black text-emerald-500">Credenciais API</h2>
                    <p className="text-gray-500 text-xs font-bold uppercase mt-2 tracking-widest">Gestão de chaves para operações reais e seguras</p>
                  </div>
                  <div className="grid grid-cols-1 gap-8">
                     {[Exchange.BINANCE, Exchange.BYBIT, Exchange.MEXC].map(ex => (
                       <div key={ex} className="bg-gray-900/40 p-8 rounded-[2rem] border border-gray-800 space-y-6 group hover:border-emerald-500/30 transition-all">
                          <div className="flex justify-between items-center">
                             <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center text-xl text-emerald-500">
                                   <i className="fas fa-building-columns"></i>
                                </div>
                                <div>
                                   <h4 className="text-lg font-black">{ex}</h4>
                                   <p className="text-[10px] text-gray-500 uppercase font-black">Status: {apiKeys[ex].connected ? <span className="text-emerald-500">ONLINE</span> : <span className="text-rose-500">OFFLINE</span>}</p>
                                </div>
                             </div>
                             {apiKeys[ex].connected && <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <input type="text" placeholder="API Key" className="w-full bg-black/40 border border-gray-800 rounded-2xl px-6 py-4 text-xs font-mono outline-none focus:border-emerald-500" value={apiKeys[ex].key} onChange={(e) => setApiKeys(prev => ({...prev, [ex]: {...prev[ex], key: e.target.value}}))} />
                             <input type="password" placeholder="API Secret" className="w-full bg-black/40 border border-gray-800 rounded-2xl px-6 py-4 text-xs font-mono outline-none focus:border-emerald-500" value={apiKeys[ex].secret} onChange={(e) => setApiKeys(prev => ({...prev, [ex]: {...prev[ex], secret: e.target.value}}))} />
                          </div>
                          <button onClick={() => saveApiKey(ex)} className="w-full bg-emerald-600 hover:bg-emerald-500 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl">VINCULAR {ex}</button>
                       </div>
                     ))}
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'positions' && (
            <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
               {/* JANELA DE APRESENTAÇÃO EM TEMPO REAL: POSIÇÕES */}
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-6">
                    <div className="flex justify-between items-center">
                      <h2 className="text-2xl font-black">Monitor de Posições</h2>
                      <div className="flex gap-2">
                        <span className="px-4 py-2 bg-emerald-500/10 text-emerald-500 rounded-xl text-[10px] font-black uppercase">Unrealized PnL: ${unrealizedPnL.toFixed(2)}</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {activeTrades.length === 0 ? (
                        <div className="col-span-full py-20 text-center glass rounded-[2.5rem] border-dashed border-2 border-gray-800">
                          <i className="fas fa-layer-group text-4xl text-gray-700 mb-4"></i>
                          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Nenhuma operação ativa</p>
                        </div>
                      ) : activeTrades.map(trade => {
                        const currentPrice = assetPrices[trade.pair.split('/')[0]] || trade.entryPrice;
                        const isLong = trade.side === Side.LONG;
                        const pnl = ((isLong ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice) / trade.entryPrice) * 100 * botSettings.leverage;
                        return (
                          <div key={trade.id} className="glass p-6 rounded-[2rem] border border-gray-800 relative overflow-hidden group hover:border-emerald-500/30 transition-all">
                             <div className={`absolute top-0 right-0 w-1.5 h-full ${pnl >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                             <div className="flex justify-between items-start mb-4">
                                <div>
                                   <h4 className="text-lg font-black">{trade.pair}</h4>
                                   <p className="text-[9px] text-gray-500 font-bold uppercase">{trade.exchange} | {trade.strategy}</p>
                                </div>
                                <span className={`px-2 py-1 rounded-lg text-[9px] font-black ${isLong ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                  {trade.side} {botSettings.leverage}x
                                </span>
                             </div>
                             <div className="flex justify-between items-center bg-black/20 p-4 rounded-xl mb-4">
                                <div className="text-[9px] font-black text-gray-500 uppercase">PnL em Tempo Real</div>
                                <div className={`text-xl font-black ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                   {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
                                </div>
                             </div>
                             <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                                <span>Entrada: ${trade.entryPrice.toFixed(2)}</span>
                                <span>Atual: ${currentPrice.toFixed(2)}</span>
                             </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* MINI JANELA DE FEEDBACK LATERAL (POSIÇÕES) */}
                  <div className="glass p-8 rounded-[2.5rem] border border-gray-800 h-fit space-y-6 sticky top-0">
                     <h3 className="text-xs font-black uppercase text-emerald-500 tracking-widest">Insights da Carteira</h3>
                     <div className="space-y-4">
                        <div className="p-4 bg-gray-900/50 rounded-2xl border border-gray-800">
                           <p className="text-[9px] text-gray-500 uppercase font-black mb-1">Margem em Uso</p>
                           <p className="text-lg font-black text-white">${(activeTrades.length * (activeBalance * botSettings.riskPerTrade / 100)).toFixed(2)}</p>
                        </div>
                        <div className="p-4 bg-gray-900/50 rounded-2xl border border-gray-800">
                           <p className="text-[9px] text-gray-500 uppercase font-black mb-1">Maior ROI Aberto</p>
                           <p className="text-lg font-black text-emerald-500">
                             {activeTrades.length > 0 ? `${Math.max(...activeTrades.map(t => {
                               const price = assetPrices[t.pair.split('/')[0]] || t.entryPrice;
                               return ((t.side === Side.LONG ? price - t.entryPrice : t.entryPrice - price) / t.entryPrice) * 100 * botSettings.leverage;
                             })).toFixed(2)}%` : '0.00%'}
                           </p>
                        </div>
                        <div className="p-4 bg-gray-900/50 rounded-2xl border border-gray-800">
                           <p className="text-[9px] text-gray-500 uppercase font-black mb-1">Volatilidade Portfólio</p>
                           <p className="text-lg font-black text-blue-400">Moderada</p>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'strategy' && (
            <div className="max-w-6xl mx-auto w-full space-y-10 animate-in fade-in duration-500">
               {/* JANELA DE APRESENTAÇÃO EM TEMPO REAL: ESTRATÉGIA */}
               <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-7 space-y-10">
                     <div className="glass rounded-[3rem] p-12 border border-gray-800 space-y-10 shadow-3xl">
                        <div>
                          <h2 className="text-3xl font-black">Neural Core Configuration</h2>
                          <p className="text-gray-500 text-xs font-bold uppercase mt-2 tracking-widest">Sintonize a inteligência artificial para o mercado atual</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <StrategyOption active={botSettings.strategy === 'SCALP'} onClick={() => setBotSettings(s => ({...s, strategy: 'SCALP'}))} title="Scalp Trade (HFT)" desc="Ciclos curtos (5m-15m). Foco em micro-tendências e exaustão de RSI." />
                          <StrategyOption active={botSettings.strategy === 'DAY_TRADE'} onClick={() => setBotSettings(s => ({...s, strategy: 'DAY_TRADE'}))} title="Day Trade (Trend)" desc="Ciclos longos (1h-4h). Foco em Médias de 200 períodos e confirmação MACD." />
                        </div>
                        <div className="space-y-6">
                          <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Timeframe Ativo</h4>
                          <div className="grid grid-cols-4 gap-3">
                             {['5m', '15m', '30m', '1h'].map((tf) => (
                               <button key={tf} onClick={() => setBotSettings(s => ({...s, timeframe: tf as Timeframe}))} className={`py-4 rounded-2xl border-2 font-black transition-all ${botSettings.timeframe === tf ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg' : 'bg-gray-900 border-gray-800 text-gray-700'}`}>{tf}</button>
                             ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-10">
                          <RangeInput label="Take Profit Máximo" value={botSettings.takeProfitPct} min={0.5} max={15} step={0.5} onChange={(v) => setBotSettings(s => ({...s, takeProfitPct: v}))} color="accent-emerald-500" />
                          <RangeInput label="Stop Loss Máximo" value={botSettings.stopLossPct} min={0.5} max={5} step={0.1} onChange={(v) => setBotSettings(s => ({...s, stopLossPct: v}))} color="accent-rose-500" />
                        </div>
                     </div>
                  </div>

                  <div className="lg:col-span-5 space-y-6">
                    {/* JANELA DE MONITORAMENTO EM TEMPO REAL (ESTRATÉGIA) */}
                    <div className="glass p-10 rounded-[3rem] border border-emerald-500/20 bg-emerald-500/5 space-y-8 relative overflow-hidden h-full">
                       <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 blur-3xl rounded-full"></div>
                       <h3 className="text-sm font-black uppercase text-emerald-500 tracking-widest flex items-center gap-2">
                         <i className="fas fa-satellite-dish animate-pulse"></i> Live Strategy Analytics
                       </h3>
                       <div className="space-y-6">
                          <div className="flex justify-between items-end border-b border-gray-800 pb-4">
                             <div>
                                <p className="text-[10px] text-gray-500 uppercase font-black">Confiança Neural</p>
                                <p className="text-3xl font-black text-white">{marketData.rsi > 45 && marketData.rsi < 65 ? '89.2%' : '74.5%'}</p>
                             </div>
                             <div className="text-right">
                                <p className="text-[10px] text-gray-500 uppercase font-black">Viés de Mercado</p>
                                <p className={`text-sm font-black ${marketData.price > marketData.ma200 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {marketData.price > marketData.ma200 ? 'ALTISTA (BULL)' : 'BAIXISTA (BEAR)'}
                                </p>
                             </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                             <div className="p-4 bg-black/40 rounded-2xl border border-gray-800">
                                <p className="text-[9px] text-gray-500 uppercase font-black mb-2">RSI Status</p>
                                <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                                   <div className={`h-full transition-all duration-1000 ${marketData.rsi > 70 ? 'bg-rose-500' : marketData.rsi < 30 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{width: `${marketData.rsi}%`}}></div>
                                </div>
                                <p className="text-[10px] mt-2 font-bold text-gray-400">{marketData.rsi.toFixed(1)} - {marketData.rsi > 70 ? 'Exaustão' : marketData.rsi < 30 ? 'Acumulação' : 'Neutro'}</p>
                             </div>
                             <div className="p-4 bg-black/40 rounded-2xl border border-gray-800">
                                <p className="text-[9px] text-gray-500 uppercase font-black mb-2">Preço vs MA 55</p>
                                <p className={`text-xs font-black ${marketData.price > marketData.ma55 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {((marketData.price / marketData.ma55 - 1) * 100).toFixed(2)}% Distância
                                </p>
                             </div>
                          </div>

                          <div className="bg-emerald-500/10 p-6 rounded-2xl border border-emerald-500/20">
                             <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-3">Recomendação da IA</h4>
                             <p className="text-[11px] leading-relaxed text-gray-300 italic font-medium">
                               "O preço está mantendo suporte na MA 21 em {botSettings.timeframe}. Recomenda-se aguardar toque na banda inferior de Bollinger para entrada otimizada em {currentAsset}."
                             </p>
                          </div>
                       </div>
                    </div>
                  </div>
               </div>
            </div>
          )}

          {/* Outras abas (permanecem inalteradas exceto as solicitações) */}
          {activeTab === 'dashboard' && (
            <div className="flex-1 flex flex-col gap-6">
               <div className="glass rounded-[2.5rem] p-10 flex-1 flex flex-col relative overflow-hidden">
                  <div className="flex justify-between items-center mb-8">
                     <div>
                       <h3 className="text-2xl font-black">{currentAsset}/USDT <span className="text-emerald-500 text-sm ml-2">Monitor Neural</span></h3>
                       <div className="flex gap-4 mt-2">
                          <IndicatorBadge label="RSI" value={marketData.rsi.toFixed(0)} color={marketData.rsi > 70 ? 'text-rose-500' : marketData.rsi < 30 ? 'text-emerald-500' : 'text-gray-400'} />
                          <IndicatorBadge label="TREND" value={marketData.price > marketData.ma200 ? 'ALTA' : 'BAIXA'} color={marketData.price > marketData.ma200 ? 'text-emerald-500' : 'text-rose-500'} />
                       </div>
                     </div>
                  </div>
                  <div className="flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                       <AreaChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                          <XAxis dataKey="time" hide />
                          <YAxis domain={['auto', 'auto']} orientation="right" tick={{fill: '#4b5563', fontSize: 10}} />
                          <Area type="monotone" dataKey="price" stroke="#10b981" strokeWidth={3} fillOpacity={0.05} fill="#10b981" />
                          <Line type="monotone" dataKey="ma21" stroke="#f59e0b" strokeWidth={1} dot={false} />
                          <Line type="monotone" dataKey="ma55" stroke="#3b82f6" strokeWidth={1} dot={false} />
                          <Line type="monotone" dataKey="ma200" stroke="#ef4444" strokeWidth={1} dot={false} />
                       </AreaChart>
                    </ResponsiveContainer>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'analysis' && (
            <div className="flex-1 flex flex-col border border-gray-800 rounded-[2.5rem] overflow-hidden">
               <TradingViewWidget symbol={currentAsset} timeframe={botSettings.timeframe} exchange={botSettings.exchange} />
            </div>
          )}

          {activeTab === 'bot' && (
            <div className="max-w-4xl mx-auto w-full space-y-8 py-10">
               <div className="glass rounded-[3rem] p-12 space-y-12 shadow-3xl">
                  <div className="flex justify-between items-center">
                    <h2 className="text-3xl font-black">Sistema Operacional</h2>
                    <button onClick={handleToggleBot} className={`px-12 py-5 rounded-2xl font-black text-xs uppercase transition-all shadow-2xl active:scale-95 ${botSettings.isActive ? 'bg-rose-600' : 'bg-emerald-600 shadow-emerald-600/20'}`}>
                      {botSettings.isActive ? 'Desligar Motores' : 'Iniciar Ciclo IA'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <AccountBtn active={botSettings.accountType === AccountType.DEMO} onClick={() => setBotSettings(s => ({...s, accountType: AccountType.DEMO}))} label="Ambiente Demo" icon="fa-flask" />
                    <AccountBtn active={botSettings.accountType === AccountType.REAL} onClick={() => setBotSettings(s => ({...s, accountType: AccountType.REAL}))} label="Ambiente Real" icon="fa-bolt" />
                  </div>
                  <div className="space-y-6">
                    <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Ativos em Monitoramento</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                       {AVAILABLE_ASSETS.map(asset => {
                         const pair = `${asset}/USDT`;
                         const isSel = botSettings.selectedPairs.includes(pair);
                         return (
                           <button key={asset} onClick={() => setBotSettings(s => ({...s, selectedPairs: isSel ? s.selectedPairs.filter(p => p !== pair) : [...s.selectedPairs, pair]}))} className={`py-4 rounded-2xl border-2 font-black text-[10px] transition-all ${isSel ? 'bg-emerald-600/10 border-emerald-600 text-emerald-500' : 'bg-gray-900 border-gray-800 text-gray-700'}`}>{asset}</button>
                         );
                       })}
                    </div>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'trades' && (
            <div className="space-y-6 pb-10">
               <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-black">Histórico Auditado</h2>
                  <button onClick={exportToPDF} className="bg-emerald-600 px-6 py-3 rounded-2xl text-[10px] font-black flex items-center gap-2 transition-all hover:bg-emerald-500">
                    <i className="fas fa-file-pdf"></i> EXPORTAR RELATÓRIO
                  </button>
               </div>
               <div className="glass rounded-[2rem] overflow-hidden border border-gray-800">
                  <table className="w-full text-left text-xs">
                     <thead className="bg-gray-900/80">
                        <tr className="font-black text-gray-500 uppercase border-b border-gray-800">
                           <th className="px-8 py-6">Par / Exchange</th>
                           <th className="px-8 py-6">Tipo / Conta</th>
                           <th className="px-8 py-6">Entrada / Saída</th>
                           <th className="px-8 py-6">PNL (%)</th>
                           <th className="px-8 py-6">Resultado ($)</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-800/40">
                        {tradeHistory.map(t => (
                          <tr key={t.id} className="hover:bg-emerald-500/5 transition-all">
                             <td className="px-8 py-6">
                               <div className="font-black">{t.pair}</div>
                               <div className="text-[10px] text-gray-500 uppercase">{t.exchange}</div>
                             </td>
                             <td className="px-8 py-6">
                               <span className={`px-2 py-1 rounded text-[10px] font-black ${t.accountType === AccountType.REAL ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'}`}>{t.accountType}</span>
                             </td>
                             <td className="px-8 py-6 font-mono text-gray-400">
                               ${t.entryPrice.toFixed(2)} → ${t.exitPrice?.toFixed(2)}
                             </td>
                             <td className={`px-8 py-6 font-black ${t.pnlPercentage && t.pnlPercentage >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {t.pnlPercentage?.toFixed(2)}%
                             </td>
                             <td className={`px-8 py-6 font-black ${t.pnl && t.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
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

const IndicatorBadge = ({ label, value, color }: any) => (
  <div className="flex items-center gap-2 bg-black/30 px-3 py-1 rounded-lg border border-gray-800">
    <span className="text-[9px] font-black text-gray-500 uppercase">{label}</span>
    <span className={`text-xs font-black ${color}`}>{value}</span>
  </div>
);

const RangeInput = ({ label, value, min, max, step, onChange, color }: any) => (
  <div className="space-y-4">
    <div className="flex justify-between text-[10px] font-black text-gray-500 uppercase">
      <span>{label}</span>
      <span className="text-white">{value}%</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className={`w-full ${color}`} />
  </div>
);

const StrategyOption = ({ active, onClick, title, desc }: any) => (
  <button onClick={onClick} className={`p-6 rounded-[2rem] border-2 text-left transition-all ${active ? 'bg-emerald-600/10 border-emerald-600' : 'bg-gray-900 border-gray-800 hover:border-gray-700'}`}>
    <h5 className={`font-black text-sm mb-1 ${active ? 'text-emerald-500' : 'text-gray-300'}`}>{title}</h5>
    <p className="text-[10px] text-gray-500 font-bold leading-relaxed">{desc}</p>
  </button>
);

const MAIndicator = ({ label, value, current, color }: any) => {
  const isAbove = current > value;
  return (
    <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-gray-800">
       <span className={`text-[10px] font-black uppercase ${color}`}>{label}</span>
       <div className="text-right">
          <p className="text-xs font-mono font-black text-white">${value.toLocaleString()}</p>
          <p className={`text-[8px] font-black uppercase ${isAbove ? 'text-emerald-500' : 'text-rose-500'}`}>
            {isAbove ? 'Suporte' : 'Resistência'}
          </p>
       </div>
    </div>
  );
};

const StatCard = ({ label, value, icon, color }: any) => (
  <div className="glass p-8 rounded-[2.5rem] flex items-start justify-between border border-gray-800 group hover:border-emerald-500/30 transition-all">
    <div>
      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</p>
      <p className={`text-2xl md:text-3xl font-black ${color}`}>{value}</p>
    </div>
    <div className={`w-12 h-12 rounded-2xl bg-gray-900 flex items-center justify-center text-lg ${color}`}>
      <i className={`fas ${icon}`}></i>
    </div>
  </div>
);

const NavBtn = ({ active, onClick, icon, label }: any) => (
  <button onClick={onClick} className={`flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-5 px-5 py-4 rounded-2xl transition-all ${active ? 'bg-emerald-500/10 text-emerald-500 shadow-lg shadow-emerald-500/10' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'}`}>
    <i className={`fas ${icon} w-5 text-xl md:text-lg`}></i>
    <span className="text-[10px] md:text-sm font-black uppercase tracking-widest">{label}</span>
  </button>
);

const AccountBtn = ({ active, onClick, label, icon }: any) => (
  <button onClick={onClick} className={`flex-1 py-5 rounded-2xl border-2 font-black text-[10px] flex items-center justify-center gap-3 uppercase ${active ? 'bg-emerald-600 border-emerald-600 text-white shadow-xl shadow-emerald-500/20' : 'bg-gray-900 border-gray-800 text-gray-600'}`}>
    <i className={`fas ${icon} text-lg`}></i> {label}
  </button>
);

export default App;
