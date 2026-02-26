import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AiReceiptParseResponse } from '@mintly/shared';
import { detectText } from 'react-native-vision-camera-text-detector';
import { Camera, runAtTargetFps, useCameraDevice, useCameraPermission, useFrameProcessor } from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import type { TransactionsStackParamList } from '@core/navigation/stacks/TransactionsStack';
import { Card, PrimaryButton, ScreenContainer } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';

import { parseReceiptText, type ParsedReceiptDraft, type ScanCategoryHint } from '../lib/ocrParsing';
import { recognizeReceiptText } from '../lib/ocrRecognition';

const MIN_PARSE_CONFIDENCE_FOR_TRUSTED_TITLE = 0.72;
const MAX_AI_TITLE_LENGTH = 40;
const GENERIC_TITLE_PATTERNS = [
  /general\s+expense/i,
  /receipt/i,
  /expense/i,
  /payment/i,
  /transaction/i,
  /fis/i,
  /fiş/i,
];

function normalizeTitleCandidate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/\s+/g, ' ');

  if (!normalized) {
    return null;
  }

  if (/^[\d\W_]+$/u.test(normalized)) {
    return null;
  }

  return normalized.slice(0, MAX_AI_TITLE_LENGTH);
}

function hasLowQualityTitle(title: string): boolean {
  const normalized = title.trim();
  if (!normalized) {
    return true;
  }

  if (/^[\d\W_]+$/u.test(normalized)) {
    return true;
  }

  return GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function needsAiTitleAssist(draft: ParsedReceiptDraft, rawText: string): boolean {
  if (rawText.trim().length < 12) {
    return false;
  }

  const lowQualityTitle = hasLowQualityTitle(draft.title);
  return lowQualityTitle || draft.parseConfidence < MIN_PARSE_CONFIDENCE_FOR_TRUSTED_TITLE;
}

function deriveTitleFromAi(ai: AiReceiptParseResponse): string | null {
  return normalizeTitleCandidate(ai.merchant);
}

function normalizeCategoryHint(value: string | null): ScanCategoryHint {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized.includes('fuel') || normalized.includes('akaryak') || normalized.includes('benzin')) {
    return 'fuel';
  }
  if (normalized.includes('grocery') || normalized.includes('market') || normalized.includes('food') || normalized.includes('gida') || normalized.includes('gıda')) {
    return 'grocery';
  }

  return null;
}

function mergeDraftWithAiTitleAssist(
  draft: ParsedReceiptDraft,
  ai: AiReceiptParseResponse,
): ParsedReceiptDraft {
  const aiTitle = deriveTitleFromAi(ai);
  if (!aiTitle) {
    return draft;
  }

  const shouldOverride = hasLowQualityTitle(draft.title) || draft.title.trim().length === 0;
  if (!shouldOverride) {
    return draft;
  }

  return {
    ...draft,
    title: aiTitle,
    categoryHint: draft.categoryHint ?? normalizeCategoryHint(ai.categorySuggestion),
  };
}

