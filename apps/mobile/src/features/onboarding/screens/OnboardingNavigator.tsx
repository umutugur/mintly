import { createContext, useContext, useMemo } from 'react';

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { createStackOptions } from '@core/navigation/createStackOptions';
import { useTheme } from '@shared/theme';
import { OnboardingStep1Screen } from './OnboardingStep1Screen';
import { OnboardingStep2Screen } from './OnboardingStep2Screen';
import { OnboardingStep3Screen } from './OnboardingStep3Screen';

export type OnboardingStackParamList = {
  OnboardingStep1: undefined;
  OnboardingStep2: undefined;
  OnboardingStep3: undefined;
};

export type OnboardingMode = 'gate' | 'preview';

interface OnboardingNavigatorProps {
  mode?: OnboardingMode;
  onFinished?: () => void;
}

interface OnboardingFlowContextValue {
  mode: OnboardingMode;
  finish: () => void;
}

const Stack = createNativeStackNavigator<OnboardingStackParamList>();
const OnboardingFlowContext = createContext<OnboardingFlowContextValue | null>(null);

export function useOnboardingFlow(): OnboardingFlowContextValue {
  const context = useContext(OnboardingFlowContext);

  if (!context) {
    throw new Error('useOnboardingFlow must be used inside OnboardingNavigator');
  }

  return context;
}

export function OnboardingNavigator({ mode = 'preview', onFinished }: OnboardingNavigatorProps) {
  const { theme } = useTheme();

  const contextValue = useMemo<OnboardingFlowContextValue>(
    () => ({
      mode,
      finish: () => {
        onFinished?.();
      },
    }),
    [mode, onFinished],
  );

  return (
    <OnboardingFlowContext.Provider value={contextValue}>
      <Stack.Navigator
        initialRouteName="OnboardingStep1"
        screenOptions={{
          ...createStackOptions(theme),
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="OnboardingStep1" component={OnboardingStep1Screen} />
        <Stack.Screen name="OnboardingStep2" component={OnboardingStep2Screen} />
        <Stack.Screen name="OnboardingStep3" component={OnboardingStep3Screen} />
      </Stack.Navigator>
    </OnboardingFlowContext.Provider>
  );
}
