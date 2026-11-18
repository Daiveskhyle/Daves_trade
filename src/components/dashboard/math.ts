import type { Candle, TradingStyle } from './types';

export const getPrecision = (price: number): number => {
  if (price < 0.0001) return 8;
  if (price < 0.01) return 6;
  if (price < 1) return 4;
  if (price < 10) return 3;
  return 2;
};

export const formatCryptoPrice = (price: number): string => {
  const dec = getPrecision(price);
  return price.toLocaleString(undefined, {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
};

export const calculateRSI = (closes: number[], period = 14): number => {
  if (closes.length <= period) return 50;
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};

export const calculateEMA = (closes: number[], period: number): number => {
  if (closes.length < period) return closes[closes.length - 1] || 0;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((acc, c) => acc + c, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
};

export const calculateATR = (candles: Candle[], period = 14): number => {
  if (candles.length < 2) return (candles[0]?.close || 1) * 0.018;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
};

// -------------------------------------------------------------
// HEIKIN ASHI
// -------------------------------------------------------------
export interface HeikinAshiCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  /** true = bullish (green), false = bearish (red) */
  isBull: boolean;
  /** body size relative to range (0–1). Low = doji / indecision */
  bodyRatio: number;
  /** upper wick present */
  hasUpperWick: boolean;
  /** lower wick present */
  hasLowerWick: boolean;
}

/** Convert regular OHLC candles to Heikin Ashi series */
export const toHeikinAshi = (candles: Candle[]): HeikinAshiCandle[] => {
  if (!candles.length) return [];

  const ha: HeikinAshiCandle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen =
      i === 0 ? (c.open + c.close) / 2 : (ha[i - 1].open + ha[i - 1].close) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    const body = Math.abs(haClose - haOpen);
    const range = haHigh - haLow || 1e-12;
    const bodyRatio = body / range;
    const isBull = haClose >= haOpen;

    ha.push({
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      isBull,
      bodyRatio,
      hasUpperWick: haHigh > Math.max(haOpen, haClose) + range * 0.05,
      hasLowerWick: haLow < Math.min(haOpen, haClose) - range * 0.05,
    });
  }
  return ha;
};

export interface HaAnalysis {
  /** Overall bias from recent HA sequence */
  isBullish: boolean;
  /** Consecutive same-color candles (strength of trend) */
  streak: number;
  /** Color flip on the latest candle (potential reversal) */
  justFlipped: boolean;
  /** Latest candle is small-body (doji / indecision) */
  isDoji: boolean;
  /** Strong trend: 3+ consecutive HA candles, solid bodies, few opposing wicks */
  isStrongTrend: boolean;
  /** HA close of latest bar */
  lastClose: number;
  /** Score contribution: -2 … +2 */
  biasScore: number;
}

/** Analyze last N Heikin Ashi candles for trend / reversal / doji */
export const analyzeHeikinAshi = (ha: HeikinAshiCandle[], lookback = 8): HaAnalysis => {
  if (ha.length < 2) {
    return {
      isBullish: true,
      streak: 0,
      justFlipped: false,
      isDoji: false,
      isStrongTrend: false,
      lastClose: ha[0]?.close ?? 0,
      biasScore: 0,
    };
  }

  const slice = ha.slice(-Math.min(lookback, ha.length));
  const last = slice[slice.length - 1];
  const prev = slice[slice.length - 2];

  let streak = 1;
  for (let i = slice.length - 2; i >= 0; i--) {
    if (slice[i].isBull === last.isBull) streak++;
    else break;
  }

  const justFlipped = last.isBull !== prev.isBull;
  const isDoji = last.bodyRatio < 0.25;

  // Strong trend: 3+ same color, solid body, and for bull no upper wick (or bear no lower)
  const solidBodies = slice.slice(-Math.min(3, streak)).every((c) => c.bodyRatio > 0.4);
  const isStrongTrend =
    streak >= 3 &&
    solidBodies &&
    (last.isBull ? !last.hasUpperWick || last.bodyRatio > 0.55 : !last.hasLowerWick || last.bodyRatio > 0.55);

  // Bias score: streak direction + flip penalty/bonus + doji dampener
  let biasScore = 0;
  if (last.isBull) biasScore += Math.min(2, streak * 0.4);
  else biasScore -= Math.min(2, streak * 0.4);

  if (justFlipped) {
    // Fresh flip is early signal — small boost in new direction
    biasScore += last.isBull ? 0.6 : -0.6;
  }
  if (isDoji) biasScore *= 0.5; // indecision reduces conviction

  return {
    isBullish: last.isBull,
    streak,
    justFlipped,
    isDoji,
    isStrongTrend,
    lastClose: last.close,
    biasScore: Number(biasScore.toFixed(2)),
  };
};

// -------------------------------------------------------------
// MULTI-FACTOR CONFLUENCE (HA + RSI + EMA + momentum + volume + structure)
// -------------------------------------------------------------
export interface ConfluenceResult {
  isLong: boolean;
  strategy: string;
  confidence: number;
  score: number;
  tags: string[];
  rsi: number;
  ema9: number;
  ema21: number;
  atr: number;
  /** Suggested stop distance in price units (ATR-based) */
  stopAtrMult: number;
  /** TP1 / TP2 ATR multiples from entry */
  tp1AtrMult: number;
  tp2AtrMult: number;
  riskReward: string;
}

export interface TradePlan {
  isLong: boolean;
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskReward: string;
  leverage: number;
  riskUsd: number;
  strategy: string;
  confidence: number;
  tradingStyle: Exclude<import('./types').TradingStyle, 'ALL'>;
  rationale: string;
  qualityScore: number;
  lotSize: number;
  lotLabel: string;
  /** Margin / notional allocated for this trade */
  positionSizeUsd: number;
  volatilityPct: number;
}

export const evaluateConfluence = (
  candles: Candle[],
  fallbackBullish = true
): ConfluenceResult => {
  if (candles.length < 15) {
    return {
      isLong: fallbackBullish,
      strategy: 'Insufficient data — momentum bias',
      confidence: 72,
      score: fallbackBullish ? 1 : -1,
      tags: ['Low sample'],
      rsi: 50,
      ema9: 0,
      ema21: 0,
      atr: 0,
      stopAtrMult: 1.4,
      tp1AtrMult: 2.2,
      tp2AtrMult: 3.6,
      riskReward: '1:2.2',
    };
  }

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume || 0);
  const rsi = calculateRSI(closes, 14);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = closes.length >= 50 ? calculateEMA(closes, 50) : calculateEMA(closes, Math.max(10, Math.floor(closes.length / 2)));
  const atr = calculateATR(candles, 14);
  const ha = toHeikinAshi(candles);
  const haA = analyzeHeikinAshi(ha, 10);

  let score = 0;
  const tags: string[] = [];

  // --- Heikin Ashi (primary trend filter) ---
  score += haA.biasScore;
  if (haA.isStrongTrend) {
    score += haA.isBullish ? 1.4 : -1.4;
    tags.push(haA.isBullish ? 'HA Strong Bull' : 'HA Strong Bear');
  } else if (haA.justFlipped && !haA.isDoji) {
    score += haA.isBullish ? 0.5 : -0.5;
    tags.push(haA.isBullish ? 'HA Bull Flip' : 'HA Bear Flip');
  } else if (haA.streak >= 2) {
    tags.push(haA.isBullish ? `HA ${haA.streak}× Bull` : `HA ${haA.streak}× Bear`);
  }
  if (haA.isDoji) tags.push('HA Doji');

  // --- RSI zones + momentum slope ---
  if (rsi < 30) {
    score += 1.6;
    tags.push('RSI Oversold');
  } else if (rsi < 40) {
    score += 0.7;
    tags.push('RSI Soft OS');
  } else if (rsi > 70) {
    score -= 1.6;
    tags.push('RSI Overbought');
  } else if (rsi > 60) {
    score -= 0.7;
    tags.push('RSI Soft OB');
  }

  // RSI mid-trend confirmation
  if (rsi >= 50 && rsi <= 65) {
    score += 0.35;
    tags.push('RSI Bull Zone');
  } else if (rsi <= 50 && rsi >= 35) {
    score -= 0.35;
    tags.push('RSI Bear Zone');
  }

  // HA + RSI divergence-style
  if (haA.isBullish && rsi < 40) {
    score += 0.9;
    tags.push('Bull Div (HA/RSI)');
  }
  if (!haA.isBullish && rsi > 60) {
    score -= 0.9;
    tags.push('Bear Div (HA/RSI)');
  }

  // --- EMA stack ---
  const emaBull = ema9 > ema21;
  const emaTrend = ema21 > ema50;
  if (emaBull) {
    score += 0.85;
    tags.push('EMA9>21');
  } else {
    score -= 0.85;
    tags.push('EMA9<21');
  }
  if (emaTrend) {
    score += 0.45;
    tags.push('EMA21>50');
  } else {
    score -= 0.45;
    tags.push('EMA21<50');
  }

  const lastClose = closes[closes.length - 1];
  if (lastClose > ema21) score += 0.35;
  else score -= 0.35;
  if (lastClose > ema50) score += 0.25;
  else score -= 0.25;

  if (haA.isBullish && emaBull) {
    score += 0.75;
    tags.push('HA+EMA Aligned');
  } else if (!haA.isBullish && !emaBull) {
    score -= 0.75;
    tags.push('HA+EMA Aligned');
  }

  // --- Momentum (3-bar & 8-bar ROC) ---
  const roc = (n: number) => {
    if (closes.length <= n) return 0;
    const prev = closes[closes.length - 1 - n];
    return prev ? ((lastClose - prev) / prev) * 100 : 0;
  };
  const roc3 = roc(3);
  const roc8 = roc(8);
  if (roc3 > 0.15 && roc8 > 0) {
    score += 0.5;
    tags.push('Mom Up');
  } else if (roc3 < -0.15 && roc8 < 0) {
    score -= 0.5;
    tags.push('Mom Down');
  }

  // --- Volume confirmation (avg of last 5 vs prior 10) ---
  if (volumes.some((v) => v > 0)) {
    const recent = volumes.slice(-5);
    const prior = volumes.slice(-15, -5);
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const rAvg = avg(recent);
    const pAvg = avg(prior);
    if (pAvg > 0 && rAvg > pAvg * 1.15) {
      score += score >= 0 ? 0.4 : -0.4; // amplifies existing bias
      tags.push('Vol Expand');
    } else if (pAvg > 0 && rAvg < pAvg * 0.75) {
      score *= 0.9;
      tags.push('Vol Dry');
    }
  }

  // --- Candle structure: higher highs / lower lows ---
  if (candles.length >= 6) {
    const last3 = candles.slice(-3);
    const prev3 = candles.slice(-6, -3);
    const hh = Math.max(...last3.map((c) => c.high)) > Math.max(...prev3.map((c) => c.high));
    const ll = Math.min(...last3.map((c) => c.low)) < Math.min(...prev3.map((c) => c.low));
    if (hh && !ll) {
      score += 0.4;
      tags.push('HH Structure');
    } else if (ll && !hh) {
      score -= 0.4;
      tags.push('LL Structure');
    }
  }

  const isLong = score >= 0;
  const abs = Math.abs(score);

  // Confidence 76–97 calibrated to score magnitude & HA strength
  let confidence = Math.min(97, Math.max(76, Math.round(78 + abs * 3.2)));
  if (haA.isStrongTrend) confidence = Math.min(97, confidence + 2);
  if (haA.isDoji) confidence = Math.max(76, confidence - 4);
  if (tags.includes('Vol Expand')) confidence = Math.min(97, confidence + 1);

  // Dynamic ATR multiples: stronger score → allow wider TP, tighter relative risk
  let stopAtrMult = 1.35;
  let tp1AtrMult = 2.4;
  let tp2AtrMult = 3.8;
  if (abs >= 4) {
    stopAtrMult = 1.2;
    tp1AtrMult = 2.8;
    tp2AtrMult = 4.5;
  } else if (abs >= 2.5) {
    stopAtrMult = 1.3;
    tp1AtrMult = 2.6;
    tp2AtrMult = 4.0;
  } else if (abs < 1.2) {
    stopAtrMult = 1.5;
    tp1AtrMult = 2.0;
    tp2AtrMult = 3.2;
  }

  // Reversal tags → slightly tighter TP1 (scalpier)
  const isReversal =
    tags.some((t) => t.includes('Flip') || t.includes('Div') || t.includes('Oversold') || t.includes('Overbought'));
  if (isReversal && !haA.isStrongTrend) {
    tp1AtrMult = Math.min(tp1AtrMult, 2.2);
    tp2AtrMult = Math.min(tp2AtrMult, 3.4);
    stopAtrMult = Math.max(stopAtrMult, 1.25);
  }

  const rr = tp1AtrMult / stopAtrMult;
  const riskReward = `1:${rr.toFixed(1)}`;

  // Strategy label from dominant regime
  let strategy: string;
  if (haA.isStrongTrend && Math.abs(haA.biasScore) > 1) {
    strategy = isLong ? 'HA Trend Ride + EMA Stack' : 'HA Bear Trend + EMA Stack';
  } else if (isReversal) {
    strategy = isLong ? 'HA Flip + RSI Reversal' : 'HA Flip + RSI Exhaustion';
  } else if (tags.includes('Vol Expand') && abs > 2) {
    strategy = isLong ? 'Momentum Breakout + Vol' : 'Breakdown + Vol Expansion';
  } else if (emaBull === isLong && tags.includes('HA+EMA Aligned')) {
    strategy = 'Heikin Ashi + EMA Confluence';
  } else {
    strategy = isLong ? 'Multi-Factor Bull Confluence' : 'Multi-Factor Bear Confluence';
  }

  return {
    isLong,
    strategy,
    confidence,
    score: Number(score.toFixed(2)),
    tags: tags.slice(0, 6),
    rsi: Number(rsi.toFixed(1)),
    ema9,
    ema21,
    atr,
    stopAtrMult,
    tp1AtrMult,
    tp2AtrMult,
    riskReward,
  };
};

