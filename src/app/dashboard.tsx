import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { AndroidImportance } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import * as SQLite from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AnalyticsTab from '@/components/dashboard/AnalyticsTab';
import {
  DEFAULT_POSITION_SIZE_USD,
  calcDollarPnl,
  calcUnrealizedDollarPnl,
  buildTradePlan,
  calculateATR,
  classifyTradingStyle,
  evaluateConfluence,
  fetchForexTicker,
  formatCryptoPrice,
  formatFxPrice,
  getFxSession,
  getPrecision,
  isForexSymbol,
  isMetalSymbol,
  normalizeForexSymbol,
} from '@/components/dashboard/math';
import ProfileTab from '@/components/dashboard/ProfileTab';
import {
  ALL_INITIAL_TICKERS,
  COIN_DATABASE,
  FOREX_DATABASE,
  INITIAL_TICKERS,
  SEED_CLOSED_TRADES,
  SEED_SIGNALS,
} from '@/components/dashboard/seed';
import SignalsTab from '@/components/dashboard/SignalsTab';
import Toast, { type ToastKind, type ToastState } from '@/components/dashboard/Toast';
import { PALETTE } from '@/components/dashboard/theme';
import type {
  Candle,
  ClosedTrade,
  HistoryFilter,
  MarketFilter,
  Signal,
  SignalFeedMode,
  TabSection,
  ThemeMode,
  TickerItem,
  TradingStyle,
} from '@/components/dashboard/types';
import WatchlistTab from '@/components/dashboard/WatchlistTab';

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch (e) {
  console.warn('Notifications handler init error:', e);
}