export function ScanReceiptScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TransactionsStackParamList>>();
  const { user, withAuth } = useAuth();
  const { theme, mode } = useTheme();
  const { locale, t } = useI18n();
  const { hasPermission: permissionGranted, requestPermission: requestCameraPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [libraryPermission, requestLibraryPermission] = ImagePicker.useMediaLibraryPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const latestDetectedTextRef = useRef<string>('');

  const dark = mode === 'dark';
  const baseCurrency = user?.baseCurrency ?? 'TRY';

  const handleDetectedText = useCallback((text: string) => {
    if (text.trim().length === 0) {
      return;
    }
    latestDetectedTextRef.current = text;
  }, []);
  const runDetectedTextOnJs = useMemo(
    () => Worklets.createRunOnJS(handleDetectedText),
    [handleDetectedText],
  );

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    runAtTargetFps(2, () => {
      'worklet';
      try {
        const detection = detectText(frame);
        const text = detection?.text;
        if (typeof text === 'string' && text.trim().length > 0) {
          runDetectedTextOnJs(text);
        }
      } catch {
        // Keep capture flow running if frame processor plugin is temporarily unavailable.
      }
    });
  }, [runDetectedTextOnJs]);

  async function processImageUri(uri: string, frameText: string | null): Promise<void> {
    setErrorCode(null);
    setIsProcessing(true);

    try {
      const recognition = await recognizeReceiptText({
        photoUri: uri,
        frameText,
      });
      const parsedDraft = parseReceiptText({
        rawText: recognition.rawText,
        baseCurrency,
      });
      let draft = parsedDraft;

      if (needsAiTitleAssist(parsedDraft, recognition.rawText)) {
        try {
          const aiDraft = await withAuth((token) =>
            apiClient.parseReceiptWithAi(
              {
                rawText: recognition.rawText,
                locale,
                currencyHint: baseCurrency,
              },
              token,
            ),
          );

          draft = mergeDraftWithAiTitleAssist(parsedDraft, aiDraft);
        } catch {
          // Keep local OCR title when AI assist is unavailable.
        }
      }

      navigation.navigate('ScanConfirm', {
        photoUri: uri,
        rawText: recognition.rawText,
        ocrMode: recognition.mode,
        draft,
      });
    } catch {
      setErrorCode('errors.scan.ocrFailed');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleCapture(): Promise<void> {
    if (!cameraRef.current || isProcessing) {
      return;
    }

    const image = await cameraRef.current.takePhoto();
    if (!image?.path) {
      setErrorCode('errors.scan.captureFailed');
      return;
    }

    const photoUri = image.path.startsWith('file://') ? image.path : `file://${image.path}`;
    await processImageUri(photoUri, latestDetectedTextRef.current);
  }

  async function handlePickFromLibrary(): Promise<void> {
    if (isProcessing) {
      return;
    }

    if (!(libraryPermission?.granted ?? false)) {
      const permission = await requestLibraryPermission();
      if (!permission.granted) {
        setErrorCode('errors.scan.libraryPermissionDenied');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      mediaTypes: ['images'],
      quality: 1,
      selectionLimit: 1,
    });

    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }

    await processImageUri(result.assets[0].uri, null);
  }

  if (!device) {
    return (
      <ScreenContainer dark={dark}>
        <Card dark={dark} style={styles.stateCard}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={[styles.stateText, { color: theme.colors.textMuted }]}>
            {t('scan.receipt.state.preparing')}
          </Text>
        </Card>
      </ScreenContainer>
    );
  }

  if (!permissionGranted) {
    return (
      <ScreenContainer dark={dark}>
        <Card dark={dark} style={styles.permissionCard}>
          <Text style={[styles.permissionTitle, { color: theme.colors.text }]}> 
            {t('scan.receipt.permission.title')}
          </Text>
          <Text style={[styles.permissionSubtitle, { color: theme.colors.textMuted }]}> 
            {t('scan.receipt.permission.subtitle')}
          </Text>

          <PrimaryButton
            label={t('scan.receipt.permission.allowCamera')}
            onPress={() => {
              void requestCameraPermission();
            }}
          />
        </Card>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer dark={dark} scrollable={false} contentStyle={styles.containerContent}>
      <View style={styles.container}>
        <View style={[styles.cameraWrap, { borderColor: theme.colors.border }]}>
          <Camera
            ref={cameraRef}
            device={device}
            frameProcessor={frameProcessor}
            isActive={!isProcessing}
            photo
            style={StyleSheet.absoluteFill}
          />

          <View pointerEvents="none" style={styles.overlayFrameWrap}>
            <View style={[styles.overlayFrame, { borderColor: theme.colors.primary }]} />
          </View>
        </View>

        {errorCode ? (
          <Card dark={dark} style={styles.errorCard}>
            <Text style={[styles.errorText, { color: theme.colors.expense }]}>{t(errorCode)}</Text>
          </Card>
        ) : null}

        <View style={styles.footerActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void handlePickFromLibrary();
            }}
            style={[styles.secondaryAction, { borderColor: theme.colors.border }]}
          >
            <Text style={[styles.secondaryLabel, { color: theme.colors.text }]}>
              {t('scan.receipt.actions.pickPhoto')}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void handleCapture();
            }}
            style={[styles.primaryAction, { backgroundColor: theme.colors.primary }]}
          >
            {isProcessing ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.primaryLabel}>{t('scan.receipt.actions.capture')}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  containerContent: {
    flex: 1,
    gap: 0,
    paddingBottom: spacing.md,
  },
  container: {
    flex: 1,
    gap: spacing.sm,
  },
  cameraWrap: {
    borderRadius: radius.xl,
    borderWidth: 1,
    flex: 1,
    overflow: 'hidden',
  },
  overlayFrameWrap: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  overlayFrame: {
    borderRadius: radius.lg,
    borderWidth: 2,
    height: '56%',
    opacity: 0.6,
    width: '82%',
  },
  footerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryAction: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  secondaryLabel: {
    ...typography.subheading,
    fontWeight: '700',
  },
  primaryAction: {
    alignItems: 'center',
    borderRadius: radius.md,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  primaryLabel: {
    ...typography.subheading,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  stateCard: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 160,
  },
  stateText: {
    ...typography.body,
  },
  permissionCard: {
    gap: spacing.sm,
  },
  permissionTitle: {
    ...typography.heading,
    fontSize: 24,
  },
  permissionSubtitle: {
    ...typography.body,
  },
  errorCard: {
    paddingVertical: spacing.xs,
  },
  errorText: {
    ...typography.caption,
    fontSize: 13,
    textAlign: 'center',
  },
});
