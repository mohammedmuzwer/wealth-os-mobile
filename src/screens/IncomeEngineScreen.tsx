import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Modal,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  Animated,
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import Reanimated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFinancials } from '../hooks/useFinancials';
import { useWealth } from '../context/WealthContext';
import { FONT_MONO, getTierColor } from '../theme/tokens';

type SourceItem = {
  id: number;
  title: string;
  date: string;
  amount: string;
  type: 'RECURRING' | 'MANUAL';
  icon: 'briefcase' | 'palette' | 'home' | 'bank';
  createdAt?: string;
};

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

const formatDateLabel = (date: Date) => {
  return `${MONTH_NAMES[date.getMonth()]} ${String(date.getDate()).padStart(2, '0')}`;
};

const monthShort = (date: Date) => MONTH_NAMES[date.getMonth()].slice(0, 3);

const buildAutoTitle = (category: string, date: Date) => `${category}_${monthShort(date)}`;
const INCOME_SOURCES_KEY = 'income_engine_sources_v1';

const parseAmount = (amount: string) => {
  const numeric = Number(amount.replace(/,/g, '').trim());
  return Number.isFinite(numeric) ? numeric : 0;
};

const SOURCES: SourceItem[] = [];

const iconFor = (icon: SourceItem['icon']) => {
  switch (icon) {
    case 'briefcase':
      return '💼';
    case 'palette':
      return '🎨';
    case 'home':
      return '🏠';
    case 'bank':
      return '🏦';
    default:
      return '•';
  }
};

type MiniRingsProps = {
  shieldPct: number;
  trackPct: number;
  buildPct: number;
  score: number;
};

const MiniRings: React.FC<MiniRingsProps> = ({
  shieldPct,
  trackPct,
  buildPct,
  score,
}) => {
  const S = 38;
  const cx = S / 2;
  const cy = S / 2;
  const sw = 4;
  const rO = 16;
  const rM = 12;
  const rI = 8;
  const tierColor = getTierColor(score);

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

type AllocationSimulatorCardProps = {
  monthlyAllocationPercent: number;
  baseDailyBudget: number;
  setMonthlyAllocationPercent: (value: number) => void;
};

const AllocationSimulatorCard: React.FC<AllocationSimulatorCardProps> = ({
  monthlyAllocationPercent,
  baseDailyBudget,
  setMonthlyAllocationPercent,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const flipValue = useSharedValue(0);

  useEffect(() => {
    flipValue.value = withTiming(isFlipped ? 1 : 0, { duration: 600 });
  }, [flipValue, isFlipped]);

  const frontFaceStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipValue.value, [0, 1], [0, 180]);
    return {
      transform: [{ perspective: 1500 }, { rotateY: `${rotateY}deg` }],
      zIndex: flipValue.value > 0.5 ? 1 : 10,
      opacity: flipValue.value > 0.5 ? 0 : 1,
      backfaceVisibility: 'hidden' as const,
    };
  });

  const backFaceStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipValue.value, [0, 1], [180, 360]);
    return {
      transform: [{ perspective: 1500 }, { rotateY: `${rotateY}deg` }],
      zIndex: flipValue.value > 0.5 ? 10 : 1,
      opacity: flipValue.value > 0.5 ? 1 : 0,
      backfaceVisibility: 'hidden' as const,
    };
  });

  const backFaceAndroidOpacity = useAnimatedStyle(() => {
    return {
      opacity: Platform.OS === 'android' ? interpolate(flipValue.value, [0, 0.5, 1], [0, 0, 1]) : 1,
    };
  });

  return (
    <View style={s.allocSimWrap}>
      <Reanimated.View
        pointerEvents={isFlipped ? 'none' : 'auto'}
        style={[s.allocSimFace, frontFaceStyle]}
      >
        <Pressable style={s.allocSimFrontPress} onPress={() => {
          setIsFlipped(true);
        }}>
          <View style={s.allocFrontRow}>
            <View style={s.metricCard}>
              <Text style={s.metricLabel}>DAILY ALLOCATION</Text>
              <Text style={s.metricAmount}>{monthlyAllocationPercent.toFixed(0)}%</Text>
              <Text style={s.allocSubText}>₹{baseDailyBudget.toFixed(0)} / Day</Text>
            </View>

            <View style={s.metricCard}>
              <Text style={s.metricLabel}>CONSUMED</Text>
              <Text style={s.metricAmount}>32%</Text>
              <View style={s.progressTrack}>
                <View style={s.progressFill} />
              </View>
            </View>
          </View>
        </Pressable>
      </Reanimated.View>

      <Reanimated.View
        pointerEvents={isFlipped ? 'auto' : 'none'}
        style={[s.allocSimFace, s.allocSimBackFace, backFaceStyle]}
      >
        <Reanimated.View style={[s.allocBackInner, backFaceAndroidOpacity]}>
          <View style={s.allocBackTopRow}>
            <Text style={s.metricLabel}>DAILY ALLOCATION</Text>
            <Text style={s.allocBackAmount}>₹{baseDailyBudget.toFixed(0)} / Day</Text>
          </View>

          <Slider
            style={s.allocSlider}
            minimumValue={5}
            maximumValue={40}
            value={monthlyAllocationPercent}
            onValueChange={val => setMonthlyAllocationPercent(Math.round(val))}
            minimumTrackTintColor="#7C3AED"
            maximumTrackTintColor="#2D2D3A"
            thumbTintColor="#C4B5FD"
          />
          <View style={s.allocBackFooter}>
            <Text style={s.allocBackSub}>{monthlyAllocationPercent.toFixed(0)}% Allotted monthly</Text>
            <TouchableOpacity
              style={s.allocDoneBtn}
              onPress={() => {
                setIsFlipped(false);
              }}
              activeOpacity={0.85}
            >
              <Text style={s.allocDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </Reanimated.View>
      </Reanimated.View>
    </View>
  );
};

