import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, G } from 'react-native-svg';
import { Swipeable } from 'react-native-gesture-handler';
import { AppPageHeader } from '../components/AppPageHeader';
import { useFinancials } from '../hooks/useFinancials';
import { useWealth } from '../context/WealthContext';
import { NAVY_SECTION_RATIO } from '../constants/pageLayout';
import { FONT_MONO, FONT_UI } from '../theme/tokens';
import {
  fetchFundNavBySchemeCode,
  searchMutualFunds,
  type FundNavSnapshot,
  type MfSearchHit,
} from '../services/mfApi';

type WealthScreenProps = {
  onBack?: () => void;
  headerShieldPct?: number;
  headerTrackPct?: number;
  headerBuildPct?: number;
  headerOvrScore?: number;
};

type AssetCategory = 'mutual_funds' | 'digital_gold' | 'cash' | 'crypto' | 'fixed_deposit' | 'other';
type AssetType = 'RECURRING' | 'ONE-TIME' | 'LIQUID';
type AssetFrequency = 'monthly' | 'biweekly' | 'quarterly' | 'half_yearly' | 'yearly';
type MfInvestmentType = 'new' | 'existing';
type MfExistingInputMode = 'units' | 'amount';

type WealthAsset = {
  id: string;
  name: string;
  category: AssetCategory;
  type: AssetType;
  amount: number;
  pnlPercent: number;
  icon: string;
  color: string;
  frequency: AssetFrequency;
  nextDueDate: Date | null;
  confirmedThisCycle: boolean;
  lastInvestedAt: Date | null;
  createdAt: Date | null;
  schemeCode?: string | null;
  investmentType?: MfInvestmentType | null;
  units?: number | null;
  avgNav?: number | null;
  investedAmount?: number | null;
  currentNAV?: number | null;
  currentValue?: number | null;
  pnlAmount?: number | null;
  sipAmount?: number | null;
  lastNavSync?: Date | null;
  lastUpdatedDate?: string | null;
  dayChangePercent?: number | null;
};

type AssetEntry = {
  id: string;
  assetId: string;
  assetName: string;
  amount: number;
  category: AssetCategory;
  investedAt: Date | null;
  icon: string;
  color: string;
};

type AllocationSegment = {
  key: string;
  label: string;
  color: string;
  pct: number;
};

const FIRESTORE_PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const FIRESTORE_USER_ID = process.env.EXPO_PUBLIC_FIREBASE_USER_ID;

const CATEGORY_COLORS: Record<AssetCategory, string> = {
  mutual_funds: '#3182CE',
  digital_gold: '#D69E2E',
  cash: '#38A169',
  crypto: '#6C63FF',
  fixed_deposit: '#2DD4BF',
  other: '#8888AA',
};

const CATEGORY_ICONS: Record<AssetCategory, string> = {
  mutual_funds: '🏦',
  digital_gold: '🪙',
  cash: '💵',
  crypto: '₿',
  fixed_deposit: '🏛️',
  other: '📊',
};

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  mutual_funds: 'Mutual Funds',
  digital_gold: 'Digital Gold',
  cash: 'Cash',
  crypto: 'Crypto',
  fixed_deposit: 'Fixed Deposit',
  other: 'Other',
};

const CATEGORY_ORDER: AssetCategory[] = [
  'mutual_funds',
  'digital_gold',
  'cash',
  'crypto',
  'fixed_deposit',
  'other',
];

const CATEGORY_PILL = CATEGORY_ORDER.map(c => ({
  key: c,
  icon: CATEGORY_ICONS[c],
  label: CATEGORY_LABELS[c],
  color: CATEGORY_COLORS[c],
}));

const TYPE_OPTIONS: Array<{ key: AssetType; icon: string; label: string }> = [
  { key: 'RECURRING', icon: '🔄', label: 'Recurring' },
  { key: 'ONE-TIME', icon: '1️⃣', label: 'One-Time' },
  { key: 'LIQUID', icon: '💧', label: 'Liquid' },
];

const colorToRgba = (hex: string, alpha: number) => {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(ch => ch + ch).join('') : clean;
  const value = parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
};

const getFirestoreNumber = (field: any): number => {
  if (!field) return 0;
  if (typeof field.integerValue === 'string') return Number(field.integerValue) || 0;
  if (typeof field.doubleValue === 'number') return field.doubleValue;
  return 0;
};

const getFirestoreString = (field: any): string => {
  if (typeof field?.stringValue === 'string') return field.stringValue;
  return '';
};

