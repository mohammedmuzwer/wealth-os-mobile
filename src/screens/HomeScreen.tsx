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
  View, Text, StyleSheet, SafeAreaView,
  StatusBar, TouchableOpacity, Animated, useWindowDimensions, Dimensions,
  Modal, Pressable, TextInput, Switch, Platform, PanResponder, RefreshControl,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G } from 'react-native-svg';
import { useFinancials } from '../hooks/useFinancials';
import { useWealth } from '../context/WealthContext';
import { DailyBudgetCard } from '../components/DailyBudgetCard';
import { MoreScreen } from './MoreScreen';
import { IncomeEngineScreen } from './IncomeEngineScreen';
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
const HERO_S    = 170;   // +5% from current size
const HERO_STR  = 12;
const HERO_GAP  = 2;     // crisp visual ring gap
const HERO_RING_DATA_GAP = Math.round(HERO_S * 0.2375);
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

interface HeroRingsProps {
  shieldPct: number;
  trackPct: number;
  buildPct: number;
  score: number;
  shieldCircumference: number;
  shieldOffset: number;
}

const HeroRings: React.FC<HeroRingsProps> = React.memo(({
  shieldPct,
  trackPct,
  buildPct,
  score,
  shieldCircumference,
  shieldOffset,
}) => {
  const S = HERO_S;
  const cx = S / 2;
  const cy = S / 2;
  const ringStep = S * 0.1 * 0.95; // reduce inter-ring gap by 5%
  const rO = S * 0.4;
  const rM = rO - ringStep;
  const rI = rM - ringStep;
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
        {/* --- OUTER RING: RED SHIELD --- */}
        {/* 1. The Faded Background Track */}
        <Circle
          cx="85"
          cy="85"
          r="68"
          stroke="#FF3B30"
          strokeOpacity="0.2"
          strokeWidth="12"
          fill="none"
        />

        {/* 2. The Dynamic Progress Ring (With Crash Guards) */}
        <Circle
          cx="85"
          cy="85"
          r="68"
          stroke="#FF3B30"
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={shieldCircumference || 427}
          strokeDashoffset={isNaN(shieldOffset) ? 0 : shieldOffset}
          rotation="-90"
          originX="85"
          originY="85"
        />
        {/* -------------------------------- */}
        <Arc cx={cx} cy={cy} r={rM} color="#34C759" progress={trackPct  / 100} />
        <Arc cx={cx} cy={cy} r={rI} color="#32ADE6" progress={Math.min(buildPct, 100) / 100} />
      </Svg>
      <View style={rg.centre} pointerEvents="none">
        <Animated.Text style={[rg.score, { color: tierColor, transform: [{ scale: pulse }] }]}>{score}</Animated.Text>
        <Text style={[rg.tier, { color: tierColor }]}>{tierLabel}</Text>
      </View>
    </View>
  );
});

