import React, { useMemo, useState } from 'react';
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
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFinancials } from '../hooks/useFinancials';
import { FONT_MONO, getTierColor } from '../theme/tokens';

type SourceItem = {
  id: number;
  title: string;
  date: string;
  amount: string;
  type: 'RECURRING' | 'MANUAL';
  icon: 'briefcase' | 'palette' | 'home' | 'bank';
};

const SOURCES: SourceItem[] = [
  { id: 1, title: 'Salary', date: 'June 01', amount: '55,000', type: 'RECURRING', icon: 'briefcase' },
  { id: 2, title: 'Freelance', date: 'June 05', amount: '12,500', type: 'MANUAL', icon: 'palette' },
  { id: 3, title: 'Rental', date: 'June 10', amount: '10,000', type: 'RECURRING', icon: 'home' },
  { id: 4, title: 'Dividends', date: 'June 15', amount: '2,500', type: 'RECURRING', icon: 'bank' },
];

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

export const IncomeEngineScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { summary } = useFinancials();
  const HEADER_HEIGHT = Dimensions.get('window').height * 0.45;
  const [sources, setSources] = useState<SourceItem[]>(SOURCES);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('Salary');
  const [newDate, setNewDate] = useState('June 01');
  const [newAmount, setNewAmount] = useState('55,000');
  const [newType, setNewType] = useState<'RECURRING' | 'MANUAL'>('RECURRING');

  const nextId = useMemo(
    () => (sources.length ? Math.max(...sources.map(s => s.id)) + 1 : 1),
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
      },
      ...prev,
    ]);
    setIsAddModalVisible(false);
  };

  return (
    <View style={s.container}>
      <View style={[s.topSection, { height: HEADER_HEIGHT, paddingTop: insets.top + 10 }]}>
        <View style={s.topSectionInner}>
          <View style={s.headerRow}>
            <Text style={s.headerTitle}>Income Engine</Text>
            <View style={s.headerIconsRow}>
              <View style={s.osPill}>
                <Text style={s.osPillText}>OVS</Text>
                <Text style={s.osPillScore}>{summary.wealthScore}</Text>
              </View>
            <MiniRings
              shieldPct={summary.shieldPct}
              trackPct={summary.trackPct}
              buildPct={summary.buildPct}
              score={summary.wealthScore}
            />
            <View style={s.bellWrap}>
              <Text style={s.bellIcon}>🔔</Text>
              <View style={s.bellDot} />
              </View>
            </View>
          </View>

          <View style={s.projectedWrap}>
            <Text style={s.projectedLabel}>PROJECTED TOTAL</Text>
            <Text style={s.projectedAmount}>₹85,000.00</Text>
          </View>

          <View style={s.paydayPill}>
            <Text style={s.paydayText}>📅 Next Payday: June 01</Text>
          </View>

          <View style={s.metricsRow}>
            <View style={s.metricCard}>
              <Text style={s.metricLabel}>GROSS INFLOW</Text>
              <View style={s.metricAmountRow}>
                <Text style={s.metricAmount}>₹85k</Text>
                <Text style={s.trendUp}>↗</Text>
              </View>
            </View>

            <View style={s.metricCard}>
              <Text style={s.metricLabel}>CONSUMED</Text>
              <Text style={s.metricAmount}>32%</Text>
              <View style={s.progressTrack}>
                <View style={s.progressFill} />
              </View>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        bounces={false}
        overScrollMode="never"
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
      >
        <View style={{ height: HEADER_HEIGHT }} />

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
            <View key={item.id} style={s.itemRow}>
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
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={isAddModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsAddModalVisible(false)}
      >
        <Pressable style={s.modalBackdrop} onPress={() => setIsAddModalVisible(false)} />
        <View style={s.modalSheet}>
          <Text style={s.modalTitle}>Add Source</Text>

          <Text style={s.modalLabel}>Title</Text>
          <TextInput
            value={newTitle}
            onChangeText={setNewTitle}
            style={s.input}
            placeholder="Salary"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={s.modalLabel}>Date</Text>
          <TextInput
            value={newDate}
            onChangeText={setNewDate}
            style={s.input}
            placeholder="June 01"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={s.modalLabel}>Amount</Text>
          <TextInput
            value={newAmount}
            onChangeText={setNewAmount}
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
              <Text style={[s.typeChipTxt, newType === 'RECURRING' && s.typeChipTxtActive]}>RECURRING</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              style={[s.typeChip, newType === 'MANUAL' && s.typeChipActive]}
              onPress={() => setNewType('MANUAL')}
            >
              <Text style={[s.typeChipTxt, newType === 'MANUAL' && s.typeChipTxtActive]}>MANUAL</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.saveBtn} activeOpacity={0.88} onPress={handleCreateSource}>
            <Text style={s.saveBtnTxt}>Save Source</Text>
          </TouchableOpacity>
        </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#161622',
    borderRadius: 16,
    padding: 16,
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
    marginBottom: 24,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
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
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
