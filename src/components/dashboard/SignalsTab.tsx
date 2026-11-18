import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type {
  ClosedTrade,
  HistoryFilter,
  MarketFilter,
  PaletteColors,
  Signal,
  SignalFeedMode,
  TradingStyle,
} from './types';
import { TRADING_STYLE_LABELS, calcUnrealizedDollarPnl, formatCryptoPrice } from './math';

interface SignalsTabProps {
  colors: PaletteColors;
  feedMode: SignalFeedMode;
  setFeedMode: (mode: SignalFeedMode) => void;
  selectedFilter: MarketFilter;
  setSelectedFilter: (filter: MarketFilter) => void;
  styleFilter: TradingStyle;
  setStyleFilter: (filter: TradingStyle) => void;
  historyFilter: HistoryFilter;
  setHistoryFilter: (filter: HistoryFilter) => void;
  filteredSignals: Signal[];
  filteredClosedTrades: ClosedTrade[];
  signalsCount: number;
  closedTradesCount: number;
  historyStats: {
    total: number;
    wins: number;
    losses: number;
    winRate: string;
    totalPnlAmount: string;
    isNetPositive: boolean;
  };
  copiedKey: string | null;
  onCopyIndividual: (value: number | undefined, type: 'entry' | 'tp' | 'tp2' | 'sl' | 'exit', id: string) => void;
  onCopyFullSignal: (item: Signal) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  bottomPadding: number;
  onClearHistory?: () => void;
  onScanMarket?: () => void;
  onAddPair?: () => void;
  signalMarketsLabel?: string;
  onCloseSignal?: (signal: Signal) => void;
  lastScanAt?: string | null;
}

