import { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import { useAuth } from '@app/providers/AuthProvider';
import { AppIcon, Card, PrimaryButton, ScreenContainer, TextField } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import type { TransactionsStackParamList } from '@core/navigation/stacks/TransactionsStack';
import { spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

function parseMembers(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(',').map((part) => part.trim()).filter(Boolean);

      if (parts.length >= 2) {
        return { name: parts[0], email: parts[1] };
      }

      const email = parts[0] ?? '';
      const name = email.includes('@') ? email.split('@')[0] : email;
      return { name, email };
    })
    .filter((member) => member.name.length > 0 && member.email.length > 0);
}

export function CreateGroupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TransactionsStackParamList>>();
  const queryClient = useQueryClient();
  const { withAuth } = useAuth();
  const { theme, mode } = useTheme();
  const { t } = useI18n();

  const formSchema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('groups.create.validation.nameRequired')).max(120),
        members: z.string().trim().optional(),
      }),
    [t],
  );

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      members: '',
    },
  });

  const membersValue = form.watch('members') ?? '';
  const membersPreview = useMemo(() => parseMembers(membersValue), [membersValue]);

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      withAuth((token) =>
        apiClient.createGroup(
          {
            name: values.name,
            members: parseMembers(values.members ?? ''),
          },
          token,
        ),
      ),
    onSuccess: async (createdGroup) => {
      await queryClient.invalidateQueries({ queryKey: financeQueryKeys.groups.all() });
      navigation.replace('GroupDetail', { groupId: createdGroup.id });
    },
    onError: (error) => {
      Alert.alert(t('groups.create.errors.createFailedTitle'), apiErrorText(error));
    },
  });

  return (
    <ScreenContainer dark={mode === 'dark'}>
      <View style={styles.container}>
        <Card dark={mode === 'dark'} style={styles.card}>
          <View style={styles.headerRow}>
            <AppIcon name="people-outline" size="md" tone="primary" />
            <Text style={[styles.title, { color: theme.colors.text }]}>{t('groups.create.title')}</Text>
          </View>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{t('groups.create.subtitle')}</Text>

          <Controller
            control={form.control}
            name="name"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label={t('groups.create.fields.nameLabel')}
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder={t('groups.create.fields.namePlaceholder')}
                error={form.formState.errors.name?.message}
              />
            )}
          />

          <Controller
            control={form.control}
            name="members"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label={t('groups.create.fields.membersLabel')}
                value={value ?? ''}
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder={t('groups.create.fields.membersPlaceholder')}
                autoCapitalize="none"
                multiline
                numberOfLines={5}
                returnKeyType="default"
                blurOnSubmit={false}
                inputStyle={styles.membersInput}
                inputWrapStyle={styles.membersInputWrap}
              />
            )}
          />

          {membersPreview.length > 0 ? (
            <Text style={[styles.previewText, { color: theme.colors.textMuted }]}> 
              {t('groups.create.previewCount', { count: membersPreview.length })}
            </Text>
          ) : null}

          <PrimaryButton
            iconName={createMutation.isPending ? 'hourglass-outline' : 'add-circle-outline'}
            disabled={createMutation.isPending}
            label={createMutation.isPending ? t('groups.create.actions.creating') : t('groups.create.actions.create')}
            onPress={form.handleSubmit((values) => createMutation.mutate(values))}
          />
        </Card>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  card: {
    gap: spacing.sm,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  title: {
    ...typography.heading,
    fontSize: 24,
  },
  subtitle: {
    ...typography.body,
  },
  membersInputWrap: {
    alignItems: 'stretch',
    height: 120,
  },
  membersInput: {
    minHeight: 100,
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
    textAlignVertical: 'top',
  },
  previewText: {
    ...typography.caption,
  },
});