async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('signals', {
      name: 'Signal Alerts',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#10B981',
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('exits', {
      name: 'TP / SL Alerts',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400],
      lightColor: '#F59E0B',
      sound: 'default',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  const { status } =
    existingStatus === 'granted'
      ? { status: existingStatus }
      : await Notifications.requestPermissionsAsync();

  return status === 'granted';
}

async function registerForRemotePushNotifications(): Promise<boolean> {
  if (Platform.OS === 'web' || !Device.isDevice) return false;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error('EAS project ID is missing from the app configuration.');
  }

  await Notifications.getExpoPushTokenAsync({ projectId });
  return true;
}

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const systemScheme = useColorScheme();

  const [themeMode, setThemeMode] = useState<ThemeMode>('auto');
  const activeTheme = themeMode === 'auto' ? (systemScheme === 'dark' ? 'dark' : 'light') : themeMode;
  const colors = PALETTE[activeTheme];

  const [signals, setSignals] = useState<Signal[]>([]);
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);
  const [feedMode, setFeedMode] = useState<SignalFeedMode>('ACTIVE');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('ALL');

  const [activeTab, setActiveTab] = useState<TabSection>('signals');
  const [selectedFilter, setSelectedFilter] = useState<MarketFilter>('ALL');
  const [styleFilter, setStyleFilter] = useState<TradingStyle>('ALL');
  const [positionSizeUsd, setPositionSizeUsd] = useState<number>(DEFAULT_POSITION_SIZE_USD);
  const [accountBalanceUsd, setAccountBalanceUsd] = useState<number>(10000);
  const [riskPercent, setRiskPercent] = useState<number>(1);
  const accountBalanceRef = useRef(10000);
  accountBalanceRef.current = accountBalanceUsd;
  const riskPercentRef = useRef(1);
  riskPercentRef.current = riskPercent;
  /** Multi-select auto-scan markets — default Forex only */
  const [signalAssetFilter, setSignalAssetFilter] = useState<Array<'FOREX' | 'CRYPTO' | 'COMMODITIES'>>(['FOREX']);
  const signalAssetFilterRef = useRef<Array<'FOREX' | 'CRYPTO' | 'COMMODITIES'>>(['FOREX']);
  signalAssetFilterRef.current = signalAssetFilter;
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', kind: 'info' });
  const [marketsRefreshing, setMarketsRefreshing] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const favoritesRef = useRef<string[]>([]);
  favoritesRef.current = favorites;

  const showToast = (message: string, kind: ToastKind = 'success') => {
    setToast({ visible: true, message, kind });
  };

  const persistDeskSetting = async (key: string, value: string) => {
    try {
      const db = await SQLite.openDatabaseAsync('daves_trade_v7.db');
      await db.runAsync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, value]
      );
    } catch (e) {
      console.warn('Settings persist error:', e);
    }
  };
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [autoExecute, setAutoExecute] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [pushTokenReady, setPushTokenReady] = useState(false);

  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState('');
  const [scanProgress, setScanProgress] = useState(0);

  const [tickers, setTickers] = useState<TickerItem[]>(ALL_INITIAL_TICKERS);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [symbolInput, setSymbolInput] = useState('');
  const [isAddingSymbol, setIsAddingSymbol] = useState(false);
  const [autoPredictOnAdd, setAutoPredictOnAdd] = useState(true);
  const [isPredicting, setIsPredicting] = useState(false);
  const [typingPrediction, setTypingPrediction] = useState<{
    pair: string;
    symbol: string;
    type: 'LONG' | 'SHORT';
    entry: number;
    target1: number;
    stopLoss: number;
    leverage: number;
    change: string;
    strategy: string;
    confidence: number;
    alreadyAdded: boolean;
    notFound: boolean;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const tickersRef = useRef<TickerItem[]>(tickers);
  tickersRef.current = tickers;
  const positionSizeRef = useRef(positionSizeUsd);
  positionSizeRef.current = positionSizeUsd;
  const signalsRef = useRef<Signal[]>(signals);
  signalsRef.current = signals;
  const isScanningRef = useRef(isScanning);
  isScanningRef.current = isScanning;
  const notificationsEnabledRef = useRef(notificationsEnabled);
  notificationsEnabledRef.current = notificationsEnabled;
  const autoPassRunning = useRef(false);

  const copyTextToClipboard = async (text: string, key: string) => {
    try {
      await Clipboard.setStringAsync(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch (e) {
      console.warn('Clipboard write error:', e);
    }
  };

  const copyIndividualValue = (value: number | undefined, type: 'entry' | 'tp' | 'tp2' | 'sl' | 'exit', id: string) => {
    const val = value !== undefined && value !== null ? value.toString() : '0';
    copyTextToClipboard(val, `${id}-${type}`);
  };

  const copyFullSignalSetup = (item: Signal) => {
    const formatted = [
      `🚨 QUANT SIGNAL: ${item.pair} (${item.type} ${item.leverage}X)`,
      `Strategy: ${item.strategy}`,
      `Entry: $${formatCryptoPrice(item.entry)}`,
      `TP 1: $${formatCryptoPrice(item.target1)}`,
      item.target2 ? `TP 2: $${formatCryptoPrice(item.target2)}` : '',
      `Stop Loss: $${formatCryptoPrice(item.stopLoss)}`,
      item.riskUsd != null ? `Risk: $${item.riskUsd}` : '',
      item.lotLabel ? `Lot: ${item.lotLabel}` : '',
      item.rationale ? `Why: ${item.rationale}` : '',
      `Risk:Reward: ${item.riskReward}`,
      `Confidence: ${item.confidence}%`,
    ].join('\n');
    copyTextToClipboard(formatted, `${item.id}-all`);
  };

  const setupNotifications = useCallback(async (showPermissionAlert = false) => {
    try {
      const permissionGranted = await requestNotificationPermission();
      setNotificationsEnabled(permissionGranted);

      if (!permissionGranted) {
        setPushTokenReady(false);
        if (showPermissionAlert) {
          Alert.alert('Notifications disabled', 'Allow notifications in your device settings to receive alerts.');
        }
        return;
      }

      try {
        setPushTokenReady(await registerForRemotePushNotifications());
      } catch (error) {
        setPushTokenReady(false);
        console.warn('Remote push registration error:', error);
      }
    } catch (error) {
      setNotificationsEnabled(false);
      setPushTokenReady(false);
      console.warn('Notifications setup error:', error);
      if (showPermissionAlert) {
        Alert.alert('Notification setup failed', 'Please try enabling notifications again.');
      }
    }
  }, []);

  const handleNotificationsToggle = (enabled: boolean) => {
    if (enabled) {
      void setupNotifications(true);
    } else {
      setNotificationsEnabled(false);
    }
  };

  useEffect(() => {
    const setupTimer = setTimeout(() => {
      void setupNotifications();
    }, 0);

    // Tap any trade notification → copy Entry / TP / SL
    const sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
      try {
        const data = (response.notification.request.content.data || {}) as Record<string, any>;
        const pair = data.pair || '';
        const lines = [
          pair ? String(pair) : '',
          data.entry != null ? `Entry: ${data.entry}` : '',
          data.tp1 != null ? `TP1: ${data.tp1}` : '',
          data.tp2 != null ? `TP2: ${data.tp2}` : '',
          data.stopLoss != null ? `SL: ${data.stopLoss}` : '',
          data.exitPrice != null ? `Exit: ${data.exitPrice}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        if (lines) {
          await Clipboard.setStringAsync(lines);
          Alert.alert('Copied to clipboard', lines);
        }
      } catch (e) {
        console.warn('Notification copy error:', e);
      }
    });

    return () => {
      clearTimeout(setupTimer);
      sub.remove();
    };
  }, [setupNotifications]);

  const formatLevel = (pair: string, price: number) => {
    const sym = pair.replace(/\s+/g, '').replace('/', '');
    if (isForexSymbol(sym) || isMetalSymbol(sym)) return formatFxPrice(price, sym);
    return formatCryptoPrice(price);
  };

  const dispatchSignalNotification = async (signal: Signal) => {
    if (!notificationsEnabledRef.current) return;
    try {
      const entryS = formatLevel(signal.pair, signal.entry);
      const tpS = formatLevel(signal.pair, signal.target1);
      const slS = formatLevel(signal.pair, signal.stopLoss);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `🎯 ${signal.type} ${signal.pair} (${signal.leverage}X)`,
          body: `${signal.strategy}\nEntry: ${entryS}\nTP1: ${tpS}\nSL: ${slS}\n\nTap to copy levels`,
          data: {
            signalId: signal.id,
            pair: signal.pair,
            entry: entryS,
            tp1: tpS,
            tp2: signal.target2 != null ? formatLevel(signal.pair, signal.target2) : undefined,
            stopLoss: slS,
            kind: 'signal',
          },
          sound: true,
          ...(Platform.OS === 'android' ? { channelId: 'signals' } : {}),
        },
        trigger: null,
      });
    } catch (error) {
      console.warn('Failed to send push notification:', error);
    }
  };

  /** TP hit or SL hit alert — includes copyable Entry / TP / SL */
  const dispatchExitNotification = async (
    signal: Signal,
    result: 'WIN' | 'LOSS',
    exitPrice: number,
    pnlAmount: number
  ) => {
    if (!notificationsEnabledRef.current) return;
    try {
      const isWin = result === 'WIN';
      const entryS = formatLevel(signal.pair, signal.entry);
      const tpS = formatLevel(signal.pair, signal.target1);
      const slS = formatLevel(signal.pair, signal.stopLoss);
      const exitS = formatLevel(signal.pair, exitPrice);
      const title = isWin
        ? `✅ TP HIT · ${signal.pair}`
        : `🛑 SL HIT · ${signal.pair}`;
      const body = [
        isWin ? 'Take-profit reached' : 'Stop-loss triggered',
        `Entry: ${entryS}`,
        `TP1: ${tpS}`,
        `SL: ${slS}`,
        `Exit: ${exitS}`,
        `PnL: ${pnlAmount >= 0 ? '+' : ''}$${pnlAmount.toFixed(2)}`,
        '',
        'Tap notification to copy Entry / TP / SL',
      ].join('\n');

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: {
            pair: signal.pair,
            entry: entryS,
            tp1: tpS,
            tp2: signal.target2 != null ? formatLevel(signal.pair, signal.target2) : undefined,
            stopLoss: slS,
            exitPrice: exitS,
            result,
            kind: isWin ? 'tp_hit' : 'sl_hit',
          },
          sound: true,
          ...(Platform.OS === 'android' ? { channelId: 'exits' } : {}),
        },
        trigger: null,
      });
    } catch (e) {
      console.warn('Exit notification error:', e);
    }
  };

  const initDb = useCallback(async () => {
    try {
      const db = await SQLite.openDatabaseAsync('daves_trade_v7.db');

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS signals (
          id TEXT PRIMARY KEY NOT NULL,
          pair TEXT NOT NULL,
          category TEXT NOT NULL,
          type TEXT NOT NULL,
          leverage INTEGER NOT NULL,
          strategy TEXT NOT NULL,
          riskReward TEXT NOT NULL,
          status TEXT NOT NULL,
          entry REAL NOT NULL,
          currentPrice REAL NOT NULL,
          target1 REAL NOT NULL,
          stopLoss REAL NOT NULL,
          confidence INTEGER NOT NULL,
          timeAgo TEXT NOT NULL,
          positionSizeUsd REAL NOT NULL DEFAULT 1000,
          tradingStyle TEXT NOT NULL DEFAULT 'TREND'
        );

        CREATE TABLE IF NOT EXISTS watchlist (
          symbol TEXT PRIMARY KEY NOT NULL,
          pair TEXT NOT NULL,
          isRemovable INTEGER NOT NULL DEFAULT 1,
          lastPrice REAL,
          lastChange TEXT,
          high24h TEXT,
          low24h TEXT,
          volume TEXT,
          updatedAt TEXT,
          category TEXT NOT NULL DEFAULT 'CRYPTO'
        );

        CREATE TABLE IF NOT EXISTS closed_trades (
          id TEXT PRIMARY KEY NOT NULL,
          pair TEXT NOT NULL,
          type TEXT NOT NULL,
          leverage INTEGER NOT NULL,
          entry REAL NOT NULL,
          exitPrice REAL NOT NULL,
          pnlPercent REAL NOT NULL,
          pnlAmount REAL NOT NULL,
          result TEXT NOT NULL,
          strategy TEXT NOT NULL,
          closedAt TEXT NOT NULL,
          positionSizeUsd REAL NOT NULL DEFAULT 1000,
          tradingStyle TEXT NOT NULL DEFAULT 'TREND'
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);

      // Lightweight migrations for existing installs
      const migrate = async (table: string, col: string, defSql: string) => {
        try {
          await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${col} ${defSql}`);
        } catch {
          // column already exists
        }
      };
      await migrate('signals', 'positionSizeUsd', "REAL NOT NULL DEFAULT 1000");
      await migrate('signals', 'tradingStyle', "TEXT NOT NULL DEFAULT 'TREND'");
      await migrate('signals', 'target2', 'REAL');
      await migrate('signals', 'riskUsd', 'REAL');
      await migrate('signals', 'rationale', 'TEXT');
      await migrate('signals', 'qualityScore', 'REAL');
      await migrate('signals', 'lotSize', 'REAL');
      await migrate('signals', 'lotLabel', 'TEXT');

      // Load desk settings (asset filter etc.)
      try {
        const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
        const map = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
        if (map.signalAssetFilter) {
          try {
            const parsed = JSON.parse(map.signalAssetFilter);
            if (Array.isArray(parsed) && parsed.length) {
              const allowed = parsed.filter((x: string) =>
                ['FOREX', 'CRYPTO', 'COMMODITIES'].includes(x)
              );
              if (allowed.length) setSignalAssetFilter(allowed as any);
            } else if (typeof map.signalAssetFilter === 'string') {
              // Legacy single value
              const v = map.signalAssetFilter;
              if (v === 'ALL') setSignalAssetFilter(['FOREX', 'CRYPTO', 'COMMODITIES']);
              else if (['FOREX', 'CRYPTO', 'COMMODITIES'].includes(v)) setSignalAssetFilter([v as any]);
            }
          } catch {
            const v = map.signalAssetFilter;
            if (v === 'ALL') setSignalAssetFilter(['FOREX', 'CRYPTO', 'COMMODITIES']);
            else if (['FOREX', 'CRYPTO', 'COMMODITIES'].includes(v)) setSignalAssetFilter([v as any]);
          }
        }
        if (map.positionSizeUsd) {
          const n = Number(map.positionSizeUsd);
          if (Number.isFinite(n) && n > 0) setPositionSizeUsd(n);
        }
        if (map.accountBalanceUsd) {
          const n = Number(map.accountBalanceUsd);
          if (Number.isFinite(n) && n > 0) setAccountBalanceUsd(n);
        }
        if (map.riskPercent) {
          const n = Number(map.riskPercent);
          if (Number.isFinite(n) && n > 0) setRiskPercent(n);
        }
        if (map.favorites) {
          try {
            const fav = JSON.parse(map.favorites);
            if (Array.isArray(fav)) setFavorites(fav.filter((x) => typeof x === 'string'));
          } catch {
            // ignore
          }
        }
        if (map.lastScanAt) setLastScanAt(map.lastScanAt);
      } catch {
        // ignore
      }

      await migrate('closed_trades', 'positionSizeUsd', "REAL NOT NULL DEFAULT 1000");
      await migrate('closed_trades', 'tradingStyle', "TEXT NOT NULL DEFAULT 'TREND'");
      await migrate('watchlist', 'lastPrice', 'REAL');
      await migrate('watchlist', 'lastChange', 'TEXT');
      await migrate('watchlist', 'high24h', 'TEXT');
      await migrate('watchlist', 'low24h', 'TEXT');
      await migrate('watchlist', 'volume', 'TEXT');
      await migrate('watchlist', 'updatedAt', 'TEXT');
      await migrate('watchlist', 'category', "TEXT NOT NULL DEFAULT 'CRYPTO'");

      const storedSignals = await db.getAllAsync<Signal>('SELECT * FROM signals ORDER BY id DESC');
      if (!storedSignals || storedSignals.length === 0) {
        for (const item of SEED_SIGNALS) {
          await db.runAsync(
            `INSERT INTO signals (id, pair, category, type, leverage, strategy, riskReward, status, entry, currentPrice, target1, stopLoss, confidence, timeAgo, positionSizeUsd, tradingStyle)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              item.id,
              item.pair,
              item.category,
              item.type,
              item.leverage,
              item.strategy,
              item.riskReward,
              item.status,
              item.entry,
              item.currentPrice,
              item.target1,
              item.stopLoss,
              item.confidence,
              item.timeAgo,
              item.positionSizeUsd ?? 1000,
              item.tradingStyle ?? 'TREND',
            ]
          );
        }
        setSignals(SEED_SIGNALS.filter((s) => s.status === 'ACTIVE' || s.status === 'PENDING'));
      } else {
        // Only keep live signals in Active; terminal ones belong in History
        const live = storedSignals
          .filter((s) => s && (s.status === 'ACTIVE' || s.status === 'PENDING'))
          .map((s) => ({
            ...s,
            positionSizeUsd: s.positionSizeUsd ?? 1000,
            tradingStyle: (s.tradingStyle as any) || classifyTradingStyle(s.strategy || ''),
          }));
        const terminal = storedSignals.filter(
          (s) => s && (s.status === 'STOPPED' || s.status === 'TP1 HIT')
        );
        setSignals(live);
        // Best-effort: purge terminal rows from signals table
        if (terminal.length) {
          for (const t of terminal) {
            await db.runAsync(`DELETE FROM signals WHERE id = ?`, [t.id]).catch(() => {});
          }
        }
      }

      const storedHistory = await db.getAllAsync<ClosedTrade>('SELECT * FROM closed_trades ORDER BY id DESC');
      if (!storedHistory || storedHistory.length === 0) {
        for (const trade of SEED_CLOSED_TRADES) {
          await db.runAsync(
            `INSERT INTO closed_trades (id, pair, type, leverage, entry, exitPrice, pnlPercent, pnlAmount, result, strategy, closedAt, positionSizeUsd, tradingStyle)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              trade.id,
              trade.pair,
              trade.type,
              trade.leverage,
              trade.entry,
              trade.exitPrice,
              trade.pnlPercent,
              trade.pnlAmount,
              trade.result,
              trade.strategy,
              trade.closedAt,
              trade.positionSizeUsd ?? 1000,
              trade.tradingStyle ?? 'TREND',
            ]
          );
        }
        setClosedTrades(SEED_CLOSED_TRADES);
      } else {
        setClosedTrades(
          storedHistory.filter(Boolean).map((t) => ({
            ...t,
            positionSizeUsd: t.positionSizeUsd ?? 1000,
            tradingStyle: (t.tradingStyle as any) || classifyTradingStyle(t.strategy || ''),
            pnlAmount: t.pnlAmount ?? calcDollarPnl(t.pnlPercent ?? 0, t.positionSizeUsd ?? 1000),
          }))
        );
      }

      // ---------- Watchlist: seed defaults + full restore from SQLite ----------
      try {
        type WlRow = {
          symbol: string;
          pair: string;
          isRemovable: number;
          lastPrice?: number | null;
          lastChange?: string | null;
          high24h?: string | null;
          low24h?: string | null;
          volume?: string | null;
          category?: string | null;
        };

        let saved = await db.getAllAsync<WlRow>('SELECT * FROM watchlist');

        // Seed defaults (crypto + XAUUSD + EURUSD + GBPUSD) if missing
        const ensureDefaults = !saved || saved.length === 0;
        const have = new Set((saved || []).map((r) => r?.symbol).filter(Boolean));
        for (const t of ALL_INITIAL_TICKERS) {
          if (ensureDefaults || !have.has(t.symbol)) {
            await db.runAsync(
              `INSERT OR REPLACE INTO watchlist
               (symbol, pair, isRemovable, lastPrice, lastChange, high24h, low24h, volume, updatedAt, category)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                t.symbol,
                t.pair,
                t.isRemovable === false ? 0 : 1,
                t.rawPrice,
                t.change,
                t.high24h,
                t.low24h,
                t.volume,
                new Date().toISOString(),
                t.category ||
                  (isMetalSymbol(t.symbol)
                    ? 'COMMODITIES'
                    : isForexSymbol(t.symbol)
                    ? 'FOREX'
                    : 'CRYPTO'),
              ]
            );
          }
        }
        saved = await db.getAllAsync<WlRow>('SELECT * FROM watchlist');

        if (saved?.length) {
          const rebuilt: TickerItem[] = [];

          for (const s of saved) {
            if (!s?.symbol) continue;
            const base = s.symbol.replace('USDT', '');
            let item: TickerItem | null = null;

            const cat =
              (s.category as 'CRYPTO' | 'FOREX' | 'COMMODITIES') ||
              (isMetalSymbol(s.symbol) ? 'COMMODITIES' : isForexSymbol(s.symbol) ? 'FOREX' : 'CRYPTO');

            // Prefer live quote (Binance crypto / Frankfurter FX); fall back to SQLite cache
            try {
              if (cat === 'FOREX') {
                const fx = await fetchForexTicker(s.symbol);
                const change = `${fx.changePct >= 0 ? '+' : ''}${fx.changePct.toFixed(2)}%`;
                const high = formatFxPrice(fx.high, s.symbol);
                const low = formatFxPrice(fx.low, s.symbol);
                item = {
                  pair: s.pair,
                  symbol: s.symbol,
                  price: formatFxPrice(fx.price, s.symbol),
                  rawPrice: fx.price,
                  change,
                  high24h: high,
                  low24h: low,
                  volume: 'FX Spot',
                  up: fx.changePct >= 0,
                  isRemovable: s.isRemovable !== 0,
                  category: 'FOREX',
                };
                await db.runAsync(
                  `UPDATE watchlist SET lastPrice = ?, lastChange = ?, high24h = ?, low24h = ?, volume = ?, updatedAt = ?, category = ?
                   WHERE symbol = ?`,
                  [fx.price, change, high, low, 'FX Spot', new Date().toISOString(), 'FOREX', s.symbol]
                );
              } else {
                const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${s.symbol}`);
                if (res.ok) {
                  const d = await res.json();
                  const live = parseFloat(d.lastPrice);
                  const ch = parseFloat(d.priceChangePercent).toFixed(2);
                  const high = `$${formatCryptoPrice(parseFloat(d.highPrice))}`;
                  const low = `$${formatCryptoPrice(parseFloat(d.lowPrice))}`;
                  const vol = `${(parseFloat(d.volume) / 1000).toFixed(1)}K ${base}`;
                  const change = `${parseFloat(ch) >= 0 ? '+' : ''}${ch}%`;

                  item = {
                    pair: s.pair,
                    symbol: s.symbol,
                    price: `$${formatCryptoPrice(live)}`,
                    rawPrice: live,
                    change,
                    high24h: high,
                    low24h: low,
                    volume: vol,
                    up: parseFloat(ch) >= 0,
                    isRemovable: s.isRemovable !== 0,
                    category: 'CRYPTO',
                  };

                  await db.runAsync(
                    `UPDATE watchlist SET lastPrice = ?, lastChange = ?, high24h = ?, low24h = ?, volume = ?, updatedAt = ?, category = ?
                     WHERE symbol = ?`,
                    [live, change, high, low, vol, new Date().toISOString(), 'CRYPTO', s.symbol]
                  );
                }
              }
            } catch {
              // offline / network error
            }

            if (!item) {
              const cachedPrice = s.lastPrice != null ? Number(s.lastPrice) : 0;
              const change = s.lastChange || '0.00%';
              const isFx = cat === 'FOREX';
              item = {
                pair: s.pair,
                symbol: s.symbol,
                price: cachedPrice
                  ? isFx
                    ? formatFxPrice(cachedPrice, s.symbol)
                    : `$${formatCryptoPrice(cachedPrice)}`
                  : '—',
                rawPrice: cachedPrice,
                change,
                high24h: s.high24h || '—',
                low24h: s.low24h || '—',
                volume: s.volume || (isFx ? 'FX Spot' : '—'),
                up: !change.startsWith('-'),
                isRemovable: s.isRemovable !== 0,
                category: cat,
              };
            }

            rebuilt.push(item);
          }

          if (rebuilt.length) {
            // Core pairs first (non-removable), then user-added
            rebuilt.sort((a, b) => Number(a.isRemovable) - Number(b.isRemovable));
            setTickers(rebuilt);
          }
        }
      } catch (e) {
        console.warn('Watchlist restore error:', e);
      }
    } catch (e) {
      console.error('SQLite initialization error:', e);
      setSignals(SEED_SIGNALS);
      setClosedTrades(SEED_CLOSED_TRADES);
    }
  }, []);

  useEffect(() => {
    initDb();
  }, [initDb]);

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;

    const connectWebSocket = () => {
      const cryptoStreams = tickersRef.current
        .filter((t) => (t.category || 'CRYPTO') === 'CRYPTO' && t.symbol.endsWith('USDT'))
        .map((t) => `${t.symbol.toLowerCase()}@ticker`)
        .join('/');

      const wsUrl = `wss://stream.binance.com:9443/stream?streams=${cryptoStreams || 'btcusdt@ticker'}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setIsWsConnected(true);

      ws.onmessage = async (event) => {
        try {
          const payload = JSON.parse(event.data);
          const data = payload?.data;
          if (!data || !data.s) return;

          const symbol = data.s;
          const livePrice = parseFloat(data.c);
          const priceChange = parseFloat(data.P).toFixed(2);
          const isUp = parseFloat(priceChange) >= 0;

          setTickers((prev) =>
            prev.map((t) =>
              t.symbol === symbol
                ? {
                    ...t,
                    rawPrice: livePrice,
                    price: `$${formatCryptoPrice(livePrice)}`,
                    change: `${isUp ? '+' : ''}${priceChange}%`,
                    high24h: `$${formatCryptoPrice(parseFloat(data.h))}`,
                    low24h: `$${formatCryptoPrice(parseFloat(data.l))}`,
                    volume: `${(parseFloat(data.v) / 1000).toFixed(1)}K ${t.pair.split(' ')[0]}`,
                    up: isUp,
                  }
                : t
            )
          );

          // Update live prices; move TP1 HIT / STOPPED out of Active into History
          setSignals((prev) => {
            const stillActive: Signal[] = [];
            const completed: ClosedTrade[] = [];

            for (const sig of prev) {
              if (!sig) continue;
              const matchedSymbol = sig.pair.replace(/\s+/g, '').replace('/', '');
              if (matchedSymbol !== symbol) {
                stillActive.push(sig);
                continue;
              }

              // Always refresh live price while still active
              let currentPrice = livePrice;
              let status = sig.status;
              let isComplete = false;
              let tradeResult: 'WIN' | 'LOSS' = 'WIN';

              const target1 = sig.target1 ?? 0;
              const stopLoss = sig.stopLoss ?? 0;

              if (sig.status === 'ACTIVE') {
                if (sig.type === 'LONG') {
                  if (livePrice >= target1) {
                    status = 'TP1 HIT';
                    isComplete = true;
                    tradeResult = 'WIN';
                  } else if (livePrice <= stopLoss) {
                    status = 'STOPPED';
                    isComplete = true;
                    tradeResult = 'LOSS';
                  }
                } else {
                  if (livePrice <= target1) {
                    status = 'TP1 HIT';
                    isComplete = true;
                    tradeResult = 'WIN';
                  } else if (livePrice >= stopLoss) {
                    status = 'STOPPED';
                    isComplete = true;
                    tradeResult = 'LOSS';
                  }
                }
              }

              if (isComplete) {
                const entry = sig.entry || 1;
                const rawPnl =
                  sig.type === 'LONG'
                    ? ((livePrice - entry) / entry) * sig.leverage * 100
                    : ((entry - livePrice) / entry) * sig.leverage * 100;

                const size = sig.positionSizeUsd ?? positionSizeRef.current ?? 1000;
                const style = sig.tradingStyle || classifyTradingStyle(sig.strategy || '');
                const pnlAmount = calcDollarPnl(rawPnl, size);
                completed.push({
                  id: `closed-${Date.now()}-${sig.id}`,
                  pair: sig.pair,
                  type: sig.type,
                  leverage: sig.leverage,
                  entry: sig.entry ?? 0,
                  exitPrice: livePrice,
                  pnlPercent: Number(rawPnl.toFixed(2)),
                  pnlAmount,
                  result: tradeResult,
                  strategy: sig.strategy ?? 'Quant Algo Confluence',
                  closedAt: 'Just now',
                  positionSizeUsd: size,
                  tradingStyle: style,
                });

                // Push + toast for TP / SL hit
                dispatchExitNotification(sig, tradeResult, livePrice, pnlAmount);
                showToast(
                  tradeResult === 'WIN'
                    ? `TP HIT · ${sig.pair}`
                    : `SL HIT · ${sig.pair}`,
                  tradeResult === 'WIN' ? 'success' : 'error'
                );
                // Do NOT push back into stillActive — removed from Active Signals
              } else {
                stillActive.push({ ...sig, currentPrice, status });
              }
            }

            if (completed.length) {
              setClosedTrades((curr) => [...completed, ...curr]);
              // Persist closed trades + remove completed rows from signals table
              const completedSignalIds = completed.map((t) => {
                // id format: closed-{ts}-{originalSignalId}
                const parts = t.id.split('-');
                return parts.length >= 3 ? parts.slice(2).join('-') : '';
              }).filter(Boolean);

              (async () => {
                try {
                  const db = await SQLite.openDatabaseAsync('daves_trade_v7.db');
                  for (const trade of completed) {
                    await db.runAsync(
                      `INSERT OR REPLACE INTO closed_trades
                       (id, pair, type, leverage, entry, exitPrice, pnlPercent, pnlAmount, result, strategy, closedAt, positionSizeUsd, tradingStyle)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                      [
                        trade.id,
                        trade.pair,
                        trade.type,
                        trade.leverage,
                        trade.entry,
                        trade.exitPrice,
                        trade.pnlPercent,
                        trade.pnlAmount,
                        trade.result,
                        trade.strategy,
                        trade.closedAt,
                        trade.positionSizeUsd ?? 1000,
                        trade.tradingStyle ?? 'TREND',
                      ]
                    );
                  }
                  for (const sigId of completedSignalIds) {
                    await db.runAsync(`DELETE FROM signals WHERE id = ?`, [sigId]);
                  }
                  // Safety: purge any leftover terminal statuses
                  await db.runAsync(
                    `DELETE FROM signals WHERE status IN ('STOPPED', 'TP1 HIT')`
                  );
                } catch (e) {
                  console.warn('Persist closed trade error:', e);
                }
              })();
            }

            return stillActive;
          });
        } catch {
          // Stream jitter guard
        }
      };

      ws.onerror = () => setIsWsConnected(false);
      ws.onclose = () => {
        setIsWsConnected(false);
        reconnectTimeout = setTimeout(connectWebSocket, 4000);
      };
    };

    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  useEffect(() => {
    const raw = symbolInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!isAddModalVisible || raw.length < 2) {
      setTypingPrediction(null);
      setIsPredicting(false);
      return;
    }
    const clean = raw.endsWith('USDT') ? raw : `${raw}USDT`;
    let cancelled = false;
    setIsPredicting(true);

    const timer = setTimeout(async () => {
      try {
        // Forex path (EURUSD etc.) vs crypto USDT
        const typingIsFx = isForexSymbol(clean.replace(/USDT$/, '')) || isForexSymbol(raw);

        if (typingIsFx) {
          const fxMeta = normalizeForexSymbol(raw.length >= 6 ? raw : clean.replace('USDT', ''));
          try {
            const fx = await fetchForexTicker(fxMeta.symbol);
            if (cancelled) return;
            const entry = fx.price;
            const ch = fx.changePct;
            const dec = getPrecision(entry);
            // Synthetic mild HA series around spot for confluence scoring
            const candles = Array.from({ length: 30 }, (_, i) => {
              const drift = (ch / 100) * (i / 30) * entry;
              const noise = entry * 0.0004 * Math.sin(i * 1.3);
              const c = entry - drift + noise;
              return {
                open: c * 0.9998,
                high: c * 1.0005,
                low: c * 0.9995,
                close: c,
                volume: 1000 + i,
              };
            });
            const confluence = evaluateConfluence(candles, ch >= 0);
            const delta = entry * (confluence.confidence >= 92 ? 0.004 : 0.006);
            const isLong = confluence.isLong;
            const stopLoss = isLong
              ? Number((entry - delta).toFixed(dec))
              : Number((entry + delta).toFixed(dec));
            const target1 = isLong
              ? Number((entry + delta * 2.6).toFixed(dec))
              : Number((entry - delta * 2.6).toFixed(dec));

            setTypingPrediction({
              pair: fxMeta.pair,
              symbol: fxMeta.symbol,
              type: isLong ? 'LONG' : 'SHORT',
              entry,
              target1,
              stopLoss,
              leverage: 20,
              change: `${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%`,
              strategy: confluence.strategy,
              confidence: confluence.confidence,
              alreadyAdded: tickers.some((x) => x.symbol === fxMeta.symbol),
              notFound: false,
            });
          } catch {
            if (!cancelled) {
              setTypingPrediction({
                pair: fxMeta.pair,
                symbol: fxMeta.symbol,
                type: 'LONG',
                entry: 0,
                target1: 0,
                stopLoss: 0,
                leverage: 20,
                change: '',
                strategy: 'FX Pair Not Found',
                confidence: 0,
                alreadyAdded: false,
                notFound: true,
              });
            }
          }
          return;
        }

        const [tickerRes, klineRes] = await Promise.all([
          fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${clean}`),
          fetch(`https://api.binance.com/api/v3/klines?symbol=${clean}&interval=15m&limit=25`),
        ]);

        if (cancelled) return;
        if (!tickerRes.ok) {
          setTypingPrediction({
            pair: `${clean.replace('USDT', '')} / USDT`,
            symbol: clean,
            type: 'LONG',
            entry: 0,
            target1: 0,
            stopLoss: 0,
            leverage: 5,
            change: '',
            strategy: 'Pair Not Found',
            confidence: 0,
            alreadyAdded: false,
            notFound: true,
          });
          return;
        }

        const d = await tickerRes.json();
        const entry = parseFloat(d.lastPrice);
        const ch = parseFloat(d.priceChangePercent);
        const dec = getPrecision(entry);

        let isLong = ch >= 0;
        let strat = '15M Momentum Sweep';
        let conf = 91;
        let delta = entry * 0.018;

        if (klineRes.ok) {
          const rawKlines = await klineRes.json();
          const candles = rawKlines.map((k: any) => ({
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
          }));
          const confluence = evaluateConfluence(candles, ch >= 0);
          isLong = confluence.isLong;
          strat = confluence.strategy;
          conf = confluence.confidence;
          delta = entry * (confluence.confidence >= 92 ? 0.014 : 0.018);
        }

        const stopLoss = isLong
          ? Number((entry - delta).toFixed(dec))
          : Number((entry + delta).toFixed(dec));
        const target1 = isLong
          ? Number((entry + delta * 2.6).toFixed(dec))
          : Number((entry - delta * 2.6).toFixed(dec));

        setTypingPrediction({
          pair: `${clean.replace('USDT', '')} / USDT`,
          symbol: clean,
          type: isLong ? 'LONG' : 'SHORT',
          entry,
          target1,
          stopLoss,
          leverage: entry > 1000 ? 10 : entry < 1 ? 5 : 10,
          change: `${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%`,
          strategy: strat,
          confidence: conf,
          alreadyAdded: tickers.some((x) => x.symbol === clean),
          notFound: false,
        });
      } catch {
        if (!cancelled) setTypingPrediction(null);
      } finally {
        if (!cancelled) setIsPredicting(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [symbolInput, isAddModalVisible, tickers]);

  const predictSignalForPair = async (
    inputTicker: TickerItem,
    options?: { silent?: boolean }
  ) => {
    let targetTicker = inputTicker;
    const silent = options?.silent === true;
    if (!silent) {
      setIsScanning(true);
      setScanProgress(15);
      setScanStep(`Fetching 15M Kline depth for ${targetTicker.pair}...`);
    }

    try {
      const isFx =
        targetTicker.category === 'FOREX' ||
        targetTicker.category === 'COMMODITIES' ||
        isForexSymbol(targetTicker.symbol) ||
        isMetalSymbol(targetTicker.symbol);

      let candles: Candle[] = [];

      if (isFx) {
        if (!silent) {
          setScanProgress(45);
          setScanStep(`Fetching FX spot + building HA synthetic structure...`);
          await new Promise((r) => setTimeout(r, 200));
        }
        try {
          const fx = await fetchForexTicker(targetTicker.symbol);
          targetTicker = {
            ...targetTicker,
            rawPrice: fx.price,
            price: formatFxPrice(fx.price, targetTicker.symbol),
            change: `${fx.changePct >= 0 ? '+' : ''}${fx.changePct.toFixed(2)}%`,
            up: fx.changePct >= 0,
            category: 'FOREX',
          };
          const entryPx = fx.price;
          candles = Array.from({ length: 40 }, (_, i) => {
            const drift = (fx.changePct / 100) * (i / 40) * entryPx;
            const noise = entryPx * 0.00035 * Math.sin(i * 1.1);
            const c = entryPx - drift + noise;
            return {
              open: c * 0.9997,
              high: c * 1.0006,
              low: c * 0.9994,
              close: c,
              volume: 800 + i * 3,
            };
          });
        } catch (e) {
          console.warn('FX kline synth error', e);
        }
      } else {
        const klineRes = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${targetTicker.symbol}&interval=15m&limit=45`
        );

        if (!silent) {
          setScanProgress(45);
          setScanStep(`Building Heikin Ashi series + RSI(14), EMA(9/21) & ATR...`);
          await new Promise((r) => setTimeout(r, 300));
        }

        if (klineRes.ok) {
          const rawKlines = await klineRes.json();
          candles = rawKlines.map((k: any) => ({
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
          }));
        }
      }

      if (!silent) {
        setScanProgress(75);
        setScanStep(`Scoring HA trend, RSI extremes & EMA structure confluence...`);
        await new Promise((r) => setTimeout(r, 250));
      }

      const entry = targetTicker.rawPrice;

      const confluence = evaluateConfluence(candles, targetTicker.up);

      if (!silent) {
        setScanProgress(95);
        setScanStep(
          `Packaging plan · R:R ${confluence.riskReward} · conf ${confluence.confidence}%`
        );
        await new Promise((r) => setTimeout(r, 200));
      }

      const signalCategory =
        targetTicker.category ||
        (isMetalSymbol(targetTicker.symbol)
          ? 'COMMODITIES'
          : isForexSymbol(targetTicker.symbol)
          ? 'FOREX'
          : 'CRYPTO');

      const plan = buildTradePlan(entry, confluence, {
        balanceUsd: accountBalanceRef.current || 10000,
        riskPercent: riskPercentRef.current || 1,
        assetClass: signalCategory === 'COMMODITIES' ? 'COMMODITIES' : signalCategory === 'FOREX' ? 'FOREX' : 'CRYPTO',
        symbol: targetTicker.symbol,
        fallbackPositionUsd: positionSizeRef.current || positionSizeUsd,
      });

      const newSignal: Signal = {
        id: `sig-${Date.now()}`,
        pair: targetTicker.pair,
        category: signalCategory,
        type: plan.isLong ? 'LONG' : 'SHORT',
        leverage: plan.leverage,
        strategy: plan.strategy,
        riskReward: plan.riskReward,
        status: 'ACTIVE',
        entry: plan.entry,
        currentPrice: plan.entry,
        target1: plan.target1,
        target2: plan.target2,
        stopLoss: plan.stopLoss,
        confidence: plan.confidence,
        timeAgo: 'Just now',
        positionSizeUsd: plan.positionSizeUsd,
        tradingStyle: plan.tradingStyle,
        riskUsd: plan.riskUsd,
        rationale: plan.rationale,
        qualityScore: plan.qualityScore,
        lotSize: plan.lotSize,
        lotLabel: plan.lotLabel,
      };

      const db = await SQLite.openDatabaseAsync('daves_trade_v7.db');
      await db.runAsync(
        `INSERT INTO signals (id, pair, category, type, leverage, strategy, riskReward, status, entry, currentPrice, target1, stopLoss, confidence, timeAgo, positionSizeUsd, tradingStyle, target2, riskUsd, rationale, qualityScore, lotSize, lotLabel)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newSignal.id,
          newSignal.pair,
          newSignal.category,
          newSignal.type,
          newSignal.leverage,
          newSignal.strategy,
          newSignal.riskReward,
          newSignal.status,
          newSignal.entry,
          newSignal.currentPrice,
          newSignal.target1,
          newSignal.stopLoss,
          newSignal.confidence,
          newSignal.timeAgo,
          newSignal.positionSizeUsd,
          newSignal.tradingStyle,
          newSignal.target2 ?? null,
          newSignal.riskUsd ?? null,
          newSignal.rationale ?? null,
          newSignal.qualityScore ?? null,
          newSignal.lotSize ?? null,
          newSignal.lotLabel ?? null,
        ]
      );

      setSignals((prev) => {
        const pairKey = newSignal.pair.replace(/\s+/g, '').replace('/', '').toUpperCase();
        const withoutDup = prev.filter((s) => {
          if (!s) return false;
          if (s.status !== 'ACTIVE' && s.status !== 'PENDING') return true;
          const k = s.pair.replace(/\s+/g, '').replace('/', '').toUpperCase();
          return k !== pairKey;
        });
        return [newSignal, ...withoutDup];
      });
      const scanLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastScanAt(scanLabel);
      persistDeskSetting('lastScanAt', scanLabel);
      await dispatchSignalNotification(newSignal);
      if (!silent) {
        showToast(`${newSignal.type} ${newSignal.pair} · ${newSignal.confidence}% conf`, 'success');
      }
    } catch (e) {
      console.warn('Signal calculation error:', e);
    } finally {
      if (!silent) {
        setIsScanning(false);
        setScanProgress(0);
        setFeedMode('ACTIVE');
        setActiveTab('signals');
      }
    }
  };

  /** Manual market scan — top mover, full UI */
  const generateSignalWithAlgo = async () => {
    const list = tickersRef.current;
    if (list.length === 0) return;
    const assetFilter = signalAssetFilterRef.current?.length
      ? signalAssetFilterRef.current
      : (['FOREX'] as Array<'FOREX' | 'CRYPTO' | 'COMMODITIES'>);
    const pool = list.filter((t) => {
      const cat =
        t.category ||
        (isMetalSymbol(t.symbol) ? 'COMMODITIES' : isForexSymbol(t.symbol) ? 'FOREX' : 'CRYPTO');
      return assetFilter.includes(cat as any);
    });
    const use = pool.length ? pool : list;
    const sorted = [...use].sort((a, b) => {
      const chA = Math.abs(parseFloat(a.change.replace('%', '')) || 0);
      const chB = Math.abs(parseFloat(b.change.replace('%', '')) || 0);
      return chB - chA;
    });
    await predictSignalForPair(sorted[0] || use[0], { silent: false });
  };

  /**
   * Auto signal pass:
   * - ensures at least one active signal per top pairs
   * - runs silently in background (no modal spam)
   */
  const runAutoSignalPass = useCallback(async (reason: 'boot' | 'interval' | 'manual' = 'interval') => {
    if (autoPassRunning.current) return;
    const list = tickersRef.current;
    if (!list.length) return;
    if (isScanningRef.current) return;

    autoPassRunning.current = true;
    try {
      const liveSignals = signalsRef.current.filter(
        (s) => s && (s.status === 'ACTIVE' || s.status === 'PENDING')
      );

      const activeKeys = new Set(
        liveSignals.map((s) => s.pair.replace(/\s+/g, '').replace('/', '').toUpperCase())
      );

      const assetFilter = signalAssetFilterRef.current?.length
        ? signalAssetFilterRef.current
        : (['FOREX'] as Array<'FOREX' | 'CRYPTO' | 'COMMODITIES'>);
      const matchesAsset = (t: TickerItem) => {
        const cat =
          t.category ||
          (isMetalSymbol(t.symbol) ? 'COMMODITIES' : isForexSymbol(t.symbol) ? 'FOREX' : 'CRYPTO');
        return assetFilter.includes(cat as any);
      };

      const candidates = [...list]
        .filter(matchesAsset)
        .map((t) => {
          const key = t.symbol.replace(/USDT$/i, '').toUpperCase();
          const pairKey = t.pair.replace(/\s+/g, '').replace('/', '').toUpperCase();
          return {
            t,
            absCh: Math.abs(parseFloat(String(t.change).replace('%', '')) || 0),
            hasActive: activeKeys.has(key) || activeKeys.has(pairKey) || activeKeys.has(t.symbol.toUpperCase()),
          };
        })
        .sort((a, b) => {
          if (a.hasActive !== b.hasActive) return a.hasActive ? 1 : -1;
          return b.absCh - a.absCh;
        });

      if (!candidates.length) {
        return;
      }

      const needMin = reason === 'boot' ? Math.min(5, list.length) : Math.min(2, list.length);
      const activeCount = liveSignals.length;

      if (reason === 'interval' && activeCount >= needMin) {
        const gap = candidates.find((c) => !c.hasActive);
        if (gap) await predictSignalForPair(gap.t, { silent: true });
        return;
      }

      let generated = 0;
      for (const c of candidates) {
        if (generated >= needMin) break;
        // On boot fill gaps first; still allow one refresh of covered pairs if nothing left
        if (c.hasActive && generated < needMin && reason === 'boot') {
          // skip already-covered on boot so we diversify
          continue;
        }
        if (c.hasActive && reason !== 'boot') continue;
        try {
          await predictSignalForPair(c.t, { silent: true });
          generated += 1;
        } catch (e) {
          console.warn('Auto signal failed for', c.t.symbol, e);
        }
      }

      // If boot still empty (all candidates had active), force-scan top movers
      if (reason === 'boot' && generated === 0 && activeCount === 0) {
        for (const c of candidates.slice(0, needMin)) {
          try {
            await predictSignalForPair(c.t, { silent: true });
            generated += 1;
          } catch {
            // continue
          }
        }
      }

      if (generated > 0) {
        if (reason === 'boot') {
          showToast(`Auto-generated ${generated} live signal${generated > 1 ? 's' : ''}`, 'success');
        }
        setFeedMode('ACTIVE');
      }
    } finally {
      autoPassRunning.current = false;
    }
  }, []);

  // Boot: after DB + tickers settle, auto-generate signals
  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      // wait for watchlist restore / seed
      await new Promise((r) => setTimeout(r, 1200));
      if (cancelled) return;
      if (tickersRef.current.length === 0) return;
      await runAutoSignalPass('boot');
    };
    boot();
    return () => {
      cancelled = true;
    };
  }, [runAutoSignalPass]);

  // Interval: keep desk populated every 3 minutes
  useEffect(() => {
    const id = setInterval(() => {
      runAutoSignalPass('interval');
    }, 3 * 60 * 1000);
    return () => clearInterval(id);
  }, [runAutoSignalPass]);

  // Poll FX / metals for TP/SL hits (Binance WS only covers crypto)
  useEffect(() => {
    const tickFx = async () => {
      const live = signalsRef.current.filter(
        (s) =>
          s &&
          (s.status === 'ACTIVE' || s.status === 'PENDING') &&
          (s.category === 'FOREX' || s.category === 'COMMODITIES')
      );
      if (!live.length) return;

      for (const sig of live) {
        try {
          const symbol = sig.pair.replace(/\s+/g, '').replace('/', '');
          const fx = await fetchForexTicker(symbol);
          const livePrice = fx.price;
          const target1 = sig.target1 ?? 0;
          const stopLoss = sig.stopLoss ?? 0;
          let hit: 'WIN' | 'LOSS' | null = null;
          if (sig.type === 'LONG') {
            if (livePrice >= target1) hit = 'WIN';
            else if (livePrice <= stopLoss) hit = 'LOSS';
          } else {
            if (livePrice <= target1) hit = 'WIN';
            else if (livePrice >= stopLoss) hit = 'LOSS';
          }

          // Always refresh current price on the card
          setSignals((prev) =>
            prev.map((s) => (s?.id === sig.id && s.status === 'ACTIVE' ? { ...s, currentPrice: livePrice } : s))
          );

          if (!hit) continue;

          const entry = sig.entry || 1;
          const rawPnl =
            sig.type === 'LONG'
              ? ((livePrice - entry) / entry) * sig.leverage * 100
              : ((entry - livePrice) / entry) * sig.leverage * 100;
          const size = sig.positionSizeUsd ?? positionSizeRef.current ?? 1000;
          const pnlAmount = calcDollarPnl(rawPnl, size);
          const closed = {
            id: `closed-${Date.now()}-${sig.id}`,
            pair: sig.pair,
            type: sig.type,
            leverage: sig.leverage,
            entry: sig.entry ?? 0,
            exitPrice: livePrice,
            pnlPercent: Number(rawPnl.toFixed(2)),
            pnlAmount,
            result: hit,
            strategy: sig.strategy ?? 'Quant Algo Confluence',
            closedAt: 'Just now',
            positionSizeUsd: size,
            tradingStyle: sig.tradingStyle || classifyTradingStyle(sig.strategy || ''),
          } as ClosedTrade;

          setSignals((prev) => prev.filter((s) => s?.id !== sig.id));
          setClosedTrades((curr) => [closed, ...curr]);
          dispatchExitNotification(sig, hit, livePrice, pnlAmount);
          showToast(hit === 'WIN' ? `TP HIT · ${sig.pair}` : `SL HIT · ${sig.pair}`, hit === 'WIN' ? 'success' : 'error');

          try {
            const db = await SQLite.openDatabaseAsync('daves_trade_v7.db');
            await db.runAsync(
              `INSERT OR REPLACE INTO closed_trades
               (id, pair, type, leverage, entry, exitPrice, pnlPercent, pnlAmount, result, strategy, closedAt, positionSizeUsd, tradingStyle)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                closed.id,
                closed.pair,
                closed.type,
                closed.leverage,
                closed.entry,
                closed.exitPrice,
                closed.pnlPercent,
                closed.pnlAmount,
                closed.result,
                closed.strategy,
                closed.closedAt,
                closed.positionSizeUsd,
                closed.tradingStyle,
              ]
            );
            await db.runAsync(`DELETE FROM signals WHERE id = ?`, [sig.id]);
          } catch (e) {
            console.warn('FX exit persist error', e);
          }
        } catch {
          // rate fetch fail — skip
        }
      }
    };

    const id = setInterval(tickFx, 60_000);
    // first pass after short delay
    const t = setTimeout(tickFx, 8000);
    return () => {
      clearInterval(id);
      clearTimeout(t);
    };
  }, []);

  const addNewSymbol = async (input: string) => {
    const raw = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!raw) {
      Alert.alert('Invalid Symbol', 'Enter a crypto ticker (DOGE, SOL) or FX pair (EURUSD, XAUUSD).');
      return;
    }

    const wantsForex =
      isForexSymbol(raw) ||
      isMetalSymbol(raw) ||
      FOREX_DATABASE.includes(raw) ||
      raw === 'XAU' ||
      raw === 'GOLD' ||
      raw === 'XAG' ||
      raw === 'SILVER';

    setIsAddingSymbol(true);

    try {
      let newTicker: TickerItem;

      if (wantsForex) {
        const fxMeta = normalizeForexSymbol(raw);
        if (tickersRef.current.some((t) => t.symbol === fxMeta.symbol)) {
          Alert.alert('Symbol Exists', `${fxMeta.pair} is already on your watchlist.`);
          return;
        }

        const fx = await fetchForexTicker(fxMeta.symbol);
        const change = `${fx.changePct >= 0 ? '+' : ''}${fx.changePct.toFixed(2)}%`;
        const fxCat: 'FOREX' | 'COMMODITIES' = isMetalSymbol(fxMeta.symbol)
          ? 'COMMODITIES'
          : 'FOREX';
        newTicker = {
          pair: fxMeta.pair,
          symbol: fxMeta.symbol,
          price: formatFxPrice(fx.price, fxMeta.symbol),
          rawPrice: fx.price,
          change,
          high24h: formatFxPrice(fx.high, fxMeta.symbol),
          low24h: formatFxPrice(fx.low, fxMeta.symbol),
          volume: fxCat === 'COMMODITIES' ? 'Gold Spot' : 'FX Spot',
          up: fx.changePct >= 0,
          isRemovable: true,
          category: fxCat,
        };
      } else {
        const cleanSymbol = raw.endsWith('USDT') ? raw : `${raw}USDT`;
        const baseAsset = cleanSymbol.replace('USDT', '');
        const displayPair = `${baseAsset} / USDT`;

        if (tickersRef.current.some((t) => t.symbol === cleanSymbol)) {
          Alert.alert('Symbol Exists', `${displayPair} is already on your watchlist.`);
          return;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        let res: Response;
        try {
          res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${cleanSymbol}`, {
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        if (!res.ok) {
          throw new Error(`Symbol ${cleanSymbol} not found on Binance.`);
        }

        const data = await res.json();
        const livePrice = parseFloat(data.lastPrice);
        if (!Number.isFinite(livePrice) || livePrice <= 0) {
          throw new Error('Invalid price returned for symbol.');
        }
        const priceChange = parseFloat(data.priceChangePercent).toFixed(2);
        const isUp = parseFloat(priceChange) >= 0;

        newTicker = {
          pair: displayPair,
          symbol: cleanSymbol,
          price: `$${formatCryptoPrice(livePrice)}`,
          rawPrice: livePrice,
          change: `${isUp ? '+' : ''}${priceChange}%`,
          high24h: `$${formatCryptoPrice(parseFloat(data.highPrice))}`,
          low24h: `$${formatCryptoPrice(parseFloat(data.lowPrice))}`,
          volume: `${(parseFloat(data.volume) / 1000).toFixed(1)}K ${baseAsset}`,
          up: isUp,
          isRemovable: true,
          category: 'CRYPTO',
        };
      }

      // Optimistic UI update
      setTickers((prev) => {
        if (prev.some((t) => t.symbol === newTicker.symbol)) return prev;
        return [newTicker, ...prev];
      });

      // Persist to SQLite (must succeed for restore)
      try {
        const db = await SQLite.openDatabaseAsync('daves_trade_v7.db');
        await db.runAsync(
          `INSERT OR REPLACE INTO watchlist
           (symbol, pair, isRemovable, lastPrice, lastChange, high24h, low24h, volume, updatedAt, category)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newTicker.symbol,
            newTicker.pair,
            1,
            newTicker.rawPrice,
            newTicker.change,
            newTicker.high24h,
            newTicker.low24h,
            newTicker.volume,
            new Date().toISOString(),
            newTicker.category || 'CRYPTO',
          ]
        );
      } catch (e) {
        console.warn('Watchlist save error:', e);
        Alert.alert('Saved offline', 'Pair added on screen but SQLite save failed. It may not restore after restart.');
      }

      // Live WS only for crypto
      if (
        newTicker.category === 'CRYPTO' &&
        wsRef.current &&
        wsRef.current.readyState === WebSocket.OPEN
      ) {
        try {
          wsRef.current.send(
            JSON.stringify({
              method: 'SUBSCRIBE',
              params: [`${newTicker.symbol.toLowerCase()}@ticker`],
              id: Date.now(),
            })
          );
        } catch (e) {
          console.warn('WS subscribe error:', e);
        }
      }

      setSymbolInput('');
      setTypingPrediction(null);
      setIsAddModalVisible(false);
      showToast(`${newTicker.pair} added to desk`, 'success');

      // Optional signal generation after modal closes
      if (autoPredictOnAdd) {
        setTimeout(() => {
          predictSignalForPair(newTicker);
        }, 250);
      }
    } catch (err: any) {
      const msg =
        err?.name === 'AbortError'
          ? 'Request timed out. Check your network and try again.'
          : err?.message || 'Symbol not found. Try DOGE, SOL, EURUSD, XAUUSD…';
      Alert.alert('Lookup Failed', msg);
    } finally {
      setIsAddingSymbol(false);
    }
  };

  const removeSymbol = async (symbolToRemove: string) => {
    const target = tickersRef.current.find((t) => t.symbol === symbolToRemove);
    Alert.alert('Remove Pair', `Remove ${target?.pair || symbolToRemove} from your desk?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeSymbolConfirmed(symbolToRemove);
        },
      },
    ]);
  };

  const removeSymbolConfirmed = async (symbolToRemove: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(
          JSON.stringify({
            method: 'UNSUBSCRIBE',
            params: [`${symbolToRemove.toLowerCase()}@ticker`],
            id: Date.now(),
          })
        );
      } catch {
        // ignore
      }
    }

    setTickers((prev) => prev.filter((t) => t.symbol !== symbolToRemove));

    try {
      const db = await SQLite.openDatabaseAsync('daves_trade_v7.db');
      await db.runAsync('DELETE FROM watchlist WHERE symbol = ?', [symbolToRemove]);
      showToast(`${symbolToRemove} removed`, 'info');
    } catch (e) {
      console.warn('Watchlist delete error:', e);
    }
  };

  /** Delete every pair on the desk (DB + UI), then optionally reseed defaults */
  const clearAllWatchlistPairs = () => {
    const count = tickersRef.current.length;
    if (!count) {
      showToast('Watchlist is already empty', 'info');
      return;
    }
    Alert.alert(
      'Delete All Pairs',
      `Remove all ${count} pairs from your markets desk?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirm Delete All',
              'This clears the entire watchlist from SQLite. You can restore defaults after.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Everything',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      // Unsubscribe crypto streams
                      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                        for (const t of tickersRef.current) {
                          if ((t.category || 'CRYPTO') === 'CRYPTO' && t.symbol.endsWith('USDT')) {
                            try {
                              wsRef.current.send(
                                JSON.stringify({
                                  method: 'UNSUBSCRIBE',
                                  params: [`${t.symbol.toLowerCase()}@ticker`],
                                  id: Date.now(),
                                })
                              );
                            } catch {
                              // ignore
                            }
                          }
                        }
                      }
                      const db = await SQLite.openDatabaseAsync('daves_trade_v7.db');
                      await db.runAsync('DELETE FROM watchlist');
                      setTickers([]);
                      showToast('All pairs deleted', 'success');
                    } catch (e) {
                      console.warn('Clear all pairs error:', e);
                      setTickers([]);
                      showToast('Pairs cleared on device', 'info');
                    }
                  },
                },
                {
                  text: 'Reset to Defaults',
                  onPress: async () => {
                    try {
                      const db = await SQLite.openDatabaseAsync('daves_trade_v7.db');
                      await db.runAsync('DELETE FROM watchlist');
                      for (const t of ALL_INITIAL_TICKERS) {
                        await db.runAsync(
                          `INSERT OR REPLACE INTO watchlist
                           (symbol, pair, isRemovable, lastPrice, lastChange, high24h, low24h, volume, updatedAt, category)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                          [
                            t.symbol,
                            t.pair,
                            t.isRemovable === false ? 0 : 1,
                            t.rawPrice,
                            t.change,
                            t.high24h,
                            t.low24h,
                            t.volume,
                            new Date().toISOString(),
                            t.category || 'CRYPTO',
                          ]
                        );
                      }
                      setTickers(ALL_INITIAL_TICKERS.map((x) => ({ ...x })));
                      showToast('Watchlist reset to defaults', 'success');
                    } catch (e) {
                      console.warn('Reset defaults error:', e);
                      setTickers(ALL_INITIAL_TICKERS.map((x) => ({ ...x })));
                      showToast('Defaults restored on device', 'info');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const predictedCoinSuggestions = useMemo(() => {
    const q = symbolInput.trim().toUpperCase();
    const pool = [...FOREX_DATABASE, ...COIN_DATABASE];
    if (!q) {
      // Defaults first: XAUUSD, EURUSD, GBPUSD + top coins
      return ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', ...COIN_DATABASE.slice(0, 4)];
    }
    return pool.filter((c) => c.includes(q)).slice(0, 10);
  }, [symbolInput]);

  const historyStats = useMemo(() => {
    const total = closedTrades.length;
    const wins = closedTrades.filter((t) => t?.result === 'WIN').length;
    const losses = closedTrades.filter((t) => t?.result === 'LOSS').length;
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';
    const totalPnlAmount = closedTrades.reduce((acc, curr) => acc + (curr?.pnlAmount ?? 0), 0);
    const isNetPositive = totalPnlAmount >= 0;

    return {
      total,
      wins,
      losses,
      winRate,
      totalPnlAmount: `${isNetPositive ? '+' : ''}$${totalPnlAmount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      isNetPositive,
    };
  }, [closedTrades]);

  const filteredClosedTrades = useMemo(() => {
    const list = [...new Map(closedTrades.filter(Boolean).map((x) => [x?.id, x])).values()];
    if (historyFilter === 'WINS') return list.filter((t) => t?.result === 'WIN');
    if (historyFilter === 'LOSSES') return list.filter((t) => t?.result === 'LOSS');
    return list;
  }, [closedTrades, historyFilter]);

  const filteredSignals = useMemo(() => {
    // Active feed only shows live signals — STOPPED / TP1 HIT live in History
    let list = [
      ...new Map(
        signals
          .filter(Boolean)
          .filter((s) => s?.status === 'ACTIVE' || s?.status === 'PENDING')
          .map((x) => [x?.id, x])
      ).values(),
    ];
    if (selectedFilter !== 'ALL') {
      list = list.filter((s) => s?.category === selectedFilter);
    }
    if (styleFilter !== 'ALL') {
      list = list.filter((s) => (s?.tradingStyle || classifyTradingStyle(s?.strategy || '')) === styleFilter);
    }
    return list;
  }, [signals, selectedFilter, styleFilter]);

  const cycleTheme = () => {
    setThemeMode(themeMode === 'auto' ? 'dark' : themeMode === 'dark' ? 'light' : 'auto');
  };

  const toggleFavorite = async (symbol: string) => {
    setFavorites((prev) => {
      const next = prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol];
      persistDeskSetting('favorites', JSON.stringify(next));
      showToast(
        next.includes(symbol) ? `${symbol} pinned` : `${symbol} unpinned`,
        'info'
      );
      return next;
    });
  };

  /** Manually close an active signal into history at current price */
  const closeActiveSignal = (signal: Signal, asWin?: boolean) => {
    Alert.alert(
      'Close Signal',
      `Close ${signal.pair} at current price?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close as Loss',
          style: 'destructive',
          onPress: () => finalizeManualClose(signal, false),
        },
        {
          text: 'Close as Win',
          onPress: () => finalizeManualClose(signal, true),
        },
      ]
    );
  };

  const finalizeManualClose = async (signal: Signal, isWin: boolean) => {
    const livePrice = signal.currentPrice || signal.entry;
    const entry = signal.entry || 1;
    const rawPnl =
      signal.type === 'LONG'
        ? ((livePrice - entry) / entry) * signal.leverage * 100
        : ((entry - livePrice) / entry) * signal.leverage * 100;
    const size = signal.positionSizeUsd ?? positionSizeRef.current ?? 1000;
    const pnlAmount = calcDollarPnl(rawPnl, size);
    const result = isWin ? 'WIN' : 'LOSS';
    const closed: ClosedTrade = {
      id: `closed-manual-${Date.now()}-${signal.id}`,
      pair: signal.pair,
      type: signal.type,
      leverage: signal.leverage,
      entry: signal.entry,
      exitPrice: livePrice,
      pnlPercent: Number(rawPnl.toFixed(2)),
      pnlAmount,
      result,
      strategy: signal.strategy,
      closedAt: 'Manual close',
      positionSizeUsd: size,
      tradingStyle: signal.tradingStyle || 'TREND',
    };
    setSignals((prev) => prev.filter((s) => s?.id !== signal.id));
    setClosedTrades((curr) => [closed, ...curr]);
    try {
      const db = await SQLite.openDatabaseAsync('daves_trade_v7.db');
      await db.runAsync(
        `INSERT OR REPLACE INTO closed_trades
         (id, pair, type, leverage, entry, exitPrice, pnlPercent, pnlAmount, result, strategy, closedAt, positionSizeUsd, tradingStyle)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          closed.id,
          closed.pair,
          closed.type,
          closed.leverage,
          closed.entry,
          closed.exitPrice,
          closed.pnlPercent,
          closed.pnlAmount,
          closed.result,
          closed.strategy,
          closed.closedAt,
          closed.positionSizeUsd,
          closed.tradingStyle,
        ]
      );
      await db.runAsync(`DELETE FROM signals WHERE id = ?`, [signal.id]);
    } catch (e) {
      console.warn('Manual close persist error', e);
    }
    showToast(`Closed ${signal.pair} · ${result}`, isWin ? 'success' : 'error');
  };

  const shareTradeHistory = async () => {
    if (!closedTrades.length) {
      showToast('No history to share', 'info');
      return;
    }
    const lines = closedTrades.slice(0, 50).map((t) => {
      const sign = (t.pnlAmount ?? 0) >= 0 ? '+' : '';
      return `${t.result} ${t.pair} ${t.type} ${sign}$${(t.pnlAmount ?? 0).toFixed(2)} (${t.pnlPercent}%) @ ${t.closedAt}`;
    });
    const body = [
      `Daves Trade History · ${closedTrades.length} trades`,
      `Net: ${historyStats.totalPnlAmount} · Win rate: ${historyStats.winRate}%`,
      '',
      ...lines,
    ].join('\n');
    try {
      await Share.share({ message: body, title: 'Trade History' });
    } catch (e) {
      await Clipboard.setStringAsync(body);
      showToast('History copied to clipboard', 'success');
    }
  };

  const rescanSelectedMarkets = async () => {
    showToast('Rescanning selected markets…', 'info');
    await runAutoSignalPass('boot');
  };

  const clearTradeHistory = () => {
    if (!closedTrades.length) {
      showToast('History is already empty', 'info');
      return;
    }
    Alert.alert(
      'Clear Trade History',
      `Permanently delete ${closedTrades.length} closed trade${closedTrades.length === 1 ? '' : 's'}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = await SQLite.openDatabaseAsync('daves_trade_v7.db');
              await db.runAsync('DELETE FROM closed_trades');
              setClosedTrades([]);
              showToast('Trade history cleared', 'success');
            } catch (e) {
              console.warn('Clear history error:', e);
              // Still clear UI if DB fails
              setClosedTrades([]);
              showToast('History cleared on device', 'info');
            }
          },
        },
      ]
    );
  };

  const refreshMarketQuotes = async () => {
    setMarketsRefreshing(true);
    try {
      await initDb();
      showToast('Market quotes refreshed', 'info');
    } catch {
      showToast('Refresh failed', 'error');
    } finally {
      setMarketsRefreshing(false);
    }
  };

  const activeSignalCount = useMemo(
    () => signals.filter((s) => s?.status === 'ACTIVE' || s?.status === 'PENDING').length,
    [signals]
  );

  const tickersForWatchlist = useMemo(() => {
    const fav = new Set(favorites);
    return [...tickers]
      .map((t) => ({ ...t, isFavorite: fav.has(t.symbol) }))
      .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || Number(a.isRemovable) - Number(b.isRemovable));
  }, [tickers, favorites]);

  const fxSession = useMemo(() => getFxSession(), [activeTab, lastScanAt]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <StatusBar style={activeTheme === 'dark' ? 'light' : 'dark'} backgroundColor={colors.topBarBg} />
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top Header */}
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 4),
            backgroundColor: colors.topBarBg,
          },
        ]}
      >
        <View style={styles.brandRow}>
          <View style={[styles.brandAvatar, { backgroundColor: colors.accentGreen }]}>
            <MaterialCommunityIcons name="finance" size={20} color="#FFFFFF" />
          </View>
          <View>
            <Text style={[styles.brandTitle, { color: colors.textPrimary }]}>
              Daves <Text style={{ color: colors.accentGreen }}>Trade</Text>
            </Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.livePulse,
                  { backgroundColor: isWsConnected ? colors.accentGreen : colors.accentAmber },
                ]}
              />
              <Text style={[styles.liveText, { color: isWsConnected ? colors.accentGreen : colors.accentAmber }]}>
                {isWsConnected ? 'FEED LIVE' : 'WS CONNECTING...'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.topRightActions}>
          <View style={[styles.marketsPill, { backgroundColor: colors.chipBg, borderColor: colors.chipBorder }]}>
            <Text style={[styles.marketsPillText, { color: colors.textMuted }]} numberOfLines={1}>
              {signalAssetFilter.join(' · ')}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.algoScanBtn, { backgroundColor: colors.accentGreenMuted, borderColor: colors.accentGreen }]}
            onPress={generateSignalWithAlgo}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="radar" size={16} color={colors.accentGreen} />
            <Text style={[styles.algoScanBtnText, { color: colors.accentGreen }]}>Scan</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: colors.btnBg, borderColor: colors.btnBorder }]}
            onPress={cycleTheme}
          >
            <Ionicons
              name={
                themeMode === 'auto'
                  ? 'phone-portrait-outline'
                  : themeMode === 'dark'
                  ? 'moon-outline'
                  : 'sunny-outline'
              }
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Live Market Tickers Header Bar */}
      <View style={[styles.tickersContainer, { borderColor: colors.chipBorder }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tickersScroll}>
          {tickers.map((item, idx) => (
            <View
              key={item?.symbol ?? idx}
              style={[styles.tickerChip, { backgroundColor: colors.chipBg, borderColor: colors.chipBorder }]}
            >
              <Text style={[styles.tickerPair, { color: colors.textSecondary }]}>{item.pair}</Text>
              <Text style={[styles.tickerPrice, { color: colors.textPrimary }]}>{item.price}</Text>
              <Text style={[styles.tickerChange, { color: item.up ? colors.accentGreen : colors.accentRed }]}>
                {item.change}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Main Content Area — split tabs */}
      <View style={{ flex: 1 }}>
        {activeTab === 'signals' && (
          <SignalsTab
            colors={colors}
            feedMode={feedMode}
            setFeedMode={setFeedMode}
            selectedFilter={selectedFilter}
            setSelectedFilter={setSelectedFilter}
            styleFilter={styleFilter}
            setStyleFilter={setStyleFilter}
            historyFilter={historyFilter}
            setHistoryFilter={setHistoryFilter}
            filteredSignals={filteredSignals}
            filteredClosedTrades={filteredClosedTrades}
            signalsCount={signals.filter((s) => s?.status === 'ACTIVE' || s?.status === 'PENDING').length}
            closedTradesCount={closedTrades.length}
            historyStats={historyStats}
            copiedKey={copiedKey}
            onCopyIndividual={copyIndividualValue}
            onCopyFullSignal={copyFullSignalSetup}
            isRefreshing={isRefreshing}
            onRefresh={async () => {
              setIsRefreshing(true);
              await initDb();
              setIsRefreshing(false);
            }}
            bottomPadding={insets.bottom + 85}
            onClearHistory={clearTradeHistory}
            onScanMarket={generateSignalWithAlgo}
            onCloseSignal={closeActiveSignal}
            lastScanAt={lastScanAt}
            onAddPair={() => setIsAddModalVisible(true)}
            signalMarketsLabel={signalAssetFilter.join(' + ')}
          />
        )}

        {activeTab === 'watchlist' && (
          <WatchlistTab
            colors={colors}
            bottomPadding={insets.bottom + 100}
            tickers={tickersForWatchlist}
            onAddPair={() => setIsAddModalVisible(true)}
            onRemoveSymbol={removeSymbol}
            onClearAllPairs={clearAllWatchlistPairs}
            onScanSignal={predictSignalForPair}
            onToggleFavorite={toggleFavorite}
            fxSessionLabel={fxSession.name}
            onRefresh={refreshMarketQuotes}
            isRefreshing={marketsRefreshing}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsTab
            colors={colors}
            historyStats={historyStats}
            closedTrades={closedTrades}
            bottomPadding={insets.bottom + 100}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileTab
            colors={colors}
            bottomPadding={insets.bottom + 100}
            themeMode={themeMode}
            notificationsEnabled={notificationsEnabled}
            setNotificationsEnabled={handleNotificationsToggle}
            pushTokenReady={pushTokenReady}
            autoExecute={autoExecute}
            setAutoExecute={setAutoExecute}
            positionSizeUsd={positionSizeUsd}
            setPositionSizeUsd={(v) => {
              setPositionSizeUsd(v);
              persistDeskSetting('positionSizeUsd', String(v));
              showToast(`Position size set to $${v.toLocaleString()}`, 'info');
            }}
            accountBalanceUsd={accountBalanceUsd}
            setAccountBalanceUsd={(v) => {
              setAccountBalanceUsd(v);
              persistDeskSetting('accountBalanceUsd', String(v));
              showToast(`Balance set to $${v.toLocaleString()}`, 'info');
            }}
            riskPercent={riskPercent}
            setRiskPercent={(v) => {
              setRiskPercent(v);
              persistDeskSetting('riskPercent', String(v));
              showToast(`Risk per trade ${v}%`, 'info');
            }}
            signalAssetFilter={signalAssetFilter}
            setSignalAssetFilter={(v) => {
              const next = v.length ? v : (['FOREX'] as Array<'FOREX' | 'CRYPTO' | 'COMMODITIES'>);
              setSignalAssetFilter(next);
              persistDeskSetting('signalAssetFilter', JSON.stringify(next));
              showToast(`Signals: ${next.join(' + ')}`, 'info');
              setTimeout(() => runAutoSignalPass('boot'), 400);
            }}
            onCycleTheme={cycleTheme}
            onLogout={() => router.replace('/')}
            onClearHistory={clearTradeHistory}
            onShareHistory={shareTradeHistory}
            onRescanMarkets={rescanSelectedMarkets}
            activeSignals={activeSignalCount}
            closedTrades={closedTrades.length}
            netPnl={historyStats.totalPnlAmount}
          />
        )}
      </View>

      {/* Bottom Navigation Bar */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.bottomBarBg,
            borderTopColor: colors.bottomBorder,
            paddingBottom: Math.max(insets.bottom, 8),
            height: 56 + Math.max(insets.bottom, 8),
          },
        ]}
      >
        {[
          { key: 'signals', label: 'Signals', icon: 'flash-outline', activeIcon: 'flash', badge: activeSignalCount },
          { key: 'watchlist', label: 'Markets', icon: 'trending-up-outline', activeIcon: 'trending-up', badge: tickers.length },
          { key: 'analytics', label: 'Stats', icon: 'pie-chart-outline', activeIcon: 'pie-chart', badge: 0 },
          { key: 'profile', label: 'Account', icon: 'person-outline', activeIcon: 'person', badge: 0 },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.navItem}
              onPress={() => setActiveTab(tab.key as TabSection)}
              activeOpacity={0.7}
            >
              <View>
                <Ionicons
                  name={(isActive ? tab.activeIcon : tab.icon) as any}
                  size={21}
                  color={isActive ? colors.accentGreen : colors.textMuted}
                />
                {tab.badge > 0 && (
                  <View style={[styles.navBadge, { backgroundColor: colors.accentGreen }]}>
                    <Text style={styles.navBadgeText}>{tab.badge > 99 ? '99+' : tab.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.navText, { color: isActive ? colors.accentGreen : colors.textMuted }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Add Symbol Modal */}
      <Modal
        visible={isAddModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => {
          setIsAddModalVisible(false);
          setIsAddingSymbol(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!isAddingSymbol) setIsAddModalVisible(false);
            }}
          />
          <View style={[styles.modalContent, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Add & Predict Pair</Text>
                <Text style={[styles.modalSubTitleText, { color: colors.textMuted }]}>
                  Live order book connection & algorithmic execution
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsAddModalVisible(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[
                styles.symbolInputField,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.cardBorder,
                  color: colors.textPrimary,
                },
              ]}
              placeholder="XAUUSD, EURUSD, GBPUSD, SOL…"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              value={symbolInput}
              onChangeText={setSymbolInput}
              autoCorrect={false}
            />

            {isPredicting ? (
              <View style={styles.previewLoadingBox}>
                <ActivityIndicator size="small" color={colors.accentGreen} />
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Analyzing {symbolInput.trim().toUpperCase()} order flow...
                </Text>
              </View>
            ) : typingPrediction && !typingPrediction.notFound ? (
              <View style={[styles.previewCard, { borderColor: colors.chipBorder, backgroundColor: colors.matrixBg }]}>
                <View style={styles.previewTop}>
                  <View
                    style={[
                      styles.typeBadge,
                      {
                        backgroundColor:
                          typingPrediction.type === 'LONG' ? colors.accentGreenMuted : colors.accentRedMuted,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.typeBadgeText,
                        { color: typingPrediction.type === 'LONG' ? colors.accentGreen : colors.accentRed },
                      ]}
                    >
                      {typingPrediction.type} {typingPrediction.leverage}X
                    </Text>
                  </View>
                  <Text style={[styles.previewPair, { color: colors.textPrimary }]}>{typingPrediction.pair}</Text>
                  <Text
                    style={[
                      styles.previewChange,
                      {
                        color: typingPrediction.change.startsWith('+') ? colors.accentGreen : colors.accentRed,
                      },
                    ]}
                  >
                    {typingPrediction.change}
                  </Text>
                </View>

                <Text style={[styles.previewStrategy, { color: colors.accentBlue }]}>
                  {typingPrediction.strategy} ({typingPrediction.confidence}% Confluence)
                </Text>

                <View style={styles.previewMatrix}>
                  <Text style={[styles.previewMatrixVal, { color: colors.textPrimary }]}>
                    Entry: ${formatCryptoPrice(typingPrediction.entry)}
                  </Text>
                  <Text style={[styles.previewMatrixVal, { color: colors.accentGreen }]}>
                    TP1: ${formatCryptoPrice(typingPrediction.target1)}
                  </Text>
                  <Text style={[styles.previewMatrixVal, { color: colors.accentRed }]}>
                    SL: ${formatCryptoPrice(typingPrediction.stopLoss)}
                  </Text>
                </View>
              </View>
            ) : typingPrediction?.notFound && symbolInput.trim().length >= 2 ? (
              <Text style={{ color: colors.accentRed, fontSize: 12, paddingVertical: 4 }}>
                Symbol not found on Binance. Check symbol name.
              </Text>
            ) : null}

            <Text style={[styles.suggestedLabel, { color: colors.textMuted }]}>PREDICTED PAIRS</Text>
            <View style={styles.suggestedChipsRow}>
              {predictedCoinSuggestions.map((coin) => (
                <TouchableOpacity
                  key={coin}
                  style={[styles.suggestedChip, { backgroundColor: colors.chipBg, borderColor: colors.chipBorder }]}
                  onPress={() => {
                    setSymbolInput(coin);
                    // One-tap add for convenience
                    addNewSymbol(coin);
                  }}
                  disabled={isAddingSymbol}
                >
                  <Text style={[styles.suggestedChipText, { color: colors.textPrimary }]}>{coin}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View
              style={[styles.autoPredictSwitchRow, { borderColor: colors.chipBorder, backgroundColor: colors.chipBg }]}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialCommunityIcons name="creation" size={16} color={colors.accentGreen} />
                  <Text style={[styles.autoPredictTitle, { color: colors.textPrimary }]}>Auto-Predict Signal</Text>
                </View>
                <Text style={[styles.autoPredictHelp, { color: colors.textMuted }]}>
                  Compute instant entry, stop loss & take-profit on add
                </Text>
              </View>
              <Switch
                value={autoPredictOnAdd}
                onValueChange={setAutoPredictOnAdd}
                trackColor={{ false: colors.chipBorder, true: colors.accentGreen }}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.submitSymbolBtn,
                { backgroundColor: colors.accentGreen, opacity: isAddingSymbol ? 0.7 : 1 },
              ]}
              onPress={() => addNewSymbol(symbolInput)}
              disabled={isAddingSymbol}
              activeOpacity={0.85}
            >
              {isAddingSymbol ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitSymbolBtnText}>
                  {autoPredictOnAdd ? 'Add Pair & Generate Prediction' : 'Add to Watchlist Only'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Scanner Modal */}
      <Modal visible={isScanning} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.scannerModalContent, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <View style={[styles.scannerIconWrapper, { backgroundColor: colors.accentGreenMuted }]}>
              <MaterialCommunityIcons name="radar" size={32} color={colors.accentGreen} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.textPrimary, marginTop: 12 }]}>
              Institutional Algo Engine
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>{scanStep}</Text>

            <View style={[styles.scanProgressBarTrack, { backgroundColor: colors.chipBorder }]}>
              <View
                style={[
                  styles.scanProgressBarFill,
                  { width: `${scanProgress}%`, backgroundColor: colors.accentGreen },
                ]}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: { fontSize: 16, fontWeight: '800' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  livePulse: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  topRightActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  marketsPill: {
    maxWidth: 90,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 4,
  },
  marketsPillText: { fontSize: 9, fontWeight: '800' },
  algoScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  algoScanBtnText: { fontSize: 11, fontWeight: '700' },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickersContainer: { borderBottomWidth: 1, paddingBottom: 8 },
  tickersScroll: { paddingHorizontal: 16, gap: 8 },
  tickerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  tickerPair: { fontSize: 11, fontWeight: '600' },
  tickerPrice: { fontSize: 11, fontWeight: '700' },
  tickerChange: { fontSize: 11, fontWeight: '700' },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  navItem: { alignItems: 'center', justifyContent: 'center', minWidth: 64 },
  navBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  navBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  navText: { fontSize: 10, marginTop: 3, fontWeight: '600' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: { width: '100%', padding: 20, borderRadius: 16, borderWidth: 1 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  modalSubTitleText: { fontSize: 11, marginTop: 2 },
  modalSubtitle: { fontSize: 12, textAlign: 'center', marginTop: 6, marginBottom: 16 },
  symbolInputField: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  previewLoadingBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  previewCard: { padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  previewTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewPair: { fontSize: 13, fontWeight: '800' },
  previewChange: { fontSize: 12, fontWeight: '700' },
  previewStrategy: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  previewMatrix: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  previewMatrixVal: { fontSize: 11, fontWeight: '700' },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    gap: 3,
  },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },

  suggestedLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8 },
  suggestedChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  suggestedChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  suggestedChipText: { fontSize: 11, fontWeight: '700' },

  autoPredictSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  autoPredictTitle: { fontSize: 12, fontWeight: '700' },
  autoPredictHelp: { fontSize: 10, marginTop: 2 },
  submitSymbolBtn: { height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  submitSymbolBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  scannerModalContent: {
    width: '85%',
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
  },
  scannerIconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanProgressBarTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 10,
  },
  scanProgressBarFill: { height: '100%', borderRadius: 3 },
});
