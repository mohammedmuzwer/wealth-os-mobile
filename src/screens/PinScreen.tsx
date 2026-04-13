/**
 * PinScreen.tsx
 * PIN authentication screen for Wealth OS.
 *
 * Shows:
 *  - Daily finance quote (rotated by day of year)
 *  - Daily AI tip
 *  - PinPad for entry
 *  - First-run PIN setup flow
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { PinPad } from '../components/PinPad';
import { getDayOfYear } from '../utils/finance';
import { NAVY, BUILD_GREEN } from '../theme/tokens';

// ─── Content arrays (mirrors web utils.js) ────────────────────────────────────

const QUOTES = [
  { q: 'The stock market is a device for transferring money from the impatient to the patient.', a: 'Warren Buffett' },
  { q: 'Do not save what is left after spending, but spend what is left after saving.',           a: 'Warren Buffett' },
  { q: 'Compound interest is the eighth wonder of the world.',                                     a: 'Albert Einstein' },
  { q: 'Time in the market beats timing the market.',                                              a: 'Ken Fisher' },
  { q: 'Wealth consists not in having great possessions, but in having few wants.',               a: 'Epictetus' },
  { q: "A budget is telling your money where to go instead of wondering where it went.",          a: 'Dave Ramsey' },
  { q: 'An investment in knowledge pays the best interest.',                                       a: 'Benjamin Franklin' },
  { q: "It's not how much money you make, but how much money you keep.",                          a: 'Robert Kiyosaki' },
];

const TIPS = [
  'Check your subscriptions today. Cancel one you haven\'t used in 30 days.',
  'Increase your SIP by just ₹1,000 this month. Future you will thank you.',
  'Any bonus or extra freelance income? Put 50% straight into Groww immediately.',
  'Review your Emergency Fund — are you closer to the ₹75K target this month?',
  'Don\'t check the market today. Focus on increasing your earning potential.',
  'A rupee saved today buys your freedom tomorrow.',
  'Cut ₹500 from wants this week → route it to your Augmont Gold SIP.',
];

const BG_COLORS = [NAVY, '#0F2027', '#16213E'];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PinScreenProps {
  /**
   * 'unlock'  — normal flow, ask for existing PIN
   * 'setup'   — first run, ask user to set a new PIN
   */
  mode: 'unlock' | 'setup';
  onUnlock:  (pin: string) => Promise<boolean>;
  onSetup:   (pin: string) => Promise<void>;
  loading?:  boolean;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export const PinScreen: React.FC<PinScreenProps> = ({
  mode,
  onUnlock,
  onSetup,
  loading = false,
}) => {
  const day   = getDayOfYear();
  const quote = QUOTES[day % QUOTES.length];
  const tip   = TIPS[day % TIPS.length];
  const bg    = BG_COLORS[day % BG_COLORS.length];

  const [hasError,    setHasError]    = useState(false);
  const [resetKey,    setResetKey]    = useState(0);
  const [setupStep,   setSetupStep]   = useState<'enter' | 'confirm'>('enter');
  const [firstPin,    setFirstPin]    = useState('');
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null);

  const handleComplete = useCallback(
    async (pin: string) => {
      setHasError(false);
      setErrorMsg(null);

      if (mode === 'unlock') {
        const ok = await onUnlock(pin);
        if (!ok) {
          setHasError(true);
          setErrorMsg('Incorrect PIN');
          // Reset after showing error
          setTimeout(() => {
            setHasError(false);
            setResetKey(k => k + 1);
          }, 800);
        }
        return;
      }

      // Setup flow — two-step confirmation
      if (setupStep === 'enter') {
        setFirstPin(pin);
        setSetupStep('confirm');
        setResetKey(k => k + 1);
        return;
      }

      // Confirm step
      if (pin === firstPin) {
        await onSetup(pin);
      } else {
        setHasError(true);
        setErrorMsg("PINs don't match. Try again.");
        setTimeout(() => {
          setHasError(false);
          setSetupStep('enter');
          setFirstPin('');
          setResetKey(k => k + 1);
        }, 800);
      }
    },
    [mode, onUnlock, onSetup, setupStep, firstPin],
  );

  const headline =
    mode === 'setup'
      ? setupStep === 'enter'
        ? 'Set your PIN'
        : 'Confirm your PIN'
      : 'Welcome back';

  const subline =
    mode === 'setup'
      ? setupStep === 'enter'
        ? 'Choose a 4-digit PIN to secure your data.'
        : 'Enter the same PIN again to confirm.'
      : 'Enter your PIN to continue.';

  return (
    <View style={[styles.bg, { backgroundColor: bg }]}>
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />

        {/* Quote block */}
        <View style={styles.quoteBlock}>
          <Text style={styles.quoteText}>"{quote.q}"</Text>
          <Text style={styles.quoteAuthor}>— {quote.a}</Text>
        </View>

        {/* Tip chip */}
        <View style={styles.tipChip}>
          <Text style={styles.tipText}>💡 {tip}</Text>
        </View>

        {/* PIN section */}
        <View style={styles.pinSection}>
          <Text style={styles.headline}>{headline}</Text>
          <Text style={styles.subline}>{subline}</Text>

          {errorMsg && (
            <Text style={styles.errorText}>{errorMsg}</Text>
          )}

          {loading ? (
            <ActivityIndicator color={BUILD_GREEN} size="large" style={{ marginTop: 32 }} />
          ) : (
            <PinPad
              onComplete={handleComplete}
              hasError={hasError}
              loading={loading}
              resetKey={resetKey}
            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bg: {
    flex: 1,
  },
  safe: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 20,
  },
  quoteBlock: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
    maxHeight: 200,
    marginTop: 40,
  },
  quoteText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '500',
    lineHeight: 26,
    fontStyle: 'italic',
  },
  quoteAuthor: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
  },
  tipChip: {
    backgroundColor: 'rgba(56,161,105,0.2)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(56,161,105,0.4)',
    marginBottom: 32,
  },
  tipText: {
    color: '#6EE7B7',
    fontSize: 13,
    lineHeight: 18,
  },
  pinSection: {
    alignItems: 'center',
    gap: 8,
  },
  headline: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subline: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginBottom: 16,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
});
