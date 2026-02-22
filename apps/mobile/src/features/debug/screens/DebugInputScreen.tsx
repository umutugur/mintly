import { useEffect, useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ScreenContainer } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import type { AuthStackParamList } from '@core/navigation/types';
import { radius, spacing, typography, useTheme } from '@shared/theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'DebugInput'>;

export function DebugInputScreen({ navigation }: Props) {
  const { theme, mode } = useTheme();
  const { t } = useI18n();
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');

  useEffect(() => {
    const subscriptions = [
      Keyboard.addListener('keyboardWillShow', () => console.log('[debug] keyboardWillShow')),
      Keyboard.addListener('keyboardDidShow', () => console.log('[debug] keyboardDidShow')),
      Keyboard.addListener('keyboardWillHide', () => console.log('[debug] keyboardWillHide')),
      Keyboard.addListener('keyboardDidHide', () => console.log('[debug] keyboardDidHide')),
    ];

    return () => {
      for (const subscription of subscriptions) {
        subscription.remove();
      }
    };
  }, []);

  const dark = mode === 'dark';

  return (
    <ScreenContainer dark={dark}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{t('debug.input.title')}</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{t('debug.input.subtitle')}</Text>

        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onBlur={() => console.log('[debug] blur first')}
          onChangeText={setFirst}
          onFocus={() => console.log('[debug] focus first')}
          onTouchStart={() => console.log('[debug] touchstart first')}
          placeholder={t('debug.input.firstPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={[
            styles.input,
            {
              backgroundColor: theme.colors.inputBackground,
              borderColor: theme.colors.inputBorder,
              color: theme.colors.inputText,
            },
          ]}
          value={first}
        />

        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onBlur={() => console.log('[debug] blur second')}
          onChangeText={setSecond}
          onFocus={() => console.log('[debug] focus second')}
          onTouchStart={() => console.log('[debug] touchstart second')}
          placeholder={t('debug.input.secondPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={[
            styles.input,
            {
              backgroundColor: theme.colors.inputBackground,
              borderColor: theme.colors.inputBorder,
              color: theme.colors.inputText,
            },
          ]}
          value={second}
        />

        <Pressable onPress={() => navigation.replace('Login')} style={[styles.button, { backgroundColor: theme.colors.primary }]}>
          <Text style={[styles.buttonText, { color: theme.colors.buttonPrimaryText }]}>{t('debug.input.goLogin')}</Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.replace('Register')}
          style={[
            styles.button,
            {
              backgroundColor: dark ? theme.colors.surface : theme.colors.primaryMuted,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.buttonText, { color: theme.colors.text }]}>{t('debug.input.goRegister')}</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  title: {
    ...typography.heading,
  },
  subtitle: {
    ...typography.body,
  },
  input: {
    ...typography.body,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 48,
    paddingHorizontal: spacing.sm,
  },
  button: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginTop: spacing.xxs,
  },
  buttonText: {
    ...typography.subheading,
    fontSize: 15,
  },
});
