import Constants from 'expo-constants';

import { useI18n } from '@shared/i18n';

import { ProfileContentScreen } from '../components/ProfileContentScreen';

function resolveVersionLabel(): string {
  const appVersion = Constants.expoConfig?.version?.trim() || Constants.nativeAppVersion?.trim() || '1.0.0';
  const buildNumber = Constants.nativeBuildVersion?.trim() || '1';
  return `${appVersion} (${buildNumber})`;
}

export function AboutScreen() {
  const { t } = useI18n();

  return (
    <ProfileContentScreen
      badge={resolveVersionLabel()}
      iconName="sparkles-outline"
      sections={[
        {
          title: t('profile.about.sections.productTitle'),
          paragraphs: [
            t('profile.about.sections.productBody'),
          ],
          bullets: [
            t('profile.about.sections.versionBullet', { version: resolveVersionLabel() }),
            t('profile.about.sections.platformBullet'),
          ],
        },
        {
          title: t('profile.about.sections.notesTitle'),
          paragraphs: [
            t('profile.about.sections.notesBody'),
          ],
          bullets: [
            t('profile.about.sections.notesBulletOne'),
            t('profile.about.sections.notesBulletTwo'),
          ],
        },
      ]}
      subtitle={t('profile.about.subtitle')}
      title={t('profile.about.title')}
    />
  );
}
