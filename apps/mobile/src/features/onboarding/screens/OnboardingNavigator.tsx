import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { useI18n } from '@shared/i18n';
import { spacing, useTheme } from '@shared/theme';
import { ScreenContainer } from '@shared/ui';
import { OnboardingStepFrame } from './OnboardingStepFrame';

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

const OnboardingFlowContext = createContext<OnboardingFlowContextValue | null>(null);
const TOTAL_STEPS = 3;

type OnboardingStep = 1 | 2 | 3;

function clampStep(value: number): OnboardingStep {
  if (value <= 1) {
    return 1;
  }

  if (value >= TOTAL_STEPS) {
    return 3;
  }

  return value as OnboardingStep;
}

function offsetToStep(offsetX: number, width: number): OnboardingStep {
  if (width <= 0) {
    return 1;
  }

  const rawStep = Math.round(offsetX / width) + 1;
  return clampStep(rawStep);
}

export function useOnboardingFlow(): OnboardingFlowContextValue {
  const context = useContext(OnboardingFlowContext);

  if (!context) {
    throw new Error('useOnboardingFlow must be used inside OnboardingNavigator');
  }

  return context;
}

export function OnboardingNavigator({ mode = 'preview', onFinished }: OnboardingNavigatorProps) {
  const { mode: themeMode } = useTheme();
  const { t } = useI18n();
  const pagerRef = useRef<ScrollView | null>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [activeStep, setActiveStep] = useState<OnboardingStep>(1);

  const contextValue = useMemo<OnboardingFlowContextValue>(
    () => ({
      mode,
      finish: () => {
        onFinished?.();
      },
    }),
    [mode, onFinished],
  );

  const goToStep = (nextStep: OnboardingStep) => {
    if (nextStep !== activeStep) {
      setActiveStep(nextStep);
    }

    if (pageWidth <= 0) {
      return;
    }

    pagerRef.current?.scrollTo({
      x: (nextStep - 1) * pageWidth,
      animated: true,
    });
  };

  const onPagerMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextStep = offsetToStep(event.nativeEvent.contentOffset.x, pageWidth);
    if (nextStep !== activeStep) {
      setActiveStep(nextStep);
    }
  };

  const finishFlow = () => {
    contextValue.finish();
  };

  useEffect(() => {
    if (pageWidth <= 0) {
      return;
    }

    pagerRef.current?.scrollTo({
      x: (activeStep - 1) * pageWidth,
      animated: false,
    });
  }, [activeStep, pageWidth]);

  return (
    <OnboardingFlowContext.Provider value={contextValue}>
      <ScreenContainer
        dark={themeMode === 'dark'}
        scrollable={false}
        contentStyle={styles.screenContent}
      >
        <View
          style={styles.pagerWrap}
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            if (Math.round(width) !== Math.round(pageWidth)) {
              setPageWidth(width);
            }
          }}
        >
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            bounces={false}
            directionalLockEnabled
            decelerationRate="fast"
            overScrollMode="never"
            onMomentumScrollEnd={onPagerMomentumEnd}
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pagerContent}
          >
            <View style={[styles.page, { width: pageWidth || 1 }]}>
              <OnboardingStepFrame
                embedded
                style={styles.pageInner}
                step={1}
                title={t('onboarding.step1.title')}
                subtitle={t('onboarding.step1.subtitle')}
                illustrationIcon="💳"
                actionLabel={t('onboarding.next')}
                onActionPress={() => goToStep(2)}
                onSkipPress={finishFlow}
              />
            </View>
            <View style={[styles.page, { width: pageWidth || 1 }]}>
              <OnboardingStepFrame
                embedded
                style={styles.pageInner}
                step={2}
                title={t('onboarding.step2.title')}
                subtitle={t('onboarding.step2.subtitle')}
                illustrationIcon="📊"
                actionLabel={t('onboarding.next')}
                onActionPress={() => goToStep(3)}
                onSkipPress={finishFlow}
              />
            </View>
            <View style={[styles.page, { width: pageWidth || 1 }]}>
              <OnboardingStepFrame
                embedded
                style={styles.pageInner}
                step={3}
                title={mode === 'gate' ? t('onboarding.step3.titleGate') : t('onboarding.step3.titlePreview')}
                subtitle={t('onboarding.step3.subtitle')}
                illustrationIcon="✨"
                actionLabel={t('onboarding.getStarted')}
                onActionPress={finishFlow}
              />
            </View>
          </ScrollView>
        </View>
      </ScreenContainer>
    </OnboardingFlowContext.Provider>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    gap: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  pagerWrap: {
    flex: 1,
  },
  pagerContent: {
    flexGrow: 1,
  },
  page: {
    flex: 1,
  },
  pageInner: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
});
