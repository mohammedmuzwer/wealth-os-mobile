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
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, G } from 'react-native-svg';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
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
import { useIncomeHistoryStore, type IncomeHistoryEntry } from '../store/incomeHistoryStore';
import {
  createIncomeHistoryFirestoreRecord,
  deleteIncomeHistoryFirestoreRecord,
  updateIncomeHistoryFirestoreRecord,
} from '../services/incomeHistorySync';

type IncomeEngineScreenProps = {
  onBack?: () => void;
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

const SOURCE_SEED: IncomeSource[] = [
  {
    id: 'salary-apr',
    title: 'Salary_Apr',
    category: 'Salary',
    amount: 74000,
    date: '30 Apr',
    isRecurring: true,
    frequency: 'Monthly',
    kind: 'salary',
    badge: 'Recurring',
    status: 'Awaiting',
  },
  {
    id: 'freelance-apr',
    title: 'Freelance Project',
    category: 'Freelancer',
    amount: 10000,
    date: '24 Apr',
    isRecurring: false,
    kind: 'freelance',
    badge: 'Milestone',
    status: 'Awaiting',
  },
];
const INCOME_SOURCES_KEY = 'income_engine_sources_v1';

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

type MiniRingsProps = {
  shieldPct: number;
  trackPct: number;
  buildPct: number;
  score: number;
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
    <View style={s.miniRingsWrap}>
      <Svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
        {renderArc(rO, '#FF3B30', shieldPct / 100)}
        {renderArc(rM, '#34C759', trackPct / 100)}
        {renderArc(rI, '#32ADE6', Math.min(buildPct, 100) / 100)}
      </Svg>
    </View>
  );
};

const safeImpact = (style: Haptics.ImpactFeedbackStyle) => {
  Haptics.impactAsync(style).catch(() => {});
};

