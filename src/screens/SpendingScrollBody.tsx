import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  Dimensions,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import {
  deleteSpendExpenseRemote,
  SpendExpense,
  useSpendingFirestoreData,
} from '../hooks/useSpendingFirestoreData';
import { NAVY_SECTION_RATIO } from '../constants/pageLayout';
import { FONT_MONO, FONT_UI } from '../theme/tokens';

const NAVY = '#1A1A2E';
const WHITE = '#FFFFFF';
const MUTED = '#8888AA';
const PURPLE = '#6C63FF';
const CRIMSON = '#E53E3E';
const TOOLTIP_BG = '#1E1E3A';

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const SPRING = { damping: 20, stiffness: 180, mass: 0.6 };
const TREEMAP_H = 150;
const GAP = 2;
const COL1_FR = 0.42;
const COL3_FR = 0.22;
const HEAT_COLS = 11;
const WHITE_CARD_MIN_HEIGHT = Dimensions.get('window').height * 0.62;
const SHEET_SPRING = {
  friction: 10,
  tension: 68,
  overshootClamping: true,
  useNativeDriver: false,
} as const;

type MonthRef = { year: number; month: number };

const addMonths = (ref: MonthRef, delta: number): MonthRef => {
  const d = new Date(ref.year, ref.month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
};

const formatMonthYearShort = (ref: MonthRef) =>
  `${MONTH_NAMES[ref.month]} ${ref.year}`;

const formatKey = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const moneyIn = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const safeImpactLight = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

const categoryTreemapColor = (category: string): string => {
  const c = category.toLowerCase();
  if (c.includes('emi') || c.includes('loan')) return '#6C63FF';
  if (c.includes('food')) return '#FF3B5C';
  if (c.includes('entertain')) return '#FFAA00';
  if (c.includes('health')) return '#2DD4BF';
  if (c.includes('transport')) return '#00B4FF';
  return '#8888AA';
};

const heatColor = (spend: number, dailyBudget: number, isFutureEmpty: boolean) => {
  if (isFutureEmpty) return '#2a2a3e';
  if (spend <= 0) return '#2a2a3e';
  const cap = Math.max(dailyBudget, 1);
  const pct = (spend / cap) * 100;
  if (pct <= 33) return '#534AB7';
  if (pct <= 66) return '#8b5cf6';
  return '#6C63FF';
};

type TreemapCell = {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  category: string;
  amount: number;
  pct: number;
  color: string;
};

const buildTreemapLayout = (
  sorted: { category: string; amount: number }[],
  total: number,
  W: number,
): TreemapCell[] => {
  if (!sorted.length || W <= 8 || total <= 0) return [];
  const inner = W - GAP * 2;
  const w1 = inner * COL1_FR;
  const w3 = inner * COL3_FR;
  const w2 = inner - w1 - w3;
  const x1 = 0;
  const x2 = w1 + GAP;
  const x3 = x2 + w2 + GAP;
  const cells: TreemapCell[] = [];
  const pctOf = (amt: number) => (amt / total) * 100;

  const push = (c: TreemapCell) => cells.push(c);

  const top1 = sorted[0];
  const top2 = sorted[1];
  const top3 = sorted[2];
  const rest = sorted.slice(3);

  if (top1) {
    push({
      key: top1.category,
      x: x1,
      y: 0,
      w: w1,
      h: TREEMAP_H,
      category: top1.category,
      amount: top1.amount,
      pct: pctOf(top1.amount),
      color: categoryTreemapColor(top1.category),
    });
  }

  if (top2 && top3) {
    const hHalf = (TREEMAP_H - GAP) / 2;
    push({
      key: top2.category,
      x: x2,
      y: 0,
      w: w2,
      h: hHalf,
      category: top2.category,
      amount: top2.amount,
      pct: pctOf(top2.amount),
      color: categoryTreemapColor(top2.category),
    });
    push({
      key: top3.category,
      x: x2,
      y: hHalf + GAP,
      w: w2,
      h: hHalf,
      category: top3.category,
      amount: top3.amount,
      pct: pctOf(top3.amount),
      color: categoryTreemapColor(top3.category),
    });
  } else if (top2) {
    push({
      key: top2.category,
      x: x2,
      y: 0,
      w: w2,
      h: TREEMAP_H,
      category: top2.category,
      amount: top2.amount,
      pct: pctOf(top2.amount),
      color: categoryTreemapColor(top2.category),
    });
  }

  if (rest.length) {
    const n = rest.length;
    const blockH = (TREEMAP_H - (n - 1) * GAP) / n;
    rest.forEach((r, i) => {
      push({
        key: `${r.category}-${i}`,
        x: x3,
        y: i * (blockH + GAP),
        w: w3,
        h: blockH,
        category: r.category,
        amount: r.amount,
        pct: pctOf(r.amount),
        color: categoryTreemapColor(r.category),
      });
    });
  }

  return cells;
};

type TooltipState = {
  dayKey: string;
  dateLabel: string;
  dominantCategory: string;
  total: number;
};

type LedgerSwipeRowProps = {
  expense: SpendExpense;
  onDelete: (id: string) => void;
};

const LedgerSwipeRow: React.FC<LedgerSwipeRowProps> = ({ expense, onDelete }) => {
  const x = useSharedValue(0);
  const startX = useSharedValue(0);
  const hapticDone = useSharedValue(false);

  const pan = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onBegin(() => {
      startX.value = x.value;
      hapticDone.value = false;
    })
    .onUpdate(e => {
      const next = Math.min(0, Math.max(-82, startX.value + e.translationX));
      x.value = next;
      if (next <= -50 && !hapticDone.value) {
        hapticDone.value = true;
        runOnJS(safeImpactLight)();
      }
    })
    .onEnd(() => {
      const open = x.value < -41;
      x.value = withSpring(open ? -82 : 0, SPRING);
      hapticDone.value = false;
    });

  const rowAnim = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  const onDeletePress = () => {
    void (async () => {
      const ok = await deleteSpendExpenseRemote(expense.id);
      if (ok) onDelete(expense.id);
    })();
  };

  const tag = expense.tag;
  const altIcon = expense.icon?.trim()
    ? expense.icon.trim().slice(0, 2)
    : (expense.name?.trim().charAt(0) || '₹').toUpperCase();

  return (
    <View style={ledgerStyles.wrap}>
      <View style={ledgerStyles.actions}>
        <TouchableOpacity style={[ledgerStyles.actBtn, { backgroundColor: PURPLE }]} activeOpacity={0.85}>
          <Text style={ledgerStyles.actTxt}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[ledgerStyles.actBtn, { backgroundColor: CRIMSON }]}
          onPress={onDeletePress}
          activeOpacity={0.85}
        >
          <Text style={ledgerStyles.actTxt}>Delete</Text>
        </TouchableOpacity>
      </View>
      <GestureDetector gesture={pan}>
        <Reanimated.View style={[ledgerStyles.row, rowAnim]}>
          <View style={[ledgerStyles.iconBox, expense.id.length % 2 === 0 ? ledgerStyles.iconA : ledgerStyles.iconB]}>
            <Text style={ledgerStyles.iconTxt}>{altIcon}</Text>
          </View>
          <View style={ledgerStyles.info}>
            <Text style={ledgerStyles.name}>{expense.name}</Text>
            <View style={ledgerStyles.tags}>
              {tag === 'fixed' ? (
                <Text style={ledgerStyles.tagFixed}>Fixed</Text>
              ) : null}
              {tag === 'system' ? (
                <Text style={ledgerStyles.tagSys}>System</Text>
              ) : null}
              {tag === 'variable' ? (
                <Text style={ledgerStyles.tagVar}>Variable</Text>
              ) : null}
            </View>
            <Text style={ledgerStyles.sub}>
              {expense.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {expense.category}
            </Text>
          </View>
          <Text style={ledgerStyles.amt}>{moneyIn(expense.amount)}</Text>
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
};

const ledgerStyles = StyleSheet.create({
  wrap: { marginBottom: 8, position: 'relative' },
  actions: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  actTxt: { color: '#fff', fontSize: 10, fontWeight: '700', fontFamily: FONT_UI as string },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8fc',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 10,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconA: { backgroundColor: '#EEEDFE' },
  iconB: { backgroundColor: '#FEF3C7' },
  iconTxt: { fontSize: 11, fontWeight: '700', color: '#1A1A2E' },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 11, fontWeight: '700', color: '#1A1A2E', fontFamily: FONT_UI as string },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  tagFixed: {
    fontSize: 8,
    fontWeight: '700',
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#EEF2FF',
    color: '#534AB7',
    fontFamily: FONT_UI as string,
  },
  tagSys: {
    fontSize: 8,
    fontWeight: '700',
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#F1EFE8',
    color: '#5F5E5A',
    fontFamily: FONT_UI as string,
  },
  tagVar: {
    fontSize: 8,
    fontWeight: '700',
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    fontFamily: FONT_UI as string,
  },
  sub: { marginTop: 2, fontSize: 8, color: '#aaa', fontFamily: FONT_UI as string },
  amt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A1A2E',
    fontFamily: FONT_MONO as string,
  },
});

