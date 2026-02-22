import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { createStackOptions } from './createStackOptions';
import { I18N_KEYS } from '@shared/i18n/keys';
import { useI18n } from '@shared/i18n';
import { useT } from '@shared/i18n/t';
import { moduleLabels } from '@core/stitch/moduleLabels';
import type { StitchModule } from '@core/stitch/screenInventory';
import { getScreenByKey } from '@core/stitch/screenInventory';
import { ModuleHubScreen } from '@features/stitch/screens/ModuleHubScreen';
import { StitchPreviewScreen } from '@features/stitch/screens/StitchPreviewScreen';
import { useTheme } from '@shared/theme';

import type { ModuleStackParamList } from './types';

const Stack = createNativeStackNavigator<ModuleStackParamList>();

interface ModuleStackNavigatorProps {
  title: string;
  subtitle: string;
  modules: StitchModule[];
}

export function ModuleStackNavigator({ title, subtitle, modules }: ModuleStackNavigatorProps) {
  const { theme } = useTheme();
  const { locale } = useI18n();
  const t = useT();

  return (
    <Stack.Navigator key={`module-stack-${locale}`} screenOptions={createStackOptions(theme)}>
      <Stack.Screen name="Hub" options={{ title }}>
        {(props) => <ModuleHubScreen {...props} title={title} subtitle={subtitle} modules={modules} />}
      </Stack.Screen>
      <Stack.Screen
        name="StitchPreview"
        component={StitchPreviewScreen}
        options={({ route }) => {
          const screen = getScreenByKey(route.params.screenKey);
          const previewSuffix = t(I18N_KEYS.common.navigation.preview.screen.header.suffix);
          return {
            title: screen
              ? `${t(moduleLabels[screen.module])} ${previewSuffix}`
              : t(I18N_KEYS.common.navigation.preview.screen.header.title),
          };
        }}
      />
    </Stack.Navigator>
  );
}
