/**
 * SubscriptionScreen.tsx
 * Fixed Expense / Subscription Manager for Wealth OS.
 *
 * Stack (top → bottom):
 *   ─ Dark header bar
 *   ─ SubscriptionHero  (total, daily impact, split bar)
 *   ─ SmartInsight      (renewal alert card)
 *   ─ SubscriptionShelf (white bottom-sheet style scrollable list)
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Modal,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SubscriptionHero } from '../components/SubscriptionHero';
import { SmartInsight }      from '../components/SmartInsight';
import { SubscriptionShelf } from '../components/SubscriptionShelf';
import { useSubscriptions, SubCategory, Subscription } from '../hooks/useSubscriptions';

// ─── Add Subscription Modal ───────────────────────────────────────────────────

const CATEGORY_OPTIONS: { label: string; value: SubCategory; color: string }[] = [
  { label: '🎬 Entertainment', value: 'entertainment', color: '#7C3AED' },
  { label: '⚡ Utility',       value: 'utility',       color: '#0D9488' },
  { label: '🏋️ Health',        value: 'health',        color: '#10B981' },
  { label: '📦 Other',         value: 'other',         color: '#6B7280' },
];

const EMOJI_MAP: Record<SubCategory, string> = {
  entertainment: '🎬',
  utility:       '⚡',
  health:        '🏋️',
  other:         '📦',
};

interface AddModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (sub: Omit<Subscription, 'id'>) => void;
}

const AddModal: React.FC<AddModalProps> = ({ visible, onClose, onAdd }) => {
  const [name,     setName]     = useState('');
  const [price,    setPrice]    = useState('');
  const [renewal,  setRenewal]  = useState('');
  const [autoDebit, setAutoDebit] = useState(true);
  const [category, setCategory] = useState<SubCategory>('entertainment');

  const reset = () => {
    setName(''); setPrice(''); setRenewal('');
    setAutoDebit(true); setCategory('entertainment');
  };

  const handleAdd = () => {
    const amt = parseFloat(price);
    if (!name.trim()) return Alert.alert('Name required');
    if (!amt || isNaN(amt)) return Alert.alert('Enter a valid price');

    const cfg = CATEGORY_OPTIONS.find(c => c.value === category)!;
    onAdd({
      name:       name.trim(),
      emoji:      EMOJI_MAP[category],
      price:      amt,
      category,
      nextRenewal: renewal.trim() || 'Soon',
      autoDebit,
      color:      cfg.color,
    });
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SafeAreaView style={modal.container}>
          <View style={modal.header}>
            <Text style={modal.title}>New Subscription</Text>
            <TouchableOpacity onPress={() => { reset(); onClose(); }} style={modal.closeBtn}>
              <Text style={modal.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Name */}
            <Text style={modal.label}>Service Name</Text>
            <TextInput
              style={modal.input}
              placeholder="e.g. Netflix"
              placeholderTextColor="#9CA3AF"
              value={name}
              onChangeText={setName}
            />

            {/* Price */}
            <Text style={modal.label}>Monthly Price (₹)</Text>
            <TextInput
              style={modal.input}
              placeholder="649"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              value={price}
              onChangeText={setPrice}
            />

            {/* Renewal */}
            <Text style={modal.label}>Next Renewal</Text>
            <TextInput
              style={modal.input}
              placeholder="e.g. Apr 15"
              placeholderTextColor="#9CA3AF"
              value={renewal}
              onChangeText={setRenewal}
            />

            {/* Category */}
            <Text style={modal.label}>Category</Text>
            <View style={modal.chips}>
              {CATEGORY_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    modal.chip,
                    category === opt.value && { backgroundColor: opt.color + '18', borderColor: opt.color },
                  ]}
                  onPress={() => setCategory(opt.value)}
                >
                  <Text style={[
                    modal.chipTxt,
                    category === opt.value && { color: opt.color, fontWeight: '700' },
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Auto-debit toggle */}
            <TouchableOpacity
              style={modal.toggleRow}
              onPress={() => setAutoDebit(v => !v)}
              activeOpacity={0.7}
            >
              <View style={[modal.toggle, autoDebit && modal.toggleOn]}>
                <View style={[modal.toggleKnob, autoDebit && modal.toggleKnobOn]} />
              </View>
              <Text style={modal.toggleLabel}>Auto-Debit</Text>
            </TouchableOpacity>

            <TouchableOpacity style={modal.addBtn} onPress={handleAdd}>
              <Text style={modal.addBtnTxt}>Add to Shelf</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── SubscriptionScreen ───────────────────────────────────────────────────────

export const SubscriptionScreen: React.FC = () => {
  const { subscriptions, metrics, addSubscription, removeSubscription } = useSubscriptions();
  const [showModal, setShowModal] = useState(false);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F5F7" />

      {/* Page header */}
      <View style={styles.pageHeader}>
        <View>
          <Text style={styles.pageTitle}>Fixed Expenses</Text>
          <Text style={styles.pageSubtitle}>Subscription Shelf</Text>
        </View>
        <View style={styles.monthBadge}>
          <Text style={styles.monthBadgeTxt}>APR 2026</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <SubscriptionHero
          totalMonthly={metrics.totalMonthly}
          dailyImpact={metrics.dailyImpact}
          splits={metrics.splits}
        />

        {/* Smart insight */}
        <SmartInsight renewalCount={metrics.renewalsThisWeek} />

        {/* Shelf — white bottom-sheet style */}
        <SubscriptionShelf
          subscriptions={subscriptions}
          onDelete={removeSubscription}
          onAdd={() => setShowModal(true)}
        />

        {/* Bottom padding */}
        <View style={{ height: 40 }} />
      </ScrollView>

      <AddModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onAdd={addSubscription}
      />
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F4F5F7',
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
    marginTop: 1,
  },
  monthBadge: {
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  monthBadgeTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    gap: 14,
  },
});

// ─── AddModal Styles ──────────────────────────────────────────────────────────

const modal = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeTxt: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '700',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#111827',
    marginBottom: 20,
    backgroundColor: '#FAFAFA',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  chipTxt: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 28,
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleOn: {
    backgroundColor: '#10B981',
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleKnobOn: {
    alignSelf: 'flex-end',
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  addBtn: {
    backgroundColor: '#111827',
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnTxt: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
