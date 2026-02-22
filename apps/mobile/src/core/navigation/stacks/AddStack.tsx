import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AddHubScreen } from '@features/finance/screens/AddHubScreen';
import { AddTransactionScreen } from '@features/finance/screens/AddTransactionScreen';
import { RecurringScreen } from '@features/finance/screens/RecurringScreen';
import { TransferScreen } from '@features/finance/screens/TransferScreen';
import { createStackOptions } from '../createStackOptions';
import { I18N_KEYS } from '@shared/i18n/keys';
import { useI18n } from '@shared/i18n';
import { useT } from '@shared/i18n/t';
import { useTheme } from '@shared/theme';
import { HeaderActionButton } from '../HeaderActionButton';

export type AddStackParamList = {
  AddHub: undefined;
  AddTransaction:
    | {
        prefill?: {
          amount?: string;
          description?: string;
          occurredAt?: string;
        };
      }
    | undefined;
  Transfer: undefined;
  Recurring: undefined;
};

const Stack = createNativeStackNavigator<AddStackParamList>();

export function AddStack() {
  const { theme } = useTheme();
  const { locale } = useI18n();
  const t = useT();

  return (
    <Stack.Navigator key={`add-stack-${locale}`} screenOptions={createStackOptions(theme)}>
      <Stack.Screen
        name="AddHub"
        component={AddHubScreen}
        options={({ navigation }) => ({
          title: t(I18N_KEYS.common.navigation.stacks.addHub.headerTitle),
          headerRight: () => (
            <HeaderActionButton
              icon="swap-horizontal-outline"
              accessibilityLabel={t(I18N_KEYS.common.navigation.stacks.transfer.headerTitle)}
              onPress={() => navigation.navigate('Transfer')}
            />
          ),
        })}
      />
      <Stack.Screen
        name="AddTransaction"
        component={AddTransactionScreen}
        options={{ title: t(I18N_KEYS.common.navigation.stacks.addTransaction.headerTitle) }}
      />
      <Stack.Screen
        name="Transfer"
        component={TransferScreen}
        options={{ title: t(I18N_KEYS.common.navigation.stacks.transfer.headerTitle) }}
      />
      <Stack.Screen
        name="Recurring"
        component={RecurringScreen}
        options={{ title: t(I18N_KEYS.common.navigation.stacks.recurring.headerTitle) }}
      />
    </Stack.Navigator>
  );
}
