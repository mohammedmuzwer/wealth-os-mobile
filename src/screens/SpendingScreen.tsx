/**
 * SpendingScreen.tsx
 *
 * Uses NavyCardLayout as the shell — do not rebuild the navy/white split here.
 *
 * Local section components:
 *   SpendingNavySection  — AppPageHeader + Money Map (treemap, VF bar) in the navy area
 *   SpendingCardContent  — SpendingScrollBody content inside the white card
 *                          (standalone=false so NavyCardLayout owns the card shell)
 *
 * Data flow:
 *   SpendingScreen calls useSpendingFirestoreData and owns selectedMonth state.
 *   Derived values (totalSpent, fixedTotal, variableTotal, categoryTotals) are
 *   computed here and passed to SpendingNavySection as props.
 *   controlledMonth is passed to SpendingScrollBody so heatmap + ledger stay
 *   in sync with the month selector in the navy area.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';
import { AppPageHeader } from '../components/AppPageHeader';
import { NavyCardLayout } from '../components/NavyCardLayout';
import {
  SpendingScrollBody,
  MonthRef,
  TreemapCell,
  TREEMAP_H,
  addMonths,
  formatMonthYearShort,
  moneyIn,
  categoryTreemapColor,
  buildTreemapLayout,
} from './SpendingScrollBody';
import { useSpendingFirestoreData } from '../hooks/useSpendingFirestoreData';
import { NAVY_SECTION_RATIO } from '../constants/pageLayout';
import { FONT_MONO, FONT_UI } from '../theme/tokens';

const NAVY = '#1A1A2E';
const WHITE = '#FFFFFF';
const MUTED = '#8888AA';
const PURPLE = '#6C63FF';
const CRIMSON = '#E53E3E';
// ─── SpendingScreen Props ─────────────────────────────────────────────────────

type Props = {
  tabBarHeight: number;
  activeDailyBudget: number;
  onBack?: () => void;
  headerShieldPct?: number;
  headerTrackPct?: number;
  headerBuildPct?: number;
  headerOvrScore?: number;
};

// ─── SpendingNavySection ──────────────────────────────────────────────────────

type NavySectionProps = {
  onBack?: () => void;
  headerShieldPct: number;
  headerTrackPct: number;
  headerBuildPct: number;
  headerOvrScore: number;
  // Money Map data
  totalSpent: number;
  fixedTotal: number;
  variableTotal: number;
  categoryTotals: { category: string; amount: number }[];
  selectedMonth: MonthRef;
  onMonthNext: () => void;
  onMonthPrev: () => void;
  loading: boolean;
  error: string | null;
};

/**
 * SpendingNavySection
 * Renders AppPageHeader + the full Money Map (treemap + total + month selector
 * + Variable vs Fixed bar) inside the navy top area of NavyCardLayout.
 */
