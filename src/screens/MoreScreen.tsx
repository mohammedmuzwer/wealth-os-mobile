import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G } from 'react-native-svg';
import { useFinancials } from '../hooks/useFinancials';
import { useWealth } from '../context/WealthContext';
import { FONT_MONO, FONT_UI } from '../theme/tokens';

type GridItemProps = {
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  onPress: () => void;
};

const GridItem: React.FC<GridItemProps> = ({ icon, title, subtitle, color, onPress }) => (
  <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.gridCard}>
    <View style={[styles.menuIconWrap, { backgroundColor: color }]}>
      <Text style={styles.menuIcon}>{icon}</Text>
    </View>
    <View style={styles.menuTextCol}>
      <Text style={styles.menuTitle}>{title}</Text>
      <Text style={styles.menuSubtitle}>{subtitle}</Text>
    </View>
  </TouchableOpacity>
);

type MiniRingsProps = {
  shieldPct: number;
  trackPct: number;
  buildPct: number;
};

const MiniRings: React.FC<MiniRingsProps> = ({ shieldPct, trackPct, buildPct }) => {
  const S = 38;
  const cx = S / 2;
  const cy = S / 2;
  const sw = 4;
  const rO = 16;
  const rM = 12;
  const rI = 8;

  const renderArc = (r: number, color: string, progress: number) => {
    const circ = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(progress, 1));
    const offset = circ * (1 - p);
    return (
      <G rotation="-90" origin={`${cx},${cy}`}>
        <Circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={sw} strokeOpacity={0.18} fill="none" />
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          fill="none"
        />
      </G>
    );
  };

  return (
    <View style={styles.miniRingsWrap}>
      <Svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
        {renderArc(rO, '#FF3B30', shieldPct / 100)}
        {renderArc(rM, '#34C759', trackPct / 100)}
        {renderArc(rI, '#32ADE6', Math.min(buildPct, 100) / 100)}
      </Svg>
    </View>
  );
};

type MoreScreenProps = {
  onIncomeEnginePress?: () => void;
  onLoanPress?: () => void;
  onBack?: () => void;
};

export const MoreScreen: React.FC<MoreScreenProps> = ({ onIncomeEnginePress, onLoanPress, onBack }) => {
  const insets = useSafeAreaInsets();
  const { summary } = useFinancials();
  const { shieldPercentage, ovsScore } = useWealth();

  return (
    <View style={styles.container}>
      <View style={[styles.topSectionWhite, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topSectionInner}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backCircleBtn} activeOpacity={0.85} onPress={onBack}>
              <Text style={styles.backCircleArrow}>‹</Text>
            </TouchableOpacity>
            <View style={styles.headerIconsRow}>
              <View style={styles.osPill}>
                <Text style={styles.osPillText}>OVS</Text>
                <Text style={styles.osPillScore}>{ovsScore}</Text>
              </View>
              <MiniRings
                shieldPct={shieldPercentage}
                trackPct={summary.trackPct}
                buildPct={summary.buildPct}
              />
              <View style={styles.bellWrap}>
                <Text style={styles.bellIcon}>🔔</Text>
                <View style={styles.bellDot} />
              </View>
            </View>
          </View>

          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>More</Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.gridWrap}>
            <GridItem
              icon="💳"
              title="My Accounts"
              subtitle="Banks and wallets"
              color="#32ADE6"
              onPress={() => {}}
            />
            <GridItem
              icon="🏛️"
              title="Tax Vault"
              subtitle="Plan and track tax"
              color="#FF3B30"
              onPress={() => {}}
            />
            <GridItem
              icon="💸"
              title="Loan"
              subtitle="Borrow and repay"
              color="#F59E0B"
              onPress={() => {
                if (onLoanPress) onLoanPress();
              }}
            />
            <GridItem
              icon="🔒"
              title="Settings"
              subtitle="Security and privacy"
              color="#8E8E93"
              onPress={() => {}}
            />
            <GridItem
              icon="⚙️"
              title="Income Engine"
              subtitle="Configure monthly flow"
              color="#7C3AED"
              onPress={() => {
                if (onIncomeEnginePress) onIncomeEnginePress();
              }}
            />
          </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topSectionWhite: {
    backgroundColor: '#FFFFFF',
  },
  topSectionInner: {
    paddingHorizontal: 24,
    paddingBottom: 14,
  },
  scrollContent: {
    backgroundColor: '#FFFFFF',
    paddingTop: 6,
    paddingBottom: 120,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backCircleArrow: {
    color: '#111827',
    fontSize: 18,
    lineHeight: 18,
    textAlign: 'center',
    includeFontPadding: false,
  },
  headerIconsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  osPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E9ECEF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  osPillText: { color: '#334155', fontSize: 10, fontWeight: '700', letterSpacing: 0.8, fontFamily: FONT_UI as string },
  osPillScore: { color: '#0F172A', fontSize: 17, fontWeight: '800', letterSpacing: -0.4, fontFamily: FONT_MONO as string },
  miniRingsWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  bellWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellIcon: { fontSize: 18 },
  bellDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#34C759',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  headerTitleRow: { marginTop: 24, alignItems: 'flex-start' },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.3,
  },
  gridWrap: {
    marginHorizontal: 20,
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  gridCard: {
    width: '48%',
    minHeight: 112,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'space-between',
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIcon: {
    fontSize: 17,
  },
  menuTextCol: {
    marginTop: 12,
  },
  menuTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  menuSubtitle: {
    marginTop: 4,
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '500',
  },
});

