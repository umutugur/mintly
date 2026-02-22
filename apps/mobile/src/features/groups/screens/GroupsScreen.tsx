import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import { useAuth } from '@app/providers/AuthProvider';
import { AppIcon, Card, Chip, PrimaryButton, ScreenContainer } from '@shared/ui';
import { useI18n } from '@shared/i18n';
import type { TransactionsStackParamList } from '@core/navigation/stacks/TransactionsStack';
import { spacing, typography, useTheme } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

function GroupsLoadingSkeleton({ dark }: { dark: boolean }) {
  const block = dark ? '#171C2B' : '#E8EDF7';

  return (
    <View style={styles.skeletonWrap}>
      <View style={[styles.skeletonTitle, { backgroundColor: block }]} />
      <View style={[styles.skeletonSubtitle, { backgroundColor: block }]} />
      <View style={[styles.skeletonButton, { backgroundColor: block }]} />
      <View style={[styles.skeletonCard, { backgroundColor: block }]} />
      <View style={[styles.skeletonCard, { backgroundColor: block }]} />
      <View style={[styles.skeletonCard, { backgroundColor: block }]} />
    </View>
  );
}

export function GroupsScreen() {
  const { withAuth } = useAuth();
  const { theme, mode } = useTheme();
  const { t } = useI18n();
  const navigation = useNavigation<NativeStackNavigationProp<TransactionsStackParamList>>();

  const groupsQuery = useQuery({
    queryKey: financeQueryKeys.groups.list(),
    queryFn: () => withAuth((token) => apiClient.getGroups(token)),
  });

  const groups = groupsQuery.data?.groups ?? [];

  if (groupsQuery.isLoading) {
    return (
      <ScreenContainer dark={mode === 'dark'} scrollable={false} contentStyle={styles.containerContent}>
        <GroupsLoadingSkeleton dark={mode === 'dark'} />
        <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>{t('groups.list.loading')}</Text>
      </ScreenContainer>
    );
  }

  if (groupsQuery.isError) {
    return (
      <ScreenContainer dark={mode === 'dark'}>
        <Card dark={mode === 'dark'} style={styles.feedbackCard}>
          <AppIcon name="alert-circle-outline" size="lg" tone="expense" />
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>{t('groups.list.errorTitle')}</Text>
          <Text style={[styles.errorText, { color: theme.colors.expense }]}>{apiErrorText(groupsQuery.error)}</Text>
          <PrimaryButton iconName="refresh" label={t('common.retry')} onPress={() => void groupsQuery.refetch()} />
        </Card>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer dark={mode === 'dark'} scrollable={false} contentStyle={styles.containerContent}>
      <FlatList
        contentContainerStyle={styles.content}
        data={groups}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <AppIcon name="people-outline" size="md" tone="primary" />
              <Text numberOfLines={1} style={[styles.title, { color: theme.colors.text }]}>
                {t('groups.list.title')}
              </Text>
            </View>
            <Text numberOfLines={2} style={[styles.subtitle, { color: theme.colors.textMuted }]}>
              {t('groups.list.subtitle')}
            </Text>
            <PrimaryButton
              iconName="add-circle-outline"
              label={t('groups.list.createButton')}
              onPress={() => navigation.navigate('CreateGroup')}
            />
          </View>
        }
        ListEmptyComponent={
          <Card dark={mode === 'dark'} style={styles.feedbackCard}>
            <AppIcon name="people-circle-outline" size="lg" tone="muted" />
            <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>{t('groups.list.empty')}</Text>
            <PrimaryButton
              iconName="add-circle-outline"
              label={t('groups.list.createButton')}
              onPress={() => navigation.navigate('CreateGroup')}
            />
          </Card>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('GroupDetail', { groupId: item.id })}
          >
            <Card dark={mode === 'dark'} style={styles.groupCard}>
              <View style={styles.groupTitleRow}>
                <View style={styles.groupNameRow}>
                  <AppIcon name="people" size="sm" tone="primary" />
                  <Text numberOfLines={1} style={[styles.groupName, { color: theme.colors.text }]}>
                    {item.name}
                  </Text>
                </View>
                <AppIcon name="chevron-forward" size="sm" tone="muted" />
              </View>
              <View style={styles.memberRow}>
                {item.members.slice(0, 4).map((member) => (
                  <Chip key={member.id} iconName="person-outline" label={member.name} dark={mode === 'dark'} />
                ))}
              </View>
              <Text numberOfLines={1} style={[styles.memberCount, { color: theme.colors.textMuted }]}>
                {t('groups.list.memberCount', { count: item.members.length })}
              </Text>
            </Card>
          </Pressable>
        )}
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  containerContent: {
    flex: 1,
    gap: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minWidth: 0,
  },
  title: {
    ...typography.heading,
    fontSize: 24,
    flexShrink: 1,
  },
  subtitle: {
    ...typography.body,
    lineHeight: 20,
  },
  groupCard: {
    gap: spacing.xs,
  },
  groupNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minWidth: 0,
    flex: 1,
  },
  groupTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  groupName: {
    ...typography.subheading,
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    minWidth: 0,
  },
  memberRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  memberCount: {
    ...typography.caption,
    fontSize: 12,
  },
  separator: {
    height: spacing.sm,
  },
  feedbackCard: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  helperText: {
    ...typography.body,
    textAlign: 'center',
  },
  loadingText: {
    ...typography.body,
    textAlign: 'center',
  },
  errorTitle: {
    ...typography.subheading,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
  },
  skeletonWrap: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  skeletonTitle: {
    borderRadius: 10,
    height: 34,
    width: '52%',
  },
  skeletonSubtitle: {
    borderRadius: 10,
    height: 20,
    width: '78%',
  },
  skeletonButton: {
    borderRadius: 12,
    height: 48,
    width: '100%',
  },
  skeletonCard: {
    borderRadius: 14,
    height: 112,
    width: '100%',
  },
});
