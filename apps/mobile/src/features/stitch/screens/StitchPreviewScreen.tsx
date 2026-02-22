import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';

import {
  Card,
  CategoryRow,
  Chip,
  PrimaryButton,
  ScreenContainer,
  Section,
  StatCard,
  TransactionRow,
} from '@shared/ui';
import { I18N_KEYS } from '@shared/i18n/keys';
import { useI18n } from '@shared/i18n';
import type { ModuleStackParamList } from '@core/navigation/types';
import { colors, radius, spacing, typography } from '@shared/theme';
import { moduleLabels } from '@core/stitch/moduleLabels';
import { getScreenByKey } from '@core/stitch/screenInventory';

type Props = NativeStackScreenProps<ModuleStackParamList, 'StitchPreview'>;

const categoryRows = [
  { titleKey: 'stitch.preview.category.groceriesTitle', subtitleKey: 'stitch.preview.category.groceriesSubtitle', amount: '-$140.50' },
  { titleKey: 'stitch.preview.category.transportTitle', subtitleKey: 'stitch.preview.category.transportSubtitle', amount: '-$48.20' },
  { titleKey: 'stitch.preview.category.salaryTitle', subtitleKey: 'stitch.preview.category.salarySubtitle', amount: '+$2,900.00', tone: 'income' as const },
];

const transactions = [
  { titleKey: 'stitch.preview.tx.coffee', dateKey: 'stitch.preview.txDate.today0920', amount: '-$8.40', type: 'expense' as const },
  { titleKey: 'stitch.preview.tx.clientPayout', dateKey: 'stitch.preview.txDate.today0810', amount: '+$420.00', type: 'income' as const },
  { titleKey: 'stitch.preview.tx.gym', dateKey: 'stitch.preview.txDate.yesterday', amount: '-$39.00', type: 'expense' as const },
];

const settingsRows = [
  { titleKey: 'stitch.preview.settings.notificationsTitle', subtitleKey: 'stitch.preview.settings.notificationsSubtitle' },
  { titleKey: 'stitch.preview.settings.securityTitle', subtitleKey: 'stitch.preview.settings.securitySubtitle' },
  { titleKey: 'stitch.preview.settings.helpTitle', subtitleKey: 'stitch.preview.settings.helpSubtitle' },
];

export function StitchPreviewScreen({ route }: Props) {
  const { t } = useI18n();
  const screen = getScreenByKey(route.params.screenKey);

  if (!screen) {
    return (
      <ScreenContainer>
        <Card>
          <Text style={styles.errorTitle}>{t('stitch.preview.errors.notFoundTitle')}</Text>
          <Text style={styles.errorBody}>{t('stitch.preview.errors.notFoundBody')}</Text>
        </Card>
      </ScreenContainer>
    );
  }

  const dark = screen.isDark;
  const textColor = dark ? colors.dark.text : colors.text;
  const textMutedColor = dark ? colors.dark.textMuted : colors.textMuted;

  return (
    <ScreenContainer dark={dark}>
      <Card dark={dark} style={styles.headerCard}>
        <Text style={[styles.headerTitle, { color: textColor }]}>{screen.folderName}</Text>
        <Text style={[styles.headerSub, { color: textMutedColor }]}>{screen.folderPath}</Text>
        <View style={styles.chipsRow}>
          <Chip label={t(moduleLabels[screen.module])} tone="primary" dark={dark} />
          <Chip label={screen.hasCodeHtml ? t('stitch.preview.chips.codeHtmlUsed') : t('stitch.preview.chips.pngPlaceholder')} dark={dark} />
          {screen.isDark ? <Chip label={t('stitch.preview.chips.darkVariant')} dark={dark} /> : <Chip label={t('stitch.preview.chips.lightVariant')} dark={dark} />}
        </View>
      </Card>

      {screen.module === 'dashboard' ? <DashboardLayout dark={dark} t={t} /> : null}
      {screen.module === 'transactions' ? <TransactionsLayout dark={dark} t={t} /> : null}
      {screen.module === 'analytics' ? <AnalyticsLayout dark={dark} t={t} /> : null}
      {screen.module === 'split' ? <SplitLayout dark={dark} t={t} /> : null}
      {screen.module === 'scan' ? <ScanLayout dark={dark} t={t} /> : null}
      {screen.module === 'profile' ? <ProfileLayout dark={dark} t={t} /> : null}
      {screen.module === 'auth' ? <AuthLayout dark={dark} t={t} /> : null}
      {screen.module === 'other' ? <OtherLayout dark={dark} t={t} /> : null}
    </ScreenContainer>
  );
}

