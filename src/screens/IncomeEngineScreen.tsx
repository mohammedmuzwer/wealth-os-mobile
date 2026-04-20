import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, G } from 'react-native-svg';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFinancials } from '../hooks/useFinancials';
import { useWealth } from '../context/WealthContext';
import { FONT_MONO, FONT_UI } from '../theme/tokens';
import { AppPageHeader } from '../components/AppPageHeader';
import { NAVY_SECTION_RATIO } from '../constants/pageLayout';
import { useIncomeHistoryStore, type IncomeHistoryEntry } from '../store/incomeHistoryStore';
import {
  createIncomeHistoryFirestoreRecord,
  deleteIncomeHistoryFirestoreRecord,
  updateUserSettingsFirestoreRecord,
  updateIncomeHistoryFirestoreRecord,
} from '../services/incomeHistorySync';
import {
  getIncome,
  saveIncome,
  getSettings,
  getExpenses,
  getIncomeSources,
  upsertIncomeSource,
  deleteIncomeSource,
} from '../utils/localStorage';

type IncomeEngineScreenProps = {
  onBack?: () => void;
  headerShieldPct?: number;
  headerTrackPct?: number;
  headerBuildPct?: number;
  headerOvrScore?: number;
};

type IncomeSource = {
  id: string;
  title: string;
  category: 'Salary' | 'Freelancer' | 'Home rent' | 'Other';
  amount: number;
  date: string;
  isRecurring: boolean;
  frequency?: 'Monthly' | 'Biweekly' | 'Weekly' | 'Quarterly' | 'Half yearly' | 'Yearly';
  kind: 'salary' | 'freelance';
  badge: 'Recurring' | 'Milestone';
  status: 'Awaiting' | 'Verified';
};

type EditSheetState = {
  visible: boolean;
  entry: IncomeHistoryEntry | null;
  sourceName: string;
  date: string;
  amount: string;
  deduction: string;
};

type SourceEditSheetState = {
  visible: boolean;
  source: IncomeSource | null;
  title: string;
  category: IncomeSource['category'];
  date: string;
  amount: string;
};

type FirestoreIncomeDoc = {
  id: string;
  amount: number;
  confirmed: boolean;
  expectedDate: Date | null;
  recurrenceType: string;
  title?: string;
  category?: string;
  frequency?: string;
};

const INCOME_SOURCES_KEY = 'income_engine_sources_v1';
const FIRESTORE_PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const FIRESTORE_USER_ID = process.env.EXPO_PUBLIC_FIREBASE_USER_ID;
const DONUT_RADIUS = 40;
const DONUT_STROKE = 12;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const safeImpact = (style: Haptics.ImpactFeedbackStyle) => {
  Haptics.impactAsync(style).catch(() => {});
};

const money = (value: number, isPrivacyMode: boolean) =>
  isPrivacyMode ? '₹••••••' : `₹${Math.round(value).toLocaleString('en-IN')}`;

const parseSourceDate = (date: string) => {
  const [dayRaw, monRaw] = date.trim().split(' ');
  const day = Number(dayRaw);
  const monthIdx = MONTH_NAMES.findIndex(m => m.slice(0, 3).toLowerCase() === (monRaw || '').toLowerCase());
  if (!Number.isFinite(day) || monthIdx < 0) return null;
  const now = new Date();
  return new Date(now.getFullYear(), monthIdx, day);
};

const getFirestoreNumber = (field: any): number => {
  if (!field) return 0;
  if (typeof field.integerValue === 'string') return Number(field.integerValue) || 0;
  if (typeof field.doubleValue === 'number') return field.doubleValue;
  return 0;
};

const getFirestoreBoolean = (field: any): boolean => field?.booleanValue === true;

