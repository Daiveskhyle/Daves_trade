// Shared types for Daves Trade dashboard

export type ThemeMode = 'auto' | 'light' | 'dark';
export type MarketFilter = 'ALL' | 'CRYPTO' | 'FOREX' | 'COMMODITIES';
export type TabSection = 'signals' | 'watchlist' | 'analytics' | 'profile';
export type SignalFeedMode = 'ACTIVE' | 'HISTORY';
export type HistoryFilter = 'ALL' | 'WINS' | 'LOSSES';

/** Trading style used for signal classification + filter chips */
export type TradingStyle =
  | 'ALL'
  | 'TREND'
  | 'REVERSAL'
  | 'SCALP'
  | 'SWING'
  | 'BREAKOUT';

export interface Signal {
  id: string;
  pair: string;
  category: 'CRYPTO' | 'FOREX' | 'COMMODITIES';
  type: 'LONG' | 'SHORT';
  leverage: number;
  strategy: string;
  riskReward: string;
  status: 'ACTIVE' | 'TP1 HIT' | 'STOPPED' | 'PENDING';
  entry: number;
  currentPrice: number;
  target1: number;
  /** Optional second take-profit (partial scale-out) */
  target2?: number;
  stopLoss: number;
  confidence: number;
  timeAgo: string;
  /** Margin allocated in USD */
  positionSizeUsd: number;
  /** Classified trading style for filtering */
  tradingStyle: Exclude<TradingStyle, 'ALL'>;
  /** Dollar risk if SL is hit */
  riskUsd?: number;
  /** Short human rationale chips from confluence tags */
  rationale?: string;
  /** Engine quality score magnitude */
  qualityScore?: number;
  /** Auto-calculated lot / units from balance × risk% ÷ volatility */
  lotSize?: number;
  /** Human label e.g. "0.25 lots" or "0.12 BTC" */
  lotLabel?: string;
}

export interface ClosedTrade {
  id: string;
  pair: string;
  type: 'LONG' | 'SHORT';
  leverage: number;
  entry: number;
  exitPrice: number;
  pnlPercent: number;
  /** Realized profit/loss in US Dollars */
  pnlAmount: number;
  result: 'WIN' | 'LOSS';
  strategy: string;
  closedAt: string;
  positionSizeUsd: number;
  tradingStyle: Exclude<TradingStyle, 'ALL'>;
}

export interface TickerItem {
  pair: string;
  symbol: string;
  price: string;
  rawPrice: number;
  change: string;
  high24h: string;
  low24h: string;
  volume: string;
  up: boolean;
  isRemovable?: boolean;
  isFavorite?: boolean;
  /** CRYPTO | FOREX | COMMODITIES — drives data source + signal category */
  category?: 'CRYPTO' | 'FOREX' | 'COMMODITIES';
}

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PaletteColors {
  bg: string;
  topBarBg: string;
  cardBg: string;
  cardBorder: string;
  chipBg: string;
  chipBorder: string;
  matrixBg: string;
  bottomBarBg: string;
  bottomBorder: string;
  btnBg: string;
  btnBorder: string;
  copyBtn: string;
  inputBg: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accentGreen: string;
  accentGreenMuted: string;
  accentRed: string;
  accentRedMuted: string;
  accentAmber: string;
  accentAmberMuted: string;
  accentBlue: string;
  accentBlueMuted: string;
}