function DashboardLayout({
  dark,
  t,
}: {
  dark: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <>
      <Section title={t('stitch.preview.dashboard.accountSnapshot')} subtitle={t('stitch.preview.dashboard.overviewCards')} dark={dark}>
        <View style={styles.gridRow}>
          <StatCard label={t('stitch.preview.dashboard.currentBalance')} value="$14,230" detail={t('stitch.preview.dashboard.updated1mAgo')} tone="primary" dark={dark} />
          <StatCard label={t('stitch.preview.dashboard.monthlyIncome')} value="$5,400" detail="+8.2%" tone="income" dark={dark} />
        </View>
      </Section>

      <Section title={t('stitch.preview.dashboard.categoryPulse')} subtitle={t('stitch.preview.dashboard.topCategories')} dark={dark}>
        {categoryRows.map((item) => (
          <CategoryRow
            key={item.titleKey}
            title={t(item.titleKey)}
            subtitle={t(item.subtitleKey)}
            amount={item.amount}
            amountTone={item.tone ?? 'expense'}
            dark={dark}
          />
        ))}
      </Section>

      <Section title={t('stitch.preview.dashboard.recentActivity')} dark={dark}>
        {transactions.map((item) => (
          <TransactionRow
            key={`${item.titleKey}-${item.dateKey}`}
            title={t(item.titleKey)}
            date={t(item.dateKey)}
            amount={item.amount}
            type={item.type}
            dark={dark}
          />
        ))}
      </Section>
    </>
  );
}

function TransactionsLayout({
  dark,
  t,
}: {
  dark: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <>
      <Section title={t('stitch.preview.transactions.feed')} subtitle={t('stitch.preview.transactions.filtersSubtitle')} dark={dark}>
        <View style={styles.chipsRow}>
          <Chip label={t('transactions.filters.all')} tone="primary" dark={dark} />
          <Chip label={t('analytics.income')} tone="income" dark={dark} />
          <Chip label={t('analytics.expense')} tone="expense" dark={dark} />
        </View>
        {transactions.map((item) => (
          <TransactionRow
            key={`${item.titleKey}-${item.dateKey}`}
            title={t(item.titleKey)}
            date={t(item.dateKey)}
            amount={item.amount}
            type={item.type}
            dark={dark}
          />
        ))}
      </Section>
      <PrimaryButton label={t('stitch.preview.transactions.addNew')} />
    </>
  );
}

