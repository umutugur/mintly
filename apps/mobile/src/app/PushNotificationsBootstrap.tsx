import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import i18n from 'i18next';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import { showAlert } from '@shared/ui';

const PUSH_PERMISSION_PROMPT_KEY = 'montly.push-permission-prompted';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function resolveProjectId(): string | null {
  const fromExpoConfig = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof fromExpoConfig === 'string' && fromExpoConfig.trim().length > 0) {
    return fromExpoConfig.trim();
  }

  const fromEasConfig = Constants.easConfig?.projectId;
  if (typeof fromEasConfig === 'string' && fromEasConfig.trim().length > 0) {
    return fromEasConfig.trim();
  }

  return null;
}

function buildDeviceInfo(): Record<string, unknown> {
  const constantsWithDeviceName = Constants as typeof Constants & {
    deviceName?: string | null;
  };

  return {
    appOwnership: Constants.appOwnership ?? null,
    executionEnvironment: String(Constants.executionEnvironment ?? 'unknown'),
    deviceName: constantsWithDeviceName.deviceName ?? null,
  };
}

function logPushDebug(stage: string, details: Record<string, unknown>): void {
  console.log(`[push][bootstrap] ${stage}`, details);
}

function maskPushToken(token: string | null | undefined): string | null {
  const value = token?.trim();
  if (!value) {
    return null;
  }

  if (value.length <= 20) {
    return `${value.slice(0, 8)}...`;
  }

  return `${value.slice(0, 12)}...${value.slice(-8)}`;
}

async function getExpoPushTokenWithRetry(
  projectId: string,
  platform: 'ios' | 'android',
): Promise<string | null> {
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
      const token = tokenResponse.data?.trim() ?? '';
      if (token.length > 0) {
        return token;
      }

      logPushDebug('token_generation_empty', {
        attempt,
        maxAttempts,
        platform,
      });
    } catch (error) {
      logPushDebug('token_generation_error', {
        attempt,
        maxAttempts,
        platform,
        reason: error instanceof Error ? error.message : 'unknown_error',
      });

      if (attempt === maxAttempts) {
        throw error;
      }
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => {
        setTimeout(resolve, 350);
      });
    }
  }

  return null;
}

export function PushNotificationsBootstrap() {
  const { status, isGuest, user, withAuth } = useAuth();
  const savedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      if (__DEV__) {
        console.info('[notifications][received]', {
          identifier: notification.request.identifier,
          title: notification.request.content.title ?? null,
          hasData: Boolean(notification.request.content.data),
        });
      }
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (__DEV__) {
        console.info('[notifications][response]', {
          actionIdentifier: response.actionIdentifier,
          identifier: response.notification.request.identifier,
        });
      }
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (status !== 'authenticated' || isGuest) {
      savedTokenRef.current = null;
      return;
    }

    let active = true;

    void (async () => {
      try {
        const pushPlatform = Platform.OS === 'ios' ? 'ios' : 'android';

        if (!user?.id) {
          logPushDebug('skipped', {
            reason: 'user_missing',
          });
          return;
        }

        if (pushPlatform === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
          });
          logPushDebug('android_channel_ready', {
            channelId: 'default',
          });
        }

        const currentPermissions = await Notifications.getPermissionsAsync();
        let granted = currentPermissions.granted;
        logPushDebug('permission_status', {
          status: currentPermissions.status,
          granted: currentPermissions.granted,
          canAskAgain: currentPermissions.canAskAgain,
          platform: pushPlatform,
        });

        if (!granted) {
          const prompted = await SecureStore.getItemAsync(PUSH_PERMISSION_PROMPT_KEY);
          if (prompted !== 'true') {
            const choice = await showAlert(
              i18n.t('app.notificationsPrompt.title'),
              i18n.t('app.notificationsPrompt.body'),
              [
                {
                  text: i18n.t('app.notificationsPrompt.later'),
                  style: 'cancel',
                },
                {
                  text: i18n.t('app.notificationsPrompt.allow'),
                },
              ],
              {
                iconName: 'notifications-outline',
                tone: 'primary',
              },
            );

            await SecureStore.setItemAsync(PUSH_PERMISSION_PROMPT_KEY, 'true');
            if (choice !== 1) {
              logPushDebug('skipped', {
                reason: 'permission_prompt_skipped',
                platform: pushPlatform,
              });
              return;
            }
          }

          const requested = await Notifications.requestPermissionsAsync();
          granted = requested.granted;
          logPushDebug('permission_request', {
            status: requested.status,
            granted: requested.granted,
            canAskAgain: requested.canAskAgain,
            platform: pushPlatform,
          });
        }

        if (!granted) {
          logPushDebug('denied', {
            reason: 'permission_denied',
            platform: pushPlatform,
          });
          return;
        }

        const projectId = resolveProjectId();
        logPushDebug('project_id', {
          projectId,
          expoProjectId: Constants.expoConfig?.extra?.eas?.projectId ?? null,
          easProjectId: Constants.easConfig?.projectId ?? null,
          platform: pushPlatform,
        });
        if (!projectId) {
          logPushDebug('skipped', {
            reason: 'project_id_missing',
            platform: pushPlatform,
          });
          return;
        }

        const expoPushToken = await getExpoPushTokenWithRetry(projectId, pushPlatform);
        logPushDebug('token_generated', {
          token: maskPushToken(expoPushToken),
          projectId,
          platform: pushPlatform,
        });
        if (!expoPushToken) {
          logPushDebug('skipped', {
            reason: 'token_empty',
            platform: pushPlatform,
          });
          return;
        }

        if (!active) {
          logPushDebug('skipped', {
            reason: 'effect_inactive',
            platform: pushPlatform,
          });
          return;
        }

        if (savedTokenRef.current === expoPushToken) {
          logPushDebug('skipped', {
            reason: 'token_already_saved',
            token: maskPushToken(expoPushToken),
            platform: pushPlatform,
          });
          return;
        }

        const registerResponse = await withAuth((accessToken) =>
          apiClient.registerPushToken(
            {
              userId: user.id,
              expoPushToken,
              device: pushPlatform === 'ios' ? 'Montly iOS' : 'Montly Android',
              platform: pushPlatform,
              deviceInfo: buildDeviceInfo(),
            },
            accessToken,
          ),
        );

        logPushDebug('register_response', {
          token: maskPushToken(expoPushToken),
          platform: pushPlatform,
          response: {
            ok: registerResponse.ok,
            reusedExisting: registerResponse.reusedExisting,
            tokensCount: registerResponse.tokensCount,
            tokenUpdatedAt: registerResponse.tokenUpdatedAt,
          },
        });

        savedTokenRef.current = expoPushToken;
        logPushDebug('saved', {
          pushTokenSaved: true,
          token: maskPushToken(expoPushToken),
          platform: pushPlatform,
        });
      } catch (error) {
        logPushDebug('error', {
          pushTokenSaved: false,
          reason: error instanceof Error ? error.message : 'unknown_error',
          hint: 'Expo Go or simulator may not return a push token.',
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [isGuest, status, user?.id, withAuth]);

  return null;
}