const SpendingNavySection: React.FC<NavySectionProps> = ({
  onBack,
  headerShieldPct,
  headerTrackPct,
  headerBuildPct,
  headerOvrScore,
  totalSpent,
  fixedTotal,
  variableTotal,
  categoryTotals,
  selectedMonth,
  onMonthNext,
  onMonthPrev,
  loading,
  error,
}) => {
  const insets = useSafeAreaInsets();

  // Local treemap width measured from layout
  const [navyW, setNavyW] = useState(Dimensions.get('window').width);
  const treemapW = navyW - 32;

  // Local treemap focus state with auto-clear after 1.4s
  const [treemapFocus, setTreemapFocus] = useState<string | null>(null);
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!treemapFocus) return;
    if (restoreTimer.current) clearTimeout(restoreTimer.current);
    restoreTimer.current = setTimeout(() => {
      setTreemapFocus(null);
      restoreTimer.current = null;
    }, 1400);
    return () => {
      if (restoreTimer.current) clearTimeout(restoreTimer.current);
    };
  }, [treemapFocus]);

  const treemapLayout = useMemo(
    () => buildTreemapLayout(categoryTotals, totalSpent, treemapW),
    [categoryTotals, totalSpent, treemapW],
  );

  const onTreemapCellPress = (cat: string) => {
    setTreemapFocus(prev => (prev === cat ? null : cat));
  };

  return (
    <View
      style={[ns.container, { paddingTop: insets.top }]}
      onLayout={e => {
        const w = e.nativeEvent.layout.width;
        if (w > 0) setNavyW(w);
      }}
    >
      {/* Page header — back button + OVR rings */}
      <AppPageHeader
        title="Spending"
        onBack={onBack}
        ovrScore={headerOvrScore}
        shieldPct={headerShieldPct}
        trackPct={headerTrackPct}
        buildPct={headerBuildPct}
      />

      {/* Money Map header row */}
      <View style={ns.mmHeaderRow}>
        <Text style={ns.mmTitle}>Money Map</Text>
        <TouchableOpacity
          style={ns.monthPill}
          onPress={onMonthNext}
          onLongPress={onMonthPrev}
          delayLongPress={280}
          activeOpacity={0.85}
        >
          <Text style={ns.monthPillTxt}>
            {formatMonthYearShort(selectedMonth)}{' '}
            <Text style={ns.monthPillCaret}>▾</Text>
          </Text>
        </TouchableOpacity>
      </View>

      {/* Total spend */}
      <Text style={ns.totalAmt}>{moneyIn(totalSpent)}</Text>
      <Text style={ns.totalLbl}>spent this month</Text>

      {/* Treemap */}
      <View style={[ns.treemapOuter, { width: treemapW }]}>
        {treemapLayout.length ? (
          <>
            <Svg width={treemapW} height={TREEMAP_H} pointerEvents="none">
              {treemapLayout.map((cell: TreemapCell) => {
                const dim = treemapFocus && treemapFocus !== cell.category ? 0.35 : 1;
                return (
                  <Rect
                    key={cell.key}
                    x={cell.x}
                    y={cell.y}
                    width={Math.max(0, cell.w)}
                    height={Math.max(0, cell.h)}
                    rx={6}
                    ry={6}
                    fill={cell.color}
                    opacity={dim}
                  />
                );
              })}
            </Svg>
            <View style={[StyleSheet.absoluteFillObject, { pointerEvents: 'box-none' }]} pointerEvents="box-none">
              {treemapLayout.map((cell: TreemapCell) => {
                const dim = treemapFocus && treemapFocus !== cell.category ? 0.35 : 1;
                return (
                  <Pressable
                    key={`${cell.key}-lbl`}
                    style={[
                      ns.treemapLblWrap,
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
                    <Text style={ns.treemapCat} numberOfLines={2}>
                      {cell.category}
                    </Text>
                    <Text style={ns.treemapMoney}>{moneyIn(cell.amount)}</Text>
                    <Text style={ns.treemapPct}>{Math.round(cell.pct)}%</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <View style={[ns.treemapEmpty, { width: treemapW }]}>
            <Text style={ns.treemapEmptyTxt}>
              {loading ? 'Loading…' : 'No spend this month'}
            </Text>
          </View>
        )}
      </View>

      {/* Variable vs Fixed bar */}
      <Text style={ns.vfLabel}>VARIABLE VS FIXED</Text>
      <View style={ns.vfTrack}>
        <View
          style={[
            ns.vfFixed,
            { flex: fixedTotal + variableTotal > 0 ? fixedTotal : 1 },
          ]}
        />
        <View
          style={[
            ns.vfVar,
            { flex: fixedTotal + variableTotal > 0 ? variableTotal : 1 },
          ]}
        />
      </View>
      <View style={ns.vfLegendRow}>
        <View style={ns.vfSide}>
          <View style={[ns.vfDot, { backgroundColor: PURPLE }]} />
          <Text style={ns.vfMono}>Fixed {moneyIn(fixedTotal)}</Text>
        </View>
        <View style={ns.vfSide}>
          <View style={[ns.vfDot, { backgroundColor: CRIMSON }]} />
          <Text style={ns.vfMono}>Variable {moneyIn(variableTotal)}</Text>
        </View>
      </View>

      {error ? <Text style={ns.errTxt}>{error}</Text> : null}
    </View>
  );
};

// ─── SpendingCardContent ──────────────────────────────────────────────────────

type CardContentProps = {
  activeDailyBudget: number;
  tabBarHeight: number;
  selectedMonth: MonthRef;
};

/**
 * SpendingCardContent
 * Passes standalone={false} so SpendingScrollBody renders only the
 * heatmap + ledger ScrollView content — the card shell comes from NavyCardLayout.
 * controlledMonth keeps the white card in sync with the navy month selector.
 */
const SpendingCardContent: React.FC<CardContentProps> = ({
  activeDailyBudget,
  tabBarHeight,
  selectedMonth,
}) => (
  <SpendingScrollBody
    activeDailyBudget={activeDailyBudget}
    tabBarHeight={tabBarHeight}
    standalone={false}
    controlledMonth={selectedMonth}
  />
);

// ─── SpendingScreen ───────────────────────────────────────────────────────────

export const SpendingScreen: React.FC<Props> = ({
  tabBarHeight,
  activeDailyBudget,
  onBack,
  headerShieldPct = 0,
  headerTrackPct = 0,
  headerBuildPct = 0,
  headerOvrScore = 0,
}) => {
  // Fetch live data for navy section computations
  const { expenses, activeDailyBudget: liveDaily, loading, error } =
    useSpendingFirestoreData(activeDailyBudget);

  // Month state — shared between navy section and white card
  const [selectedMonth, setSelectedMonth] = useState<MonthRef>(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const onMonthNext = () => setSelectedMonth(m => addMonths(m, 1));
  const onMonthPrev = () => setSelectedMonth(m => addMonths(m, -1));

  // Derived values for navy section
  const monthExpenses = useMemo(
    () =>
      expenses.filter(
        e =>
          e.date.getFullYear() === selectedMonth.year &&
          e.date.getMonth() === selectedMonth.month,
      ),
    [expenses, selectedMonth],
  );

  const totalSpent = useMemo(
    () => monthExpenses.reduce((s, e) => s + e.amount, 0),
    [monthExpenses],
  );

  // Per spec: fixed = tag 'fixed' OR 'system'; variable = tag 'variable' only.
  const fixedTotal = useMemo(
    () =>
      monthExpenses
        .filter(e => e.tag === 'fixed' || e.tag === 'system')
        .reduce((s, e) => s + e.amount, 0),
    [monthExpenses],
  );

  const variableTotal = useMemo(
    () =>
      monthExpenses
        .filter(e => e.tag === 'variable')
        .reduce((s, e) => s + e.amount, 0),
    [monthExpenses],
  );

  const categoryTotals = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of monthExpenses) {
      m[e.category] = (m[e.category] || 0) + e.amount;
    }
    return Object.entries(m)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [monthExpenses]);

  return (
    <NavyCardLayout
      navyFlex={NAVY_SECTION_RATIO}
      cardSnapMax={0.12}
      navyContent={
        <SpendingNavySection
          onBack={onBack}
          headerShieldPct={headerShieldPct}
          headerTrackPct={headerTrackPct}
          headerBuildPct={headerBuildPct}
          headerOvrScore={headerOvrScore}
          totalSpent={totalSpent}
          fixedTotal={fixedTotal}
          variableTotal={variableTotal}
          categoryTotals={categoryTotals}
          selectedMonth={selectedMonth}
          onMonthNext={onMonthNext}
          onMonthPrev={onMonthPrev}
          loading={loading}
          error={error}
        />
      }
      cardContent={
        <SpendingCardContent
          activeDailyBudget={liveDaily}
          tabBarHeight={tabBarHeight}
          selectedMonth={selectedMonth}
        />
      }
    />
  );
};

// ─── Navy Section Styles ──────────────────────────────────────────────────────

const ns = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  mmHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 6,
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
  monthPillTxt: {
    fontSize: 9,
    color: '#aaa',
    fontFamily: FONT_UI as string,
    fontWeight: '600',
  },
  monthPillCaret: { fontSize: 8, color: '#aaa' },
  totalAmt: {
    color: WHITE,
    fontSize: 22,
    fontWeight: '700',
    fontFamily: FONT_MONO as string,
    marginTop: 2,
  },
  totalLbl: {
    marginTop: 2,
    fontSize: 9,
    color: MUTED,
    fontFamily: FONT_UI as string,
  },
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
  treemapEmptyTxt: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontFamily: FONT_UI as string,
  },
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
  vfSide: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vfDot: { width: 6, height: 6, borderRadius: 3 },
  vfMono: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 8,
    fontWeight: '600',
    fontFamily: FONT_MONO as string,
  },
  errTxt: {
    marginTop: 8,
    color: '#fca5a5',
    fontSize: 10,
    fontFamily: FONT_UI as string,
  },
});
