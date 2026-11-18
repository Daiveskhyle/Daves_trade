import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { PaletteColors, ThemeMode } from './types';

export type SignalAssetClass = 'FOREX' | 'CRYPTO' | 'COMMODITIES';

interface ProfileTabProps {
  colors: PaletteColors;
  themeMode: ThemeMode;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (v: boolean) => void;
  pushTokenReady: boolean;
  autoExecute: boolean;
  setAutoExecute: (v: boolean) => void;
  positionSizeUsd: number;
  setPositionSizeUsd: (v: number) => void;
  accountBalanceUsd: number;
  setAccountBalanceUsd: (v: number) => void;
  riskPercent: number;
  setRiskPercent: (v: number) => void;
  /** Multi-select markets for auto/manual signal generation */
  signalAssetFilter: SignalAssetClass[];
  setSignalAssetFilter: (v: SignalAssetClass[]) => void;
  onCycleTheme: () => void;
  onLogout: () => void;
  onClearHistory?: () => void;
  onShareHistory?: () => void;
  onRescanMarkets?: () => void;
  activeSignals: number;
  closedTrades: number;
  netPnl: string;
  bottomPadding?: number;
}

const SIZE_PRESETS = [250, 500, 1000, 2500, 5000];
const BALANCE_PRESETS = [1000, 2500, 5000, 10000, 25000, 50000];
const MARKET_OPTS: { id: SignalAssetClass; label: string; hint: string }[] = [
  { id: 'FOREX', label: 'Forex', hint: 'EURUSD, GBPUSD…' },
  { id: 'COMMODITIES', label: 'Metals', hint: 'XAUUSD, XAG…' },
  { id: 'CRYPTO', label: 'Crypto', hint: 'BTC, ETH, SOL…' },
];

