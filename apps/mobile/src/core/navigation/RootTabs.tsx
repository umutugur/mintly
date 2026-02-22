import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet } from 'react-native';

import { AppIcon } from '@shared/ui';
import { I18N_KEYS } from '@shared/i18n/keys';
import { useI18n } from '@shared/i18n';
import { useT } from '@shared/i18n/t';
import { radius, spacing, typography, useTheme } from '@shared/theme';

import { AddTabButton } from './AddTabButton';
import { AddStack } from './stacks/AddStack';
import { AnalyticsStack } from './stacks/AnalyticsStack';
import { GroupsStack } from './stacks/GroupsStack';
import { HomeStack } from './stacks/HomeStack';
import { ProfileStack } from './stacks/ProfileStack';
import { TransactionsStack } from './stacks/TransactionsStack';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();
type StandardTabName = Exclude<keyof RootTabParamList, 'AddTab'>;

const TAB_ICON_MAP: Record<
  StandardTabName,
  {
    active: Parameters<typeof AppIcon>[0]['name'];
    inactive: Parameters<typeof AppIcon>[0]['name'];
  }
> = {
  HomeTab: { active: 'grid', inactive: 'grid-outline' },
  TransactionsTab: { active: 'receipt', inactive: 'receipt-outline' },
  AnalyticsTab: { active: 'stats-chart', inactive: 'stats-chart-outline' },
  GroupsTab: { active: 'people', inactive: 'people-outline' },
  ProfileTab: { active: 'person-circle', inactive: 'person-circle-outline' },
};

export function RootTabs() {
  const { theme } = useTheme();
  const { locale } = useI18n();
  const t = useT();

  return (
    <Tab.Navigator
      key={`tabs-${locale}`}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarShowLabel: true,
        tabBarStyle: {
          height: 78,
          paddingBottom: 8,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          shadowColor: theme.shadows.card.shadowColor,
          shadowOpacity: theme.shadows.card.shadowOpacity,
          shadowRadius: theme.shadows.card.shadowRadius,
          shadowOffset: theme.shadows.card.shadowOffset,
          elevation: theme.shadows.card.elevation,
        },
        tabBarItemStyle: styles.tabItem,
        tabBarLabelStyle: styles.tabLabel,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStack}
        options={{
          title: t(I18N_KEYS.common.navigation.tabs.home.label),
          tabBarLabel: t(I18N_KEYS.common.navigation.tabs.home.label),
          tabBarAccessibilityLabel: t(I18N_KEYS.common.navigation.tabs.home.label),
          tabBarIcon: ({ focused, color }) => (
            <AppIcon
              name={focused ? TAB_ICON_MAP.HomeTab.active : TAB_ICON_MAP.HomeTab.inactive}
              size={22}
              color={color}
            />
          ),
        }}
      />

      <Tab.Screen
        name="TransactionsTab"
        component={TransactionsStack}
        options={{
          title: t(I18N_KEYS.common.navigation.tabs.transactions.label),
          tabBarLabel: t(I18N_KEYS.common.navigation.tabs.transactions.shortLabel),
          tabBarAccessibilityLabel: t(I18N_KEYS.common.navigation.tabs.transactions.label),
          tabBarIcon: ({ focused, color }) => (
            <AppIcon
              name={focused ? TAB_ICON_MAP.TransactionsTab.active : TAB_ICON_MAP.TransactionsTab.inactive}
              size={22}
              color={color}
            />
          ),
        }}
      />

      <Tab.Screen
        name="AddTab"
        component={AddStack}
        options={{
          title: t(I18N_KEYS.common.navigation.tabs.add.label),
          tabBarButton: ({ onPress, accessibilityState }) => (
            <AddTabButton onPress={onPress} focused={Boolean(accessibilityState?.selected)} />
          ),
          tabBarLabel: () => null,
          tabBarIcon: () => null,
          headerShown: false,
        }}
      />

      <Tab.Screen
        name="AnalyticsTab"
        component={AnalyticsStack}
        options={{
          title: t(I18N_KEYS.common.navigation.tabs.analytics.label),
          tabBarLabel: t(I18N_KEYS.common.navigation.tabs.analytics.shortLabel),
          tabBarAccessibilityLabel: t(I18N_KEYS.common.navigation.tabs.analytics.label),
          tabBarIcon: ({ focused, color }) => (
            <AppIcon
              name={focused ? TAB_ICON_MAP.AnalyticsTab.active : TAB_ICON_MAP.AnalyticsTab.inactive}
              size={22}
              color={color}
            />
          ),
        }}
      />

      <Tab.Screen
        name="GroupsTab"
        component={GroupsStack}
        options={{
          title: t(I18N_KEYS.common.navigation.tabs.groups.label),
          tabBarLabel: t(I18N_KEYS.common.navigation.tabs.groups.shortLabel),
          tabBarAccessibilityLabel: t(I18N_KEYS.common.navigation.tabs.groups.label),
          tabBarIcon: ({ focused, color }) => (
            <AppIcon
              name={focused ? TAB_ICON_MAP.GroupsTab.active : TAB_ICON_MAP.GroupsTab.inactive}
              size={22}
              color={color}
            />
          ),
        }}
      />

      <Tab.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{
          title: t(I18N_KEYS.common.navigation.tabs.profile.label),
          tabBarLabel: t(I18N_KEYS.common.navigation.tabs.profile.shortLabel),
          tabBarAccessibilityLabel: t(I18N_KEYS.common.navigation.tabs.profile.label),
          tabBarIcon: ({ focused, color }) => (
            <AppIcon
              name={focused ? TAB_ICON_MAP.ProfileTab.active : TAB_ICON_MAP.ProfileTab.inactive}
              size={22}
              color={color}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabItem: {
    paddingTop: spacing.xxs,
  },
  tabLabel: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '600',
  },
});
