import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type MenuItemProps = {
  icon: string;
  title: string;
  subtitle?: string;
  color: string;
  onPress: () => void;
  isLast?: boolean;
};

const MenuItem: React.FC<MenuItemProps> = ({
  icon,
  title,
  subtitle,
  color,
  onPress,
  isLast = false,
}) => (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={onPress}
    style={[styles.menuItem, !isLast && styles.menuItemDivider]}
  >
    <View style={[styles.menuIconWrap, { backgroundColor: color }]}>
      <Text style={styles.menuIcon}>{icon}</Text>
    </View>

    <View style={styles.menuTextCol}>
      <Text style={styles.menuTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
    </View>

    <Text style={styles.menuChevron}>›</Text>
  </TouchableOpacity>
);

type MoreScreenProps = {
  onIncomeEnginePress?: () => void;
};

export const MoreScreen: React.FC<MoreScreenProps> = ({ onIncomeEnginePress }) => {
  const insets = useSafeAreaInsets();

  const handleIncomeEnginePress = () => {
    if (onIncomeEnginePress) {
      onIncomeEnginePress();
      return;
    }
    // Fallback for standalone usage.
    console.log('Navigate to Income Engine');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <Text style={styles.headerTitle}>Menu</Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.sectionCard}>
          <MenuItem
            icon="⚙️"
            title="Income Engine"
            subtitle="Configure your monthly flow"
            color="#7C3AED"
            onPress={handleIncomeEnginePress}
          />
          <MenuItem
            icon="💳"
            title="My Accounts"
            color="#32ADE6"
            onPress={() => {}}
          />
          <MenuItem
            icon="🏛️"
            title="Tax Vault"
            color="#FF3B30"
            onPress={() => {}}
            isLast
          />
        </View>

        <View style={styles.sectionCard}>
          <MenuItem
            icon="🔒"
            title="Settings & Security"
            color="#8E8E93"
            onPress={() => {}}
            isLast
          />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E17',
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.8,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  scrollContent: {
    paddingBottom: 32,
    gap: 16,
  },
  sectionCard: {
    backgroundColor: '#161622',
    borderRadius: 16,
    marginHorizontal: 20,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 74,
  },
  menuItemDivider: {
    borderBottomWidth: 1,
    borderColor: '#2A2A3C',
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuIcon: {
    fontSize: 17,
  },
  menuTextCol: {
    flex: 1,
    minWidth: 0,
  },
  menuTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  menuSubtitle: {
    marginTop: 2,
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '500',
  },
  menuChevron: {
    color: '#8E8E93',
    fontSize: 24,
    lineHeight: 24,
    marginLeft: 8,
  },
});
