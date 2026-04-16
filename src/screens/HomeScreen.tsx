/**
 * HomeScreen.tsx
 * Navy hero (fixed) + scroll layer with transparent spacer → sticky white header → ledger.
 *
 * Scroll architecture: index 0 = transparent spacer = navy band height minus curve overlap
 * (30% screen ≈ visible rings on load); index 1 = sticky white sheet (~70% region); index 2 = list.
 * Scroll-driven UI band ≈ 20% screen height.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet,
  StatusBar, TouchableOpacity, Animated, Easing, useWindowDimensions, Dimensions,
  Modal, Pressable, TextInput, Switch, Platform, PanResponder, RefreshControl,
  AppState, type AppStateStatus,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G } from 'react-native-svg';
import { useFinancials } from '../hooks/useFinancials';
import { useWealth } from '../context/WealthContext';
import { DailyBudgetCard } from '../components/DailyBudgetCard';
import { PocketSplitCard } from '../components/PocketSplitCard';
import { NAVY_SECTION_RATIO } from '../constants/pageLayout';
import { MoreScreen } from './MoreScreen';
import { IncomeEngineScreen } from './IncomeEngineScreen';
import { WealthScreen } from './WealthScreen';
import { updateUserSettingsFirestoreRecord } from '../services/incomeHistorySync';
import {
  SHIELD_RED, BUILD_GREEN, VAULT_GOLD, PURPLE, NAVY,
  TEXT_PRIMARY, TEXT_MUTED,
  getTierColor, getTierLabel,
  FONT_MONO, RADIUS_LG, RADIUS_PILL,
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
const TEAL         = '#22D3EE';
const CYBER_YELLOW = '#FFD700';

// ─── Layout constants ─────────────────────────────────────────────────────────
const HERO_S    = 170;
const HERO_GAP  = 2;     // crisp visual ring gap
const HERO_RING_DATA_GAP = Math.round(HERO_S * 0.2375);
const CURVE     = 28;    // white section overlaps navy by this many px
const WHITE_PAD = 20;
const CARD_GAP  = 12;
const HOME_CARD_SCALE = 0.98;


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

// ─── Dummy ledger (12 items) ────────────────────────────────────────────────

interface Tx {
  id: string; emoji: string; iconBg: string;
  name: string; sub: string; amount: number; positive: boolean; ts: number;
}

const DUMMY_TRANSACTIONS: Tx[] = [
  { id: '1',  emoji: '☕', iconBg: '#FEF3E8', name: 'Costa Coffee',    sub: '08:30 AM · Café',          amount: 320,  positive: false, ts: 0 },
  { id: '2',  emoji: '🍱', iconBg: '#E8F0FE', name: 'Zomato',          sub: '01:15 PM · Food',          amount: 450,  positive: false, ts: 0 },
  { id: '3',  emoji: '⛽', iconBg: '#F0E8FE', name: 'BPCL Fuel',       sub: '06:45 PM · Transport',     amount: 1200, positive: false, ts: 0 },
  { id: '4',  emoji: '🚌', iconBg: '#E8F8F0', name: 'Metro Recharge',  sub: '09:00 AM · Transport',     amount: 200,  positive: false, ts: 0 },
  { id: '5',  emoji: '☕', iconBg: '#FEF3E8', name: 'Starbucks',       sub: '10:20 AM · Café',          amount: 380,  positive: false, ts: 0 },
  { id: '6',  emoji: '🥪', iconBg: '#FFF8E8', name: 'Subway',          sub: '12:45 PM · Food',          amount: 290,  positive: false, ts: 0 },
  { id: '7',  emoji: '📱', iconBg: '#E8E8FE', name: 'Mobile Prepaid',  sub: '02:10 PM · Utilities',     amount: 499,  positive: false, ts: 0 },
  { id: '8',  emoji: '🏪', iconBg: '#F0FEE8', name: 'Quick Mart',      sub: '04:30 PM · Shopping',      amount: 160,  positive: false, ts: 0 },
  { id: '9',  emoji: '🍜', iconBg: '#FEE8F0', name: 'Swiggy',          sub: '08:00 PM · Food',          amount: 520,  positive: false, ts: 0 },
  { id: '10', emoji: '🎬', iconBg: '#E8F0FE', name: 'Movie Tickets',   sub: '09:15 PM · Entertainment', amount: 850,  positive: false, ts: 0 },
  { id: '11', emoji: '🚗', iconBg: '#E8E8FE', name: 'Uber',            sub: '07:20 PM · Transport',     amount: 340,  positive: false, ts: 0 },
  { id: '12', emoji: '🛒', iconBg: '#FEF3E8', name: 'DMart',           sub: 'Sat · Groceries',          amount: 2840, positive: false, ts: 0 },
];

// ─── Animated ring segments ───────────────────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Hero Rings ───────────────────────────────────────────────────────────────

interface HeroRingsProps {
  buildPercentage: number;
  score: number;
  shieldCircumference: number;
  shieldOffset: number;
  shieldColor: string;
  trackCircumference: number;
  trackOffset: number;
  trackColor: string;
  isLocked: boolean;
  buildColor: string;
}

const HeroRings: React.FC<HeroRingsProps> = React.memo(({
  buildPercentage,
  score,
  shieldCircumference,
  shieldOffset,
  shieldColor,
  trackCircumference,
  trackOffset,
  trackColor,
  isLocked,
  buildColor,
}) => {
  const S = HERO_S;
  const cx = S / 2;
  const cy = S / 2;
  const rO = 64;
  const rM = 50;
  const rI = 36;
  const tierColor = getTierColor(score);
  const tierLabel = getTierLabel(score);
  const pulse = useRef(new Animated.Value(1)).current;
  const animatedShieldOffset = useRef(new Animated.Value(shieldOffset)).current;
  const animatedTrackOffset = useRef(new Animated.Value(trackOffset)).current;
  const buildCircumference = 2 * Math.PI * rI;
  const initialBuildOffset = buildCircumference - Math.min(Math.max(buildPercentage, 0), 1) * buildCircumference;
  const animatedBuildOffset = useRef(new Animated.Value(initialBuildOffset)).current;
  const prevShieldOffset = useRef(shieldOffset);
  const prevTrackOffset = useRef(trackOffset);
  const prevBuildOffset = useRef(initialBuildOffset);
  const prev  = useRef(score);

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
    const nextBuildOffset = buildCircumference - Math.min(Math.max(buildPercentage, 0), 1) * buildCircumference;
    const isDrain = nextBuildOffset <= prevBuildOffset.current;
    Animated.timing(animatedBuildOffset, {
      toValue: nextBuildOffset,
      duration: isDrain ? 150 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    prevBuildOffset.current = nextBuildOffset;
  }, [animatedBuildOffset, buildCircumference, buildPercentage]);

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
        {/* --- OUTER RING: RED SHIELD --- */}
        {/* 1. The Faded Background Track */}
        <Circle cx="85" cy="85" r="64" stroke="rgba(255,255,255,0.08)" strokeWidth="10" fill="none" />

        {/* 2. The Dynamic Progress Ring (With Crash Guards) */}
        <AnimatedCircle
          cx="85"
          cy="85"
          r={rO}
          stroke={shieldColor}
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={shieldCircumference}
          strokeDashoffset={animatedShieldOffset}
          rotation="-90"
          originX="85"
          originY="85"
        />
        {/* TRACK background */}
        <Circle cx="85" cy="85" r="50" stroke="rgba(255,255,255,0.08)" strokeWidth="10" fill="none" />
        {/* TRACK progress */}
        <AnimatedCircle
          cx="85"
          cy="85"
          r={rM}
          stroke={trackColor}
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={trackCircumference}
          strokeDashoffset={isNaN(trackOffset) ? trackCircumference : animatedTrackOffset}
          rotation="-90"
          originX="85"
          originY="85"
        />
        {/* BUILD background */}
        <Circle cx="85" cy="85" r="36" stroke="rgba(255,255,255,0.08)" strokeWidth="10" fill="none" />
        {/* BUILD progress */}
        <AnimatedCircle
          cx="85"
          cy="85"
          r={rI}
          stroke={buildColor}
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={buildCircumference}
          strokeDashoffset={animatedBuildOffset}
          rotation="-90"
          originX="85"
          originY="85"
        />
      </Svg>
      <View style={rg.centre}>
        {isLocked ? (
          <Text style={rg.lockIcon}>🔒</Text>
        ) : (
          <>
            <Animated.Text style={[rg.score, { color: tierColor, transform: [{ scale: pulse }] }]}>{score}</Animated.Text>
            <Text style={[rg.ovrLabel, { color: tierColor }]}>OVR</Text>
            <Text style={[rg.tier, { color: tierColor }]}>{tierLabel}</Text>
          </>
        )}
      </View>
    </View>
  );
});

