/**
 * ExpenseInputSheet.tsx
 * Universal Input Engine — PRD Section 1.2
 *
 * Single global component. Summoned from Dashboard, Spending tab, Wealth tab.
 * Never duplicated.
 *
 * Layout (bottom → top):
 *   ─ Custom numeric keypad
 *   ─ "LOG EXPENSE" purple CTA
 *   ─ Fixed/Recurring toggle with tooltip
 *   ─ Horizontal scrollable category pills
 *   ─ Note field
 *   ─ Massive DM Mono rupee amount display
 *   ─ Drag handle
 */

import React, {
  useState, useRef, useEffect, useCallback,
} from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Dimensions,
  Platform,
  PanResponder,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  PURPLE, PURPLE_BG, PURPLE_DARK,
  NAVY, SHIELD_RED,
  BG_CARD, BORDER, BORDER_LIGHT,
  TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED,
  FONT_MONO, FONT_UI,
  RADIUS_LG, RADIUS_MD, RADIUS_SM, RADIUS_PILL,
  SPACE_XS, SPACE_SM, SPACE_MD, SPACE_LG,
} from '../theme/tokens';
import { EXPENSE_RULES, ExpenseCategory, Expense } from '../utils/finance';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExpenseInputSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (
    category: ExpenseCategory,
    amount: number,
    note?: string,
    is_fixed?: boolean,
  ) => Promise<void>;
  /** Pre-populate in edit mode when opened from ledger Edit action. */
  editExpense?: Expense;
}

// ─── Keypad keys ──────────────────────────────────────────────────────────────

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'] as const;

// ─── Category pills ───────────────────────────────────────────────────────────

const CATEGORIES = Object.entries(EXPENSE_RULES).map(([key, rule]) => ({
  key:   key as ExpenseCategory,
  emoji: rule.icon,
  name:  rule.name,
  isFixed: rule.type === 'fixed',
}));

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT  = SCREEN_HEIGHT * 0.88;

// ─── Component ────────────────────────────────────────────────────────────────