export type LotAssetClass = 'FOREX' | 'CRYPTO' | 'COMMODITIES';

export interface LotSizeInput {
  balanceUsd: number;
  riskPercent: number;
  entry: number;
  stopDistance: number;
  assetClass: LotAssetClass;
  symbol: string;
  /** ATR/entry * 100 — used to scale risk down in high vol */
  volatilityPct: number;
}

export interface LotSizeResult {
  lotSize: number;
  lotLabel: string;
  riskUsd: number;
  /** Suggested margin / position notional in USD */
  positionSizeUsd: number;
}

/**
 * Auto lot size from account balance, risk %, and stop distance (volatility).
 *
 * riskUsd = balance * (riskPercent / 100)
 *  - High vol → risk percent is soft-capped (protects equity)
 *  - FOREX: standard lot = 100_000 units of base; lot = riskUsd / (stopDist * pipValueApprox)
 *  - XAU: 1 lot ≈ 100 oz; per-unit $ move ≈ $1 per $1 price move per oz
 *  - CRYPTO: units = riskUsd / stopDist; label in coin units
 */
export const calcLotSize = (input: LotSizeInput): LotSizeResult => {
  const balance = Math.max(0, input.balanceUsd || 0);
  let riskPct = Math.min(5, Math.max(0.1, input.riskPercent || 1));

  // Volatility dampener: if ATR% is elevated, cut risk budget
  const vol = Math.max(0, input.volatilityPct || 0);
  if (vol > 3) riskPct *= 0.7;
  else if (vol > 1.5) riskPct *= 0.85;
  else if (vol < 0.35) riskPct *= 1.05;

  const riskUsd = Number(((balance * riskPct) / 100).toFixed(2));
  const stopDist = Math.max(input.stopDistance, input.entry * 0.0005);
  const sym = (input.symbol || '').toUpperCase().replace(/[^A-Z]/g, '');
  const base = sym.slice(0, 3);
  const quote = sym.slice(3, 6) || 'USD';

  let lotSize = 0;
  let lotLabel = '—';
  let positionSizeUsd = riskUsd;

  if (input.assetClass === 'FOREX' && base !== 'XAU' && base !== 'XAG') {
    // Pip size: JPY pairs 0.01, others 0.0001
    const pipSize = quote === 'JPY' ? 0.01 : 0.0001;
    const stopPips = stopDist / pipSize;
    // Standard lot pip value ≈ $10 for USD-quoted majors; scale for JPY roughly
    const pipValuePerLot = quote === 'JPY' ? 9.0 : 10.0;
    lotSize = stopPips > 0 ? riskUsd / (stopPips * pipValuePerLot) : 0;
    // Clamp retail-friendly range
    lotSize = Math.min(50, Math.max(0.01, Number(lotSize.toFixed(2))));
    lotLabel = `${lotSize.toFixed(2)} lots`;
    // Notional ≈ lots * 100000 * (entry if USD base rough)
    positionSizeUsd = Number((lotSize * 100000 * (quote === 'USD' ? 1 : input.entry) * 0.01).toFixed(2));
    // Simpler margin proxy: risk / (stop% ) 
    const stopPct = stopDist / input.entry;
    positionSizeUsd = stopPct > 0 ? Number((riskUsd / stopPct).toFixed(2)) : riskUsd;
  } else if (input.assetClass === 'COMMODITIES' || base === 'XAU' || base === 'XAG') {
    // Gold: 1 lot = 100 oz; $ risk per $1 move per lot ≈ 100
    const unitRisk = stopDist * (base === 'XAG' ? 5000 : 100); // silver 5000 oz standard lot approx
    lotSize = unitRisk > 0 ? riskUsd / unitRisk : 0;
    lotSize = Math.min(20, Math.max(0.01, Number(lotSize.toFixed(2))));
    lotLabel = `${lotSize.toFixed(2)} lots`;
    positionSizeUsd = stopDist > 0 ? Number((riskUsd / (stopDist / input.entry)).toFixed(2)) : riskUsd;
  } else {
    // Crypto: size in coins = riskUsd / stopDist
    const units = stopDist > 0 ? riskUsd / stopDist : 0;
    lotSize = Number(units.toFixed(units >= 1 ? 4 : 6));
    const coin = base || sym.replace('USDT', '') || 'COIN';
    lotLabel = `${lotSize} ${coin}`;
    positionSizeUsd = Number((units * input.entry).toFixed(2));
  }

  // Never risk more than balance
  if (positionSizeUsd > balance * 5) {
    positionSizeUsd = Number((balance * 5).toFixed(2));
  }

  return {
    lotSize,
    lotLabel,
    riskUsd,
    positionSizeUsd: Math.max(positionSizeUsd, riskUsd),
  };
};