type SwipeableSourceRowProps = {
  item: SourceItem;
  onDelete: (id: number) => void;
};

const SwipeableSourceRow: React.FC<SwipeableSourceRowProps> = ({ item, onDelete }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpenRef = useRef(false);
  const dragStartXRef = useRef(0);
  const DELETE_WIDTH = 82;

  const animateTo = useCallback(
    (value: number) => {
      Animated.spring(translateX, {
        toValue: value,
        useNativeDriver: true,
        bounciness: 0,
        speed: 18,
      }).start();
      isOpenRef.current = value < 0;
    },
    [translateX],
  );

  const handleDelete = useCallback(() => {
    onDelete(item.id);
  }, [item.id, onDelete]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onPanResponderGrant: () => {
          dragStartXRef.current = isOpenRef.current ? -DELETE_WIDTH : 0;
        },
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 6,
        onPanResponderMove: (_, gestureState) => {
          const nextX = dragStartXRef.current + gestureState.dx;
          const clamped = Math.max(-DELETE_WIDTH - 24, Math.min(0, nextX));
          translateX.setValue(clamped);
        },
        onPanResponderRelease: (_, gestureState) => {
          const finalX = dragStartXRef.current + gestureState.dx;

          if (finalX < -130 || (gestureState.dx < -85 && gestureState.vx < -0.7)) {
            handleDelete();
            return;
          }

          // Small swipe should always reset to closed for a clean interaction.
          if (Math.abs(gestureState.dx) < 36) {
            animateTo(0);
            return;
          }

          if (finalX <= -DELETE_WIDTH / 2) {
            animateTo(-DELETE_WIDTH);
            return;
          }
          animateTo(0);
        },
      }),
    [DELETE_WIDTH, animateTo, handleDelete, translateX],
  );

  return (
    <View style={s.swipeRowWrap}>
      <TouchableOpacity style={s.deleteAction} activeOpacity={0.85} onPress={handleDelete}>
        <Text style={s.deleteActionIcon}>🗑</Text>
        <Text style={s.deleteActionText}>Delete</Text>
      </TouchableOpacity>

      <Animated.View
        style={[s.itemRow, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <View style={s.itemLeft}>
          <View style={s.itemIconWrap}>
            <Text style={s.itemIcon}>{iconFor(item.icon)}</Text>
          </View>
          <View>
            <Text style={s.itemTitle}>{item.title}</Text>
            <Text style={s.itemDate}>{item.date}</Text>
          </View>
        </View>

        <View style={s.itemRight}>
          <Text style={s.itemAmount}>₹{item.amount}</Text>
          <View style={s.itemMetaRow}>
            <View style={s.metaDot} />
            <Text style={s.itemMeta}>{item.type}</Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

export const IncomeEngineScreen: React.FC = () => {
  const CATEGORY_OPTIONS = ['Salary', 'Freelancer', 'Rental Income', 'Bonus', 'Other'] as const;
  const insets = useSafeAreaInsets();
  const { summary } = useFinancials();
  const {
    totalIncome,
    shieldPercentage,
    ovsScore,
    monthlyAllocationPercent,
    setMonthlyAllocationPercent,
    baseDailyBudget,
  } = useWealth();
  const WHITE_CARD_RATIO = 0.5;
  const HEADER_HEIGHT = Dimensions.get('window').height * (1 - WHITE_CARD_RATIO);
  const [sources, setSources] = useState<SourceItem[]>(SOURCES);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState(() => buildAutoTitle('Salary', new Date()));
  const [newCategory, setNewCategory] = useState<(typeof CATEGORY_OPTIONS)[number]>('Salary');
  const [newDate, setNewDate] = useState(formatDateLabel(new Date()));
  const [newAmount, setNewAmount] = useState('55,000');
  const [newType, setNewType] = useState<'RECURRING' | 'MANUAL'>('RECURRING');
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [isTitleEdited, setIsTitleEdited] = useState(false);
  const [isSourcesLoaded, setIsSourcesLoaded] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const titleInputRef = useRef<TextInput>(null);
  const closeAddModal = useCallback(() => setIsAddModalVisible(false), []);

  const nextId = useMemo(
    () => (sources.length ? Math.max(...sources.map(s => s.id)) + 1 : 1),
    [sources],
  );
  const projectedTotal = useMemo(
    () => sources.reduce((sum, item) => sum + parseAmount(item.amount), 0),
    [sources],
  );

  const handleCreateSource = () => {
    const title = newTitle.trim();
    const date = newDate.trim();
    const amount = newAmount.trim();
    if (!title || !date || !amount) return;

    setSources(prev => [
      {
        id: nextId,
        title,
        date,
        amount,
        type: newType,
        icon: 'briefcase',
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setIsAddModalVisible(false);
  };

  const handleAddModalShow = useCallback(() => {
    setIsCalendarOpen(false);
    if (!isTitleEdited) {
      setNewTitle(buildAutoTitle(newCategory, selectedDate));
    }
    setCalendarMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    setTimeout(() => {
      titleInputRef.current?.focus();
    }, 120);
  }, [isTitleEdited, newCategory, selectedDate]);

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
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return weeks;
  }, [calendarMonth]);

  const todayStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }, []);

  const closeGestureResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && Math.abs(gestureState.dy) > 2,
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && Math.abs(gestureState.dy) > 2,
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > 70 || (gestureState.dy > 25 && gestureState.vy > 0.75)) {
            closeAddModal();
          }
        },
      }),
    [closeAddModal],
  );

  useEffect(() => {
    let isMounted = true;
    const loadSources = async () => {
      try {
        const stored = await AsyncStorage.getItem(INCOME_SOURCES_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored);
        if (isMounted && Array.isArray(parsed)) {
          setSources(parsed as SourceItem[]);
        }
      } catch {
        // Ignore malformed data and continue with empty list.
      } finally {
        if (isMounted) setIsSourcesLoaded(true);
      }
    };

    loadSources();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isSourcesLoaded) return;
    AsyncStorage.setItem(INCOME_SOURCES_KEY, JSON.stringify(sources)).catch(() => {});
  }, [isSourcesLoaded, sources]);

  return (
    <View style={s.container}>
      <View style={[s.topSection, { height: HEADER_HEIGHT, paddingTop: insets.top + 10 }]}>
        <View style={s.topSectionInner}>
          <View style={s.headerRow}>
            <Text style={s.headerTitle}>Income Engine</Text>
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

          <View style={s.projectedWrap}>
            <Text style={s.projectedLabel}>PROJECTED TOTAL</Text>
            <Text style={s.projectedAmount}>₹{projectedTotal.toLocaleString('en-IN')}</Text>
          </View>

          <View style={s.paydayPill}>
            <Text style={s.paydayText}>📅 Next Payday: June 01</Text>
          </View>

          <View style={s.metricsRow}>
            <AllocationSimulatorCard
              monthlyAllocationPercent={monthlyAllocationPercent}
              baseDailyBudget={baseDailyBudget}
              setMonthlyAllocationPercent={setMonthlyAllocationPercent}
            />
          </View>
        </View>
      </View>

      <ScrollView
        pointerEvents="box-none"
        bounces={false}
        overScrollMode="never"
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
        style={{ zIndex: 3 }}
        contentContainerStyle={s.scrollContent}
      >
        <View pointerEvents="none" style={{ height: HEADER_HEIGHT }} />

        <View style={s.bottomCard}>
          <View style={s.handle} />
          <View style={s.sourcesHeader}>
            <Text style={s.sourcesTitle}>Sources</Text>
            <TouchableOpacity
              style={s.addBtn}
              activeOpacity={0.85}
              onPress={() => setIsAddModalVisible(true)}
            >
              <Text style={s.addBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.listShell}>
          {sources.map(item => (
            <SwipeableSourceRow
              key={item.id}
              item={item}
              onDelete={id => setSources(prev => prev.filter(source => source.id !== id))}
            />
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={isAddModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeAddModal}
        onShow={handleAddModalShow}
      >
        <KeyboardAvoidingView
          style={s.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={s.modalBackdrop} onPress={closeAddModal} />
          <View
            style={[
              s.modalSheet,
              {
                top: insets.top + 6,
                paddingBottom: Math.max(insets.bottom, 14) + 14,
              },
            ]}
          >
            <View style={s.modalTopRow}>
              <View style={s.modalGestureArea} {...closeGestureResponder.panHandlers}>
                <View style={s.modalHandle} />
              </View>
              <TouchableOpacity style={s.modalCloseBtn} onPress={closeAddModal} activeOpacity={0.8}>
                <Text style={s.modalCloseBtnText}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.modalScrollContent}
            >
              <Text style={s.modalTitle}>Add Source</Text>

              {isCalendarOpen ? (
                <View style={s.calendarWrap}>
                  <View style={s.calendarHeader}>
                    <TouchableOpacity
                      style={s.calendarNavBtn}
                      activeOpacity={0.8}
                      onPress={() =>
                        setCalendarMonth(
                          prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                        )
                      }
                    >
                      <Text style={s.calendarNavText}>{'<'}</Text>
                    </TouchableOpacity>
                    <Text style={s.calendarMonthTitle}>
                      {MONTH_NAMES[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
                    </Text>
                    <TouchableOpacity
                      style={s.calendarNavBtn}
                      activeOpacity={0.8}
                      onPress={() =>
                        setCalendarMonth(
                          prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                        )
                      }
                    >
                      <Text style={s.calendarNavText}>{'>'}</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={s.weekdayRow}>
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <Text key={day} style={s.weekdayText}>
                        {day}
                      </Text>
                    ))}
                  </View>

                  {calendarWeeks.map((week, idx) => (
                    <View key={`week-${idx}`} style={s.weekRow}>
                      {week.map((dateCell, cellIdx) => {
                        if (!dateCell) {
                          return <View key={`empty-${idx}-${cellIdx}`} style={s.dateCell} />;
                        }
                        const cellTime = dateCell.getTime();
                        const isSelected = cellTime === new Date(
                          selectedDate.getFullYear(),
                          selectedDate.getMonth(),
                          selectedDate.getDate(),
                        ).getTime();
                        const isPast = cellTime < todayStart;
                        const isToday = cellTime === todayStart;

                        return (
                          <TouchableOpacity
                            key={`${dateCell.toISOString()}`}
                            style={[s.dateCell, isSelected && s.dateCellSelected]}
                            activeOpacity={0.85}
                            onPress={() => {
                              setSelectedDate(dateCell);
                              setNewDate(formatDateLabel(dateCell));
                              if (!isTitleEdited) {
                                setNewTitle(buildAutoTitle(newCategory, dateCell));
                              }
                              setIsCalendarOpen(false);
                            }}
                          >
                            <Text
                              style={[
                                s.dateCellText,
                                isPast && s.dateCellPastText,
                                !isPast && s.dateCellFutureText,
                                isToday && s.dateCellTodayText,
                                isSelected && s.dateCellSelectedText,
                              ]}
                            >
                              {dateCell.getDate()}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>
              ) : null}

              {!isCalendarOpen ? (
                <>
              <Text style={s.modalLabel}>Title</Text>
              <TextInput
                ref={titleInputRef}
                value={newTitle}
                onChangeText={text => {
                  setNewTitle(text);
                  setIsTitleEdited(text.trim().length > 0);
                }}
                onFocus={() => setIsCategoryOpen(false)}
                style={s.input}
                placeholder={buildAutoTitle(newCategory, selectedDate)}
                placeholderTextColor="#9CA3AF"
                returnKeyType="next"
              />

              <Text style={s.modalLabel}>Category</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                style={s.selectInput}
                onPress={() => setIsCategoryOpen(prev => !prev)}
              >
                <Text style={s.selectInputText}>{newCategory}</Text>
                <Text style={s.selectChevron}>{isCategoryOpen ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {isCategoryOpen ? (
                <View style={s.dropdownMenu}>
                  {CATEGORY_OPTIONS.map(option => (
                    <TouchableOpacity
                      key={option}
                      activeOpacity={0.8}
                      style={[s.dropdownItem, option === newCategory && s.dropdownItemActive]}
                      onPress={() => {
                        setNewCategory(option);
                        if (!isTitleEdited) {
                          setNewTitle(buildAutoTitle(option, selectedDate));
                        }
                        setIsCategoryOpen(false);
                      }}
                    >
                      <Text style={[s.dropdownItemText, option === newCategory && s.dropdownItemTextActive]}>
                        {option}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              <Text style={s.modalLabel}>Date</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                style={s.selectInput}
                onPress={() => {
                  setIsCategoryOpen(false);
                  setIsCalendarOpen(true);
                }}
              >
                <Text style={s.selectInputText}>{newDate}</Text>
                <Text style={s.selectChevron}>📅</Text>
              </TouchableOpacity>

              <Text style={s.modalLabel}>Amount</Text>
              <TextInput
                value={newAmount}
                onChangeText={setNewAmount}
                onFocus={() => setIsCategoryOpen(false)}
                style={s.input}
                keyboardType="numeric"
                placeholder="55,000"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={s.modalLabel}>Type</Text>
              <View style={s.typeRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[s.typeChip, newType === 'RECURRING' && s.typeChipActive]}
                  onPress={() => setNewType('RECURRING')}
                >
                  <Text style={[s.typeChipTxt, newType === 'RECURRING' && s.typeChipTxtActive]}>
                    RECURRING
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[s.typeChip, newType === 'MANUAL' && s.typeChipActive]}
                  onPress={() => setNewType('MANUAL')}
                >
                  <Text style={[s.typeChipTxt, newType === 'MANUAL' && s.typeChipTxtActive]}>
                    MANUAL
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={s.saveBtn} activeOpacity={0.88} onPress={handleCreateSource}>
                <Text style={s.saveBtnTxt}>Save Source</Text>
              </TouchableOpacity>
                </>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E17',
  },
  topSection: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0A0E17',
    zIndex: 2,
  },
  topSectionInner: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  osPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E9ECEF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  osPillText: {
    color: '#334155',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  osPillScore: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontFamily: FONT_MONO as string,
  },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#161622',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: '#FFFFFF',
    fontSize: 11,
  },
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
  bellIcon: {
    fontSize: 18,
  },
  bellDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#34C759',
    borderWidth: 1.5,
    borderColor: '#0A0E17',
  },
  projectedWrap: {
    marginTop: 32,
  },
  projectedLabel: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  projectedAmount: {
    marginTop: 6,
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1.1,
  },
  paydayPill: {
    marginTop: 24,
    alignSelf: 'flex-start',
    backgroundColor: '#161622',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  paydayText: {
    color: '#B9BECC',
    fontSize: 12,
    fontWeight: '600',
  },
  metricsRow: {
    width: '100%',
    marginTop: 24,
  },
  allocSimWrap: {
    width: '100%',
    height: 112,
    perspective: 1500,
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
  },
  allocSimFace: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 112,
    renderToHardwareTextureAndroid: true,
  },
  allocSimFrontPress: {
    flex: 1,
  },
  allocFrontRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  allocSimBackFace: {
    backgroundColor: '#161622',
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
  },
  allocBackInner: {
    flex: 1,
    justifyContent: 'space-between',
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#161622',
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
  },
  allocPressable: {
    flex: 1,
    justifyContent: 'space-between',
  },
  allocSubText: {
    color: '#B9BECC',
    fontSize: 11,
    fontWeight: '600',
  },
  allocBackFace: {
    flex: 1,
    backgroundColor: '#161622',
    justifyContent: 'space-between',
  },
  allocBackTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  allocBackAmount: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontFamily: FONT_MONO as string,
  },
  allocBackSub: {
    color: '#B9BECC',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  allocBackFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  allocSlider: {
    width: '100%',
    height: 24,
    marginTop: 2,
  },
  allocDoneBtn: {
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C3AED',
    paddingHorizontal: 14,
  },
  allocDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  metricLabel: {
    color: '#8E8E93',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  metricAmountRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricAmount: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  trendUp: {
    color: '#32ADE6',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  progressTrack: {
    marginTop: 10,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#2A2A3C',
    overflow: 'hidden',
  },
  progressFill: {
    width: '32%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#32ADE6',
  },
  scrollContent: {
    backgroundColor: 'transparent',
    flexGrow: 1,
  },
  bottomCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 10,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D8DAE4',
    marginBottom: 14,
  },
  listShell: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingBottom: 150,
    minHeight: Dimensions.get('window').height,
  },
  sourcesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sourcesTitle: {
    color: '#111827',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: -1,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    minHeight: 66,
    width: '100%',
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  swipeRowWrap: {
    position: 'relative',
    marginBottom: 14,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  deleteAction: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 82,
    backgroundColor: '#FF4D5A',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionIcon: {
    fontSize: 13,
    marginBottom: 2,
  },
  deleteActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    paddingRight: 10,
  },
  itemIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemIcon: {
    fontSize: 17,
  },
  itemTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  itemDate: {
    marginTop: 2,
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '500',
  },
  itemRight: {
    alignItems: 'flex-end',
    paddingRight: 2,
  },
  itemAmount: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  itemMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#6366F1',
  },
  itemMeta: {
    color: '#9CA3AF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalRoot: {
    flex: 1,
  },
  modalScrollContent: {
    paddingBottom: 8,
  },
  modalTopRow: {
    position: 'relative',
    marginBottom: 2,
  },
  modalGestureArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  modalHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D1D5DB',
  },
  modalCloseBtn: {
    position: 'absolute',
    right: 0,
    top: -4,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtnText: {
    color: '#374151',
    fontSize: 22,
    lineHeight: 22,
    marginTop: -2,
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 18,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '100%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 14,
  },
  modalLabel: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.5,
  },
  input: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    color: '#111827',
    fontSize: 15,
    fontWeight: '500',
    backgroundColor: '#F9FAFB',
  },
  selectInput: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectInputText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '500',
  },
  selectChevron: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '700',
  },
  dropdownMenu: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  dropdownItem: {
    minHeight: 42,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownItemActive: {
    backgroundColor: '#F3F4F6',
  },
  dropdownItemText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '500',
  },
  dropdownItemTextActive: {
    fontWeight: '700',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeChip: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  typeChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  typeChipTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    letterSpacing: 0.5,
  },
  typeChipTxtActive: {
    color: '#FFFFFF',
  },
  calendarWrap: {
    marginTop: 4,
    marginBottom: 8,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  calendarMonthTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  calendarNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarNavText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  weekdayText: {
    width: 38,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  dateCell: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCellSelected: {
    backgroundColor: '#111827',
  },
  dateCellText: {
    fontSize: 14,
    fontWeight: '700',
  },
  dateCellPastText: {
    color: '#C4C8D0',
  },
  dateCellFutureText: {
    color: '#2563EB',
  },
  dateCellTodayText: {
    color: '#0EA5E9',
  },
  dateCellSelectedText: {
    color: '#FFFFFF',
  },
  saveBtn: {
    marginTop: 16,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  saveBtnTxt: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
