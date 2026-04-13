/**
 * HomeScreen.tsx
 * 40/60 split · fixed navy header · scrollable white ledger · filter logic
 *
 * Layout:
 *  ╔═══════════════════════════╗  NAVY  40% of screen height (fixed)
 *  ║  Header + Rings + Pill    ║
 *  ║          ╭────────────────╫─── curve overlap (CURVE px)
 *  ╔══════════╝                ║
 *  ║  WHITE  60% + scrollable  ║  ← action grid + filtered ledger
 *  ╚═══════════════════════════╝
 *  ━━━━ slim dark tab bar ━━━━
 */

import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, SafeAreaView,
  StatusBar, TouchableOpacity, Animated, useWindowDimensions,
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useFinancials } from '../hooks/useFinancials';
import { ExpenseInputSheet } from '../components/ExpenseInputSheet';
import {
  SHIELD_RED, BUILD_GREEN, VAULT_GOLD, PURPLE, NAVY,
  TEXT_PRIMARY, TEXT_MUTED,
  getTierColor, getTierLabel,
  FONT_MONO, RADIUS_LG, RADIUS_PILL,
} from '../theme/tokens';
import { fmt } from '../utils/finance';

// ─── Palette ──────────────────────────────────────────────────────────────────
const D = {
  bg:    '#0D1117',
  card:  '#161B27',
  muted: 'rgba(255,255,255,0.42)',
};
const TEAL         = '#06B6D4';
const CYBER_YELLOW = '#FFD700';

// ─── Layout constants ─────────────────────────────────────────────────────────
const HERO_S    = 168;   // -10% from 187
const HERO_STR  = 15;
const HERO_GAP  = 0;    // flush — zero gap between concentric rings
const CURVE     = 28;    // white section overlaps navy by this many px
const WHITE_PAD = 20;
const CARD_GAP  = 12;

// ─── Transaction data — three filter datasets ────────────────────────────────

interface Tx {
  id: string; emoji: string; iconBg: string;
  name: string; sub: string; amount: number; positive: boolean;
}

const DAILY_TXS: Tx[] = [
  { id: 'd1', emoji: '☕', iconBg: '#FEF3E8', name: 'Costa Coffee',    sub: '08:30 AM · Café',      amount: 320,  positive: false },
  { id: 'd2', emoji: '🍱', iconBg: '#E8F0FE', name: 'Lunch — Zomato', sub: '01:15 PM · Food',      amount: 450,  positive: false },
  { id: 'd3', emoji: '⛽', iconBg: '#F0E8FE', name: 'BPCL Fuel',      sub: '06:45 PM · Transport', amount: 1200, positive: false },
];

const WEEKLY_TXS: Tx[] = [
  { id: 'w1', emoji: '🛒', iconBg: '#FEF3E8', name: 'DMart Groceries', sub: 'Mon · Groceries',     amount: 3200, positive: false },
  { id: 'w2', emoji: '📺', iconBg: '#E8F0FE', name: 'Netflix',         sub: 'Wed · Subscription',  amount: 649,  positive: false },
  { id: 'w3', emoji: '🍽️', iconBg: '#F0E8FE', name: 'Weekend Dinner',  sub: 'Sat · Restaurant',   amount: 2100, positive: false },
];

const MONTHLY_TXS: Tx[] = [
  { id: 'm1', emoji: '💰', iconBg: '#E8F0FE', name: 'Salary Deposit',  sub: '1st · HDFC Bank',    amount: 84000, positive: true  },
  { id: 'm2', emoji: '🏠', iconBg: '#FEF3E8', name: 'Rent / EMI',      sub: '5th · Auto-debit',   amount: 22000, positive: false },
  { id: 'm3', emoji: '📈', iconBg: '#F0E8FE', name: 'SIP Investment',  sub: '10th · Groww',       amount: 10000, positive: false },
];

const TX_MAP = { Daily: DAILY_TXS, Weekly: WEEKLY_TXS, Monthly: MONTHLY_TXS };

// ─── Animated Arc ─────────────────────────────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ArcProps { cx: number; cy: number; r: number; color: string; progress: number; sw?: number; }

