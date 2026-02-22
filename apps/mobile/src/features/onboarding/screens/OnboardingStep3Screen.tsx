import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useI18n } from '@shared/i18n';
import { OnboardingStepFrame } from './OnboardingStepFrame';
import { useOnboardingFlow, type OnboardingStackParamList } from './OnboardingNavigator';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingStep3'>;

export function OnboardingStep3Screen(_: Props) {
  const { finish, mode } = useOnboardingFlow();
  const { t } = useI18n();

  return (
    <OnboardingStepFrame
      step={3}
      title={mode === 'gate' ? t('onboarding.step3.titleGate') : t('onboarding.step3.titlePreview')}
      subtitle={t('onboarding.step3.subtitle')}
      illustrationIcon="✨"
      actionLabel={t('onboarding.getStarted')}
      onActionPress={finish}
      onSkipPress={undefined}
    />
  );
}