const getFirestoreDate = (field: any): Date | null => {
  const raw = field?.timestampValue || field?.stringValue;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

type IncomeSourceCardProps = {
  item: IncomeSource;
  cardWidth: number;
  isPrivacyMode: boolean;
  pulseScale: SharedValue<number>;
  pulsingSourceId: SharedValue<string>;
  onConfirmPaid: (source: IncomeSource) => void;
  onEditSource: (source: IncomeSource) => void;
  onDeleteSource: (source: IncomeSource) => void;
};

const IncomeSourceCard: React.FC<IncomeSourceCardProps> = ({
  item,
  cardWidth,
  isPrivacyMode,
  pulseScale,
  pulsingSourceId,
  onConfirmPaid,
  onEditSource,
  onDeleteSource,
}) => {
  const cardPulseStyle = useAnimatedStyle(() => {
    const active = pulsingSourceId.value === item.id;
    return { transform: [{ scale: active ? pulseScale.value : 1 }] };
  });
  const expected = parseSourceDate(item.date);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const expectedStart = expected ? new Date(expected.getFullYear(), expected.getMonth(), expected.getDate()).getTime() : null;
  const dueNow = expectedStart !== null && expectedStart <= todayStart;
  const showNudge = item.status === 'Awaiting' && dueNow;

  return (
    <Animated.View style={[s.sourceCard, { width: cardWidth }, cardPulseStyle, showNudge && s.sourceCardDue]}>
      <View style={s.sourceRow}>
        <View style={s.sourceLeft}>
          <View style={s.sourceIconWrap}>
            <Text style={s.sourceIcon}>{item.kind === 'salary' ? '🤝' : '💼'}</Text>
          </View>
          <View style={s.sourceMeta}>
            <Text style={s.sourceTitle}>{item.title}</Text>
            <Text style={s.sourceBank}>{item.category} · {item.date}</Text>
            <Text style={[s.sourceStatus, item.status === 'Verified' ? s.tealStatus : s.awaitingStatus]}>
              {item.status}
            </Text>
          </View>
        </View>
        <View style={s.sourceRight}>
          <Text style={s.sourceAmount}>{money(item.amount, isPrivacyMode)}</Text>
          <View style={[s.badge, item.badge === 'Recurring' ? s.recurring : s.milestone]}>
            <Text style={s.badgeTxt}>{item.badge}</Text>
          </View>
        </View>
      </View>
      {showNudge ? <Text style={s.expectedNudge}>Expected today - arrived yet?</Text> : null}
      {item.status === 'Awaiting' ? (
        <TouchableOpacity
          style={[s.confirmBtn, dueNow ? s.confirmBtnActive : s.confirmBtnDisabled]}
          activeOpacity={0.9}
          disabled={!dueNow}
          onPress={() => onConfirmPaid(item)}
        >
          <Text style={s.confirmTxt}>MARK AS PAID (CONFIRM)</Text>
        </TouchableOpacity>
      ) : (
        <View style={s.verifiedPill}>
          <Text style={s.verifiedTxt}>Verified</Text>
        </View>
      )}
    </Animated.View>
  );
};

export const IncomeEngineScreen: React.FC<IncomeEngineScreenProps> = ({
  onBack,
  headerShieldPct,
  headerTrackPct,
  headerBuildPct,
  headerOvrScore,
}) => {
  const insets = useSafeAreaInsets();
  const { summary } = useFinancials();
  const { ovrScore, shieldPercentage } = useWealth();
  const resolvedShieldPct = headerShieldPct ?? shieldPercentage;
  const resolvedTrackPct = headerTrackPct ?? summary.trackPct;
  const resolvedBuildPct = headerBuildPct ?? summary.buildPct;
  const resolvedOvrScore = Math.round(headerOvrScore ?? ovrScore ?? 0);

  const { incomeHistory, addIncomeHistory, deleteIncomeHistory, updateIncomeHistory } = useIncomeHistoryStore();
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [isEntryModalVisible, setIsEntryModalVisible] = useState(false);
  const [isCalendarPage, setIsCalendarPage] = useState(false);
  const [incomeName, setIncomeName] = useState('');
  const [incomeCategory, setIncomeCategory] = useState<IncomeSource['category']>('Salary');
  const [incomeDate, setIncomeDate] = useState(() => {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, '0')} ${MONTH_NAMES[now.getMonth()].slice(0, 3)}`;
  });
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeRecurringType, setIncomeRecurringType] = useState<'Recurring' | 'One time'>('Recurring');
  const [incomeFrequency, setIncomeFrequency] = useState<
    'Monthly' | 'Biweekly' | 'Weekly' | 'Quarterly' | 'Half yearly' | 'Yearly'
  >('Monthly');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [allocationPct, setAllocationPct] = useState(10);
  const [isAllocationFlipped, setIsAllocationFlipped] = useState(false);
  const [incomeDocs, setIncomeDocs] = useState<FirestoreIncomeDoc[]>([]);
  const [totalSpentThisMonth, setTotalSpentThisMonth] = useState(0);
  const [editSheet, setEditSheet] = useState<EditSheetState>({
    visible: false,
    entry: null,
    sourceName: '',
    date: '',
    amount: '',
    deduction: '',
  });
  const [sourceEditSheet, setSourceEditSheet] = useState<SourceEditSheetState>({
    visible: false,
    source: null,
    title: '',
    category: 'Salary',
    date: '',
    amount: '',
  });
  const incomeNameInputRef = useRef<TextInput>(null);

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const [topSectionHeight, setTopSectionHeight] = useState(Math.round(screenHeight * NAVY_SECTION_RATIO));
  const minimizedTop = topSectionHeight;
  const expandedTop = insets.top + 8;
  /** Content width inside `topSectionInner` (paddingHorizontal 16 × 2). */
  const cardsRowInnerWidth = screenWidth - 32;
  /** Two equal cards with exactly 8px between (reliable on Android vs `gap`). */
  const collapsedCardWidth = (cardsRowInnerWidth - 8) / 2;
  const collapsedAllocationWidth = collapsedCardWidth;
  const expandedAllocationWidth = cardsRowInnerWidth;
  const cardWidth = Math.round(screenWidth * 0.7);
  const cardGap = 12;
  const sidePadding = 16;
  const snapInterval = cardWidth + cardGap;

  const sheetTop = useSharedValue(minimizedTop);
  const pulseScale = useSharedValue(1);
  const pulsingSourceId = useSharedValue('');
  const hasRunDonutIntro = useRef(false);
  const allocationArc = useSharedValue(0);
  const consumedArc = useSharedValue(0);

  useEffect(() => {
    AsyncStorage.getItem('wos_privacy_mode')
      .then(value => setIsPrivacyMode(value === 'true'))
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const incomeData = await getIncome();
      if (incomeData.allocationPct) {
        setAllocationPct(Math.max(1, Math.min(50, Math.round(incomeData.allocationPct))));
      }
    })();
  }, []);

  const refreshIncomeDocs = useCallback(async () => {
    const sources = await getIncomeSources();
    const parsed: FirestoreIncomeDoc[] = sources.map(s => ({
      id: s.id,
      amount: s.amount,
      confirmed: s.confirmed,
      expectedDate: s.expectedDate ? new Date(s.expectedDate) : null,
      recurrenceType: s.recurrenceType,
      title: s.title,
      category: s.category,
      frequency: s.frequency,
    }));
    setIncomeDocs(parsed);
  }, []);

  useEffect(() => {
    void refreshIncomeDocs();
  }, [refreshIncomeDocs]);

  useEffect(() => {
    let isMounted = true;

    const refreshExpenses = async () => {
      const expenses = await getExpenses();
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
      const total = expenses.reduce((sum, e) => {
        if (e.tag === 'fixed') return sum;
        const ts = new Date(e.date).getTime();
        if (ts < startOfMonth || ts >= endOfMonth) return sum;
        return sum + e.amount;
      }, 0);
      if (isMounted) setTotalSpentThisMonth(total);
    };

    void refreshExpenses();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const mapped: IncomeSource[] = incomeDocs
      .sort((a: any, b: any) => (b.expectedDate?.getTime?.() || 0) - (a.expectedDate?.getTime?.() || 0))
      .map((doc: any) => ({
        id: doc.id,
        title: doc.title || 'Income',
        category: (doc.category || 'Other') as IncomeSource['category'],
        amount: Math.max(0, doc.amount || 0),
        date: doc.expectedDate
          ? `${String(doc.expectedDate.getDate()).padStart(2, '0')} ${MONTH_NAMES[doc.expectedDate.getMonth()].slice(0, 3)}`
          : `${String(new Date().getDate()).padStart(2, '0')} ${MONTH_NAMES[new Date().getMonth()].slice(0, 3)}`,
        isRecurring: String(doc.recurrenceType || '').toLowerCase() === 'recurring',
        frequency: (doc.frequency || 'Monthly') as IncomeSource['frequency'],
        kind: (String(doc.category || '').toLowerCase().includes('salary') ? 'salary' : 'freelance') as IncomeSource['kind'],
        badge: String(doc.recurrenceType || '').toLowerCase() === 'recurring' ? 'Recurring' : 'Milestone',
        status: doc.confirmed ? 'Verified' : 'Awaiting',
      }));
    setSources(mapped);
  }, [incomeDocs]);

  useEffect(() => {
    const homeLogs = incomeHistory.map((entry, idx) => {
      const source = sources.find(item => item.id === entry.sourceId);
      const icon: 'briefcase' | 'palette' | 'home' | 'bank' =
        entry.sourceType === 'salary' ? 'briefcase' : source?.category === 'Home rent' ? 'home' : 'palette';
      return {
        id: Number(`${Date.now()}${idx}`),
        title: entry.sourceName,
        date: entry.date,
        amount: entry.amount,
        type: source?.isRecurring ? 'RECURRING' as const : 'MANUAL' as const,
        icon,
        createdAt: new Date().toISOString(),
      };
    });
    AsyncStorage.setItem(INCOME_SOURCES_KEY, JSON.stringify(homeLogs)).catch(() => {});
  }, [incomeHistory, sources]);

  useEffect(() => {
    if (!isEntryModalVisible || isCalendarPage) return;
    const timer = setTimeout(() => {
      incomeNameInputRef.current?.focus();
    }, 140);
    return () => clearTimeout(timer);
  }, [isEntryModalVisible, isCalendarPage]);

  const confirmedIncome = useMemo(() => {
    const now = new Date();
    return incomeDocs.reduce((sum, doc) => {
      if (!doc.confirmed) return sum;
      if (doc.expectedDate && (doc.expectedDate.getMonth() !== now.getMonth() || doc.expectedDate.getFullYear() !== now.getFullYear())) return sum;
      return sum + Math.max(0, doc.amount);
    }, 0);
  }, [incomeDocs]);
  const projectedTotal = confirmedIncome;
  const monthlyPool = useMemo(() => Math.floor(confirmedIncome * (allocationPct / 100)), [confirmedIncome, allocationPct]);
  const ieDailyBudgetRupees = Math.floor(monthlyPool / 30);
  const consumedPct = monthlyPool > 0 ? Math.min(Math.round((totalSpentThisMonth / monthlyPool) * 100), 100) : 0;
  const allocationSweepPct = Math.max(0, Math.min(allocationPct, 100));
  const consumedSweepPct = Math.max(0, Math.min((consumedPct / 100) * allocationSweepPct, allocationSweepPct));

  const daysElapsed = new Date().getDate();
  const expectedPct = Math.round(Math.max(0, Math.min((daysElapsed / 30) * 100, 100)));
  const paceTone =
    consumedPct <= expectedPct
      ? { label: 'PACE: ON TRACK', color: '#38A169' }
      : consumedPct <= expectedPct + 10
        ? { label: 'PACE: WATCH IT', color: '#D69E2E' }
        : { label: 'PACE: OVERSPENDING', color: '#E53E3E' };

  useEffect(() => {
    const duration = hasRunDonutIntro.current ? 300 : 1000;
    allocationArc.value = withTiming(allocationSweepPct / 100, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
    consumedArc.value = withTiming(consumedSweepPct / 100, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
    hasRunDonutIntro.current = true;
  }, [allocationSweepPct, consumedSweepPct, allocationArc, consumedArc]);

  const allocationArcProps = useAnimatedProps(() => ({
    strokeDashoffset: DONUT_CIRCUMFERENCE - DONUT_CIRCUMFERENCE * allocationArc.value,
  }));
  const consumedArcProps = useAnimatedProps(() => ({
    strokeDashoffset: DONUT_CIRCUMFERENCE - DONUT_CIRCUMFERENCE * consumedArc.value,
  }));

  const persistAllocationPct = useCallback(async (nextPct: number) => {
    const safePct = Math.max(1, Math.min(50, Math.round(nextPct)));
    const nextPool = Math.floor(confirmedIncome * (safePct / 100));
    const nextDaily = Math.floor(nextPool / 30);
    await saveIncome({
      allocationPct: safePct,
      monthlyPool: nextPool,
      activeDailyBudget: nextDaily,
    });
  }, [confirmedIncome]);

  const allocationWidthStyle = useAnimatedStyle(() => ({
    width: withSpring(isAllocationFlipped ? expandedAllocationWidth : collapsedAllocationWidth, {
      damping: 16,
      stiffness: 120,
      mass: 0.8,
    }),
    opacity: 1,
  }), [isAllocationFlipped, expandedAllocationWidth, collapsedAllocationWidth]);

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

  const todayStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }, []);

  // Sheet now uses continuous scroll content instead of split fades.

  const sheetStyle = useAnimatedStyle(() => ({
    top: sheetTop.value,
  }));

  useEffect(() => {
    sheetTop.value = minimizedTop;
  }, [minimizedTop, sheetTop]);

  const panStartTopRef = React.useRef(minimizedTop);
  const panResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > 5,
      onPanResponderGrant: () => {
        panStartTopRef.current = sheetTop.value;
      },
      onPanResponderMove: (_, g) => {
        const next = panStartTopRef.current + g.dy;
        sheetTop.value = Math.max(expandedTop, Math.min(minimizedTop, next));
      },
      onPanResponderRelease: (_, g) => {
        const shouldExpand =
          g.vy < -0.4 || sheetTop.value < expandedTop + (minimizedTop - expandedTop) * 0.6;
        sheetTop.value = withTiming(shouldExpand ? expandedTop : minimizedTop, { duration: 220 });
      },
      onPanResponderTerminate: () => {
        const shouldExpand = sheetTop.value < expandedTop + (minimizedTop - expandedTop) * 0.6;
        sheetTop.value = withTiming(shouldExpand ? expandedTop : minimizedTop, { duration: 220 });
      },
    }),
  ).current;

  const onConfirmPaid = useCallback(
    (source: IncomeSource) => {
      safeImpact(Haptics.ImpactFeedbackStyle.Medium);
      pulsingSourceId.value = source.id;
      pulseScale.value = 1;
      pulseScale.value = withTiming(1.04, { duration: 110 }, () => {
        pulseScale.value = withTiming(1, { duration: 180 });
      });

      const now = new Date();
      const date = source.date || now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      const entry: IncomeHistoryEntry = {
        id: `${source.id}-${Date.now()}`,
        sourceId: source.id,
        sourceName: source.title,
        sourceType: source.kind,
        date,
        amount: source.amount,
        deduction: 0,
      };

      setIncomeDocs(prev =>
        prev.map(item =>
          item.id === source.id
            ? {
                ...item,
                confirmed: true,
                expectedDate: item.expectedDate || new Date(),
              }
            : item,
        ),
      );
      addIncomeHistory(entry);
      createIncomeHistoryFirestoreRecord(entry).catch(() => {});
      // Persist confirmed status and updated budget to AsyncStorage
      upsertIncomeSource({
        id: source.id,
        title: source.title,
        category: source.category,
        amount: source.amount,
        date: source.date,
        isRecurring: source.isRecurring,
        frequency: source.frequency || 'Monthly',
        kind: source.kind,
        confirmed: true,
        expectedDate: new Date().toISOString(),
        recurrenceType: source.isRecurring ? 'recurring' : 'one_time',
      }).catch(() => {});
      saveIncome({
        activeDailyBudget: Math.floor(monthlyPool / 30),
        monthlyPool,
        salaryConfirmed: true,
        confirmedIncome: confirmedIncome + source.amount,
      }).catch(() => {});
    },
    [addIncomeHistory, expandedTop, pulseScale, pulsingSourceId, sheetTop, monthlyPool],
  );

  const onDeleteHistory = useCallback(
    (entry: IncomeHistoryEntry) => {
      safeImpact(Haptics.ImpactFeedbackStyle.Medium);
      deleteIncomeHistory(entry.id);
      setSources(prev =>
        prev.map(source =>
          source.id === entry.sourceId ? { ...source, status: 'Awaiting' } : source,
        ),
      );
      deleteIncomeHistoryFirestoreRecord(entry.id).catch(() => {});
    },
    [deleteIncomeHistory],
  );

  const onOpenEdit = (entry: IncomeHistoryEntry) => {
    setEditSheet({
      visible: true,
      entry,
      sourceName: entry.sourceName,
      date: entry.date,
      amount: String(entry.amount),
      deduction: String(entry.deduction ?? 0),
    });
  };

  const onOpenSourceEdit = (source: IncomeSource) => {
    setSourceEditSheet({
      visible: true,
      source,
      title: source.title,
      category: source.category,
      date: source.date,
      amount: String(source.amount),
    });
  };

  const onSaveSourceEdit = async () => {
    if (!sourceEditSheet.source) return;
    const nextAmount = Number(sourceEditSheet.amount);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) return;
    const sourceId = sourceEditSheet.source.id;
    console.log('Editing income id:', sourceId);
    if (!sourceId) return;
    setIncomeDocs(prev =>
      prev.map(item =>
        item.id === sourceId
          ? {
              ...item,
              title: sourceEditSheet.title.trim() || item.title,
              category: sourceEditSheet.category,
              amount: Math.round(nextAmount),
              expectedDate: parseSourceDate(sourceEditSheet.date.trim()) || item.expectedDate,
            }
          : item,
      ),
    );
    const nextExpected = parseSourceDate(sourceEditSheet.date.trim()) || new Date();
    await upsertIncomeSource({
      id: sourceId,
      title: sourceEditSheet.title.trim() || sourceEditSheet.source.title,
      category: sourceEditSheet.category,
      amount: Math.round(nextAmount),
      date: sourceEditSheet.date.trim() || sourceEditSheet.source.date,
      isRecurring: sourceEditSheet.source.isRecurring,
      frequency: sourceEditSheet.source.frequency || 'Monthly',
      kind: sourceEditSheet.source.kind,
      confirmed: sourceEditSheet.source.status === 'Verified',
      expectedDate: nextExpected.toISOString(),
      recurrenceType: sourceEditSheet.source.isRecurring ? 'recurring' : 'one_time',
    });
    await refreshIncomeDocs();
    setSourceEditSheet(prev => ({ ...prev, visible: false, source: null }));
  };

  const onDeleteSource = (source: IncomeSource) => {
    safeImpact(Haptics.ImpactFeedbackStyle.Medium);
    setIncomeDocs(prev => prev.filter(item => item.id !== source.id));
    deleteIncomeSource(source.id).catch(() => {});
    const linkedEntries = incomeHistory.filter(item => item.sourceId === source.id);
    linkedEntries.forEach(entry => {
      deleteIncomeHistory(entry.id);
      deleteIncomeHistoryFirestoreRecord(entry.id).catch(() => {});
    });
  };

  const onSaveEdit = () => {
    if (!editSheet.entry) return;
    const amount = Number(editSheet.amount);
    const deduction = Number(editSheet.deduction);
    if (!Number.isFinite(amount)) return;
    const patch = {
      sourceName: editSheet.sourceName.trim() || editSheet.entry.sourceName,
      date: editSheet.date.trim() || editSheet.entry.date,
      amount: Math.max(0, amount),
      deduction: Number.isFinite(deduction) ? Math.max(0, deduction) : 0,
    };
    updateIncomeHistory(editSheet.entry.id, patch);
    updateIncomeHistoryFirestoreRecord(editSheet.entry.id, patch).catch(() => {});
    setEditSheet(prev => ({ ...prev, visible: false, entry: null }));
  };

  const resetIncomeForm = () => {
    const now = new Date();
    setIncomeName('');
    setIncomeCategory('Salary');
    setIncomeDate(`${String(now.getDate()).padStart(2, '0')} ${MONTH_NAMES[now.getMonth()].slice(0, 3)}`);
    setIncomeAmount('');
    setIncomeRecurringType('Recurring');
    setIncomeFrequency('Monthly');
    setIsCalendarPage(false);
    setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const onSaveIncomeEntry = async () => {
    const amountNum = Number(incomeAmount.replace(/,/g, '').trim());
    if (!incomeName.trim() || !Number.isFinite(amountNum) || amountNum <= 0) return;
    const id = `${incomeCategory.toLowerCase().replace(/\s/g, '-')}-${Date.now()}`;
    const expected = parseSourceDate(incomeDate) || new Date();
    const recurrenceType = incomeRecurringType === 'Recurring' ? 'recurring' : 'one_time';
    const frequency = incomeRecurringType === 'Recurring' ? incomeFrequency : 'none';
    await upsertIncomeSource({
      id,
      title: incomeName.trim(),
      category: incomeCategory,
      amount: Math.round(amountNum),
      date: incomeDate,
      isRecurring: incomeRecurringType === 'Recurring',
      frequency,
      kind: incomeCategory === 'Salary' ? 'salary' : 'freelance',
      confirmed: false,
      expectedDate: expected.toISOString(),
      recurrenceType,
    });
    setIncomeDocs(prev => [
      {
        id,
        title: incomeName.trim(),
        category: incomeCategory,
        amount: Math.round(amountNum),
        confirmed: false,
        expectedDate: expected,
        recurrenceType,
        frequency,
      },
      ...prev,
    ]);
    setIsEntryModalVisible(false);
    resetIncomeForm();
  };

  const closeEntrySheet = useCallback(() => {
    Keyboard.dismiss();
    setIsEntryModalVisible(false);
    resetIncomeForm();
  }, [resetIncomeForm]);

  const entrySheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dy) > Math.abs(g.dx) && g.dy > 2,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: () => {},
        onPanResponderRelease: (_, g) => {
          if (g.dy > 28 || g.vy > 0.25) {
            closeEntrySheet();
            return;
          }
        },
      }),
    [closeEntrySheet],
  );
  const isSaveIncomeEnabled = incomeName.trim().length > 0 && Number(incomeAmount.replace(/,/g, '').trim()) > 0;
  const formStep = useMemo(() => {
    let done = 0;
    if (incomeName.trim()) done += 1;
    if (incomeCategory) done += 1;
    if (Number(incomeAmount.replace(/,/g, '').trim()) > 0) done += 1;
    if (incomeRecurringType === 'One time' || incomeFrequency) done += 1;
    return Math.max(1, Math.min(4, done));
  }, [incomeName, incomeCategory, incomeAmount, incomeRecurringType, incomeFrequency]);

  const renderSourceCard = ({ item }: { item: IncomeSource }) => (
    <IncomeSourceCard
      item={item}
      cardWidth={cardWidth}
      isPrivacyMode={isPrivacyMode}
      pulseScale={pulseScale}
      pulsingSourceId={pulsingSourceId}
      onConfirmPaid={onConfirmPaid}
      onEditSource={onOpenSourceEdit}
      onDeleteSource={onDeleteSource}
    />
  );

  const renderHistoryRow = ({ item }: { item: IncomeHistoryEntry }) => (
    <Swipeable
      friction={2}
      renderRightActions={() => (
        <View style={s.swipeActions}>
          <TouchableOpacity style={s.editBtn} onPress={() => onOpenEdit(item)} activeOpacity={0.85}>
            <Text style={s.swipeTxt}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.deleteBtn} onPress={() => onDeleteHistory(item)} activeOpacity={0.85}>
            <Text style={s.swipeTxt}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    >
      <View style={s.historyRow}>
        <View style={[s.historyDot, { backgroundColor: item.sourceType === 'salary' ? '#14B8A6' : '#6C63FF' }]} />
        <View style={s.historyMeta}>
          <Text style={s.historySource}>{item.sourceName}</Text>
          <Text style={s.historyDate}>{item.date}</Text>
        </View>
        <View style={s.historyAmountCol}>
          <Text style={s.historyAmount}>{money(item.amount, isPrivacyMode)}</Text>
          {(item.deduction ?? 0) > 0 ? (
            <Text style={s.historyDeduction}>
              {isPrivacyMode ? '-₹•••' : `-₹${(item.deduction ?? 0).toLocaleString('en-IN')}`}
            </Text>
          ) : null}
        </View>
      </View>
    </Swipeable>
  );

  return (
      <View style={s.container}>
      <View
        style={[s.topSection, { paddingTop: Platform.OS === 'ios' ? insets.top : 0 }]}
        onLayout={(e) => {
          const h = Math.ceil(e.nativeEvent.layout.height);
          if (h > 0 && h !== topSectionHeight) {
            // Keep the 42/58 template while still adapting for safe-area/header variance.
            const templateHeight = Math.round(screenHeight * NAVY_SECTION_RATIO);
            setTopSectionHeight(Math.max(templateHeight, h));
          }
        }}
      >
        <View style={s.topSectionInner}>
          <View
            style={{}}
          >
            <AppPageHeader
              title="Income Engine"
              onBack={onBack}
              ovrScore={resolvedOvrScore}
              shieldPct={resolvedShieldPct}
              trackPct={resolvedTrackPct}
              buildPct={resolvedBuildPct}
            />
          </View>
          <View style={s.topDataRow}>
            <View style={s.projectedWrap}>
              <Text style={s.projectedLabel}>PROJECTED TOTAL</Text>
              <Text style={s.projectedAmount}>{money(projectedTotal, isPrivacyMode)}</Text>
              {confirmedIncome <= 0 ? <Text style={s.projectedSub}>No income confirmed this month</Text> : null}
              {incomeDocs.length > 0 ? <Text style={s.projectedNote}>Only confirmed income is counted</Text> : null}
            </View>
            <View style={s.donutCol}>
              <View style={s.donutSvgWrap}>
                <Svg width={104} height={104} viewBox="0 0 104 104">
                  <G rotation="-90" originX="52" originY="52">
                    <Circle
                      cx="52"
                      cy="52"
                      r={DONUT_RADIUS}
                      stroke="#2A2A3E"
                      strokeWidth={DONUT_STROKE}
                      fill="none"
                    />
                    <AnimatedCircle
                      cx="52"
                      cy="52"
                      r={DONUT_RADIUS}
                      stroke="#6C63FF"
                      strokeWidth={DONUT_STROKE}
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={DONUT_CIRCUMFERENCE}
                      animatedProps={allocationArcProps}
                    />
                    <AnimatedCircle
                      cx="52"
                      cy="52"
                      r={DONUT_RADIUS}
                      stroke="#2DD4BF"
                      strokeWidth={DONUT_STROKE}
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={DONUT_CIRCUMFERENCE}
                      animatedProps={consumedArcProps}
                    />
                  </G>
                </Svg>
                <View style={s.donutCenter}>
                  <Text style={s.donutCenterPct}>{Math.round(consumedPct)}%</Text>
                  <Text style={s.donutCenterSub}>consumed</Text>
                </View>
              </View>
              <Text style={[s.donutPace, { color: paceTone.color }]}>{paceTone.label}</Text>
            </View>
          </View>

          <View style={s.topCardsRow}>
            <Animated.View
              style={[
                s.ieCardBase,
                s.allocationCardAbs,
                allocationWidthStyle,
                isAllocationFlipped ? s.allocationCardExpanded : null,
              ]}
            >
              {!isAllocationFlipped ? (
                <Pressable style={s.allocationFrontWrap} onPress={() => setIsAllocationFlipped(true)}>
                  <Text style={s.ieCardLabel}>DAILY ALLOCATION</Text>
                  <Text style={s.allocationFrontPct}>{allocationPct}%</Text>
                  <View style={s.allocationFrontBottom}>
                    <Text style={s.allocationFrontDaily}>
                      {isPrivacyMode
                        ? '₹•••/Day'
                        : confirmedIncome > 0
                          ? `₹${ieDailyBudgetRupees.toLocaleString('en-IN')}/Day`
                          : '₹–/Day'}
                    </Text>
                    <Text style={s.allocationFrontHint}>Tap →</Text>
                  </View>
                </Pressable>
              ) : (
                <View style={s.allocationBackWrap}>
                  <View style={s.allocationBackTop}>
                    <Text style={s.ieCardLabel}>DAILY ALLOCATION</Text>
                    <Text style={s.allocationDailyRight}>
                      {isPrivacyMode
                        ? '₹•••/Day'
                        : confirmedIncome > 0
                          ? `₹${ieDailyBudgetRupees.toLocaleString('en-IN')}/Day`
                          : '₹–/Day'}
                    </Text>
                  </View>
                  <Slider
                    style={s.allocationWideSlider}
                    minimumValue={1}
                    maximumValue={50}
                    step={1}
                    value={allocationPct}
                    onValueChange={val => {
                      const safe = Math.max(1, Math.min(50, Math.round(val)));
                      setAllocationPct(safe);
                    }}
                    onSlidingComplete={val => {
                      const safe = Math.max(1, Math.min(50, Math.round(val)));
                      void persistAllocationPct(safe);
                    }}
                    minimumTrackTintColor="#6C63FF"
                    maximumTrackTintColor="rgba(255,255,255,0.2)"
                    thumbTintColor="#6C63FF"
                  />
                  <View style={s.allocationBackBottom}>
                    <Text style={s.allocationMoText}>{allocationPct}% mo</Text>
                    <TouchableOpacity
                      style={s.allocationDoneBtnCompact}
                      activeOpacity={0.85}
                      onPress={() => setIsAllocationFlipped(false)}
                    >
                      <Text style={s.allocationDoneTxt}>DONE</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </Animated.View>

            <View style={[s.ieCardBase, s.consumedCardAbs, { width: collapsedCardWidth, opacity: 1 }]}>
              <Text style={s.ieCardLabel}>CONSUMED</Text>
              <Text style={s.consumedWideValue}>{Math.round(consumedPct)}%</Text>
              <Text style={[s.consumedWidePace, { color: paceTone.color }]}>{paceTone.label}</Text>
            </View>

            {isAllocationFlipped ? (
              <Pressable style={s.flipOverlay} onPress={() => setIsAllocationFlipped(false)} />
            ) : null}
          </View>
        </View>
      </View>

        <Animated.View style={[s.sheet, sheetStyle]} {...panResponder.panHandlers}>
          <View style={s.handleWrap} {...panResponder.panHandlers}>
            <View style={s.handle} />
            <View style={s.sourcesTitleRow}>
              <Text style={s.sheetTitleLeft}>Income Sources</Text>
              <TouchableOpacity style={s.addIncomeFabInline} activeOpacity={0.85} onPress={() => setIsEntryModalVisible(true)}>
                <Text style={s.addIncomeFabInlineTxt}>＋</Text>
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView
            style={s.sheetScroll}
            contentContainerStyle={s.sheetScrollContent}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
          <View style={s.carouselWrap}>
            <FlatList
              horizontal
              pagingEnabled={false}
              data={sources}
              keyExtractor={item => item.id}
              renderItem={renderSourceCard}
              showsHorizontalScrollIndicator={false}
              snapToAlignment="start"
              snapToInterval={snapInterval}
              disableIntervalMomentum
              decelerationRate="fast"
              bounces={false}
              contentContainerStyle={[s.carouselContent, { paddingLeft: sidePadding, paddingRight: sidePadding }]}
              onScrollBeginDrag={() => safeImpact(Haptics.ImpactFeedbackStyle.Light)}
              ListEmptyComponent={
                <View style={s.carouselEmpty}>
                  <Text style={s.carouselEmptyTitle}>No income sources yet</Text>
                  <Text style={s.carouselEmptySub}>Tap + to add your first income source</Text>
                </View>
              }
            />
          </View>
          <View style={s.historyHeaderRow}>
            <Text style={s.historyHeader}>Income History</Text>
          </View>
          <View style={s.historyWrap}>
            <FlatList
              data={incomeHistory}
              keyExtractor={item => item.id}
              renderItem={renderHistoryRow}
              showsVerticalScrollIndicator={false}
              bounces={false}
              scrollEnabled={false}
              ListEmptyComponent={<Text style={s.emptyTxt}>No verified handshakes yet.</Text>}
              contentContainerStyle={s.historyContent}
            />
          </View>
          </ScrollView>
        </Animated.View>

      <Modal
        visible={isEntryModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          closeEntrySheet();
        }}
        onDismiss={() => setIsEntryModalVisible(false)}
      >
        <View style={s.modalRoot}>
          <Pressable
            style={s.modalBackdrop}
            onPress={() => {
              closeEntrySheet();
            }}
          />
          <View
            style={[
              s.incomeSheetWrap,
              {
                marginTop: insets.top + 10,
                maxHeight: screenHeight - (insets.top + 10),
              },
            ]}
          >
          <KeyboardAvoidingView
            style={s.incomeSheet}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
          >
            <View style={s.modalHandleTouchArea} {...entrySheetPanResponder.panHandlers}>
              <View style={s.modalHandle} />
              <View style={s.incomeHeaderRow}>
                <Text style={s.incomeTitle}>Add Income</Text>
              </View>
              <View style={s.stepRow}>
                {[1, 2, 3, 4].map(step => (
                  <View key={step} style={[s.stepDot, step <= formStep && s.stepDotActive]} />
                ))}
              </View>
            </View>
            <ScrollView
              style={s.incomeSheetScroll}
              contentContainerStyle={[s.incomeSheetScrollContent, { paddingBottom: insets.bottom + 28 }]}
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {isCalendarPage ? (
                <View style={s.calendarWrap}>
                  <View style={s.calendarHeaderRow}>
                    <TouchableOpacity
                      style={s.calendarNavBtn}
                      onPress={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                      activeOpacity={0.8}
                    >
                      <Text style={s.calendarNavTxt}>{'<'}</Text>
                    </TouchableOpacity>
                    <Text style={s.calendarMonthTxt}>
                      {MONTH_NAMES[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
                    </Text>
                    <TouchableOpacity
                      style={s.calendarNavBtn}
                      onPress={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                      activeOpacity={0.8}
                    >
                      <Text style={s.calendarNavTxt}>{'>'}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={s.weekdayRow}>
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <Text key={day} style={s.weekdayTxt}>{day}</Text>
                    ))}
                  </View>
                  {calendarWeeks.map((week, idx) => (
                    <View key={`w-${idx}`} style={s.weekRow}>
                      {week.map((dateCell, cIdx) => {
                        if (!dateCell) return <View key={`e-${idx}-${cIdx}`} style={s.dateCell} />;
                        const cellStart = new Date(dateCell.getFullYear(), dateCell.getMonth(), dateCell.getDate()).getTime();
                        const isPast = cellStart < todayStart;
                        const isToday = cellStart === todayStart;
                        return (
                          <TouchableOpacity
                            key={`${dateCell.toISOString()}`}
                            style={[s.dateCell, isToday && s.dateTodayCell]}
                            activeOpacity={0.85}
                            onPress={() => {
                              setIncomeDate(`${String(dateCell.getDate()).padStart(2, '0')} ${MONTH_NAMES[dateCell.getMonth()].slice(0, 3)}`);
                              setIsCalendarPage(false);
                            }}
                          >
                            <Text style={[s.dateCellTxt, isPast ? s.datePastTxt : s.dateFutureTxt, isToday && s.dateTodayTxt]}>
                              {dateCell.getDate()}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>
              ) : (
                <View>
                  <TextInput
                    ref={incomeNameInputRef}
                    style={s.incomeInput}
                    placeholder="e.g. HDFC Salary"
                    placeholderTextColor="#9CA3AF"
                    value={incomeName}
                    onChangeText={setIncomeName}
                    returnKeyType="next"
                  />

                  <Text style={s.inputLabelIncome}>Category</Text>
                  <View style={s.choiceRow}>
                    {(['Salary', 'Freelancer', 'Home rent', 'Other'] as const).map(category => (
                      <TouchableOpacity
                        key={category}
                        style={[s.choiceChip, incomeCategory === category && s.choiceChipActive]}
                        onPress={() => setIncomeCategory(category)}
                        activeOpacity={0.85}
                      >
                        <Text style={[s.choiceChipTxt, incomeCategory === category && s.choiceChipTxtActive]}>{category}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={s.inputLabelIncome}>Expected by</Text>
                  <TouchableOpacity style={s.selectInput} activeOpacity={0.85} onPress={() => setIsCalendarPage(true)}>
                    <Text style={s.selectInputTxt}>{incomeDate}</Text>
                    <Text style={s.selectInputIcon}>📅</Text>
                  </TouchableOpacity>

                  <View style={s.amountWrap}>
                    <Text style={s.amountPrefix}>₹</Text>
                    <TextInput
                    style={s.incomeAmountInput}
                    placeholder="Amount"
                    placeholderTextColor="#9CA3AF"
                    value={incomeAmount}
                    onChangeText={setIncomeAmount}
                    keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                    />
                  </View>

                  <Text style={s.inputLabelIncome}>Type</Text>
                  <View style={s.typeRow}>
                    {(['Recurring', 'One time'] as const).map(type => (
                      <TouchableOpacity
                        key={type}
                        style={[s.typeCard, incomeRecurringType === type && s.typeCardActive]}
                        onPress={() => setIncomeRecurringType(type)}
                        activeOpacity={0.85}
                      >
                        <Text style={[s.typeCardTxt, incomeRecurringType === type && s.typeCardTxtActive]}>
                          {type === 'Recurring' ? '🔄 Recurring' : '1️⃣ One Time'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {incomeRecurringType === 'Recurring' ? (
                    <>
                      <Text style={s.inputLabelIncome}>Frequency</Text>
                      <View style={s.choiceRow}>
                        {(['Monthly', 'Biweekly', 'Weekly', 'Quarterly', 'Half yearly', 'Yearly'] as const).map(freq => (
                          <TouchableOpacity
                            key={freq}
                            style={[s.choiceChip, incomeFrequency === freq && s.choiceChipActive]}
                            onPress={() => setIncomeFrequency(freq)}
                            activeOpacity={0.85}
                          >
                            <Text style={[s.choiceChipTxt, incomeFrequency === freq && s.choiceChipTxtActive]}>{freq}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  ) : null}

                  <TouchableOpacity
                    style={[s.saveIncomeBtn, !isSaveIncomeEnabled && s.saveIncomeBtnDisabled]}
                    activeOpacity={0.9}
                    disabled={!isSaveIncomeEnabled}
                    onPress={onSaveIncomeEntry}
                  >
                    <Text style={s.saveIncomeTxt}>SAVE INCOME</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={sourceEditSheet.visible}
        transparent
        animationType="slide"
        onRequestClose={() => setSourceEditSheet(prev => ({ ...prev, visible: false, source: null }))}
      >
        <View style={s.modalRoot}>
          <Pressable style={s.modalBackdrop} onPress={() => setSourceEditSheet(prev => ({ ...prev, visible: false, source: null }))} />
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
              style={s.modalKeyboardWrap}
            >
              <View style={s.modalSheet}>
                <View style={s.modalHandle} />
                <Text style={s.modalTitle}>Edit Income Source</Text>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={s.editSourceScrollContent}
                >
                  <Text style={s.inputLabel}>Income Name</Text>
                  <TextInput
                    value={sourceEditSheet.title}
                    onChangeText={t => setSourceEditSheet(prev => ({ ...prev, title: t }))}
                    style={s.input}
                    autoFocus
                    returnKeyType="done"
                    blurOnSubmit
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <Text style={s.inputLabel}>Category</Text>
                  <View style={s.choiceRow}>
                    {(['Salary', 'Freelancer', 'Home rent', 'Other'] as const).map(category => (
                      <TouchableOpacity
                        key={category}
                        style={[s.choiceChip, sourceEditSheet.category === category && s.choiceChipActive]}
                        onPress={() => setSourceEditSheet(prev => ({ ...prev, category }))}
                        activeOpacity={0.85}
                      >
                        <Text style={[s.choiceChipTxt, sourceEditSheet.category === category && s.choiceChipTxtActive]}>{category}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={s.inputLabel}>Date</Text>
                  <TextInput
                    value={sourceEditSheet.date}
                    onChangeText={t => setSourceEditSheet(prev => ({ ...prev, date: t }))}
                    style={s.input}
                    returnKeyType="done"
                    blurOnSubmit
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <Text style={s.inputLabel}>Amount</Text>
                  <TextInput
                    value={sourceEditSheet.amount}
                    onChangeText={t => setSourceEditSheet(prev => ({ ...prev, amount: t }))}
                    style={s.input}
                    keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                    returnKeyType="done"
                    blurOnSubmit
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </ScrollView>
                <TouchableOpacity
                  style={s.saveBtn}
                  activeOpacity={0.9}
                  onPress={() => {
                    Keyboard.dismiss();
                    onSaveSourceEdit();
                  }}
                >
                  <Text style={s.saveTxt}>Save</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </Modal>

      <Modal
        visible={editSheet.visible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditSheet(prev => ({ ...prev, visible: false, entry: null }))}
      >
        <View style={s.modalRoot}>
          <Pressable style={s.modalBackdrop} onPress={() => setEditSheet(prev => ({ ...prev, visible: false, entry: null }))} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={60}
            style={s.modalKeyboardWrap}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={s.modalSheet}>
                <View style={s.modalHandle} />
                <Text style={s.modalTitle}>Edit Income Log</Text>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={s.editSourceScrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={s.inputLabel}>Source Name</Text>
                  <TextInput
                    value={editSheet.sourceName}
                    onChangeText={t => setEditSheet(prev => ({ ...prev, sourceName: t }))}
                    style={s.input}
                    keyboardType="default"
                    returnKeyType="done"
                    autoFocus
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <Text style={s.inputLabel}>Date</Text>
                  <TextInput
                    value={editSheet.date}
                    onChangeText={t => setEditSheet(prev => ({ ...prev, date: t }))}
                    style={s.input}
                    keyboardType="default"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <Text style={s.inputLabel}>Final Amount</Text>
                  <TextInput
                    value={editSheet.amount}
                    onChangeText={t => setEditSheet(prev => ({ ...prev, amount: t }))}
                    style={s.input}
                    keyboardType="numeric"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <Text style={s.inputLabel}>Deduction</Text>
                  <TextInput
                    value={editSheet.deduction}
                    onChangeText={t => setEditSheet(prev => ({ ...prev, deduction: t }))}
                    style={s.input}
                    keyboardType="numeric"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </ScrollView>
                <TouchableOpacity
                  style={s.saveBtn}
                  activeOpacity={0.9}
                  onPress={() => {
                    Keyboard.dismiss();
                    onSaveEdit();
                  }}
                >
                  <Text style={s.saveTxt}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E21' },
  topSection: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1A1A2E',
    zIndex: 2,
  },
  topSectionInner: { paddingHorizontal: 16, paddingBottom: 16 },
  topDataRow: { marginTop: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  projectedWrap: { marginTop: 0, flex: 1, paddingRight: 8 },
  projectedLabel: { color: '#8E8E93', fontSize: 10, fontWeight: '700', letterSpacing: 1.6, fontFamily: FONT_UI as string },
  projectedAmount: { marginTop: 6, color: '#FFFFFF', fontSize: 40, fontWeight: '900', letterSpacing: -1.1, fontFamily: FONT_MONO as string },
  projectedSub: { marginTop: 2, color: '#9CA3AF', fontSize: 11, fontFamily: FONT_UI as string },
  projectedNote: { marginTop: 2, color: 'rgba(255,255,255,0.5)', fontSize: 10, fontFamily: FONT_UI as string },
  donutCol: { width: 124, alignItems: 'center', justifyContent: 'flex-start' },
  donutSvgWrap: {
    position: 'relative',
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  donutCenterPct: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', textAlign: 'center', fontFamily: FONT_MONO as string },
  donutCenterSub: { color: 'rgba(255,255,255,0.5)', fontSize: 9, marginTop: 2, textAlign: 'center', fontFamily: FONT_UI as string },
  donutPace: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
    fontFamily: FONT_UI as string,
    textAlign: 'center',
  },
  topCardsRow: {
    marginTop: 10,
    marginBottom: 8,
    flexDirection: 'row',
    position: 'relative',
    height: 90,
  },
  ieCardBase: {
    backgroundColor: '#2A2D42',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3E4259',
    padding: 10,
    height: 90,
    opacity: 1,
    justifyContent: 'space-between',
  },
  allocationCardAbs: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
    zIndex: 10,
  },
  allocationCardExpanded: {
    borderColor: '#6C63FF',
    backgroundColor: '#323548',
  },
  allocationFrontWrap: { flex: 1, justifyContent: 'space-between' },
  allocationFrontPct: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    fontFamily: FONT_MONO as string,
  },
  allocationFrontBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  allocationFrontDaily: { color: '#6C63FF', fontSize: 11, fontFamily: FONT_MONO as string },
  allocationFrontHint: { color: 'rgba(255,255,255,0.4)', fontSize: 9, fontFamily: FONT_UI as string },
  ieCardLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    fontWeight: '700',
    fontFamily: FONT_UI as string,
  },
  allocationBackWrap: { flex: 1, justifyContent: 'space-between' },
  allocationBackTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  allocationBackBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  allocationWideSlider: { width: '100%', height: 24 },
  allocationMoText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontFamily: FONT_MONO as string,
  },
  consumedCardAbs: {
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
  consumedWideValue: {
    marginTop: 1,
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    fontFamily: FONT_MONO as string,
  },
  consumedWidePace: { fontSize: 10, fontWeight: '600', fontFamily: FONT_UI as string },
  flipOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  },
  smallCardLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    fontWeight: '700',
    fontFamily: FONT_UI as string,
  },
  allocationDailyRight: {
    color: '#6C63FF',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: FONT_MONO as string,
  },
  allocationDoneBtnCompact: {
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(108,99,255,0.3)',
    borderWidth: 1,
    borderColor: '#6C63FF',
  },
  allocationDoneTxt: {
    color: '#6C63FF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    fontFamily: FONT_UI as string,
  },
  modalKeyboardWrap: { width: '100%' },
  editSourceScrollContent: { paddingBottom: 18 },

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
  handleWrap: { alignItems: 'center', paddingBottom: 6 },
  handle: { width: 38, height: 4, borderRadius: 999, backgroundColor: '#D8DAE4', marginBottom: 12 },
  sourcesTitleRow: {
    width: '100%',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitleLeft: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontFamily: FONT_UI as string,
  },
  carouselWrap: { paddingTop: 4 },
  sheetScroll: { flex: 1 },
  sheetScrollContent: { paddingBottom: 110 },
  carouselEmpty: {
    width: Math.round(0.9 * 320),
    paddingVertical: 20,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
    marginRight: 8,
  },
  carouselEmptyTitle: { color: '#0F172A', fontSize: 14, fontWeight: '800', fontFamily: FONT_UI as string },
  carouselEmptySub: { marginTop: 4, color: '#64748B', fontSize: 12, fontFamily: FONT_UI as string },
  nextPaydayRow: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  nextPaydayTxt: { color: '#334155', fontSize: 13, fontWeight: '700', fontFamily: FONT_UI as string },
  carouselContent: { paddingHorizontal: 16, paddingBottom: 10 },
  sourceCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginRight: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4,
  },
  sourceCardDue: {
    borderColor: '#FB923C',
    borderWidth: 2,
  },
  sourceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sourceLeft: { flexDirection: 'row', flex: 1, paddingRight: 10 },
  sourceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sourceIcon: { fontSize: 20 },
  sourceMeta: { flexShrink: 1 },
  sourceTitle: { color: '#111827', fontSize: 15, fontWeight: '800', fontFamily: FONT_UI as string },
  sourceBank: { marginTop: 2, color: '#6B7280', fontSize: 12, fontWeight: '500', fontFamily: FONT_UI as string },
  sourceStatus: { marginTop: 8, fontSize: 12, fontWeight: '700', fontFamily: FONT_UI as string },
  tealStatus: { color: '#14B8A6' },
  awaitingStatus: { color: '#B45309' },
  sourceRight: { alignItems: 'flex-end' },
  sourceAmount: { color: '#111827', fontSize: 18, fontWeight: '800', fontFamily: FONT_MONO as string },
  badge: { marginTop: 10, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  recurring: { backgroundColor: '#EEF2FF' },
  milestone: { backgroundColor: '#F5F3FF' },
  badgeTxt: { color: '#4B5563', fontSize: 10, fontWeight: '800', letterSpacing: 0.3, fontFamily: FONT_UI as string },
  expectedNudge: { marginTop: 10, color: '#F97316', fontSize: 12, fontWeight: '700', fontFamily: FONT_UI as string },
  confirmBtn: {
    marginTop: 14,
    borderRadius: 14,
    minHeight: 46,
    backgroundColor: '#6C63FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnActive: { backgroundColor: '#2DD4BF' },
  confirmBtnDisabled: { backgroundColor: '#D1D5DB' },
  confirmTxt: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', letterSpacing: 0.6, fontFamily: FONT_UI as string },
  verifiedPill: {
    marginTop: 14,
    borderRadius: 14,
    minHeight: 46,
    backgroundColor: '#E6FFFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedTxt: { color: '#0F766E', fontSize: 13, fontWeight: '800', fontFamily: FONT_UI as string },

  historyHeaderRow: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 6 },
  historyHeader: { color: '#111827', fontSize: 22, fontWeight: '800', letterSpacing: -0.4, fontFamily: FONT_UI as string },
  historyWrap: { paddingHorizontal: 16, paddingTop: 0 },
  historyContent: { paddingBottom: 16 },
  emptyTxt: { textAlign: 'center', marginTop: 20, color: '#94A3B8', fontSize: 13, fontFamily: FONT_UI as string },
  swipeActions: { flexDirection: 'row', alignItems: 'stretch', marginBottom: 10 },
  editBtn: {
    width: 78,
    backgroundColor: '#6C63FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginRight: 8,
  },
  deleteBtn: {
    width: 78,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  swipeTxt: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', fontFamily: FONT_UI as string },
  historyRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  historyDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  historyMeta: { flex: 1 },
  historySource: { color: '#0F172A', fontSize: 14, fontWeight: '700', fontFamily: FONT_UI as string },
  historyDate: { marginTop: 2, color: '#64748B', fontSize: 12, fontWeight: '500', fontFamily: FONT_UI as string },
  historyAmountCol: { alignItems: 'flex-end', marginLeft: 8 },
  historyAmount: { color: '#0F172A', fontSize: 14, fontWeight: '800', fontFamily: FONT_MONO as string },
  historyDeduction: { marginTop: 2, color: '#DC2626', fontSize: 12, fontWeight: '700', fontFamily: FONT_MONO as string },
  addIncomeFabInline: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIncomeFabInlineTxt: { color: '#FFFFFF', fontSize: 18, lineHeight: 18, marginTop: -2 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  incomeSheetWrap: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    overflow: 'hidden',
  },
  incomeSheet: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 0,
    height: '100%',
  },
  incomeSheetScroll: { flex: 1 },
  incomeSheetScrollContent: { paddingBottom: 28 },
  incomeHeaderRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stepRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 8 },
  stepDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#D1D5DB' },
  stepDotActive: { backgroundColor: '#6C63FF' },
  incomeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1A2E',
    letterSpacing: -0.3,
    fontFamily: FONT_UI as string,
  },
  incomeInput: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 14,
    color: '#1A1A2E',
    fontSize: 15,
    fontFamily: FONT_UI as string,
    marginTop: 10,
  },
  amountWrap: {
    marginTop: 10,
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  amountPrefix: {
    color: '#1A1A2E',
    fontSize: 24,
    fontFamily: FONT_MONO as string,
    fontWeight: '900',
    marginRight: 8,
  },
  incomeAmountInput: {
    flex: 1,
    color: '#1A1A2E',
    fontSize: 24,
    fontWeight: '900',
    fontFamily: FONT_MONO as string,
  },
  typeRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  typeCard: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  typeCardActive: { borderColor: '#6C63FF', backgroundColor: '#F1EEFF' },
  typeCardTxt: { color: '#475569', fontSize: 13, fontWeight: '700', fontFamily: FONT_UI as string },
  typeCardTxtActive: { color: '#5B21B6' },
  inputLabelIncome: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.4,
    fontFamily: FONT_UI as string,
  },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceChip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceChipActive: { backgroundColor: '#EDE9FE', borderColor: '#6C63FF' },
  choiceChipTxt: { color: '#374151', fontSize: 12, fontWeight: '700', fontFamily: FONT_UI as string },
  choiceChipTxtActive: { color: '#6C63FF' },
  selectInput: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectInputTxt: { color: '#1A1A2E', fontSize: 14, fontWeight: '600', fontFamily: FONT_UI as string },
  selectInputIcon: { fontSize: 14 },
  saveIncomeBtn: {
    marginTop: 16,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6C63FF',
  },
  saveIncomeBtnDisabled: { backgroundColor: '#CBD5E1' },
  saveIncomeTxt: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.1,
    fontFamily: FONT_UI as string,
  },
  calendarWrap: { paddingTop: 8, paddingBottom: 6 },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  calendarNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarNavTxt: { fontSize: 16, fontWeight: '700', color: '#374151' },
  calendarMonthTxt: { fontSize: 17, fontWeight: '800', color: '#111827', fontFamily: FONT_UI as string },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 },
  weekdayTxt: {
    width: 38,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    fontFamily: FONT_UI as string,
  },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 },
  dateCell: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dateTodayCell: { backgroundColor: '#EFF6FF' },
  dateCellTxt: { fontSize: 14, fontWeight: '700', fontFamily: FONT_UI as string },
  datePastTxt: { color: '#C4C8D0' },
  dateFutureTxt: { color: '#2563EB' },
  dateTodayTxt: { color: '#0EA5E9' },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHandleTouchArea: {
    width: '100%',
    paddingTop: 10,
    paddingBottom: 10,
    alignItems: 'center',
  },
  modalTitle: { color: '#111827', fontSize: 18, fontWeight: '800', marginBottom: 8, fontFamily: FONT_UI as string },
  inputLabel: { color: '#6B7280', fontSize: 12, fontWeight: '700', marginTop: 8, marginBottom: 5, fontFamily: FONT_UI as string },
  input: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    color: '#111827',
    fontSize: 15,
    backgroundColor: '#F9FAFB',
    fontFamily: FONT_UI as string,
  },
  saveBtn: {
    marginTop: 16,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#6C63FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveTxt: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.4, fontFamily: FONT_UI as string },
});
