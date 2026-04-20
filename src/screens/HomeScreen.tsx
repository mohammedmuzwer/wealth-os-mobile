/**
 * HomeScreen.tsx
 * Navy top section (~34% screen height) with header, rings, and labels; white card below
 * with scrollable insight, budget / pocket strips, recent activity, and floating tab bar.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet,
  StatusBar, TouchableOpacity, Animated, Easing, useWindowDimensions, Dimensions,
  Modal, Pressable, TextInput, Switch, Platform, PanResponder, RefreshControl,
  ActivityIndicator,
  AppState, type AppStateStatus,
  type ViewStyle,
} from 'react-native';
import Slider from '@react-native-community/slider';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withSpring,
  withTiming,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
  runOnJS,
  Easing as ReanimatedEasing,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { useFinancials } from '../hooks/useFinancials';
import { useWealth } from '../context/WealthContext';
import { IncomeEngineScreen } from './IncomeEngineScreen';
import { WealthScreen } from './WealthScreen';
import { WealthInsuranceScreen, WealthLoansScreen } from './WealthSubScreens';
import { MoreScreen } from './MoreScreen';
import { SpendingScreen } from './SpendingScreen';
import { updateUserSettingsFirestoreRecord } from '../services/incomeHistorySync';
import { useSpendingFirestoreData } from '../hooks/useSpendingFirestoreData';
import { expenseEvents } from '../events/expenseEvents';
import { saveExpense, getIncome, getSettings } from '../utils/localStorage';
import {
  SHIELD_RED, BUILD_GREEN, VAULT_GOLD, PURPLE, NAVY,
  TEXT_PRIMARY, TEXT_MUTED,
  FONT_MONO, FONT_UI, RADIUS_LG, RADIUS_PILL,
} from '../theme/tokens';
import { fmt, type Expense, type ExpenseCategory } from '../utils/finance';

/** Log modal — light theme tokens. */
const EXP_MODAL_VIOLET   = '#7C3AED';
const EXP_MODAL_NAVY     = '#1A1A2E';
const EXP_MODAL_GRAY_BG  = '#F3F4F6';
const EXP_MODAL_KEYPAD   = '#F9FAFB';
const EXP_MODAL_BORDER   = '#E5E7EB';
const EXP_MODAL_ACTIVE_BG = '#EDE9FE';
const EXP_MODAL_PLACEHOLDER = '#9CA3AF';

const EXPENSE_MODAL_CATEGORIES: { id: string; icon: string; label: string }[] = [
  { id: 'food', icon: '🍔', label: 'Food' },
  { id: 'coffee', icon: '☕', label: 'Coffee' },
  { id: 'auto', icon: '🚗', label: 'Auto' },
  { id: 'netflix', icon: '🍿', label: 'Netflix' },
  { id: 'tech', icon: '💻', label: 'Tech' },
  { id: 'internet', icon: '🌐', label: 'Internet' },
  { id: 'more', icon: '➕', label: 'More' },
];

/** Map UI tags → persisted ExpenseCategory. */
const MODAL_TAG_TO_EXPENSE: Record<string, ExpenseCategory> = {
  food: 'food',
  coffee: 'food',
  auto: 'petrol',
  netflix: 'other',
  tech: 'shopping',
  internet: 'other',
};

const KEYPAD_ROWS: string[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '<'],
];

// ─── Palette ──────────────────────────────────────────────────────────────────
const D = {
  bg:    '#0D1117',
  card:  '#161B27',
  muted: 'rgba(255,255,255,0.42)',
};
// ─── Layout constants ─────────────────────────────────────────────────────────
const CURVE     = 28;    // white section overlaps navy by this many px
const WHITE_PAD = 20;
const CARD_GAP  = 12;

/** Scroll distance (px) for expand/collapse animations ≈ 20% of screen height */
const scrollAnimSpanPx = (screenH: number) =>
  Math.max(96, Math.round(screenH * 0.2));

/** Uniform vertical rhythm: handle ↔ grid ↔ section titles (px) */
const SHEET_SECTION_GAP = 14;
const SHEET_HANDLE_H = 4;
const EXPANDED_PILL_ROW_MIN = 58;
/** Absolute overlay Y positions inside sticky sheet (content coordinates) */
const EXPANDED_PILLS_TOP = SHEET_HANDLE_H + SHEET_SECTION_GAP;
const EXPANDED_ACTIVITY_TOP = EXPANDED_PILLS_TOP + EXPANDED_PILL_ROW_MIN + SHEET_SECTION_GAP;

// ─── Ledger item type ────────────────────────────────────────────────────────

interface Tx {
  id: string; emoji: string; iconBg: string;
  name: string; sub: string; amount: number; positive: boolean; ts: number;
}

// ─── Animated ring segments ───────────────────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Hero Rings ───────────────────────────────────────────────────────────────

interface HeroRingsProps {
  score: number;
  shieldCircumference: number;
  shieldOffset: number;
  shieldColor: string;
  trackCircumference: number;
  trackOffset: number;
  trackColor: string;
  pocketCircumference: number;
  pocketOffset: number;
  pocketColor: string;
  isLocked: boolean;
}

const RING_SVG = 180;
const RING_C = 90;
const R_SHIELD = 78;
const R_TRACK = 59;
const R_POCKET = 40;
const RING_STROKE = 15;