/** Build executable plan: ATR stops/TPs + balance/vol lot sizing */
export const buildTradePlan = (
  entry: number,
  confluence: ConfluenceResult,
  opts: {
    balanceUsd: number;
    riskPercent: number;
    assetClass: LotAssetClass;
    symbol: string;
    /** Fallback margin if balance not set */
    fallbackPositionUsd?: number;
  }
): TradePlan => {
  const isFx = opts.assetClass === 'FOREX' || opts.assetClass === 'COMMODITIES';
  const dec = getPrecision(entry);
  const atr = confluence.atr > 0 ? confluence.atr : entry * (isFx ? 0.0025 : 0.016);
  const floor = isFx ? entry * 0.0018 : entry * 0.008;
  const safeAtr = Math.max(atr, floor);

  const stopDist = safeAtr * confluence.stopAtrMult;
  const tp1Dist = safeAtr * confluence.tp1AtrMult;
  const tp2Dist = safeAtr * confluence.tp2AtrMult;

  const isLong = confluence.isLong;
  const stopLoss = Number((isLong ? entry - stopDist : entry + stopDist).toFixed(dec));
  const target1 = Number((isLong ? entry + tp1Dist : entry - tp1Dist).toFixed(dec));
  const target2 = Number((isLong ? entry + tp2Dist : entry - tp2Dist).toFixed(dec));

  const volatilityPct = (safeAtr / entry) * 100;
  const leverage = isFx
    ? volatilityPct > 0.9
      ? 10
      : 20
    : volatilityPct > 4
    ? 5
    : volatilityPct > 1.8
    ? 10
    : 20;

  const lot = calcLotSize({
    balanceUsd: opts.balanceUsd > 0 ? opts.balanceUsd : opts.fallbackPositionUsd || 1000,
    riskPercent: opts.riskPercent,
    entry,
    stopDistance: stopDist,
    assetClass: opts.assetClass,
    symbol: opts.symbol,
    volatilityPct,
  });

  const tradingStyle = classifyTradingStyle(confluence.strategy);
  const rationale = [
    ...confluence.tags.slice(0, 3),
    `Vol ${volatilityPct.toFixed(2)}%`,
    lot.lotLabel,
  ].join(' · ');

  return {
    isLong,
    entry,
    stopLoss,
    target1,
    target2,
    riskReward: confluence.riskReward,
    leverage,
    riskUsd: lot.riskUsd,
    strategy: confluence.strategy,
    confidence: confluence.confidence,
    tradingStyle,
    rationale,
    qualityScore: Math.abs(confluence.score),
    lotSize: lot.lotSize,
    lotLabel: lot.lotLabel,
    positionSizeUsd: lot.positionSizeUsd,
    volatilityPct: Number(volatilityPct.toFixed(3)),
  };
};

