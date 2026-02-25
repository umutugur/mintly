import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AiReceiptParseResponse } from '@mintly/shared';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import type { TransactionsStackParamList } from '@core/navigation/stacks/TransactionsStack';
import { Card, PrimaryButton, ScreenContainer } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';

import { parseReceiptText, type ParsedReceiptDraft, type ScanCategoryHint } from '../lib/ocrParsing';
import { recognizeReceiptText } from '../lib/ocrRecognition';

const MIN_PARSE_CONFIDENCE_FOR_LOCAL = 0.72;

function needsAiAssist(draft: ParsedReceiptDraft, rawText: string): boolean {
  const missingCoreField = draft.title.trim().length === 0 || draft.amount.trim().length === 0;
  return rawText.trim().length >= 12 && (missingCoreField || draft.parseConfidence < MIN_PARSE_CONFIDENCE_FOR_LOCAL);
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

function mergeDraftWithAiAssist(
  draft: ParsedReceiptDraft,
  ai: AiReceiptParseResponse,
  baseCurrency: string,
): ParsedReceiptDraft {
  const parsedAmountNumber = Number(draft.amount.replace(',', '.'));
  const hasLocalAmount = Number.isFinite(parsedAmountNumber) && parsedAmountNumber > 0;

  let amount = draft.amount;
  if (!hasLocalAmount && ai.amount !== null) {
    amount = ai.amount.toFixed(2);
  } else if (hasLocalAmount && ai.amount !== null && draft.parseConfidence < 0.6) {
    const diffRatio = Math.abs(parsedAmountNumber - ai.amount) / Math.max(parsedAmountNumber, ai.amount, 1);
    if (diffRatio >= 0.4) {
      amount = ai.amount.toFixed(2);
    }
  }

  const title = draft.title.trim().length > 0 ? draft.title : ai.merchant ?? draft.title;
  const occurredDate = ai.date && draft.parseConfidence < 0.85 ? ai.date : draft.occurredDate;
  const detectedCurrency = draft.detectedCurrency ?? ai.currency;
  const categoryHint = draft.categoryHint ?? normalizeCategoryHint(ai.categorySuggestion);

  return {
    ...draft,
    title,
    amount,
    occurredDate,
    categoryHint,
    detectedCurrency,
    currencyWarning: Boolean(detectedCurrency) && detectedCurrency !== baseCurrency,
    parseConfidence: Math.max(draft.parseConfidence, ai.confidence),
  };
}

export function ScanReceiptScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TransactionsStackParamList>>();
  const { user, withAuth } = useAuth();
  const { theme, mode } = useTheme();
  const { locale, t } = useI18n();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [libraryPermission, requestLibraryPermission] = ImagePicker.useMediaLibraryPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const cameraRef = useRef<CameraView | null>(null);

  const dark = mode === 'dark';
  const baseCurrency = user?.baseCurrency ?? 'TRY';

  const permissionGranted = cameraPermission?.granted ?? false;

  async function processImageUri(uri: string): Promise<void> {
    setErrorCode(null);
    setIsProcessing(true);

    try {
      const recognition = await recognizeReceiptText(uri);
      const parsedDraft = parseReceiptText({
        rawText: recognition.rawText,
        baseCurrency,
      });
      let draft = parsedDraft;

      if (needsAiAssist(parsedDraft, recognition.rawText)) {
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

          draft = mergeDraftWithAiAssist(parsedDraft, aiDraft, baseCurrency);
        } catch {
          // Keep local OCR parse when AI assist is unavailable.
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

    const image = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    if (!image?.uri) {
      setErrorCode('errors.scan.captureFailed');
      return;
    }

    await processImageUri(image.uri);
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

    await processImageUri(result.assets[0].uri);
  }

  if (!cameraPermission) {
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
          <CameraView ref={cameraRef} facing="back" mode="picture" style={StyleSheet.absoluteFill} />

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
