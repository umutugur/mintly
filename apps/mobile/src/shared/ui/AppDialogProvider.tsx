import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import i18n from 'i18next';

import { radius, spacing, typography, useTheme } from '@shared/theme';
import { AppIcon, type AppIconName } from './AppIcon';

export type AppDialogButtonStyle = 'default' | 'cancel' | 'destructive';

export interface AppDialogButton {
  text?: string;
  style?: AppDialogButtonStyle;
  onPress?: () => void;
}

interface ShowAlertOptions {
  iconName?: AppIconName;
  tone?: 'default' | 'primary' | 'success' | 'danger';
}

interface NormalizedDialogButton {
  key: string;
  text: string;
  style: AppDialogButtonStyle;
  onPress?: () => void;
}

interface DialogRequest {
  title: string;
  message?: string;
  iconName: AppIconName;
  tone: 'default' | 'primary' | 'success' | 'danger';
  buttons: NormalizedDialogButton[];
  resolve: (index: number) => void;
}

let presentDialog: ((request: DialogRequest) => void) | null = null;

function defaultButtonLabel(): string {
  const translated = i18n.t('common.buttons.ok');
  return typeof translated === 'string' && translated.trim().length > 0 ? translated : 'OK';
}

function normalizeButtons(buttons?: AppDialogButton[]): NormalizedDialogButton[] {
  if (!buttons || buttons.length === 0) {
    return [
      {
        key: 'default-0',
        style: 'default',
        text: defaultButtonLabel(),
      },
    ];
  }

  if (buttons.length === 1) {
    const [button] = buttons;
    return [
      {
        key: 'dialog-0-single',
        style: button.style ?? 'default',
        text: button.text?.trim() || defaultButtonLabel(),
        onPress: button.onPress,
      },
    ];
  }

  if (buttons.length === 2) {
    return buttons.map((button, index) => ({
      key: `dialog-${index}-${button.text ?? button.style ?? 'default'}`,
      style: button.style ?? 'default',
      text: button.text?.trim() || defaultButtonLabel(),
      onPress: button.onPress,
    }));
  }

  const cancel = buttons.find((button) => button.style === 'cancel');
  const destructive = [...buttons].reverse().find((button) => button.style === 'destructive');
  const primary =
    buttons[buttons.length - 1]
    ?? destructive
    ?? cancel
    ?? buttons[0];

  const picked = cancel && cancel !== primary
    ? [cancel, primary]
    : [buttons[0], primary];

  return picked
    .filter((button, index, array) => array.findIndex((item) => item === button) === index)
    .slice(0, 2)
    .map((button, index) => ({
    key: `dialog-${index}-${button.text ?? button.style ?? 'default'}`,
    style: button.style ?? 'default',
    text: button.text?.trim() || defaultButtonLabel(),
    onPress: button.onPress,
    }));
}

function resolveTone(buttons: NormalizedDialogButton[], override?: ShowAlertOptions['tone']) {
  if (override) {
    return override;
  }

  if (buttons.some((button) => button.style === 'destructive')) {
    return 'danger' as const;
  }

  return 'primary' as const;
}

function resolveIconName(
  buttons: NormalizedDialogButton[],
  override?: ShowAlertOptions['iconName'],
): AppIconName {
  if (override) {
    return override;
  }

  if (buttons.some((button) => button.style === 'destructive')) {
    return 'warning-outline';
  }

  return 'information-circle-outline';
}

