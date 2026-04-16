import React, { useMemo, useRef } from 'react';
import { Animated, View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, PanResponder } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFinancials } from '../hooks/useFinancials';
import { useWealth } from '../context/WealthContext';
import { AppPageHeader } from '../components/AppPageHeader';

const MORE_NAVY_RATIO = 0.15;

type GridItemProps = {
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  onPress: () => void;
};

const GridItem: React.FC<GridItemProps> = ({ icon, title, subtitle, color, onPress }) => (
  <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.gridCard}>
    <View style={[styles.menuIconWrap, { backgroundColor: color }]}>
      <Text style={styles.menuIcon}>{icon}</Text>
    </View>
    <View style={styles.menuTextCol}>
      <Text style={styles.menuTitle}>{title}</Text>
      <Text style={styles.menuSubtitle}>{subtitle}</Text>
    </View>
  </TouchableOpacity>
);

type MoreScreenProps = {
  onIncomeEnginePress?: () => void;
  onLoanPress?: () => void;
  onBack?: () => void;
  headerShieldPct?: number;
  headerTrackPct?: number;
  headerBuildPct?: number;
  headerOvrScore?: number;
};

export const MoreScreen: React.FC<MoreScreenProps> = ({
  onIncomeEnginePress,
  onLoanPress,
  onBack,
  headerShieldPct,
  headerTrackPct,
  headerBuildPct,
  headerOvrScore,
}) => {
  const insets = useSafeAreaInsets();
  const { summary } = useFinancials();
  const { shieldPercentage, ovrScore } = useWealth();
  const resolvedShieldPct = headerShieldPct ?? shieldPercentage;
  const resolvedTrackPct = headerTrackPct ?? summary.trackPct;
  const resolvedBuildPct = headerBuildPct ?? summary.buildPct;
  const resolvedOvrScore = headerOvrScore ?? ovrScore;
  const { height: screenHeight } = Dimensions.get('window');
  const whiteTopSpacing = Math.round(screenHeight * 0.03);
  const minimizedTop = Math.round(screenHeight * MORE_NAVY_RATIO);
  const expandedTop = insets.top + 8;
  const sheetTop = useRef(new Animated.Value(minimizedTop)).current;
  const panStartTopRef = useRef(minimizedTop);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > 3,
        onMoveShouldSetPanResponderCapture: (_, g) =>
          Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > 2,
        onPanResponderGrant: () => {
          sheetTop.stopAnimation((value: number) => {
            panStartTopRef.current = value;
          });
        },
        onPanResponderMove: (_, g) => {
          const next = panStartTopRef.current + g.dy;
          const clamped = Math.max(expandedTop, Math.min(minimizedTop, next));
          sheetTop.setValue(clamped);
        },
        onPanResponderRelease: (_, g) => {
          sheetTop.stopAnimation((value: number) => {
            const shouldExpand = g.vy < -0.25 || value < expandedTop + (minimizedTop - expandedTop) * 0.68;
            Animated.timing(sheetTop, {
              toValue: shouldExpand ? expandedTop : minimizedTop,
              duration: 220,
              useNativeDriver: false,
            }).start();
          });
        },
      }),
    [expandedTop, minimizedTop, sheetTop],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.topSectionWhite, { paddingTop: insets.top }]}>
        <View style={styles.topSectionInner}>
          <AppPageHeader
            title="More"
            onBack={onBack}
            ovrScore={resolvedOvrScore}
            shieldPct={resolvedShieldPct}
            trackPct={resolvedTrackPct}
            buildPct={resolvedBuildPct}
          />
        </View>
      </View>

      <Animated.View style={[styles.sheet, { top: sheetTop }]} {...panResponder.panHandlers}>
        <View style={styles.sheetHandleWrap} {...panResponder.panHandlers}>
          <View style={styles.sheetHandle} />
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingTop: whiteTopSpacing }]}
        >
          <View style={styles.gridWrap}>
            <GridItem
              icon="💳"
              title="My Accounts"
              subtitle="Banks and wallets"
              color="#32ADE6"
              onPress={() => {}}
            />
            <GridItem
              icon="🏛️"
              title="Tax Vault"
              subtitle="Plan and track tax"
              color="#FF3B30"
              onPress={() => {}}
            />
            <GridItem
              icon="💸"
              title="Loan"
              subtitle="Borrow and repay"
              color="#F59E0B"
              onPress={() => {
                if (onLoanPress) onLoanPress();
              }}
            />
            <GridItem
              icon="🔒"
              title="Settings"
              subtitle="Security and privacy"
              color="#8E8E93"
              onPress={() => {}}
            />
            <GridItem
              icon="⚙️"
              title="Income Engine"
              subtitle="Configure monthly flow"
              color="#7C3AED"
              onPress={() => {
                if (onIncomeEnginePress) onIncomeEnginePress();
              }}
            />
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E17',
  },
  topSectionWhite: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: `${MORE_NAVY_RATIO * 100}%`,
    backgroundColor: '#1A1A2E',
    zIndex: 2,
  },
  topSectionInner: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    overflow: 'hidden',
    zIndex: 5,
  },
  sheetHandleWrap: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D8DAE4',
  },
  scrollContent: {
    backgroundColor: '#FFFFFF',
    paddingTop: 14,
    paddingBottom: 120,
  },
  gridWrap: {
    marginHorizontal: 20,
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  gridCard: {
    width: '48%',
    minHeight: 112,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EEF2FF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'space-between',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIcon: {
    fontSize: 17,
  },
  menuTextCol: {
    marginTop: 12,
  },
  menuTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  menuSubtitle: {
    marginTop: 4,
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '500',
  },
});

