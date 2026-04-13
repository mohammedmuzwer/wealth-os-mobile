/**
 * PinPad.tsx
 * Numeric PIN entry pad for Wealth OS.
 *
 * Features:
 * - 4-digit PIN with animated dot indicators
 * - Haptic feedback on each key press
 * - Error shake animation on wrong PIN
 * - Backspace key
 * - Calls onComplete when 4 digits are entered
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { DANGER, BUILD_GREEN } from '../theme/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PinPadProps {
  /** Called with the 4-digit PIN string when all 4 digits are entered. */
  onComplete: (pin: string) => void;
  /** When true, shows the dots in the error (red) state and shakes. */
  hasError?: boolean;
  /** When true, shows a loading indicator instead of the pad. */
  loading?: boolean;
  /** Resets the pad to empty (incrementing this value triggers a reset). */
  resetKey?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PIN_LENGTH = 4;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;

// ─── Dot Indicator ────────────────────────────────────────────────────────────

interface DotProps {
  filled: boolean;
  error: boolean;
}

const Dot: React.FC<DotProps> = ({ filled, error }) => {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (filled) {
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.3, useNativeDriver: true, speed: 40 }),
        Animated.spring(scale, { toValue: 1.0, useNativeDriver: true, speed: 40 }),
      ]).start();
    }
  }, [filled]);

  const bg = error ? DANGER : filled ? BUILD_GREEN : 'transparent';
  const border = error ? DANGER : filled ? BUILD_GREEN : '#9CA3AF';

  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: bg, borderColor: border, transform: [{ scale }] },
      ]}
    />
  );
};

// ─── PinPad ───────────────────────────────────────────────────────────────────

export const PinPad: React.FC<PinPadProps> = ({
  onComplete,
  hasError = false,
  loading = false,
  resetKey = 0,
}) => {
  const [digits, setDigits] = useState<string[]>([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Reset digits when resetKey changes
  useEffect(() => {
    setDigits([]);
  }, [resetKey]);

  // Shake the dots on error
  useEffect(() => {
    if (hasError) {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue:  8, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue:  8, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue:  0, duration: 60, useNativeDriver: true }),
      ]).start();
    }
  }, [hasError]);

  const handleKey = useCallback(
    (key: string) => {
      if (loading) return;

      if (key === '⌫') {
        setDigits((prev) => prev.slice(0, -1));
        triggerHaptic('light');
        return;
      }

      if (key === '') return; // empty placeholder key

      if (digits.length >= PIN_LENGTH) return;

      triggerHaptic('medium');
      const next = [...digits, key];
      setDigits(next);

      if (next.length === PIN_LENGTH) {
        onComplete(next.join(''));
      }
    },
    [digits, loading, onComplete],
  );

  return (
    <View style={styles.container}>
      {/* Dot indicators */}
      <Animated.View
        style={[styles.dots, { transform: [{ translateX: shakeAnim }] }]}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <Dot
            key={i}
            filled={i < digits.length}
            error={hasError}
          />
        ))}
      </Animated.View>

      {/* Key grid */}
      <View style={styles.grid}>
        {KEYS.map((key, idx) => (
          <KeyButton
            key={idx}
            label={key}
            onPress={() => handleKey(key)}
            isBackspace={key === '⌫'}
            isPlaceholder={key === ''}
            disabled={loading}
          />
        ))}
      </View>
    </View>
  );
};

// ─── Key Button ───────────────────────────────────────────────────────────────

interface KeyButtonProps {
  label: string;
  onPress: () => void;
  isBackspace?: boolean;
  isPlaceholder?: boolean;
  disabled?: boolean;
}

const KeyButton: React.FC<KeyButtonProps> = ({
  label,
  onPress,
  isBackspace = false,
  isPlaceholder = false,
  disabled = false,
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, speed: 50 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1.0, useNativeDriver: true, speed: 50 }).start();
  };

  if (isPlaceholder) {
    return <View style={styles.keyPlaceholder} />;
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[styles.key, isBackspace && styles.keyBackspace]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Text style={[styles.keyLabel, isBackspace && styles.keyLabelBackspace]}>
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── Haptics helper ───────────────────────────────────────────────────────────

const triggerHaptic = (style: 'light' | 'medium') => {
  if (Platform.OS === 'ios') {
    Haptics.impactAsync(
      style === 'light'
        ? Haptics.ImpactFeedbackStyle.Light
        : Haptics.ImpactFeedbackStyle.Medium,
    );
  } else {
    Haptics.selectionAsync();
  }
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const KEY_SIZE = 68;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 28,
  },
  dots: {
    flexDirection: 'row',
    gap: 16,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: KEY_SIZE * 3 + 16 * 2,
    gap: 16,
    justifyContent: 'center',
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyBackspace: {
    backgroundColor: 'transparent',
  },
  keyPlaceholder: {
    width: KEY_SIZE,
    height: KEY_SIZE,
  },
  keyLabel: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
  },
  keyLabelBackspace: {
    fontSize: 20,
    color: '#6B7280',
  },
});