export function showAlert(
  title: string,
  message?: string,
  buttons?: AppDialogButton[],
  options?: ShowAlertOptions,
): Promise<number> {
  const normalizedButtons = normalizeButtons(buttons);

  return new Promise((resolve) => {
    if (!presentDialog) {
      if (__DEV__) {
        console.info('[dialog][missing-provider]', { title });
      }
      normalizedButtons[normalizedButtons.length - 1]?.onPress?.();
      resolve(normalizedButtons.length - 1);
      return;
    }

    presentDialog({
      title,
      message,
      buttons: normalizedButtons,
      iconName: resolveIconName(normalizedButtons, options?.iconName),
      tone: resolveTone(normalizedButtons, options?.tone),
      resolve,
    });
  });
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const { theme, mode } = useTheme();
  const [dialog, setDialog] = useState<DialogRequest | null>(null);

  useEffect(() => {
    presentDialog = setDialog;
    return () => {
      presentDialog = null;
    };
  }, []);

  const palette = useMemo(() => {
    const isDark = mode === 'dark';
    return {
      background: isDark ? 'rgba(10, 14, 24, 0.82)' : 'rgba(17, 24, 39, 0.38)',
      card: isDark ? '#141A2A' : '#FFFFFF',
      border: isDark ? '#2A3247' : '#E4EAF5',
      secondaryButton: isDark ? '#121624' : '#F5F8FF',
      secondaryBorder: isDark ? '#2A3247' : '#D9E3F3',
    };
  }, [mode]);

  const toneColors = useMemo(() => {
    const tone = dialog?.tone ?? 'primary';

    if (tone === 'danger') {
      return {
        background: mode === 'dark' ? 'rgba(240, 68, 56, 0.14)' : '#FFF1F1',
        icon: theme.colors.expense,
      };
    }

    if (tone === 'success') {
      return {
        background: mode === 'dark' ? 'rgba(23, 183, 106, 0.16)' : '#EEFBF3',
        icon: theme.colors.income,
      };
    }

    return {
      background: mode === 'dark' ? 'rgba(66,17,212,0.18)' : '#ECF2FF',
      icon: theme.colors.primary,
    };
  }, [dialog?.tone, mode, theme.colors.expense, theme.colors.income, theme.colors.primary]);

  const closeDialog = (buttonIndex: number) => {
    if (!dialog) {
      return;
    }

    const selectedButton = dialog.buttons[buttonIndex];
    dialog.resolve(buttonIndex);
    setDialog(null);
    selectedButton?.onPress?.();
  };

  return (
    <>
      {children}
      <Modal
        animationType="fade"
        onRequestClose={() => {
          if (!dialog) {
            return;
          }

          const cancelIndex = dialog.buttons.findIndex((button) => button.style === 'cancel');
          closeDialog(cancelIndex >= 0 ? cancelIndex : dialog.buttons.length - 1);
        }}
        transparent
        visible={Boolean(dialog)}
      >
        <View style={[styles.backdrop, { backgroundColor: palette.background }]}>
          {dialog ? (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: palette.card,
                  borderColor: palette.border,
                },
              ]}
            >
              <View style={[styles.iconWrap, { backgroundColor: toneColors.background }]}>
                <AppIcon color={toneColors.icon} name={dialog.iconName} size="lg" />
              </View>

              <View style={styles.copyWrap}>
                <Text style={[styles.title, { color: theme.colors.text }]}>{dialog.title}</Text>
                {dialog.message ? (
                  <Text style={[styles.message, { color: theme.colors.textMuted }]}>{dialog.message}</Text>
                ) : null}
              </View>

              <View style={[styles.actions, dialog.buttons.length === 1 ? styles.actionsSingle : null]}>
                {dialog.buttons.map((button, index) => {
                  const destructive = button.style === 'destructive';
                  const cancel = button.style === 'cancel';

                  return (
                    <Pressable
                      key={button.key}
                      accessibilityRole="button"
                      onPress={() => closeDialog(index)}
                      style={({ pressed }) => [
                        styles.button,
                        cancel
                          ? {
                              backgroundColor: palette.secondaryButton,
                              borderColor: palette.secondaryBorder,
                            }
                          : {
                              backgroundColor: destructive
                                ? theme.colors.expense
                                : theme.colors.buttonPrimaryBackground,
                              borderColor: destructive
                                ? theme.colors.expense
                                : theme.colors.buttonPrimaryBackground,
                            },
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.buttonText,
                          {
                            color: cancel
                              ? theme.colors.text
                              : theme.colors.buttonPrimaryText,
                          },
                        ]}
                      >
                        {button.text}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  iconWrap: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: radius.full,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  copyWrap: {
    gap: spacing.xs,
  },
  title: {
    ...typography.subheading,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionsSingle: {
    justifyContent: 'center',
  },
  button: {
    flex: 1,
    minHeight: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonText: {
    ...typography.subheading,
    fontWeight: '700',
    textAlign: 'center',
  },
});