function AnalyticsLayout({
  dark,
  t,
}: {
  dark: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const chartBars = [72, 46, 90, 58, 34, 78];
  const bg = dark ? colors.dark.surface : colors.surface;
  const border = dark ? colors.dark.border : colors.border;

  return (
    <>
      <Section title={t('stitch.preview.analytics.spendingTrend')} subtitle={t('stitch.preview.analytics.weeklyBars')} dark={dark}>
        <Card dark={dark}>
          <View style={styles.chartWrap}>
            {chartBars.map((height, index) => (
              <View key={`bar-${index}`} style={[styles.barTrack, { backgroundColor: bg, borderColor: border }]}> 
                <View
                  style={[
                    styles.barFill,
                    {
                      height,
                      backgroundColor: index % 2 === 0 ? colors.chartA : colors.chartB,
                    },
                  ]}
                />
              </View>
            ))}
          </View>
        </Card>
      </Section>

      <Section title={t('stitch.preview.analytics.highlights')} dark={dark}>
        <View style={styles.gridRow}>
          <StatCard label={t('stitch.preview.analytics.food')} value="34%" tone="expense" dark={dark} />
          <StatCard label={t('stitch.preview.analytics.savings')} value="21%" tone="income" dark={dark} />
        </View>
      </Section>
    </>
  );
}

function SplitLayout({
  dark,
  t,
}: {
  dark: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <>
      <Section title={t('stitch.preview.split.groupOverview')} subtitle={t('stitch.preview.split.expenseSplitScenario')} dark={dark}>
        <Card dark={dark}>
          <Text style={[styles.groupTitle, { color: dark ? colors.dark.text : colors.text }]}>{t('stitch.preview.split.weekendTrip')}</Text>
          <View style={styles.chipsRow}>
            <Chip label={t('stitch.preview.split.memberAylin')} dark={dark} />
            <Chip label={t('stitch.preview.split.memberMert')} dark={dark} />
            <Chip label={t('stitch.preview.split.memberDeniz')} dark={dark} />
            <Chip label={t('stitch.preview.split.memberYou')} tone="primary" dark={dark} />
          </View>
        </Card>

        <CategoryRow
          title={t('stitch.preview.split.youOweMert')}
          subtitle={t('stitch.preview.split.accommodation')}
          amount="-$56.00"
          amountTone="expense"
          dark={dark}
        />
        <CategoryRow
          title={t('stitch.preview.split.aylinOwesYou')}
          subtitle={t('stitch.preview.split.carRental')}
          amount="+$32.00"
          amountTone="income"
          dark={dark}
        />
      </Section>
      <PrimaryButton label={t('stitch.preview.split.settleGroupExpense')} />
    </>
  );
}

function ScanLayout({
  dark,
  t,
}: {
  dark: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <>
      <Section title={t('stitch.preview.scan.receiptScan')} subtitle={t('stitch.preview.scan.cameraFramePlaceholder')} dark={dark}>
        <Card dark={dark} style={styles.scanCard}>
          <View style={[styles.scanFrame, { borderColor: dark ? '#35528A' : '#9DB8F8' }]}>
            <Text style={[styles.scanText, { color: dark ? colors.dark.textMuted : colors.textMuted }]}>
              {t('stitch.preview.scan.alignReceipt')}
            </Text>
          </View>
        </Card>
      </Section>
      <PrimaryButton label={t('stitch.preview.scan.captureReceipt')} />
    </>
  );
}

function ProfileLayout({
  dark,
  t,
}: {
  dark: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <>
      <Section title={t('stitch.preview.profile.summary')} dark={dark}>
        <Card dark={dark} style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{t('common.appInitials')}</Text>
          </View>
          <View style={styles.profileMeta}>
            <Text style={[styles.profileName, { color: dark ? colors.dark.text : colors.text }]}>{t('profile.defaultUserName')}</Text>
            <Text style={[styles.profileEmail, { color: dark ? colors.dark.textMuted : colors.textMuted }]}>
              {t('stitch.preview.profile.sampleEmail')}
            </Text>
          </View>
        </Card>
      </Section>

      <Section title={t(I18N_KEYS.common.navigation.stacks.settings.headerTitle)} dark={dark}>
        {settingsRows.map((item) => (
          <CategoryRow
            key={item.titleKey}
            title={t(item.titleKey)}
            subtitle={t(item.subtitleKey)}
            amount=">"
            amountTone="neutral"
            dark={dark}
          />
        ))}
      </Section>
    </>
  );
}

function AuthLayout({
  dark,
  t,
}: {
  dark: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const surface = dark ? colors.dark.surface : colors.surface;
  const border = dark ? colors.dark.border : colors.border;
  const textMuted = dark ? colors.dark.textMuted : colors.textMuted;

  return (
    <>
      <Section title={t('stitch.preview.auth.authenticationForm')} subtitle={t('stitch.preview.auth.onboardingLoginPlaceholder')} dark={dark}>
        <Card dark={dark} style={styles.authCard}>
          <InputPlaceholder label={t('auth.login.fields.emailLabel')} border={border} bg={surface} textMuted={textMuted} />
          <InputPlaceholder label={t('auth.login.fields.passwordLabel')} border={border} bg={surface} textMuted={textMuted} />
          <InputPlaceholder label={t('stitch.preview.auth.phoneOtp')} border={border} bg={surface} textMuted={textMuted} />
        </Card>
      </Section>
      <PrimaryButton label={t('common.continue')} />
    </>
  );
}

function OtherLayout({
  dark,
  t,
}: {
  dark: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <>
      <Section title={t('stitch.preview.other.contentUtility')} subtitle={t('stitch.preview.other.helpCenterDetailPages')} dark={dark}>
        <Card dark={dark}>
          <Text style={[styles.groupTitle, { color: dark ? colors.dark.text : colors.text }]}>
            {t('stitch.preview.other.helpCenterTitle')}
          </Text>
          <Text style={[styles.helperText, { color: dark ? colors.dark.textMuted : colors.textMuted }]}> 
            {t('stitch.preview.other.helpCenterDescription')}
          </Text>
          <View style={styles.chipsRow}>
            <Chip label={t('stitch.preview.other.faq')} dark={dark} />
            <Chip label={t('stitch.preview.other.debtGuide')} dark={dark} />
            <Chip label={t('stitch.preview.other.budgetTips')} dark={dark} />
          </View>
        </Card>
      </Section>
    </>
  );
}

function InputPlaceholder({
  label,
  border,
  bg,
  textMuted,
}: {
  label: string;
  border: string;
  bg: string;
  textMuted: string;
}) {
  return (
    <View style={[styles.inputPlaceholder, { borderColor: border, backgroundColor: bg }]}> 
      <Text style={[styles.inputLabel, { color: textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    gap: spacing.sm,
  },
  headerTitle: {
    ...typography.heading,
  },
  headerSub: {
    ...typography.caption,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chartWrap: {
    minHeight: 160,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  barTrack: {
    flex: 1,
    minWidth: 26,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.xxs,
    justifyContent: 'flex-end',
    height: 120,
  },
  barFill: {
    borderRadius: radius.sm,
    width: '100%',
  },
  groupTitle: {
    ...typography.subheading,
    marginBottom: spacing.xs,
  },
  helperText: {
    ...typography.body,
    marginBottom: spacing.sm,
  },
  scanCard: {
    alignItems: 'center',
  },
  scanFrame: {
    width: '100%',
    minHeight: 210,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanText: {
    ...typography.body,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.subheading,
    color: '#FFFFFF',
  },
  profileMeta: {
    flex: 1,
    gap: spacing.xxs,
  },
  profileName: {
    ...typography.subheading,
  },
  profileEmail: {
    ...typography.caption,
  },
  authCard: {
    gap: spacing.sm,
  },
  inputPlaceholder: {
    borderWidth: 1,
    borderRadius: radius.md,
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  inputLabel: {
    ...typography.body,
  },
  errorTitle: {
    ...typography.heading,
    color: colors.text,
  },
  errorBody: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
