import { createContext, useContext, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';
import { ScreenContainer } from '@shared/ui';

export type OnboardingStackParamList = {
  OnboardingStep1: undefined;
  OnboardingStep2: undefined;
  OnboardingStep3: undefined;
  OnboardingStep4: undefined;
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

interface OnboardingSlide {
  id: 'welcome' | 'dashboard' | 'analysis' | 'ai';
  image: ImageSourcePropType;
  titleKey: string;
  subtitleKey: string;
}

const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    id: 'welcome',
    image: require('../../../assets/onboarding/montly-icon.png'),
    titleKey: 'onboarding.slides.welcome.title',
    subtitleKey: 'onboarding.slides.welcome.subtitle',
  },
  {
    id: 'dashboard',
    image: require('../../../assets/onboarding/montly-dashboard.png'),
    titleKey: 'onboarding.slides.dashboard.title',
    subtitleKey: 'onboarding.slides.dashboard.subtitle',
  },
  {
    id: 'analysis',
    image: require('../../../assets/onboarding/montly-analysis.png'),
    titleKey: 'onboarding.slides.analysis.title',
    subtitleKey: 'onboarding.slides.analysis.subtitle',
  },
  {
    id: 'ai',
    image: require('../../../assets/onboarding/montly-ai.png'),
    titleKey: 'onboarding.slides.ai.title',
    subtitleKey: 'onboarding.slides.ai.subtitle',
  },
];

const OnboardingFlowContext = createContext<OnboardingFlowContextValue | null>(null);
const LAST_SLIDE_INDEX = ONBOARDING_SLIDES.length - 1;

function clampIndex(index: number): number {
  if (index <= 0) {
    return 0;
  }

  if (index >= LAST_SLIDE_INDEX) {
    return LAST_SLIDE_INDEX;
  }

  return index;
}

export function useOnboardingFlow(): OnboardingFlowContextValue {
  const context = useContext(OnboardingFlowContext);

  if (!context) {
    throw new Error('useOnboardingFlow must be used inside OnboardingNavigator');
  }

  return context;
}

