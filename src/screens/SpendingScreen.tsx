import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppPageHeader } from '../components/AppPageHeader';
import { SpendingScrollBody } from './SpendingScrollBody';

type Props = {
  tabBarHeight: number;
  activeDailyBudget: number;
  onBack?: () => void;
  headerShieldPct?: number;
  headerTrackPct?: number;
  headerBuildPct?: number;
  headerOvrScore?: number;
};

export const SpendingScreen: React.FC<Props> = ({
  tabBarHeight,
  activeDailyBudget,
  onBack,
  headerShieldPct = 0,
  headerTrackPct = 0,
  headerBuildPct = 0,
  headerOvrScore = 0,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <View style={[styles.headerBlock, { paddingTop: insets.top }]}>
        <View style={styles.headerInner}>
          <AppPageHeader
            title="Spending"
            onBack={onBack}
            ovrScore={headerOvrScore}
            shieldPct={headerShieldPct}
            trackPct={headerTrackPct}
            buildPct={headerBuildPct}
          />
        </View>
      </View>
      <SpendingScrollBody activeDailyBudget={activeDailyBudget} tabBarHeight={tabBarHeight} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1A1A2E' },
  headerBlock: {
    backgroundColor: '#1A1A2E',
  },
  headerInner: {
    paddingHorizontal: 16,
    paddingBottom: 0,
  },
});
