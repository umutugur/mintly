import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { I18N_KEYS } from '@shared/i18n/keys';
import { useI18n } from '@shared/i18n';
import { useT } from '@shared/i18n/t';
import { createStackOptions } from '../createStackOptions';
import { AiAdvisorScreen } from '@features/advisor/screens/AiAdvisorScreen';
import { AnalyticsScreen } from '@features/finance/screens/AnalyticsScreen';
import { BudgetsScreen } from '@features/finance/screens/BudgetsScreen';
import { WeeklyReportScreen } from '@features/advisor/screens/WeeklyReportScreen';
import { useTheme } from '@shared/theme';
import { HeaderActionButton } from '../HeaderActionButton';

export type AnalyticsStackParamList = {
  Analytics: undefined;
  Budgets: undefined;
  AiAdvisor: undefined;
  WeeklyReport: undefined;
};

const Stack = createNativeStackNavigator<AnalyticsStackParamList>();

export function AnalyticsStack() {
  const { theme } = useTheme();
  const { locale } = useI18n();
  const t = useT();

  return (
    <Stack.Navigator key={`analytics-stack-${locale}`} screenOptions={createStackOptions(theme)}>
      <Stack.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={({ navigation }) => ({
          title: t(I18N_KEYS.common.navigation.stacks.analytics.headerTitle),
          headerRight: () => (
            <HeaderActionButton
              icon="sparkles-outline"
              accessibilityLabel={t(I18N_KEYS.common.navigation.stacks.aiAdvisor.headerTitle)}
              onPress={() => navigation.navigate('AiAdvisor')}
            />
          ),
        })}
      />
      <Stack.Screen
        name="AiAdvisor"
        component={AiAdvisorScreen}
        options={{ title: t(I18N_KEYS.common.navigation.stacks.aiAdvisor.headerTitle) }}
      />
      <Stack.Screen
        name="WeeklyReport"
        component={WeeklyReportScreen}
        options={{ title: t(I18N_KEYS.common.navigation.stacks.weeklyReport.headerTitle) }}
      />
      <Stack.Screen
        name="Budgets"
        component={BudgetsScreen}
        options={{ title: t(I18N_KEYS.common.navigation.stacks.budgets.headerTitle) }}
      />
    </Stack.Navigator>
  );
}
