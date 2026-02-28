import { Linking } from 'react-native';

import { useI18n } from '@shared/i18n';
import { showAlert } from '@shared/ui';

import { ProfileContentScreen } from '../components/ProfileContentScreen';

const SUPPORT_EMAIL = 'support@mintly.app';
const SUPPORT_WEB = 'https://mintly.app';
const SUPPORT_SOCIAL = '@mintlyapp';

export function ContactScreen() {
  const { t } = useI18n();

  const handleFeedback = async () => {
    const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Mintly Geri Bildirim')}`;

    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
        return;
      }
    } catch {
      // Fall through to in-app fallback.
    }

    void showAlert(
      t('profile.contact.fallbackTitle'),
      t('profile.contact.fallbackBody', { email: SUPPORT_EMAIL }),
      undefined,
      {
        iconName: 'mail-open-outline',
        tone: 'primary',
      },
    );
  };

  return (
    <ProfileContentScreen
      cta={{
        label: t('profile.contact.cta'),
        iconName: 'send-outline',
        onPress: () => {
          void handleFeedback();
        },
      }}
      iconName="mail-outline"
      sections={[
        {
          title: t('profile.contact.sections.channelsTitle'),
          bullets: [
            t('profile.contact.sections.emailBullet', { email: SUPPORT_EMAIL }),
            t('profile.contact.sections.webBullet', { web: SUPPORT_WEB }),
            t('profile.contact.sections.socialBullet', { social: SUPPORT_SOCIAL }),
          ],
        },
        {
          title: t('profile.contact.sections.feedbackTitle'),
          paragraphs: [
            t('profile.contact.sections.feedbackBody'),
          ],
          bullets: [
            t('profile.contact.sections.feedbackBulletOne'),
            t('profile.contact.sections.feedbackBulletTwo'),
          ],
        },
      ]}
      subtitle={t('profile.contact.subtitle')}
      title={t('profile.contact.title')}
    />
  );
}