// -------------------------------------------------------------
// DOLLAR PnL + TRADING STYLE
// -------------------------------------------------------------
/** Default risk capital per signal (USD notional before leverage effect on %). */
export const DEFAULT_POSITION_SIZE_USD = 1000;

/**
 * Realized $ PnL from entry → exit with leverage on a fixed USD notional.
 * pnl% already includes leverage; $ = notional × (pnlPercent / 100) / leverage * leverage
 * simplifies to: notional × (raw price move % without double-counting).
 *
 * We treat positionSizeUsd as the margin allocated; leveraged exposure = margin × leverage.
 * Dollar PnL = margin × leverage × priceMoveFraction
 *            = positionSizeUsd × (pnlPercent / 100)
 * when pnlPercent was computed as priceMove × leverage × 100.
 */
export const calcDollarPnl = (pnlPercent: number, positionSizeUsd: number): number => {
  return Number(((pnlPercent / 100) * positionSizeUsd).toFixed(2));
};

/** Unrealized $ PnL for an open signal */
export const calcUnrealizedDollarPnl = (
  type: 'LONG' | 'SHORT',
  entry: number,
  currentPrice: number,
  leverage: number,
  positionSizeUsd: number
): number => {
  if (!entry) return 0;
  const rawPct =
    type === 'LONG'
      ? ((currentPrice - entry) / entry) * leverage * 100
      : ((entry - currentPrice) / entry) * leverage * 100;
  return calcDollarPnl(rawPct, positionSizeUsd);
};