export const ExpenseInputSheet: React.FC<ExpenseInputSheetProps> = ({
  visible,
  onClose,
  onSubmit,
  editExpense,
}) => {
  const translateY    = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const [amountStr,  setAmountStr]  = useState('');
  const [note,       setNote]       = useState('');
  const [category,   setCategory]   = useState<ExpenseCategory | null>(null);
  const [isFixed,    setIsFixed]    = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [submitting,  setSubmitting]  = useState(false);

  // ── Open / close animations ────────────────────────────────────────────────

  useEffect(() => {
    if (visible) {
      // Populate edit mode
      if (editExpense) {
        setAmountStr(editExpense.amount.toString());
        setNote(editExpense.note ?? '');
        setCategory(editExpense.category);
        setIsFixed(editExpense.is_fixed ?? EXPENSE_RULES[editExpense.category].type === 'fixed');
      }
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0, useNativeDriver: true, tension: 80, friction: 12,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1, duration: 250, useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SHEET_HEIGHT, duration: 300, useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0, duration: 250, useNativeDriver: true,
        }),
      ]).start(() => {
        // Reset state after close animation
        setAmountStr('');
        setNote('');
        setCategory(null);
        setIsFixed(false);
        setShowTooltip(false);
        setSubmitting(false);
      });
    }
  }, [visible]);

  // ── Drag-to-dismiss ───────────────────────────────────────────────────────
  const panY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) panY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 120 || g.vy > 0.6) {
          onClose();
        } else {
          Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  // ── Keypad handler ────────────────────────────────────────────────────────
  const handleKey = useCallback((key: string) => {
    triggerHaptic('light');
    setAmountStr(prev => {
      if (key === '⌫') return prev.slice(0, -1);
      if (key === '.') {
        if (prev.includes('.')) return prev;
        return prev === '' ? '0.' : prev + '.';
      }
      if (prev === '0') return key;
      if (prev.length >= 8) return prev; // max 8 chars
      const next = prev + key;
      // Prevent more than 2 decimal places
      const dotIdx = next.indexOf('.');
      if (dotIdx !== -1 && next.length - dotIdx > 3) return prev;
      return next;
    });
  }, []);

  // ── Category select ───────────────────────────────────────────────────────
  const handleCategorySelect = (cat: ExpenseCategory) => {
    triggerHaptic('medium');
    setCategory(cat);
    // Auto-set is_fixed based on category rule unless user already toggled
    const catFixed = EXPENSE_RULES[cat].type === 'fixed';
    setIsFixed(catFixed);
  };

  // ── Fixed toggle ──────────────────────────────────────────────────────────
  const handleFixedToggle = () => {
    triggerHaptic('light');
    setIsFixed(v => {
      const next = !v;
      if (next) setShowTooltip(true);
      else setShowTooltip(false);
      return next;
    });
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!category || !amountStr) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return;

    setSubmitting(true);
    triggerHaptic('medium');
    try {
      await onSubmit(category, amount, note.trim() || undefined, isFixed);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !!category && parseFloat(amountStr) > 0 && !submitting;
  const displayAmount = amountStr || '0';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { transform: [{ translateY: Animated.add(translateY, panY) }] },
        ]}
      >
        {/* Drag handle */}
        <View style={styles.dragArea} {...panResponder.panHandlers}>
          <View style={styles.handle} />
        </View>

        {/* Amount display */}
        <View style={styles.amountRow}>
          <Text style={styles.rupeePrefix}>₹</Text>
          <Text
            style={[
              styles.amountDisplay,
              displayAmount === '0' && styles.amountPlaceholder,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {displayAmount}
          </Text>
        </View>

        {/* Note field */}
        <TextInput
          style={styles.noteInput}
          placeholder="What was this for? (optional)"
          placeholderTextColor={TEXT_MUTED}
          value={note}
          onChangeText={setNote}
          returnKeyType="done"
          maxLength={80}
        />

        {/* Category pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsContent}
          style={styles.pillsScroll}
        >
          {CATEGORIES.map(({ key, emoji, name }) => {
            const selected = category === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.pill, selected && styles.pillSelected]}
                onPress={() => handleCategorySelect(key)}
                activeOpacity={0.7}
              >
                <Text style={styles.pillEmoji}>{emoji}</Text>
                <Text style={[styles.pillLabel, selected && styles.pillLabelSelected]}>
                  {name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Fixed toggle */}
        <View style={styles.fixedRow}>
          <TouchableOpacity
            style={styles.fixedToggleTap}
            onPress={handleFixedToggle}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, isFixed && styles.checkboxChecked]}>
              {isFixed && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.fixedLabel}>Mark as Fixed / Recurring</Text>
          </TouchableOpacity>
        </View>
        {showTooltip && (
          <View style={styles.tooltip}>
            <Text style={styles.tooltipText}>
              🛡 Fixed bills do not affect Shield Ring.
            </Text>
          </View>
        )}

        {/* LOG EXPENSE CTA */}
        <TouchableOpacity
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          <Text style={styles.submitBtnText}>
            {submitting ? 'Logging...' : 'LOG EXPENSE'}
          </Text>
        </TouchableOpacity>

        {/* Custom keypad */}
        <View style={styles.keypad}>
          {KEYPAD_KEYS.map((key, idx) => (
            <TouchableOpacity
              key={idx}
              style={[
                styles.keyBtn,
                key === '⌫' && styles.keyBtnBackspace,
              ]}
              onPress={() => handleKey(key)}
              activeOpacity={0.6}
            >
              <Text style={[
                styles.keyLabel,
                key === '⌫' && styles.keyLabelBackspace,
              ]}>
                {key}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Bottom safe-area padding */}
        <View style={{ height: Platform.OS === 'ios' ? 20 : 8 }} />
      </Animated.View>
    </Modal>
  );
};

// ─── Haptic helper ────────────────────────────────────────────────────────────