export function OnboardingNavigator({ mode = 'preview', onFinished }: OnboardingNavigatorProps) {
  const { theme, mode: themeMode } = useTheme();
  const { t } = useI18n();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const pagerRef = useRef<FlatList<OnboardingSlide> | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pageWidth, setPageWidth] = useState(Math.max(1, Math.round(windowWidth)));

  const contextValue = useMemo<OnboardingFlowContextValue>(
    () => ({
      mode,
      finish: () => {
        onFinished?.();
      },
    }),
    [mode, onFinished],
  );

  const dark = themeMode === 'dark';
  const isFirstSlide = activeIndex === 0;
  const isLastSlide = activeIndex === LAST_SLIDE_INDEX;
  const logoCardMaxHeight = Math.max(220, Math.min(windowHeight * 0.3, 320));
  const screenshotCardMaxHeight = Math.max(300, Math.min(windowHeight * 0.4, 420));

  const syncToIndex = (index: number, animated: boolean) => {
    const safeIndex = clampIndex(index);

    pagerRef.current?.scrollToOffset({
      offset: safeIndex * pageWidth,
      animated,
    });
  };

  const goToIndex = (index: number) => {
    const safeIndex = clampIndex(index);

    if (safeIndex !== activeIndex) {
      setActiveIndex(safeIndex);
    }

    syncToIndex(safeIndex, true);
  };

  const finishFlow = () => {
    contextValue.finish();
  };

  const handlePrimaryPress = () => {
    if (isLastSlide) {
      finishFlow();
      return;
    }

    goToIndex(activeIndex + 1);
  };

  const handleSecondaryPress = () => {
    if (isFirstSlide) {
      finishFlow();
      return;
    }

    goToIndex(activeIndex - 1);
  };

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth <= 0) {
      return;
    }

    const nextIndex = clampIndex(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
    if (nextIndex !== activeIndex) {
      setActiveIndex(nextIndex);
    }
  };

  const renderSlide = ({ item }: ListRenderItemInfo<OnboardingSlide>) => {
    const isLogoSlide = item.id === 'welcome';

    return (
      <View style={[styles.slidePage, { width: pageWidth }]}>
        <View style={styles.slideBody}>
          <View
            style={[
              styles.imageCard,
              isLogoSlide ? styles.imageCardLogo : styles.imageCardScreenshot,
              isLogoSlide ? { maxHeight: logoCardMaxHeight } : { maxHeight: screenshotCardMaxHeight },
              {
                backgroundColor: dark ? '#11192E' : '#FFFFFF',
                borderColor: theme.colors.cardBorder,
              },
            ]}
          >
            <Image
              source={item.image}
              style={[styles.image, isLogoSlide ? styles.imageLogo : styles.imageScreenshot]}
              resizeMode="contain"
            />
          </View>

          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: theme.colors.text }]}>{t(item.titleKey)}</Text>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{t(item.subtitleKey)}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <OnboardingFlowContext.Provider value={contextValue}>
      <ScreenContainer dark={dark} scrollable={false} contentStyle={styles.screenContent}>
        <View
          style={styles.root}
          onLayout={(event) => {
            const nextWidth = Math.max(1, Math.round(event.nativeEvent.layout.width));
            if (nextWidth !== pageWidth) {
              setPageWidth(nextWidth);
              pagerRef.current?.scrollToOffset({
                offset: activeIndex * nextWidth,
                animated: false,
              });
            }
          }}
        >
          <View style={styles.pagerWrap}>
            <FlatList
              ref={pagerRef}
              data={ONBOARDING_SLIDES}
              horizontal
              pagingEnabled
              bounces={false}
              directionalLockEnabled
              decelerationRate="fast"
              overScrollMode="never"
              keyExtractor={(item) => item.id}
              renderItem={renderSlide}
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onMomentumEnd}
              initialNumToRender={ONBOARDING_SLIDES.length}
              getItemLayout={(_, index) => ({
                length: pageWidth,
                offset: pageWidth * index,
                index,
              })}
              onScrollToIndexFailed={({ index }) => {
                pagerRef.current?.scrollToOffset({
                  offset: index * pageWidth,
                  animated: false,
                });
              }}
              extraData={pageWidth}
            />
          </View>

          <View style={[styles.footer, { borderTopColor: theme.colors.cardBorder }]}>
            <View style={styles.dotRow}>
              {ONBOARDING_SLIDES.map((slide, index) => (
                <View
                  key={slide.id}
                  style={[
                    styles.dot,
                    index === activeIndex
                      ? { backgroundColor: theme.colors.primary, width: 24 }
                      : { backgroundColor: theme.colors.textMuted, opacity: dark ? 0.52 : 0.35, width: 8 },
                  ]}
                />
              ))}
            </View>

            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                onPress={handleSecondaryPress}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  {
                    borderColor: theme.colors.cardBorder,
                    backgroundColor: dark ? theme.colors.surface : '#FFFFFF',
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={[styles.secondaryText, { color: theme.colors.text }]}>
                  {isFirstSlide ? t('onboarding.skip') : t('onboarding.back')}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={handlePrimaryPress}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: theme.colors.buttonPrimaryBackground,
                    opacity: pressed ? 0.88 : 1,
                  },
                ]}
              >
                <Text style={[styles.primaryText, { color: theme.colors.buttonPrimaryText }]}>
                  {isLastSlide
                    ? mode === 'gate'
                      ? t('onboarding.getStarted')
                      : t('onboarding.continue')
                    : t('onboarding.next')}
                </Text>
              </Pressable>
            </View>
          </View>
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
  root: {
    flex: 1,
  },
  pagerWrap: {
    flex: 1,
  },
  slidePage: {
    flex: 1,
  },
  slideBody: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 760,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  imageCard: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  imageCardLogo: {
    alignSelf: 'center',
    width: '70%',
    maxWidth: 280,
    aspectRatio: 1,
  },
  imageCardScreenshot: {
    alignSelf: 'center',
    width: '72%',
    maxWidth: 330,
    aspectRatio: 0.62,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageLogo: {
    width: '95%',
    height: '95%',
    transform: [{ scale: 1.03 }],
  },
  imageScreenshot: {
    width: '103%',
    height: '103%',
    transform: [{ scale: 1.02 }],
  },
  textWrap: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  title: {
    ...typography.heading,
    fontSize: 30,
    lineHeight: 36,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    height: 8,
    borderRadius: radius.full,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  secondaryText: {
    ...typography.body,
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  primaryText: {
    ...typography.body,
    fontWeight: '700',
  },
});
