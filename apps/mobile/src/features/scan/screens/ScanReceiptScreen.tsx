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

import { useAuth } from '@app/providers/AuthProvider';
import type { TransactionsStackParamList } from '@core/navigation/stacks/TransactionsStack';
import { Card, PrimaryButton, ScreenContainer } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';

import { parseReceiptText } from '../lib/ocrParsing';
import { recognizeReceiptText } from '../lib/ocrRecognition';

export function ScanReceiptScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TransactionsStackParamList>>();
  const { user } = useAuth();
  const { theme, mode } = useTheme();
  const { t } = useI18n();
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
      const parsed = parseReceiptText({
        rawText: recognition.rawText,
        baseCurrency,
      });

      navigation.navigate('ScanConfirm', {
        photoUri: uri,
        rawText: recognition.rawText,
        ocrMode: recognition.mode,
        draft: parsed,
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
