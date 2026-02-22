import type { NavigatorScreenParams } from '@react-navigation/native';

import type { AddStackParamList } from './stacks/AddStack';
import type { AnalyticsStackParamList } from './stacks/AnalyticsStack';
import type { GroupsStackParamList } from './stacks/GroupsStack';
import type { HomeStackParamList } from './stacks/HomeStack';
import type { ProfileStackParamList } from './stacks/ProfileStack';
import type { TransactionsStackParamList } from './stacks/TransactionsStack';

export type ModuleStackParamList = {
  Hub: undefined;
  StitchPreview: { screenKey: string };
};

export type RootTabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  TransactionsTab: NavigatorScreenParams<TransactionsStackParamList>;
  AnalyticsTab: NavigatorScreenParams<AnalyticsStackParamList>;
  GroupsTab: NavigatorScreenParams<GroupsStackParamList>;
  AddTab: NavigatorScreenParams<AddStackParamList>;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList>;
};

export type AuthStackParamList = {
  DebugInput: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};