/** Map strategy text → trading style for filters */
export const classifyTradingStyle = (strategy: string): Exclude<TradingStyle, 'ALL'> => {
  const s = strategy.toLowerCase();
  if (s.includes('scalp') || s.includes('15m momentum')) return 'SCALP';
  if (s.includes('swing')) return 'SWING';
  if (s.includes('breakout') || s.includes('bos') || s.includes('structure break')) return 'BREAKOUT';
  if (
    s.includes('reversal') ||
    s.includes('flip') ||
    s.includes('divergence') ||
    s.includes('oversold') ||
    s.includes('overbought') ||
    s.includes('liquidity grab')
  ) {
    return 'REVERSAL';
  }
  // Default: HA trend / EMA confluence → TREND
  return 'TREND';
};

export const TRADING_STYLE_LABELS: Record<TradingStyle, string> = {
  ALL: 'ALL STYLES',
  TREND: 'TREND',
  REVERSAL: 'REVERSAL',
  SCALP: 'SCALP',
  SWING: 'SWING',
  BREAKOUT: 'BREAKOUT',
};

// -------------------------------------------------------------
// FOREX HELPERS
// -------------------------------------------------------------

const FX_BASES = new Set([
  'EUR', 'GBP', 'USD', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'TRY', 'ZAR', 'MXN', 'CNY', 'HKD', 'SGD', 'NOK', 'SEK',
  'XAU', 'XAG',
]);

