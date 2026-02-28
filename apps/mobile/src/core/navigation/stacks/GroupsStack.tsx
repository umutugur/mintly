import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '@app/providers/AuthProvider';
import { I18N_KEYS } from '@shared/i18n/keys';
import { useI18n } from '@shared/i18n';
import { useT } from '@shared/i18n/t';
import { AddGroupExpenseScreen } from '@features/groups/screens/AddGroupExpenseScreen';
import { CreateGroupScreen } from '@features/groups/screens/CreateGroupScreen';
import { GroupDetailScreen } from '@features/groups/screens/GroupDetailScreen';
import { GroupsScreen } from '@features/groups/screens/GroupsScreen';
import { SettleUpScreen } from '@features/groups/screens/SettleUpScreen';
import { useTheme } from '@shared/theme';
import { HeaderActionButton } from '../HeaderActionButton';

import { createStackOptions } from '../createStackOptions';

export type GroupsStackParamList = {
  Groups: undefined;
  CreateGroup: undefined;
  GroupDetail: { groupId: string };
  AddGroupExpense: { groupId: string };
  SettleUp: { groupId: string };
};

const Stack = createNativeStackNavigator<GroupsStackParamList>();

export function GroupsStack() {
  const { ensureSignedIn } = useAuth();
  const { theme } = useTheme();
  const { locale } = useI18n();
  const t = useT();

  return (
    <Stack.Navigator key={`groups-stack-${locale}`} screenOptions={createStackOptions(theme)}>
      <Stack.Screen
        name="Groups"
        component={GroupsScreen}
        options={({ navigation }) => ({
          title: t(I18N_KEYS.common.navigation.stacks.groups.headerTitle),
          headerRight: () => (
            <HeaderActionButton
              icon="add-circle-outline"
              accessibilityLabel={t(I18N_KEYS.common.navigation.stacks.createGroup.headerTitle)}
              onPress={() => {
                void (async () => {
                  if (!(await ensureSignedIn())) {
                    return;
                  }

                  navigation.navigate('CreateGroup');
                })();
              }}
            />
          ),
        })}
      />
      <Stack.Screen
        name="CreateGroup"
        component={CreateGroupScreen}
        options={{ title: t(I18N_KEYS.common.navigation.stacks.createGroup.headerTitle) }}
      />
      <Stack.Screen
        name="GroupDetail"
        component={GroupDetailScreen}
        options={{ title: t(I18N_KEYS.common.navigation.stacks.groupDetail.headerTitle) }}
      />
      <Stack.Screen
        name="AddGroupExpense"
        component={AddGroupExpenseScreen}
        options={{ title: t(I18N_KEYS.common.navigation.stacks.addGroupExpense.headerTitle) }}
      />
      <Stack.Screen
        name="SettleUp"
        component={SettleUpScreen}
        options={{ title: t(I18N_KEYS.common.navigation.stacks.settleUp.headerTitle) }}
      />
    </Stack.Navigator>
  );
}