const Arc: React.FC<ArcProps> = ({ cx, cy, r, color, progress, sw = HERO_STR }) => {
  const circ = 2 * Math.PI * r;
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: Math.min(progress, 1), duration: 1200, useNativeDriver: false }).start();
  }, [progress]);
  const offset = anim.interpolate({ inputRange: [0, 1], outputRange: [circ, 0] });
  return (
    <G rotation="-90" origin={`${cx},${cy}`}>
      <Circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={sw} strokeOpacity={0.15} fill="none" />
      <AnimatedCircle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={sw}
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} fill="none" />
    </G>
  );
};

// ─── Hero Rings ───────────────────────────────────────────────────────────────

interface HeroRingsProps { shieldPct: number; trackPct: number; buildPct: number; score: number; }

const HeroRings: React.FC<HeroRingsProps> = ({ shieldPct, trackPct, buildPct, score }) => {
  const S = HERO_S; const cx = S / 2; const cy = S / 2;
  const rO = cx - HERO_STR / 2 - 3;
  const rM = rO - HERO_STR - HERO_GAP;
  const rI = rM - HERO_STR - HERO_GAP;
  const tierColor = getTierColor(score);
  const tierLabel = getTierLabel(score);
  const pulse = useRef(new Animated.Value(1)).current;
  const prev  = useRef(score);
  useEffect(() => {
    if (prev.current !== score) {
      prev.current = score;
      Animated.sequence([
        Animated.spring(pulse, { toValue: 1.2, useNativeDriver: true, speed: 40 }),
        Animated.spring(pulse, { toValue: 1.0, useNativeDriver: true, speed: 40 }),
      ]).start();
    }
  }, [score]);
  return (
    <View style={{ width: S, height: S }}>
      <Svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
        <Arc cx={cx} cy={cy} r={rO} color={SHIELD_RED}  progress={shieldPct / 100} />
        <Arc cx={cx} cy={cy} r={rM} color={BUILD_GREEN} progress={trackPct  / 100} />
        <Arc cx={cx} cy={cy} r={rI} color={TEAL}        progress={Math.min(buildPct, 100) / 100} />
      </Svg>
      <View style={rg.centre} pointerEvents="none">
        <Animated.Text style={[rg.score, { color: tierColor, transform: [{ scale: pulse }] }]}>{score}</Animated.Text>
        <Text style={[rg.tier, { color: tierColor }]}>{tierLabel}</Text>
      </View>
    </View>
  );
};

const rg = StyleSheet.create({
  centre: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  score:  { fontSize: 36, fontWeight: '900', letterSpacing: -1.5, fontFamily: FONT_MONO as string },
  tier:   { fontSize: 8, fontWeight: '800', letterSpacing: 2.5, marginTop: 3 },
});

// ─── Metric Badge ─────────────────────────────────────────────────────────────

const MetricBadge: React.FC<{ icon: string; label: string; value: string; color: string }> =
  ({ icon, label, value, color }) => (
    <View style={mb.row}>
      <View style={[mb.badge, { backgroundColor: color + '26' }]}>
        <Text style={mb.icon}>{icon}</Text>
      </View>
      <View>
        <Text style={mb.label}>{label}</Text>
        <Text style={[mb.value, { color }]}>{value}</Text>
      </View>
    </View>
  );

const mb = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  icon:  { fontSize: 16 },
  label: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.8, textTransform: 'uppercase' },
  value: { fontSize: 17, fontWeight: '900', letterSpacing: -0.4, fontFamily: FONT_MONO as string },
});

// ─── Budget Arc ───────────────────────────────────────────────────────────────

const BudgetArc: React.FC<{ size: number }> = ({ size }) => {
  const r = size / 2 - 7; const circ = 2 * Math.PI * r;
  const cx = size / 2; const cy = size / 2;
  const fill = circ * 0.5;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <G rotation="-90" origin={`${cx},${cy}`}>
        <Circle cx={cx} cy={cy} r={r} stroke={TEAL} strokeWidth={10} strokeOpacity={0.18} fill="none" />
        <Circle cx={cx} cy={cy} r={r} stroke={TEAL} strokeWidth={10}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={fill} fill="none" />
      </G>
    </Svg>
  );
};

// ─── Nav Item ─────────────────────────────────────────────────────────────────