const money = (value: number, isPrivacyMode: boolean) =>
  isPrivacyMode ? '₹••••••' : `₹${Math.round(value).toLocaleString('en-IN')}`;

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

  return (
    <Animated.View style={[s.sourceCard, { width: cardWidth }, cardPulseStyle]}>
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
          <View style={s.sourceActionRow}>
            <TouchableOpacity style={s.sourceActionEditBtn} activeOpacity={0.85} onPress={() => onEditSource(item)}>
              <Text style={s.sourceActionTxt}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.sourceActionDeleteBtn} activeOpacity={0.85} onPress={() => onDeleteSource(item)}>
              <Text style={s.sourceActionTxt}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      {item.status === 'Awaiting' ? (
        <TouchableOpacity style={s.confirmBtn} activeOpacity={0.9} onPress={() => onConfirmPaid(item)}>
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

export const IncomeEngineScreen: React.FC<IncomeEngineScreenProps> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const { summary } = useFinancials();
  const { shieldPercentage, ovsScore } = useWealth();

  const { incomeHistory, addIncomeHistory, deleteIncomeHistory, updateIncomeHistory } = useIncomeHistoryStore();
  const [sources, setSources] = useState<IncomeSource[]>(SOURCE_SEED);
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
  const HEADER_HEIGHT = screenHeight * 0.4;
  const minimizedTop = screenHeight * 0.4;
  const expandedTop = insets.top + 8;
  const cardWidth = Math.round(screenWidth * 0.75);
  const cardGap = 12;
  const sidePadding = 16;
  const snapInterval = cardWidth + cardGap;

  const sheetTop = useSharedValue(minimizedTop);
  const pulseScale = useSharedValue(1);
  const pulsingSourceId = useSharedValue('');

  useEffect(() => {
    AsyncStorage.getItem('wos_privacy_mode')
      .then(value => setIsPrivacyMode(value === 'true'))
      .catch(() => {});
  }, []);

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

  const projectedTotal = useMemo(() => {
    // Projected total reflects only confirmed/paid income entries.
    return incomeHistory.reduce((sum, item) => {
      const net = Math.max(0, (item.amount ?? 0) - (item.deduction ?? 0));
      return sum + net;
    }, 0);
  }, [incomeHistory]);

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

  const progressStyle = useAnimatedStyle(() => {
    const p = interpolate(sheetTop.value, [expandedTop, minimizedTop], [1, 0], Extrapolation.CLAMP);
    return { opacity: p };
  });

  const historyStyle = useAnimatedStyle(() => {
    const p = interpolate(sheetTop.value, [expandedTop, minimizedTop], [1, 0], Extrapolation.CLAMP);
    return {
      opacity: withTiming(p, { duration: 180 }),
      transform: [{ translateY: withTiming((1 - p) * 18, { duration: 180 }) }],
    };
  });

  const carouselStyle = useAnimatedStyle(() => {
    const p = interpolate(sheetTop.value, [expandedTop, minimizedTop], [1, 0], Extrapolation.CLAMP);
    return {
      opacity: withTiming(1 - p, { duration: 120 }),
      transform: [{ translateY: withTiming(p * -10, { duration: 120 }) }],
    };
  });

  const titleSourcesStyle = useAnimatedStyle(() => {
    const p = interpolate(sheetTop.value, [expandedTop, minimizedTop], [1, 0], Extrapolation.CLAMP);
    return { opacity: withTiming(1 - p, { duration: 140 }) };
  });

  const titleHistoryStyle = useAnimatedStyle(() => {
    const p = interpolate(sheetTop.value, [expandedTop, minimizedTop], [1, 0], Extrapolation.CLAMP);
    return { opacity: withTiming(p, { duration: 140 }) };
  });

  const sheetStyle = useAnimatedStyle(() => ({
    top: sheetTop.value,
  }));

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
        sheetTop.value = withSpring(shouldExpand ? expandedTop : minimizedTop, {
          damping: 20,
          stiffness: 160,
        });
      },
      onPanResponderTerminate: () => {
        const shouldExpand = sheetTop.value < expandedTop + (minimizedTop - expandedTop) * 0.6;
        sheetTop.value = withSpring(shouldExpand ? expandedTop : minimizedTop, {
          damping: 20,
          stiffness: 160,
        });
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

      setSources(prev => prev.map(item => (item.id === source.id ? { ...item, status: 'Verified' } : item)));
      addIncomeHistory(entry);
      createIncomeHistoryFirestoreRecord(entry).catch(() => {});
      sheetTop.value = withSpring(expandedTop, {
        damping: 20,
        stiffness: 160,
      });
    },
    [addIncomeHistory, expandedTop, pulseScale, pulsingSourceId, sheetTop],
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

  const onSaveSourceEdit = () => {
    if (!sourceEditSheet.source) return;
    const nextAmount = Number(sourceEditSheet.amount);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) return;
    setSources(prev =>
      prev.map(item =>
        item.id === sourceEditSheet.source?.id
          ? {
              ...item,
              title: sourceEditSheet.title.trim() || item.title,
              category: sourceEditSheet.category,
              date: sourceEditSheet.date.trim() || item.date,
              amount: Math.round(nextAmount),
            }
          : item,
      ),
    );
    setSourceEditSheet(prev => ({ ...prev, visible: false, source: null }));
  };

  const onDeleteSource = (source: IncomeSource) => {
    safeImpact(Haptics.ImpactFeedbackStyle.Medium);
    setSources(prev => prev.filter(item => item.id !== source.id));
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

  const onSaveIncomeEntry = () => {
    const amountNum = Number(incomeAmount.replace(/,/g, '').trim());
    if (!incomeName.trim() || !Number.isFinite(amountNum) || amountNum <= 0) return;
    const id = `${incomeCategory.toLowerCase().replace(/\s/g, '-')}-${Date.now()}`;
    const kind: IncomeSource['kind'] = incomeCategory === 'Salary' ? 'salary' : 'freelance';
    const isRecurring = incomeRecurringType === 'Recurring';
    setSources(prev => [
      {
        id,
        title: incomeName.trim(),
        category: incomeCategory,
        amount: Math.round(amountNum),
        date: incomeDate,
        isRecurring,
        frequency: isRecurring ? incomeFrequency : undefined,
        kind,
        badge: isRecurring ? 'Recurring' : 'Milestone',
        status: 'Awaiting',
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
          <View style={s.historyActionInlineRow}>
            <TouchableOpacity style={s.inlineEditBtn} onPress={() => onOpenEdit(item)} activeOpacity={0.85}>
              <Text style={s.inlineActionTxt}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.inlineDeleteBtn} onPress={() => onDeleteHistory(item)} activeOpacity={0.85}>
              <Text style={s.inlineActionTxt}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Swipeable>
  );

  return (
      <View style={s.container}>
      <View style={[s.topSection, { height: HEADER_HEIGHT, paddingTop: insets.top + 10 }]}>
        <View style={s.topSectionInner}>
          <View style={s.headerRow}>
            <TouchableOpacity style={s.backCircleBtn} activeOpacity={0.85} onPress={onBack}>
              <Text style={s.backCircleArrow}>‹</Text>
            </TouchableOpacity>
            <View style={s.headerIconsRow}>
              <View style={s.osPill}>
                <Text style={s.osPillText}>OVS</Text>
                <Text style={s.osPillScore}>{ovsScore}</Text>
              </View>
              <MiniRings
                shieldPct={shieldPercentage}
                trackPct={summary.trackPct}
                buildPct={summary.buildPct}
                score={ovsScore}
              />
              <View style={s.bellWrap}>
                <Text style={s.bellIcon}>🔔</Text>
                <View style={s.bellDot} />
              </View>
            </View>
          </View>

          <View style={s.headerTitleRow}>
            <Text style={s.headerTitle}>Income Engine</Text>
          </View>
          <View style={s.projectedWrap}>
            <Text style={s.projectedLabel}>PROJECTED TOTAL</Text>
            <Text style={s.projectedAmount}>{money(projectedTotal, isPrivacyMode)}</Text>
          </View>
        </View>
      </View>

        <Animated.View style={[s.sheet, sheetStyle]}>
          <View style={s.handleWrap} {...panResponder.panHandlers}>
            <View style={s.handle} />
            <View style={s.titleStack}>
              <Animated.View style={[s.sourcesTitleRow, titleSourcesStyle]}>
                <Text style={s.sheetTitleLeft}>Income Sources</Text>
                <TouchableOpacity style={s.addIncomeFabInline} activeOpacity={0.85} onPress={() => setIsEntryModalVisible(true)}>
                  <Text style={s.addIncomeFabInlineTxt}>＋</Text>
                </TouchableOpacity>
              </Animated.View>
              <Animated.Text style={[s.sheetTitle, s.absoluteTitle, titleHistoryStyle]}>Income History</Animated.Text>
            </View>
          </View>

          <Animated.View style={[s.carouselWrap, carouselStyle]}>
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
              contentContainerStyle={[s.carouselContent, { paddingLeft: sidePadding, paddingRight: sidePadding }]}
              onScrollBeginDrag={() => safeImpact(Haptics.ImpactFeedbackStyle.Light)}
            />
          </Animated.View>

          <Animated.View style={[s.historyWrap, historyStyle]}>
            <FlatList
              data={incomeHistory}
              keyExtractor={item => item.id}
              renderItem={renderHistoryRow}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={<Text style={s.emptyTxt}>No verified handshakes yet.</Text>}
              contentContainerStyle={s.historyContent}
            />
          </Animated.View>
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
            </View>
            <ScrollView
              style={s.incomeSheetScroll}
              contentContainerStyle={[s.incomeSheetScrollContent, { paddingBottom: insets.bottom + 28 }]}
              showsVerticalScrollIndicator={false}
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
                    placeholder="Income Name"
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

                  <Text style={s.inputLabelIncome}>Date</Text>
                  <TouchableOpacity style={s.selectInput} activeOpacity={0.85} onPress={() => setIsCalendarPage(true)}>
                    <Text style={s.selectInputTxt}>{incomeDate}</Text>
                    <Text style={s.selectInputIcon}>📅</Text>
                  </TouchableOpacity>

                  <TextInput
                    style={s.incomeInput}
                    placeholder="Amount"
                    placeholderTextColor="#9CA3AF"
                    value={incomeAmount}
                    onChangeText={setIncomeAmount}
                    keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                  />

                  <Text style={s.inputLabelIncome}>Type</Text>
                  <View style={s.choiceRow}>
                    {(['Recurring', 'One time'] as const).map(type => (
                      <TouchableOpacity
                        key={type}
                        style={[s.choiceChip, incomeRecurringType === type && s.choiceChipActive]}
                        onPress={() => setIncomeRecurringType(type)}
                        activeOpacity={0.85}
                      >
                        <Text style={[s.choiceChipTxt, incomeRecurringType === type && s.choiceChipTxtActive]}>{type}</Text>
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

                  <TouchableOpacity style={s.saveIncomeBtn} activeOpacity={0.9} onPress={onSaveIncomeEntry}>
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
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Edit Income Source</Text>

            <Text style={s.inputLabel}>Income Name</Text>
            <TextInput value={sourceEditSheet.title} onChangeText={t => setSourceEditSheet(prev => ({ ...prev, title: t }))} style={s.input} />
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
            <TextInput value={sourceEditSheet.date} onChangeText={t => setSourceEditSheet(prev => ({ ...prev, date: t }))} style={s.input} />
            <Text style={s.inputLabel}>Amount</Text>
            <TextInput
              value={sourceEditSheet.amount}
              onChangeText={t => setSourceEditSheet(prev => ({ ...prev, amount: t }))}
              style={s.input}
              keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
            />

            <TouchableOpacity style={s.saveBtn} activeOpacity={0.9} onPress={onSaveSourceEdit}>
              <Text style={s.saveTxt}>Save</Text>
            </TouchableOpacity>
          </View>
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
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Edit Income Log</Text>

            <Text style={s.inputLabel}>Source Name</Text>
            <TextInput value={editSheet.sourceName} onChangeText={t => setEditSheet(prev => ({ ...prev, sourceName: t }))} style={s.input} />
            <Text style={s.inputLabel}>Date</Text>
            <TextInput value={editSheet.date} onChangeText={t => setEditSheet(prev => ({ ...prev, date: t }))} style={s.input} />
            <Text style={s.inputLabel}>Final Amount</Text>
            <TextInput value={editSheet.amount} onChangeText={t => setEditSheet(prev => ({ ...prev, amount: t }))} style={s.input} keyboardType="numeric" />
            <Text style={s.inputLabel}>Deduction</Text>
            <TextInput value={editSheet.deduction} onChangeText={t => setEditSheet(prev => ({ ...prev, deduction: t }))} style={s.input} keyboardType="numeric" />

            <TouchableOpacity style={s.saveBtn} activeOpacity={0.9} onPress={onSaveEdit}>
              <Text style={s.saveTxt}>Save</Text>
            </TouchableOpacity>
          </View>
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
    backgroundColor: '#0A0E21',
    zIndex: 2,
  },
  topSectionInner: { paddingHorizontal: 24, paddingBottom: 24 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerIconsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backCircleArrow: { color: '#FFFFFF', fontSize: 18, lineHeight: 18, textAlign: 'center', includeFontPadding: false },
  headerTitleRow: { marginTop: 24, alignItems: 'flex-start' },
  headerTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', letterSpacing: -0.3, fontFamily: FONT_UI as string },
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
    borderColor: '#0A0E21',
  },
  projectedWrap: { marginTop: 24 },
  projectedLabel: { color: '#8E8E93', fontSize: 10, fontWeight: '700', letterSpacing: 1.6, fontFamily: FONT_UI as string },
  projectedAmount: { marginTop: 6, color: '#FFFFFF', fontSize: 40, fontWeight: '900', letterSpacing: -1.1, fontFamily: FONT_MONO as string },

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
  titleStack: { height: 34, justifyContent: 'center', width: '100%' },
  sourcesTitleRow: {
    width: '100%',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
    fontFamily: FONT_UI as string,
  },
  sheetTitleLeft: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontFamily: FONT_UI as string,
  },
  absoluteTitle: { position: 'absolute', alignSelf: 'center' },

  carouselWrap: { paddingTop: 4 },
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
  sourceActionRow: { marginTop: 10, flexDirection: 'row', gap: 6 },
  sourceActionEditBtn: {
    minHeight: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#6C63FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceActionDeleteBtn: {
    minHeight: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceActionTxt: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', fontFamily: FONT_UI as string },
  confirmBtn: {
    marginTop: 14,
    borderRadius: 14,
    minHeight: 46,
    backgroundColor: '#6C63FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
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

  historyWrap: { flex: 1, paddingHorizontal: 16, paddingTop: 6 },
  historyContent: { paddingBottom: 130 },
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
  historyActionInlineRow: { marginTop: 6, flexDirection: 'row', gap: 6 },
  inlineEditBtn: {
    minHeight: 24,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#6C63FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineDeleteBtn: {
    minHeight: 24,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineActionTxt: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', fontFamily: FONT_UI as string },
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
    marginBottom: 8,
  },
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
