import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useI18n } from '@shared/i18n';
import { OnboardingStepFrame } from './OnboardingStepFrame';
import { useOnboardingFlow, type OnboardingStackParamList } from './OnboardingNavigator';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingStep1'>;

export function OnboardingStep1Screen({ navigation }: Props) {
  const { finish } = useOnboardingFlow();
  const { t } = useI18n();

  return (
    <OnboardingStepFrame
      step={1}
      title={t('onboarding.step1.title')}
      subtitle={t('onboarding.step1.subtitle')}
      illustrationIcon="💳"
      actionLabel={t('onboarding.next')}
      onActionPress={() => navigation.navigate('OnboardingStep2')}
      onSkipPress={finish}
    />
  );
}
