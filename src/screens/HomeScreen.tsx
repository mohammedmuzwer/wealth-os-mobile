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
  const scrollY = useRef(new Animated.Value(0)).current;

  const [activeTab,    setActiveTab]    = useState<TabKey>('Daily');
  const [activeNav,    setActiveNav]    = useState<NavKey>('home');
  const [sheetVisible, setSheetVisible] = useState(false);

  const dailyLimit     = Math.round(summary.income > 0 ? summary.income * 0.1 / 30 : 0);
  const dailyBudgetPct = Math.max(0, Math.min(100, Math.round(100 - (summary.shieldPct ?? 0))));
  const dailySpend     = Math.round(dailyBudgetPct / 100 * dailyLimit);

  const squareOpacity = scrollY.interpolate({
    inputRange: [0, 70, 120],
    outputRange: [1, 0.45, 0],
    extrapolate: 'clamp',
  });
  const squareTranslateY = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [0, -10],
    extrapolate: 'clamp',
  });
  const expandedOpacity = scrollY.interpolate({
    inputRange: [25, 80, 120],
    outputRange: [0, 0.9, 1],
    extrapolate: 'clamp',
  });
  const expandedTranslateY = scrollY.interpolate({
    inputRange: [25, 120],
    outputRange: [14, 0],
    extrapolate: 'clamp',
  });
  const activityHeaderOpacity = scrollY.interpolate({
    inputRange: [0, 70, 120],
    outputRange: [1, 0.45, 0],
    extrapolate: 'clamp',
  });
  const footerTranslateY = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, 150],
    extrapolate: 'clamp',
  });
  const txLift = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [0, -96],
    extrapolate: 'clamp',
  });

  // 40% of screen height for navy section
  const navHeight = Math.round(screenHeight * 0.40);
  const cardSize = Math.floor((screenWidth - WHITE_PAD * 2 - CARD_GAP) / 2 * 0.85);
  const arcSize  = Math.round(cardSize * 0.38);
  const whiteSheetMinHeight = screenHeight;

  const METRICS = [
    { icon: '🛡️', label: 'Shield', value: `₹${dailyLimit.toLocaleString('en-IN')}`,           color: SHIELD_RED  },
    { icon: '🎯', label: 'Track',  value: fmt(Math.max(0, summary.income - summary.expenses)), color: BUILD_GREEN },
    { icon: '📈', label: 'Build',  value: fmt(Math.max(0, summary.savings ?? 0)),               color: '#3182CE'   },
  ];

  const transactions = TX_MAP[activeTab];

  return (
    <SafeAreaView style={s.mainContainer}>
      <StatusBar barStyle="light-content" backgroundColor={D.bg} />

      {/* ── NAVY HEADER — fixed 40% height ───────────────────────────────── */}
      <View style={[s.navyHeaderFixed, { height: navHeight }]}>
        <Animated.View pointerEvents="none" style={[s.navyBlurOverlay, { opacity: scrollY.interpolate({ inputRange: [0, 200], outputRange: [0, 1], extrapolate: 'clamp' }) }]} />

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

      <Animated.ScrollView
        style={s.whiteCardScrollLayer}
        contentContainerStyle={{ paddingTop: navHeight - CURVE, paddingBottom: 220, flexGrow: 1 }}
        stickyHeaderIndices={[0]}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        showsVerticalScrollIndicator={false}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
      >
        <View style={s.stickySheetHeader}>
            <View style={s.sheetHandle} />

            <Animated.View style={[s.actionGrid, { marginTop: 20, opacity: squareOpacity, transform: [{ translateY: squareTranslateY }] }]}>
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
            </Animated.View>

            <Animated.View pointerEvents="none" style={[s.expandedPillStrip, { marginTop: 20, opacity: expandedOpacity, transform: [{ translateY: expandedTranslateY }] }]}>
              <View style={[s.expandedPillCard, s.expandedPillCardDark]}>
                <View style={s.expandedPillIconWrap}><Text style={s.expandedPillIcon}>💗</Text></View>
                <View style={s.expandedPillCopy}>
                  <Text style={s.expandedPillLabel}>DAILY BUDGET</Text>
                  <Text style={s.expandedPillAmount}>
                    <Text style={s.expandedPillAmountStrong}>220</Text>
                    <Text style={s.expandedPillAmountSoft}>/500</Text>
                  </Text>
                </View>
              </View>

              <View style={[s.expandedPillCard, s.expandedPillCardDark]}>
                <View style={s.expandedPillIconWrapYellow}><Text style={s.expandedPillIconDark}>💛</Text></View>
                <View style={s.expandedPillCopy}>
                  <Text style={s.expandedPillLabel}>VAULT SWEEP</Text>
                  <Text style={s.expandedPillAmount}>
                    <Text style={s.expandedPillAmountStrong}>₹300</Text>
                  </Text>
                </View>
              </View>
            </Animated.View>

            <Animated.View pointerEvents="none" style={[s.expandedActivityOverlay, { opacity: expandedOpacity }]}>
              <Text style={s.expandedActivityTitle}>Recent Activity</Text>
              <View style={s.expandedTabStrip}>
                {(['Daily', 'Weekly', 'Monthly'] as TabKey[]).map(tab => (
                  <View key={tab} style={[s.expandedTab, activeTab === tab && s.expandedTabActive]}>
                    <Text style={[s.expandedTabTxt, activeTab === tab && s.expandedTabTxtActive]}>{tab}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>

            <Animated.View style={{ opacity: activityHeaderOpacity }}>
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
            </Animated.View>
        </View>

        <Animated.View style={[s.txList, { minHeight: whiteSheetMinHeight, transform: [{ translateY: txLift }] }]}>
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

          <View style={{ height: 90 }} />
        </Animated.View>
      </Animated.ScrollView>

      {/* ── TAB BAR ───────────────────────────────────────────────────────── */}
      <Animated.View style={[s.floatingFooter, { transform: [{ translateY: footerTranslateY }] }]} pointerEvents="box-none">
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
      </Animated.View>

      <ExpenseInputSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} onSubmit={addExpense} />
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: D.bg },
  safe: { flex: 1, backgroundColor: '#FFFFFF' },

  // ── Navy section — fixed 40% height, content distributed vertically ──────
  navyHeaderFixed: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: -1,
    elevation: 0,
    backgroundColor: D.bg,
    paddingTop: 50,
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
  whiteCardScrollLayer: {
    flex: 1,
    backgroundColor: 'transparent',
    zIndex: 10,
    elevation: 10,
  },
  stickySheetHeader: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: WHITE_PAD,
    paddingTop: 20,
    paddingBottom: 0,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    overflow: 'hidden',
  },
  whiteCardContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    overflow: 'hidden',
    paddingHorizontal: WHITE_PAD,
    paddingTop: 20,
    paddingBottom: 220,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 34,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D9DAE7',
    marginBottom: 12,
  },

  // ── Action pills ──────────────────────────────────────────────────────────
  actionGrid: { flexDirection: 'row', gap: CARD_GAP, marginBottom: 20, justifyContent: 'center' },
  budgetCard: {
    backgroundColor: D.card,
    borderRadius: RADIUS_LG,
    padding: 14,
    justifyContent: 'space-between',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  budgetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heartBadge: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  heartIcon: { fontSize: 16 },
  budgetBottom: { gap: 2 },
  cardLabel: { fontSize: 9, fontWeight: '800', color: D.muted, letterSpacing: 1 },
  ratioRow: { flexDirection: 'row', alignItems: 'baseline' },
  ratioSpend: { fontSize: 28, fontWeight: '900', color: '#FFFFFF', letterSpacing: -1, fontFamily: FONT_MONO as string },
  ratioLimit: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.38)', fontFamily: FONT_MONO as string },

  vaultCard: {
    backgroundColor: CYBER_YELLOW,
    borderRadius: RADIUS_LG,
    padding: 14,
    justifyContent: 'space-between',
    shadowColor: CYBER_YELLOW,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  vaultTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vaultIndicator: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.12)', alignItems: 'center', justifyContent: 'center' },
  sweepPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: CYBER_YELLOW, borderRadius: 50, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.20)', paddingHorizontal: 8, paddingVertical: 5 },
  sweepPillIcon: { fontSize: 11, color: '#1A1005' },
  sweepPillTxt: { fontSize: 7, fontWeight: '900', color: '#1A1005', letterSpacing: 0.4, lineHeight: 9 },
  vaultBottom: { gap: 1 },
  vaultLabel: { fontSize: 9, fontWeight: '800', color: 'rgba(0,0,0,0.5)', letterSpacing: 1 },
  vaultAmount: { fontSize: 26, fontWeight: '900', color: '#1A1005', letterSpacing: -1, fontFamily: FONT_MONO as string },
  vaultSub: { fontSize: 9, fontWeight: '700', color: 'rgba(0,0,0,0.45)', letterSpacing: 0.5 },

  budgetPill: {
    flex: 1,
    minHeight: 92,
    backgroundColor: D.card,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'space-between',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  vaultPill: {
    flex: 1,
    minHeight: 92,
    backgroundColor: CYBER_YELLOW,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'space-between',
    overflow: 'hidden',
    shadowColor: CYBER_YELLOW,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  pillTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  pillBottomLine: { gap: 2 },
  pillIconBadge: { width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  pillIconBadgeYellow: { width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.14)', alignItems: 'center', justifyContent: 'center' },
  pillIcon: { fontSize: 15 },
  pillIconDark: { fontSize: 15 },
  pillLabel: { fontSize: 9, fontWeight: '800', color: D.muted, letterSpacing: 1 },
  pillValue: { flexDirection: 'row', alignItems: 'baseline' },
  pillValueStrong: { fontSize: 27, fontWeight: '900', color: '#FFFFFF', letterSpacing: -1, fontFamily: FONT_MONO as string },
  pillValueMuted: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.38)', fontFamily: FONT_MONO as string },
  sweepChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CYBER_YELLOW,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  sweepChipIcon: { fontSize: 11, color: '#1A1005' },
  sweepChipText: { fontSize: 7, fontWeight: '900', color: '#1A1005', letterSpacing: 0.4, lineHeight: 9 },
  vaultPillLabel: { fontSize: 9, fontWeight: '800', color: 'rgba(0,0,0,0.55)', letterSpacing: 1 },
  vaultPillAmount: { fontSize: 26, fontWeight: '900', color: '#1A1005', letterSpacing: -1, fontFamily: FONT_MONO as string },
  vaultPillSub: { fontSize: 9, fontWeight: '700', color: 'rgba(0,0,0,0.45)', letterSpacing: 0.5 },
  expandedPillStrip: {
    position: 'absolute',
    top: 18,
    left: WHITE_PAD,
    right: WHITE_PAD,
    flexDirection: 'row',
    gap: CARD_GAP,
    zIndex: 20,
    elevation: 20,
  },
  expandedPillCard: {
    flex: 1,
    minHeight: 58,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  expandedPillCardDark: {
    backgroundColor: '#1A1A2E',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 7,
    elevation: 4,
  },
  expandedPillIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(6,182,212,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedPillIconWrapYellow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,215,0,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedPillIcon: { fontSize: 12 },
  expandedPillIconDark: { fontSize: 12 },
  expandedPillCopy: { flex: 1, gap: 2 },
  expandedPillLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1,
  },
  expandedPillAmount: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  expandedPillAmountStrong: {
    fontSize: 19,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    fontFamily: FONT_MONO as string,
  },
  expandedPillAmountSoft: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    marginLeft: 2,
    fontFamily: FONT_MONO as string,
  },
  expandedActivityOverlay: {
    position: 'absolute',
    top: 110,
    left: WHITE_PAD,
    right: WHITE_PAD,
    alignItems: 'center',
    zIndex: 18,
    elevation: 18,
  },
  expandedActivityTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 16,
  },
  expandedTabStrip: {
    flexDirection: 'row',
    backgroundColor: '#EDEDF5',
    borderRadius: RADIUS_PILL,
    padding: 4,
    justifyContent: 'center',
    alignSelf: 'center',
  },
  expandedTab: {
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 15,
    borderRadius: RADIUS_PILL,
  },
  expandedTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  expandedTabTxt: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
  expandedTabTxtActive: { color: TEXT_PRIMARY, fontWeight: '800' },

  // ── Recent Activity ───────────────────────────────────────────────────────
  activityHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 4,
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
  txList: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: WHITE_PAD,
    paddingTop: 0,
  },

  // ── Tab bar ───────────────────────────────────────────────────────────────
  floatingFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    zIndex: 999,
    elevation: 50,
  },
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

  navyBlurOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 20, 35, 0.75)',
  },

  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    elevation: 30,
    backgroundColor: '#FFFFFF',
    paddingTop: 50,
    paddingHorizontal: WHITE_PAD,
    paddingBottom: 10,
  },
  stickyInner: {
    alignItems: 'center',
  },
  stickyChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#EAEAF2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  stickyChipText: {
    fontSize: 14,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    letterSpacing: -0.2,
    fontFamily: FONT_MONO as string,
  },

});