const rg = StyleSheet.create({
  centre: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  score:  { fontSize: 27, lineHeight: 29, fontWeight: '900', letterSpacing: -1, fontFamily: FONT_MONO as string },
  tier:   { fontSize: 7, lineHeight: 9, fontWeight: '800', letterSpacing: 1.2, marginTop: 1 },
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
type CoinAnim = {
  id: number;
  x: Animated.Value;
  y: Animated.Value;
  scale: Animated.Value;
  opacity: Animated.Value;
};

type IncomeSourceLog = {
  id: number;
  title: string;
  date: string;
  amount: string;
  type: 'RECURRING' | 'MANUAL';
  icon: 'briefcase' | 'palette' | 'home' | 'bank';
  createdAt?: string;
};

const EXPENSE_LOG_KEY = 'wos_expense_log';
const INCOME_SOURCES_KEY = 'income_engine_sources_v1';

const EXPENSE_UI_MAP: Record<ExpenseCategory, { emoji: string; iconBg: string; label: string }> = {
  food: { emoji: '🍔', iconBg: '#FEF3E8', label: 'Food' },
  petrol: { emoji: '⛽', iconBg: '#F0E8FE', label: 'Transport' },
  utilities: { emoji: '📱', iconBg: '#E8E8FE', label: 'Utilities' },
  shopping: { emoji: '🛒', iconBg: '#FEE8F0', label: 'Shopping' },
  other: { emoji: '🧾', iconBg: '#E8F0FE', label: 'Other' },
};

// ─── HomeScreen ───────────────────────────────────────────────────────────────

export const HomeScreen: React.FC = () => {
  const { summary, addExpense }          = useFinancials();
  const {
    dailySpent,
    activeDailyBudget,
    criticalDailyLimit,
    todayDynamicBudget,
    vaultSweep,
    ovsScore,
    setTotalIncome,
    setDailySpent,
    setCustomDailyLimit,
  } = useWealth();

  const safeBudget = activeDailyBudget > 0 ? activeDailyBudget : 1;
  const shieldPercentage =
    activeDailyBudget > 0 ? Math.max(0, (safeBudget - dailySpent) / safeBudget) : 0;
  const shieldRadius = 68;
  const shieldCircumference = 2 * Math.PI * shieldRadius;
  const shieldOffset = shieldCircumference - (shieldPercentage * shieldCircumference);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
  const HEADER_HEIGHT = SCREEN_HEIGHT * 0.40;
  const CARD_ROW_WIDTH = SCREEN_WIDTH - 40;
  const CARD_SIZE = CARD_ROW_WIDTH * 0.48 * 0.9025;
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
  const [activeRootTab, setActiveRootTab] = useState<'Home' | 'More' | 'IncomeEngine'>('Home');
  const [incomeActivity, setIncomeActivity] = useState<IncomeSourceLog[]>([]);
  const [expenseActivity, setExpenseActivity] = useState<Expense[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [coinAnims, setCoinAnims] = useState<CoinAnim[]>([]);
  const coinAnimIdRef = useRef(0);
  const rootRef = useRef<View>(null);
  const heroRingsRef = useRef<View>(null);
  const sweepPillRef = useRef<View>(null);
  const sweepPressAnim = useRef(new Animated.Value(0)).current;

  const [isExpenseModalVisible, setIsExpenseModalVisible] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('0');
  const [expenseNote, setExpenseNote] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);

  const dailyLimit = activeDailyBudget;
  const dynamicDailyMax = todayDynamicBudget;
  const criticalDailyFloor = criticalDailyLimit;

  /** ~20% of screen — scales all scroll-linked transitions (replaces fixed 80–120px band). */
  const sa = scrollAnimSpanPx(screenHeight);
  const sk = sa / 120;

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
    { icon: '🛡️', label: 'Shield', value: `₹${dailySpent.toFixed(0)} / ${activeDailyBudget.toFixed(0)}`, color: SHIELD_RED  },
    { icon: '🎯', label: 'Track',  value: fmt(Math.max(0, summary.income - summary.expenses)), color: BUILD_GREEN },
    { icon: '📈', label: 'Build',  value: fmt(Math.max(0, summary.savings ?? 0)),               color: '#3182CE'   },
  ];

  const windowHeight = Dimensions.get('window').height;
  /** Pull white sheet up by 10% while keeping navy header unchanged. */
  const scrollTransparentSpacerHeight = HEADER_HEIGHT * 0.9;
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
        amount: Number(item.amount.replace(/,/g, '')) || 0,
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
          return;
        }
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setIncomeActivity(parsed as IncomeSourceLog[]);
        } else {
          setIncomeActivity([]);
        }
      })
      .catch(() => {
        setIncomeActivity([]);
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
  }, [activeRootTab]);

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

  const onSweepPressIn = useCallback(() => {
    Animated.timing(sweepPressAnim, {
      toValue: 1,
      duration: 90,
      useNativeDriver: true,
    }).start();
  }, [sweepPressAnim]);

  const onSweepPressOut = useCallback(() => {
    Animated.timing(sweepPressAnim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start();
  }, [sweepPressAnim]);

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

  const submitExpense = useCallback(async () => {
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
    }
    setDailySpent(prev => prev + amt);
    setIsExpenseModalVisible(false);
  }, [addExpense, expenseAmount, expenseNote, isRecurring, selectedCategory, setDailySpent]);

  const handleRefreshReset = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await AsyncStorage.multiRemove([INCOME_SOURCES_KEY, EXPENSE_LOG_KEY]);
      setIncomeActivity([]);
      setExpenseActivity([]);
      setTotalIncome(74000);
      setDailySpent(0);
      setCustomDailyLimit(null);
    } finally {
      setIsRefreshing(false);
    }
  }, [setCustomDailyLimit, setDailySpent, setTotalIncome]);

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
    <SafeAreaView ref={rootRef} style={s.mainContainer}>
      <StatusBar barStyle="light-content" backgroundColor={D.bg} />

      {/* ── NAVY HEADER — fixed 40% height ─────────────────────────────────── */}
      <View
        style={{
          ...s.navyHeaderFixed,
          height: Dimensions.get('window').height * 0.40,
          paddingTop: insets.top + 10,
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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 40 }}>
          <View>
            <Text style={s.greeting}>Hi, Welcome Back</Text>
            <Text style={s.greetingSub}>Good Morning</Text>
          </View>
          <View style={s.bellWrap}>
            <Text style={s.bellIcon}>🔔</Text>
            <View style={s.bellDot} />
          </View>
        </View>

        {/* 2. THE GRAVITY BOX (Takes up 100% of the remaining space and centers everything inside it) */}
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingTop: 32,
          }}
        >
          {/* THE RINGS */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <View ref={heroRingsRef} collapsable={false}>
              <HeroRings
                shieldPct={summary.shieldPct}
                trackPct={summary.trackPct}
                buildPct={summary.buildPct}
                score={ovsScore}
                shieldCircumference={shieldCircumference}
                shieldOffset={shieldOffset}
              />
            </View>
            <View style={s.metricStack}>
              {METRICS.map(m => (
                <MetricBadge key={m.label} icon={m.icon} label={m.label} value={m.value} color={m.color} />
              ))}
            </View>
          </View>

          {/* THE AI INSIGHT PILL */}
          <View style={{ alignSelf: 'center', marginTop: 18 }}>
            <TouchableOpacity style={s.insightPill} activeOpacity={0.75}>
              <Text style={s.insightSpark}>✦</Text>
              <Text style={s.insightText} numberOfLines={1}>
                ₹1,200 more this week for MacBook
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
                {/* Yellow Vault Sweep Card (Static Background) */}
                <View style={{ position: 'absolute', right: CARD_ROW_SIDE_MARGIN, width: CARD_SIZE, height: CARD_SIZE, borderRadius: 24, overflow: 'hidden' }}>
                  <View style={s.vaultCard}>
                    <View style={s.vaultTopRow}>
                      <View style={s.vaultIndicator}><Text style={{ fontSize: 13 }}>💛</Text></View>
                      <Animated.View
                        ref={sweepPillRef}
                        collapsable={false}
                        style={[
                          s.sweepPillPressWrap,
                          {
                            transform: [
                              {
                                translateY: sweepPressAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0, 2],
                                }),
                              },
                              {
                                scale: sweepPressAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [1, 0.97],
                                }),
                              },
                            ],
                          },
                        ]}
                      >
                        <TouchableOpacity
                          style={s.sweepPill}
                          activeOpacity={1}
                          onPressIn={onSweepPressIn}
                          onPressOut={onSweepPressOut}
                          onPress={launchVaultCoins}
                        >
                          <Text style={s.sweepPillIcon}>◎</Text>
                          <Text style={s.sweepPillTxt}>SWEEP{'\n'}TO VAULT</Text>
                        </TouchableOpacity>
                      </Animated.View>
                    </View>
                    <View style={s.vaultBottom}>
                      <Text style={s.vaultLabel}>VAULT SWEEP</Text>
                      <Text
                        style={s.vaultAmount}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.6}
                      >
                        ₹{vaultSweep.toFixed(0)}
                      </Text>
                      <Text style={s.vaultSub}>UNSPENT</Text>
                    </View>
                  </View>
                </View>

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
                  <Text style={s.expandedPillLabel}>VAULT SWEEP</Text>
                  <View style={s.expandedPillAmount}>
                    <Text
                      style={s.expandedPillAmountStrong}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                    >
                      ₹{vaultSweep.toFixed(0)}
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
          <MoreScreen onIncomeEnginePress={() => setActiveRootTab('IncomeEngine')} />
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
          <IncomeEngineScreen />
        </View>
      )}

      {/* ── TAB BAR ───────────────────────────────────────────────────────── */}
      <Animated.View style={[s.floatingFooter, { transform: [{ translateY: footerTranslateY }] }]} pointerEvents="box-none">
      <View style={s.tabBar}>
        <NavItem icon="⌂"  label="Home"   active={activeNav === 'home'}   onPress={() => { setActiveNav('home'); setActiveRootTab('Home'); }}   />
        <NavItem icon="💳" label="Spend"  active={activeNav === 'spend'}  onPress={() => { setActiveNav('spend'); setActiveRootTab('Home'); }}  />
        <View style={s.fabSlot} />
        <NavItem icon="📊" label="Invest" active={activeNav === 'invest'} onPress={() => { setActiveNav('invest'); setActiveRootTab('Home'); }} />
        <NavItem icon="⋯"  label="More"   active={activeNav === 'more'}   onPress={() => { setActiveNav('more'); setActiveRootTab('More'); }}   />

        <View style={s.fabAbsWrap} pointerEvents="box-none">
          <TouchableOpacity style={s.fab} onPress={() => setIsExpenseModalVisible(true)} activeOpacity={0.85}>
            <Text style={s.fabIcon}>+</Text>
          </TouchableOpacity>
        </View>
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
    zIndex: -1,
    elevation: 0,
    backgroundColor: D.bg,
    justifyContent: 'flex-start',
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

  headerMidGroup: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Rings + metrics — centred
  heroRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 42, paddingHorizontal: 16,
  },
  metricStack: {
    height: HERO_S,
    justifyContent: 'center',
    alignSelf: 'center',
    marginLeft: HERO_RING_DATA_GAP,
  },

  // Insight pill — pinned at base of navy section
  insightPill: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    alignSelf: 'center',
    width: 'auto',
    maxWidth: '92%',
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
    backgroundColor: '#161622',
    borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12,
    borderWidth: 1, borderColor: '#2A2A3C',
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