const triggerHaptic = (style: 'light' | 'medium') => {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(
      style === 'light'
        ? Haptics.ImpactFeedbackStyle.Light
        : Haptics.ImpactFeedbackStyle.Medium,
    ).catch(() => {});
  }
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position:      'absolute',
    bottom:        0,
    left:          0,
    right:         0,
    height:        SHEET_HEIGHT,
    backgroundColor: BG_CARD,
    borderTopLeftRadius:  RADIUS_LG + 4,
    borderTopRightRadius: RADIUS_LG + 4,
    paddingHorizontal: SPACE_MD,
  },

  // Drag handle
  dragArea: {
    alignItems: 'center',
    paddingVertical: SPACE_SM + 2,
  },
  handle: {
    width:        44,
    height:       5,
    borderRadius: 3,
    backgroundColor: BORDER,
  },

  // Amount
  amountRow: {
    flexDirection: 'row',
    alignItems:   'flex-end',
    paddingBottom: SPACE_XS,
    marginBottom:  SPACE_XS,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_LIGHT,
  },
  rupeePrefix: {
    fontFamily: FONT_MONO as string,
    fontSize:   36,
    fontWeight: '700',
    color:      NAVY,
    marginRight: SPACE_XS,
    marginBottom: 4,
  },
  amountDisplay: {
    fontFamily:    FONT_MONO as string,
    fontSize:      56,
    fontWeight:    '800',
    color:         NAVY,
    letterSpacing: -2,
    flex:          1,
  },
  amountPlaceholder: {
    color: BORDER,
  },

  // Note
  noteInput: {
    fontFamily:   FONT_UI as string,
    fontSize:     14,
    color:        TEXT_BODY,
    paddingVertical: SPACE_SM,
    marginBottom: SPACE_SM,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_LIGHT,
  },

  // Category pills
  pillsScroll: {
    marginBottom: SPACE_SM,
  },
  pillsContent: {
    paddingRight: SPACE_MD,
    gap:          SPACE_SM,
  },
  pill: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            5,
    paddingHorizontal: 14,
    paddingVertical:    8,
    borderRadius:   RADIUS_PILL,
    borderWidth:    1.5,
    borderColor:    BORDER,
    backgroundColor: '#FAFAFA',
  },
  pillSelected: {
    backgroundColor: PURPLE_BG,
    borderColor:     PURPLE,
  },
  pillEmoji: {
    fontSize: 15,
  },
  pillLabel: {
    fontFamily: FONT_UI as string,
    fontSize:   13,
    fontWeight: '600',
    color:      TEXT_BODY,
  },
  pillLabelSelected: {
    color: PURPLE,
  },

  // Fixed toggle
  fixedRow: {
    marginBottom: SPACE_XS,
  },
  fixedToggleTap: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACE_SM,
    paddingVertical: SPACE_XS + 2,
  },
  checkbox: {
    width:        22,
    height:       22,
    borderRadius: 6,
    borderWidth:  1.5,
    borderColor:  BORDER,
    backgroundColor: '#FAFAFA',
    alignItems:   'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: PURPLE,
    borderColor:     PURPLE,
  },
  checkmark: {
    color:      '#FFFFFF',
    fontSize:   13,
    fontWeight: '700',
    lineHeight: 16,
  },
  fixedLabel: {
    fontFamily: FONT_UI as string,
    fontSize:   14,
    fontWeight: '600',
    color:      TEXT_BODY,
  },
  tooltip: {
    backgroundColor: PURPLE_BG,
    borderRadius:    RADIUS_SM,
    paddingHorizontal: SPACE_SM + 2,
    paddingVertical:   SPACE_XS + 2,
    marginBottom:    SPACE_SM,
  },
  tooltipText: {
    fontFamily: FONT_UI as string,
    fontSize:   12,
    color:      PURPLE,
    fontWeight: '600',
  },

  // Submit CTA
  submitBtn: {
    backgroundColor: PURPLE,
    borderRadius:    RADIUS_MD,
    height:          52,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    SPACE_SM,
    shadowColor:     PURPLE,
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.35,
    shadowRadius:    8,
    elevation:       6,
  },
  submitBtnDisabled: {
    backgroundColor: '#C5C3F0',
    shadowOpacity:   0,
    elevation:       0,
  },
  submitBtnText: {
    fontFamily:    FONT_UI as string,
    fontSize:      16,
    fontWeight:    '800',
    color:         '#FFFFFF',
    letterSpacing: 1.2,
  },

  // Keypad
  keypad: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           SPACE_XS,
  },
  keyBtn: {
    width:          '30%',
    aspectRatio:    2.8,
    borderRadius:   RADIUS_SM,
    backgroundColor: '#F4F4F8',
    alignItems:     'center',
    justifyContent: 'center',
    // flex: 1 won't work with fixed aspectRatio + gap, use percentages
  },
  keyBtnBackspace: {
    backgroundColor: 'transparent',
  },
  keyLabel: {
    fontFamily: FONT_MONO as string,
    fontSize:   22,
    fontWeight: '600',
    color:      NAVY,
  },
  keyLabelBackspace: {
    fontSize: 20,
    color:    TEXT_MUTED,
  },
});
