import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { PaletteColors, TickerItem } from './types';

interface WatchlistTabProps {
  colors: PaletteColors;
  tickers: TickerItem[];
  onAddPair: () => void;
  onRemoveSymbol: (symbol: string) => void;
  onClearAllPairs?: () => void;
  onScanSignal: (ticker: TickerItem) => void;
  onRefresh?: () => Promise<void> | void;
  isRefreshing?: boolean;
  bottomPadding?: number;
  onToggleFavorite?: (symbol: string) => void;
  fxSessionLabel?: string;
}

export default function WatchlistTab({
  colors,
  tickers,
  onAddPair,
  onRemoveSymbol,
  onClearAllPairs,
  onScanSignal,
  onRefresh,
  isRefreshing = false,
  bottomPadding = 100,
  onToggleFavorite,
  fxSessionLabel,
}: WatchlistTabProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'ALL' | 'CRYPTO' | 'FOREX' | 'COMMODITIES'>('ALL');

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    return tickers.filter((t) => {
      if (category !== 'ALL' && (t.category || 'CRYPTO') !== category) return false;
      if (!q) return true;
      return t.symbol.includes(q) || t.pair.toUpperCase().includes(q);
    });
  }, [tickers, query, category]);

  return (
    <ScrollView
      style={styles.tabContentContainer}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 8 }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.accentGreen}
            colors={[colors.accentGreen]}
          />
        ) : undefined
      }
    >
      <View style={styles.marketHeaderRow}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Market Depth & Feeds</Text>
          <Text style={[styles.sectionSubHeading, { color: colors.textMuted }]}>
            {tickers.length} pairs · pull to refresh quotes
            {fxSessionLabel ? ` · ${fxSessionLabel}` : ''}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {onClearAllPairs && tickers.length > 0 ? (
            <TouchableOpacity
              style={[styles.clearAllBtn, { borderColor: colors.accentRed, backgroundColor: colors.accentRedMuted }]}
              onPress={onClearAllPairs}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={14} color={colors.accentRed} />
              <Text style={[styles.clearAllBtnText, { color: colors.accentRed }]}>Clear</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.addSymbolBtn, { backgroundColor: colors.accentGreen }]}
            onPress={onAddPair}
            activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Add trading pair"
          >
            <Ionicons name="add" size={16} color="#FFFFFF" />
            <Text style={styles.addSymbolBtnText}>Add Pair</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.searchBox, { backgroundColor: colors.inputBg || colors.chipBg, borderColor: colors.cardBorder }]}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Search BTC, EURUSD, XAU…"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        {(['ALL', 'CRYPTO', 'FOREX', 'COMMODITIES'] as const).map((c) => {
          const active = category === c;
          return (
            <TouchableOpacity
              key={c}
              style={[
                styles.filterChip,
                {
                  backgroundColor: active ? colors.accentGreenMuted : colors.chipBg,
                  borderColor: active ? colors.accentGreen : colors.chipBorder,
                },
              ]}
              onPress={() => setCategory(c)}
            >
              <Text style={[styles.filterText, { color: active ? colors.accentGreen : colors.textMuted }]}>{c}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {filtered.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <Ionicons name="telescope-outline" size={28} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No pairs match</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            Try another search or add a new symbol to your desk.
          </Text>
          <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: colors.accentGreen }]} onPress={onAddPair}>
            <Text style={styles.emptyBtnText}>Add Pair</Text>
          </TouchableOpacity>
        </View>
      ) : (
        filtered.map((ticker, idx) => (
          <View
            key={ticker?.symbol ?? idx}
            style={[styles.marketRowCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
          >
            <View style={styles.marketRowLeft}>
              <View style={styles.pairTitleRow}>
                {onToggleFavorite ? (
                  <TouchableOpacity onPress={() => onToggleFavorite(ticker.symbol)} hitSlop={8}>
                    <Ionicons
                      name={ticker.isFavorite ? 'star' : 'star-outline'}
                      size={16}
                      color={ticker.isFavorite ? colors.accentAmber : colors.textMuted}
                    />
                  </TouchableOpacity>
                ) : null}
                <Text style={[styles.marketRowPair, { color: colors.textPrimary }]}>{ticker.pair}</Text>
                <View
                  style={[
                    styles.catPill,
                    {
                      backgroundColor:
                        ticker.category === 'FOREX'
                          ? colors.accentBlueMuted
                          : ticker.category === 'COMMODITIES'
                          ? colors.accentAmberMuted
                          : colors.chipBg,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.catPillText,
                      {
                        color:
                          ticker.category === 'FOREX'
                            ? colors.accentBlue
                            : ticker.category === 'COMMODITIES'
                            ? colors.accentAmber
                            : colors.textMuted,
                      },
                    ]}
                  >
                    {ticker.category || 'CRYPTO'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => onRemoveSymbol(ticker.symbol)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel={`Remove ${ticker.pair}`}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.accentRed} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.marketRowVol, { color: colors.textMuted }]}>24h Vol: {ticker.volume}</Text>
              <View style={styles.rangeRow}>
                <Text style={[styles.rangeText, { color: colors.textMuted }]}>L: {ticker.low24h}</Text>
                <Text style={[styles.rangeText, { color: colors.textMuted }]}>H: {ticker.high24h}</Text>
              </View>
            </View>

            <View style={styles.marketRowRight}>
              <Text style={[styles.marketRowPrice, { color: colors.textPrimary }]}>{ticker.price}</Text>
              <View
                style={[
                  styles.changeBadge,
                  { backgroundColor: ticker.up ? colors.accentGreenMuted : colors.accentRedMuted },
                ]}
              >
                <Ionicons
                  name={ticker.up ? 'caret-up' : 'caret-down'}
                  size={12}
                  color={ticker.up ? colors.accentGreen : colors.accentRed}
                />
                <Text style={[styles.changeBadgeText, { color: ticker.up ? colors.accentGreen : colors.accentRed }]}>
                  {ticker.change}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.quickTradeBtn, { backgroundColor: colors.btnBg, borderColor: colors.btnBorder }]}
                onPress={() => onScanSignal(ticker)}
              >
                <Text style={[styles.quickTradeText, { color: colors.accentBlue }]}>Scan Signal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.removePairBtn, { borderColor: colors.accentRed, backgroundColor: colors.accentRedMuted }]}
                onPress={() => onRemoveSymbol(ticker.symbol)}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={12} color={colors.accentRed} />
                <Text style={[styles.removePairText, { color: colors.accentRed }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
      <View style={{ height: bottomPadding }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tabContentContainer: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },
  marketHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  addSymbolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addSymbolBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  clearAllBtnText: { fontSize: 11, fontWeight: '800' },
  sectionHeading: { fontSize: 18, fontWeight: '800' },
  sectionSubHeading: { fontSize: 12, marginBottom: 4, marginTop: 2 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 13, fontWeight: '600', paddingVertical: 0 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  filterText: { fontSize: 10, fontWeight: '800' },
  emptyCard: {
    alignItems: 'center',
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    marginTop: 12,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', marginTop: 6 },
  emptySub: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  emptyBtn: { marginTop: 10, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  emptyBtnText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  marketRowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  marketRowLeft: { gap: 2, flex: 1, paddingRight: 8 },
  pairTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  marketRowPair: { fontSize: 15, fontWeight: '800' },
  catPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  catPillText: { fontSize: 9, fontWeight: '800' },
  marketRowVol: { fontSize: 11 },
  rangeRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  rangeText: { fontSize: 10 },
  marketRowRight: { alignItems: 'flex-end', gap: 4 },
  marketRowPrice: { fontSize: 15, fontWeight: '800' },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    gap: 2,
  },
  changeBadgeText: { fontSize: 11, fontWeight: '800' },
  quickTradeBtn: { marginTop: 4, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  quickTradeText: { fontSize: 10, fontWeight: '700' },
  removePairBtn: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  removePairText: { fontSize: 10, fontWeight: '800' },
});
