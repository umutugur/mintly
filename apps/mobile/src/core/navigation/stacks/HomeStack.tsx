import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { I18N_KEYS } from '@shared/i18n/keys';
import { useI18n } from '@shared/i18n';
import { useT } from '@shared/i18n/t';
import { createStackOptions } from '../createStackOptions';
import { DashboardScreen } from '@features/finance/screens/DashboardScreen';
import { useTheme } from '@shared/theme';
import { HeaderActionButton } from '../HeaderActionButton';

export type HomeStackParamList = {
  Dashboard: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStack() {
  const { theme } = useTheme();
  const { locale } = useI18n();
  const t = useT();

  return (
    <Stack.Navigator key={`home-stack-${locale}`} screenOptions={createStackOptions(theme)}>
      <Stack.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={({ navigation }) => ({
          title: t(I18N_KEYS.common.navigation.stacks.dashboard.headerTitle),
          headerRight: () => (
            <HeaderActionButton
              icon="settings-outline"
              accessibilityLabel={t(I18N_KEYS.common.navigation.stacks.settings.headerTitle)}
              onPress={() => {
                navigation.getParent()?.navigate('ProfileTab' as never);
              }}
            />
          ),
        })}
      />
    </Stack.Navigator>
  );
}