const HeroRings: React.FC<HeroRingsProps> = React.memo(({
  score,
  shieldCircumference,
  shieldOffset,
  shieldColor,
  trackCircumference,
  trackOffset,
  trackColor,
  pocketCircumference,
  pocketOffset,
  pocketColor,
  isLocked,
}) => {
  const tier = useMemo(() => {
    if (score <= 59) return { color: '#FF3B5C', label: 'AT RISK' };
    if (score <= 74) return { color: '#8888AA', label: 'STABLE' };
    if (score <= 84) return { color: '#00B4FF', label: 'GROWING' };
    if (score <= 94) return { color: '#38A169', label: 'STRONG' };
    return { color: '#FFAA00', label: 'ELITE' };
  }, [score]);
  const pulse = useRef(new Animated.Value(1)).current;
  const animatedShieldOffset = useRef(new Animated.Value(shieldOffset)).current;
  const animatedTrackOffset = useRef(new Animated.Value(trackOffset)).current;
  const animatedPocketOffset = useRef(new Animated.Value(pocketOffset)).current;
  const prevShieldOffset = useRef(shieldOffset);
  const prevTrackOffset = useRef(trackOffset);
  const prevPocketOffset = useRef(pocketOffset);
  const prevScoreRef = useRef(score);

  useEffect(() => {
    const isDrain = shieldOffset <= prevShieldOffset.current;
    Animated.timing(animatedShieldOffset, {
      toValue: shieldOffset,
      duration: isDrain ? 150 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    prevShieldOffset.current = shieldOffset;
  }, [animatedShieldOffset, shieldOffset]);

  useEffect(() => {
    const isDrain = trackOffset <= prevTrackOffset.current;
    Animated.timing(animatedTrackOffset, {
      toValue: trackOffset,
      duration: isDrain ? 150 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    prevTrackOffset.current = trackOffset;
  }, [animatedTrackOffset, trackOffset]);

  useEffect(() => {
    const isDrain = pocketOffset <= prevPocketOffset.current;
    Animated.timing(animatedPocketOffset, {
      toValue: pocketOffset,
      duration: isDrain ? 150 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    prevPocketOffset.current = pocketOffset;
  }, [animatedPocketOffset, pocketOffset]);

  useEffect(() => {
    if (prevScoreRef.current !== score) {
      prevScoreRef.current = score;
      Animated.sequence([
        Animated.spring(pulse, { toValue: 1.2, useNativeDriver: true, speed: 40 }),
        Animated.spring(pulse, { toValue: 1.0, useNativeDriver: true, speed: 40 }),
      ]).start();
    }
  }, [score]);

  const dash = (c: number) => String(c);

  return (
    <View style={{ width: RING_SVG, height: RING_SVG }}>
      <Svg width={RING_SVG} height={RING_SVG} viewBox={`0 0 ${RING_SVG} ${RING_SVG}`}>
        <Circle
          cx={RING_C}
          cy={RING_C}
          r={R_SHIELD}
          stroke="#FF3B5C"
          strokeOpacity={0.15}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <Circle
          cx={RING_C}
          cy={RING_C}
          r={R_TRACK}
          stroke="#00B4FF"
          strokeOpacity={0.15}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <Circle
          cx={RING_C}
          cy={RING_C}
          r={R_POCKET}
          stroke="#FFAA00"
          strokeOpacity={0.15}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={RING_C}
          cy={RING_C}
          r={R_SHIELD}
          stroke={shieldColor}
          strokeOpacity={0.3}
          strokeWidth={22}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={dash(shieldCircumference)}
          strokeDashoffset={animatedShieldOffset}
          rotation="-90"
          originX={RING_C}
          originY={RING_C}
        />
        <AnimatedCircle
          cx={RING_C}
          cy={RING_C}
          r={R_SHIELD}
          stroke={shieldColor}
          strokeOpacity={1}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={dash(shieldCircumference)}
          strokeDashoffset={animatedShieldOffset}
          rotation="-90"
          originX={RING_C}
          originY={RING_C}
        />
        <AnimatedCircle
          cx={RING_C}
          cy={RING_C}
          r={R_TRACK}
          stroke={trackColor}
          strokeOpacity={0.3}
          strokeWidth={22}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={dash(trackCircumference)}
          strokeDashoffset={isNaN(trackOffset) ? trackCircumference : animatedTrackOffset}
          rotation="-90"
          originX={RING_C}
          originY={RING_C}
        />
        <AnimatedCircle
          cx={RING_C}
          cy={RING_C}
          r={R_TRACK}
          stroke={trackColor}
          strokeOpacity={1}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={dash(trackCircumference)}
          strokeDashoffset={isNaN(trackOffset) ? trackCircumference : animatedTrackOffset}
          rotation="-90"
          originX={RING_C}
          originY={RING_C}
        />
        <AnimatedCircle
          cx={RING_C}
          cy={RING_C}
          r={R_POCKET}
          stroke={pocketColor}
          strokeOpacity={0.3}
          strokeWidth={22}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={dash(pocketCircumference)}
          strokeDashoffset={animatedPocketOffset}
          rotation="-90"
          originX={RING_C}
          originY={RING_C}
        />
        <AnimatedCircle
          cx={RING_C}
          cy={RING_C}
          r={R_POCKET}
          stroke={pocketColor}
          strokeOpacity={1}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={dash(pocketCircumference)}
          strokeDashoffset={animatedPocketOffset}
          rotation="-90"
          originX={RING_C}
          originY={RING_C}
        />
      </Svg>
      <View style={rg.centre}>
        {isLocked ? (
          <Text style={rg.lockIcon}>🔒</Text>
        ) : (
          <>
            <Animated.Text style={[rg.score, { transform: [{ scale: pulse }] }]}>{score}</Animated.Text>
            <Text style={[rg.tier, { color: tier.color }]}>{tier.label}</Text>
          </>
        )}
      </View>
    </View>
  );
});

const rg = StyleSheet.create({
  centre: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  score: {
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
    fontFamily: FONT_MONO as string,
    color: '#FFFFFF',
    includeFontPadding: false,
  },
  tier: { fontSize: 8, lineHeight: 10, fontWeight: '800', letterSpacing: 1.2, marginTop: 2, textTransform: 'uppercase', includeFontPadding: false },
  lockIcon: { fontSize: 24, lineHeight: 28 },
});

// ─── Types ────────────────────────────────────────────────────────────────────

type TabKey = 'Daily' | 'Weekly' | 'Monthly';
type NavKey  = 'home' | 'spend' | 'wealth' | 'incomeEngine' | 'more';
type CoinAnim = {
  id: number;
  x: Animated.Value;
  y: Animated.Value;
  scale: Animated.Value;
  opacity: Animated.Value;
};

type IncomeSourceLog = {
  id: number | string;
  title: string;
  date: string;
  amount: string | number;
  type: 'RECURRING' | 'MANUAL';
  icon: 'briefcase' | 'palette' | 'home' | 'bank';
  createdAt?: string;
};

const parseIncomeAmount = (amount: string | number): number => {
  if (typeof amount === 'number') {
    return Number.isFinite(amount) ? amount : 0;
  }
  return Number(amount.replace(/,/g, '').trim()) || 0;
};

const snapPocketSplit = (n: number) =>
  Math.round(Math.max(10, Math.min(90, Math.round(n))) / 5) * 5;

/** Shared spring for strip heights + pocket button scale */
const STRIP_SPRING = { damping: 20, stiffness: 180, mass: 0.6 };
/** White home sheet snap — spring + velocity (closer to native sheet / expense modal feel than fixed timing). */
const HOME_SHEET_SPRING = {
  friction: 10,
  tension: 68,
  overshootClamping: true,
  useNativeDriver: false,
} as const;
/**
 * Levitating nav: nested capsules — outer radius follows inner so corners stay concentric:
 * `FOOTER_NAV_OUTER_R = FOOTER_NAV_INNER_PILL_R + FOOTER_NAV_NEST_GUTTER` (outer height = inner + 2×gutter).
 */
const FOOTER_NAV_INNER_PILL_H = 40;
const FOOTER_NAV_INNER_PILL_R = FOOTER_NAV_INNER_PILL_H / 2;
const FOOTER_NAV_NEST_GUTTER = 6;
const FOOTER_NAV_OUTER_H = FOOTER_NAV_INNER_PILL_H + FOOTER_NAV_NEST_GUTTER * 2;
const FOOTER_NAV_OUTER_R = FOOTER_NAV_OUTER_H / 2;
/** Horizontal inset so the bar floats away from screen side edges. */
const FOOTER_PILL_H_INSET = 22;
/** Gap from safe-area bottom to the bottom edge of the pill (levitation). */
const FOOTER_PILL_ABOVE_HOME = 12;
/** Extra space above pill top for scroll / FAB clearance (see `tabBarHeight`). */
const FOOTER_SCROLL_CLEARANCE = 14;
/** Muted icon for inactive tabs (outline style). */
const FOOTER_NAV_ICON_MUTED = '#4A4A5C';

/**
 * Active tab inner pill — neutral frosted glass (icon + label stay in one horizontal row, colored).
 */
const FOOTER_GLASS_ACTIVE_PILL: ViewStyle = {
  height: FOOTER_NAV_INNER_PILL_H,
  borderRadius: FOOTER_NAV_INNER_PILL_R,
  overflow: 'hidden',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(255, 255, 255, 0.52)',
  borderWidth: 1,
  borderColor: 'rgba(255, 255, 255, 0.92)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.07,
  shadowRadius: 5,
  elevation: 3,
};

const FOOTER_GLASS_ACTIVE_SHEEN: ViewStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: '46%',
  borderTopLeftRadius: FOOTER_NAV_INNER_PILL_R,
  borderTopRightRadius: FOOTER_NAV_INNER_PILL_R,
  backgroundColor: 'rgba(255, 255, 255, 0.34)',
};

const FOOTER_GLASS_BACK_CHIP: ViewStyle = {
  width: FOOTER_NAV_INNER_PILL_H,
  height: FOOTER_NAV_INNER_PILL_H,
  borderRadius: FOOTER_NAV_INNER_PILL_R,
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  backgroundColor: 'rgba(255, 255, 255, 0.38)',
  borderWidth: 1,
  borderColor: 'rgba(255, 255, 255, 0.75)',
};

const L1_TABS = [
  {
    name: 'Home' as const,
    icon: 'home' as const,
    iconOutline: 'home-outline' as const,
    accent: '#E5484D',
  },
  {
    name: 'Spend' as const,
    icon: 'card' as const,
    iconOutline: 'card-outline' as const,
    accent: '#0D9488',
  },
  {
    name: 'Wealth' as const,
    icon: 'trending-up' as const,
    iconOutline: 'trending-up-outline' as const,
    accent: '#6C63FF',
  },
  {
    name: 'IE' as const,
    icon: 'flash' as const,
    iconOutline: 'flash-outline' as const,
    accent: '#EA580C',
  },
  {
    name: 'More' as const,
    icon: 'ellipsis-horizontal' as const,
    iconOutline: 'ellipsis-horizontal-outline' as const,
    accent: '#DB2777',
  },
];

type WealthSubRoute = 'investment' | 'insurance' | 'loans';
type WealthBarTabName = 'Investment' | 'Insurance' | 'Loans';

const WEALTH_BAR_TABS: Array<{
  name: WealthBarTabName;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconOutline: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  route: WealthSubRoute;
}> = [
  {
    name: 'Investment',
    icon: 'trending-up',
    iconOutline: 'trending-up-outline',
    color: '#6C63FF',
    route: 'investment',
  },
  {
    name: 'Insurance',
    icon: 'shield-checkmark',
    iconOutline: 'shield-checkmark-outline',
    color: '#16A34A',
    route: 'insurance',
  },
  {
    name: 'Loans',
    icon: 'wallet',
    iconOutline: 'wallet-outline',
    color: '#DC2626',
    route: 'loans',
  },
];

const BAR_CROSSFADE_MS = 250;
/** Must use Reanimated Easing — RN `Easing` is not a worklet inside `withTiming`. */
const BAR_CROSSFADE_EASING = ReanimatedEasing.out(ReanimatedEasing.cubic);
/** Side-by-side strips when sheet expanded (icon + labels only, no progress / Pocket Now). */
const STRIP_ROW_EXP_H = 68;
const COMPACT_STRIP_THRESHOLD = 60;

const EXPENSE_LOG_KEY = 'wos_expense_log';
const INCOME_SOURCES_KEY = 'income_engine_sources_v1';
const FIRESTORE_PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const FIRESTORE_USER_ID = process.env.EXPO_PUBLIC_FIREBASE_USER_ID;

type ShieldSettings = {
  activeDailyBudget: number;
  salaryConfirmed: boolean | null;
  incomeConfirmedAt: Date | null;
  dailySpent: number;
};

type TrackRingData = {
  trackLevel: number;
  activeMinutesToday: number;
  entriesToday: number;
  lastActiveDate: string;
};

type VaultSummary = {
  pocketedToday: number;
  totalPocketed: number;
  lockTarget: number;
  locked: boolean;
  lastPocketDate: string;
};

const isSameDay = (date1: Date, date2: Date) =>
  date1.getFullYear() === date2.getFullYear() &&
  date1.getMonth() === date2.getMonth() &&
  date1.getDate() === date2.getDate();

const getFirestoreNumber = (field: any): number | null => {
  if (!field || typeof field !== 'object') return null;
  if (typeof field.integerValue === 'string') {
    const value = Number(field.integerValue);
    return Number.isFinite(value) ? value : null;
  }
  if (typeof field.doubleValue === 'number') return Number.isFinite(field.doubleValue) ? field.doubleValue : null;
  return null;
};

const getFirestoreBoolean = (field: any): boolean | null => {
  if (!field || typeof field !== 'object') return null;
  if (typeof field.booleanValue === 'boolean') return field.booleanValue;
  return null;
};

const getFirestoreTimestamp = (field: any): Date | null => {
  if (!field || typeof field !== 'object' || typeof field.timestampValue !== 'string') return null;
  const parsed = new Date(field.timestampValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getFirestoreString = (field: any): string | null => {
  if (!field || typeof field !== 'object') return null;
  if (typeof field.stringValue === 'string') return field.stringValue;
  return null;
};

const getInactivityTimeout = (level: number) => {
  if (level <= 2) return 10000;
  if (level <= 4) return 20000;
  return 30000;
};

const EXPENSE_UI_MAP: Record<ExpenseCategory, { emoji: string; iconBg: string; label: string }> = {
  food: { emoji: '🍔', iconBg: '#FEF3E8', label: 'Food' },
  petrol: { emoji: '⛽', iconBg: '#F0E8FE', label: 'Transport' },
  shopping: { emoji: '🛒', iconBg: '#FEE8F0', label: 'Shopping' },
  family: { emoji: '👪', iconBg: '#E8F8F0', label: 'Family' },
  friends: { emoji: '👥', iconBg: '#E8F0FE', label: 'Friends' },
  medical: { emoji: '⚕️', iconBg: '#FEE8F0', label: 'Medical' },
  other: { emoji: '🧾', iconBg: '#E8F0FE', label: 'Other' },
};

// ─── HomeScreen ───────────────────────────────────────────────────────────────

export const HomeScreen: React.FC = () => {
  const { summary, addExpense, updateFinancialInput } = useFinancials();
  const {
    totalIncome,
    dailySpent,
    activeDailyBudget,
    criticalDailyLimit,
    todayDynamicBudget,
    ovrScore,
    monthlyAllocationPercent,
    setTotalIncome,
    setDailySpent,
    setCustomDailyLimit,
    setMonthlyAllocationPercent,
  } = useWealth();

  const [currentTime, setCurrentTime] = useState(new Date());
  const [shieldSettings, setShieldSettings] = useState<ShieldSettings>({
    activeDailyBudget,
    salaryConfirmed: null,
    incomeConfirmedAt: null,
    dailySpent,
  });
  const [trackData, setTrackData] = useState<TrackRingData>({
    trackLevel: 4,
    activeMinutesToday: 0,
    entriesToday: 0,
    lastActiveDate: new Date().toDateString(),
  });
  const [vaultSummary, setVaultSummary] = useState<VaultSummary>({
    pocketedToday: 0,
    totalPocketed: 0,
    lockTarget: 0,
    locked: true,
    lastPocketDate: new Date().toDateString(),
  });
  const [firestoreMinutes, setFirestoreMinutes] = useState(0);
  const [, setDisplayTick] = useState(0);
  const [firestoreUserId, setFirestoreUserId] = useState<string | null>(FIRESTORE_USER_ID ?? null);
  const [firestoreMacroScore, setFirestoreMacroScore] = useState<number | null>(null);
  const [firestoreOvrScore, setFirestoreOvrScore] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [pocketSplitPct, setPocketSplitPct] = useState(50);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localSeconds = useRef(0);
  const tickInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSaveTime = useRef(Date.now());
  const firestoreMinutesRef = useRef(0);
  const entriesTodayRef = useRef(0);

  const now = currentTime;
  const effectiveDailyBudget = activeDailyBudget > 0
    ? activeDailyBudget
    : shieldSettings.activeDailyBudget;
  const effectiveDailySpent = dailySpent >= 0
    ? dailySpent
    : shieldSettings.dailySpent;
  const localSalaryConfirmed = totalIncome > 0;
  const salaryConfirmed = shieldSettings.salaryConfirmed ?? localSalaryConfirmed;
  const isIncomeConfirmed = salaryConfirmed === true && activeDailyBudget > 0;
  const incomeConfirmedAt = shieldSettings.incomeConfirmedAt;
  useEffect(() => {
    console.log('salaryConfirmed:', salaryConfirmed);
    console.log('activeDailyBudget:', effectiveDailyBudget);
    console.log('incomeConfirmedAt:', incomeConfirmedAt);
  }, [salaryConfirmed, effectiveDailyBudget, incomeConfirmedAt]);

  const shieldRadius = R_SHIELD;
  const shieldCircumference = 2 * Math.PI * shieldRadius;
  const totalMinutesNow = now.getHours() * 60 + now.getMinutes();
  const entryScale = [0, 1, 2, 4, 8, 12, 18, 22, 26, 30, 35];
  const trackLevel = Math.max(1, Math.min(10, Math.round(trackData.trackLevel || 4)));
  const requiredMins = Math.pow(2, trackLevel - 1);
  const requiredSeconds = requiredMins * 60;
  const requiredLogs = entryScale[trackLevel] || 1;
  const totalActiveSeconds = (firestoreMinutes * 60) + localSeconds.current;
  const timeProgress = Math.min(totalActiveSeconds / requiredSeconds, 1);
  const entryProgress = Math.min(trackData.entriesToday / requiredLogs, 1);
  const trackPercentage = !isIncomeConfirmed ? 0 : (timeProgress + entryProgress) / 2;
  const trackPercent = Math.round(trackPercentage * 100);
  const trackRadius = R_TRACK;
  const trackCircumference = 2 * Math.PI * trackRadius;
  const trackOffset = trackCircumference - trackPercentage * trackCircumference;
  const shieldRingColor = '#FF3B5C';
  const trackRingColor = '#00B4FF';
  const pocketRingColor = '#FFAA00';
  const trackColor = trackRingColor;
  const safePocketSplitPct = Number.isFinite(pocketSplitPct) ? Math.max(10, Math.min(90, Math.round(pocketSplitPct))) : 50;
  const unspent = Math.max(0, activeDailyBudget - dailySpent);
  const pocketAmount = unspent * (safePocketSplitPct / 100);
  const pocketDisplay = Number.isFinite(pocketAmount) ? Math.max(0, Math.floor(pocketAmount)) : 0;
  const pocketAvailable = pocketDisplay;
  const healDisplay = Math.floor(unspent * ((100 - safePocketSplitPct) / 100));
  const pocketGoal = pocketAmount;
  const buildPercentage = !isIncomeConfirmed
    ? 0
    : pocketGoal > 0
    ? Math.min(vaultSummary.pocketedToday / pocketGoal, 1)
    : 0;
  const buildColor = pocketRingColor;

  const pocketRingRadius = R_POCKET;
  const pocketCircumference = 2 * Math.PI * pocketRingRadius;
  const pocketOffset = pocketCircumference - buildPercentage * pocketCircumference;

  useEffect(() => {
    console.log('pocketedToday:', vaultSummary.pocketedToday);
    console.log('pocketGoal:', pocketGoal);
    console.log('buildPercentage:', buildPercentage);
    console.log('unspent:', unspent);
    console.log('pocketSplitPct:', safePocketSplitPct);
    console.log('dailySpent:', dailySpent);
    console.log('activeDailyBudget:', activeDailyBudget);
  }, [
    vaultSummary.pocketedToday,
    pocketGoal,
    buildPercentage,
    unspent,
    safePocketSplitPct,
    dailySpent,
    activeDailyBudget,
  ]);

  useEffect(() => {
    console.log('trackLevel:', trackLevel);
    console.log('requiredMins:', requiredMins);
    console.log('requiredSeconds:', requiredSeconds);
    console.log('requiredLogs:', requiredLogs);
    console.log('entriesToday:', trackData.entriesToday);
    console.log('activeMinutesToday:', firestoreMinutes);
    console.log('totalActiveSeconds:', totalActiveSeconds);
    console.log('entryProgress:', entryProgress);
    console.log('timeProgress:', timeProgress);
    console.log('trackPercentage:', trackPercentage);
  }, [
    trackLevel,
    requiredMins,
    requiredSeconds,
    requiredLogs,
    trackData.entriesToday,
    firestoreMinutes,
    totalActiveSeconds,
    entryProgress,
    timeProgress,
    trackPercentage,
  ]);

  let shieldPercentage = 0;
  let shieldOffset = shieldCircumference;
  const isShieldBroken = isIncomeConfirmed && activeDailyBudget > 0 && effectiveDailySpent > activeDailyBudget;
  let shieldColor = isShieldBroken ? '#333333' : shieldRingColor;

  if (isIncomeConfirmed) {
    const confirmedToday = incomeConfirmedAt ? isSameDay(incomeConfirmedAt, now) : false;
    const startMinute =
      confirmedToday && incomeConfirmedAt
        ? incomeConfirmedAt.getHours() * 60 + incomeConfirmedAt.getMinutes()
        : 0;
    const minutesElapsed = Math.max(0, totalMinutesNow - startMinute);
    const availableMinutes = Math.max(1, 1440 - startMinute);
    const timePercent = minutesElapsed / availableMinutes;
    const safeBudget = effectiveDailyBudget > 0 ? effectiveDailyBudget : 1;
    const spendPercent = Math.min(effectiveDailySpent / safeBudget, 1);

    shieldPercentage = Math.max(0, timePercent - spendPercent);
    shieldOffset = shieldCircumference - shieldPercentage * shieldCircumference;
    shieldColor = isShieldBroken ? '#333333' : shieldRingColor;
  }
  const shieldPts = Math.max(0, Math.min(shieldPercentage, 1)) * 20;
  const trackPts = Math.max(0, Math.min(trackPercentage, 1)) * 10;
  const buildPts = Math.max(0, Math.min(buildPercentage, 1)) * 10;
  const microScore = shieldPts + trackPts + buildPts;
  const computedOvrScore = Math.round(Math.min(microScore + (firestoreMacroScore ?? 30), 100));
  const heroOvrScore = firestoreOvrScore ?? computedOvrScore;
  const getInsight = useCallback(() => {
    const hour = new Date().getHours();
    console.log('=== INSIGHT CHECK ===');
    console.log('dailySpent:', dailySpent);
    console.log('activeDailyBudget:', activeDailyBudget);
    console.log('hour:', hour);

    // Temporary isolate: only overspend condition enabled.
    if (activeDailyBudget > 0 && dailySpent > activeDailyBudget) {
      return {
        icon: '⚠',
        text: 'Budget exceeded today',
        color: '#FF3B5C',
        bg: 'rgba(255,59,92,0.1)',
        border: 'rgba(255,59,92,0.2)',
        action: 'Spend' as const,
      };
    }

    return null;
  }, [activeDailyBudget, dailySpent]);
  const insight = useMemo(() => getInsight(), [getInsight]);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
  const NAVY_HEIGHT = SCREEN_HEIGHT * 0.342;
  const minimizedTop = Math.round(NAVY_HEIGHT);
  /** SafeAreaView already applies top inset — align with Wealth/IE “peek” sheet, not double-count safe area. */
  const expandedTop = 8;
  const SIDE_MARGIN = Math.round(SCREEN_WIDTH * 0.08);
  /** Expanded side-by-side cards: shared inner inset (+5% vs 8px → 9) + icon–text gap. */
  const EXPANDED_STRIP_PAD_X = Math.ceil(8 * 1.05);
  const EXPANDED_STRIP_INNER_GAP = Math.ceil(8 * 1.05);

  const homeSheetTop = useRef(new Animated.Value(minimizedTop)).current;
  const homeSheetPanStartRef = useRef(minimizedTop);
  const homeSheetCurrentTopRef = useRef(minimizedTop);
  /** Mirrors `homeSheetTop` for gesture checks without reading private Animated APIs. */
  const homeSheetTopTrackedRef = useRef(minimizedTop);
  const whiteScrollY = useSharedValue(0);
  /** Bottom bar: 0 = Level 1 visible, 1 = Wealth Level 2 row visible. */
  const swapAnim = useSharedValue(0);
  /** 0 = sheet minimized (strips stacked), 1 = sheet fully expanded (strips wide) — follows sheet top continuously. */
  const sheetExpandedSV = useSharedValue(0);
  /** When false, sheet is far enough up that budget/pocket panel chrome should hide (matches old “wide strips” band). */
  const [stripsInStackedLayout, setStripsInStackedLayout] = useState(true);
  const prevStripsStackedRef = useRef(true);
  /** Fire `setSheetActivePanel(null)` once per “enter expanded band” so sliders don’t sit under wide strips. */
  const expandClosePanelLatchRef = useRef(false);
  const scrollYValueRef = useRef(0);
  /** Let expanded activity tabs receive touches only when sheet is scrolled up (opacity > 0). */
  const [activityTabUi, setActivityTabUi] = useState<TabKey>('Daily');
  const [activeNav, setActiveNav] = useState<NavKey>('home');
  const [activeRootTab, setActiveRootTab] = useState<'Home' | 'IncomeEngine' | 'Wealth' | 'More'>('Home');
  /** Bottom bar: 1 = main tabs, 2 = Wealth sub-tabs (same bar slot). */
  const [navLevel, setNavLevel] = useState<1 | 2>(1);
  const [wealthSubRoute, setWealthSubRoute] = useState<WealthSubRoute>('investment');
  const [activeWealthTab, setActiveWealthTab] = useState<WealthBarTabName>('Investment');
  const [sheetActivePanel, setSheetActivePanel] = useState<'budget' | 'pocket' | null>(null);
  /** Mirrors `sheetActivePanel` for strip height worklets (0 none, 1 budget, 2 pocket). */
  const activePanelSV = useSharedValue(0);
  /** Smoothed strip heights — spring on panel open/close; follow sheet morph when no panel. */
  const budgetStripHeightSV = useSharedValue(48);
  const pocketStripHeightSV = useSharedValue(44);
  const [confirmedIncomeForBudget, setConfirmedIncomeForBudget] = useState(0);
  const [localAllocationPct, setLocalAllocationPct] = useState(Math.max(1, Math.min(50, monthlyAllocationPercent || 10)));
  const [previewDaily, setPreviewDaily] = useState(Math.max(0, activeDailyBudget || 0));
  const [previewPool, setPreviewPool] = useState(0);
  const [pocketSplitDraft, setPocketSplitDraft] = useState(50);
  const [localAutoMode, setLocalAutoMode] = useState(true);
  const [incomeActivity, setIncomeActivity] = useState<IncomeSourceLog[]>([]);
  const [expenseActivity, setExpenseActivity] = useState<Expense[]>([]);

  // Live Firestore transactions — primary data source for activity feed + SHIELD ring
  const { expenses: firestoreExpenses, loading: txLoading } = useSpendingFirestoreData(activeDailyBudget || 0);
  useEffect(() => {
    if (txLoading) return;
    const mapped: Expense[] = firestoreExpenses.map(e => ({
      id: e.id,
      category: (e.category as ExpenseCategory) || 'other',
      amount: e.amount,
      date: e.date.toISOString(),
      note: e.name,
      tag: e.tag === 'system' ? 'variable' : e.tag,
    }));
    setExpenseActivity(mapped);

    // Sync today's actual spend from Firestore → WealthContext → SHIELD ring.
    // This replaces any manual setDailySpent calls with the authoritative value.
    const today = new Date();
    const todaySpend = firestoreExpenses
      .filter(
        e =>
          e.date.getFullYear() === today.getFullYear() &&
          e.date.getMonth() === today.getMonth() &&
          e.date.getDate() === today.getDate(),
      )
      .reduce((s, e) => s + e.amount, 0);
    setDailySpent(todaySpend);
  }, [txLoading, firestoreExpenses, setDailySpent]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [coinAnims, setCoinAnims] = useState<CoinAnim[]>([]);
  const coinAnimIdRef = useRef(0);
  const rootRef = useRef<View>(null);
  const heroRingsRef = useRef<View>(null);
  const sweepPillRef = useRef<View>(null);

  const [isExpenseModalVisible, setIsExpenseModalVisible] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('0');
  const [expenseNote, setExpenseNote] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);

  const dailyLimit = effectiveDailyBudget;
  const dynamicDailyMax = todayDynamicBudget;
  const criticalDailyFloor = criticalDailyLimit;

  /** ~20% of screen — scales all scroll-linked transitions (replaces fixed 80–120px band). */
  const sa = scrollAnimSpanPx(screenHeight);
  const sk = sa / 120;

  const syncScrollYRef = useCallback((y: number) => {
    scrollYValueRef.current = y;
  }, []);

  const whiteCardScrollHandler = useAnimatedScrollHandler(
    {
      onScroll: e => {
        whiteScrollY.value = e.contentOffset.y;
        runOnJS(syncScrollYRef)(e.contentOffset.y);
      },
    },
    [syncScrollYRef],
  );

  const footerAnimatedStyle = useAnimatedStyle(() => {
    const ty = interpolate(whiteScrollY.value, [0, 100 * sk], [0, 150], Extrapolation.CLAMP);
    return { transform: [{ translateY: ty }] };
  }, [sk]);

  const l1BarCrossStyle = useAnimatedStyle(() => ({
    opacity: interpolate(swapAnim.value, [0, 1], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(swapAnim.value, [0, 1], [0, -30], Extrapolation.CLAMP) }],
  }));

  const l2BarCrossStyle = useAnimatedStyle(() => ({
    opacity: interpolate(swapAnim.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(swapAnim.value, [0, 1], [30, 0], Extrapolation.CLAMP) }],
  }));

  const compactStripHeaderStyle = useAnimatedStyle(() => {
    const scrollIn = interpolate(
      whiteScrollY.value,
      [COMPACT_STRIP_THRESHOLD - 8, COMPACT_STRIP_THRESHOLD + 16],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const sheetExp = sheetExpandedSV.value;
    const ty = interpolate(
      whiteScrollY.value,
      [COMPACT_STRIP_THRESHOLD - 8, COMPACT_STRIP_THRESHOLD + 16],
      [-10, 0],
      Extrapolation.CLAMP,
    );
    return {
      opacity: scrollIn * (1 - sheetExp),
      transform: [{ translateY: ty * (1 - sheetExp) }],
      width: '100%' as const,
      flexDirection: 'row' as const,
    };
  });

  const originalStripsOpacityStyle = useAnimatedStyle(() => {
    const scrollFade = interpolate(
      whiteScrollY.value,
      [COMPACT_STRIP_THRESHOLD - 4, COMPACT_STRIP_THRESHOLD + 12],
      [1, 0],
      Extrapolation.CLAMP,
    );
    const m = sheetExpandedSV.value;
    return {
      opacity: interpolate(m, [0, 0.22], [scrollFade, 1], Extrapolation.CLAMP),
    };
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    firestoreMinutesRef.current = firestoreMinutes;
    entriesTodayRef.current = trackData.entriesToday;
  }, [firestoreMinutes, trackData.entriesToday]);

  const buildTrackDocUrl = useCallback(
    (userId: string) =>
      `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/users/${userId}/gamification/track_ring`,
    [],
  );

  const buildVaultSummaryUrl = useCallback(
    (userId: string) =>
      `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/users/${userId}/vault/summary`,
    [],
  );

  const patchTrackRingDoc = useCallback(
    async (userId: string, patch: Partial<TrackRingData>) => {
      if (!FIRESTORE_PROJECT_ID) return;
      const fields: Record<string, any> = {};
      if (typeof patch.activeMinutesToday === 'number') {
        fields.activeMinutesToday = { doubleValue: patch.activeMinutesToday };
      }
      if (typeof patch.entriesToday === 'number') {
        fields.entriesToday = { integerValue: Math.max(0, Math.round(patch.entriesToday)).toString() };
      }
      if (typeof patch.lastActiveDate === 'string') {
        fields.lastActiveDate = { stringValue: patch.lastActiveDate };
      }
      if (!Object.keys(fields).length) return;
      await fetch(buildTrackDocUrl(userId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      }).catch(() => {});
    },
    [buildTrackDocUrl],
  );

  const patchVaultSummaryDoc = useCallback(
    async (userId: string, patch: Partial<VaultSummary>) => {
      if (!FIRESTORE_PROJECT_ID) return;
      const fields: Record<string, any> = {};
      if (typeof patch.pocketedToday === 'number') {
        fields.pocketedToday = { doubleValue: patch.pocketedToday };
      }
      if (typeof patch.totalPocketed === 'number') {
        fields.totalPocketed = { doubleValue: patch.totalPocketed };
      }
      if (typeof patch.lockTarget === 'number') {
        fields.lockTarget = { doubleValue: patch.lockTarget };
      }
      if (typeof patch.locked === 'boolean') {
        fields.locked = { booleanValue: patch.locked };
      }
      if (typeof patch.lastPocketDate === 'string') {
        fields.lastPocketDate = { stringValue: patch.lastPocketDate };
      }
      if (!Object.keys(fields).length) return;
      await fetch(buildVaultSummaryUrl(userId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      }).catch(() => {});
    },
    [buildVaultSummaryUrl],
  );

  const saveToFirestore = useCallback(async () => {
    if (!isIncomeConfirmed) return;
    if (!firestoreUserId) return;
    if (localSeconds.current < 1) return;
    const minutesToSave = localSeconds.current / 60;
    localSeconds.current = 0;
    lastSaveTime.current = Date.now();
    const todayStr = new Date().toDateString();
    const nextMinutes = firestoreMinutesRef.current + minutesToSave;
    firestoreMinutesRef.current = nextMinutes;
    setFirestoreMinutes(nextMinutes);
    setTrackData(prev => ({ ...prev, activeMinutesToday: nextMinutes, lastActiveDate: todayStr }));
    await patchTrackRingDoc(firestoreUserId, {
      activeMinutesToday: nextMinutes,
      lastActiveDate: todayStr,
    });
    console.log('Saved to Firestore:', minutesToSave, 'mins');
  }, [firestoreUserId, isIncomeConfirmed, patchTrackRingDoc]);

  const startTicking = useCallback(() => {
    if (!isIncomeConfirmed) {
      console.log('Income not confirmed — TRACK timer blocked');
      return;
    }
    if (tickInterval.current) return;
    tickInterval.current = setInterval(() => {
      localSeconds.current += 1;
      setDisplayTick(prev => prev + 1);
      const secondsSinceLastSave = (Date.now() - lastSaveTime.current) / 1000;
      if (secondsSinceLastSave >= 30) {
        saveToFirestore();
      }
    }, 1000);
  }, [isIncomeConfirmed, saveToFirestore]);

  const stopTicking = useCallback(() => {
    if (tickInterval.current) {
      clearInterval(tickInterval.current);
      tickInterval.current = null;
    }
    saveToFirestore();
  }, [saveToFirestore]);

  const handleUserActivity = useCallback(() => {
    if (!tickInterval.current) {
      startTicking();
    }
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    const timeoutMs = getInactivityTimeout(trackLevel);
    inactivityTimer.current = setTimeout(() => {
      setIsActive(false);
      stopTicking();
      console.log(`Level ${trackLevel} — inactive timeout reached, timer paused`);
    }, timeoutMs);
  }, [startTicking, stopTicking, trackLevel]);

  useEffect(() => {
    let mounted = true;

    const readShieldSettings = async () => {
      try {
        const savedUserId = await AsyncStorage.getItem('wos_user_id');
        const userId = FIRESTORE_USER_ID || savedUserId;
        if (userId && mounted) setFirestoreUserId(userId);

        const [incomeData, settings] = await Promise.all([getIncome(), getSettings()]);
        if (!mounted) return;

        const confirmedIncome = incomeData.confirmedIncome || 0;
        setConfirmedIncomeForBudget(confirmedIncome > 0 ? confirmedIncome : totalIncome);
        setShieldSettings({
          activeDailyBudget: incomeData.activeDailyBudget || activeDailyBudget,
          salaryConfirmed: incomeData.salaryConfirmed || localSalaryConfirmed,
          incomeConfirmedAt: null,
          dailySpent,
        });
        const nextPocket = Math.max(10, Math.min(90, Math.round(settings.pocketSplitPct || 50)));
        setPocketSplitPct(nextPocket);
        setPocketSplitDraft(nextPocket);
        if (incomeData.allocationPct) {
          setMonthlyAllocationPercent(Math.max(1, Math.min(50, Math.round(incomeData.allocationPct))));
        }
        setFirestoreMacroScore(null);
        setFirestoreOvrScore(null);
      } catch {
        if (mounted) {
          setShieldSettings({
            activeDailyBudget,
            salaryConfirmed: localSalaryConfirmed,
            incomeConfirmedAt: null,
            dailySpent,
          });
          setFirestoreMacroScore(null);
          setFirestoreOvrScore(null);
        }
      }
    };

    readShieldSettings();
    const poll = setInterval(readShieldSettings, 60000);

    return () => {
      mounted = false;
      clearInterval(poll);
    };
  }, [
    activeDailyBudget,
    dailySpent,
    localSalaryConfirmed,
    buildTrackDocUrl,
    buildVaultSummaryUrl,
    effectiveDailyBudget,
    patchTrackRingDoc,
    patchVaultSummaryDoc,
  ]);

  useEffect(() => {
    updateUserSettingsFirestoreRecord({
      activeDailyBudget,
      dailySpent,
    }).catch(() => {});
  }, [activeDailyBudget, dailySpent]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        setIsActive(true);
        startTicking();
      } else {
        setIsActive(false);
        stopTicking();
      }
    });
    startTicking();
    return () => {
      sub.remove();
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      stopTicking();
    };
  }, [startTicking, stopTicking]);

  useEffect(() => {
    if (!isIncomeConfirmed) {
      stopTicking();
    } else if (AppState.currentState === 'active') {
      startTicking();
    }
  }, [isIncomeConfirmed, startTicking, stopTicking]);

  const transactions = useMemo<Tx[]>(() => {
    const incomeTx: Tx[] = incomeActivity.map(item => {
      const created = item.createdAt ? new Date(item.createdAt) : null;
      const sub = created
        ? `${created.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
          })} · ${created.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })}`
        : item.date;

      return {
        id: `income-${item.id}`,
        emoji: '💰',
        iconBg: '#E8F8F0',
        name: item.title,
        sub,
        amount: parseIncomeAmount(item.amount),
        positive: true,
        ts: created ? created.getTime() : 0,
      };
    });

    const expenseTx: Tx[] = expenseActivity.map(exp => {
      const meta = EXPENSE_UI_MAP[exp.category] ?? EXPENSE_UI_MAP.other;
      const at = new Date(exp.date);
      return {
        id: `expense-${exp.id}`,
        emoji: meta.emoji,
        iconBg: meta.iconBg,
        name: exp.note?.trim() ? exp.note : meta.label,
        sub: `${at.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
        })} · ${at.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })}`,
        amount: exp.amount,
        positive: false,
        ts: at.getTime(),
      };
    });

    return [...incomeTx, ...expenseTx].sort((a, b) => b.ts - a.ts);
  }, [expenseActivity, incomeActivity]);

  const shownTransactions = useMemo(() => {
    const now = Date.now();
    const dayMs = 86400000;
    if (activityTabUi === 'Daily') {
      return transactions.filter(tx => tx.ts === 0 || now - tx.ts < dayMs);
    }
    if (activityTabUi === 'Weekly') {
      return transactions.filter(tx => tx.ts === 0 || now - tx.ts < 7 * dayMs);
    }
    return transactions;
  }, [transactions, activityTabUi]);

  const applyIncomeLinkedState = useCallback(
    (logs: IncomeSourceLog[]) => {
      const paidIncomeTotal = logs.reduce((sum, item) => sum + parseIncomeAmount(item.amount), 0);
      const nextIncome = paidIncomeTotal > 0 ? paidIncomeTotal : 0;
      setTotalIncome(nextIncome);
      updateFinancialInput({ income: nextIncome }).catch(() => {});
    },
    [setTotalIncome, updateFinancialInput],
  );

  useEffect(() => {
    if (!isExpenseModalVisible) return;
    setExpenseAmount('0');
    setExpenseNote('');
    setSelectedCategory('food');
    setIsRecurring(false);
  }, [isExpenseModalVisible]);

  useEffect(() => {
    if (activeRootTab !== 'Home') return;
    AsyncStorage.getItem('income_engine_sources_v1')
      .then(raw => {
        if (!raw) {
          setIncomeActivity([]);
          applyIncomeLinkedState([]);
          return;
        }
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const logs = parsed as IncomeSourceLog[];
          setIncomeActivity(logs);
          applyIncomeLinkedState(logs);
        } else {
          setIncomeActivity([]);
          applyIncomeLinkedState([]);
        }
      })
      .catch(() => {
        setIncomeActivity([]);
        applyIncomeLinkedState([]);
      });

    AsyncStorage.getItem(EXPENSE_LOG_KEY)
      .then(raw => {
        if (!raw) {
          setExpenseActivity([]);
          return;
        }
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setExpenseActivity(parsed as Expense[]);
        } else {
          setExpenseActivity([]);
        }
      })
      .catch(() => {
        setExpenseActivity([]);
      });
  }, [activeRootTab, applyIncomeLinkedState]);

  useEffect(() => {
    if (activeRootTab !== 'Home' || isExpenseModalVisible) return;
    AsyncStorage.getItem(EXPENSE_LOG_KEY)
      .then(raw => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setExpenseActivity(parsed as Expense[]);
        }
      })
      .catch(() => {});
  }, [activeRootTab, isExpenseModalVisible]);

  const handleKeypadPress = useCallback((val: string) => {
    if (val === '<') {
      setExpenseAmount(prev => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
      return;
    }
    if (val === '.') {
      setExpenseAmount(prev => {
        if (prev.includes('.')) return prev;
        return prev === '' || prev === '0' ? '0.' : `${prev}.`;
      });
      return;
    }
    if (!/^\d$/.test(val)) return;
    setExpenseAmount(prev => {
      const [whole, frac] = prev.split('.');
      if (frac !== undefined && frac.length >= 2) return prev;
      if (prev === '0') return val;
      if (prev === '0.') return `0.${val}`;
      if (frac !== undefined) return `${whole}.${frac}${val}`;
      return `${prev}${val}`;
    });
  }, []);

  const closeExpenseModal = useCallback(() => {
    setIsExpenseModalVisible(false);
  }, []);

  const closeExpenseModalRef = useRef(closeExpenseModal);
  closeExpenseModalRef.current = closeExpenseModal;

  const measureCenterInRoot = useCallback(
    (viewRef: React.RefObject<View | null>) =>
      new Promise<{ x: number; y: number } | null>((resolve) => {
        if (!viewRef.current || !rootRef.current) {
          resolve(null);
          return;
        }
        rootRef.current.measureInWindow((rootX, rootY) => {
          viewRef.current?.measureInWindow((x, y, w, h) => {
            resolve({ x: x - rootX + w / 2, y: y - rootY + h / 2 });
          });
        });
      }),
    [],
  );

  const launchVaultCoins = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const [from, to] = await Promise.all([
      measureCenterInRoot(sweepPillRef),
      measureCenterInRoot(heroRingsRef),
    ]);
    if (!from || !to) return;

    const burst = Array.from({ length: 8 }).map((_, i) => {
      const id = ++coinAnimIdRef.current;
      const lane = (i % 4) - 1.5;
      const x = new Animated.Value(from.x + lane * 4);
      const y = new Animated.Value(from.y + Math.floor(i / 4) * 2);
      const scale = new Animated.Value(0.82);
      const opacity = new Animated.Value(0);
      return { id, x, y, scale, opacity };
    });

    setCoinAnims(prev => [...prev, ...burst]);

    burst.forEach((coin, i) => {
      const drift = ((i % 4) - 1.5) * 7;
      Animated.sequence([
        Animated.delay(i * 55),
        Animated.parallel([
          Animated.timing(coin.opacity, { toValue: 1, duration: 80, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(coin.y, { toValue: from.y - 14 - i * 2, duration: 120, useNativeDriver: true }),
            Animated.timing(coin.y, { toValue: to.y + 2, duration: 540, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(coin.x, { toValue: from.x + 8 + i * 1.5, duration: 120, useNativeDriver: true }),
            Animated.timing(coin.x, { toValue: to.x + drift, duration: 540, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(coin.scale, { toValue: 1.06, duration: 180, useNativeDriver: true }),
            Animated.timing(coin.scale, { toValue: 0.64, duration: 480, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(500),
            Animated.timing(coin.opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
          ]),
        ]),
      ]).start(() => setCoinAnims(prev => prev.filter(c => c.id !== coin.id)));
    });
  }, [measureCenterInRoot]);

  /** Add `amount` to today's pocket and total pocketed (same Firestore fields as before). */
  const applyPocketAmount = useCallback(
    async (rawAmount: number) => {
      const amt = Math.floor(rawAmount);
      if (!isIncomeConfirmed || amt <= 0) return;
      launchVaultCoins().catch(() => {});
      const todayStr = new Date().toDateString();
      setVaultSummary(prev => {
        const nextPocketedToday = prev.pocketedToday + amt;
        const nextTotalPocketed = prev.totalPocketed + amt;
        const nextLocked = prev.lockTarget > 0 ? nextTotalPocketed >= prev.lockTarget : false;
        const next = {
          ...prev,
          pocketedToday: nextPocketedToday,
          totalPocketed: nextTotalPocketed,
          locked: nextLocked,
          lastPocketDate: todayStr,
        };
        if (firestoreUserId) {
          patchVaultSummaryDoc(firestoreUserId, {
            pocketedToday: nextPocketedToday,
            totalPocketed: nextTotalPocketed,
            locked: nextLocked,
            lastPocketDate: todayStr,
          }).catch(() => {});
        }
        console.log('Pocketed increment:', amt, '→ today:', nextPocketedToday);
        return next;
      });
    },
    [firestoreUserId, isIncomeConfirmed, launchVaultCoins, patchVaultSummaryDoc],
  );

  const pocketPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pocketLongPressRef = useRef(false);
  const pocketButtonScale = useSharedValue(1);
  const pocketButtonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pocketButtonScale.value }],
  }));

  const clearPocketPressTimer = useCallback(() => {
    if (pocketPressTimerRef.current != null) {
      clearTimeout(pocketPressTimerRef.current);
      pocketPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPocketPressTimer(), [clearPocketPressTimer]);

  const handlePocketPressIn = useCallback(() => {
    pocketLongPressRef.current = false;
    pocketButtonScale.value = withSpring(0.95, STRIP_SPRING);
    clearPocketPressTimer();
    pocketPressTimerRef.current = setTimeout(() => {
      pocketLongPressRef.current = true;
      void applyPocketAmount(pocketAvailable);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      clearPocketPressTimer();
    }, 500);
  }, [applyPocketAmount, clearPocketPressTimer, pocketAvailable, pocketButtonScale]);

  const handlePocketPressOut = useCallback(() => {
    pocketButtonScale.value = withSpring(1, STRIP_SPRING);
    clearPocketPressTimer();
    if (!pocketLongPressRef.current) {
      void applyPocketAmount(Math.floor(pocketAvailable * 0.1));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [applyPocketAmount, clearPocketPressTimer, pocketAvailable, pocketButtonScale]);

  useEffect(() => {
    console.log('pocketSplitPct:', safePocketSplitPct);
    console.log('unspent:', unspent);
    console.log('pocketDisplay:', pocketDisplay);
  }, [safePocketSplitPct, unspent, pocketDisplay]);

  const expenseSheetPan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Platform.OS === 'android' && g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2,
        onPanResponderRelease: (_, g) => {
          if (Platform.OS === 'android' && g.dy > 96) closeExpenseModalRef.current();
        },
      }),
    [],
  );

  const logExpenseDisabled =
    expenseAmount === '0' ||
    expenseAmount === '' ||
    selectedCategory === null ||
    selectedCategory === 'more' ||
    Number.isNaN(parseFloat(expenseAmount)) ||
    parseFloat(expenseAmount) <= 0;

  const incrementEntryCount = useCallback(async (): Promise<number> => {
    const todayStr = new Date().toDateString();
    const nextEntries = entriesTodayRef.current + 1;
    entriesTodayRef.current = nextEntries;
    setTrackData(prev => ({ ...prev, entriesToday: nextEntries, lastActiveDate: todayStr }));

    if (!firestoreUserId || !FIRESTORE_PROJECT_ID) {
      console.log('incrementEntryCount skipped remote write: missing userId/projectId');
      return nextEntries;
    }

    const trackDocUrl = buildTrackDocUrl(firestoreUserId);
    console.log('Writing to path:', `users/${firestoreUserId}/gamification/track_ring`);
    try {
      const existing = await fetch(trackDocUrl);
      if (!existing.ok) {
        await patchTrackRingDoc(firestoreUserId, {
          activeMinutesToday: 0,
          entriesToday: 1,
          lastActiveDate: todayStr,
        });
        console.log('track_ring doc created with entriesToday: 1');
        return 1;
      }
      await patchTrackRingDoc(firestoreUserId, {
        entriesToday: nextEntries,
        lastActiveDate: todayStr,
      });
      console.log('entriesToday incremented');
    } catch {
      // Keep optimistic local update even if network write fails.
    }
    return nextEntries;
  }, [firestoreUserId, patchTrackRingDoc]);

  const handlePocketDone = useCallback(async () => {
    const snapped = snapPocketSplit(pocketSplitDraft);
    setPocketSplitPct(snapped);
    await updateUserSettingsFirestoreRecord({ pocketSplitPct: snapped }).catch(() => {});
    setSheetActivePanel(null);
  }, [pocketSplitDraft]);

  useEffect(() => {
    if (sheetActivePanel !== 'pocket') {
      setPocketSplitDraft(snapPocketSplit(pocketSplitPct));
    }
  }, [pocketSplitPct, sheetActivePanel]);

  // ── Write a new expense to AsyncStorage ─────────────────────────────────
  // Saves to wos_expenses key and fires expenseEvents so every mounted
  // instance of useSpendingFirestoreData refreshes automatically.
  const writeExpenseToFirestore = useCallback(
    async (
      category: ExpenseCategory,
      amount: number,
      note: string | undefined,
      isFixed: boolean,
    ) => {
      const meta = EXPENSE_UI_MAP[category] ?? EXPENSE_UI_MAP.other;
      await saveExpense({
        id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        amount,
        category: meta.label,
        tag: isFixed ? 'fixed' : 'variable',
        name: note || meta.label,
        icon: meta.emoji,
        date: new Date().toISOString(),
      });
      expenseEvents.emitExpenseAdded();
    },
    [],
  );

  const submitExpense = useCallback(async () => {
    console.log('=== EXPENSE SUBMITTED ===');
    console.log('entriesToday before:', entriesTodayRef.current);
    console.log('userId:', firestoreUserId);
    const amt = parseFloat(expenseAmount);
    if (
      expenseAmount === '0' ||
      expenseAmount === '' ||
      selectedCategory === null ||
      selectedCategory === 'more' ||
      Number.isNaN(amt) ||
      amt <= 0
    ) {
      return;
    }
    const expenseCategory = MODAL_TAG_TO_EXPENSE[selectedCategory] ?? 'food';
    if (!expenseCategory) return;
    // Write to Firestore — primary store. This triggers an auto-refresh on all
    // useSpendingFirestoreData instances (SpendingScreen + this screen).
    void writeExpenseToFirestore(
      expenseCategory,
      amt,
      expenseNote.trim() || undefined,
      !!isRecurring,
    );

    try {
      await addExpense(
        expenseCategory,
        amt,
        expenseNote.trim() || undefined,
        isRecurring ? true : undefined,
      );
      const nextEntries = await incrementEntryCount();
      console.log('entriesToday after increment:', nextEntries);
      console.log('Entry count incremented');
    } catch {
      const fallbackExpense: Expense = {
        id: `${Date.now()}`,
        category: expenseCategory,
        amount: amt,
        note: expenseNote.trim() || undefined,
        date: new Date().toISOString(),
        is_fixed: isRecurring ? true : undefined,
      };
      setExpenseActivity(prev => [fallbackExpense, ...prev]);
      AsyncStorage.setItem(EXPENSE_LOG_KEY, JSON.stringify([fallbackExpense, ...expenseActivity])).catch(() => {});
      const nextEntries = await incrementEntryCount();
      console.log('entriesToday after increment:', nextEntries);
    }
    // Optimistic SHIELD ring update — corrected by Firestore refresh shortly after
    setDailySpent(prev => prev + amt);
    setIsExpenseModalVisible(false);
  }, [addExpense, expenseAmount, expenseNote, expenseActivity, firestoreUserId, incrementEntryCount, isRecurring, selectedCategory, setDailySpent, writeExpenseToFirestore]);

  const handleRefreshReset = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await AsyncStorage.multiRemove([INCOME_SOURCES_KEY, EXPENSE_LOG_KEY]);
      setIncomeActivity([]);
      setExpenseActivity([]);
      setTotalIncome(0);
      await updateFinancialInput({ income: 0 });
      setDailySpent(0);
      setCustomDailyLimit(null);
    } finally {
      setIsRefreshing(false);
    }
  }, [setCustomDailyLimit, setDailySpent, setTotalIncome, updateFinancialInput]);

  const headerRefreshPan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          g.dy > 16 && Math.abs(g.dy) > Math.abs(g.dx) && scrollYValueRef.current <= 2,
        onPanResponderRelease: (_, g) => {
          if (g.dy > 86 && !isRefreshing) {
            handleRefreshReset();
          }
        },
      }),
    [handleRefreshReset, isRefreshing],
  );

  useEffect(() => {
    homeSheetPanStartRef.current = minimizedTop;
    homeSheetCurrentTopRef.current = minimizedTop;
    homeSheetTopTrackedRef.current = minimizedTop;
    prevStripsStackedRef.current = true;
    expandClosePanelLatchRef.current = false;
    sheetExpandedSV.value = 0;
    budgetStripHeightSV.value = 48;
    pocketStripHeightSV.value = 44;
    setStripsInStackedLayout(true);
    homeSheetTop.stopAnimation();
    homeSheetTop.setValue(minimizedTop);
  }, [minimizedTop, homeSheetTop, budgetStripHeightSV, pocketStripHeightSV]);

  useEffect(() => {
    const STACKED_UI_MORPH = 0.78;
    const CLOSE_PANEL_MORPH_ENTER = 0.92;
    const CLOSE_PANEL_MORPH_EXIT = 0.86;

    const applySheetTop = (value: number) => {
      homeSheetTopTrackedRef.current = value;
      const range = Math.max(1, minimizedTop - expandedTop);
      const raw = (value - expandedTop) / range;
      const stripMorph = 1 - Math.max(0, Math.min(1, raw));
      sheetExpandedSV.value = stripMorph;

      if (stripMorph >= CLOSE_PANEL_MORPH_ENTER) {
        activePanelSV.value = 0;
        if (!expandClosePanelLatchRef.current) {
          expandClosePanelLatchRef.current = true;
          setSheetActivePanel(prev => (prev !== null ? null : prev));
        }
      } else if (stripMorph < CLOSE_PANEL_MORPH_EXIT) {
        expandClosePanelLatchRef.current = false;
      }

      const stacked = stripMorph < STACKED_UI_MORPH;
      if (stacked !== prevStripsStackedRef.current) {
        prevStripsStackedRef.current = stacked;
        setStripsInStackedLayout(stacked);
      }
    };
    const id = homeSheetTop.addListener(({ value }) => applySheetTop(value));
    homeSheetTop.stopAnimation((value: number) => applySheetTop(value));
    return () => {
      homeSheetTop.removeListener(id);
    };
  }, [homeSheetTop, expandedTop, minimizedTop, sheetExpandedSV, activePanelSV]);

  const homeSheetPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => {
          if (Math.abs(g.dy) <= Math.abs(g.dx) || Math.abs(g.dy) <= 5) return false;
          const atScrollTop = scrollYValueRef.current <= 2;
          if (!atScrollTop) return false;
          const topNow = homeSheetTopTrackedRef.current;
          if (g.dy < 0) {
            return topNow >= minimizedTop - 10;
          }
          if (g.dy > 0) {
            return topNow <= minimizedTop - 10;
          }
          return false;
        },
        onPanResponderGrant: () => {
          homeSheetTop.stopAnimation((value: number) => {
            homeSheetPanStartRef.current = value;
            homeSheetTopTrackedRef.current = value;
          });
        },
        onPanResponderMove: (_, g) => {
          const next = homeSheetPanStartRef.current + g.dy;
          const clamped = Math.max(expandedTop, Math.min(minimizedTop, next));
          homeSheetCurrentTopRef.current = clamped;
          homeSheetTopTrackedRef.current = clamped;
          homeSheetTop.setValue(clamped);
        },
        onPanResponderRelease: (_, g) => {
          const range = minimizedTop - expandedTop;
          const pos = homeSheetCurrentTopRef.current;
          const mid = expandedTop + range * 0.5;
          let toValue: number;
          if (g.vy < -0.22) {
            toValue = expandedTop;
          } else if (g.vy > 0.22) {
            toValue = minimizedTop;
          } else {
            toValue = pos < mid ? expandedTop : minimizedTop;
          }
          const vy = Math.max(-2800, Math.min(2800, g.vy));
          Animated.spring(homeSheetTop, {
            toValue,
            ...HOME_SHEET_SPRING,
            velocity: vy,
          }).start(({ finished }) => {
            if (finished) {
              homeSheetTopTrackedRef.current = toValue;
            }
          });
        },
        onPanResponderTerminate: () => {
          Animated.spring(homeSheetTop, {
            toValue: minimizedTop,
            ...HOME_SHEET_SPRING,
            velocity: 0,
          }).start(() => {
            homeSheetTopTrackedRef.current = minimizedTop;
          });
        },
      }),
    [expandedTop, minimizedTop, homeSheetTop],
  );

  useEffect(() => {
    activePanelSV.value = sheetActivePanel === 'budget' ? 1 : sheetActivePanel === 'pocket' ? 2 : 0;
  }, [sheetActivePanel, activePanelSV]);

  const stripsRowAnimStyle = useAnimatedStyle(() => {
    const m = sheetExpandedSV.value;
    return {
      flexDirection: m > 0.5 ? ('row' as const) : ('column' as const),
      gap: interpolate(m, [0, 1], [0, EXPANDED_STRIP_INNER_GAP]),
      paddingHorizontal: SIDE_MARGIN,
      marginBottom: interpolate(m, [0, 1], [0, 7]),
    };
  });

  const budgetCardMarginStyle = useAnimatedStyle(() => {
    const m = sheetExpandedSV.value;
    return {
      marginBottom: interpolate(m, [0, 1], [8, 0]),
      flex: m > 0.5 ? 1 : 0,
      minWidth: m > 0.5 ? 0 : 0,
    };
  });

  const pocketCardMarginStyle = useAnimatedStyle(() => {
    const m = sheetExpandedSV.value;
    return {
      marginBottom: interpolate(m, [0, 1], [14, 0]),
      flex: m > 0.5 ? 1 : 0,
      minWidth: m > 0.5 ? 0 : 0,
    };
  });

  /** Pocket split block: inset from strip header (~4% of window height). */
  const pocketPanelTopPadPx = Math.round(screenHeight * 0.04);
  /** Less space below Auto/Done than the old fixed 46 — subtract ~3% window height, keep a sensible minimum. */
  const pocketPanelBottomPadPx = Math.max(14, Math.round(46 - screenHeight * 0.03));
  /** Space above Auto/Manual + Done row (~1% window height). */
  const pocketPanelAutoDoneOffsetPx = Math.round(screenHeight * 0.01);
  /** Open pocket strip: original 188 + top inset delta − bottom padding saved + Auto/Done offset. */
  const pocketPanelOpenStripHeight =
    188 +
    Math.max(0, pocketPanelTopPadPx - 4) -
    Math.max(0, 46 - pocketPanelBottomPadPx) +
    pocketPanelAutoDoneOffsetPx;

  const pocketOpenHeightShared = useSharedValue(pocketPanelOpenStripHeight);
  useEffect(() => {
    pocketOpenHeightShared.value = pocketPanelOpenStripHeight;
  }, [pocketPanelOpenStripHeight, pocketOpenHeightShared]);

  useAnimatedReaction(
    () => ({
      p: activePanelSV.value,
      m: sheetExpandedSV.value,
      ph: pocketOpenHeightShared.value,
    }),
    (curr, prev) => {
      'worklet';
      const budgetTarget =
        curr.p === 1 ? 155 : curr.p === 2 ? 48 : 48 + (STRIP_ROW_EXP_H - 48) * curr.m;
      const pocketTarget =
        curr.p === 2 ? curr.ph : curr.p === 1 ? 44 : 44 + (STRIP_ROW_EXP_H - 44) * curr.m;
      const panelChanged = prev === undefined || prev === null || curr.p !== prev.p;
      const pocketHChanged =
        prev !== undefined && prev !== null && curr.ph !== prev.ph;
      if (panelChanged) {
        budgetStripHeightSV.value = withSpring(budgetTarget, STRIP_SPRING);
        pocketStripHeightSV.value = withSpring(pocketTarget, STRIP_SPRING);
        return;
      }
      if (curr.p === 2 && pocketHChanged) {
        pocketStripHeightSV.value = withSpring(pocketTarget, STRIP_SPRING);
        return;
      }
      if (curr.p === 0) {
        budgetStripHeightSV.value = budgetTarget;
        pocketStripHeightSV.value = pocketTarget;
      }
    },
  );

  const budgetAnimStyle = useAnimatedStyle(() => ({
    height: budgetStripHeightSV.value,
    overflow: 'hidden' as const,
  }));

  const pocketAnimStyle = useAnimatedStyle(() => ({
    height: pocketStripHeightSV.value,
    overflow: 'hidden' as const,
  }));

  const budgetCollapsedInnerStyle = useAnimatedStyle(() => ({
    ...StyleSheet.absoluteFillObject,
    opacity: interpolate(sheetExpandedSV.value, [0, 0.38, 0.58], [1, 0.35, 0], Extrapolation.CLAMP),
  }));

  const budgetExpandedInnerStyle = useAnimatedStyle(() => ({
    ...StyleSheet.absoluteFillObject,
    opacity: interpolate(sheetExpandedSV.value, [0.22, 0.45, 0.7], [0, 0.4, 1], Extrapolation.CLAMP),
  }));

  const pocketCollapsedInnerStyle = useAnimatedStyle(() => ({
    ...StyleSheet.absoluteFillObject,
    opacity: interpolate(sheetExpandedSV.value, [0, 0.38, 0.58], [1, 0.35, 0], Extrapolation.CLAMP),
  }));

  const pocketExpandedInnerStyle = useAnimatedStyle(() => ({
    ...StyleSheet.absoluteFillObject,
    opacity: interpolate(sheetExpandedSV.value, [0.22, 0.45, 0.7], [0, 0.4, 1], Extrapolation.CLAMP),
  }));

  const stripCardBorderStyle = useAnimatedStyle(() => ({
    borderRadius: interpolate(sheetExpandedSV.value, [0, 1], [14, 12]),
  }));

  /** Gap between strip row and Recent Activity when sheet is expanded (2% of window height at full expand). */
  const recentActivityExpandTopGapPx = Math.round(SCREEN_HEIGHT * 0.02);
  const recentActivityTopGapStyle = useAnimatedStyle(
    () => ({
      marginTop: interpolate(sheetExpandedSV.value, [0, 1], [0, recentActivityExpandTopGapPx]),
    }),
    [recentActivityExpandTopGapPx],
  );

  const confirmedIncome = Math.max(confirmedIncomeForBudget, totalIncome);

  useEffect(() => {
    if (sheetActivePanel !== 'budget') return;
    console.log('confirmedIncome:', confirmedIncome);
    console.log('allocationPct:', localAllocationPct);
    console.log('activeDailyBudget:', activeDailyBudget);
    console.log('dailySpent:', dailySpent);
  }, [sheetActivePanel, confirmedIncome, localAllocationPct, activeDailyBudget, dailySpent]);

  useEffect(() => {
    if (sheetActivePanel === 'budget') return;
    const savedPct = Math.max(1, Math.min(50, Math.round(monthlyAllocationPercent || 10)));
    const pool = Math.floor((confirmedIncome || 0) * (savedPct / 100));
    setLocalAllocationPct(savedPct);
    setPreviewPool(pool);
    setPreviewDaily(Math.floor(pool / 30));
  }, [sheetActivePanel, monthlyAllocationPercent, confirmedIncome]);

  const handleBudgetDone = useCallback(async () => {
    const pct = Math.max(1, Math.min(50, Math.round(localAllocationPct || 10)));
    const pool = Math.floor((confirmedIncome || 0) * (pct / 100));
    const daily = Math.floor(pool / 30);
    setLocalAllocationPct(pct);
    setPreviewPool(pool);
    setPreviewDaily(daily);
    setMonthlyAllocationPercent(pct);
    setCustomDailyLimit(daily);
    await updateUserSettingsFirestoreRecord({
      allocationPct: pct,
      monthlyPool: pool,
      activeDailyBudget: daily,
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSheetActivePanel(null);
  }, [
    localAllocationPct,
    confirmedIncome,
    setMonthlyAllocationPercent,
    setCustomDailyLimit,
  ]);

  const openBudget = useCallback(() => {
    setSheetActivePanel(prev => {
      if (prev === 'budget') return null;
      const savedPct = Math.max(1, Math.min(50, Math.round(monthlyAllocationPercent || 10)));
      const pool = Math.floor((confirmedIncome || 0) * (savedPct / 100));
      const daily = Math.floor(pool / 30);
      setLocalAllocationPct(savedPct);
      setPreviewPool(pool);
      setPreviewDaily(daily);
      return 'budget';
    });
  }, [monthlyAllocationPercent, confirmedIncome]);
  const openPocket = useCallback(() => {
    setPocketSplitDraft(snapPocketSplit(pocketSplitPct));
    setSheetActivePanel(p => (p === 'pocket' ? null : 'pocket'));
  }, [pocketSplitPct]);
  const closeAll = useCallback(() => {
    setSheetActivePanel(null);
  }, []);

  const greetingSub = useMemo(() => {
    const h = currentTime.getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, [currentTime]);

  const footerPillBottomOffset = insets.bottom + FOOTER_PILL_ABOVE_HOME;
  const tabBarHeight = footerPillBottomOffset + FOOTER_NAV_OUTER_H + FOOTER_SCROLL_CLEARANCE;

  const navigateRoot = useCallback(
    (screen: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const collapseWealthBar = () => {
        swapAnim.value = 0;
        setNavLevel(1);
      };
      if (screen === 'Home') {
        collapseWealthBar();
        setActiveNav('home');
        setActiveRootTab('Home');
      } else if (screen === 'Spend') {
        collapseWealthBar();
        setActiveNav('spend');
        setActiveRootTab('Home');
      } else if (screen === 'IE' || screen === 'IncomeEngine') {
        collapseWealthBar();
        setActiveNav('incomeEngine');
        setActiveRootTab('IncomeEngine');
      } else if (screen === 'Wealth') {
        setActiveNav('wealth');
        setActiveRootTab('Wealth');
      } else if (screen === 'More') {
        collapseWealthBar();
        setActiveNav('more');
        setActiveRootTab('More');
      } else if (screen === 'Profile' || screen === 'Settings' || screen === 'Support') {
        collapseWealthBar();
        setActiveNav('more');
        setActiveRootTab('More');
      }
    },
    [swapAnim],
  );

  const closeWealth = useCallback(() => {
    swapAnim.value = withTiming(0, { duration: 200, easing: BAR_CROSSFADE_EASING });
    navigateRoot('Home');
    setTimeout(() => {
      setNavLevel(1);
    }, 200);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [navigateRoot, swapAnim]);

  const openWealth = useCallback(() => {
    swapAnim.value = withTiming(1, { duration: BAR_CROSSFADE_MS, easing: BAR_CROSSFADE_EASING });
    setNavLevel(2);
    setActiveWealthTab('Investment');
    setWealthSubRoute('investment');
    navigateRoot('Wealth');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [navigateRoot, swapAnim]);

  const onWealthSubTabPress = useCallback((route: WealthSubRoute, name: WealthBarTabName) => {
    setActiveWealthTab(name);
    setWealthSubRoute(route);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const handleL1TabPress = useCallback(
    (tab: (typeof L1_TABS)[number]['name']) => {
      if (tab === 'Wealth') {
        /** Always use L2 (Investment / Insurance / Loans) — previously IE→Wealth left nav at L1 until refresh. */
        openWealth();
        return;
      }
      if (tab === 'More') {
        navigateRoot('More');
        return;
      }
      if (tab === 'Home') navigateRoot('Home');
      else if (tab === 'Spend') navigateRoot('Spend');
      else if (tab === 'IE') navigateRoot('IE');
    },
    [navigateRoot, openWealth],
  );

  const footerActiveName =
    navLevel === 2
      ? 'Wealth'
      : activeNav === 'home'
        ? 'Home'
        : activeNav === 'spend'
          ? 'Spend'
          : activeNav === 'incomeEngine'
            ? 'IE'
            : activeNav === 'wealth'
              ? 'Wealth'
              : activeNav === 'more'
                ? 'More'
                : 'Home';

  const sheetBottomPad = Platform.OS === 'ios' ? 34 : 20;
  const catCols = 4;
  const catGap = 10;
  const catPillW =
    (screenWidth - WHITE_PAD * 2 - catGap * (catCols - 1)) / catCols;

  const expenseModalContent = (
    <>
      <View style={s.expModalHeaderRow}>
        <Text style={s.expModalBrand}>W E A L T H  O S</Text>
        <View style={s.expModalHeaderRight}>
          <Text style={s.expModalScreenTitle}>Log Expense</Text>
          <TouchableOpacity
            style={s.expModalCloseBtn}
            onPress={() => setIsExpenseModalVisible(false)}
            activeOpacity={0.85}
            accessibilityLabel="Close"
          >
            <Text style={s.expModalCloseIcon}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text
        style={[s.expModalAmountDisplay, expenseAmount === '0' && s.expModalAmountDisplayMuted]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        ₹{expenseAmount}
      </Text>
      <View style={s.expModalAmountPill}>
        <Text style={s.expModalAmountPillTxt}>INPUT AMOUNT</Text>
      </View>

      <TextInput
        style={s.expModalNoteLight}
        placeholder="What was this for?"
        placeholderTextColor={EXP_MODAL_PLACEHOLDER}
        value={expenseNote}
        onChangeText={setExpenseNote}
        returnKeyType="done"
      />

      <View style={s.expModalCatGrid}>
        {EXPENSE_MODAL_CATEGORIES.map(cat => {
          const active = selectedCategory === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              activeOpacity={0.85}
              style={[s.expModalCatTag, { width: catPillW }, active && s.expModalCatTagActive]}
              onPress={() => setSelectedCategory(cat.id)}
            >
              <Text style={s.expModalCatTagIcon}>{cat.icon}</Text>
              <Text style={s.expModalCatTagLabel}>{cat.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.expModalRecurringCard}>
        <View style={s.expModalRecurringCopy}>
          <Text style={s.expModalRecurringTitle}>Mark as Fixed / Recurring</Text>
          <Text style={s.expModalRecurringSub}>
            Fixed bills do not affect your daily Shield Ring
          </Text>
        </View>
        <Switch
          value={isRecurring}
          onValueChange={setIsRecurring}
          trackColor={{ false: '#D1D5DB', true: EXP_MODAL_VIOLET }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="#D1D5DB"
        />
      </View>

      <TouchableOpacity
        style={[
          s.expModalLogBtn,
          logExpenseDisabled ? s.expModalLogBtnDisabled : s.expModalLogBtnActive,
        ]}
        onPress={submitExpense}
        activeOpacity={0.88}
        disabled={logExpenseDisabled}
      >
        <Text style={[s.expModalLogBtnTxt, logExpenseDisabled && s.expModalLogBtnTxtDisabled]}>
          LOG EXPENSE
        </Text>
      </TouchableOpacity>

      <View style={[s.expModalKeypadLight, { paddingBottom: sheetBottomPad }]}>
        {KEYPAD_ROWS.map((row, ri) => (
          <View key={ri} style={s.expModalKeypadRow}>
            {row.map(key => (
              <TouchableOpacity
                key={key}
                style={s.expModalKeyBare}
                onPress={() => handleKeypadPress(key)}
                activeOpacity={0.35}
              >
                <Text style={s.expModalKeyBareTxt}>{key === '<' ? '⌫' : key}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </>
  );

  const footerLevitatingShellBase = {
    position: 'absolute' as const,
    left: FOOTER_PILL_H_INSET,
    right: FOOTER_PILL_H_INSET,
    bottom: footerPillBottomOffset,
    minHeight: FOOTER_NAV_OUTER_H,
    borderRadius: FOOTER_NAV_OUTER_R,
    overflow: 'hidden' as const,
    zIndex: 1000,
    elevation: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 } as const,
    shadowOpacity: 0.22,
    shadowRadius: 28,
    /** Glass pill rim — slightly cool gray so it reads on white sheets and dark Wealth screens. */
    borderWidth: 1.5,
    borderColor: 'rgba(120, 125, 160, 0.38)',
  };

  const footerL1SlotStyle = {
    position: 'absolute' as const,
    top: FOOTER_NAV_NEST_GUTTER,
    left: FOOTER_NAV_NEST_GUTTER,
    right: FOOTER_NAV_NEST_GUTTER,
    bottom: FOOTER_NAV_NEST_GUTTER,
    flexDirection: 'row' as const,
  };

  const footerL2SlotStyle = {
    ...footerL1SlotStyle,
    alignItems: 'center' as const,
  };

  const footerPillNavInner = (
    <>
      <Reanimated.View pointerEvents={navLevel === 1 ? 'auto' : 'none'} style={[footerL1SlotStyle, l1BarCrossStyle]}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {L1_TABS.map(tab => {
            const isActive = footerActiveName === tab.name;
            return (
              <TouchableOpacity
                key={tab.name}
                onPress={() => handleL1TabPress(tab.name)}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                activeOpacity={0.85}
              >
                {isActive ? (
                  <View style={[FOOTER_GLASS_ACTIVE_PILL, { gap: 6, paddingHorizontal: 14 }]}>
                    <View pointerEvents="none" style={FOOTER_GLASS_ACTIVE_SHEEN} />
                    <Ionicons name={tab.icon} size={18} color={tab.accent} style={{ zIndex: 1 }} />
                    <Text
                      style={{
                        zIndex: 1,
                        fontSize: 11,
                        fontWeight: '700',
                        color: tab.accent,
                        fontFamily: FONT_UI as string,
                      }}
                      numberOfLines={1}
                    >
                      {tab.name}
                    </Text>
                  </View>
                ) : (
                  <View
                    style={{
                      width: FOOTER_NAV_INNER_PILL_H,
                      height: FOOTER_NAV_INNER_PILL_H,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name={tab.iconOutline} size={22} color={FOOTER_NAV_ICON_MUTED} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </Reanimated.View>
      <Reanimated.View pointerEvents={navLevel === 2 ? 'auto' : 'none'} style={[footerL2SlotStyle, l2BarCrossStyle]}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={closeWealth}
            accessibilityRole="button"
            accessibilityLabel="Back to home"
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            style={{ paddingVertical: 6, paddingHorizontal: 6, marginRight: 2 }}
            activeOpacity={0.78}
          >
            <View style={FOOTER_GLASS_BACK_CHIP}>
              <Ionicons name="chevron-back-outline" size={21} color={FOOTER_NAV_ICON_MUTED} />
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
            {WEALTH_BAR_TABS.map(tab => {
              const isW = activeWealthTab === tab.name;
              const c = tab.color;
              return (
                <TouchableOpacity
                  key={tab.name}
                  onPress={() => onWealthSubTabPress(tab.route, tab.name)}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                  activeOpacity={0.85}
                >
                  {isW ? (
                    <View style={[FOOTER_GLASS_ACTIVE_PILL, { gap: 4, paddingHorizontal: 8, maxWidth: '100%' }]}>
                      <View pointerEvents="none" style={FOOTER_GLASS_ACTIVE_SHEEN} />
                      <Ionicons name={tab.icon} size={16} color={c} style={{ zIndex: 1 }} />
                      <Text
                        style={{
                          zIndex: 1,
                          fontSize: 9,
                          fontWeight: '700',
                          color: c,
                          fontFamily: FONT_UI as string,
                          flexShrink: 1,
                        }}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                      >
                        {tab.name}
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={{
                        width: FOOTER_NAV_INNER_PILL_H,
                        height: FOOTER_NAV_INNER_PILL_H,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name={tab.iconOutline} size={20} color={FOOTER_NAV_ICON_MUTED} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Reanimated.View>
    </>
  );

  return (
    <SafeAreaView
      ref={rootRef}
      style={s.mainContainer}
      edges={['top']}
      onTouchStart={handleUserActivity}
    >
      <StatusBar barStyle="light-content" backgroundColor="#1A1A2E" />

      <View style={{ flex: 1, backgroundColor: '#1A1A2E' }}>
        <View
          style={{
            height: NAVY_HEIGHT,
            backgroundColor: '#1A1A2E',
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingBottom: 0,
            overflow: 'hidden',
            zIndex: 2,
          }}
          {...headerRefreshPan.panHandlers}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingTop: 8,
              height: 52,
              width: '100%',
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: 'rgba(255,255,255,0.15)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 16, color: '#FFFFFF', fontWeight: 'bold' }}>M</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: 'bold',
                  color: '#FFFFFF',
                  fontFamily: FONT_UI as string,
                }}
              >
                Hi, Welcome Back
              </Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>{greetingSub}</Text>
            </View>
            <TouchableOpacity
              style={{
                width: 36,
                height: 36,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              activeOpacity={0.75}
            >
              <Text style={{ fontSize: 20 }}>🔔</Text>
              <View
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: '#38A169',
                }}
              />
            </TouchableOpacity>
          </View>

          <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
            <View ref={heroRingsRef} collapsable={false} style={{ width: 180, height: 180 }}>
              <HeroRings
                score={heroOvrScore}
                shieldCircumference={shieldCircumference}
                shieldOffset={shieldOffset}
                shieldColor={shieldColor}
                trackCircumference={trackCircumference}
                trackOffset={trackOffset}
                trackColor={trackColor}
                pocketCircumference={pocketCircumference}
                pocketOffset={pocketOffset}
                pocketColor={buildColor}
                isLocked={!isIncomeConfirmed}
              />
            </View>
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-around',
              alignItems: 'center',
              width: '100%',
              paddingHorizontal: 24,
              marginTop: 8,
              marginBottom: 8,
            }}
          >
            <View style={{ alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.45)',
                  textTransform: 'uppercase',
                  letterSpacing: 1.2,
                  fontFamily: FONT_UI as string,
                  marginBottom: 3,
                }}
              >
                SHIELD
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: FONT_MONO as string,
                  fontWeight: '700',
                  color: isIncomeConfirmed ? '#FF3B5C' : '#555555',
                }}
              >
                {isIncomeConfirmed
                  ? `₹${Math.round(dailySpent)}/${Math.round(activeDailyBudget)}`
                  : '₹0 / –'}
              </Text>
            </View>
            <View style={{ width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.1)' }} />
            <View style={{ alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.45)',
                  textTransform: 'uppercase',
                  letterSpacing: 1.2,
                  fontFamily: FONT_UI as string,
                  marginBottom: 3,
                }}
              >
                TRACK
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: FONT_MONO as string,
                  fontWeight: '700',
                  color: isIncomeConfirmed ? '#00B4FF' : '#555555',
                }}
              >
                {isIncomeConfirmed
                  ? `${Math.round(trackPercentage * 100)}% · Lv${trackLevel}`
                  : '–% · Lv4'}
              </Text>
            </View>
            <View style={{ width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.1)' }} />
            <View style={{ alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.45)',
                  textTransform: 'uppercase',
                  letterSpacing: 1.2,
                  fontFamily: FONT_UI as string,
                  marginBottom: 3,
                }}
              >
                POCKET
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: FONT_MONO as string,
                  fontWeight: '700',
                  color: isIncomeConfirmed ? '#FFAA00' : '#555555',
                }}
              >
                {isIncomeConfirmed
                  ? `₹${Math.round(vaultSummary.pocketedToday)}/${Math.round(pocketGoal)}`
                  : '₹0 / 0'}
              </Text>
            </View>
          </View>
        </View>

        <Animated.View
          {...homeSheetPan.panHandlers}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            top: homeSheetTop,
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            overflow: 'hidden',
            zIndex: 5,
          }}
        >
          <View style={{ flex: 1, position: 'relative' }}>
          <Reanimated.View
            pointerEvents="box-none"
            style={[
              {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                width: '100%',
                zIndex: 10,
                backgroundColor: '#FFFFFF',
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: '#F0F0F8',
              },
              compactStripHeaderStyle,
            ]}
          >
            <View
              style={{
                width: '100%',
                flexDirection: 'row',
                flexWrap: 'nowrap',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingTop: 11,
                paddingBottom: 11,
                gap: 10,
              }}
            >
            <TouchableOpacity
              onPress={openBudget}
              activeOpacity={0.88}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 68,
                backgroundColor: '#1E1E3A',
                borderRadius: 14,
                paddingTop: 9,
                paddingBottom: 14,
                paddingHorizontal: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: 'rgba(45,212,191,0.18)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="heart" size={18} color="#2DD4BF" />
              </View>
              <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                <Text
                  style={{
                    fontSize: 9,
                    color: 'rgba(255,255,255,0.45)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    fontFamily: FONT_UI as string,
                    includeFontPadding: false,
                  }}
                  numberOfLines={1}
                >
                  DAILY BUDGET
                </Text>
                {effectiveDailyBudget > 0 ? (
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: FONT_MONO as string,
                      fontWeight: '700',
                      color: '#FFFFFF',
                      marginTop: 3,
                      includeFontPadding: false,
                    }}
                    numberOfLines={1}
                  >
                    ₹{Math.round(effectiveDailySpent)}
                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: '500' }}>
                      /{Math.round(effectiveDailyBudget)}
                    </Text>
                  </Text>
                ) : (
                  <Text
                    style={{
                      fontSize: 11,
                      fontFamily: FONT_UI as string,
                      fontWeight: '600',
                      color: 'rgba(255,255,255,0.38)',
                      marginTop: 4,
                      includeFontPadding: false,
                    }}
                  >
                    Set income first
                  </Text>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openPocket}
              activeOpacity={0.88}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 72,
                backgroundColor: '#1E1E3A',
                borderRadius: 14,
                paddingTop: 9,
                paddingBottom: 15,
                paddingHorizontal: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                borderWidth: 1,
                borderColor: 'rgba(255,170,0,0.2)',
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: 'rgba(255,170,0,0.18)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="wallet-outline" size={18} color="#FFAA00" />
              </View>
              <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                <Text
                  style={{
                    fontSize: 9,
                    color: 'rgba(255,255,255,0.45)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    fontFamily: FONT_UI as string,
                    includeFontPadding: false,
                  }}
                  numberOfLines={1}
                >
                  POCKET
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: FONT_MONO as string,
                    fontWeight: '700',
                    color: '#FFFFFF',
                    marginTop: 3,
                    includeFontPadding: false,
                  }}
                  numberOfLines={1}
                >
                  ₹{Math.round(pocketAvailable)}
                </Text>
              </View>
            </TouchableOpacity>
            </View>
          </Reanimated.View>

          <Reanimated.ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingTop: 8,
              paddingBottom: tabBarHeight + 16,
            }}
            scrollEventThrottle={16}
            onScroll={whiteCardScrollHandler}
            bounces
            scrollEnabled
            alwaysBounceVertical
            overScrollMode="always"
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={handleRefreshReset} />
            }
          >
            <View style={{ width: '100%', paddingTop: 6, paddingBottom: 6 }}>
              <View style={{ alignItems: 'center' }}>
                <View
                  style={{
                    width: 40,
                    height: 4,
                    backgroundColor: '#E4E2F5',
                    borderRadius: 2,
                  }}
                />
              </View>
            </View>
            {insight && (
              <TouchableOpacity
                onPress={() => insight.action && navigateRoot(insight.action)}
                activeOpacity={0.75}
                style={{
                  marginHorizontal: SIDE_MARGIN,
                  marginBottom: 10,
                  backgroundColor: insight.bg,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: insight.border,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 14, marginRight: 8 }}>{insight.icon}</Text>
                <Text
                  style={{
                    flex: 1,
                    fontSize: 13,
                    color: insight.color,
                    fontFamily: FONT_UI as string,
                    fontWeight: '500',
                  }}
                  numberOfLines={1}
                >
                  {insight.text}
                </Text>
                {insight.action ? (
                  <Text style={{ fontSize: 16, color: insight.color, opacity: 0.6, marginLeft: 6 }}>›</Text>
                ) : null}
              </TouchableOpacity>
            )}

            <Reanimated.View style={originalStripsOpacityStyle}>
            <Reanimated.View style={stripsRowAnimStyle}>
            <Reanimated.View
              style={[
                {
                  backgroundColor: '#1E1E3A',
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.08)',
                },
                stripCardBorderStyle,
                budgetCardMarginStyle,
                budgetAnimStyle,
              ]}
            >
              <View style={{ flex: 1, position: 'relative' }}>
                <Reanimated.View
                  style={budgetCollapsedInnerStyle}
                  pointerEvents={stripsInStackedLayout ? 'box-none' : 'none'}
                >
                  <TouchableOpacity
                    onPress={openBudget}
                    disabled={!stripsInStackedLayout}
                    activeOpacity={stripsInStackedLayout ? 0.88 : 1}
                    style={{
                      height: 46,
                      paddingHorizontal: 13,
                      paddingVertical: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View style={{ flex: 1, marginRight: 11 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          marginBottom: 5,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            color: 'rgba(255,255,255,0.45)',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                          }}
                        >
                          DAILY BUDGET
                        </Text>
                        <Text style={{ fontSize: 12, fontFamily: FONT_MONO as string, fontWeight: '600', color: '#FFFFFF' }}>
                          ₹{Math.round(dailySpent)}
                          <Text style={{ color: 'rgba(255,255,255,0.4)' }}>/{Math.round(activeDailyBudget)}</Text>
                        </Text>
                      </View>
                      <View
                        style={{
                          height: 4,
                          backgroundColor: 'rgba(255,255,255,0.1)',
                          borderRadius: 2,
                          overflow: 'hidden',
                        }}
                      >
                        <View
                          style={{
                            height: 4,
                            borderRadius: 2,
                            width: `${Math.min((dailySpent / Math.max(activeDailyBudget, 1)) * 100, 100)}%`,
                            backgroundColor: '#FF3B5C',
                          }}
                        />
                      </View>
                    </View>
                  </TouchableOpacity>
                </Reanimated.View>
                <Reanimated.View style={budgetExpandedInnerStyle} pointerEvents="none">
                  <View
                    style={{
                      flex: 1,
                      justifyContent: 'center',
                      paddingHorizontal: EXPANDED_STRIP_PAD_X,
                      paddingVertical: 4,
                      flexDirection: 'column',
                      alignItems: 'stretch',
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: EXPANDED_STRIP_INNER_GAP,
                        width: '100%',
                      }}
                    >
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          backgroundColor: 'rgba(45,212,191,0.18)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name="heart" size={16} color="#2DD4BF" />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                        <Text
                          style={{
                            fontSize: 8,
                            color: 'rgba(255,255,255,0.45)',
                            textTransform: 'uppercase',
                            letterSpacing: 0.9,
                            fontFamily: FONT_UI as string,
                            includeFontPadding: false,
                          }}
                          numberOfLines={1}
                        >
                          DAILY BUDGET
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            fontFamily: FONT_MONO as string,
                            fontWeight: '700',
                            color: '#FFFFFF',
                            marginTop: 2,
                            includeFontPadding: false,
                          }}
                          numberOfLines={1}
                        >
                          ₹{Math.round(dailySpent)}
                          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: '500' }}>
                            /{Math.round(activeDailyBudget)}
                          </Text>
                        </Text>
                      </View>
                    </View>
                  </View>
                </Reanimated.View>
              </View>

              {sheetActivePanel === 'budget' && stripsInStackedLayout && (
                <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        color: 'rgba(255,255,255,0.45)',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                      }}
                    >
                      DAILY ALLOCATION
                    </Text>
                    <Text
                      style={{
                        fontSize: 14,
                        fontFamily: FONT_MONO as string,
                        fontWeight: '700',
                        color: '#6C63FF',
                      }}
                    >
                      ₹{Math.round(previewDaily || 0).toLocaleString('en-IN')}/day
                    </Text>
                  </View>

                  {!confirmedIncome || confirmedIncome === 0 ? (
                    <Text
                      style={{
                        fontSize: 12,
                        color: 'rgba(255,255,255,0.5)',
                        textAlign: 'center',
                        marginVertical: 12,
                      }}
                    >
                      Confirm your income first to set your daily budget
                    </Text>
                  ) : (
                    <>
                      <View
                        onStartShouldSetResponder={() => true}
                        onTouchStart={e => e.stopPropagation()}
                      >
                        <Slider
                          style={{ width: '100%', height: 40 }}
                          minimumValue={1}
                          maximumValue={50}
                          step={1}
                          value={localAllocationPct}
                          onValueChange={val => {
                            const v = Math.round(val);
                            const pool = Math.floor((confirmedIncome || 0) * (v / 100));
                            setLocalAllocationPct(v);
                            setPreviewDaily(Math.floor(pool / 30));
                            setPreviewPool(pool);
                          }}
                          onSlidingComplete={val => {
                            setLocalAllocationPct(Math.round(val));
                          }}
                          minimumTrackTintColor="#6C63FF"
                          maximumTrackTintColor="rgba(255,255,255,0.15)"
                          thumbTintColor="#6C63FF"
                          tapToSeek
                        />
                      </View>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: 4,
                        }}
                      >
                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', flex: 1 }}>
                          {Math.round(localAllocationPct || 10)}% · ₹
                          {Math.round(previewPool || 0).toLocaleString('en-IN')}/mo
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            void handleBudgetDone();
                          }}
                          style={{
                            borderWidth: 1.5,
                            borderColor: '#6C63FF',
                            borderRadius: 20,
                            paddingHorizontal: 20,
                            paddingVertical: 6,
                            marginLeft: 12,
                          }}
                        >
                          <Text style={{ color: '#6C63FF', fontSize: 12, fontWeight: '600' }}>Done</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              )}
            </Reanimated.View>

            <Reanimated.View
              style={[
                {
                  backgroundColor: '#1E1E3A',
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: 'rgba(255,170,0,0.15)',
                },
                stripCardBorderStyle,
                pocketCardMarginStyle,
                pocketAnimStyle,
              ]}
            >
              <View style={{ flex: 1, position: 'relative' }}>
                <Reanimated.View
                  style={pocketCollapsedInnerStyle}
                  pointerEvents={stripsInStackedLayout ? 'box-none' : 'none'}
                >
                  <View
                    style={{
                      height: 44,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 14,
                    }}
                  >
                    <TouchableOpacity
                      onPress={openPocket}
                      activeOpacity={0.88}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        flex: 1,
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>💛</Text>
                      <Text
                        style={{
                          fontSize: 10,
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                          color: 'rgba(255,255,255,0.45)',
                        }}
                      >
                        POCKET
                      </Text>
                      <Text style={{ fontSize: 13, fontFamily: FONT_MONO as string, fontWeight: '600', color: '#FFAA00' }}>
                        ₹{Math.round(pocketAvailable)}
                      </Text>
                    </TouchableOpacity>
                    <Reanimated.View style={pocketButtonAnimStyle}>
                      <TouchableOpacity
                        onPressIn={handlePocketPressIn}
                        onPressOut={handlePocketPressOut}
                        activeOpacity={0.8}
                        delayPressIn={0}
                      >
                        <View
                          ref={sweepPillRef}
                          collapsable={false}
                          style={{
                            backgroundColor: '#FFAA00',
                            borderRadius: 20,
                            paddingHorizontal: 14,
                            paddingVertical: 7,
                            shadowColor: '#FFAA00',
                            shadowRadius: 8,
                            shadowOpacity: 0.4,
                            shadowOffset: { width: 0, height: 0 },
                            elevation: 4,
                          }}
                        >
                          <Text
                            style={{
                              color: '#1A1A2E',
                              fontSize: 11,
                              fontWeight: '700',
                              letterSpacing: 0.5,
                            }}
                          >
                            Pocket Now
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </Reanimated.View>
                  </View>
                </Reanimated.View>
                <Reanimated.View style={pocketExpandedInnerStyle} pointerEvents="none">
                  <View
                    style={{
                      flex: 1,
                      justifyContent: 'center',
                      paddingHorizontal: EXPANDED_STRIP_PAD_X,
                      paddingVertical: 4,
                      flexDirection: 'column',
                      alignItems: 'stretch',
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: EXPANDED_STRIP_INNER_GAP,
                        width: '100%',
                      }}
                    >
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          backgroundColor: 'rgba(255,170,0,0.18)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name="wallet-outline" size={16} color="#FFAA00" />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                        <Text
                          style={{
                            fontSize: 8,
                            textTransform: 'uppercase',
                            letterSpacing: 0.9,
                            color: 'rgba(255,255,255,0.45)',
                            fontFamily: FONT_UI as string,
                            includeFontPadding: false,
                          }}
                          numberOfLines={1}
                        >
                          POCKET
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            fontFamily: FONT_MONO as string,
                            fontWeight: '700',
                            color: '#FFFFFF',
                            marginTop: 2,
                            includeFontPadding: false,
                          }}
                          numberOfLines={1}
                        >
                          ₹{Math.round(pocketAvailable)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </Reanimated.View>
              </View>

              {sheetActivePanel === 'pocket' && stripsInStackedLayout && (
                <View
                  style={{
                    paddingHorizontal: 14,
                    paddingTop: pocketPanelTopPadPx,
                    paddingBottom: pocketPanelBottomPadPx,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text
                      style={{
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.45)',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                      }}
                    >
                      POCKET SPLIT
                    </Text>
                    <Text style={{ fontSize: 13, fontFamily: FONT_MONO as string, fontWeight: '600', color: '#FFAA00' }}>
                      {pocketSplitDraft}%
                    </Text>
                  </View>
                  <View onStartShouldSetResponder={() => true}>
                    <Slider
                      style={{ width: '100%', height: 40 }}
                      minimumValue={10}
                      maximumValue={90}
                      step={5}
                      value={pocketSplitDraft}
                      onValueChange={val => {
                        setPocketSplitDraft(Math.round(val));
                      }}
                      onSlidingComplete={val => {
                        setPocketSplitDraft(Math.round(val));
                      }}
                      minimumTrackTintColor="#FFAA00"
                      maximumTrackTintColor="rgba(255,255,255,0.2)"
                      thumbTintColor="#FFAA00"
                    />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, color: '#38A169' }}>
                      Savings ₹{Math.floor(pocketAvailable * (pocketSplitDraft / 100))}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#3182CE' }}>
                      Future days ₹{Math.floor(pocketAvailable * ((100 - pocketSplitDraft) / 100))}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingBottom: 4,
                      marginTop: pocketPanelAutoDoneOffsetPx,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: localAutoMode ? '#38A169' : 'rgba(255,255,255,0.4)',
                          width: 52,
                        }}
                      >
                        {localAutoMode ? 'Auto' : 'Manual'}
                      </Text>
                      <Switch
                        value={localAutoMode}
                        onValueChange={val => {
                          setLocalAutoMode(val);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        }}
                        trackColor={{
                          false: '#3A3A4A',
                          true: '#38A169',
                        }}
                        thumbColor="#FFFFFF"
                        ios_backgroundColor="#3A3A4A"
                      />
                    </View>
                    <TouchableOpacity
                      onPress={handlePocketDone}
                      style={{
                        borderWidth: 1.5,
                        borderColor: '#FFAA00',
                        borderRadius: 20,
                        paddingHorizontal: 20,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: '#FFAA00', fontSize: 12, fontWeight: '600' }}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </Reanimated.View>
            </Reanimated.View>
            </Reanimated.View>

            <Reanimated.View style={[{ paddingHorizontal: 16, marginBottom: 12 }, recentActivityTopGapStyle]}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: '700',
                    color: '#1A1A2E',
                    fontFamily: FONT_UI as string,
                  }}
                >
                  Recent Activity
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    backgroundColor: '#F0F0F8',
                    borderRadius: 20,
                    padding: 2,
                  }}
                >
                  {(['Daily', 'Weekly', 'Monthly'] as TabKey[]).map(tab => (
                    <TouchableOpacity
                      key={tab}
                      onPress={() => setActivityTabUi(tab)}
                      activeOpacity={0.75}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 18,
                        backgroundColor: activityTabUi === tab ? '#FFFFFF' : 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: activityTabUi === tab ? '600' : '400',
                          color: activityTabUi === tab ? '#1A1A2E' : '#8888AA',
                        }}
                      >
                        {tab}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {txLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <ActivityIndicator size="small" color={PURPLE} />
                </View>
              ) : shownTransactions.length ? (
                shownTransactions.map((tx, i) => {
                  const [timeLine, catLine] = tx.sub.includes(' · ')
                    ? (tx.sub.split(' · ', 2) as [string, string])
                    : [tx.sub, ''];
                  const signed = tx.positive ? tx.amount : -tx.amount;
                  return (
                    <View
                      key={tx.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 10,
                        borderBottomWidth: i < shownTransactions.length - 1 ? 1 : 0,
                        borderBottomColor: '#F5F5F8',
                      }}
                    >
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 12,
                          backgroundColor: '#F0F0F8',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 12,
                        }}
                      >
                        <Text style={{ fontSize: 20 }}>{tx.emoji || '💳'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#1A1A2E' }}>{tx.name}</Text>
                        <Text style={{ fontSize: 11, color: '#8888AA', marginTop: 2 }}>
                          {timeLine} · {catLine}
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: 14,
                          fontFamily: FONT_MONO as string,
                          fontWeight: '600',
                          color: signed > 0 ? '#38A169' : '#1A1A2E',
                        }}
                      >
                        {signed > 0 ? '+' : ''}₹{Math.abs(tx.amount).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  );
                })
              ) : (
                <View style={s.emptyActivityWrap}>
                  <Text style={s.emptyActivityTitle}>No transactions yet</Text>
                  <Text style={s.emptyActivitySub}>Add an expense to see live entries here.</Text>
                </View>
              )}
            </Reanimated.View>
          </Reanimated.ScrollView>
          </View>
        </Animated.View>
      </View>

      <View pointerEvents="none" style={s.coinOverlay}>
        {coinAnims.map(coin => (
          <Animated.View
            key={coin.id}
            style={[
              s.coinShape,
              {
                opacity: coin.opacity,
                transform: [
                  { translateX: coin.x },
                  { translateY: coin.y },
                  { scale: coin.scale },
                ],
              },
            ]}
          >
            <View style={s.coinInner}>
              <View style={s.coinShine} />
            </View>
          </Animated.View>
        ))}
      </View>

      {activeRootTab === 'IncomeEngine' && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 40,
            backgroundColor: '#0A0E17',
          }}
        >
          <IncomeEngineScreen
            onBack={() => {
              setActiveNav('home');
              setActiveRootTab('Home');
            }}
            headerShieldPct={Math.round(shieldPercentage * 100)}
            headerTrackPct={Math.round(trackPercentage * 100)}
            headerBuildPct={Math.round(buildPercentage * 100)}
            headerOvrScore={ovrScore}
          />
        </View>
      )}

      {activeRootTab === 'Home' && activeNav === 'spend' && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 40,
            backgroundColor: '#0A0E17',
          }}
        >
          <SpendingScreen
            tabBarHeight={tabBarHeight}
            activeDailyBudget={activeDailyBudget}
            onBack={() => {
              setActiveNav('home');
              setActiveRootTab('Home');
            }}
            headerShieldPct={Math.round(shieldPercentage * 100)}
            headerTrackPct={Math.round(trackPercentage * 100)}
            headerBuildPct={Math.round(buildPercentage * 100)}
            headerOvrScore={ovrScore}
          />
        </View>
      )}

      {activeRootTab === 'Wealth' && wealthSubRoute === 'investment' && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 40,
            backgroundColor: '#0A0E17',
          }}
        >
          <WealthScreen
            onBack={closeWealth}
            headerShieldPct={Math.round(shieldPercentage * 100)}
            headerTrackPct={Math.round(trackPercentage * 100)}
            headerBuildPct={Math.round(buildPercentage * 100)}
            headerOvrScore={ovrScore}
          />
        </View>
      )}

      {activeRootTab === 'Wealth' && wealthSubRoute === 'insurance' && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 40,
            backgroundColor: '#0A0E17',
          }}
        >
          <WealthInsuranceScreen
            onBack={closeWealth}
            tabBarHeight={tabBarHeight}
            headerShieldPct={Math.round(shieldPercentage * 100)}
            headerTrackPct={Math.round(trackPercentage * 100)}
            headerBuildPct={Math.round(buildPercentage * 100)}
            headerOvrScore={ovrScore}
          />
        </View>
      )}

      {activeRootTab === 'Wealth' && wealthSubRoute === 'loans' && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 40,
            backgroundColor: '#0A0E17',
          }}
        >
          <WealthLoansScreen
            onBack={closeWealth}
            tabBarHeight={tabBarHeight}
            headerShieldPct={Math.round(shieldPercentage * 100)}
            headerTrackPct={Math.round(trackPercentage * 100)}
            headerBuildPct={Math.round(buildPercentage * 100)}
            headerOvrScore={ovrScore}
          />
        </View>
      )}

      {activeRootTab === 'More' && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 40,
            backgroundColor: '#0A0E17',
          }}
        >
          <MoreScreen
            onBack={() => {
              setActiveNav('home');
              setActiveRootTab('Home');
            }}
            headerShieldPct={Math.round(shieldPercentage * 100)}
            headerTrackPct={Math.round(trackPercentage * 100)}
            headerBuildPct={Math.round(buildPercentage * 100)}
            headerOvrScore={ovrScore}
          />
        </View>
      )}

      {/* ── Bottom bar: levitating glass pill, L1 ↔ Wealth L2 ─ */}
      <View style={s.floatingFooter} pointerEvents="box-none">
        {Platform.OS === 'web' ? (
          <View
            style={[
              footerLevitatingShellBase,
              {
                backgroundColor: 'rgba(255,255,255,0.78)',
                borderColor: 'rgba(120, 125, 160, 0.4)',
                borderWidth: 1.5,
              },
            ]}
          >
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                { borderRadius: FOOTER_NAV_OUTER_R, backgroundColor: 'rgba(255,255,255,0.35)' },
              ]}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 1.5,
                left: 1.5,
                right: 1.5,
                bottom: 1.5,
                borderRadius: Math.max(FOOTER_NAV_OUTER_R - 1.5, 8),
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.65)',
              }}
            />
            <View style={{ position: 'relative', minHeight: FOOTER_NAV_OUTER_H }}>{footerPillNavInner}</View>
          </View>
        ) : (
          <View style={footerLevitatingShellBase}>
            <BlurView
              intensity={100}
              tint="light"
              style={[StyleSheet.absoluteFillObject, { borderRadius: FOOTER_NAV_OUTER_R }]}
            />
            <View
              style={[
                StyleSheet.absoluteFillObject,
                { borderRadius: FOOTER_NAV_OUTER_R, backgroundColor: 'rgba(255,255,255,0.18)' },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                { borderRadius: FOOTER_NAV_OUTER_R, backgroundColor: 'rgba(255,255,255,0.1)' },
              ]}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 1.5,
                left: 1.5,
                right: 1.5,
                bottom: 1.5,
                borderRadius: Math.max(FOOTER_NAV_OUTER_R - 1.5, 8),
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.55)',
              }}
            />
            <View style={{ position: 'relative', minHeight: FOOTER_NAV_OUTER_H }}>{footerPillNavInner}</View>
          </View>
        )}
        <Reanimated.View style={footerAnimatedStyle} pointerEvents="box-none">
          {activeRootTab === 'Home' && activeNav === 'home' ? (
            <View
              style={[
                s.fabAbsWrap,
                {
                  bottom: tabBarHeight + 12,
                },
              ]}
              pointerEvents="box-none"
            >
              <TouchableOpacity style={s.fab} onPress={() => setIsExpenseModalVisible(true)} activeOpacity={0.85}>
                <Text style={s.fabIcon}>+</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </Reanimated.View>
      </View>

      <Modal
        visible={isExpenseModalVisible}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
        transparent={Platform.OS === 'android'}
        onRequestClose={() => setIsExpenseModalVisible(false)}
        onDismiss={() => setIsExpenseModalVisible(false)}
        allowSwipeDismissal={Platform.OS === 'ios'}
        statusBarTranslucent={Platform.OS === 'android'}
      >
        {Platform.OS === 'ios' ? (
          <View style={s.expModalSheetIOS}>
            {expenseModalContent}
          </View>
        ) : (
          <View style={s.expModalRoot}>
            <Pressable
              style={s.expModalBackdrop}
              onPress={() => setIsExpenseModalVisible(false)}
            />
            <View style={s.expModalSheetAndroid} {...expenseSheetPan.panHandlers}>
              {expenseModalContent}
            </View>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#1A1A2E' },
  safe: { flex: 1, backgroundColor: '#FFFFFF' },

  // ── Navy section — fixed 40% height, content distributed vertically ──────
  navyHeaderFixed: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // Android can hide absolute children with negative zIndex behind the parent.
    zIndex: 0,
    elevation: 0,
    backgroundColor: D.bg,
    justifyContent: 'flex-start',
  },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20,
  },
  greeting:    { fontSize: 18, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.2 },
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

  heroArea: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'stretch',
    paddingVertical: 8,
  },
  heroSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingVertical: 16,
    transform: [{ translateY: -10 }, { scale: 1.02 }],
  },
  heroRingLeft: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroRingCentered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricListRight: {
    flex: 0,
    paddingLeft: 16,
    justifyContent: 'center',
    gap: 12,
  },
  metricLabelCompact: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  metricValueCompact: {
    marginTop: 1,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: FONT_MONO as string,
  },
  // ── Scroll: transparent spacer + sticky sheet + ledger shell ──────────────
  scrollContentTransparent: {
    flexGrow: 1,
    backgroundColor: 'transparent',
  },
  scrollTopSpacer: {
    backgroundColor: 'transparent',
  },
  stickySheetHeader: {
    paddingHorizontal: WHITE_PAD,
    paddingTop: 12,
    marginBottom: 0,
    paddingBottom: 0,
    overflow: 'hidden',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 34,
    height: SHEET_HANDLE_H,
    borderRadius: 999,
    backgroundColor: '#D9DAE7',
    marginBottom: 0,
  },
  sheetInsightClip: {
    width: '100%',
    overflow: 'hidden',
    paddingHorizontal: 0,
    marginTop: 4,
    marginBottom: 4,
  },
  sheetInsightPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    width: '100%',
    backgroundColor: 'rgba(108, 99, 255, 0.08)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.22)',
  },
  sheetInsightSpark: { fontSize: 14, color: PURPLE },
  sheetInsightText: {
    flex: 1,
    fontSize: 13,
    color: TEXT_PRIMARY,
    fontWeight: '600',
  },
  sheetInsightArrow: { fontSize: 20, color: TEXT_MUTED, fontWeight: '300' },

  expandedPillStrip: {
    position: 'absolute',
    top: EXPANDED_PILLS_TOP,
    left: WHITE_PAD,
    right: WHITE_PAD,
    flexDirection: 'row',
    gap: CARD_GAP,
    zIndex: 20,
    elevation: 20,
  },
  expandedPillCard: {
    flex: 1,
    minHeight: EXPANDED_PILL_ROW_MIN,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  expandedPillCardDark: {
    backgroundColor: '#FFFFFF',
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
    width: '100%',
    minWidth: 0,
  },
  expandedPillAmountStrong: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
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
    top: EXPANDED_ACTIVITY_TOP,
    left: WHITE_PAD,
    right: WHITE_PAD,
    alignItems: 'stretch',
    zIndex: 18,
    elevation: 18,
    marginBottom: 0,
    paddingBottom: 0,
  },
  expandedActivityTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 8,
  },
  expandedTabStrip: {
    flexDirection: 'row',
    backgroundColor: '#EDEDF5',
    borderRadius: 24,
    minHeight: 40,
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 0,
    alignSelf: 'stretch',
    width: '100%',
    alignItems: 'center',
  },
  expandedTab: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: RADIUS_PILL,
  },
  expandedTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  expandedTabTxt: { fontSize: 13, fontWeight: '500', color: TEXT_MUTED },
  expandedTabTxtActive: { color: TEXT_PRIMARY, fontWeight: '600' },

  // ── Recent Activity ───────────────────────────────────────────────────────
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 0,
    marginBottom: 0,
    paddingBottom: 0,
  },
  activityTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    letterSpacing: -0.3,
    flexShrink: 0,
    marginRight: SHEET_SECTION_GAP,
  },

  tabStrip: {
    flexDirection: 'row',
    backgroundColor: '#EDEDF5',
    borderRadius: 24,
    minHeight: 40,
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 0,
    flex: 1,
    minWidth: 0,
    marginLeft: SHEET_SECTION_GAP,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: RADIUS_PILL,
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabTxt:       { fontSize: 12, fontWeight: '500', color: TEXT_MUTED },
  tabTxtActive: { color: TEXT_PRIMARY, fontWeight: '600' },

  txRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  txDivider: { borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
  txIcon:    { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  txEmoji:   { fontSize: 20 },
  txInfo:    { flex: 1, gap: 2 },
  txName:    { fontSize: 14, fontWeight: '700', color: TEXT_PRIMARY },
  txSub:     { fontSize: 11, color: TEXT_MUTED, fontWeight: '500' },
  txAmt:     { fontSize: 14, fontWeight: '800', letterSpacing: -0.3, fontFamily: FONT_MONO as string },
  emptyActivityWrap: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyActivityTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  emptyActivitySub: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '500',
    color: TEXT_MUTED,
  },
  txListShell: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: WHITE_PAD,
    paddingTop: 0,
    marginTop: 0,
    paddingBottom: 16,
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
  footerNavLabelActive: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    maxWidth: 56,
  },

  fabAbsWrap: {
    position: 'absolute',
    right: 16,
    alignItems: 'flex-end',
  },
  fab: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: '#1E88FF', alignItems: 'center', justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#1E88FF', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45, shadowRadius: 16, elevation: 16,
  },
  fabIcon: { fontSize: 28, color: '#FFFFFF', fontWeight: '400', lineHeight: 32, marginTop: -1 },

  coinOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    elevation: 80,
  },
  coinShape: {
    position: 'absolute',
    left: -6,
    top: -6,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#F6C744',
    borderWidth: 1,
    borderColor: '#C99212',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFD86B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinShine: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,245,200,0.9)',
  },

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

  // ── Log expense modal — light theme (Apple-style) ─────────────────────────
  expModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  expModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  expModalSheetIOS: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: 16,
    paddingHorizontal: WHITE_PAD,
  },
  expModalSheetAndroid: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingTop: 16,
    paddingHorizontal: WHITE_PAD,
    maxHeight: '94%',
  },
  expModalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  expModalBrand: {
    fontSize: 10,
    fontWeight: '800',
    color: EXP_MODAL_NAVY,
    letterSpacing: 3.2,
  },
  expModalHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  expModalScreenTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: EXP_MODAL_NAVY,
    letterSpacing: -0.3,
  },
  expModalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: EXP_MODAL_GRAY_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expModalCloseIcon: {
    color: EXP_MODAL_NAVY,
    fontSize: 18,
    fontWeight: '600',
    marginTop: -1,
  },
  expModalAmountDisplay: {
    fontSize: 58,
    fontWeight: '900',
    color: EXP_MODAL_VIOLET,
    letterSpacing: -2,
    fontFamily: FONT_MONO as string,
    textAlign: 'center',
  },
  expModalAmountDisplayMuted: {
    color: '#C4B5FD',
  },
  expModalAmountPill: {
    alignSelf: 'center',
    backgroundColor: EXP_MODAL_GRAY_BG,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginTop: 8,
    marginBottom: 20,
  },
  expModalAmountPillTxt: {
    fontSize: 9,
    fontWeight: '800',
    color: EXP_MODAL_NAVY,
    letterSpacing: 1.4,
  },
  expModalNoteLight: {
    backgroundColor: EXP_MODAL_GRAY_BG,
    borderRadius: 16,
    minHeight: 60,
    padding: 16,
    fontSize: 16,
    fontWeight: '500',
    color: EXP_MODAL_NAVY,
    marginBottom: 18,
  },
  expModalCatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 10,
    marginBottom: 16,
  },
  expModalCatTag: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: EXP_MODAL_BORDER,
  },
  expModalCatTagActive: {
    backgroundColor: EXP_MODAL_ACTIVE_BG,
    borderWidth: 2,
    borderColor: EXP_MODAL_VIOLET,
  },
  expModalCatTagIcon: {
    fontSize: 15,
  },
  expModalCatTagLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: EXP_MODAL_NAVY,
  },
  expModalRecurringCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: EXP_MODAL_GRAY_BG,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  expModalRecurringCopy: {
    flex: 1,
    gap: 4,
  },
  expModalRecurringTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: EXP_MODAL_NAVY,
    letterSpacing: -0.2,
  },
  expModalRecurringSub: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    lineHeight: 16,
  },
  expModalLogBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  expModalLogBtnActive: {
    backgroundColor: EXP_MODAL_VIOLET,
  },
  expModalLogBtnDisabled: {
    backgroundColor: EXP_MODAL_VIOLET,
    opacity: 0.38,
  },
  expModalLogBtnTxt: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#FFFFFF',
  },
  expModalLogBtnTxtDisabled: {
    color: '#FFFFFF',
    opacity: 0.85,
  },
  expModalKeypadLight: {
    marginHorizontal: -WHITE_PAD,
    backgroundColor: EXP_MODAL_KEYPAD,
    paddingTop: 12,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: EXP_MODAL_BORDER,
  },
  expModalKeypadRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  expModalKeyBare: {
    flex: 1,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  expModalKeyBareTxt: {
    fontSize: 26,
    fontWeight: '500',
    color: EXP_MODAL_NAVY,
    fontFamily: FONT_MONO as string,
  },

});
