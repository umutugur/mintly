import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useI18n } from '@shared/i18n';
import { OnboardingStepFrame } from './OnboardingStepFrame';
import { useOnboardingFlow, type OnboardingStackParamList } from './OnboardingNavigator';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingStep2'>;

export function OnboardingStep2Screen({ navigation }: Props) {
  const { finish } = useOnboardingFlow();
  const { t } = useI18n();

  return (
    <OnboardingStepFrame
      step={2}
      title={t('onboarding.step2.title')}
      subtitle={t('onboarding.step2.subtitle')}
      illustrationIcon="📊"
      actionLabel={t('onboarding.next')}
      onActionPress={() => navigation.navigate('OnboardingStep3')}
      onSkipPress={finish}
    />
  );
}
