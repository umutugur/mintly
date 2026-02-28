import { useI18n } from '@shared/i18n';

import { ProfileContentScreen } from '../components/ProfileContentScreen';

export function PrivacyScreen() {
  const { t } = useI18n();

  return (
    <ProfileContentScreen
      iconName="shield-outline"
      sections={[
        {
          title: t('profile.privacy.sections.collectionTitle'),
          bullets: [
            t('profile.privacy.sections.collectionBulletOne'),
            t('profile.privacy.sections.collectionBulletTwo'),
            t('profile.privacy.sections.collectionBulletThree'),
          ],
        },
        {
          title: t('profile.privacy.sections.usageTitle'),
          bullets: [
            t('profile.privacy.sections.usageBulletOne'),
            t('profile.privacy.sections.usageBulletTwo'),
            t('profile.privacy.sections.usageBulletThree'),
          ],
        },
        {
          title: t('profile.privacy.sections.retentionTitle'),
          bullets: [
            t('profile.privacy.sections.retentionBulletOne'),
            t('profile.privacy.sections.retentionBulletTwo'),
            t('profile.privacy.sections.retentionBulletThree'),
          ],
        },
      ]}
      subtitle={t('profile.privacy.subtitle')}
      title={t('profile.privacy.title')}
    />
  );
}
