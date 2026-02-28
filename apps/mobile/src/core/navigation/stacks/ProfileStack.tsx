import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '@app/providers/AuthProvider';
import { I18N_KEYS } from '@shared/i18n/keys';
import { useI18n } from '@shared/i18n';
import { useT } from '@shared/i18n/t';
import { ContactScreen } from '@features/profile/screens/ContactScreen';
import { createStackOptions } from '../createStackOptions';
import { AccountsScreen } from '@features/finance/screens/AccountsScreen';
import { OnboardingNavigator } from '@features/onboarding/screens/OnboardingNavigator';
import { AboutScreen } from '@features/profile/screens/AboutScreen';
import { EditProfileScreen } from '@features/profile/screens/EditProfileScreen';
import { FinancialGoalsScreen } from '@features/profile/screens/FinancialGoalsScreen';
import { HelpSupportScreen } from '@features/profile/screens/HelpSupportScreen';
import { PrivacyScreen } from '@features/profile/screens/PrivacyScreen';
import { ProfileScreen } from '@features/profile/screens/ProfileScreen';
import { SecurityScreen } from '@features/profile/screens/SecurityScreen';
import { SettingsScreen } from '@features/profile/screens/SettingsScreen';
import { TermsScreen } from '@features/profile/screens/TermsScreen';
import { useTheme } from '@shared/theme';
import { HeaderActionButton } from '../HeaderActionButton';

export type ProfileStackParamList = {
  ProfileHome: undefined;
  EditProfile: undefined;
  FinancialGoals: undefined;
  Settings: undefined;
  Security: undefined;
  About: undefined;
  Terms: undefined;
  Privacy: undefined;
  HelpSupport: undefined;
  Contact: undefined;
  Accounts: undefined;
  HowItWorks: undefined;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export function ProfileStack() {
  const { isGuest } = useAuth();
  const { theme } = useTheme();
  const { locale } = useI18n();
  const t = useT();

  return (
    <Stack.Navigator key={`profile-stack-${locale}`} screenOptions={createStackOptions(theme)}>
      <Stack.Screen
        name="ProfileHome"
        component={ProfileScreen}
        options={({ navigation }) => ({
          title: t(I18N_KEYS.common.navigation.stacks.profile.headerTitle),
          headerRight: () => (!isGuest ? (
            <HeaderActionButton
              icon="settings-outline"
              accessibilityLabel={t(I18N_KEYS.common.navigation.stacks.settings.headerTitle)}
              onPress={() => navigation.navigate('Settings')}
            />
          ) : null),
        })}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ title: t(I18N_KEYS.common.navigation.stacks.editProfile.headerTitle) }}
      />
      <Stack.Screen
        name="FinancialGoals"
        component={FinancialGoalsScreen}
        options={{ title: t(I18N_KEYS.common.navigation.stacks.financialGoals.headerTitle) }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: t(I18N_KEYS.common.navigation.stacks.settings.headerTitle) }}
      />
      <Stack.Screen
        name="Security"
        component={SecurityScreen}
        options={{ title: t(I18N_KEYS.common.navigation.stacks.security.headerTitle) }}
      />
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{ title: t(I18N_KEYS.common.navigation.stacks.about.headerTitle) }}
      />
      <Stack.Screen
        name="Terms"
        component={TermsScreen}
        options={{ title: t('profile.terms.title') }}
      />
      <Stack.Screen
        name="Privacy"
        component={PrivacyScreen}
        options={{ title: t('profile.privacy.title') }}
      />
      <Stack.Screen
        name="HelpSupport"
        component={HelpSupportScreen}
        options={{ title: t('profile.helpSupport.title') }}
      />
      <Stack.Screen
        name="Contact"
        component={ContactScreen}
        options={{ title: t('profile.contact.title') }}
      />
      <Stack.Screen
        name="Accounts"
        component={AccountsScreen}
        options={{ title: t(I18N_KEYS.common.navigation.stacks.accounts.headerTitle) }}
      />
      <Stack.Screen
        name="HowItWorks"
        options={{ headerShown: false }}
      >
        {({ navigation }) => (
          <OnboardingNavigator mode="preview" onFinished={() => navigation.goBack()} />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