export default function ProfileTab({
  colors,
  themeMode,
  notificationsEnabled,
  setNotificationsEnabled,
  pushTokenReady,
  autoExecute,
  setAutoExecute,
  positionSizeUsd,
  setPositionSizeUsd,
  accountBalanceUsd,
  setAccountBalanceUsd,
  riskPercent,
  setRiskPercent,
  signalAssetFilter,
  setSignalAssetFilter,
  onCycleTheme,
  onLogout,
  onClearHistory,
  onShareHistory,
  onRescanMarkets,
  activeSignals,
  closedTrades,
  netPnl,
  bottomPadding = 100,
}: ProfileTabProps) {
  const [balanceDraft, setBalanceDraft] = useState(String(accountBalanceUsd));

  const toggleMarket = (id: SignalAssetClass) => {
    const has = signalAssetFilter.includes(id);
    if (has) {
      // Keep at least one selected
      if (signalAssetFilter.length <= 1) return;
      setSignalAssetFilter(signalAssetFilter.filter((x) => x !== id));
    } else {
      setSignalAssetFilter([...signalAssetFilter, id]);
    }
  };

  const commitBalance = () => {
    const n = Number(String(balanceDraft).replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n) && n > 0) {
      setAccountBalanceUsd(Math.round(n * 100) / 100);
      setBalanceDraft(String(Math.round(n * 100) / 100));
    } else {
      setBalanceDraft(String(accountBalanceUsd));
    }
  };

  return (
    <ScrollView
      style={styles.tabContentContainer}
      contentContainerStyle={{ paddingBottom: bottomPadding }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.profileHeaderCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
        <View style={[styles.largeAvatar, { backgroundColor: colors.accentGreen }]}>
          <Ionicons name="person" size={32} color="#FFFFFF" />
        </View>
        <Text style={[styles.profileName, { color: colors.textPrimary }]}>Dave&apos;s Institutional Desk</Text>
        <Text style={[styles.profileTier, { color: colors.accentGreen }]}>VIP PRO ALGO ACCESS</Text>

        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={[styles.statVal, { color: colors.textPrimary }]}>{activeSignals}</Text>
            <Text style={[styles.statLbl, { color: colors.textMuted }]}>ACTIVE</Text>
          </View>
          <View style={[styles.statDiv, { backgroundColor: colors.chipBorder }]} />
          <View style={styles.statBox}>
            <Text style={[styles.statVal, { color: colors.textPrimary }]}>{closedTrades}</Text>
            <Text style={[styles.statLbl, { color: colors.textMuted }]}>CLOSED</Text>
          </View>
          <View style={[styles.statDiv, { backgroundColor: colors.chipBorder }]} />
          <View style={styles.statBox}>
            <Text
              style={[
                styles.statVal,
                { color: netPnl.startsWith('-') ? colors.accentRed : colors.accentGreen, fontSize: 14 },
              ]}
            >
              {netPnl}
            </Text>
            <Text style={[styles.statLbl, { color: colors.textMuted }]}>NET $</Text>
          </View>
        </View>
      </View>

      {/* Balance */}
      <View style={[styles.settingsGroup, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
        <Text style={[styles.groupTitle, { color: colors.textMuted }]}>ACCOUNT BALANCE</Text>
        <Text style={[styles.settingHelp, { color: colors.textMuted, marginBottom: 10 }]}>
          Type any amount or pick a preset · drives auto lot size with risk % and volatility
        </Text>

        <View style={[styles.balanceInputRow, { backgroundColor: colors.inputBg || colors.chipBg, borderColor: colors.chipBorder }]}>
          <Text style={[styles.balancePrefix, { color: colors.textMuted }]}>USD</Text>
          <TextInput
            style={[styles.balanceInput, { color: colors.textPrimary }]}
            value={balanceDraft}
            onChangeText={setBalanceDraft}
            onBlur={commitBalance}
            onSubmitEditing={commitBalance}
            keyboardType="decimal-pad"
            returnKeyType="done"
            placeholder="10000"
            placeholderTextColor={colors.textMuted}
          />
          <TouchableOpacity
            style={[styles.balanceApply, { backgroundColor: colors.accentGreen }]}
            onPress={commitBalance}
          >
            <Text style={styles.balanceApplyText}>Apply</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sizeRow}>
          {BALANCE_PRESETS.map((sz) => {
            const active = accountBalanceUsd === sz;
            return (
              <TouchableOpacity
                key={sz}
                style={[
                  styles.sizeChip,
                  {
                    backgroundColor: active ? colors.accentGreenMuted : colors.chipBg,
                    borderColor: active ? colors.accentGreen : colors.chipBorder,
                  },
                ]}
                onPress={() => {
                  setAccountBalanceUsd(sz);
                  setBalanceDraft(String(sz));
                }}
              >
                <Text style={[styles.sizeChipText, { color: active ? colors.accentGreen : colors.textSecondary }]}>
                  ${sz.toLocaleString()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Risk % */}
      <View style={[styles.settingsGroup, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
        <Text style={[styles.groupTitle, { color: colors.textMuted }]}>RISK PER TRADE</Text>
        <Text style={[styles.settingHelp, { color: colors.textMuted, marginBottom: 10 }]}>
          % of balance risked if stop-loss is hit · high volatility auto-reduces this
        </Text>
        <View style={styles.sizeRow}>
          {[0.5, 1, 1.5, 2, 3].map((r) => {
            const active = riskPercent === r;
            return (
              <TouchableOpacity
                key={r}
                style={[
                  styles.sizeChip,
                  {
                    backgroundColor: active ? colors.accentAmberMuted : colors.chipBg,
                    borderColor: active ? colors.accentAmber : colors.chipBorder,
                  },
                ]}
                onPress={() => setRiskPercent(r)}
              >
                <Text style={[styles.sizeChipText, { color: active ? colors.accentAmber : colors.textSecondary }]}>
                  {r}%
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[styles.settingHelp, { color: colors.textMuted, marginTop: 10 }]}>
          Est. risk now: ${((accountBalanceUsd * riskPercent) / 100).toFixed(2)} per signal
        </Text>
      </View>

      {/* Multi market */}
      <View style={[styles.settingsGroup, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
        <Text style={[styles.groupTitle, { color: colors.textMuted }]}>SIGNAL MARKETS</Text>
        <Text style={[styles.settingHelp, { color: colors.textMuted, marginBottom: 10 }]}>
          Select one or more · auto-scan and Scan Market only use these classes
        </Text>
        <View style={styles.marketCol}>
          {MARKET_OPTS.map((opt) => {
            const active = signalAssetFilter.includes(opt.id);
            return (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.marketRow,
                  {
                    backgroundColor: active ? colors.accentBlueMuted : colors.chipBg,
                    borderColor: active ? colors.accentBlue : colors.chipBorder,
                  },
                ]}
                onPress={() => toggleMarket(opt.id)}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.marketLabel, { color: active ? colors.accentBlue : colors.textPrimary }]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.settingHelp, { color: colors.textMuted }]}>{opt.hint}</Text>
                </View>
                <View
                  style={[
                    styles.checkBox,
                    {
                      borderColor: active ? colors.accentBlue : colors.chipBorder,
                      backgroundColor: active ? colors.accentBlue : 'transparent',
                    },
                  ]}
                >
                  {active && <Ionicons name="checkmark" size={14} color="#FFF" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[styles.settingHelp, { color: colors.textMuted, marginTop: 8 }]}>
          Active: {signalAssetFilter.join(' + ') || 'FOREX'}
        </Text>
      </View>

      {/* Fallback margin */}
      <View style={[styles.settingsGroup, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
        <Text style={[styles.groupTitle, { color: colors.textMuted }]}>FALLBACK MARGIN (legacy)</Text>
        <Text style={[styles.settingHelp, { color: colors.textMuted, marginBottom: 10 }]}>
          Used only if balance is unset · preferred path is balance + risk %
        </Text>
        <View style={styles.sizeRow}>
          {SIZE_PRESETS.map((sz) => {
            const active = positionSizeUsd === sz;
            return (
              <TouchableOpacity
                key={sz}
                style={[
                  styles.sizeChip,
                  {
                    backgroundColor: active ? colors.accentGreenMuted : colors.chipBg,
                    borderColor: active ? colors.accentGreen : colors.chipBorder,
                  },
                ]}
                onPress={() => setPositionSizeUsd(sz)}
              >
                <Text style={[styles.sizeChipText, { color: active ? colors.accentGreen : colors.textSecondary }]}>
                  ${sz.toLocaleString()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={[styles.settingsGroup, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
        <Text style={[styles.groupTitle, { color: colors.textMuted }]}>NOTIFICATION & AUTOMATION</Text>

        <View style={styles.settingItem}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Signal Push Alerts</Text>
            <Text style={[styles.settingHelp, { color: colors.textMuted }]}>
              {pushTokenReady
                ? 'Device registered. Closed-app market alerts still require a push backend.'
                : 'Local alerts only. Remote push requires a physical device and push credentials.'}
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: colors.chipBorder, true: colors.accentGreen }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Auto-Execute Signals</Text>
            <Text style={[styles.settingHelp, { color: colors.textMuted }]}>
              Connect directly via Binance Webhook API
            </Text>
          </View>
          <Switch
            value={autoExecute}
            onValueChange={setAutoExecute}
            trackColor={{ false: colors.chipBorder, true: colors.accentGreen }}
          />
        </View>

        <View style={styles.settingItem}>
          <View>
            <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Interface Theme</Text>
            <Text style={[styles.settingHelp, { color: colors.textMuted }]}>Currently: {themeMode.toUpperCase()}</Text>
          </View>
          <TouchableOpacity
            style={[styles.smallBtn, { backgroundColor: colors.btnBg, borderColor: colors.btnBorder }]}
            onPress={onCycleTheme}
          >
            <Text style={[styles.smallBtnText, { color: colors.textPrimary }]}>Cycle Theme</Text>
          </TouchableOpacity>
        </View>
      </View>

      {onRescanMarkets ? (
        <TouchableOpacity
          style={[styles.logoutBtn, { backgroundColor: colors.accentGreenMuted, borderColor: colors.accentGreen, marginBottom: 12 }]}
          onPress={onRescanMarkets}
        >
          <Ionicons name="refresh" size={18} color={colors.accentGreen} />
          <Text style={[styles.logoutText, { color: colors.accentGreen }]}>Rescan Selected Markets</Text>
        </TouchableOpacity>
      ) : null}

      {onShareHistory && closedTrades > 0 ? (
        <TouchableOpacity
          style={[styles.logoutBtn, { backgroundColor: colors.accentBlueMuted, borderColor: colors.accentBlue, marginBottom: 12 }]}
          onPress={onShareHistory}
        >
          <Ionicons name="share-outline" size={18} color={colors.accentBlue} />
          <Text style={[styles.logoutText, { color: colors.accentBlue }]}>
            Share / Export History ({closedTrades})
          </Text>
        </TouchableOpacity>
      ) : null}

      {onClearHistory && closedTrades > 0 ? (
        <TouchableOpacity
          style={[styles.logoutBtn, { backgroundColor: colors.accentRedMuted, borderColor: colors.accentRed, marginBottom: 12 }]}
          onPress={onClearHistory}
        >
          <Ionicons name="trash-outline" size={18} color={colors.accentRed} />
          <Text style={[styles.logoutText, { color: colors.accentRed }]}>
            Clear Trade History ({closedTrades})
          </Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={[styles.logoutBtn, { backgroundColor: colors.accentRedMuted, borderColor: colors.accentRed }]}
        onPress={onLogout}
      >
        <Ionicons name="log-out-outline" size={18} color={colors.accentRed} />
        <Text style={[styles.logoutText, { color: colors.accentRed }]}>Sign Out of Desk</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tabContentContainer: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },
  profileHeaderCard: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  largeAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  profileName: { fontSize: 16, fontWeight: '800' },
  profileTier: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginTop: 4 },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    width: '100%',
    justifyContent: 'space-around',
  },
  statBox: { alignItems: 'center', flex: 1 },
  statVal: { fontSize: 16, fontWeight: '800' },
  statLbl: { fontSize: 9, fontWeight: '800', marginTop: 2, letterSpacing: 0.5 },
  statDiv: { width: 1, height: 28 },
  settingsGroup: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  groupTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 10 },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  settingLabel: { fontSize: 13, fontWeight: '700' },
  settingHelp: { fontSize: 10, marginTop: 2 },
  sizeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sizeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  sizeChipText: { fontSize: 12, fontWeight: '800' },
  balanceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    marginBottom: 12,
    gap: 8,
  },
  balancePrefix: { fontSize: 12, fontWeight: '800' },
  balanceInput: { flex: 1, fontSize: 16, fontWeight: '800', paddingVertical: 0 },
  balanceApply: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  balanceApplyText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  marketCol: { gap: 8 },
  marketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  marketLabel: { fontSize: 14, fontWeight: '800' },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtn: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  smallBtnText: { fontSize: 11, fontWeight: '700' },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  logoutText: { fontSize: 13, fontWeight: '700' },
});