const getFirestoreDate = (field: any): Date | null => {
  const raw = field?.timestampValue || field?.stringValue;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getFirestoreOptionalString = (field: any): string | null => {
  if (field?.nullValue != null) return null;
  const s = getFirestoreString(field);
  return s || null;
};

const getFirestoreOptionalNumber = (field: any): number | null => {
  if (!field || field.nullValue != null) return null;
  if (typeof field.integerValue === 'string') {
    const n = Number(field.integerValue);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof field.doubleValue === 'number') return field.doubleValue;
  return null;
};

const prettyAmount = (n: number) => `₹${Math.round(Math.max(0, n)).toLocaleString('en-IN')}`;
const prettyAmountDecimals = (n: number, digits = 2) =>
  `₹${Math.max(0, n).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

const formatNavAsOfLabel = (raw: string | null | undefined): string | null => {
  if (!raw?.trim()) return null;
  const parts = raw.trim().split('-');
  if (parts.length === 3) {
    const d = Number(parts[0]);
    const m = Number(parts[1]);
    const y = Number(parts[2]);
    if (Number.isFinite(d) && Number.isFinite(m) && Number.isFinite(y)) {
      const dt = new Date(y, m - 1, d);
      if (!Number.isNaN(dt.getTime())) {
        return `NAV as of ${dt.getDate()} ${dt.toLocaleString('en-US', { month: 'short' })} ${dt.getFullYear()}`;
      }
    }
  }
  return `NAV as of ${raw.trim()}`;
};

const buildNextSipDateFromDom = (sipDom: number, from: Date = new Date()) => {
  const dom = Math.min(28, Math.max(1, Math.round(sipDom)));
  const y = from.getFullYear();
  const m = from.getMonth();
  let candidate = safeDomInMonth(y, m, dom);
  if (startOfDayTs(candidate) < startOfDayTs(from)) {
    candidate = safeDomInMonth(y, m + 1, dom);
  }
  return candidate;
};
const formatDate = (d: Date | null) =>
  d ? `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-US', { month: 'short' })}` : '—';
const formatDateInput = (d: Date) => `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-US', { month: 'short' })}`;
const parseDateInput = (raw: string) => {
  const [dayRaw, monRaw] = raw.trim().split(' ');
  const day = Number(dayRaw);
  if (!Number.isFinite(day) || day <= 0 || day > 31 || !monRaw) return null;
  const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    .findIndex(m => m === monRaw.toLowerCase());
  if (monthIndex < 0) return null;
  const now = new Date();
  return new Date(now.getFullYear(), monthIndex, day);
};

const MS_PER_DAY = 86400000;

const startOfDayTs = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const safeDomInMonth = (y: number, monthIndex: number, dom: number) => {
  const dim = new Date(y, monthIndex + 1, 0).getDate();
  return new Date(y, monthIndex, Math.min(dom, dim));
};

/** Monthly SIP: same calendar day each month; after that day passes this month, treat cycle as done → countdown to next month. */
type MonthlySipUi =
  | { kind: 'upcoming'; footerDue: Date; daysUntil: number }
  | { kind: 'today'; footerDue: Date }
  | { kind: 'doneThisMonth'; footerDue: Date; daysUntil: number };

const getMonthlySipUi = (asset: WealthAsset, today: Date): MonthlySipUi => {
  const ref = asset.nextDueDate || asset.createdAt || today;
  const dom = ref.getDate();
  const y = today.getFullYear();
  const m = today.getMonth();
  const t0 = startOfDayTs(today);
  const thisDue = safeDomInMonth(y, m, dom);
  const tThis = startOfDayTs(thisDue);
  if (t0 < tThis) {
    return { kind: 'upcoming', footerDue: thisDue, daysUntil: Math.ceil((tThis - t0) / MS_PER_DAY) };
  }
  if (t0 === tThis) {
    return { kind: 'today', footerDue: thisDue };
  }
  const nextDue = safeDomInMonth(y, m + 1, dom);
  return { kind: 'doneThisMonth', footerDue: nextDue, daysUntil: Math.ceil((startOfDayTs(nextDue) - t0) / MS_PER_DAY) };
};

const classifyForMissionSort = (asset: WealthAsset, today: Date): { tier: number; sortTs: number } => {
  if (asset.frequency === 'monthly') {
    const ui = getMonthlySipUi(asset, today);
    const ts = startOfDayTs(ui.footerDue);
    if (ui.kind === 'today') return { tier: 1, sortTs: ts };
    return { tier: 0, sortTs: ts };
  }
  const due = asset.nextDueDate || calculateNextDueDate(asset.frequency, today);
  const d0 = startOfDayTs(due);
  const t0 = startOfDayTs(today);
  const days = Math.ceil((d0 - t0) / MS_PER_DAY);
  const tier = days < 0 ? 2 : days === 0 ? 1 : 0;
  return { tier, sortTs: d0 };
};

const calculateNextDueDate = (frequency: AssetFrequency, fromDate: Date) => {
  const next = new Date(fromDate);
  switch (frequency) {
    case 'biweekly':
      next.setDate(next.getDate() + 14);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'half_yearly':
      next.setMonth(next.getMonth() + 6);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
    case 'monthly':
    default:
      next.setMonth(next.getMonth() + 1);
      break;
  }
  return next;
};

const AllocationDonut: React.FC<{ segments: AllocationSegment[] }> = ({ segments }) => {
  const size = 88;
  const r = 38;
  const sw = 12;
  const circ = 2 * Math.PI * r;

  if (!segments.length) {
    return (
      <Svg width={size} height={size} viewBox="0 0 88 88">
        <Circle cx="44" cy="44" r={r} stroke="rgba(255,255,255,0.1)" strokeWidth={sw} fill="none" />
      </Svg>
    );
  }

  let offsetPct = 0;
  return (
    <Svg width={size} height={size} viewBox="0 0 88 88">
      {segments.slice(0, 4).map((seg, idx) => {
        const startPct = offsetPct;
        offsetPct += seg.pct;
        const segmentLen = (seg.pct / 100) * circ;
        const dashOffset = circ * (1 - startPct / 100);
        return (
          <Circle
            key={seg.key}
            cx={44}
            cy={44}
            r={r}
            stroke={seg.color}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="butt"
            strokeDasharray={`${segmentLen} ${Math.max(0, circ - segmentLen)}`}
            strokeDashoffset={dashOffset}
            rotation={-90}
            originX={44}
            originY={44}
          />
        );
      })}
    </Svg>
  );
};

export const WealthScreen: React.FC<WealthScreenProps> = ({
  onBack,
  headerShieldPct,
  headerTrackPct,
  headerBuildPct,
  headerOvrScore,
}) => {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = Dimensions.get('window');
  const { summary } = useFinancials();
  const { shieldPercentage, ovrScore } = useWealth();
  const [assets, setAssets] = useState<WealthAsset[]>([]);
  const [assetEntries, setAssetEntries] = useState<AssetEntry[]>([]);
  const [isAssetSheetVisible, setIsAssetSheetVisible] = useState(false);
  const [assetName, setAssetName] = useState('');
  const [assetDate, setAssetDate] = useState(() => formatDateInput(new Date()));
  const [assetCategory, setAssetCategory] = useState<AssetCategory>('mutual_funds');
  const [assetType, setAssetType] = useState<AssetType>('RECURRING');
  const [assetFrequency, setAssetFrequency] = useState<AssetFrequency>('monthly');
  const [assetAmount, setAssetAmount] = useState('');
  const [isGain, setIsGain] = useState(true);
  const [assetPnl, setAssetPnl] = useState('');
  const [momPct, setMomPct] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [mfSearchQuery, setMfSearchQuery] = useState('');
  const [mfSearchResults, setMfSearchResults] = useState<MfSearchHit[]>([]);
  const [mfSearching, setMfSearching] = useState(false);
  const [selectedMfFund, setSelectedMfFund] = useState<MfSearchHit | null>(null);
  const [fundNavData, setFundNavData] = useState<FundNavSnapshot | null>(null);
  const [loadingNav, setLoadingNav] = useState(false);
  const [mfInvestmentType, setMfInvestmentType] = useState<MfInvestmentType | null>(null);
  const [mfExistingMode, setMfExistingMode] = useState<MfExistingInputMode>('units');
  const [mfUnitsInput, setMfUnitsInput] = useState('');
  const [mfAvgNavInput, setMfAvgNavInput] = useState('');
  const [mfInvestedAmountInput, setMfInvestedAmountInput] = useState('');
  const [mfSipAmount, setMfSipAmount] = useState('');
  const [mfSipDom, setMfSipDom] = useState(() => Math.min(28, Math.max(1, new Date().getDate())));
  const mfSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mfNavSyncingRef = useRef(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const resolvedShieldPct = headerShieldPct ?? shieldPercentage;
  const resolvedTrackPct = headerTrackPct ?? summary.trackPct;
  const resolvedBuildPct = headerBuildPct ?? summary.buildPct;
  const resolvedOvrScore = headerOvrScore ?? ovrScore;
  const minimizedTop = Math.round(screenHeight * NAVY_SECTION_RATIO);
  const expandedTop = insets.top + 8;
  const missionCardGap = 12;
  /** 2 full cards + ~20% of the 3rd (same peek idea as before, tighter). */
  const missionVisibleCards = 2.2;
  /** Match IE / `topSectionInner`: 16px inset each side → content aligns with back button. */
  const missionViewportWidth = Math.max(280, Dimensions.get('window').width - 32);
  const missionCardWidth = Math.max(
    100,
    Math.floor((missionViewportWidth - missionCardGap * 2) / missionVisibleCards),
  );

  const missionCarouselRef = useRef<FlatList<WealthAsset>>(null);
  const missionContentW = useRef(0);
  const missionLayoutW = useRef(0);
  const missionScrollOffsetRef = useRef(0);
  const missionRafRef = useRef<number | null>(null);
  const missionScrollPausedRef = useRef(false);
  const missionResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sheetTop = useRef(new Animated.Value(minimizedTop)).current;
  const panStartTopRef = useRef(minimizedTop);
  const currentTopRef = useRef(minimizedTop);
  const assetSheetOpenedAtRef = useRef(0);
  const assetModalDragY = useRef(new Animated.Value(0)).current;
  const assetModalPanYStartRef = useRef(0);

  const resetMfForm = useCallback(() => {
    setMfSearchQuery('');
    setMfSearchResults([]);
    setMfSearching(false);
    setSelectedMfFund(null);
    setFundNavData(null);
    setLoadingNav(false);
    setMfInvestmentType(null);
    setMfExistingMode('units');
    setMfUnitsInput('');
    setMfAvgNavInput('');
    setMfInvestedAmountInput('');
    setMfSipAmount('');
    setMfSipDom(Math.min(28, Math.max(1, new Date().getDate())));
    if (mfSearchDebounceRef.current) {
      clearTimeout(mfSearchDebounceRef.current);
      mfSearchDebounceRef.current = null;
    }
  }, []);

  const runMfSearch = useCallback(async (text: string) => {
    const q = text.trim();
    if (q.length < 3) {
      setMfSearchResults([]);
      return;
    }
    try {
      setMfSearching(true);
      const list = await searchMutualFunds(q);
      setMfSearchResults(list);
    } catch {
      setMfSearchResults([]);
    } finally {
      setMfSearching(false);
    }
  }, []);

  const onMfSearchChangeText = useCallback(
    (text: string) => {
      setMfSearchQuery(text);
      if (selectedMfFund && text.trim() !== selectedMfFund.schemeName.trim()) {
        setSelectedMfFund(null);
        setFundNavData(null);
        setMfInvestmentType(null);
      }
      if (mfSearchDebounceRef.current) clearTimeout(mfSearchDebounceRef.current);
      mfSearchDebounceRef.current = null;
      if (!text.trim()) {
        setMfSearchResults([]);
        return;
      }
      mfSearchDebounceRef.current = setTimeout(() => {
        void runMfSearch(text);
      }, 400);
    },
    [runMfSearch, selectedMfFund],
  );

  const handleMfFundSelect = useCallback(async (fund: MfSearchHit) => {
    setSelectedMfFund(fund);
    setMfSearchResults([]);
    setMfSearchQuery(fund.schemeName);
    setMfInvestmentType(null);
    setFundNavData(null);
    setLoadingNav(true);
    try {
      const snap = await fetchFundNavBySchemeCode(fund.schemeCode);
      setFundNavData(snap);
    } finally {
      setLoadingNav(false);
    }
  }, []);

  const closeAssetSheet = useCallback(
    (force = false) => {
      if (!force && Date.now() - assetSheetOpenedAtRef.current < 150) return;
      Keyboard.dismiss();
      setIsDatePickerVisible(false);
      assetModalDragY.setValue(0);
      resetMfForm();
      setIsAssetSheetVisible(false);
    },
    [assetModalDragY, resetMfForm],
  );

  const openAssetSheet = useCallback(() => {
    assetSheetOpenedAtRef.current = Date.now();
    assetModalDragY.setValue(0);
    setIsDatePickerVisible(false);
    setIsAssetSheetVisible(true);
  }, [assetModalDragY]);

  const assetModalPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > 6,
        onMoveShouldSetPanResponderCapture: (_, g) =>
          Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          assetModalDragY.stopAnimation((v: number) => {
            assetModalPanYStartRef.current = v;
          });
        },
        onPanResponderMove: (_, g) => {
          const next = assetModalPanYStartRef.current + g.dy;
          assetModalDragY.setValue(next > 0 ? next : 0);
        },
        onPanResponderRelease: (_, g) => {
          const pulled = Math.max(0, assetModalPanYStartRef.current + g.dy);
          const threshold = Math.min(140, screenHeight * 0.18);
          const shouldClose = g.vy > 0.45 || pulled > threshold;
          if (shouldClose) {
            Animated.timing(assetModalDragY, {
              toValue: screenHeight,
              duration: 240,
              useNativeDriver: true,
            }).start(({ finished }) => {
              if (finished) {
                assetModalDragY.setValue(0);
                closeAssetSheet(true);
              }
            });
          } else {
            Animated.spring(assetModalDragY, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 6,
            }).start();
          }
        },
      }),
    [assetModalDragY, closeAssetSheet, screenHeight],
  );

  const totalNetWorth = useMemo(
    () => assets.reduce((sum, a) => sum + Math.max(0, a.amount), 0),
    [assets],
  );

  const allocationSegments = useMemo<AllocationSegment[]>(() => {
    if (!assets.length || totalNetWorth <= 0) return [];
    const byCategory = new Map<AssetCategory, number>();
    assets.forEach(a => byCategory.set(a.category, (byCategory.get(a.category) || 0) + a.amount));
    const all = Array.from(byCategory.entries())
      .map(([cat, amount]) => ({
        key: cat,
        label: CATEGORY_LABELS[cat],
        color: CATEGORY_COLORS[cat],
        pct: (amount / totalNetWorth) * 100,
      }))
      .sort((a, b) => b.pct - a.pct);
    if (all.length <= 3) return all;
    const top3 = all.slice(0, 3);
    const othersPct = all.slice(3).reduce((s, x) => s + x.pct, 0);
    return [...top3, { key: 'others', label: 'Others', color: '#8888AA', pct: othersPct }];
  }, [assets, totalNetWorth]);

  const missionAssets = useMemo(() => {
    const today = new Date();
    return [...assets]
      .filter(a => a.type === 'RECURRING')
      .sort((a, b) => {
        const ca = classifyForMissionSort(a, today);
        const cb = classifyForMissionSort(b, today);
        if (ca.tier !== cb.tier) return ca.tier - cb.tier;
        if (ca.tier === 2) return cb.sortTs - ca.sortTs;
        return ca.sortTs - cb.sortTs;
      });
  }, [assets]);

  useEffect(() => {
    if (missionRafRef.current != null) {
      cancelAnimationFrame(missionRafRef.current);
      missionRafRef.current = null;
    }
    missionScrollOffsetRef.current = 0;
    missionCarouselRef.current?.scrollToOffset({ offset: 0, animated: false });

    if (missionAssets.length <= 3) return;

    const SPEED_PX_PER_SEC = 14;
    let lastTs = Date.now();

    const tick = () => {
      const now = Date.now();
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      const list = missionCarouselRef.current;
      const cw = missionContentW.current;
      const lw = missionLayoutW.current;
      if (!list || lw <= 0 || cw <= lw + 2) {
        missionRafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (missionScrollPausedRef.current) {
        missionRafRef.current = requestAnimationFrame(tick);
        return;
      }

      const maxO = cw - lw;
      let next = missionScrollOffsetRef.current + SPEED_PX_PER_SEC * dt;
      if (next >= maxO) next = 0;

      missionScrollOffsetRef.current = next;
      list.scrollToOffset({ offset: next, animated: false });
      missionRafRef.current = requestAnimationFrame(tick);
    };

    missionRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (missionRafRef.current != null) {
        cancelAnimationFrame(missionRafRef.current);
        missionRafRef.current = null;
      }
      if (missionResumeTimerRef.current) {
        clearTimeout(missionResumeTimerRef.current);
        missionResumeTimerRef.current = null;
      }
    };
  }, [missionAssets, missionCardGap, missionCardWidth]);

  const handleMissionScrollSync = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    missionScrollOffsetRef.current = e.nativeEvent.contentOffset.x;
  }, []);

  const handleMissionScrollBeginDrag = useCallback(() => {
    missionScrollPausedRef.current = true;
    if (missionResumeTimerRef.current) {
      clearTimeout(missionResumeTimerRef.current);
      missionResumeTimerRef.current = null;
    }
  }, []);

  const handleMissionScrollRelease = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    missionScrollOffsetRef.current = e.nativeEvent.contentOffset.x;
    if (missionResumeTimerRef.current) clearTimeout(missionResumeTimerRef.current);
    missionResumeTimerRef.current = setTimeout(() => {
      missionScrollPausedRef.current = false;
      missionResumeTimerRef.current = null;
    }, 5000);
  }, []);

  const calendarWeeks = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<Date | null> = [];
    for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: Array<Array<Date | null>> = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }, [calendarMonth]);

  useEffect(() => {
    sheetTop.setValue(minimizedTop);
  }, [minimizedTop, sheetTop]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const loadAssets = async () => {
      const savedUserId = await AsyncStorage.getItem('wos_user_id');
      const userId = FIRESTORE_USER_ID || savedUserId;
      if (!FIRESTORE_PROJECT_ID || !userId) return;
      const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/users/${userId}/assets`;
      const res = await fetch(url).catch(() => null);
      if (!res || !res.ok) return;
      const payload = await res.json();
      const docs = Array.isArray(payload?.documents) ? payload.documents : [];
      const next: WealthAsset[] = docs.map((doc: any) => {
        const fields = doc?.fields || {};
        const categoryRaw = getFirestoreString(fields.category) as AssetCategory;
        const category = CATEGORY_ORDER.includes(categoryRaw) ? categoryRaw : 'other';
        const typeRaw = getFirestoreString(fields.type) as AssetType;
        const type = typeRaw === 'RECURRING' || typeRaw === 'ONE-TIME' || typeRaw === 'LIQUID' ? typeRaw : 'ONE-TIME';
        const freqRaw = getFirestoreString(fields.frequency) as AssetFrequency;
        const frequency: AssetFrequency =
          freqRaw === 'biweekly' || freqRaw === 'quarterly' || freqRaw === 'half_yearly' || freqRaw === 'yearly' || freqRaw === 'monthly'
            ? freqRaw
            : 'monthly';
        const invRaw = getFirestoreString(fields.investmentType);
        const investmentType: MfInvestmentType | null =
          invRaw === 'new' || invRaw === 'existing' ? invRaw : null;
        return {
          id: String(doc?.name || '').split('/').pop() || `asset-${Math.random()}`,
          name: getFirestoreString(fields.name) || 'Asset',
          category,
          type,
          amount: Math.max(0, getFirestoreNumber(fields.amount)),
          pnlPercent: getFirestoreNumber(fields.pnlPercent),
          icon: getFirestoreString(fields.icon) || CATEGORY_ICONS[category],
          color: getFirestoreString(fields.color) || CATEGORY_COLORS[category],
          frequency,
          nextDueDate: getFirestoreDate(fields.nextDueDate),
          confirmedThisCycle: fields?.confirmedThisCycle?.booleanValue === true,
          lastInvestedAt: getFirestoreDate(fields.lastInvestedAt),
          createdAt: getFirestoreDate(fields.createdAt),
          schemeCode: getFirestoreOptionalString(fields.schemeCode),
          investmentType,
          units: getFirestoreOptionalNumber(fields.units),
          avgNav: getFirestoreOptionalNumber(fields.avgNav),
          investedAmount: getFirestoreOptionalNumber(fields.investedAmount),
          currentNAV: getFirestoreOptionalNumber(fields.currentNAV),
          currentValue: getFirestoreOptionalNumber(fields.currentValue),
          pnlAmount: getFirestoreOptionalNumber(fields.pnlAmount),
          sipAmount: getFirestoreOptionalNumber(fields.sipAmount),
          lastNavSync: getFirestoreDate(fields.lastNavSync),
          lastUpdatedDate: getFirestoreOptionalString(fields.lastUpdatedDate),
          dayChangePercent: getFirestoreOptionalNumber(fields.dayChangePercent),
        } as WealthAsset;
      });
      if (alive) setAssets(next.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)));
    };

    const loadAssetEntries = async () => {
      const savedUserId = await AsyncStorage.getItem('wos_user_id');
      const userId = FIRESTORE_USER_ID || savedUserId;
      if (!FIRESTORE_PROJECT_ID || !userId) return;
      const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/users/${userId}/asset_entries`;
      const res = await fetch(url).catch(() => null);
      if (!res || !res.ok) return;
      const payload = await res.json();
      const docs = Array.isArray(payload?.documents) ? payload.documents : [];
      const next: AssetEntry[] = docs.map((doc: any) => {
        const fields = doc?.fields || {};
        const categoryRaw = getFirestoreString(fields.category) as AssetCategory;
        const category = CATEGORY_ORDER.includes(categoryRaw) ? categoryRaw : 'other';
        return {
          id: String(doc?.name || '').split('/').pop() || `entry-${Math.random()}`,
          assetId: getFirestoreString(fields.assetId),
          assetName: getFirestoreString(fields.assetName) || 'Asset',
          amount: Math.max(0, getFirestoreNumber(fields.amount)),
          category,
          investedAt: getFirestoreDate(fields.investedAt),
          icon: CATEGORY_ICONS[category],
          color: CATEGORY_COLORS[category],
        };
      });
      if (alive) setAssetEntries(next.sort((a, b) => (b.investedAt?.getTime() || 0) - (a.investedAt?.getTime() || 0)));
    };

    const loadMoM = async () => {
      const savedUserId = await AsyncStorage.getItem('wos_user_id');
      const userId = FIRESTORE_USER_ID || savedUserId;
      if (!FIRESTORE_PROJECT_ID || !userId) return;
      const monthKey = (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      })();
      const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/users/${userId}/wealth/monthly_snapshot`;
      const res = await fetch(url).catch(() => null);
      if (!res || !res.ok) return;
      const payload = await res.json();
      const docs = Array.isArray(payload?.documents) ? payload.documents : [];
      const currentDoc = docs.find((d: any) => String(d?.name || '').endsWith(`/${monthKey}`));
      const prev = new Date();
      prev.setMonth(prev.getMonth() - 1);
      const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
      const prevDoc = docs.find((d: any) => String(d?.name || '').endsWith(`/${prevKey}`));
      const currValue = getFirestoreNumber(currentDoc?.fields?.totalNetWorth);
      const prevValue = getFirestoreNumber(prevDoc?.fields?.totalNetWorth);
      if (currValue > 0 && prevValue > 0) {
        const pct = ((currValue - prevValue) / prevValue) * 100;
        if (alive) setMomPct(pct);
      } else if (alive) {
        setMomPct(null);
      }
    };

    void loadAssets();
    void loadAssetEntries();
    void loadMoM();
    timer = setInterval(() => {
      void loadAssets();
      void loadAssetEntries();
      void loadMoM();
    }, 15000);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  const lastMfNavSyncAttemptRef = useRef(0);
  useEffect(() => {
    if (!assets.length || !FIRESTORE_PROJECT_ID) return;
    const t = setTimeout(() => {
      void (async () => {
        const now = Date.now();
        if (now - lastMfNavSyncAttemptRef.current < 5 * 60 * 1000) return;
        if (mfNavSyncingRef.current) return;
        const savedUserId = await AsyncStorage.getItem('wos_user_id');
        const userId = FIRESTORE_USER_ID || savedUserId;
        if (!userId) return;

        const mfAssets = assets.filter(
          a => a.category === 'mutual_funds' && a.schemeCode && a.units != null && Number(a.units) > 0,
        );
        if (!mfAssets.length) return;

        lastMfNavSyncAttemptRef.current = Date.now();
        mfNavSyncingRef.current = true;
        try {
          for (const asset of mfAssets) {
            const snap = await fetchFundNavBySchemeCode(asset.schemeCode as string);
            if (!snap?.lastUpdated) continue;
            if (asset.lastUpdatedDate && asset.lastUpdatedDate === snap.lastUpdated) continue;

            const units = asset.units ?? 0;
            const invested = asset.investedAmount ?? 0;
            const newNAV = snap.currentNAV;
            const newCurrentValue = units * newNAV;
            const newPnL = newCurrentValue - invested;
            const newPnLPct = invested > 0 ? (newPnL / invested) * 100 : asset.pnlPercent;
            const nowIso = new Date().toISOString();

            setAssets(prev =>
              prev.map(a =>
                a.id === asset.id
                  ? {
                      ...a,
                      amount: Math.max(0, newCurrentValue),
                      currentNAV: newNAV,
                      currentValue: newCurrentValue,
                      pnlAmount: newPnL,
                      pnlPercent: newPnLPct,
                      lastUpdatedDate: snap.lastUpdated,
                      dayChangePercent: snap.dayChange,
                      lastNavSync: new Date(nowIso),
                    }
                  : a,
              ),
            );

            const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/users/${userId}/assets/${asset.id}`;
            await fetch(url, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fields: {
                  amount: { doubleValue: Math.max(0, newCurrentValue) },
                  currentNAV: { doubleValue: newNAV },
                  currentValue: { doubleValue: newCurrentValue },
                  pnlAmount: { doubleValue: newPnL },
                  pnlPercent: { doubleValue: newPnLPct },
                  lastNavSync: { timestampValue: nowIso },
                  lastUpdatedDate: { stringValue: snap.lastUpdated },
                  dayChangePercent: { doubleValue: snap.dayChange },
                },
              }),
            }).catch(() => null);
          }
        } finally {
          mfNavSyncingRef.current = false;
        }
      })();
    }, 900);
    return () => clearTimeout(t);
  }, [assets]);

  const mfExistingPreview = useMemo(() => {
    if (assetCategory !== 'mutual_funds' || mfInvestmentType !== 'existing' || !fundNavData) return null;
    const nav = fundNavData.currentNAV;
    const avg = Number(String(mfAvgNavInput).replace(/,/g, '').trim());
    if (!Number.isFinite(avg) || avg <= 0) return null;
    let units = 0;
    let invested = 0;
    if (mfExistingMode === 'units') {
      units = Number(String(mfUnitsInput).replace(/,/g, '').trim());
      if (!Number.isFinite(units) || units <= 0) return null;
      invested = units * avg;
    } else {
      invested = Number(String(mfInvestedAmountInput).replace(/,/g, '').trim());
      if (!Number.isFinite(invested) || invested <= 0) return null;
      units = invested / avg;
    }
    const current = units * nav;
    const pnl = current - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, current, pnl, pnlPct, units };
  }, [
    assetCategory,
    mfInvestmentType,
    fundNavData,
    mfAvgNavInput,
    mfExistingMode,
    mfUnitsInput,
    mfInvestedAmountInput,
  ]);

  const mfNewUnitsPreview = useMemo(() => {
    if (mfInvestmentType !== 'new' || !fundNavData) return null;
    const sip = Number(String(mfSipAmount).replace(/,/g, '').trim());
    if (!Number.isFinite(sip) || sip <= 0) return null;
    return sip / fundNavData.currentNAV;
  }, [mfInvestmentType, mfSipAmount, fundNavData]);

  const mfSaveDisabled = useMemo(() => {
    if (!selectedMfFund || !fundNavData || !mfInvestmentType) return true;
    if (mfInvestmentType === 'new') {
      const sip = Number(String(mfSipAmount).replace(/,/g, '').trim());
      return !Number.isFinite(sip) || sip <= 0;
    }
    const avg = Number(String(mfAvgNavInput).replace(/,/g, '').trim());
    if (!Number.isFinite(avg) || avg <= 0) return true;
    if (mfExistingMode === 'units') {
      const u = Number(String(mfUnitsInput).replace(/,/g, '').trim());
      return !Number.isFinite(u) || u <= 0;
    }
    const inv = Number(String(mfInvestedAmountInput).replace(/,/g, '').trim());
    return !Number.isFinite(inv) || inv <= 0;
  }, [
    selectedMfFund,
    fundNavData,
    mfInvestmentType,
    mfSipAmount,
    mfAvgNavInput,
    mfExistingMode,
    mfUnitsInput,
    mfInvestedAmountInput,
  ]);

  const nonMfSaveDisabled = !(assetName.trim() && Number(assetAmount) > 0);

  const openDatePicker = () => {
    Keyboard.dismiss();
    const parsed = parseDateInput(assetDate) || new Date();
    setCalendarMonth(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    requestAnimationFrame(() => setIsDatePickerVisible(true));
  };

  const saveAsset = async () => {
    if (isSaving) return;
    const savedUserId = await AsyncStorage.getItem('wos_user_id');
    const userId = FIRESTORE_USER_ID || savedUserId;
    const createdAt = new Date();
    const assetId = `asset-${Date.now()}`;
    const icon = CATEGORY_ICONS[assetCategory];
    const color = CATEGORY_COLORS[assetCategory];

    if (assetCategory === 'mutual_funds') {
      if (!selectedMfFund || !fundNavData || !mfInvestmentType) return;
      const nav = fundNavData.currentNAV;
      if (!Number.isFinite(nav) || nav <= 0) return;

      let units = 0;
      let avgNav = 0;
      let investedAmount = 0;
      let currentValue = 0;
      let pnlAmount = 0;
      let pnlPercent = 0;
      let nextDueDate: Date;
      let sipAmountNum: number | null = null;
      const mfFreq: AssetFrequency =
        assetFrequency === 'quarterly' || assetFrequency === 'yearly' ? assetFrequency : 'monthly';

      if (mfInvestmentType === 'new') {
        const sip = Number(String(mfSipAmount).replace(/,/g, '').trim());
        if (!Number.isFinite(sip) || sip <= 0) return;
        sipAmountNum = sip;
        units = sip / nav;
        avgNav = nav;
        investedAmount = 0;
        currentValue = units * nav;
        pnlAmount = 0;
        pnlPercent = 0;
        nextDueDate = buildNextSipDateFromDom(mfSipDom);
      } else {
        const avg = Number(String(mfAvgNavInput).replace(/,/g, '').trim());
        if (!Number.isFinite(avg) || avg <= 0) return;
        avgNav = avg;
        if (mfExistingMode === 'units') {
          const u = Number(String(mfUnitsInput).replace(/,/g, '').trim());
          if (!Number.isFinite(u) || u <= 0) return;
          units = u;
          investedAmount = units * avgNav;
        } else {
          const inv = Number(String(mfInvestedAmountInput).replace(/,/g, '').trim());
          if (!Number.isFinite(inv) || inv <= 0) return;
          investedAmount = inv;
          units = investedAmount / avgNav;
        }
        currentValue = units * nav;
        pnlAmount = currentValue - investedAmount;
        pnlPercent = investedAmount > 0 ? (pnlAmount / investedAmount) * 100 : 0;
        nextDueDate = parseDateInput(assetDate) || new Date();
      }

      const name = selectedMfFund.schemeName.trim();
      const schemeCode = String(selectedMfFund.schemeCode);
      const amount = Math.max(0, currentValue);
      const signedPnl = Number.isFinite(pnlPercent) ? pnlPercent : 0;
      const lastUpdatedDate = fundNavData.lastUpdated || null;
      const dayChangePercent = Number.isFinite(fundNavData.dayChange) ? fundNavData.dayChange : null;

      setIsSaving(true);
      const localAsset: WealthAsset = {
        id: assetId,
        name,
        category: 'mutual_funds',
        type: assetType,
        amount,
        pnlPercent: signedPnl,
        icon,
        color,
        frequency: mfInvestmentType === 'new' ? mfFreq : assetFrequency,
        nextDueDate,
        confirmedThisCycle: false,
        lastInvestedAt: null,
        createdAt,
        schemeCode,
        investmentType: mfInvestmentType,
        units,
        avgNav,
        investedAmount,
        currentNAV: nav,
        currentValue,
        pnlAmount,
        sipAmount: sipAmountNum,
        lastNavSync: new Date(),
        lastUpdatedDate,
        dayChangePercent,
      };
      setAssets(prev => [localAsset, ...prev]);

      if (FIRESTORE_PROJECT_ID && userId) {
        const fields: Record<string, unknown> = {
          name: { stringValue: name },
          category: { stringValue: 'mutual_funds' },
          type: { stringValue: assetType },
          frequency: { stringValue: mfInvestmentType === 'new' ? mfFreq : assetFrequency },
          amount: { doubleValue: amount },
          pnlPercent: { doubleValue: signedPnl },
          icon: { stringValue: icon },
          color: { stringValue: color },
          nextDueDate: { timestampValue: nextDueDate.toISOString() },
          confirmedThisCycle: { booleanValue: false },
          createdAt: { timestampValue: createdAt.toISOString() },
          schemeCode: { stringValue: schemeCode },
          investmentType: { stringValue: mfInvestmentType },
          units: { doubleValue: units },
          avgNav: { doubleValue: avgNav },
          investedAmount: { doubleValue: investedAmount },
          currentNAV: { doubleValue: nav },
          currentValue: { doubleValue: currentValue },
          pnlAmount: { doubleValue: pnlAmount },
          lastNavSync: { timestampValue: new Date().toISOString() },
          lastUpdatedDate: lastUpdatedDate ? { stringValue: lastUpdatedDate } : { nullValue: null },
          dayChangePercent:
            dayChangePercent != null ? { doubleValue: dayChangePercent } : { nullValue: null },
        };
        if (sipAmountNum != null) fields.sipAmount = { doubleValue: sipAmountNum };
        else fields.sipAmount = { nullValue: null };

        const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/users/${userId}/assets/${assetId}`;
        await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields }),
        }).catch(() => null);
      }
      setIsSaving(false);
      setAssetName('');
      setAssetAmount('');
      setAssetPnl('');
      setAssetDate(formatDateInput(new Date()));
      setAssetCategory('mutual_funds');
      setAssetType('RECURRING');
      setAssetFrequency('monthly');
      setIsGain(true);
      closeAssetSheet(true);
      return;
    }

    const name = assetName.trim();
    const amount = Number(String(assetAmount).replace(/,/g, '').trim());
    if (!name || !Number.isFinite(amount) || amount <= 0) return;
    setIsSaving(true);
    const pnlNumber = Number(assetPnl || '0');
    const signedPnl = Number.isFinite(pnlNumber) ? (isGain ? pnlNumber : -pnlNumber) : 0;
    const nextDueDate = parseDateInput(assetDate) || new Date();

    const localAsset: WealthAsset = {
      id: assetId,
      name,
      category: assetCategory,
      type: assetType,
      amount,
      pnlPercent: signedPnl,
      icon,
      color,
      frequency: assetFrequency,
      nextDueDate,
      confirmedThisCycle: false,
      lastInvestedAt: null,
      createdAt,
    };
    setAssets(prev => [localAsset, ...prev]);

    if (FIRESTORE_PROJECT_ID && userId) {
      const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/users/${userId}/assets/${assetId}`;
      await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            name: { stringValue: name },
            category: { stringValue: assetCategory },
            type: { stringValue: assetType },
            frequency: { stringValue: assetFrequency },
            amount: { doubleValue: amount },
            pnlPercent: { doubleValue: signedPnl },
            icon: { stringValue: icon },
            color: { stringValue: color },
            nextDueDate: { timestampValue: nextDueDate.toISOString() },
            confirmedThisCycle: { booleanValue: false },
            createdAt: { timestampValue: createdAt.toISOString() },
          },
        }),
      }).catch(() => null);
    }
    setIsSaving(false);
    setAssetName('');
    setAssetAmount('');
    setAssetPnl('');
    setAssetDate(formatDateInput(new Date()));
    setAssetCategory('mutual_funds');
    setAssetType('RECURRING');
    setAssetFrequency('monthly');
    setIsGain(true);
    closeAssetSheet(true);
  };

  const deleteAsset = async (id: string) => {
    const savedUserId = await AsyncStorage.getItem('wos_user_id');
    const userId = FIRESTORE_USER_ID || savedUserId;
    if (!FIRESTORE_PROJECT_ID || !userId) return;
    const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/users/${userId}/assets/${id}`;
    await fetch(url, { method: 'DELETE' }).catch(() => null);
    setAssets(prev => prev.filter(a => a.id !== id));
  };

  const deleteAssetEntry = async (id: string) => {
    const savedUserId = await AsyncStorage.getItem('wos_user_id');
    const userId = FIRESTORE_USER_ID || savedUserId;
    if (!FIRESTORE_PROJECT_ID || !userId) return;
    const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/users/${userId}/asset_entries/${id}`;
    await fetch(url, { method: 'DELETE' }).catch(() => null);
    setAssetEntries(prev => prev.filter(item => item.id !== id));
  };

  const renderMissionItem = useCallback(
    ({ item: asset, index }: ListRenderItemInfo<WealthAsset>) => {
      const today = new Date();
      const isConfirmed = asset.confirmedThisCycle === true;
      const dayStartNow = startOfDayTs(today);

      let footerDue: Date;
      let countdownNum: string;
      let countdownUnit: string;
      let numColor: string;
      let borderColor: string;
      let dueHint: string | null = null;

      if (isConfirmed) {
        const nextFromStored = asset.nextDueDate || calculateNextDueDate(asset.frequency, today);
        footerDue = nextFromStored;
        const nextCycleDays = Math.max(
          1,
          Math.ceil((startOfDayTs(nextFromStored) - dayStartNow) / MS_PER_DAY),
        );
        countdownNum = String(nextCycleDays);
        countdownUnit = 'days to next SIP';
        numColor = '#38A169';
        borderColor = '#38A169';
        dueHint = 'Confirmed this cycle';
      } else if (asset.frequency === 'monthly') {
        const ui = getMonthlySipUi(asset, today);
        footerDue = ui.footerDue;
        if (ui.kind === 'upcoming') {
          countdownNum = String(ui.daysUntil);
          countdownUnit = ui.daysUntil === 1 ? 'day left' : 'days left';
          numColor = '#1A1A2E';
          borderColor = 'rgba(255,255,255,0.12)';
        } else if (ui.kind === 'today') {
          countdownNum = '0';
          countdownUnit = 'due today';
          numColor = '#2DD4BF';
          borderColor = '#2DD4BF';
        } else {
          countdownNum = String(ui.daysUntil);
          countdownUnit = ui.daysUntil === 1 ? 'day to next SIP' : 'days to next SIP';
          numColor = '#38A169';
          borderColor = '#38A169';
          dueHint = 'SIP date passed this month';
        }
      } else {
        const dueDate = asset.nextDueDate || calculateNextDueDate(asset.frequency, today);
        footerDue = dueDate;
        const dayStartDue = startOfDayTs(dueDate);
        const daysUntilDue = Math.ceil((dayStartDue - dayStartNow) / MS_PER_DAY);
        const isDueToday = daysUntilDue === 0;
        const isPast = daysUntilDue < 0;
        borderColor = isDueToday ? '#2DD4BF' : isPast ? '#E53E3E' : 'rgba(255,255,255,0.12)';
        if (isPast) {
          countdownNum = String(Math.abs(daysUntilDue));
          countdownUnit = 'days overdue';
          numColor = '#E53E3E';
        } else if (isDueToday) {
          countdownNum = '0';
          countdownUnit = 'due today';
          numColor = '#2DD4BF';
        } else {
          countdownNum = String(daysUntilDue);
          countdownUnit = daysUntilDue === 1 ? 'day left' : 'days left';
          numColor = '#1A1A2E';
        }
      }

      const isLast = index === missionAssets.length - 1;
      const isMf = asset.category === 'mutual_funds' && !!asset.schemeCode;
      const mfFreqLabel =
        asset.frequency === 'monthly'
          ? 'Monthly'
          : asset.frequency === 'quarterly'
            ? 'Quarterly'
            : asset.frequency === 'yearly'
              ? 'Yearly'
              : asset.frequency.toUpperCase();
      const navAsOf = formatNavAsOfLabel(asset.lastUpdatedDate);

      return (
        <View
          style={[
            s.missionCard,
            isMf ? s.missionCardMf : null,
            { width: missionCardWidth, borderColor },
            !isLast ? { marginRight: missionCardGap } : null,
          ]}
        >
          <View>
            <View style={s.missionTopRow}>
              <View style={[s.missionIconWrap, { backgroundColor: colorToRgba(asset.color, 0.15) }]}>
                <Text style={s.missionIcon}>{asset.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.missionName} numberOfLines={1}>
                  {asset.name}
                </Text>
                <Text style={s.missionMeta} numberOfLines={1}>
                  {isMf
                    ? `${CATEGORY_LABELS[asset.category]} · ${mfFreqLabel}${asset.investmentType === 'new' ? ' SIP' : ''}`
                    : `${CATEGORY_LABELS[asset.category]} · ₹${asset.amount.toLocaleString('en-IN')}`}
                </Text>
              </View>
              <View style={s.missionFreqPill}>
                <Text style={s.missionFreqTxt}>{asset.frequency.toUpperCase()}</Text>
              </View>
            </View>
            {isMf && asset.currentNAV != null && Number.isFinite(asset.currentNAV) ? (
              <View style={s.missionMfNavRow}>
                <Text style={s.missionMfNavTxt} numberOfLines={1}>
                  {`NAV ₹${asset.currentNAV.toFixed(2)}  `}
                  {asset.dayChangePercent != null && Number.isFinite(asset.dayChangePercent)
                    ? `${asset.dayChangePercent >= 0 ? '+' : ''}${asset.dayChangePercent.toFixed(2)}% today`
                    : ''}
                </Text>
              </View>
            ) : null}
            {isMf ? (
              <View style={s.missionMfStats}>
                {asset.investmentType === 'existing' &&
                asset.investedAmount != null &&
                Number.isFinite(asset.investedAmount) &&
                asset.investedAmount > 0 ? (
                  <>
                    <Text style={s.missionMfStatLine} numberOfLines={1}>
                      {`Invested ${prettyAmount(asset.investedAmount)} · Current ${prettyAmount(asset.amount)}`}
                    </Text>
                    <Text
                      style={[
                        s.missionMfStatLine,
                        {
                          fontWeight: '700',
                          color: (asset.pnlAmount ?? 0) >= 0 ? '#38A169' : '#E53E3E',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {`P&L ${(asset.pnlAmount ?? 0) >= 0 ? '+' : ''}${prettyAmount(Math.abs(asset.pnlAmount ?? 0))} (${(asset.pnlPercent ?? 0) >= 0 ? '+' : ''}${(asset.pnlPercent ?? 0).toFixed(2)}%)`}
                    </Text>
                  </>
                ) : (
                  <Text style={s.missionMfStatLine} numberOfLines={1}>
                    {`SIP ${prettyAmount(asset.sipAmount ?? 0)} · Est. value ${prettyAmount(asset.amount)}`}
                  </Text>
                )}
              </View>
            ) : null}
            {isMf && navAsOf ? (
              <Text style={s.missionMfSync} numberOfLines={1}>
                {navAsOf}
              </Text>
            ) : null}
          </View>

          <View style={s.missionFooterRow}>
            <View style={{ flex: 1, paddingRight: 6 }}>
              <Text style={s.missionDueMini} numberOfLines={1}>
                {`Next due ${formatDate(footerDue)}`}
              </Text>
              {dueHint ? (
                <Text style={s.missionDueHint} numberOfLines={2}>
                  {dueHint}
                </Text>
              ) : null}
            </View>
            <View style={s.missionCountCol}>
              <Text style={[s.missionCountdownNum, { color: numColor }]}>{countdownNum}</Text>
              <Text style={s.missionCountdownUnit}>{countdownUnit}</Text>
            </View>
          </View>
        </View>
      );
    },
    [missionCardGap, missionCardWidth, missionAssets.length],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > 3,
        onMoveShouldSetPanResponderCapture: (_, g) =>
          Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > 2,
        onPanResponderGrant: () => {
          sheetTop.stopAnimation((value: number) => {
            panStartTopRef.current = value;
          });
        },
        onPanResponderMove: (_, g) => {
          const next = panStartTopRef.current + g.dy;
          const clamped = Math.max(expandedTop, Math.min(minimizedTop, next));
          currentTopRef.current = clamped;
          sheetTop.setValue(clamped);
        },
        onPanResponderRelease: (_, g) => {
          const shouldExpand =
            g.vy < -0.25 || currentTopRef.current < expandedTop + (minimizedTop - expandedTop) * 0.68;
          Animated.timing(sheetTop, {
            toValue: shouldExpand ? expandedTop : minimizedTop,
            duration: 220,
            useNativeDriver: false,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.timing(sheetTop, {
            toValue: minimizedTop,
            duration: 220,
            useNativeDriver: false,
          }).start();
        },
      }),
    [expandedTop, minimizedTop, sheetTop],
  );

  return (
    <View style={s.container}>
      <View style={[s.topSection, { paddingTop: insets.top }]}>
        <View style={s.topSectionInner}>
          <AppPageHeader
            title="Wealth"
            onBack={onBack}
            ovrScore={resolvedOvrScore}
            shieldPct={resolvedShieldPct}
            trackPct={resolvedTrackPct}
            buildPct={resolvedBuildPct}
          />
          <View style={s.netWorthWrap}>
            <Text style={s.netWorthLabel}>TOTAL NET WORTH</Text>
            <View style={s.netWorthRow}>
              <Text style={s.netWorthAmount}>{prettyAmount(totalNetWorth)}</Text>
              {momPct !== null ? (
                <View style={[s.momPill, { backgroundColor: momPct >= 0 ? 'rgba(56,161,105,0.2)' : 'rgba(229,62,62,0.2)' }]}>
                  <Text style={[s.momText, { color: momPct >= 0 ? '#38A169' : '#E53E3E' }]}>
                    {`${momPct >= 0 ? '+' : ''}${momPct.toFixed(1)}% MoM`}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={s.allocCard}>
            <View style={s.allocLegendWrap}>
              <Text style={s.allocTitle}>Allocation</Text>
              {allocationSegments.slice(0, 4).map(seg => (
                <View key={seg.key} style={s.legendRow}>
                  <View style={[s.legendDot, { backgroundColor: seg.color }]} />
                  <Text style={s.legendText}>{`${seg.label} (${Math.round(seg.pct)}%)`}</Text>
                </View>
              ))}
            </View>
            <AllocationDonut segments={allocationSegments} />
          </View>
        </View>
      </View>

      <Animated.View style={[s.sheet, { top: sheetTop }]}>
        <View style={s.sheetDragZone} {...panResponder.panHandlers}>
          <View style={s.handleWrap}>
            <View style={s.handle} />
          </View>
        </View>
        <View style={{ marginTop: -Math.round(screenHeight * 0.01) }}>
          <View style={s.ledgerHeader}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={s.ledgerTitle}>Upcoming Investments</Text>
              <Text style={s.ledgerSub}>Mission cards for your next investment events</Text>
            </View>
            <TouchableOpacity
              style={s.addAssetInlineBtn}
              activeOpacity={0.85}
              onPress={openAssetSheet}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={s.addAssetInlineTxt}>+ Add Asset</Text>
            </TouchableOpacity>
          </View>
          {missionAssets.length === 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.missionCarouselContent}
              bounces={false}
            >
              <View style={[s.missionCard, s.missionEmptyCard, { width: missionCardWidth }]}>
                <Text style={s.missionEmptyTxt}>No upcoming recurring investments yet.</Text>
              </View>
            </ScrollView>
          ) : (
            <FlatList
              ref={missionCarouselRef}
              horizontal
              data={missionAssets}
              keyExtractor={a => a.id}
              renderItem={renderMissionItem}
              showsHorizontalScrollIndicator={false}
              bounces
              decelerationRate="fast"
              scrollEventThrottle={16}
              contentContainerStyle={s.missionCarouselContentFlat}
              onScroll={handleMissionScrollSync}
              onScrollBeginDrag={handleMissionScrollBeginDrag}
              onScrollEndDrag={handleMissionScrollRelease}
              onMomentumScrollEnd={handleMissionScrollRelease}
              onLayout={e => {
                missionLayoutW.current = e.nativeEvent.layout.width;
              }}
              onContentSizeChange={(contentWidth: number) => {
                missionContentW.current = contentWidth;
              }}
              initialNumToRender={6}
              maxToRenderPerBatch={8}
              windowSize={5}
              removeClippedSubviews={Platform.OS === 'android'}
            />
          )}
        </View>

        <View style={s.historySectionHeader}>
          <Text style={s.ledgerTitle}>Investment History</Text>
        </View>
        <ScrollView contentContainerStyle={s.sheetContent} showsVerticalScrollIndicator={false} bounces={false}>
          {assetEntries.length ? (
            <FlatList
              data={assetEntries}
              keyExtractor={item => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <Swipeable
                  friction={2}
                  renderRightActions={() => (
                    <View style={s.swipeActions}>
                      <TouchableOpacity style={s.deleteBtn} activeOpacity={0.85} onPress={() => void deleteAssetEntry(item.id)}>
                        <Text style={s.swipeTxt}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                >
                  <View style={s.historyRow}>
                    <View style={[s.historyIconWrap, { backgroundColor: colorToRgba(item.color, 0.15) }]}>
                      <Text style={s.historyIcon}>{item.icon}</Text>
                    </View>
                    <View style={{ flex: 1, paddingLeft: 10 }}>
                      <Text style={s.historyName}>{item.assetName}</Text>
                      <Text style={s.historyDate}>{formatDate(item.investedAt)}</Text>
                    </View>
                    <Text style={s.historyAmount}>{`+${prettyAmount(item.amount)}`}</Text>
                  </View>
                </Swipeable>
              )}
            />
          ) : (
            <View style={s.emptyWrap}>
              <Text style={s.emptyEmoji}>🧾</Text>
              <Text style={s.emptyTitle}>No investment history yet</Text>
              <Text style={s.emptySub}>Logged investments will show up here.</Text>
              <TouchableOpacity style={s.emptyAddBtn} activeOpacity={0.9} onPress={openAssetSheet}>
                <Text style={s.emptyAddBtnTxt}>+ Add Asset</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </Animated.View>

      <Modal
        visible={isAssetSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (isDatePickerVisible) setIsDatePickerVisible(false);
          else closeAssetSheet(true);
        }}
      >
        <View style={s.modalRoot}>
          <Pressable style={s.modalBackdrop} onPress={() => closeAssetSheet(true)} />
          <Animated.View
            style={[
              s.modalSheetWrap,
              {
                marginTop: insets.top + 10,
                height: screenHeight - (insets.top + 10),
                transform: [{ translateY: assetModalDragY }],
              },
            ]}
          >
            <KeyboardAvoidingView
              style={s.modalSheet}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
            >
              <View {...assetModalPanResponder.panHandlers} style={s.modalDragZone}>
                <View style={s.modalHandle} />
                <View style={s.modalHeaderRow}>
                  <Text style={s.modalTitleInHeader}>Add Asset</Text>
                  <TouchableOpacity
                    style={s.modalCloseBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    onPress={() => closeAssetSheet(true)}
                    activeOpacity={0.75}
                  >
                    <Text style={s.modalCloseTxt}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[s.formContent, { paddingTop: 8, paddingBottom: insets.bottom + 28 }]}
                keyboardShouldPersistTaps="always"
                keyboardDismissMode="on-drag"
              >
              <Text style={[s.inputLabel, { marginTop: 0 }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryRow}>
                {CATEGORY_PILL.map(cat => {
                  const selected = assetCategory === cat.key;
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      style={[
                        s.categoryPill,
                        selected ? { backgroundColor: colorToRgba(cat.color, 0.2), borderColor: cat.color, borderWidth: 1.5 } : null,
                      ]}
                      onPress={() => {
                        setAssetCategory(cat.key);
                        if (cat.key !== 'mutual_funds') resetMfForm();
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={{ fontSize: 14 }}>{cat.icon}</Text>
                      <Text style={[s.categoryPillTxt, selected ? { color: cat.color } : null]}>{cat.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {assetCategory === 'mutual_funds' ? (
                <>
                  <Text style={s.inputLabel}>Search mutual fund</Text>
                  <View style={s.mfSearchRow}>
                    <Text style={s.mfSearchIcon}>🔍</Text>
                    <TextInput
                      placeholder="Search mutual fund..."
                      placeholderTextColor="#AAAAAA"
                      value={mfSearchQuery}
                      onChangeText={onMfSearchChangeText}
                      autoFocus
                      style={s.mfSearchInput}
                    />
                    {mfSearching ? <ActivityIndicator size="small" color="#6C63FF" /> : null}
                    {mfSearchQuery.length > 0 ? (
                      <TouchableOpacity
                        onPress={() => {
                          onMfSearchChangeText('');
                          setMfSearchResults([]);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={s.mfClearTxt}>✕</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {mfSearchResults.length > 0 ? (
                    <FlatList
                      data={mfSearchResults}
                      keyExtractor={item => String(item.schemeCode)}
                      style={s.mfResultsList}
                      keyboardShouldPersistTaps="handled"
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          onPress={() => void handleMfFundSelect(item)}
                          style={s.mfResultRow}
                          activeOpacity={0.85}
                        >
                          <Text style={s.mfResultTitle}>{item.schemeName}</Text>
                          <Text style={s.mfResultSub}>Code: {item.schemeCode}</Text>
                        </TouchableOpacity>
                      )}
                    />
                  ) : null}

                  {loadingNav ? (
                    <View style={s.mfNavLoading}>
                      <ActivityIndicator size="small" color="#6C63FF" />
                      <Text style={s.mfNavLoadingTxt}>Loading NAV…</Text>
                    </View>
                  ) : null}

                  {fundNavData && selectedMfFund ? (
                    <View style={s.mfNavPreview}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.mfNavLabel}>CURRENT NAV</Text>
                        <Text style={s.mfNavValue}>{`₹${fundNavData.currentNAV.toFixed(2)}`}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={s.mfNavLabel}>1D CHANGE</Text>
                        <Text
                          style={[
                            s.mfNavStat,
                            { color: fundNavData.dayChange >= 0 ? '#38A169' : '#E53E3E' },
                          ]}
                        >
                          {`${fundNavData.dayChange >= 0 ? '+' : ''}${fundNavData.dayChange.toFixed(2)}%`}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={s.mfNavLabel}>1Y RETURN</Text>
                        <Text
                          style={[
                            s.mfNavStat,
                            { color: fundNavData.yearReturn >= 0 ? '#38A169' : '#E53E3E' },
                          ]}
                        >
                          {`${fundNavData.yearReturn >= 0 ? '+' : ''}${fundNavData.yearReturn.toFixed(2)}%`}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {fundNavData && selectedMfFund ? (
                    <>
                      <Text style={s.inputLabel}>Investment type</Text>
                      <View style={s.mfInvestRow}>
                        <TouchableOpacity
                          onPress={() => setMfInvestmentType('new')}
                          style={[
                            s.mfInvestCard,
                            mfInvestmentType === 'new' ? s.mfInvestCardActive : null,
                          ]}
                          activeOpacity={0.88}
                        >
                          <Text style={{ fontSize: 22 }}>🌱</Text>
                          <Text style={[s.mfInvestTitle, mfInvestmentType === 'new' ? { color: '#6C63FF' } : null]}>
                            New investment
                          </Text>
                          <Text style={s.mfInvestSub}>Starting fresh</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setMfInvestmentType('existing')}
                          style={[
                            s.mfInvestCard,
                            mfInvestmentType === 'existing' ? s.mfInvestCardActive : null,
                          ]}
                          activeOpacity={0.88}
                        >
                          <Text style={{ fontSize: 22 }}>📈</Text>
                          <Text style={[s.mfInvestTitle, mfInvestmentType === 'existing' ? { color: '#6C63FF' } : null]}>
                            Already invested
                          </Text>
                          <Text style={s.mfInvestSub}>Track existing fund</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : null}

                  {mfInvestmentType === 'new' ? (
                    <>
                      <Text style={s.inputLabel}>SIP amount</Text>
                      <View style={s.amountRow}>
                        <Text style={s.amountPrefix}>₹</Text>
                        <TextInput
                          value={mfSipAmount}
                          onChangeText={setMfSipAmount}
                          keyboardType="decimal-pad"
                          placeholder="Monthly amount"
                          placeholderTextColor="#CCCCCC"
                          style={s.amountInput}
                        />
                      </View>
                      <Text style={s.inputLabel}>SIP debit day (1–28)</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.mfDomRow}>
                        {Array.from({ length: 28 }, (_, i) => i + 1).map(dom => {
                          const on = mfSipDom === dom;
                          return (
                            <TouchableOpacity
                              key={dom}
                              style={[s.mfDomChip, on ? s.mfDomChipOn : null]}
                              onPress={() => setMfSipDom(dom)}
                              activeOpacity={0.85}
                            >
                              <Text style={[s.mfDomChipTxt, on ? { color: '#6C63FF' } : null]}>{dom}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                      <Text style={s.inputLabel}>Frequency</Text>
                      <View style={s.mfFreqRow}>
                        {(
                          [
                            { key: 'monthly' as const, label: 'Monthly' },
                            { key: 'quarterly' as const, label: 'Quarterly' },
                            { key: 'yearly' as const, label: 'Yearly' },
                          ]
                        ).map(opt => {
                          const on = assetFrequency === opt.key;
                          return (
                            <TouchableOpacity
                              key={opt.key}
                              style={[s.mfFreqPill, on ? s.mfFreqPillOn : null]}
                              onPress={() => setAssetFrequency(opt.key)}
                              activeOpacity={0.85}
                            >
                              <Text style={[s.mfFreqPillTxt, on ? { color: '#6C63FF' } : null]}>{opt.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {mfNewUnitsPreview != null ? (
                        <View style={s.mfPreviewCard}>
                          <Text style={s.mfPreviewLine}>{`At current NAV ₹${fundNavData?.currentNAV.toFixed(2) ?? '—'}:`}</Text>
                          <Text style={s.mfPreviewEmph}>{`You get ~${mfNewUnitsPreview.toFixed(3)} units per installment`}</Text>
                        </View>
                      ) : null}
                    </>
                  ) : null}

                  {mfInvestmentType === 'existing' ? (
                    <>
                      <Text style={s.inputLabel}>Holdings</Text>
                      <View style={s.mfToggleRow}>
                        <TouchableOpacity
                          style={[s.mfToggleBtn, mfExistingMode === 'units' ? s.mfToggleBtnOn : null]}
                          onPress={() => setMfExistingMode('units')}
                          activeOpacity={0.88}
                        >
                          <Text style={[s.mfToggleTxt, mfExistingMode === 'units' ? { color: '#6C63FF' } : null]}>Enter units</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.mfToggleBtn, mfExistingMode === 'amount' ? s.mfToggleBtnOn : null]}
                          onPress={() => setMfExistingMode('amount')}
                          activeOpacity={0.88}
                        >
                          <Text style={[s.mfToggleTxt, mfExistingMode === 'amount' ? { color: '#6C63FF' } : null]}>Enter amount</Text>
                        </TouchableOpacity>
                      </View>
                      {mfExistingMode === 'units' ? (
                        <>
                          <Text style={s.inputLabel}>Units held</Text>
                          <TextInput
                            value={mfUnitsInput}
                            onChangeText={setMfUnitsInput}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor="#CCCCCC"
                            style={s.input}
                          />
                        </>
                      ) : (
                        <>
                          <Text style={s.inputLabel}>Total invested</Text>
                          <View style={s.amountRow}>
                            <Text style={s.amountPrefix}>₹</Text>
                            <TextInput
                              value={mfInvestedAmountInput}
                              onChangeText={setMfInvestedAmountInput}
                              keyboardType="decimal-pad"
                              placeholder="0"
                              placeholderTextColor="#CCCCCC"
                              style={s.amountInput}
                            />
                          </View>
                        </>
                      )}
                      <Text style={s.inputLabel}>Average NAV (when you bought)</Text>
                      <View style={s.amountRow}>
                        <Text style={s.amountPrefix}>₹</Text>
                        <TextInput
                          value={mfAvgNavInput}
                          onChangeText={setMfAvgNavInput}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor="#CCCCCC"
                          style={s.amountInput}
                        />
                      </View>
                      {mfExistingPreview ? (
                        <View style={s.mfPreviewCard}>
                          <View style={s.mfPreviewRow}>
                            <Text style={s.mfPreviewLbl}>Invested</Text>
                            <Text style={s.mfPreviewVal}>{prettyAmountDecimals(mfExistingPreview.invested)}</Text>
                          </View>
                          <View style={s.mfPreviewRow}>
                            <Text style={s.mfPreviewLbl}>Current value</Text>
                            <Text
                              style={[
                                s.mfPreviewVal,
                                { color: mfExistingPreview.pnl >= 0 ? '#38A169' : '#E53E3E' },
                              ]}
                            >
                              {prettyAmountDecimals(mfExistingPreview.current)}
                            </Text>
                          </View>
                          <View style={s.mfPreviewRow}>
                            <Text style={s.mfPreviewLbl}>P&amp;L</Text>
                            <Text
                              style={[
                                s.mfPreviewVal,
                                { color: mfExistingPreview.pnl >= 0 ? '#38A169' : '#E53E3E' },
                              ]}
                            >
                              {`${mfExistingPreview.pnl >= 0 ? '+' : ''}${prettyAmountDecimals(mfExistingPreview.pnl)}`}
                            </Text>
                          </View>
                          <View style={s.mfPreviewRow}>
                            <Text style={s.mfPreviewLbl}>Returns</Text>
                            <Text
                              style={[
                                s.mfPreviewVal,
                                { color: mfExistingPreview.pnlPct >= 0 ? '#38A169' : '#E53E3E' },
                              ]}
                            >
                              {`${mfExistingPreview.pnlPct >= 0 ? '+' : ''}${mfExistingPreview.pnlPct.toFixed(2)}%`}
                            </Text>
                          </View>
                        </View>
                      ) : null}
                    </>
                  ) : null}

                  {mfInvestmentType === 'existing' || mfInvestmentType === 'new' ? (
                    <>
                      <Text style={s.inputLabel}>Type</Text>
                      <View style={s.typeRow}>
                        {TYPE_OPTIONS.map(opt => {
                          const selected = assetType === opt.key;
                          return (
                            <TouchableOpacity
                              key={opt.key}
                              style={[s.typeCard, selected ? s.typeCardActive : null]}
                              onPress={() => setAssetType(opt.key)}
                              activeOpacity={0.85}
                            >
                              <Text style={{ fontSize: 18 }}>{opt.icon}</Text>
                              <Text style={s.typeCardTxt}>{opt.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <Text style={s.inputLabel}>{mfInvestmentType === 'new' ? 'Calendar anchor (optional)' : 'Next SIP / review date'}</Text>
                      <TouchableOpacity
                        style={[s.input, s.datePickerInput]}
                        activeOpacity={0.85}
                        onPress={openDatePicker}
                      >
                        <Text style={s.datePickerTxt}>{assetDate}</Text>
                        <Text style={s.datePickerIcon}>📅</Text>
                      </TouchableOpacity>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={s.inputLabel}>Asset name</Text>
                  <TextInput
                    value={assetName}
                    onChangeText={setAssetName}
                    placeholder="e.g. HDFC Mutual Fund"
                    style={s.input}
                    returnKeyType="next"
                    autoFocus={false}
                  />

                  <Text style={s.inputLabel}>Date</Text>
                  <TouchableOpacity
                    style={[s.input, s.datePickerInput]}
                    activeOpacity={0.85}
                    onPress={openDatePicker}
                  >
                    <Text style={s.datePickerTxt}>{assetDate}</Text>
                    <Text style={s.datePickerIcon}>📅</Text>
                  </TouchableOpacity>

                  <Text style={s.inputLabel}>Type</Text>
                  <View style={s.typeRow}>
                    {TYPE_OPTIONS.map(opt => {
                      const selected = assetType === opt.key;
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          style={[s.typeCard, selected ? s.typeCardActive : null]}
                          onPress={() => setAssetType(opt.key)}
                          activeOpacity={0.85}
                        >
                          <Text style={{ fontSize: 18 }}>{opt.icon}</Text>
                          <Text style={s.typeCardTxt}>{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={s.inputLabel}>Current value</Text>
                  <View style={s.amountRow}>
                    <Text style={s.amountPrefix}>₹</Text>
                    <TextInput
                      value={assetAmount}
                      onChangeText={setAssetAmount}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor="#CCCCCC"
                      style={s.amountInput}
                    />
                  </View>

                  <Text style={s.inputLabel}>Returns % (optional)</Text>
                  <View style={s.pnlRow}>
                    <View style={s.gainLossWrap}>
                      <TouchableOpacity
                        style={[s.gainLossBtn, isGain && s.gainBtnActive]}
                        onPress={() => setIsGain(true)}
                        activeOpacity={0.85}
                      >
                        <Text style={[s.gainLossTxt, isGain && { color: '#38A169' }]}>+ Gain</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.gainLossBtn, !isGain && s.lossBtnActive]}
                        onPress={() => setIsGain(false)}
                        activeOpacity={0.85}
                      >
                        <Text style={[s.gainLossTxt, !isGain && { color: '#E53E3E' }]}>− Loss</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={s.pnlInputWrap}>
                      <TextInput
                        value={assetPnl}
                        onChangeText={setAssetPnl}
                        keyboardType="decimal-pad"
                        placeholder="0.0"
                        style={s.pnlInput}
                      />
                      <Text style={s.pnlSuffix}>%</Text>
                    </View>
                  </View>
                </>
              )}

              <TouchableOpacity
                style={[
                  s.saveBtn,
                  assetCategory === 'mutual_funds' ? mfSaveDisabled && s.saveBtnDisabled : nonMfSaveDisabled && s.saveBtnDisabled,
                ]}
                disabled={(assetCategory === 'mutual_funds' ? mfSaveDisabled : nonMfSaveDisabled) || isSaving}
                onPress={() => void saveAsset()}
                activeOpacity={0.9}
              >
                <Text style={s.saveBtnTxt}>{isSaving ? 'Saving...' : 'Add Asset'}</Text>
              </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
            {isDatePickerVisible ? (
              <View style={s.calendarOverlayRoot} pointerEvents="box-none">
                <Pressable style={s.calendarBackdrop} onPress={() => setIsDatePickerVisible(false)} />
                <View style={s.calendarModalCard} pointerEvents="auto">
                  <View style={s.calendarHeaderRow}>
                    <TouchableOpacity
                      style={s.calendarNavBtn}
                      onPress={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                    >
                      <Text style={s.calendarNavTxt}>{'<'}</Text>
                    </TouchableOpacity>
                    <Text style={s.calendarMonthTxt}>
                      {calendarMonth.toLocaleString('en-US', { month: 'long' })} {calendarMonth.getFullYear()}
                    </Text>
                    <TouchableOpacity
                      style={s.calendarNavBtn}
                      onPress={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                    >
                      <Text style={s.calendarNavTxt}>{'>'}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={s.weekdayRow}>
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                      <Text key={d} style={s.weekdayTxt}>{d}</Text>
                    ))}
                  </View>
                  {calendarWeeks.map((week, rowIdx) => (
                    <View key={`week-${rowIdx}`} style={s.calendarWeekRow}>
                      {week.map((day, colIdx) => {
                        const selected = !!day && assetDate === formatDateInput(day);
                        return (
                          <TouchableOpacity
                            key={`day-${rowIdx}-${colIdx}`}
                            style={[s.calendarDayCell, selected ? s.calendarDayCellActive : null]}
                            disabled={!day}
                            onPress={() => {
                              if (!day) return;
                              setAssetDate(formatDateInput(day));
                              setIsDatePickerVisible(false);
                            }}
                          >
                            <Text style={[s.calendarDayTxt, selected ? s.calendarDayTxtActive : null]}>
                              {day ? day.getDate() : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E17' },
  topSection: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: `${NAVY_SECTION_RATIO * 100}%`,
    backgroundColor: '#1A1A2E',
    zIndex: 2,
  },
  topSectionInner: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  netWorthWrap: {
    paddingHorizontal: 0,
    paddingTop: 16,
  },
  netWorthLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: FONT_UI as string,
  },
  netWorthRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  netWorthAmount: {
    fontSize: 32,
    color: '#FFFFFF',
    fontWeight: '700',
    fontFamily: FONT_MONO as string,
  },
  momPill: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  momText: { fontSize: 11, fontWeight: '600', fontFamily: FONT_UI as string },
  allocCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    marginHorizontal: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  allocLegendWrap: { flex: 1, paddingRight: 12 },
  allocTitle: { fontSize: 13, fontWeight: '600', color: '#FFFFFF', marginBottom: 8, fontFamily: FONT_UI as string },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontFamily: FONT_UI as string },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    zIndex: 5,
    paddingTop: 8,
  },
  sheetDragZone: {
    width: '100%',
    paddingTop: 0,
    paddingBottom: 4,
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 0,
    paddingBottom: 0,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D8DAE4',
    marginBottom: 12,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 120,
  },
  ledgerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  ledgerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A2E', fontFamily: FONT_UI as string },
  ledgerSub: { fontSize: 12, color: '#8888AA', marginTop: 2, fontFamily: FONT_UI as string },
  reportBtn: {
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  reportBtnTxt: { fontSize: 12, color: '#FFFFFF', fontWeight: '600', fontFamily: FONT_UI as string },
  addAssetInlineBtn: {
    backgroundColor: '#6C63FF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  addAssetInlineTxt: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: FONT_UI as string,
  },
  missionCarouselContent: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 12,
  },
  missionCarouselContentFlat: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    alignItems: 'stretch',
  },
  missionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    justifyContent: 'space-between',
    height: 90,
  },
  missionCardMf: {
    height: undefined,
    minHeight: 152,
    paddingVertical: 10,
  },
  missionEmptyCard: { borderColor: '#E2E8F0', justifyContent: 'center' },
  missionEmptyTxt: { fontSize: 13, color: '#8888AA', textAlign: 'center', fontFamily: FONT_UI as string },
  missionTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  missionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missionIcon: { fontSize: 16 },
  missionName: { fontSize: 11, fontWeight: '600', color: '#1A1A2E', fontFamily: FONT_UI as string },
  missionMeta: { fontSize: 9, color: '#8888AA', marginTop: 1, fontFamily: FONT_UI as string },
  missionFreqPill: {
    backgroundColor: 'rgba(108,99,255,0.1)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  missionFreqTxt: { fontSize: 8, fontWeight: '600', color: '#6C63FF', fontFamily: FONT_UI as string },
  missionFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  missionDueMini: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    fontFamily: FONT_UI as string,
  },
  missionDueHint: { fontSize: 9, color: '#38A169', marginTop: 2, fontFamily: FONT_UI as string },
  missionCountCol: { alignItems: 'flex-end', minWidth: 56 },
  missionCountdownNum: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontFamily: FONT_MONO as string,
    lineHeight: 26,
  },
  missionCountdownUnit: {
    fontSize: 8,
    fontWeight: '700',
    color: '#8888AA',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
    marginTop: 1,
    fontFamily: FONT_UI as string,
    textAlign: 'right',
  },
  historySectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  historyRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  historyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyIcon: { fontSize: 18 },
  historyName: { fontSize: 13, fontWeight: '600', color: '#1A1A2E', fontFamily: FONT_UI as string },
  historyDate: { fontSize: 11, color: '#8888AA', marginTop: 2, fontFamily: FONT_UI as string },
  historyAmount: { fontSize: 13, fontWeight: '700', color: '#38A169', fontFamily: FONT_MONO as string },
  assetCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  assetIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetIcon: { fontSize: 22 },
  assetInfo: { flex: 1, paddingLeft: 12 },
  assetName: { fontSize: 14, fontWeight: '600', color: '#1A1A2E', fontFamily: FONT_UI as string },
  typePill: {
    marginTop: 4,
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeRecurring: { backgroundColor: 'rgba(49,130,206,0.15)' },
  typeOneTime: { backgroundColor: 'rgba(108,99,255,0.15)' },
  typeLiquid: { backgroundColor: 'rgba(45,212,191,0.15)' },
  typeTxt: { fontSize: 10, fontWeight: '600', fontFamily: FONT_UI as string },
  typeRecurringTxt: { color: '#3182CE' },
  typeOneTimeTxt: { color: '#6C63FF' },
  typeLiquidTxt: { color: '#2DD4BF' },
  assetValueCol: { alignItems: 'flex-end' },
  assetAmount: { fontSize: 14, fontWeight: '600', color: '#1A1A2E', fontFamily: FONT_MONO as string },
  assetPnl: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
    fontFamily: FONT_MONO as string,
  },
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  editBtn: {
    backgroundColor: '#6C63FF',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    height: '100%',
  },
  deleteBtn: {
    backgroundColor: '#E53E3E',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    height: '100%',
  },
  swipeTxt: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', fontFamily: FONT_UI as string },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 64, paddingHorizontal: 16 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#1A1A2E', marginTop: 12, fontFamily: FONT_UI as string },
  emptySub: {
    fontSize: 13,
    color: '#8888AA',
    textAlign: 'center',
    marginTop: 6,
    fontFamily: FONT_UI as string,
  },
  emptyAddBtn: {
    backgroundColor: '#6C63FF',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 20,
  },
  emptyAddBtnTxt: { color: '#FFFFFF', fontWeight: '600', fontFamily: FONT_UI as string },
  modalRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 120,
    elevation: 120,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
    zIndex: 1,
  },
  modalSheetWrap: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    overflow: 'hidden',
    zIndex: 2,
    elevation: 130,
  },
  modalSheet: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 0,
    height: '100%',
  },
  modalDragZone: {
    paddingTop: 8,
    paddingBottom: 10,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D8DAE4',
    marginBottom: 10,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 2,
  },
  modalTitleInHeader: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A2E',
    fontFamily: FONT_UI as string,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F3F8',
  },
  modalCloseTxt: {
    fontSize: 18,
    color: '#64748B',
    fontWeight: '600',
    lineHeight: 20,
  },
  formContent: { paddingHorizontal: 0, paddingBottom: 42 },
  inputLabel: {
    fontSize: 12,
    color: '#8888AA',
    marginTop: 16,
    fontFamily: FONT_UI as string,
  },
  input: {
    backgroundColor: '#F8F8FC',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginTop: 6,
  },
  datePickerInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  datePickerTxt: { color: '#1A1A2E', fontSize: 15, fontFamily: FONT_UI as string },
  datePickerIcon: { fontSize: 16 },
  categoryRow: { paddingTop: 8, paddingBottom: 2 },
  categoryPill: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F0F8',
  },
  categoryPillTxt: { color: '#1A1A2E', fontSize: 12, fontWeight: '600', fontFamily: FONT_UI as string },
  typeRow: { flexDirection: 'row', marginHorizontal: -4, marginTop: 8 },
  typeCard: {
    flex: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    marginHorizontal: 4,
    backgroundColor: '#F8F8FC',
    borderWidth: 1,
    borderColor: '#E4E2F5',
  },
  typeCardActive: {
    backgroundColor: 'rgba(108,99,255,0.1)',
    borderWidth: 1.5,
    borderColor: '#6C63FF',
  },
  typeCardTxt: { fontSize: 11, fontWeight: '600', marginTop: 4, color: '#1A1A2E', fontFamily: FONT_UI as string },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F8FC',
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
  },
  amountPrefix: { fontSize: 18, color: '#1A1A2E', marginRight: 4 },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontFamily: FONT_MONO as string,
    fontWeight: '700',
    color: '#1A1A2E',
    paddingVertical: 0,
  },
  pnlRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  gainLossWrap: { flexDirection: 'row', backgroundColor: '#F2F3F8', borderRadius: 18, padding: 2 },
  gainLossBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  gainBtnActive: { backgroundColor: 'rgba(56,161,105,0.18)' },
  lossBtnActive: { backgroundColor: 'rgba(229,62,62,0.18)' },
  gainLossTxt: { fontSize: 12, fontWeight: '600', color: '#64748B', fontFamily: FONT_UI as string },
  pnlInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F8FC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pnlInput: { flex: 1, fontSize: 16, fontFamily: FONT_MONO as string, color: '#1A1A2E', paddingVertical: 0 },
  pnlSuffix: { fontSize: 14, color: '#64748B', fontFamily: FONT_UI as string },
  saveBtn: {
    backgroundColor: '#6C63FF',
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    marginBottom: 32,
    alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: '#C7CBD9' },
  saveBtnTxt: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: FONT_UI as string,
  },
  calendarOverlayRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: 18,
    zIndex: 300,
    elevation: 300,
  },
  calendarBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 1,
  },
  calendarModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    zIndex: 2,
    elevation: 24,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 360,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  calendarNavBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F3F8',
  },
  calendarNavTxt: {
    color: '#334155',
    fontSize: 16,
    fontWeight: '700',
  },
  calendarMonthTxt: {
    color: '#1A1A2E',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: FONT_UI as string,
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  weekdayTxt: {
    width: 36,
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  calendarWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  calendarDayCell: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayCellActive: {
    backgroundColor: 'rgba(108,99,255,0.16)',
  },
  calendarDayTxt: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  calendarDayTxtActive: {
    color: '#6C63FF',
    fontWeight: '700',
  },
  mfSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F8FC',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginTop: 6,
    gap: 8,
  },
  mfSearchIcon: { fontSize: 16 },
  mfSearchInput: { flex: 1, fontSize: 15, paddingVertical: 12, color: '#1A1A2E', fontFamily: FONT_UI as string },
  mfClearTxt: { fontSize: 16, color: '#8888AA', fontWeight: '600' },
  mfResultsList: {
    maxHeight: 200,
    backgroundColor: '#F8F8FC',
    borderRadius: 10,
    marginTop: 4,
  },
  mfResultRow: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E4E2F5',
  },
  mfResultTitle: { fontSize: 13, fontWeight: '600', color: '#1A1A2E', fontFamily: FONT_UI as string },
  mfResultSub: { fontSize: 11, color: '#8888AA', marginTop: 2, fontFamily: FONT_UI as string },
  mfNavLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  mfNavLoadingTxt: { fontSize: 12, color: '#8888AA', fontFamily: FONT_UI as string },
  mfNavPreview: {
    backgroundColor: '#F8F8FC',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mfNavLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#8888AA',
    letterSpacing: 0.6,
    fontFamily: FONT_UI as string,
  },
  mfNavValue: {
    fontSize: 16,
    fontFamily: FONT_MONO as string,
    fontWeight: '700',
    color: '#1A1A2E',
    marginTop: 4,
  },
  mfNavStat: { fontSize: 13, fontWeight: '600', marginTop: 4, fontFamily: FONT_MONO as string },
  mfInvestRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  mfInvestCard: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    backgroundColor: '#F8F8FC',
    borderWidth: 1.5,
    borderColor: '#E4E2F5',
  },
  mfInvestCardActive: {
    backgroundColor: 'rgba(108,99,255,0.1)',
    borderColor: '#6C63FF',
  },
  mfInvestTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1A2E',
    marginTop: 6,
    textAlign: 'center',
    fontFamily: FONT_UI as string,
  },
  mfInvestSub: {
    fontSize: 11,
    color: '#8888AA',
    textAlign: 'center',
    marginTop: 3,
    fontFamily: FONT_UI as string,
  },
  mfDomRow: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  mfDomChip: {
    minWidth: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F8FC',
    borderWidth: 1,
    borderColor: '#E4E2F5',
  },
  mfDomChipOn: {
    backgroundColor: 'rgba(108,99,255,0.12)',
    borderColor: '#6C63FF',
  },
  mfDomChipTxt: { fontSize: 13, fontWeight: '600', color: '#1A1A2E', fontFamily: FONT_MONO as string },
  mfFreqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  mfFreqPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F8F8FC',
    borderWidth: 1,
    borderColor: '#E4E2F5',
  },
  mfFreqPillOn: {
    backgroundColor: 'rgba(108,99,255,0.12)',
    borderColor: '#6C63FF',
  },
  mfFreqPillTxt: { fontSize: 12, fontWeight: '600', color: '#1A1A2E', fontFamily: FONT_UI as string },
  mfPreviewCard: {
    backgroundColor: '#F8F8FC',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  mfPreviewLine: { fontSize: 12, color: '#64748B', fontFamily: FONT_UI as string },
  mfPreviewEmph: { fontSize: 13, fontWeight: '600', color: '#1A1A2E', marginTop: 4, fontFamily: FONT_MONO as string },
  mfToggleRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  mfToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#F8F8FC',
    borderWidth: 1,
    borderColor: '#E4E2F5',
  },
  mfToggleBtnOn: {
    borderColor: '#6C63FF',
    backgroundColor: 'rgba(108,99,255,0.08)',
  },
  mfToggleTxt: { fontSize: 12, fontWeight: '600', color: '#64748B', fontFamily: FONT_UI as string },
  mfPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  mfPreviewLbl: { fontSize: 12, color: '#64748B', fontFamily: FONT_UI as string },
  mfPreviewVal: { fontSize: 13, fontWeight: '700', fontFamily: FONT_MONO as string, color: '#1A1A2E' },
  missionMfNavRow: { marginTop: 4 },
  missionMfNavTxt: { fontSize: 10, fontWeight: '600', color: '#3182CE', fontFamily: FONT_MONO as string },
  missionMfStats: { marginTop: 4, gap: 2 },
  missionMfStatLine: { fontSize: 9, color: '#64748B', fontFamily: FONT_UI as string },
  missionMfSync: { fontSize: 8, color: '#94A3B8', marginTop: 4, fontFamily: FONT_UI as string },
});

