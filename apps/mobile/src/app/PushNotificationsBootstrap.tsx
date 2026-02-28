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
  const fromEasConfig = Constants.easConfig?.projectId;
  if (typeof fromEasConfig === 'string' && fromEasConfig.trim().length > 0) {
    return fromEasConfig.trim();
  }

  const fromExpoConfig = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof fromExpoConfig === 'string' && fromExpoConfig.trim().length > 0) {
    return fromExpoConfig.trim();
  }

  return null;
}

export function PushNotificationsBootstrap() {
  const { status, isGuest, withAuth } = useAuth();
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
        const currentPermissions = await Notifications.getPermissionsAsync();
        let granted = currentPermissions.granted;

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
              if (__DEV__) {
                console.info('[notifications][push]', {
                  pushTokenSaved: false,
                  reason: 'permission_prompt_skipped',
                });
              }
              return;
            }
          }

          const requested = await Notifications.requestPermissionsAsync();
          granted = requested.granted;
        }

        if (!granted) {
          if (__DEV__) {
            console.info('[notifications][push]', {
              pushTokenSaved: false,
              reason: 'permission_denied',
            });
          }
          return;
        }

        const projectId = resolveProjectId();
        if (!projectId) {
          if (__DEV__) {
            console.info('[notifications][push]', {
              pushTokenSaved: false,
              reason: 'project_id_missing',
            });
          }
          return;
        }

        const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
        const expoPushToken = tokenResponse.data?.trim();
        if (!expoPushToken) {
          if (__DEV__) {
            console.info('[notifications][push]', {
              pushTokenSaved: false,
              reason: 'token_empty',
            });
          }
          return;
        }

        if (!active || savedTokenRef.current === expoPushToken) {
          return;
        }

        await withAuth((accessToken) =>
          apiClient.saveMeExpoPushToken(
            {
              expoPushToken,
              device: Platform.OS === 'ios' ? 'Montly iOS' : 'Montly Android',
              platform: Platform.OS === 'ios' ? 'ios' : 'android',
            },
            accessToken,
          ),
        );

        savedTokenRef.current = expoPushToken;

        if (__DEV__) {
          console.info('[notifications][push]', {
            pushTokenSaved: true,
            platform: Platform.OS,
          });
        }
      } catch (error) {
        if (__DEV__) {
          console.info('[notifications][push]', {
            pushTokenSaved: false,
            reason: error instanceof Error ? error.message : 'unknown_error',
            hint: 'Expo Go or simulator may not return a push token.',
          });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [isGuest, status, withAuth]);

  return null;
}