export default function SignalsTab({
  colors,
  feedMode,
  setFeedMode,
  selectedFilter,
  setSelectedFilter,
  styleFilter,
  setStyleFilter,
  historyFilter,
  setHistoryFilter,
  filteredSignals,
  filteredClosedTrades,
  signalsCount,
  closedTradesCount,
  historyStats,
  copiedKey,
  onCopyIndividual,
  onCopyFullSignal,
  isRefreshing,
  onRefresh,
  bottomPadding,
  onClearHistory,
  onScanMarket,
  onAddPair,
  signalMarketsLabel,
  onCloseSignal,
  lastScanAt,
}: SignalsTabProps) {
  const [historyQuery, setHistoryQuery] = useState('');
  const [historySort, setHistorySort] = useState<'newest' | 'best' | 'worst'>('newest');

  const historyList = useMemo(() => {
    let list = [...filteredClosedTrades];
    const q = historyQuery.trim().toUpperCase();
    if (q) {
      list = list.filter(
        (t) =>
          t?.pair?.toUpperCase().includes(q) ||
          t?.strategy?.toUpperCase().includes(q) ||
          t?.result?.includes(q)
      );
    }
    if (historySort === 'best') {
      list.sort((a, b) => (b?.pnlAmount ?? 0) - (a?.pnlAmount ?? 0));
    } else if (historySort === 'worst') {
      list.sort((a, b) => (a?.pnlAmount ?? 0) - (b?.pnlAmount ?? 0));
    }
    return list;
  }, [filteredClosedTrades, historyQuery, historySort]);

  const renderSignalCard = ({ item }: { item: Signal }) => {
    if (!item) return null;

    const isLong = item.type === 'LONG';
    const entry = item.entry || 1;
    const currentPrice = item.currentPrice || entry;
    const leverage = item.leverage || 1;
    const target1 = item.target1 ?? entry;
    const stopLoss = item.stopLoss ?? entry;

    const rawGain = isLong
      ? ((currentPrice - entry) / entry) * leverage * 100
      : ((entry - currentPrice) / entry) * leverage * 100;
    const isProfitable = rawGain >= 0;
    const formattedGain = `${isProfitable ? '+' : ''}${(rawGain || 0).toFixed(2)}%`;

    const isEntryCopied = copiedKey === `${item.id}-entry`;
    const isTpCopied = copiedKey === `${item.id}-tp`;
    const isTp2Copied = copiedKey === `${item.id}-tp2`;
    const isSlCopied = copiedKey === `${item.id}-sl`;
    const isAllCopied = copiedKey === `${item.id}-all`;

    // Bar always reads left=SL (0%), right=TP (100%) for both LONG and SHORT.
    // Signed span: for LONG (target1 > stopLoss) span > 0 → normal mapping.
    // For SHORT (target1 < stopLoss) span < 0 → division flips automatically,
    // so stopLoss still lands at 0% (left) and target1 at 100% (right).
    const barSpan = target1 - stopLoss || 1; // signed — do NOT use Math.abs
    const barClamp = (v: number) => Math.min(1, Math.max(0, (v - stopLoss) / barSpan));
    const entryPos = barClamp(entry) * 100;
    const pricePos = barClamp(currentPrice) * 100;

    return (
      <View style={[styles.signalCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
        <View style={styles.cardTopRow}>
          <View style={styles.cardTopLeft}>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: isLong ? colors.accentGreenMuted : colors.accentRedMuted },
              ]}
            >
              <Text style={[styles.typeBadgeText, { color: isLong ? colors.accentGreen : colors.accentRed }]}>
                {item.type} {item.leverage}X
              </Text>
            </View>
            <Text style={[styles.pairText, { color: colors.textPrimary }]}>{item.pair}</Text>
            <Text style={[styles.timeText, { color: colors.textMuted }]}>{item.timeAgo}</Text>
          </View>
          <View
            style={[
              styles.confidenceChip,
              {
                backgroundColor:
                  item.confidence >= 90
                    ? colors.accentGreenMuted
                    : item.confidence >= 82
                    ? colors.accentBlueMuted
                    : colors.accentAmberMuted,
              },
            ]}
          >
            <Text
              style={[
                styles.confidenceText,
                {
                  color:
                    item.confidence >= 90
                      ? colors.accentGreen
                      : item.confidence >= 82
                      ? colors.accentBlue
                      : colors.accentAmber,
                },
              ]}
            >
              {item.confidence}%
            </Text>
          </View>
        </View>

        <View style={styles.strategyRow}>
          <View style={[styles.strategyChip, { backgroundColor: colors.accentBlueMuted }]}>
            <MaterialCommunityIcons name="lightning-bolt" size={13} color={colors.accentBlue} />
            <Text style={[styles.strategyText, { color: colors.accentBlue }]} numberOfLines={1}>
              {item.strategy}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[styles.rrChip, { backgroundColor: colors.accentBlueMuted, borderColor: colors.accentBlue }]}>
              <Text style={[styles.rrText, { color: colors.accentBlue }]}>{item.tradingStyle || 'TREND'}</Text>
            </View>
            <View style={[styles.rrChip, { backgroundColor: colors.chipBg, borderColor: colors.chipBorder }]}>
              <Text style={[styles.rrText, { color: colors.textSecondary }]}>R:R {item.riskReward}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.priceMatrix, { backgroundColor: colors.matrixBg || colors.chipBg }]}>
          {/* ENTRY */}
          <TouchableOpacity
            style={[styles.matrixCol, isEntryCopied && { backgroundColor: colors.accentGreenMuted }]}
            onPress={() => onCopyIndividual(item.entry, 'entry', item.id)}
            activeOpacity={0.7}
          >
            <View style={styles.matrixColHeader}>
              <Text style={[styles.matrixLabel, { color: colors.textMuted }]}>ENTRY</Text>
              <Feather name={isEntryCopied ? 'check' : 'copy'} size={11} color={colors.textMuted} />
            </View>
            <Text style={[styles.matrixVal, { color: colors.textPrimary }]}>
              {isEntryCopied ? 'Copied!' : `$${formatCryptoPrice(entry)}`}
            </Text>
          </TouchableOpacity>

          <View style={[styles.matrixDivider, { backgroundColor: colors.chipBorder }]} />

          {/* TP 1 — tappable to copy */}
          <TouchableOpacity
            style={[styles.matrixCol, isTpCopied && { backgroundColor: colors.accentGreenMuted }]}
            onPress={() => onCopyIndividual(item.target1, 'tp', item.id)}
            activeOpacity={0.7}
          >
            <View style={styles.matrixColHeader}>
              <Text style={[styles.matrixLabel, { color: colors.accentGreen }]}>TP 1</Text>
              <Feather name={isTpCopied ? 'check' : 'copy'} size={11} color={colors.accentGreen} />
            </View>
            <Text style={[styles.matrixVal, { color: colors.accentGreen }]}>
              {isTpCopied ? 'Copied!' : `$${formatCryptoPrice(target1)}`}
            </Text>
          </TouchableOpacity>

          {/* TP 2 — tappable to copy when present */}
          {item.target2 != null && (
            <>
              <View style={[styles.matrixDivider, { backgroundColor: colors.chipBorder }]} />
              <TouchableOpacity
                style={[styles.matrixCol, isTp2Copied && { backgroundColor: colors.accentGreenMuted }]}
                onPress={() => onCopyIndividual(item.target2 ?? undefined, 'tp2', item.id)}
                activeOpacity={0.7}
              >
                <View style={styles.matrixColHeader}>
                  <Text style={[styles.matrixLabel, { color: colors.accentGreen }]}>TP 2</Text>
                  <Feather name={isTp2Copied ? 'check' : 'copy'} size={11} color={colors.accentGreen} />
                </View>
                <Text style={[styles.matrixVal, { color: colors.accentGreen }]}>
                  {isTp2Copied ? 'Copied!' : `$${formatCryptoPrice(item.target2)}`}
                </Text>
              </TouchableOpacity>
            </>
          )}

          <View style={[styles.matrixDivider, { backgroundColor: colors.chipBorder }]} />

          {/* STOP LOSS — tappable to copy */}
          <TouchableOpacity
            style={[styles.matrixCol, isSlCopied && { backgroundColor: colors.accentRedMuted }]}
            onPress={() => onCopyIndividual(item.stopLoss, 'sl', item.id)}
            activeOpacity={0.7}
          >
            <View style={styles.matrixColHeader}>
              <Text style={[styles.matrixLabel, { color: colors.accentRed }]}>SL</Text>
              <Feather name={isSlCopied ? 'check' : 'copy'} size={11} color={colors.accentRed} />
            </View>
            <Text style={[styles.matrixVal, { color: colors.accentRed }]}>
              {isSlCopied ? 'Copied!' : `$${formatCryptoPrice(stopLoss)}`}
            </Text>
          </TouchableOpacity>
        </View>

        {(item.rationale || item.riskUsd != null || item.lotLabel) && (
          <View style={styles.rationaleRow}>
            {item.rationale ? (
              <Text style={[styles.rationaleText, { color: colors.textMuted }]} numberOfLines={2}>
                {item.rationale}
              </Text>
            ) : (
              <View />
            )}
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              {item.lotLabel ? (
                <Text style={[styles.riskText, { color: colors.accentBlue }]}>{item.lotLabel}</Text>
              ) : null}
              {item.riskUsd != null && (
                <Text style={[styles.riskText, { color: colors.accentAmber }]}>Risk ${item.riskUsd}</Text>
              )}
            </View>
          </View>
        )}

        <View style={[styles.qualityTrack, { backgroundColor: colors.chipBg }]}>
          <View
            style={[
              styles.qualityFill,
              {
                width: `${Math.min(100, Math.max(0, item.confidence))}%`,
                backgroundColor:
                  item.confidence >= 90
                    ? colors.accentGreen
                    : item.confidence >= 82
                    ? colors.accentBlue
                    : colors.accentAmber,
              },
            ]}
          />
        </View>

        <View style={{ marginTop: 10 }}>
          {/* Bar direction labels */}
          <View style={styles.progressLabels}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={[styles.barEndDot, { backgroundColor: colors.accentRed }]} />
              <Text style={[styles.progressLbl, { color: colors.accentRed }]}>SL</Text>
            </View>
            <Text style={[styles.progressLbl, { color: colors.textMuted }]}>
              {isLong ? '▲ LONG path' : '▼ SHORT path'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={[styles.progressLbl, { color: colors.accentGreen }]}>TP</Text>
              <View style={[styles.barEndDot, { backgroundColor: colors.accentGreen }]} />
            </View>
          </View>

          {/* Price bar track */}
          <View style={[styles.progressTrack, { backgroundColor: colors.chipBg }]}>
            {/* PnL fill between entry and live price */}
            <View
              style={[
                styles.progressFill,
                {
                  left: `${Math.min(entryPos, pricePos)}%`,
                  width: `${Math.abs(pricePos - entryPos)}%`,
                  backgroundColor: isProfitable ? colors.accentGreen : colors.accentRed,
                  opacity: 0.4,
                },
              ]}
            />
            {/* Entry tick */}
            <View style={[styles.progressMark, { left: `${entryPos}%`, backgroundColor: colors.textSecondary }]} />
            {/* Live price dot */}
            <View
              style={[
                styles.progressMark,
                styles.progressMarkLive,
                {
                  left: `${pricePos}%`,
                  backgroundColor: isProfitable ? colors.accentGreen : colors.accentRed,
                },
              ]}
            />
          </View>

          {/* Price labels row: SL / Entry / TP */}
          <View style={styles.barPriceRow}>
            <Text style={[styles.barPriceLbl, { color: colors.accentRed }]} numberOfLines={1}>
              {`$${formatCryptoPrice(stopLoss)}`}
            </Text>
            <Text style={[styles.barPriceLbl, { color: colors.textSecondary, textAlign: 'center' }]} numberOfLines={1}>
              {`Entry $${formatCryptoPrice(entry)}`}
            </Text>
            <Text style={[styles.barPriceLbl, { color: colors.accentGreen, textAlign: 'right' }]} numberOfLines={1}>
              {`$${formatCryptoPrice(target1)}`}
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View>
            <Text style={[styles.pnlLabel, { color: colors.textMuted }]}>Real-time ROI · $ PnL</Text>
            <Text style={[styles.pnlValue, { color: isProfitable ? colors.accentGreen : colors.accentRed }]}>
              {formattedGain}
            </Text>
            <Text style={[styles.pnlDollar, { color: isProfitable ? colors.accentGreen : colors.accentRed }]}>
              {(() => {
                const d = calcUnrealizedDollarPnl(
                  item.type,
                  entry,
                  currentPrice,
                  leverage,
                  item.positionSizeUsd ?? 1000
                );
                return `${d >= 0 ? '+' : ''}$${d.toFixed(2)}`;
              })()}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {onCloseSignal ? (
              <TouchableOpacity
                style={[styles.copyBtn, { borderColor: colors.accentRed, backgroundColor: colors.accentRedMuted }]}
                onPress={() => onCloseSignal(item)}
                activeOpacity={0.8}
              >
                <Feather name="x-circle" size={13} color={colors.accentRed} />
                <Text style={[styles.copyBtnText, { color: colors.accentRed }]}>Close</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[
                styles.copyBtn,
                {
                  backgroundColor: isAllCopied ? colors.accentGreenMuted : colors.copyBtn || colors.btnBg,
                  borderColor: isAllCopied ? colors.accentGreen : colors.btnBorder,
                },
              ]}
              onPress={() => onCopyFullSignal(item)}
              activeOpacity={0.8}
            >
              <Feather
                name={isAllCopied ? 'check' : 'copy'}
                size={13}
                color={isAllCopied ? colors.accentGreen : colors.textPrimary}
              />
              <Text style={[styles.copyBtnText, { color: isAllCopied ? colors.accentGreen : colors.textPrimary }]}>
                {isAllCopied ? 'Copied' : 'Copy'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderHistoryCard = ({ item }: { item: ClosedTrade }) => {
    if (!item) return null;

    const isWin = item.result === 'WIN';
    const isLong = item.type === 'LONG';
    const isEntryCopied = copiedKey === `${item.id}-entry`;
    const isExitCopied = copiedKey === `${item.id}-exit`;
    const pnlPercent = item.pnlPercent ?? 0;
    const pnlAmount = item.pnlAmount ?? 0;
    const entry = item.entry ?? 0;
    const exitPrice = item.exitPrice ?? 0;

    return (
      <View
        style={[
          styles.historyCard,
          {
            backgroundColor: colors.cardBg,
            borderColor: isWin ? 'rgba(16, 185, 129, 0.22)' : 'rgba(244, 63, 94, 0.22)',
          },
        ]}
      >
        <View style={styles.historyTopRow}>
          <View style={styles.historyTopLeft}>
            <View
              style={[
                styles.resultTag,
                { backgroundColor: isWin ? colors.accentGreenMuted : colors.accentRedMuted },
              ]}
            >
              <Ionicons
                name={isWin ? 'checkmark-circle' : 'close-circle'}
                size={13}
                color={isWin ? colors.accentGreen : colors.accentRed}
              />
              <Text style={[styles.resultTagText, { color: isWin ? colors.accentGreen : colors.accentRed }]}>
                {item.result}
              </Text>
            </View>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: isLong ? colors.accentGreenMuted : colors.accentRedMuted },
              ]}
            >
              <Text style={[styles.typeBadgeText, { color: isLong ? colors.accentGreen : colors.accentRed }]}>
                {item.type} {item.leverage}X
              </Text>
            </View>
            <Text style={[styles.historyPair, { color: colors.textPrimary }]}>{item.pair}</Text>
          </View>
          <View style={styles.historyTopRight}>
            <Text style={[styles.historyPnlPct, { color: isWin ? colors.accentGreen : colors.accentRed }]}>
              {pnlPercent >= 0 ? '+' : ''}
              {pnlPercent.toFixed(2)}%
            </Text>
            <Text style={[styles.historyPnlAmount, { color: isWin ? colors.accentGreen : colors.accentRed }]}>
              {pnlAmount >= 0 ? '+' : ''}${Math.abs(pnlAmount).toFixed(2)} USD
            </Text>
            <Text style={[styles.historyClosedAt, { color: colors.textMuted }]}>{item.closedAt}</Text>
          </View>
        </View>

        <Text style={[styles.historyStrategy, { color: colors.textMuted }]} numberOfLines={1}>
          {item.strategy}
        </Text>

        <View style={[styles.historyGrid, { backgroundColor: colors.matrixBg || colors.chipBg }]}>
          <TouchableOpacity
            style={styles.historyGridCol}
            onPress={() => onCopyIndividual(entry, 'entry', item.id)}
            activeOpacity={0.7}
          >
            <View style={styles.historyGridHeader}>
              <Text style={[styles.historyGridLabel, { color: colors.textMuted }]}>ENTRY</Text>
              <Feather
                name={isEntryCopied ? 'check' : 'copy'}
                size={10}
                color={isEntryCopied ? colors.accentGreen : colors.textMuted}
              />
            </View>
            <Text style={[styles.historyGridVal, { color: isEntryCopied ? colors.accentGreen : colors.textPrimary }]}>
              {isEntryCopied ? 'Copied' : `$${formatCryptoPrice(entry)}`}
            </Text>
          </TouchableOpacity>

          <View style={[styles.matrixDivider, { backgroundColor: colors.chipBorder }]} />

          <TouchableOpacity
            style={styles.historyGridCol}
            onPress={() => onCopyIndividual(exitPrice, 'exit', item.id)}
            activeOpacity={0.7}
          >
            <View style={styles.historyGridHeader}>
              <Text style={[styles.historyGridLabel, { color: colors.textMuted }]}>EXIT</Text>
              <Feather
                name={isExitCopied ? 'check' : 'copy'}
                size={10}
                color={isExitCopied ? colors.accentGreen : colors.textMuted}
              />
            </View>
            <Text style={[styles.historyGridVal, { color: isExitCopied ? colors.accentGreen : colors.textPrimary }]}>
              {isExitCopied ? 'Copied' : `$${formatCryptoPrice(exitPrice)}`}
            </Text>
          </TouchableOpacity>

          <View style={[styles.matrixDivider, { backgroundColor: colors.chipBorder }]} />

          <View style={styles.historyGridCol}>
            <Text style={[styles.historyGridLabel, { color: colors.textMuted }]}>OUTCOME</Text>
            <Text style={[styles.historyGridVal, { color: isWin ? colors.accentGreen : colors.accentRed }]}>
              {isWin ? 'TAKE PROFIT' : 'STOP LOSS'}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <>
      <View style={[styles.segmentWrapper, { backgroundColor: colors.chipBg, borderColor: colors.chipBorder }]}>
        <TouchableOpacity
          style={[styles.segmentBtn, feedMode === 'ACTIVE' && { backgroundColor: colors.cardBg }]}
          onPress={() => setFeedMode('ACTIVE')}
        >
          <Ionicons name="flash" size={14} color={feedMode === 'ACTIVE' ? colors.accentGreen : colors.textMuted} />
          <Text style={[styles.segmentBtnText, { color: feedMode === 'ACTIVE' ? colors.textPrimary : colors.textMuted }]}>
            Active Signals ({signalsCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, feedMode === 'HISTORY' && { backgroundColor: colors.cardBg }]}
          onPress={() => setFeedMode('HISTORY')}
        >
          <Ionicons name="time" size={14} color={feedMode === 'HISTORY' ? colors.accentGreen : colors.textMuted} />
          <Text
            style={[styles.segmentBtnText, { color: feedMode === 'HISTORY' ? colors.textPrimary : colors.textMuted }]}
          >
            Trade History ({closedTradesCount})
          </Text>
        </TouchableOpacity>
      </View>

      {feedMode === 'ACTIVE' && (
        <>
          <View style={styles.filterBar}>
            {(['ALL', 'CRYPTO', 'FOREX', 'COMMODITIES'] as MarketFilter[]).map((f) => (
              <TouchableOpacity
                key={f}
                style={[
                  styles.filterChip,
                  { backgroundColor: colors.chipBg, borderColor: colors.chipBorder },
                  selectedFilter === f && {
                    backgroundColor: colors.accentGreenMuted,
                    borderColor: colors.accentGreen,
                  },
                ]}
                onPress={() => setSelectedFilter(f)}
              >
                <Text style={[styles.filterText, { color: selectedFilter === f ? colors.accentGreen : colors.textMuted }]}>
                  {f}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.filterBar, { paddingTop: 0 }]}>
            {(['ALL', 'TREND', 'REVERSAL', 'SCALP', 'SWING', 'BREAKOUT'] as TradingStyle[]).map((sf) => (
              <TouchableOpacity
                key={sf}
                style={[
                  styles.filterChip,
                  { backgroundColor: colors.chipBg, borderColor: colors.chipBorder },
                  styleFilter === sf && {
                    backgroundColor: colors.accentBlueMuted,
                    borderColor: colors.accentBlue,
                  },
                ]}
                onPress={() => setStyleFilter(sf)}
              >
                <Text style={[styles.filterText, { color: styleFilter === sf ? colors.accentBlue : colors.textMuted }]}>
                  {TRADING_STYLE_LABELS[sf]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {lastScanAt ? (
            <Text style={[styles.lastScanText, { color: colors.textMuted }]}>Last scan · {lastScanAt}</Text>
          ) : null}
          <View style={[styles.quickStatsRow, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <View style={styles.quickStat}>
              <Text style={[styles.quickStatVal, { color: colors.textPrimary }]}>{signalsCount}</Text>
              <Text style={[styles.quickStatLbl, { color: colors.textMuted }]}>LIVE</Text>
            </View>
            <View style={[styles.quickStatDiv, { backgroundColor: colors.chipBorder }]} />
            <View style={styles.quickStat}>
              <Text style={[styles.quickStatVal, { color: colors.accentGreen }]}>{historyStats.winRate}%</Text>
              <Text style={[styles.quickStatLbl, { color: colors.textMuted }]}>WIN RATE</Text>
            </View>
            <View style={[styles.quickStatDiv, { backgroundColor: colors.chipBorder }]} />
            <View style={styles.quickStat}>
              <Text
                style={[
                  styles.quickStatVal,
                  { color: historyStats.isNetPositive ? colors.accentGreen : colors.accentRed, fontSize: 13 },
                ]}
              >
                {historyStats.totalPnlAmount}
              </Text>
              <Text style={[styles.quickStatLbl, { color: colors.textMuted }]}>NET $</Text>
            </View>
          </View>

          <FlatList
            data={filteredSignals}
            keyExtractor={(item, index) => item?.id ?? `sig-${index}`}
            renderItem={renderSignalCard}
            ListEmptyComponent={
              <View style={[styles.emptyWrap, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
                <MaterialCommunityIcons name="radar" size={32} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No active signals</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                  {signalMarketsLabel
                    ? `Scanning ${signalMarketsLabel}. Run a market scan or wait for auto-generate.`
                    : 'Run Scan Market or wait for auto-generate.'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  {onScanMarket ? (
                    <TouchableOpacity
                      style={[styles.emptyBtn, { backgroundColor: colors.accentGreen }]}
                      onPress={onScanMarket}
                    >
                      <Text style={styles.emptyBtnText}>Scan Market</Text>
                    </TouchableOpacity>
                  ) : null}
                  {onAddPair ? (
                    <TouchableOpacity
                      style={[styles.emptyBtn, { backgroundColor: colors.accentBlue }]}
                      onPress={onAddPair}
                    >
                      <Text style={styles.emptyBtnText}>Add Pair</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            }
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.accentGreen} />
            }
            contentContainerStyle={[styles.feedList, { paddingBottom: bottomPadding }]}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      {feedMode === 'HISTORY' && (
        <View style={{ flex: 1 }}>
          <View style={[styles.historySummaryBanner, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <View style={styles.summaryCol}>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>NET PROFIT</Text>
              <Text
                style={[
                  styles.summaryVal,
                  { color: historyStats.isNetPositive ? colors.accentGreen : colors.accentRed },
                ]}
              >
                {historyStats.totalPnlAmount}
              </Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.chipBorder }]} />
            <View style={styles.summaryCol}>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>WIN RATE</Text>
              <Text style={[styles.summaryVal, { color: colors.textPrimary }]}>{historyStats.winRate}%</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.chipBorder }]} />
            <View style={styles.summaryCol}>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>TRADES</Text>
              <Text style={[styles.summaryVal, { color: colors.textPrimary }]}>{historyStats.total}</Text>
            </View>
          </View>

          <View style={styles.filterBar}>
            {(['ALL', 'WINS', 'LOSSES'] as HistoryFilter[]).map((hf) => {
              const isCurrent = historyFilter === hf;
              return (
                <TouchableOpacity
                  key={hf}
                  style={[
                    styles.filterChip,
                    { backgroundColor: colors.chipBg, borderColor: colors.chipBorder },
                    isCurrent && {
                      backgroundColor: hf === 'LOSSES' ? colors.accentRedMuted : colors.accentGreenMuted,
                      borderColor: hf === 'LOSSES' ? colors.accentRed : colors.accentGreen,
                    },
                  ]}
                  onPress={() => setHistoryFilter(hf)}
                >
                  <Text
                    style={[
                      styles.filterText,
                      {
                        color: isCurrent
                          ? hf === 'LOSSES'
                            ? colors.accentRed
                            : colors.accentGreen
                          : colors.textMuted,
                      },
                    ]}
                  >
                    {hf === 'ALL'
                      ? `ALL (${closedTradesCount})`
                      : hf === 'WINS'
                      ? `WINS (${historyStats.wins})`
                      : `LOSSES (${historyStats.losses})`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.historyToolbar}>
            <Text style={[styles.historyToolbarLabel, { color: colors.textMuted }]}>
              {closedTradesCount} closed trade{closedTradesCount === 1 ? '' : 's'}
            </Text>
            {onClearHistory && closedTradesCount > 0 ? (
              <TouchableOpacity
                style={[
                  styles.clearHistoryBtn,
                  { borderColor: colors.accentRed, backgroundColor: colors.accentRedMuted },
                ]}
                onPress={onClearHistory}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={14} color={colors.accentRed} />
                <Text style={[styles.clearHistoryText, { color: colors.accentRed }]}>Clear History</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View
            style={[
              styles.historySearchBox,
              { backgroundColor: colors.inputBg || colors.chipBg, borderColor: colors.cardBorder },
            ]}
          >
            <Ionicons name="search" size={15} color={colors.textMuted} />
            <TextInput
              style={[styles.historySearchInput, { color: colors.textPrimary }]}
              placeholder="Search pair, strategy…"
              placeholderTextColor={colors.textMuted}
              value={historyQuery}
              onChangeText={setHistoryQuery}
              autoCorrect={false}
            />
            {historyQuery.length > 0 && (
              <TouchableOpacity onPress={() => setHistoryQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={15} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.sortRow}>
            {(
              [
                { id: 'newest', label: 'Newest' },
                { id: 'best', label: 'Best PnL' },
                { id: 'worst', label: 'Worst PnL' },
              ] as const
            ).map((s) => {
              const active = historySort === s.id;
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[
                    styles.sortChip,
                    {
                      backgroundColor: active ? colors.accentBlueMuted : colors.chipBg,
                      borderColor: active ? colors.accentBlue : colors.chipBorder,
                    },
                  ]}
                  onPress={() => setHistorySort(s.id)}
                >
                  <Text style={[styles.sortChipText, { color: active ? colors.accentBlue : colors.textMuted }]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <FlatList
            data={historyList}
            keyExtractor={(item, index) => `${item?.id ?? 'trade'}-${index}`}
            renderItem={renderHistoryCard}
            ListEmptyComponent={
              <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 24 }}>
                {historyQuery ? 'No trades match your search' : 'No closed trades yet'}
              </Text>
            }
            contentContainerStyle={[styles.feedList, { paddingBottom: bottomPadding }]}
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  segmentWrapper: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    gap: 6,
  },
  segmentBtnText: { fontSize: 11, fontWeight: '700' },
  filterBar: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  filterText: { fontSize: 11, fontWeight: '700' },
  feedList: { paddingHorizontal: 16, paddingTop: 4, gap: 14 },

  lastScanText: { fontSize: 10, fontWeight: '600', marginHorizontal: 16, marginBottom: 6 },
  quickStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  quickStat: { flex: 1, alignItems: 'center' },
  quickStatVal: { fontSize: 15, fontWeight: '800' },
  quickStatLbl: { fontSize: 9, fontWeight: '800', marginTop: 2, letterSpacing: 0.4 },
  quickStatDiv: { width: 1, height: 24 },

  signalCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 4 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  pairText: { fontSize: 15, fontWeight: '800' },
  timeText: { fontSize: 10 },
  confidenceChip: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 },
  confidenceText: { fontSize: 10, fontWeight: '700' },

  strategyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  strategyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexShrink: 1,
  },
  strategyText: { fontSize: 10, fontWeight: '700', flexShrink: 1 },
  rrChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  rrText: { fontSize: 10, fontWeight: '700' },

  priceMatrix: {
    flexDirection: 'row',
    marginTop: 12,
    borderRadius: 10,
    overflow: 'hidden',
  },
  matrixCol: { flex: 1, paddingVertical: 10, paddingHorizontal: 6 },
  matrixColHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  matrixLabel: { fontSize: 9, fontWeight: '800' },
  matrixVal: { fontSize: 12, fontWeight: '800' },
  matrixDivider: { width: 1 },

  rationaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  rationaleText: { fontSize: 10, fontWeight: '600', flex: 1, lineHeight: 14 },
  riskText: { fontSize: 10, fontWeight: '800' },
  qualityTrack: { height: 4, borderRadius: 2, marginTop: 8, overflow: 'hidden' },
  qualityFill: { height: 4, borderRadius: 2 },

  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  progressLbl: { fontSize: 9, fontWeight: '800' },
  progressTrack: { height: 6, borderRadius: 3, position: 'relative', overflow: 'hidden' },
  progressFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 3 },
  progressMark: {
    position: 'absolute',
    top: -2,
    width: 3,
    height: 10,
    borderRadius: 1,
    marginLeft: -1.5,
  },
  progressMarkLive: { width: 8, height: 8, borderRadius: 4, top: -1, marginLeft: -4 },
  barEndDot: { width: 5, height: 5, borderRadius: 3 },
  barPriceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  barPriceLbl: { fontSize: 8, fontWeight: '700', flex: 1 },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 12,
  },
  pnlLabel: { fontSize: 10, fontWeight: '600' },
  pnlValue: { fontSize: 15, fontWeight: '800' },
  pnlDollar: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  copyBtnText: { fontSize: 11, fontWeight: '700' },

  emptyWrap: {
    marginTop: 24,
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', marginTop: 8 },
  emptySub: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  emptyBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  emptyBtnText: { color: '#FFF', fontWeight: '800', fontSize: 12 },

  historySummaryBanner: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 6,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryCol: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, height: '80%' },
  summaryLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, marginBottom: 2 },
  summaryVal: { fontSize: 14, fontWeight: '800' },

  historyToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  historyToolbarLabel: { fontSize: 11, fontWeight: '600' },
  clearHistoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  clearHistoryText: { fontSize: 11, fontWeight: '800' },

  historySearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  historySearchInput: { flex: 1, fontSize: 13, fontWeight: '600', paddingVertical: 0 },
  sortRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginBottom: 8 },
  sortChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  sortChipText: { fontSize: 10, fontWeight: '800' },

  historyCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 4 },
  historyTopRow: { flexDirection: 'row', justifyContent: 'space-between' },
  historyTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 },
  historyTopRight: { alignItems: 'flex-end' },
  resultTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  resultTagText: { fontSize: 10, fontWeight: '800' },
  historyPair: { fontSize: 14, fontWeight: '800' },
  historyPnlPct: { fontSize: 14, fontWeight: '800' },
  historyPnlAmount: { fontSize: 12, fontWeight: '700' },
  historyClosedAt: { fontSize: 10, marginTop: 2 },
  historyStrategy: { fontSize: 11, marginTop: 8 },
  historyGrid: { flexDirection: 'row', marginTop: 10, borderRadius: 10, overflow: 'hidden' },
  historyGridCol: { flex: 1, paddingVertical: 10, paddingHorizontal: 6 },
  historyGridHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  historyGridLabel: { fontSize: 9, fontWeight: '800' },
  historyGridVal: { fontSize: 11, fontWeight: '800' },
});
