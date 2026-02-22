import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { createStackOptions } from '../createStackOptions';
import { I18N_KEYS } from '@shared/i18n/keys';
import { useI18n } from '@shared/i18n';
import { useT } from '@shared/i18n/t';
import { ScanConfirmScreen } from '@features/scan/screens/ScanConfirmScreen';
import { ScanReceiptScreen } from '@features/scan/screens/ScanReceiptScreen';
import { AddGroupExpenseScreen } from '@features/groups/screens/AddGroupExpenseScreen';
import { CreateGroupScreen } from '@features/groups/screens/CreateGroupScreen';
import { GroupDetailScreen } from '@features/groups/screens/GroupDetailScreen';
import { GroupsScreen } from '@features/groups/screens/GroupsScreen';
import { SettleUpScreen } from '@features/groups/screens/SettleUpScreen';
import { EditTransactionScreen } from '@features/finance/screens/EditTransactionScreen';
import { UpcomingPaymentDetailScreen } from '@features/finance/screens/UpcomingPaymentDetailScreen';
import { UpcomingPaymentsScreen } from '@features/finance/screens/UpcomingPaymentsScreen';
import { RecurringScreen } from '@features/finance/screens/RecurringScreen';
import { TransactionDetailScreen } from '@features/finance/screens/TransactionDetailScreen';
import { TransferScreen } from '@features/finance/screens/TransferScreen';
import { TransactionsScreen } from '@features/finance/screens/TransactionsScreen';
import { useTheme } from '@shared/theme';
import type { ParsedReceiptDraft } from '@features/scan/lib/ocrParsing';

export type TransactionsStackParamList = {
  Transactions: undefined;
  TransactionDetail: { transactionId: string };
  EditTransaction: { transactionId: string };
  Transfer: undefined;
  Recurring: undefined;
  ScanReceipt: undefined;
  ScanConfirm: {
    photoUri: string;
    rawText: string;
    ocrMode: 'mlkit' | 'fallback';
    draft: ParsedReceiptDraft;
  };
  UpcomingPayments: undefined;
  UpcomingPaymentDetail: { paymentId: string };
  Groups: undefined;
  CreateGroup: undefined;
  GroupDetail: { groupId: string };
  AddGroupExpense: { groupId: string };
  SettleUp: { groupId: string };
};

const Stack = createNativeStackNavigator<TransactionsStackParamList>();

export function TransactionsStack() {
  const { theme } = useTheme();
  const { locale } = useI18n();
  const t = useT();

  return (
    <Stack.Navigator key={`transactions-stack-${locale}`} screenOptions={createStackOptions(theme)}>
      <Stack.Screen
        name="Transactions"
        component={TransactionsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TransactionDetail"
        component={TransactionDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="EditTransaction"
        component={EditTransactionScreen}
        options={{ title: t('tx.edit.title') }}
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
      <Stack.Screen
        name="ScanReceipt"
        component={ScanReceiptScreen}
        options={{ title: t('scan.receipt.title') }}
      />
      <Stack.Screen
        name="ScanConfirm"
        component={ScanConfirmScreen}
        options={{ title: t('scan.confirm.title') }}
      />
      <Stack.Screen
        name="UpcomingPayments"
        component={UpcomingPaymentsScreen}
        options={{ title: t('upcoming.list.title') }}
      />
      <Stack.Screen
        name="UpcomingPaymentDetail"
        component={UpcomingPaymentDetailScreen}
        options={{ title: t('upcoming.detail.title') }}
      />
      <Stack.Screen
        name="Groups"
        component={GroupsScreen}
        options={{ title: t(I18N_KEYS.common.navigation.stacks.groups.headerTitle) }}
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