const rg = StyleSheet.create({
  centre: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  score:  { fontSize: 32, lineHeight: 34, fontWeight: '700', letterSpacing: -1, fontFamily: FONT_MONO as string },
  ovrLabel: { fontSize: 10, lineHeight: 12, fontWeight: '700', letterSpacing: 1, marginTop: 1 },
  tier:   { fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 1, marginTop: 2 },
  lockIcon: { fontSize: 28, lineHeight: 32 },
});

// ─── Metric Badge ─────────────────────────────────────────────────────────────

const MetricBadge: React.FC<{ icon: string; label: string; value: string; color: string }> =
  ({ label, value, color }) => (
    <View style={mb.row}>
      <View>
        <Text style={mb.label}>{label}</Text>
        <Text style={[mb.value, { color }]}>{value}</Text>
      </View>
    </View>
  );

const mb = StyleSheet.create({
  row:   { minHeight: Math.round((HERO_S / 3) * 0.9), justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '600', color: '#E5E7EB', letterSpacing: 0.6, textTransform: 'uppercase' },
  value: {
    fontSize: 19,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.3,
    fontFamily: FONT_MONO as string,
    minWidth: 132,
  },
});

// ─── Budget Arc ───────────────────────────────────────────────────────────────

const BudgetArc: React.FC<{ size: number; progress: number }> = ({ size, progress }) => {
  const r = size / 2 - 7; const circ = 2 * Math.PI * r;
  const cx = size / 2; const cy = size / 2;
  const normalized = Math.max(0, Math.min(progress, 1));
  const fill = circ * (1 - normalized);
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

const NavItem: React.FC<{ icon: keyof typeof MaterialIcons.glyphMap; label: string; active: boolean; onPress: () => void }> =
  ({ icon, label, active, onPress }) => (
    <TouchableOpacity
      style={[s.navItem, active && s.navItemActiveGlass]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <MaterialIcons name={icon} size={20} style={[s.navIcon, active && s.navIconActive]} />
      <Text style={[s.navLabel, active && s.navLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );

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

const hexToRgb = (hex: string) => {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map(ch => ch + ch).join('')
    : clean;
  const value = parseInt(full, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const mixHex = (fromHex: string, toHex: string, t: number) => {
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);
  const n = Math.max(0, Math.min(1, t));
  const r = Math.round(from.r + (to.r - from.r) * n);
  const g = Math.round(from.g + (to.g - from.g) * n);
  const b = Math.round(from.b + (to.b - from.b) * n);
  return `rgb(${r}, ${g}, ${b})`;
};

const getSmoothShieldColor = (percent: number) => {
  const p = Math.max(0, Math.min(1, percent));
  if (p <= 0.1) return '#888888';
  if (p <= 0.3) return mixHex('#888888', '#FF6B00', (p - 0.1) / 0.2);
  if (p <= 0.5) return mixHex('#FF6B00', '#D69E2E', (p - 0.3) / 0.2);
  return mixHex('#D69E2E', '#E53E3E', (p - 0.5) / 0.5);
};

const getInactivityTimeout = (level: number) => {
  if (level <= 2) return 10000;
  if (level <= 4) return 20000;
  return 30000;
};

const EXPENSE_UI_MAP: Record<ExpenseCategory, { emoji: string; iconBg: string; label: string }> = {
  food: { emoji: '🍔', iconBg: '#FEF3E8', label: 'Food' },
  petrol: { emoji: '⛽', iconBg: '#F0E8FE', label: 'Transport' },
  utilities: { emoji: '📱', iconBg: '#E8E8FE', label: 'Utilities' },
  shopping: { emoji: '🛒', iconBg: '#FEE8F0', label: 'Shopping' },
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
    setTotalIncome,
    setDailySpent,
    setCustomDailyLimit,
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

  const shieldRadius = 64;
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
  const trackRadius = 50;
  const trackCircumference = 2 * Math.PI * trackRadius;
  const trackOffset = trackCircumference - trackPercentage * trackCircumference;
  const trackColor = !isIncomeConfirmed
    ? '#888888'
    : trackPercentage >= 1
    ? '#63B3ED'
    : '#3182CE';
  const safePocketSplitPct = Number.isFinite(pocketSplitPct) ? Math.max(10, Math.min(90, Math.round(pocketSplitPct))) : 50;
  const unspent = Math.max(0, activeDailyBudget - dailySpent);
  const pocketAmount = unspent * (safePocketSplitPct / 100);
  const pocketDisplay = Number.isFinite(pocketAmount) ? Math.max(0, Math.floor(pocketAmount)) : 0;
  const healDisplay = Math.floor(unspent * ((100 - safePocketSplitPct) / 100));
  const pocketGoal = pocketAmount;
  const buildPercentage = !isIncomeConfirmed
    ? 0
    : pocketGoal > 0
    ? Math.min(vaultSummary.pocketedToday / pocketGoal, 1)
    : 0;
  const buildColor = !isIncomeConfirmed
    ? '#888888'
    : buildPercentage >= 1
    ? '#68D391'
    : '#38A169';

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
  let shieldColor = '#888888';

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
    shieldColor = getSmoothShieldColor(shieldPercentage);
  }
  const shieldPts = Math.max(0, Math.min(shieldPercentage, 1)) * 20;
  const trackPts = Math.max(0, Math.min(trackPercentage, 1)) * 10;
  const buildPts = Math.max(0, Math.min(buildPercentage, 1)) * 10;
  const microScore = shieldPts + trackPts + buildPts;
  const computedOvrScore = Math.round(Math.min(microScore + (firestoreMacroScore ?? 30), 100));
  const heroOvrScore = firestoreOvrScore ?? computedOvrScore;
  const currentInsight = '₹1,200 more this week for MacBook';
  const insightText = !isIncomeConfirmed ? 'Confirm your income to start' : currentInsight;
  const insightIcon = !isIncomeConfirmed ? '🔒' : '✦';
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
  const HEADER_HEIGHT = SCREEN_HEIGHT * NAVY_SECTION_RATIO;
  const CARD_ROW_WIDTH = SCREEN_WIDTH - 40;
  const CARD_SIZE = CARD_ROW_WIDTH * 0.48 * 0.9025 * HOME_CARD_SCALE;
  const CARD_CENTER_GAP = CARD_ROW_WIDTH * 0.03;
  const CARD_ROW_SIDE_MARGIN = Math.max(
    0,
    (CARD_ROW_WIDTH - CARD_SIZE * 2 - CARD_CENTER_GAP) / 2,
  );
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollYValueRef = useRef(0);
  /** Let expanded activity tabs receive touches only when sheet is scrolled up (opacity > 0). */
  const [sheetExpandedForInput, setSheetExpandedForInput] = useState(false);

  const [activeTab, setActiveTab] = useState<TabKey>('Daily');
  const [activeNav, setActiveNav] = useState<NavKey>('home');
  const [activeRootTab, setActiveRootTab] = useState<'Home' | 'More' | 'IncomeEngine' | 'Wealth'>('Home');
  const [incomeActivity, setIncomeActivity] = useState<IncomeSourceLog[]>([]);
  const [expenseActivity, setExpenseActivity] = useState<Expense[]>([]);
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
        if (!FIRESTORE_PROJECT_ID || !userId) {
          if (mounted) {
            setShieldSettings({
              activeDailyBudget,
              salaryConfirmed: localSalaryConfirmed,
              incomeConfirmedAt: null,
              dailySpent,
            });
          }
          return;
        }
        const docUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/users/${userId}/settings`;
        const trackUrl = buildTrackDocUrl(userId);
        const vaultUrl = buildVaultSummaryUrl(userId);
        const dailyScoresUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/users/${userId}/gamification/daily_scores`;
        const profileUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/users/${userId}/profile`;
        const incomeUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/users/${userId}/income`;
        const [settingsRes, trackRes, vaultRes, dailyScoresRes, profileRes, incomeRes] = await Promise.all([
          fetch(docUrl),
          fetch(trackUrl),
          fetch(vaultUrl),
          fetch(dailyScoresUrl),
          fetch(profileUrl),
          fetch(incomeUrl),
        ]);
        if (!settingsRes.ok) return;
        const doc = await settingsRes.json();
        const trackDoc = trackRes.ok ? await trackRes.json() : null;
        const vaultDoc = vaultRes.ok ? await vaultRes.json() : null;
        const dailyScoresDoc = dailyScoresRes.ok ? await dailyScoresRes.json() : null;
        const profileDoc = profileRes.ok ? await profileRes.json() : null;
        const fields = doc?.fields ?? {};
        const trackFields = trackDoc?.fields ?? {};
        const vaultFields = vaultDoc?.fields ?? {};
        const scoreFields = dailyScoresDoc?.fields ?? {};
        const profileFields = profileDoc?.fields ?? {};
        const incomeDocs = incomeRes.ok ? (await incomeRes.json())?.documents ?? [] : [];
        const salaryConfirmedParsed = getFirestoreBoolean(fields.salaryConfirmed);
        const activeDailyBudgetParsed = getFirestoreNumber(fields.activeDailyBudget);
        const allocationPctRaw = getFirestoreNumber(fields.allocationPct);
        const allocationPctParsed = typeof allocationPctRaw === 'number' ? allocationPctRaw : 10;
        const nowMonth = new Date().getMonth();
        const nowYear = new Date().getFullYear();
        let confirmedIncome = 0;
        for (const incomeDoc of incomeDocs) {
          const f = incomeDoc?.fields || {};
          const rawName = String(f.name?.stringValue || f.title?.stringValue || '');
          const amount = getFirestoreNumber(f.amount);
          const confirmed = getFirestoreBoolean(f.confirmed);
          const expected = getFirestoreTimestamp(f.expected_date) || getFirestoreTimestamp(f.confirmed_at);
          const safeAmount = typeof amount === 'number' ? amount : 0;
          if (/^dff$/i.test(rawName.trim()) && safeAmount >= 5000000) {
            const id = String(incomeDoc?.name || '').split('/').pop();
            if (id) {
              const delUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/users/${userId}/income/${id}`;
              fetch(delUrl, { method: 'DELETE' }).catch(() => {});
            }
            continue;
          }
          if (!confirmed) continue;
          if (expected && (expected.getMonth() !== nowMonth || expected.getFullYear() !== nowYear)) continue;
          confirmedIncome += Math.max(0, safeAmount);
        }
        const monthlyPool = Math.floor(confirmedIncome * (Math.max(1, Math.min(50, allocationPctParsed)) / 100));
        const computedDailyBudget = Math.floor(monthlyPool / 30);
        const incomeConfirmedAtParsed = getFirestoreTimestamp(fields.incomeConfirmedAt);
        const pocketSplitParsed = getFirestoreNumber(fields.pocketSplitPct);
        console.log('shield/settings salaryConfirmed raw:', fields.salaryConfirmed);
        console.log('shield/settings salaryConfirmed parsed:', salaryConfirmedParsed);
        console.log('shield/settings activeDailyBudget parsed:', activeDailyBudgetParsed);
        console.log('shield/settings incomeConfirmedAt parsed:', incomeConfirmedAtParsed);
        if (!mounted) return;
        setShieldSettings({
          activeDailyBudget: Number.isFinite(computedDailyBudget) ? computedDailyBudget : (activeDailyBudgetParsed ?? activeDailyBudget),
          salaryConfirmed: salaryConfirmedParsed ?? localSalaryConfirmed,
          incomeConfirmedAt: incomeConfirmedAtParsed,
          dailySpent: getFirestoreNumber(fields.dailySpent) ?? dailySpent,
        });
        console.log('confirmedIncome:', confirmedIncome);
        console.log('allocationPct:', allocationPctParsed);
        console.log('monthlyPool:', monthlyPool);
        console.log('dailyBudget:', computedDailyBudget);
        setPocketSplitPct(
          pocketSplitParsed !== null
            ? Math.max(10, Math.min(90, Math.round(pocketSplitParsed)))
            : 50,
        );
        const macroFromDaily =
          getFirestoreNumber(scoreFields.macroScore) ??
          getFirestoreNumber(scoreFields.macro_score);
        const ovrFromDaily = getFirestoreNumber(scoreFields.ovrScore);
        const ovrFromProfile = getFirestoreNumber(profileFields.ovrScore);
        setFirestoreMacroScore(
          typeof macroFromDaily === 'number' ? Math.max(0, Math.min(60, Math.round(macroFromDaily))) : null,
        );
        const resolvedOvr = ovrFromDaily ?? ovrFromProfile;
        setFirestoreOvrScore(
          typeof resolvedOvr === 'number' ? Math.max(0, Math.min(100, Math.round(resolvedOvr))) : null,
        );
        const todayStr = new Date().toDateString();
        const remoteLastActiveDate = getFirestoreString(trackFields.lastActiveDate) ?? todayStr;
        const incomingTrackLevel = getFirestoreNumber(fields.trackLevel) ?? 4;
        const nextTrackDefaults: TrackRingData = {
          trackLevel: incomingTrackLevel,
          activeMinutesToday: 0,
          entriesToday: 0,
          lastActiveDate: todayStr,
        };
        if (!trackRes.ok) {
          setFirestoreMinutes(0);
          setTrackData(nextTrackDefaults);
          patchTrackRingDoc(userId, {
            activeMinutesToday: 0,
            entriesToday: 0,
            lastActiveDate: todayStr,
          }).catch(() => {});
          return;
        }
        if (remoteLastActiveDate !== todayStr) {
          setFirestoreMinutes(0);
          setTrackData(nextTrackDefaults);
          patchTrackRingDoc(userId, {
            activeMinutesToday: 0,
            entriesToday: 0,
            lastActiveDate: todayStr,
          }).catch(() => {});
        } else {
          const remoteMinutes = getFirestoreNumber(trackFields.activeMinutesToday) ?? 0;
          setFirestoreMinutes(remoteMinutes);
          setTrackData({
            trackLevel: incomingTrackLevel,
            activeMinutesToday: remoteMinutes,
            entriesToday: getFirestoreNumber(trackFields.entriesToday) ?? 0,
            lastActiveDate: remoteLastActiveDate,
          });
        }

        const incomingLockTarget = getFirestoreNumber(vaultFields.lockTarget) ?? Math.max(0, totalIncome * 0.1);
        const lastPocketDate = getFirestoreString(vaultFields.lastPocketDate) ?? todayStr;
        if (!vaultRes.ok) {
          const defaults: VaultSummary = {
            pocketedToday: 0,
            totalPocketed: 0,
            lockTarget: incomingLockTarget,
            locked: true,
            lastPocketDate: todayStr,
          };
          setVaultSummary(defaults);
          patchVaultSummaryDoc(userId, defaults).catch(() => {});
          console.log('vault/summary created with defaults');
        } else {
          const rawPocketedToday = getFirestoreNumber(vaultFields.pocketedToday) ?? 0;
          const nextPocketedToday = lastPocketDate === todayStr ? rawPocketedToday : 0;
          setVaultSummary({
            pocketedToday: nextPocketedToday,
            totalPocketed: getFirestoreNumber(vaultFields.totalPocketed) ?? 0,
            lockTarget: incomingLockTarget,
            locked: getFirestoreBoolean(vaultFields.locked) ?? true,
            lastPocketDate: todayStr,
          });
          if (lastPocketDate !== todayStr) {
            patchVaultSummaryDoc(userId, {
              pocketedToday: 0,
              lastPocketDate: todayStr,
            }).catch(() => {});
          }
          console.log('vault summary mapping check:', {
            pocketedToday: rawPocketedToday,
            totalPocketed: getFirestoreNumber(vaultFields.totalPocketed) ?? 0,
            lockTarget: incomingLockTarget,
            locked: getFirestoreBoolean(vaultFields.locked) ?? true,
            lastPocketDate,
          });
        }
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

  useEffect(() => {
    const thr = 72 * sk;
    const id = scrollY.addListener(({ value }) => {
      scrollYValueRef.current = value;
      const next = value > thr;
      setSheetExpandedForInput(prev => (prev === next ? prev : next));
    });
    return () => scrollY.removeListener(id);
  }, [scrollY, screenHeight, sk]);

  const squareOpacity = scrollY.interpolate({
    inputRange: [0, 70 * sk, sa],
    outputRange: [1, 0.45, 0],
    extrapolate: 'clamp',
  });
  const squareTranslateY = scrollY.interpolate({
    inputRange: [0, sa],
    outputRange: [0, -10],
    extrapolate: 'clamp',
  });
  const expandedOpacity = scrollY.interpolate({
    inputRange: [25 * sk, 80 * sk, sa],
    outputRange: [0, 0.9, 1],
    extrapolate: 'clamp',
  });
  const expandedTranslateY = scrollY.interpolate({
    inputRange: [25 * sk, sa],
    outputRange: [14, 0],
    extrapolate: 'clamp',
  });
  const activityHeaderOpacity = scrollY.interpolate({
    inputRange: [0, 70 * sk, sa],
    outputRange: [1, 0.45, 0],
    extrapolate: 'clamp',
  });
  const footerTranslateY = scrollY.interpolate({
    inputRange: [0, 100 * sk],
    outputRange: [0, 150],
    extrapolate: 'clamp',
  });

  /** White wash under scroll layer — fixed height, opacity only (avoids layout thrash while scrolling). */
  const expandTopWashOpacity = scrollY.interpolate({
    inputRange: [20 * sk, 85 * sk],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const cardSize = Math.round(CARD_SIZE);
  const arcSize  = Math.round(cardSize * 0.3);
  const dailyBudgetProgress = dailyLimit > 0 ? dailySpent / dailyLimit : 0;

  /** Expanded: pull ledger up under absolute filters (layout phantom from faded grid). Not animated. */
  const txListOverlapExpanded = Math.round(cardSize + SHEET_SECTION_GAP * 2 + 28);
  /** Expanded-only inset so first transactions start below sticky tabs instead of hiding under them. */
  const txListExpandedTopInset = Math.round(EXPANDED_ACTIVITY_TOP + 196);

  const METRICS = [
    {
      icon: '🛡️',
      label: 'Shield',
      value: !isIncomeConfirmed ? '₹0 / –' : `₹${effectiveDailySpent.toFixed(0)} / ${effectiveDailyBudget.toFixed(0)}`,
      color: !isIncomeConfirmed ? '#888888' : shieldColor,
    },
    {
      icon: '🎯',
      label: 'Track',
      value: !isIncomeConfirmed ? '–% · Lv4' : `${trackPercent}% · Lv${trackLevel}`,
      color: !isIncomeConfirmed ? '#888888' : trackColor,
    },
    {
      icon: '📈',
      label: 'Build',
      value: !isIncomeConfirmed
        ? '₹0 / 0'
        : `₹${Math.floor(vaultSummary.pocketedToday).toFixed(0)} / ${pocketDisplay.toFixed(0)}`,
      color: !isIncomeConfirmed ? '#888888' : buildColor,
    },
  ];

  const windowHeight = Dimensions.get('window').height;
  /** Keep white sheet start exactly below navy header. */
  const scrollTransparentSpacerHeight = HEADER_HEIGHT;
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
    (viewRef: React.RefObject<View>) =>
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

  const handlePocketNow = useCallback(async () => {
    const livePocketAmt = unspent * (safePocketSplitPct / 100);
    const liveHealAmt = unspent * ((100 - safePocketSplitPct) / 100);
    if (!isIncomeConfirmed || livePocketAmt <= 0) return;
    launchVaultCoins().catch(() => {});
    const nextPocketedToday = livePocketAmt;
    const nextTotalPocketed = vaultSummary.totalPocketed + livePocketAmt;
    const nextLocked = vaultSummary.lockTarget > 0 ? nextTotalPocketed >= vaultSummary.lockTarget : false;
    const todayStr = new Date().toDateString();
    setVaultSummary(prev => ({
      ...prev,
      pocketedToday: nextPocketedToday,
      totalPocketed: nextTotalPocketed,
      locked: nextLocked,
      lastPocketDate: todayStr,
    }));
    if (firestoreUserId) {
      await patchVaultSummaryDoc(firestoreUserId, {
        pocketedToday: nextPocketedToday,
        totalPocketed: nextTotalPocketed,
        locked: nextLocked,
        lastPocketDate: todayStr,
      });
    }
    console.log('Pocketed:', livePocketAmt, 'at', safePocketSplitPct, '%');
    console.log('Healing future days:', liveHealAmt);
  }, [
    firestoreUserId,
    isIncomeConfirmed,
    launchVaultCoins,
    patchVaultSummaryDoc,
    safePocketSplitPct,
    unspent,
    vaultSummary.lockTarget,
    vaultSummary.totalPocketed,
  ]);

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
    updateUserSettingsFirestoreRecord({ pocketSplitPct: safePocketSplitPct }).catch(() => {});
  }, [safePocketSplitPct]);

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
    setDailySpent(prev => prev + amt);
    setIsExpenseModalVisible(false);
  }, [addExpense, expenseAmount, expenseNote, expenseActivity, firestoreUserId, incrementEntryCount, isRecurring, selectedCategory, setDailySpent]);

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

  return (
    <SafeAreaView
      ref={rootRef}
      style={s.mainContainer}
      edges={['left', 'right']}
      onTouchStart={handleUserActivity}
    >
      <StatusBar barStyle="light-content" backgroundColor={D.bg} />

      {/* ── NAVY HEADER — fixed 42% height ─────────────────────────────────── */}
        <View
        style={{
          ...s.navyHeaderFixed,
          height: Dimensions.get('window').height * NAVY_SECTION_RATIO,
          paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 44) + 8 : insets.top + 8,
          paddingBottom: 8,
          paddingHorizontal: 24,
          backgroundColor: '#0A0E17',
        }}
        {...headerRefreshPan.panHandlers}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            s.navyBlurOverlay,
            {
              opacity: scrollY.interpolate({
                inputRange: [0, Math.round(200 * sk)],
                outputRange: [0, 1],
                extrapolate: 'clamp',
              }),
            },
          ]}
        />

        {/* 1. TOP GREETING (Locked to the top) */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 44, paddingHorizontal: 16 }}>
          <View>
            <Text style={s.greeting}>Hi, Welcome Back</Text>
            <Text style={s.greetingSub}>Good Morning</Text>
          </View>
          <View style={s.bellWrap}>
            <Text style={s.bellIcon}>🔔</Text>
            <View style={s.bellDot} />
          </View>
        </View>

        <View style={s.heroArea}>
          <View style={s.heroSummaryRow}>
            <View ref={heroRingsRef} collapsable={false} style={s.heroRingLeft}>
              <HeroRings
                buildPercentage={buildPercentage}
              score={heroOvrScore}
                shieldCircumference={shieldCircumference}
                shieldOffset={shieldOffset}
                shieldColor={shieldColor}
                trackCircumference={trackCircumference}
                trackOffset={trackOffset}
                trackColor={trackColor}
                isLocked={!isIncomeConfirmed}
                buildColor={buildColor}
              />
            </View>
            <View style={s.metricListRight}>
              {METRICS.map(m => (
                <View key={m.label}>
                  <Text style={s.metricLabelCompact}>{m.label}</Text>
                  <Text style={[s.metricValueCompact, { color: m.color }]} numberOfLines={1}>
                    {m.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <View style={s.insightWrap}>
            <TouchableOpacity
              style={s.insightPill}
              activeOpacity={0.75}
              onPress={() => {
                if (!isIncomeConfirmed) {
                  setActiveNav('incomeEngine');
                  setActiveRootTab('IncomeEngine');
                }
              }}
            >
              <Text style={s.insightSpark}>{insightIcon}</Text>
              <Text style={s.insightText} numberOfLines={1}>
                {insightText}
              </Text>
              <Text style={s.insightArrow}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          zIndex: 5,
          height: HEADER_HEIGHT + CURVE + 24,
          backgroundColor: '#FFFFFF',
          opacity: expandTopWashOpacity,
        }}
      />

      <Animated.ScrollView
        bounces
        overScrollMode="always"
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        style={{ flex: 1, zIndex: 10 }}
        contentContainerStyle={s.scrollContentTransparent}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        alwaysBounceVertical
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefreshReset} />
        }
      >
        {/* INDEX 0: invisible spacer — exact 40% navy header height */}
        <View style={[s.scrollTopSpacer, { height: scrollTransparentSpacerHeight }]} />

        {/* INDEX 1: sticky white sheet (grabber, pills, title, filters) */}
        <View
          style={[
            s.stickySheetHeader,
            {
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 36,
              borderTopRightRadius: 36,
              paddingBottom: 0,
            },
          ]}
        >
            <View style={s.sheetHandle} />

            <Animated.View style={[{ opacity: squareOpacity, transform: [{ translateY: squareTranslateY }] }]}>
              <View style={{ height: CARD_SIZE, width: '100%', position: 'relative', marginTop: Math.max(0, 20 - CARD_SIZE * 0.03) }}>
                <PocketSplitCard
                  cardSize={CARD_SIZE}
                  rightOffset={CARD_ROW_SIDE_MARGIN}
                  pocketSplitPct={pocketSplitPct}
                  setPocketSplitPct={setPocketSplitPct}
                  onDone={handlePocketDone}
                  onPocketNow={handlePocketNow}
                  unspent={unspent}
                  pocketButtonRef={sweepPillRef}
                />

                {/* Flipping Daily Budget Card (Animated Overlay) */}
                <DailyBudgetCard
                  cardSize={CARD_SIZE}
                  leftOffset={CARD_ROW_SIDE_MARGIN}
                  dailySpent={dailySpent}
                  dailyLimit={dailyLimit}
                  setDailyLimit={setCustomDailyLimit}
                  criticalLimit={criticalDailyFloor}
                  sliderMin={0}
                  sliderMax={dynamicDailyMax}
                  arcSlot={<BudgetArc size={arcSize} progress={dailyBudgetProgress} />}
                />
              </View>
            </Animated.View>

            <Animated.View pointerEvents="none" style={[s.expandedPillStrip, { opacity: expandedOpacity, transform: [{ translateY: expandedTranslateY }] }]}>
              <View style={[s.expandedPillCard, s.expandedPillCardDark]}>
                <View style={s.expandedPillIconWrap}><Text style={s.expandedPillIcon}>💗</Text></View>
                <View style={s.expandedPillCopy}>
                  <Text style={s.expandedPillLabel}>DAILY BUDGET</Text>
                  <View style={s.expandedPillAmount}>
                    <Text
                      style={s.expandedPillAmountStrong}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                    >
                      {dailySpent.toLocaleString('en-IN')}
                    </Text>
                    <Text style={s.expandedPillAmountSoft}>
                      /{dailyLimit.toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[s.expandedPillCard, s.expandedPillCardDark]}>
                <View style={s.expandedPillIconWrapYellow}><Text style={s.expandedPillIconDark}>💛</Text></View>
                <View style={s.expandedPillCopy}>
                  <Text style={s.expandedPillLabel}>POCKET IT</Text>
                  <View style={s.expandedPillAmount}>
                    <Text
                      style={s.expandedPillAmountStrong}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                    >
                      ₹{pocketDisplay.toFixed(0)}
                    </Text>
                  </View>
                </View>
              </View>
            </Animated.View>

            <Animated.View
              pointerEvents={sheetExpandedForInput ? 'box-none' : 'none'}
              style={[s.expandedActivityOverlay, { opacity: expandedOpacity }]}
            >
              <Text style={s.expandedActivityTitle}>Recent Activity</Text>
              <View style={s.expandedTabStrip}>
                {(['Daily', 'Weekly', 'Monthly'] as TabKey[]).map(tab => (
                  <TouchableOpacity
                    key={tab}
                    activeOpacity={0.75}
                    style={[s.expandedTab, activeTab === tab && s.expandedTabActive]}
                    onPress={() => setActiveTab(tab)}
                  >
                    <Text style={[s.expandedTabTxt, activeTab === tab && s.expandedTabTxtActive]}>{tab}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>

            {!sheetExpandedForInput && (
              <Animated.View style={{ opacity: activityHeaderOpacity, marginTop: Math.round(CARD_SIZE * 0.1) }}>
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
            )}
        </View>

        {/* INDEX 2: ledger — infinite white below sticky header */}
        <Animated.View
          style={[
            s.txListShell,
            { minHeight: windowHeight },
            sheetExpandedForInput && { marginTop: -txListOverlapExpanded, paddingTop: txListExpandedTopInset },
          ]}
        >
          {transactions.length ? (
            transactions.map((tx, i) => (
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
            ))
          ) : (
            <View style={s.emptyActivityWrap}>
              <Text style={s.emptyActivityTitle}>No recent activity yet</Text>
              <Text style={s.emptyActivitySub}>Add an income source to see live entries here.</Text>
            </View>
          )}
        </Animated.View>
      </Animated.ScrollView>

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
            onIncomeEnginePress={() => setActiveRootTab('IncomeEngine')}
            onLoanPress={() => setActiveRootTab('Home')}
            headerShieldPct={Math.round(shieldPercentage * 100)}
            headerTrackPct={Math.round(trackPercentage * 100)}
            headerBuildPct={Math.round(buildPercentage * 100)}
            headerOvrScore={ovrScore}
            onBack={() => {
              setActiveNav('home');
              setActiveRootTab('Home');
            }}
          />
        </View>
      )}

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
            onBack={() => setActiveRootTab('More')}
            headerShieldPct={Math.round(shieldPercentage * 100)}
            headerTrackPct={Math.round(trackPercentage * 100)}
            headerBuildPct={Math.round(buildPercentage * 100)}
            headerOvrScore={ovrScore}
          />
        </View>
      )}

      {activeRootTab === 'Wealth' && (
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

      <View
        pointerEvents="none"
        style={[s.bottomSafeAreaFill, { height: Math.max(insets.bottom, 8) + 6 }]}
      />

      {/* ── TAB BAR ───────────────────────────────────────────────────────── */}
      <Animated.View style={[s.floatingFooter, { transform: [{ translateY: footerTranslateY }] }]} pointerEvents="box-none">
        <View style={s.tabBar}>
          <NavItem icon="home" label="Home" active={activeNav === 'home'} onPress={() => { setActiveNav('home'); setActiveRootTab('Home'); }} />
          <NavItem icon="credit-card" label="Spend" active={activeNav === 'spend'} onPress={() => { setActiveNav('spend'); setActiveRootTab('Home'); }} />
          <NavItem icon="account-balance-wallet" label="Wealth" active={activeNav === 'wealth'} onPress={() => { setActiveNav('wealth'); setActiveRootTab('Wealth'); }} />
          <NavItem icon="savings" label="IE" active={activeNav === 'incomeEngine'} onPress={() => { setActiveNav('incomeEngine'); setActiveRootTab('IncomeEngine'); }} />
          <NavItem icon="more-horiz" label="More" active={activeNav === 'more'} onPress={() => { setActiveNav('more'); setActiveRootTab('More'); }} />

          {activeRootTab === 'Home' ? (
            <View style={s.fabAbsWrap} pointerEvents="box-none">
              <TouchableOpacity style={s.fab} onPress={() => setIsExpenseModalVisible(true)} activeOpacity={0.85}>
                <Text style={s.fabIcon}>+</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </Animated.View>

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
  mainContainer: { flex: 1, backgroundColor: D.bg },
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
  insightWrap: {
    width: '100%',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },

  // Insight pill — pinned at base of navy section
  insightPill: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    alignSelf: 'center',
    width: '100%',
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  insightSpark: { fontSize: 14, color: VAULT_GOLD },
  insightText:  { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  insightArrow: { fontSize: 20, color: D.muted, fontWeight: '300' },
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
    height: SHEET_HANDLE_H,
    borderRadius: 999,
    backgroundColor: '#D9DAE7',
    marginBottom: 0,
  },

  // ── Action pills ──────────────────────────────────────────────────────────
  actionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'relative',
    width: '100%',
    aspectRatio: 100 / 48,
    marginTop: 16,
    marginBottom: 20,
    overflow: 'visible',
  },
  vaultCardSlot: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: '48%',
    aspectRatio: 1,
    zIndex: 1,
  },
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
  budgetBottom: { gap: 2, width: '100%', minWidth: 0 },
  cardLabel: { fontSize: 9, fontWeight: '800', color: D.muted, letterSpacing: 1 },
  ratioRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    width: '100%',
    minWidth: 0,
  },
  ratioSpend: {
    flex: 1,
    minWidth: 0,
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1,
    fontFamily: FONT_MONO as string,
  },
  ratioLimit: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.38)', fontFamily: FONT_MONO as string },

  vaultCard: {
    width: '100%',
    aspectRatio: 1,
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
  sweepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CYBER_YELLOW,
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.20)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 3,
    elevation: 4,
  },
  sweepPillPressWrap: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 4,
    elevation: 5,
    borderRadius: 50,
  },
  sweepPillIcon: { fontSize: 11, color: '#1A1005' },
  sweepPillTxt: { fontSize: 7, fontWeight: '900', color: '#1A1005', letterSpacing: 0.4, lineHeight: 9 },
  vaultBottom: { gap: 1, width: '100%', minWidth: 0 },
  vaultLabel: { fontSize: 9, fontWeight: '800', color: 'rgba(0,0,0,0.5)', letterSpacing: 1 },
  vaultAmount: {
    alignSelf: 'stretch',
    fontSize: 24,
    fontWeight: '900',
    color: '#1A1005',
    letterSpacing: -1,
    fontFamily: FONT_MONO as string,
  },
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
    paddingBottom: 200,
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
  bottomSafeAreaFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 920,
  },
  tabBar: {
    position: 'absolute',
    bottom: 22,
    left: 14,
    right: 14,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.68)',
    borderRadius: 34,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
  },
  navItem:        { flex: 1, alignItems: 'center', gap: 2, paddingBottom: 0, borderRadius: 18, paddingVertical: 5 },
  navItemActiveGlass: {
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.98)',
    shadowColor: '#94A3B8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 2,
  },
  navIcon:        { color: '#1F2937' },
  navIconActive:  { color: '#1E88FF' },
  navLabel:       { fontSize: 10, color: '#4B5563', fontWeight: '600', letterSpacing: 0.1 },
  navLabelActive: { color: '#1E88FF', fontWeight: '800' },

  fabAbsWrap: {
    position: 'absolute',
    right: 8,
    top: -61,
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
