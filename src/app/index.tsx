import { FontAwesome, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDemoLoading, setIsDemoLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Google Authentication handler
  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Simulated auth delay (Replace with expo-auth-session or @react-native-google-signin)
      await new Promise((resolve) => setTimeout(resolve, 1200));

      router.replace('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Unable to connect to Google. Please check your network.');
    } finally {
      setIsLoading(false);
    }
  };

  // Demo / Preview Mode Handler
  const handleDemoAccess = async () => {
    try {
      setIsDemoLoading(true);
      setError(null);
      await new Promise((resolve) => setTimeout(resolve, 600));
      router.replace('/dashboard');
    } catch {
      setError('Unable to load demo feed.');
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#07090E" />
      <Stack.Screen options={{ headerShown: false }} />

      {/* Ambient Glows */}
      <View style={styles.glowTop} pointerEvents="none" />
      <View style={styles.glowBottom} pointerEvents="none" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Brand Header */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <View style={styles.logoInner}>
              <MaterialCommunityIcons name="finance" size={26} color="#10B981" />
            </View>
          </View>
          <Text style={styles.appName}>
            Daves <Text style={styles.appNameHighlight}>Trade</Text>
          </Text>
          <View style={styles.networkTag}>
            <View style={styles.livePulse} />
            <Text style={styles.networkTagText}>SYSTEM ONLINE • 99.98% UPTIME</Text>
          </View>
        </View>

        {/* Main Content Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Institutional Trade Alerts</Text>
            <Text style={styles.cardSubtitle}>
              Direct algorithmic signals with strict risk-to-reward ratios and instant execution.
            </Text>
          </View>

          {/* Live High-Conviction Signal Card */}
          <View style={styles.tradeCard}>
            <View style={styles.tradeCardHeader}>
              <View style={styles.assetPill}>
                <Text style={styles.assetName}>BTC / USDT</Text>
                <View style={styles.leverageBadge}>
                  <Text style={styles.leverageText}>LONG 10x</Text>
                </View>
              </View>
              <View style={styles.activeSignalTag}>
                <View style={styles.greenDot} />
                <Text style={styles.activeSignalText}>LIVE SIGNAL</Text>
              </View>
            </View>

            <View style={styles.tradeDetailsRow}>
              <View>
                <Text style={styles.tradeLabel}>ENTRY ZONE</Text>
                <Text style={styles.tradeValue}>$89,240</Text>
              </View>
              <View style={styles.dividerVertical} />
              <View>
                <Text style={styles.tradeLabel}>TARGET 1</Text>
                <Text style={[styles.tradeValue, styles.textGreen]}>$94,800</Text>
              </View>
              <View style={styles.dividerVertical} />
              <View>
                <Text style={styles.tradeLabel}>EST. RETURN</Text>
                <Text style={[styles.tradeValue, styles.textGreen]}>+24.8%</Text>
              </View>
            </View>

            <View style={styles.tradeCardFooter}>
              <Ionicons name="time-outline" size={13} color="#64748B" />
              <Text style={styles.tradeTimeText}>Dispatched 3m ago • AI Confidence 94%</Text>
            </View>
          </View>

          {/* Error Banner */}
          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={16} color="#F87171" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            {/* Google Sign-In */}
            <TouchableOpacity
              style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
              onPress={handleGoogleSignIn}
              disabled={isLoading || isDemoLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color="#07090E" size="small" />
              ) : (
                <View style={styles.buttonContent}>
                  <FontAwesome name="google" size={18} color="#07090E" />
                  <Text style={styles.primaryButtonText}>Continue with Google</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Guest / Demo Mode Button */}
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleDemoAccess}
              disabled={isLoading || isDemoLoading}
              activeOpacity={0.7}
            >
              {isDemoLoading ? (
                <ActivityIndicator color="#94A3B8" size="small" />
              ) : (
                <View style={styles.buttonContent}>
                  <Ionicons name="eye-outline" size={17} color="#94A3B8" />
                  <Text style={styles.secondaryButtonText}>Explore Signals (Guest Mode)</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Stats Bar */}
          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>84.6%</Text>
              <Text style={styles.statLabel}>WIN RATE</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>3.4x</Text>
              <Text style={styles.statLabel}>AVG PROFIT</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>14.2K</Text>
              <Text style={styles.statLabel}>TRADERS</Text>
            </View>
          </View>

          {/* Disclaimer */}
          <Text style={styles.legalNotice}>
            Secured via 256-bit institutional encryption.{'\n'}
            Trading financial instruments involves significant risk.
          </Text>
        </View>

        {/* Footer */}
        <Text style={styles.footerText}>
          © {new Date().getFullYear()} Daves Trade Inc. All rights reserved.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090E',
  },
  glowTop: {
    position: 'absolute',
    top: -60,
    alignSelf: 'center',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    filter: Platform.OS === 'web' ? 'blur(80px)' : undefined,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -80,
    alignSelf: 'center',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
    filter: Platform.OS === 'web' ? 'blur(100px)' : undefined,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoBadge: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoInner: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#0D141F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.6,
  },
  appNameHighlight: {
    color: '#10B981',
  },
  networkTag: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  livePulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  networkTagText: {
    fontSize: 10,
    color: '#10B981',
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0E131E',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1A2333',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.45,
        shadowRadius: 20,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  cardHeader: {
    alignItems: 'center',
    marginBottom: 18,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F1F5F9',
    textAlign: 'center',
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#8A99AD',
    textAlign: 'center',
    lineHeight: 19,
  },
  tradeCard: {
    backgroundColor: '#090D15',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1D273A',
    padding: 14,
    marginBottom: 20,
  },
  tradeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  assetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  assetName: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  leverageBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  leverageText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '800',
  },
  activeSignalTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  activeSignalText: {
    fontSize: 10,
    color: '#10B981',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tradeDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#151C2A',
  },
  dividerVertical: {
    width: 1,
    height: 24,
    backgroundColor: '#151C2A',
  },
  tradeLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 2,
  },
  tradeValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  textGreen: {
    color: '#10B981',
  },
  tradeCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  tradeTimeText: {
    fontSize: 11,
    color: '#64748B',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: '#F87171',
    fontSize: 12,
    flex: 1,
  },
  actionsContainer: {
    gap: 10,
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: '#10B981',
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#07090E',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#131A26',
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#202A3C',
  },
  secondaryButtonText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#090D15',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#172030',
    marginBottom: 18,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F1F5F9',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#1A2333',
  },
  legalNotice: {
    fontSize: 10,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 15,
  },
  footerText: {
    marginTop: 20,
    fontSize: 11,
    color: '#475569',
    textAlign: 'center',
  },
});