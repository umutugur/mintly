import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppIcon, Card, PrimaryButton, ScreenContainer, Section } from '@shared/ui';
import type { AppIconName } from '@shared/ui/AppIcon';
import { radius, spacing, typography, useTheme } from '@shared/theme';

interface ProfileContentSection {
  title: string;
  subtitle?: string;
  paragraphs?: string[];
  bullets?: string[];
}

interface ProfileContentCta {
  label: string;
  iconName?: AppIconName;
  onPress: () => void;
}

interface ProfileContentScreenProps {
  iconName: AppIconName;
  title: string;
  subtitle: string;
  badge?: string;
  sections: ProfileContentSection[];
  cta?: ProfileContentCta;
  footer?: ReactNode;
}

export function ProfileContentScreen({
  iconName,
  title,
  subtitle,
  badge,
  sections,
  cta,
  footer,
}: ProfileContentScreenProps) {
  const { theme, mode } = useTheme();
  const dark = mode === 'dark';
  const panelBg = dark ? '#15192A' : '#FFFFFF';
  const panelBorder = dark ? '#2A2D42' : '#E4EAF5';

  return (
    <ScreenContainer dark={dark}>
      <View style={styles.container}>
        <Card
          dark={dark}
          style={[
            styles.heroCard,
            {
              backgroundColor: dark ? '#11192E' : '#F4F8FF',
              borderColor: dark ? '#2A3658' : '#DCE8FF',
            },
          ]}
        >
          <View style={[styles.heroIconWrap, { backgroundColor: dark ? '#1C2640' : '#FFFFFF' }]}>
            <AppIcon name={iconName} size="xl" tone="primary" />
          </View>
          {badge ? (
            <View style={[styles.badge, { backgroundColor: dark ? 'rgba(66,17,212,0.2)' : '#ECF2FF' }]}>
              <Text style={[styles.badgeText, { color: theme.colors.primary }]}>{badge}</Text>
            </View>
          ) : null}
          <Text style={[styles.heroTitle, { color: theme.colors.text }]}>{title}</Text>
          <Text style={[styles.heroSubtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
        </Card>

        {sections.map((section, sectionIndex) => (
          <Section
            key={`section-${sectionIndex}`}
            dark={dark}
            title={section.title}
            subtitle={section.subtitle}
          >
            <Card
              dark={dark}
              style={[
                styles.sectionCard,
                {
                  backgroundColor: panelBg,
                  borderColor: panelBorder,
                },
              ]}
            >
              {section.paragraphs?.map((paragraph, paragraphIndex) => (
                <Text key={`paragraph-${sectionIndex}-${paragraphIndex}`} style={[styles.paragraph, { color: theme.colors.textMuted }]}>
                  {paragraph}
                </Text>
              ))}

              {section.bullets?.map((bullet, bulletIndex) => (
                <View key={`bullet-${sectionIndex}-${bulletIndex}`} style={styles.bulletRow}>
                  <View style={[styles.bulletDot, { backgroundColor: theme.colors.primary }]} />
                  <Text style={[styles.bulletText, { color: theme.colors.text }]}>
                    {bullet}
                  </Text>
                </View>
              ))}
            </Card>
          </Section>
        ))}

        {cta ? (
          <PrimaryButton
            iconName={cta.iconName}
            label={cta.label}
            onPress={cta.onPress}
          />
        ) : null}

        {footer}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  heroCard: {
    alignItems: 'center',
    borderRadius: radius.xl,
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  heroIconWrap: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  badge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: '700',
  },
  heroTitle: {
    ...typography.heading,
    fontSize: 24,
    textAlign: 'center',
  },
  heroSubtitle: {
    ...typography.body,
    lineHeight: 22,
    textAlign: 'center',
  },
  sectionCard: {
    gap: spacing.sm,
  },
  paragraph: {
    ...typography.body,
    lineHeight: 22,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  bulletDot: {
    borderRadius: radius.full,
    height: 8,
    marginTop: 6,
    width: 8,
  },
  bulletText: {
    ...typography.body,
    flex: 1,
    lineHeight: 22,
  },
});