const NavItem: React.FC<{ icon: string; label: string; active: boolean; onPress: () => void }> =
  ({ icon, label, active, onPress }) => (
    <TouchableOpacity style={s.navItem} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.navIcon, active && s.navIconActive]}>{icon}</Text>
      <Text style={[s.navLabel, active && s.navLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );

// ─── Types ────────────────────────────────────────────────────────────────────

type TabKey = 'Daily' | 'Weekly' | 'Monthly';
type NavKey  = 'home' | 'spend' | 'invest' | 'more';

// ─── HomeScreen ───────────────────────────────────────────────────────────────

export const HomeScreen: React.FC = () => {
  const { summary, addExpense }          = useFinancials();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [activeTab,    setActiveTab]    = useState<TabKey>('Daily');
  const [activeNav,    setActiveNav]    = useState<NavKey>('home');
  const [sheetVisible, setSheetVisible] = useState(false);

  const dailyLimit     = Math.round(summary.income > 0 ? summary.income * 0.1 / 30 : 0);
  const dailyBudgetPct = Math.max(0, Math.min(100, Math.round(100 - (summary.shieldPct ?? 0))));
  const dailySpend     = Math.round(dailyBudgetPct / 100 * dailyLimit);

  // Square card size
  const cardSize = Math.floor((screenWidth - WHITE_PAD * 2 - CARD_GAP) / 2 * 0.85);
  const arcSize  = Math.round(cardSize * 0.38);

  // 40% of screen height for navy section
  const navHeight = Math.round(screenHeight * 0.40);

  const METRICS = [
    { icon: '🛡️', label: 'Shield', value: `₹${dailyLimit.toLocaleString('en-IN')}`,           color: SHIELD_RED  },
    { icon: '🎯', label: 'Track',  value: fmt(Math.max(0, summary.income - summary.expenses)), color: BUILD_GREEN },
    { icon: '📈', label: 'Build',  value: fmt(Math.max(0, summary.savings ?? 0)),               color: '#3182CE'   },
  ];

  const transactions = TX_MAP[activeTab];

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={D.bg} />

      {/* ── NAVY HEADER — fixed 40% height ───────────────────────────────── */}
      <View style={[s.navSection, { height: navHeight }]}>

        {/* Header row */}
        <View style={s.header}>
          <View>
            <Text style={s.greeting}>Hi, Welcome Back</Text>
            <Text style={s.greetingSub}>Good Morning</Text>
          </View>
          <View style={s.bellWrap}>
            <Text style={s.bellIcon}>🔔</Text>
            <View style={s.bellDot} />
          </View>
        </View>

        {/* Rings + Metrics */}
        <View style={s.heroRow}>
          <HeroRings shieldPct={summary.shieldPct} trackPct={summary.trackPct}
            buildPct={summary.buildPct} score={summary.wealthScore} />
          <View style={s.metricStack}>
            {METRICS.map(m => (
              <MetricBadge key={m.label} icon={m.icon} label={m.label} value={m.value} color={m.color} />
            ))}
          </View>
        </View>

        {/* Insight pill — pinned to bottom of navy section */}
        <TouchableOpacity style={s.insightPill} activeOpacity={0.75}>
          <Text style={s.insightSpark}>✦</Text>
          <Text style={s.insightText} numberOfLines={1}>₹1,200 more this week for MacBook</Text>
          <Text style={s.insightArrow}>›</Text>
        </TouchableOpacity>

      </View>

      {/* ── WHITE SCROLLABLE SECTION — overlaps navy by CURVE px ─────────── */}
      <ScrollView
        style={s.whiteScroll}
        contentContainerStyle={s.whiteContent}
        showsVerticalScrollIndicator={false}
      >

        {/* Square action cards */}
        <View style={s.actionGrid}>

          {/* Daily Budget */}
          <View style={[s.budgetCard, { width: cardSize, height: cardSize }]}>
            <View style={s.budgetTop}>
              <View style={s.heartBadge}><Text style={s.heartIcon}>💗</Text></View>
              <BudgetArc size={arcSize} />
            </View>
            <View style={s.budgetBottom}>
              <Text style={s.cardLabel}>DAILY BUDGET</Text>
              <View style={s.ratioRow}>
                <Text style={s.ratioSpend}>₹{dailySpend.toLocaleString('en-IN')}</Text>
                <Text style={s.ratioLimit}> / {dailyLimit.toLocaleString('en-IN')}</Text>
              </View>
            </View>
          </View>

          {/* Vault Sweep */}
          <View style={[s.vaultCard, { width: cardSize, height: cardSize }]}>
            <View style={s.vaultTopRow}>
              <View style={s.vaultIndicator}><Text style={{ fontSize: 13 }}>💛</Text></View>
              <TouchableOpacity style={s.sweepPill} activeOpacity={0.85}>
                <Text style={s.sweepPillIcon}>◎</Text>
                <Text style={s.sweepPillTxt}>SWEEP{'\n'}TO VAULT</Text>
              </TouchableOpacity>
            </View>
            <View style={s.vaultBottom}>
              <Text style={s.vaultLabel}>VAULT SWEEP</Text>
              <Text style={s.vaultAmount}>₹300</Text>
              <Text style={s.vaultSub}>UNSPENT</Text>
            </View>
          </View>

        </View>

        {/* Recent Activity header — title + filter tabs on same row */}
        <View style={s.activityHeader}>
          <Text style={s.activityTitle}>Recent Activity</Text>
          <View style={s.tabStrip}>
            {(['Daily', 'Weekly', 'Monthly'] as TabKey[]).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[s.tab, activeTab === tab && s.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[s.tabTxt, activeTab === tab && s.tabTxtActive]}>{tab}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Filtered transaction list */}
        <View>
          {transactions.map((tx, i) => (
            <View key={tx.id} style={[s.txRow, i < transactions.length - 1 && s.txDivider]}>
              <View style={[s.txIcon, { backgroundColor: tx.iconBg }]}>
                <Text style={s.txEmoji}>{tx.emoji}</Text>
              </View>
              <View style={s.txInfo}>
                <Text style={s.txName}>{tx.name}</Text>
                <Text style={s.txSub}>{tx.sub}</Text>
              </View>
              <Text style={[s.txAmt, { color: tx.positive ? '#16A34A' : TEXT_PRIMARY }]}>
                {tx.positive ? '+' : '-'}₹{tx.amount.toLocaleString('en-IN')}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ height: 90 }} />
      </ScrollView>

      {/* ── TAB BAR ───────────────────────────────────────────────────────── */}
      <View style={s.tabBar}>
        <NavItem icon="⌂"  label="Home"   active={activeNav === 'home'}   onPress={() => setActiveNav('home')}   />
        <NavItem icon="💳" label="Spend"  active={activeNav === 'spend'}  onPress={() => setActiveNav('spend')}  />
        <View style={s.fabSlot} />
        <NavItem icon="📊" label="Invest" active={activeNav === 'invest'} onPress={() => setActiveNav('invest')} />
        <NavItem icon="⋯"  label="More"   active={activeNav === 'more'}   onPress={() => setActiveNav('more')}   />

        <View style={s.fabAbsWrap} pointerEvents="box-none">
          <TouchableOpacity style={s.fab} onPress={() => setSheetVisible(true)} activeOpacity={0.85}>
            <Text style={s.fabIcon}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ExpenseInputSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} onSubmit={addExpense} />
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({

  safe: { flex: 1, backgroundColor: '#FFFFFF' },

  // ── Navy section — fixed 40% height, content distributed vertically ──────
  navSection: {
    backgroundColor: D.bg,
    paddingTop: 16,
    paddingBottom: 0,
    justifyContent: 'space-between',
  },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20,
  },
  greeting:    { fontSize: 22, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  greetingSub: { fontSize: 12, color: D.muted, fontWeight: '500', marginTop: 2 },
  bellWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  bellIcon: { fontSize: 18 },
  bellDot: {
    position: 'absolute', top: -1, right: -1, width: 9, height: 9, borderRadius: 5,
    backgroundColor: BUILD_GREEN, borderWidth: 1.5, borderColor: D.bg,
  },

  // Rings + metrics — centred
  heroRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 46, paddingHorizontal: 16,
  },
  metricStack: { height: HERO_S, justifyContent: 'space-between' },

  // Insight pill — pinned at base of navy section
  insightPill: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    marginHorizontal: 20, marginBottom: CURVE + 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: RADIUS_PILL,
    paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  insightSpark: { fontSize: 14, color: VAULT_GOLD },
  insightText:  { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  insightArrow: { fontSize: 20, color: D.muted, fontWeight: '300' },

  // ── White scroll — overlaps navy by CURVE px ──────────────────────────────
  whiteScroll: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    marginTop: -CURVE,
  },
  whiteContent: {
    paddingTop: 20,
    paddingHorizontal: WHITE_PAD,
  },

  // ── Action grid ───────────────────────────────────────────────────────────
  actionGrid: { flexDirection: 'row', gap: CARD_GAP, marginBottom: 22, justifyContent: 'center' },

  budgetCard: {
    backgroundColor: D.card, borderRadius: RADIUS_LG,
    padding: 14, justifyContent: 'space-between', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22, shadowRadius: 8, elevation: 6,
  },
  budgetTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heartBadge:   { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  heartIcon:    { fontSize: 16 },
  budgetBottom: { gap: 2 },
  cardLabel:    { fontSize: 9, fontWeight: '800', color: D.muted, letterSpacing: 1 },
  ratioRow:     { flexDirection: 'row', alignItems: 'baseline' },
  ratioSpend:   { fontSize: 28, fontWeight: '900', color: '#FFFFFF', letterSpacing: -1, fontFamily: FONT_MONO as string },
  ratioLimit:   { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.38)', fontFamily: FONT_MONO as string },

  vaultCard: {
    backgroundColor: CYBER_YELLOW, borderRadius: RADIUS_LG,
    padding: 14, justifyContent: 'space-between',
    shadowColor: CYBER_YELLOW, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  vaultTopRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vaultIndicator: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.12)', alignItems: 'center', justifyContent: 'center' },
  sweepPill:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: CYBER_YELLOW, borderRadius: 50, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.20)', paddingHorizontal: 8, paddingVertical: 5 },
  sweepPillIcon:  { fontSize: 11, color: '#1A1005' },
  sweepPillTxt:   { fontSize: 7, fontWeight: '900', color: '#1A1005', letterSpacing: 0.4, lineHeight: 9 },
  vaultBottom:    { gap: 1 },
  vaultLabel:     { fontSize: 9, fontWeight: '800', color: 'rgba(0,0,0,0.5)', letterSpacing: 1 },
  vaultAmount:    { fontSize: 26, fontWeight: '900', color: '#1A1005', letterSpacing: -1, fontFamily: FONT_MONO as string },
  vaultSub:       { fontSize: 9, fontWeight: '700', color: 'rgba(0,0,0,0.45)', letterSpacing: 0.5 },

  // ── Recent Activity ───────────────────────────────────────────────────────
  activityHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 14,
  },
  activityTitle: { fontSize: 17, fontWeight: '800', color: TEXT_PRIMARY, letterSpacing: -0.3 },

  tabStrip: { flexDirection: 'row', backgroundColor: '#EDEDF5', borderRadius: RADIUS_PILL, padding: 2 },
  tab:          { alignItems: 'center', paddingVertical: 5, paddingHorizontal: 10, borderRadius: RADIUS_PILL },
  tabActive:    { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  tabTxt:       { fontSize: 11, fontWeight: '600', color: TEXT_MUTED },
  tabTxtActive: { color: TEXT_PRIMARY, fontWeight: '800' },

  txRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  txDivider: { borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
  txIcon:    { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  txEmoji:   { fontSize: 20 },
  txInfo:    { flex: 1, gap: 2 },
  txName:    { fontSize: 14, fontWeight: '700', color: TEXT_PRIMARY },
  txSub:     { fontSize: 11, color: TEXT_MUTED, fontWeight: '500' },
  txAmt:     { fontSize: 14, fontWeight: '800', letterSpacing: -0.3, fontFamily: FONT_MONO as string },

  // ── Tab bar ───────────────────────────────────────────────────────────────
  tabBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: NAVY,
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    paddingHorizontal: 8, paddingTop: 10, paddingBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 20,
  },
  navItem:        { flex: 1, alignItems: 'center', gap: 4, paddingBottom: 2 },
  navIcon:        { fontSize: 26, color: 'rgba(255,255,255,0.35)' },
  navIconActive:  { color: PURPLE },
  navLabel:       { fontSize: 11, color: 'rgba(255,255,255,0.40)', fontWeight: '600', letterSpacing: 0.2 },
  navLabelActive: { color: PURPLE, fontWeight: '800' },

  fabSlot: { flex: 1 },

  fabAbsWrap: {
    position: 'absolute', left: 0, right: 0, top: -32,
    alignItems: 'center',
  },
  fab: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center',
    shadowColor: PURPLE, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6, shadowRadius: 18, elevation: 16,
  },
  fabIcon: { fontSize: 34, color: '#FFFFFF', fontWeight: '300', lineHeight: 38, marginTop: -2 },

});