const METALS = new Set(['XAUUSD', 'XAGUSD', 'XAU', 'XAG']);

/** Gold / silver spot symbols */
export const isMetalSymbol = (raw: string): boolean => {
  const s = raw.toUpperCase().replace(/[^A-Z]/g, '');
  if (METALS.has(s)) return true;
  if (s.length === 6 && (s.startsWith('XAU') || s.startsWith('XAG'))) return true;
  return false;
};

/** True if symbol looks like FX or metal pair (EURUSD, XAUUSD) */
export const isForexSymbol = (raw: string): boolean => {
  const s = raw.toUpperCase().replace(/[^A-Z]/g, '');
  if (s.endsWith('USDT') || s.endsWith('BUSD')) return false;
  if (isMetalSymbol(s)) return true;
  if (s.length === 6 && FX_BASES.has(s.slice(0, 3)) && FX_BASES.has(s.slice(3, 6))) return true;
  return false;
};

export const normalizeForexSymbol = (raw: string): { symbol: string; base: string; quote: string; pair: string } => {
  let s = raw.toUpperCase().replace(/[^A-Z]/g, '');
  if (s === 'XAU' || s === 'GOLD') s = 'XAUUSD';
  if (s === 'XAG' || s === 'SILVER') s = 'XAGUSD';
  const base = s.slice(0, 3);
  const quote = s.slice(3, 6) || 'USD';
  return {
    symbol: `${base}${quote}`,
    base,
    quote,
    pair: `${base} / ${quote}`,
  };
};

