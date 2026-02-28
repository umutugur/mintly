import { useI18n } from '@shared/i18n';

import { ProfileContentScreen } from '../components/ProfileContentScreen';

export function TermsScreen() {
  const { t } = useI18n();

  return (
    <ProfileContentScreen
      iconName="document-text-outline"
      sections={[
        {
          title: t('profile.terms.sections.scopeTitle'),
          bullets: [
            t('profile.terms.sections.scopeBulletOne'),
            t('profile.terms.sections.scopeBulletTwo'),
          ],
        },
        {
          title: t('profile.terms.sections.rulesTitle'),
          bullets: [
            t('profile.terms.sections.rulesBulletOne'),
            t('profile.terms.sections.rulesBulletTwo'),
            t('profile.terms.sections.rulesBulletThree'),
          ],
        },
        {
          title: t('profile.terms.sections.liabilityTitle'),
          bullets: [
            t('profile.terms.sections.liabilityBulletOne'),
            t('profile.terms.sections.liabilityBulletTwo'),
            t('profile.terms.sections.liabilityBulletThree'),
          ],
        },
      ]}
      subtitle={t('profile.terms.subtitle')}
      title={t('profile.terms.title')}
    />
  );
}
