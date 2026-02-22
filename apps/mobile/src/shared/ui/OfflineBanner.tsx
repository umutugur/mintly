import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useQueryClient } from '@tanstack/react-query';

import { useNetworkStatus } from '@app/providers/NetworkProvider';
import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isOffline, refreshConnectivity } = useNetworkStatus();
  const { t } = useI18n();
  const { theme, mode } = useTheme();
  const [isRetrying, setIsRetrying] = useState(false);

  if (!isOffline) {
    return null;
  }

  const retry = async () => {
    if (isRetrying) {
      return;
    }

    setIsRetrying(true);
    await refreshConnectivity();
    await queryClient.invalidateQueries();
    setIsRetrying(false);
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { top: Math.max(insets.top, spacing.xs) }]}
    >
      <View
        style={[
          styles.banner,
          {
            backgroundColor: mode === 'dark' ? '#472028' : '#FFF1F2',
            borderColor: mode === 'dark' ? '#803248' : '#FFC5CF',
          },
        ]}
      >
        <View style={styles.copyWrap}>
          <Text style={[styles.title, { color: theme.colors.expense }]}>{t('network.offline.title')}</Text>
          <Text style={[styles.message, { color: theme.colors.textMuted }]}>{t('network.offline.message')}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void retry();
          }}
          style={({ pressed }) => [
            styles.retryButton,
            {
              backgroundColor: theme.colors.primary,
              opacity: pressed || isRetrying ? 0.85 : 1,
            },
          ]}
        >
          {isRetrying ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.retryText}>{t('network.offline.retry')}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    left: spacing.sm,
    position: 'absolute',
    right: spacing.sm,
    zIndex: 30,
  },
  banner: {
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  copyWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.caption,
    fontWeight: '700',
    letterSpacing: 0.25,
  },
  message: {
    ...typography.caption,
    fontSize: 11,
  },
  retryButton: {
    alignItems: 'center',
    borderRadius: radius.full,
    justifyContent: 'center',
    minHeight: 30,
    minWidth: 84,
    paddingHorizontal: spacing.sm,
  },
  retryText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