export type SpendingScrollBodyProps = {
  activeDailyBudget: number;
  tabBarHeight: number;
};

export const SpendingScrollBody: React.FC<SpendingScrollBodyProps> = ({
  activeDailyBudget: fallbackBudget,
  tabBarHeight,
}) => {
  const screenHeight = Dimensions.get('window').height;
  const { expenses, activeDailyBudget, loading, error, removeExpenseLocal } =
    useSpendingFirestoreData(fallbackBudget);
  const [selectedMonth, setSelectedMonth] = useState<MonthRef>(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [bodyW, setBodyW] = useState(360);
  const [topSectionHeight, setTopSectionHeight] = useState(
    Math.round(screenHeight * NAVY_SECTION_RATIO),
  );
  const [analyticsMode, setAnalyticsMode] = useState<'selected' | 'prior'>('selected');
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [treemapFocus, setTreemapFocus] = useState<string | null>(null);
  const restoreTreemapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minimizedTop = topSectionHeight;
  const expandedTop = 8;
  const sheetTop = useRef(new RNAnimated.Value(Math.round(screenHeight * NAVY_SECTION_RATIO))).current;
  const sheetStartTopRef = useRef(minimizedTop);
  const sheetTrackedTopRef = useRef(minimizedTop);
  const sheetCurrentTopRef = useRef(minimizedTop);
  const scrollYRef = useRef(0);

  const dailyBudget = Math.max(activeDailyBudget, 1);

  const onBodyLayout = useCallback((e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    if (width > 0) setBodyW(width);
  }, []);

  useEffect(() => {
    sheetStartTopRef.current = minimizedTop;
    sheetCurrentTopRef.current = minimizedTop;
    sheetTrackedTopRef.current = minimizedTop;
    scrollYRef.current = 0;
    sheetTop.stopAnimation();
    sheetTop.setValue(minimizedTop);
  }, [minimizedTop, sheetTop]);

  const sheetPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => {
          if (Math.abs(g.dy) <= Math.abs(g.dx) || Math.abs(g.dy) <= 5) return false;
          if (scrollYRef.current > 2) return false;
          const topNow = sheetTrackedTopRef.current;
          if (g.dy < 0) return topNow >= minimizedTop - 10;
          if (g.dy > 0) return topNow <= minimizedTop - 10;
          return false;
        },
        onPanResponderGrant: () => {
          sheetTop.stopAnimation((value: number) => {
            sheetStartTopRef.current = value;
            sheetTrackedTopRef.current = value;
          });
        },
        onPanResponderMove: (_, g) => {
          const next = sheetStartTopRef.current + g.dy;
          const clamped = Math.max(expandedTop, Math.min(minimizedTop, next));
          sheetCurrentTopRef.current = clamped;
          sheetTrackedTopRef.current = clamped;
          sheetTop.setValue(clamped);
        },
        onPanResponderRelease: (_, g) => {
          const range = minimizedTop - expandedTop;
          const mid = expandedTop + range * 0.5;
          const pos = sheetCurrentTopRef.current;
          let toValue: number;
          if (g.vy < -0.22) toValue = expandedTop;
          else if (g.vy > 0.22) toValue = minimizedTop;
          else toValue = pos < mid ? expandedTop : minimizedTop;
          const vy = Math.max(-2800, Math.min(2800, g.vy));
          RNAnimated.spring(sheetTop, {
            toValue,
            ...SHEET_SPRING,
            velocity: vy,
          }).start(({ finished }) => {
            if (finished) sheetTrackedTopRef.current = toValue;
          });
        },
        onPanResponderTerminate: () => {
          RNAnimated.spring(sheetTop, {
            toValue: minimizedTop,
            ...SHEET_SPRING,
            velocity: 0,
          }).start(() => {
            sheetTrackedTopRef.current = minimizedTop;
          });
        },
      }),
    [expandedTop, minimizedTop, sheetTop],
  );

  const monthExpenses = useMemo(
    () =>
      expenses.filter(
        e => e.date.getFullYear() === selectedMonth.year && e.date.getMonth() === selectedMonth.month,
      ),
    [expenses, selectedMonth],
  );

  const priorMonthRef = useMemo(() => addMonths(selectedMonth, -1), [selectedMonth]);

  const priorMonthExpenses = useMemo(
    () =>
      expenses.filter(
        e => e.date.getFullYear() === priorMonthRef.year && e.date.getMonth() === priorMonthRef.month,
      ),
    [expenses, priorMonthRef],
  );

  const analyticsSource = analyticsMode === 'selected' ? monthExpenses : priorMonthExpenses;

  const totalSpent = useMemo(() => monthExpenses.reduce((s, e) => s + e.amount, 0), [monthExpenses]);

  const fixedTotal = useMemo(
    () => monthExpenses.filter(e => e.tag === 'fixed').reduce((s, e) => s + e.amount, 0),
    [monthExpenses],
  );
  const variableTotal = useMemo(
    () => monthExpenses.filter(e => e.tag === 'variable').reduce((s, e) => s + e.amount, 0),
    [monthExpenses],
  );
  const splitDenom = Math.max(1, fixedTotal + variableTotal);

  const categoryTotals = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of monthExpenses) {
      m[e.category] = (m[e.category] || 0) + e.amount;
    }
    return Object.entries(m)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [monthExpenses]);

  const treemapLayout = useMemo(
    () => buildTreemapLayout(categoryTotals, totalSpent, bodyW - 32),
    [categoryTotals, totalSpent, bodyW],
  );

  const perDay = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of monthExpenses) {
      const k = formatKey(e.date);
      m[k] = (m[k] || 0) + e.amount;
    }
    return m;
  }, [monthExpenses]);

  const calendarNow = new Date();
  const isViewingCurrentMonth =
    selectedMonth.year === calendarNow.getFullYear() && selectedMonth.month === calendarNow.getMonth();

  const daysInMonth = new Date(selectedMonth.year, selectedMonth.month + 1, 0).getDate();
  const heatRows = Math.ceil(daysInMonth / HEAT_COLS);
  const heatInnerW = bodyW - 28;
  const cell = (heatInnerW - (HEAT_COLS - 1) * 3) / HEAT_COLS;
  const scrollPad = 100;

  const categoryBars = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of analyticsSource) {
      m[e.category] = (m[e.category] || 0) + e.amount;
    }
    return Object.entries(m)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [analyticsSource]);

  const maxBar = Math.max(1, categoryBars[0]?.amount ?? 1);

  const ledgerGroups = useMemo(() => {
    const byDay: Record<string, SpendExpense[]> = {};
    for (const e of monthExpenses) {
      const k = formatKey(e.date);
      byDay[k] = byDay[k] || [];
      byDay[k].push(e);
    }
    const keys = Object.keys(byDay).sort((a, b) => (a > b ? -1 : 1));
    return keys.map(day => {
      const rows = byDay[day].slice().sort((a, b) => +b.date - +a.date);
      const dayTotal = rows.reduce((s, r) => s + r.amount, 0);
      return { day, rows, dayTotal };
    });
  }, [monthExpenses]);

  const cycleMonthNext = () => setSelectedMonth(m => addMonths(m, 1));
  const cycleMonthPrev = () => setSelectedMonth(m => addMonths(m, -1));

  useEffect(() => {
    if (!treemapFocus) return;
    if (restoreTreemapTimer.current) clearTimeout(restoreTreemapTimer.current);
    restoreTreemapTimer.current = setTimeout(() => {
      setTreemapFocus(null);
      restoreTreemapTimer.current = null;
    }, 1400);
    return () => {
      if (restoreTreemapTimer.current) clearTimeout(restoreTreemapTimer.current);
    };
  }, [treemapFocus]);

  const onTreemapCellPress = (cat: string) => {
    setTreemapFocus(prev => (prev === cat ? null : cat));
  };

  const dominantCategoryForDay = (dayKey: string): string => {
    const rows = monthExpenses.filter(e => formatKey(e.date) === dayKey);
    const map: Record<string, number> = {};
    for (const e of rows) map[e.category] = (map[e.category] || 0) + e.amount;
    let best = 'Other';
    let bestAmt = -1;
    for (const [c, a] of Object.entries(map)) {
      if (a > bestAmt) {
        bestAmt = a;
        best = c;
      }
    }
    return best;
  };

  const tooltipY = useSharedValue(20);

  useEffect(() => {
    if (!tooltip) {
      tooltipY.value = 20;
      return;
    }
    tooltipY.value = 20;
    tooltipY.value = withSpring(0, SPRING);
  }, [tooltip, tooltipY]);

  const tooltipAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: tooltipY.value }],
  }));

  const openDayTooltip = (day: number, dayKey: string, spend: number) => {
    if (spend <= 0) return;
    const d = new Date(selectedMonth.year, selectedMonth.month, day);
    const dateLabel = d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    setTooltip({
      dayKey,
      dateLabel,
      dominantCategory: dominantCategoryForDay(dayKey),
      total: spend,
    });
  };

  const dismissTooltip = () => setTooltip(null);

  const treemapW = bodyW - 32;

  return (
    <View style={styles.flex} onLayout={onBodyLayout}>
      <View
        style={styles.navySection}
        onLayout={(e) => {
          const h = Math.ceil(e.nativeEvent.layout.height);
          if (h > 0 && h !== topSectionHeight) {
            const templateHeight = Math.round(screenHeight * NAVY_SECTION_RATIO);
            setTopSectionHeight(Math.max(templateHeight, h));
          }
        }}
      >
        <View style={styles.mmHeaderRow}>
          <Text style={styles.mmTitle}>Money Map</Text>
          <TouchableOpacity
            style={styles.monthPill}
            onPress={cycleMonthNext}
            onLongPress={cycleMonthPrev}
            delayLongPress={280}
            activeOpacity={0.85}
          >
            <Text style={styles.monthPillTxt}>
              {formatMonthYearShort(selectedMonth)} <Text style={styles.monthPillCaret}>▾</Text>
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.totalAmt}>{moneyIn(totalSpent)}</Text>
        <Text style={styles.totalLbl}>spent this month</Text>

        <View style={[styles.treemapOuter, { width: treemapW }]}>
          {treemapLayout.length ? (
            <>
              <Svg width={treemapW} height={TREEMAP_H} pointerEvents="none">
                {treemapLayout.map(cell => {
                  const dim = treemapFocus && treemapFocus !== cell.category ? 0.35 : 1;
                  const fill = cell.color;
                  return (
                    <Rect
                      key={cell.key}
                      x={cell.x}
                      y={cell.y}
                      width={Math.max(0, cell.w)}
                      height={Math.max(0, cell.h)}
                      rx={6}
                      ry={6}
                      fill={fill}
                      opacity={dim}
                    />
                  );
                })}
              </Svg>
              <View style={[StyleSheet.absoluteFillObject, { pointerEvents: 'box-none' }]} pointerEvents="box-none">
                {treemapLayout.map(cell => {
                  const dim = treemapFocus && treemapFocus !== cell.category ? 0.35 : 1;
                  return (
                    <Pressable
                      key={`${cell.key}-lbl`}
                      style={[
                        styles.treemapLblWrap,
                        {
                          left: cell.x,
                          top: cell.y,
                          width: cell.w,
                          height: cell.h,
                          opacity: dim,
                        },
                      ]}
                      onPress={() => onTreemapCellPress(cell.category)}
                    >
                      <Text style={styles.treemapCat} numberOfLines={2}>
                        {cell.category}
                      </Text>
                      <Text style={styles.treemapMoney}>{moneyIn(cell.amount)}</Text>
                      <Text style={styles.treemapPct}>{Math.round(cell.pct)}%</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : (
            <View style={[styles.treemapEmpty, { width: treemapW }]}>
              <Text style={styles.treemapEmptyTxt}>{loading ? 'Loading…' : 'No spend this month'}</Text>
            </View>
          )}
        </View>

        <Text style={styles.vfLabel}>VARIABLE VS FIXED</Text>
        <View style={styles.vfTrack}>
          <View
            style={[
              styles.vfFixed,
              {
                flex: fixedTotal + variableTotal > 0 ? fixedTotal : 1,
              },
            ]}
          />
          <View
            style={[
              styles.vfVar,
              {
                flex: fixedTotal + variableTotal > 0 ? variableTotal : 1,
              },
            ]}
          />
        </View>
        <View style={styles.vfLegendRow}>
          <View style={styles.vfLeft}>
            <View style={[styles.vfDot, { backgroundColor: PURPLE }]} />
            <Text style={styles.vfMono}>
              Fixed {moneyIn(fixedTotal)}
            </Text>
          </View>
          <View style={styles.vfRight}>
            <View style={[styles.vfDot, { backgroundColor: CRIMSON }]} />
            <Text style={styles.vfMono}>
              Variable {moneyIn(variableTotal)}
            </Text>
          </View>
        </View>
        {error ? <Text style={styles.errTxt}>{error}</Text> : null}
      </View>

      <RNAnimated.View
        style={[styles.whiteSheet, { top: sheetTop }]}
        {...sheetPan.panHandlers}
      >
        <View style={styles.sheetHandleWrap} {...sheetPan.panHandlers}>
          <View style={styles.sheetHandle} />
        </View>
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={[styles.whiteCardShell, { paddingBottom: scrollPad }]}
          bounces={false}
          showsVerticalScrollIndicator={false}
          onScroll={e => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heatTitleRow}>
            <Text style={styles.whiteSecTitle}>Monthly Heatmap</Text>
            <View style={styles.legend}>
              <Text style={styles.legendTxt}>Low</Text>
              {['#2a2a3e', '#534AB7', '#8b5cf6', '#6C63FF'].map(c => (
                <View key={c} style={[styles.legendSwatch, { backgroundColor: c }]} />
              ))}
              <Text style={styles.legendTxt}>High</Text>
            </View>
          </View>

          <View style={styles.heatMapWrap}>
            {Array.from({ length: heatRows }, (_, row) => (
              <View key={`heat-row-${row}`} style={[styles.heatRow, { width: heatInnerW }]}>
                {Array.from({ length: HEAT_COLS }, (_, col) => {
                  const day = row * HEAT_COLS + col + 1;
                  if (day > daysInMonth) {
                    return (
                      <View key={`pad-${row}-${col}`} style={[styles.heatCol, { width: cell }]}>
                        <View style={[styles.heatCell, { width: cell, height: cell, backgroundColor: '#2a2a3e' }]} />
                        <Text style={styles.dayNum}> </Text>
                      </View>
                    );
                  }
                  const isFuture = isViewingCurrentMonth && day > calendarNow.getDate();
                  const key = formatKey(new Date(selectedMonth.year, selectedMonth.month, day));
                  const spend = perDay[key] || 0;
                  const bg = heatColor(spend, dailyBudget, isFuture);
                  const canTap = spend > 0 && !isFuture;
                  return (
                    <View key={key} style={[styles.heatCol, { width: cell }]}>
                      <Pressable
                        disabled={!canTap}
                        onPress={() => openDayTooltip(day, key, spend)}
                        style={[
                          styles.heatCell,
                          { width: cell, height: cell, backgroundColor: isFuture ? '#2a2a3e' : bg },
                        ]}
                      />
                      <Text style={styles.dayNum}>{day}</Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          <View style={styles.catHeader}>
            <Text style={styles.whiteSecTitle}>Category Analytics</Text>
            <View style={styles.toggle}>
              <TouchableOpacity
                onPress={() => setAnalyticsMode('selected')}
                style={[styles.toggleSeg, analyticsMode === 'selected' && styles.toggleOn]}
                activeOpacity={0.9}
              >
                <Text style={[styles.toggleTxt, analyticsMode === 'selected' && styles.toggleTxtOn]}>Selected</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setAnalyticsMode('prior')}
                style={[styles.toggleSeg, analyticsMode === 'prior' && styles.toggleOn]}
                activeOpacity={0.9}
              >
                <Text style={[styles.toggleTxt, analyticsMode === 'prior' && styles.toggleTxtOn]}>Prior</Text>
              </TouchableOpacity>
            </View>
          </View>

          {categoryBars.length ? (
            categoryBars.map(row => (
              <View key={row.category} style={{ marginBottom: 9 }}>
                <View style={styles.barTop}>
                  <Text style={styles.barName}>{row.category}</Text>
                  <Text style={styles.barAmt}>{moneyIn(row.amount)}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${(row.amount / maxBar) * 100}%`,
                        backgroundColor: categoryTreemapColor(row.category),
                      },
                    ]}
                  />
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>No category spend for this period.</Text>
          )}

          <Text style={[styles.whiteSecTitle, { marginTop: 6 }]}>Transaction Ledger</Text>
          {ledgerGroups.length ? (
            ledgerGroups.map(g => (
              <View key={g.day} style={{ marginTop: 10 }}>
                <View style={styles.ledgerDayRow}>
                  <Text style={styles.ledgerDayLeft}>{new Date(g.day).toDateString()}</Text>
                  <Text style={styles.ledgerDayRight}>{moneyIn(g.dayTotal)}</Text>
                </View>
                {g.rows.map(ex => (
                  <LedgerSwipeRow key={ex.id} expense={ex} onDelete={removeExpenseLocal} />
                ))}
              </View>
            ))
          ) : (
            <Text style={styles.empty}>No transactions this month.</Text>
          )}
        </ScrollView>
      </RNAnimated.View>

      <Modal visible={!!tooltip} transparent animationType="none" onRequestClose={dismissTooltip}>
        <Pressable style={[styles.modalFill, { paddingBottom: scrollPad }]} onPress={dismissTooltip}>
          <Reanimated.View style={[styles.tooltipBar, tooltipAnim]}>
            {tooltip ? (
              <View style={styles.tooltipInner}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.tooltipDate}>{tooltip.dateLabel}</Text>
                  <Text style={styles.tooltipMostly}>
                    mostly {tooltip.dominantCategory}
                  </Text>
                </View>
                <Text style={styles.tooltipMoney}>{moneyIn(tooltip.total)}</Text>
              </View>
            ) : null}
          </Reanimated.View>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#1A1A2E' },
  scroll: { flex: 1 },
  navySection: {
    backgroundColor: NAVY,
    paddingLeft: 16,
    paddingRight: 16,
    paddingBottom: 16,
    paddingTop: 0,
    zIndex: 1,
  },
  mmHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  mmTitle: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: FONT_UI as string,
  },
  monthPill: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  monthPillTxt: { fontSize: 9, color: '#aaa', fontFamily: FONT_UI as string, fontWeight: '600' },
  monthPillCaret: { fontSize: 8, color: '#aaa' },
  totalAmt: {
    color: WHITE,
    fontSize: 22,
    fontWeight: '700',
    fontFamily: FONT_MONO as string,
    marginTop: 2,
  },
  totalLbl: { marginTop: 2, fontSize: 9, color: MUTED, fontFamily: FONT_UI as string },
  treemapOuter: {
    marginTop: 12,
    height: TREEMAP_H,
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  treemapLblWrap: {
    position: 'absolute',
    padding: 6,
    justifyContent: 'center',
  },
  treemapCat: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 8,
    fontWeight: '700',
    fontFamily: FONT_UI as string,
  },
  treemapMoney: {
    marginTop: 2,
    color: WHITE,
    fontSize: 9,
    fontWeight: '700',
    fontFamily: FONT_MONO as string,
  },
  treemapPct: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.65)',
    fontSize: 7,
    fontWeight: '600',
    fontFamily: FONT_UI as string,
  },
  treemapEmpty: {
    height: TREEMAP_H,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  treemapEmptyTxt: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontFamily: FONT_UI as string },
  vfLabel: {
    marginTop: 14,
    fontSize: 8,
    color: MUTED,
    fontWeight: '700',
    letterSpacing: 0.6,
    fontFamily: FONT_UI as string,
  },
  vfTrack: {
    marginTop: 6,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  vfFixed: { backgroundColor: PURPLE },
  vfVar: { backgroundColor: CRIMSON },
  vfLegendRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vfLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vfRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vfDot: { width: 6, height: 6, borderRadius: 3 },
  vfMono: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 8,
    fontWeight: '600',
    fontFamily: FONT_MONO as string,
  },
  errTxt: { marginTop: 8, color: '#fca5a5', fontSize: 10, fontFamily: FONT_UI as string },
  whiteSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
    backgroundColor: WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  sheetHandleWrap: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: WHITE,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D8DAE4',
  },
  sheetScroll: { flex: 1 },
  whiteCardShell: {
    flex: 1,
    minHeight: WHITE_CARD_MIN_HEIGHT,
    backgroundColor: WHITE,
    padding: 14,
    paddingBottom: 20,
  },
  whiteSecTitle: { fontSize: 12, fontWeight: '700', color: NAVY, fontFamily: FONT_UI as string },
  heatTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendTxt: { fontSize: 8, color: MUTED, fontFamily: FONT_UI as string },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  heatMapWrap: { marginTop: 4 },
  heatRow: { flexDirection: 'row', gap: 3, marginBottom: 3 },
  heatCol: { alignItems: 'center' },
  heatCell: { borderRadius: 3 },
  dayNum: {
    marginTop: 3,
    fontSize: 7,
    lineHeight: 9,
    color: '#ccc',
    textAlign: 'center',
    fontFamily: FONT_UI as string,
    width: '100%',
  },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 8,
  },
  toggle: { flexDirection: 'row', borderRadius: 12, overflow: 'hidden', backgroundColor: '#f0f0f0' },
  toggleSeg: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  toggleOn: { backgroundColor: PURPLE },
  toggleTxt: { fontSize: 9, color: MUTED, fontWeight: '600', fontFamily: FONT_UI as string },
  toggleTxtOn: { color: WHITE },
  barTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barName: { fontSize: 11, color: NAVY, fontFamily: FONT_UI as string },
  barAmt: { fontSize: 11, fontWeight: '700', color: NAVY, fontFamily: FONT_MONO as string },
  barTrack: { marginTop: 4, height: 4, borderRadius: 2, backgroundColor: '#f0f0f0', overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2 },
  empty: { marginTop: 6, fontSize: 11, color: MUTED, fontFamily: FONT_UI as string },
  ledgerDayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  ledgerDayLeft: { fontSize: 9, fontWeight: '700', color: MUTED, fontFamily: FONT_UI as string },
  ledgerDayRight: { fontSize: 9, fontWeight: '700', color: CRIMSON, fontFamily: FONT_MONO as string },
  modalFill: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'flex-end',
  },
  tooltipBar: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: TOOLTIP_BG,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  tooltipInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tooltipDate: { fontSize: 10, color: MUTED, fontFamily: FONT_UI as string },
  tooltipMostly: { marginTop: 2, fontSize: 9, fontWeight: '700', color: PURPLE, fontFamily: FONT_UI as string },
  tooltipMoney: { fontSize: 13, fontWeight: '700', color: WHITE, fontFamily: FONT_MONO as string },
});
