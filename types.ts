
export enum TradeType {
  SPOT = 'SPOT',
  FUTURES = 'FUTURES'
}

export enum Side {
  BUY = 'BUY',
  SELL = 'SELL',
  LONG = 'LONG',
  SHORT = 'SHORT'
}

export enum Exchange {
  BINANCE = 'BINANCE',
  BYBIT = 'BYBIT',
  MEXC = 'MEXC'
}

export enum AccountType {
  DEMO = 'DEMO',
  REAL = 'REAL'
}

export type Timeframe = '5m' | '15m' | '30m' | '1h' | '4h' | '1d';
export type StrategyType = 'SCALP' | 'DAY_TRADE';

// Fix: Added missing PerformanceStats interface to satisfy App.tsx imports and improve type safety
export interface PerformanceStats {
  winRate: number;
  totalPnL: number;
  totalTrades: number;
}

export interface Trade {
  id: string;
  pair: string;
  type: TradeType;
  side: Side;
  entryPrice: number;
  exitPrice?: number;
  amount: number;
  status: 'OPEN' | 'CLOSED' | 'PENDING';
  pnl?: number;
  pnlPercentage?: number;
  fee?: number;
  timestamp: number;
  closeTimestamp?: number;
  strategy: string;
  timeframe: Timeframe;
  exchange: Exchange;
  accountType: AccountType;
}

export interface MarketData {
  price: number;
  change24h: number;
  volume: number;
  rsi: number;
  macd: {
    value: number;
    signal: number;
    histogram: number;
  };
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
    width: number; // Volatility indicator
  };
  ma21: number;
  ma55: number;
  ma200: number;
  support: number;
  resistance: number;
  lta: boolean; // Preço acima da linha de tendência de alta
  ltb: boolean; // Preço abaixo da linha de tendência de baixa
  volatility: number;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  message: string;
  pair?: string;
}

export interface BotSettings {
  isActive: boolean;
  strategy: StrategyType;
  timeframe: Timeframe;
  leverage: number;
  riskPerTrade: number; 
  maxSimultaneousTrades: number;
  takeProfitPct: number;
  stopLossPct: number;
  selectedPairs: string[];
  exchange: Exchange;
  learningMode: boolean;
  notificationsEnabled: boolean;
  accountType: AccountType;
}

export interface AIAnalysisResponse {
  signal: 'BUY' | 'SELL' | 'HOLD';
  reasoning: string;
  confidence: number;
  targetPrice: number;
  stopLoss: number;
  technicalDetails?: {
    rsiStatus: string;
    maAlignment: string;
    trendType: string;
  };
}