export const formatFxPrice = (price: number, symbol: string): string => {
  const base = symbol.slice(0, 3).toUpperCase();
  const quote = symbol.slice(3, 6).toUpperCase();
  // Gold/silver: 2 decimals; JPY: 3; majors: 5
  let dec = 5;
  if (base === 'XAU' || base === 'XAG') dec = 2;
  else if (quote === 'JPY') dec = 3;
  else if (price < 1) dec = 5;
  return price.toLocaleString(undefined, {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
};

/**
 * Fetch spot FX rate via Frankfurter (ECB) free API.
 * Note: daily reference rates — fine for desk signals; not sub-second trade execution.
 */
/** Gold spot via free public endpoints (no API key). */
const fetchGoldSpotUsd = async (): Promise<number> => {
  // 1) goldprice.org JSON
  try {
    const res = await fetch('https://data-asg.goldprice.org/dbXRates/USD', {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      const px = Number(data?.items?.[0]?.xauPrice ?? data?.items?.[0]?.xauPrice);
      if (Number.isFinite(px) && px > 100) return px;
    }
  } catch {
    // continue
  }
  // 2) metals.live
  try {
    const res = await fetch('https://api.metals.live/v1/spot/gold');
    if (res.ok) {
      const data = await res.json();
      // shape: [[timestamp, price], ...] or { price }
      let px = 0;
      if (Array.isArray(data) && data.length) {
        const last = data[data.length - 1];
        px = Number(Array.isArray(last) ? last[1] : last?.price ?? last);
      } else {
        px = Number(data?.price ?? data?.gold ?? data?.[0]);
      }
      if (Number.isFinite(px) && px > 100) return px;
    }
  } catch {
    // continue
  }
  throw new Error('Gold spot unavailable');
};

export const fetchForexTicker = async (
  symbol: string
): Promise<{
  price: number;
  changePct: number;
  high: number;
  low: number;
}> => {
  const { base, quote, symbol: sym } = normalizeForexSymbol(symbol);

  // ----- Metals (XAUUSD / XAGUSD) -----
  if (isMetalSymbol(sym) || base === 'XAU' || base === 'XAG') {
    if (base === 'XAG') {
      // approximate silver via gold ratio if no dedicated endpoint
      const gold = await fetchGoldSpotUsd();
      const price = gold / 85; // rough Au/Ag ratio fallback
      return {
        price,
        changePct: 0,
        high: price * 1.008,
        low: price * 0.992,
      };
    }
    const price = await fetchGoldSpotUsd();
    // Mild band for 24h range (public endpoints rarely give OHLC)
    return {
      price,
      changePct: 0.15,
      high: price * 1.006,
      low: price * 0.994,
    };
  }

  // ----- Fiat FX via Frankfurter (ECB) -----
  const url = `https://api.frankfurter.app/latest?from=${base}&to=${quote}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FX rate unavailable for ${base}/${quote}`);
  const data = await res.json();
  const price = Number(data?.rates?.[quote]);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`No rate for ${base}/${quote}`);

  let changePct = 0;
  let high = price * 1.002;
  let low = price * 0.998;
  try {
    const prevDate = new Date();
    prevDate.setDate(prevDate.getDate() - 1);
    while (prevDate.getDay() === 0 || prevDate.getDay() === 6) {
      prevDate.setDate(prevDate.getDate() - 1);
    }
    const y = prevDate.toISOString().slice(0, 10);
    const prevRes = await fetch(`https://api.frankfurter.app/${y}?from=${base}&to=${quote}`);
    if (prevRes.ok) {
      const prev = await prevRes.json();
      const prevPrice = Number(prev?.rates?.[quote]);
      if (prevPrice > 0) {
        changePct = ((price - prevPrice) / prevPrice) * 100;
        high = Math.max(price, prevPrice) * 1.001;
        low = Math.min(price, prevPrice) * 0.999;
      }
    }
  } catch {
    // keep approx band
  }

  return { price, changePct, high, low };
};


/** Rough FX session by UTC hour */
export const getFxSession = (): {
  name: string;
  active: string[];
  colorKey: 'london' | 'newyork' | 'asia' | 'overlap' | 'quiet';
} => {
  const h = new Date().getUTCHours();
  // Asia 00-09, London 07-16, NY 12-21 UTC (approx)
  const asia = h >= 0 && h < 9;
  const london = h >= 7 && h < 16;
  const ny = h >= 12 && h < 21;
  if (london && ny) return { name: 'London / NY Overlap', active: ['London', 'New York'], colorKey: 'overlap' };
  if (london) return { name: 'London Session', active: ['London'], colorKey: 'london' };
  if (ny) return { name: 'New York Session', active: ['New York'], colorKey: 'newyork' };
  if (asia) return { name: 'Asia Session', active: ['Tokyo'], colorKey: 'asia' };
  return { name: 'Off-peak', active: [], colorKey: 'quiet' };
};
