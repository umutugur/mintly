import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { ProfileStackParamList } from '@core/navigation/stacks/ProfileStack';
import { useI18n } from '@shared/i18n';

import { ProfileContentScreen } from '../components/ProfileContentScreen';

export function HelpSupportScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { t } = useI18n();

  return (
    <ProfileContentScreen
      cta={{
        label: t('profile.helpSupport.cta'),
        iconName: 'mail-outline',
        onPress: () => navigation.navigate('Contact'),
      }}
      iconName="help-buoy-outline"
      sections={[
        {
          title: t('profile.helpSupport.sections.faqTitle'),
          bullets: [
            t('profile.helpSupport.sections.faqBulletOne'),
            t('profile.helpSupport.sections.faqBulletTwo'),
            t('profile.helpSupport.sections.faqBulletThree'),
          ],
        },
        {
          title: t('profile.helpSupport.sections.contactTitle'),
          paragraphs: [
            t('profile.helpSupport.sections.contactBody'),
          ],
          bullets: [
            t('profile.helpSupport.sections.contactBulletOne'),
            t('profile.helpSupport.sections.contactBulletTwo'),
          ],
        },
      ]}
      subtitle={t('profile.helpSupport.subtitle')}
      title={t('profile.helpSupport.title')}
    />
  );
}
