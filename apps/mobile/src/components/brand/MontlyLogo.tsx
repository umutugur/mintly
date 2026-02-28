import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, {
  Defs,
  G,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { useI18n } from '@shared/i18n';
import { useTheme } from '@shared/theme';

export type MontlyLogoVariant = 'mark' | 'wordmark' | 'banner';

interface MontlyLogoProps {
  variant?: MontlyLogoVariant;
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_SIZE: Record<MontlyLogoVariant, { width: number; height: number }> = {
  mark: { width: 86, height: 52 },
  wordmark: { width: 224, height: 70 },
  banner: { width: 336, height: 76 },
};

function MontlyMarkShape({ strokeWidth = 68 }: { strokeWidth?: number }) {
  return (
    <>
      <Path
        d="M60 270V170A90 90 0 0 1 240 170V270V170A90 90 0 0 1 420 170V70"
        stroke="url(#montlyGrad)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M510 12Q510 52 550 52Q510 52 510 92Q510 52 470 52Q510 52 510 12Z" fill="url(#montlyGrad)" />
    </>
  );
}

export function MontlyLogo({
  variant = 'wordmark',
  width,
  height,
  style,
}: MontlyLogoProps) {
  const { theme } = useTheme();
  const { t } = useI18n();

  const brandName = t('common.appName');
  const textColor = theme.mode === 'dark' ? '#FFFFFF' : '#0F172A';
  const resolvedWidth = width ?? DEFAULT_SIZE[variant].width;
  const resolvedHeight = height ?? DEFAULT_SIZE[variant].height;

  if (variant === 'mark') {
    return (
      <View style={[styles.wrap, style]}>
        <Svg width={resolvedWidth} height={resolvedHeight} viewBox="0 0 560 320">
          <Defs>
            <LinearGradient id="montlyGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#3B6EF5" />
              <Stop offset="100%" stopColor="#2ED47A" />
            </LinearGradient>
          </Defs>
          <MontlyMarkShape />
        </Svg>
      </View>
    );
  }

  if (variant === 'banner') {
    return (
      <View style={[styles.wrap, style]}>
        <Svg width={resolvedWidth} height={resolvedHeight} viewBox="0 0 1400 320">
          <Defs>
            <LinearGradient id="montlyGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#3B6EF5" />
              <Stop offset="100%" stopColor="#2ED47A" />
            </LinearGradient>
          </Defs>
          <G transform="translate(28 16) scale(0.9)">
            <MontlyMarkShape />
          </G>
          <SvgText
            x="580"
            y="212"
            fontSize="172"
            fontWeight="800"
            letterSpacing={-4}
            fill={textColor}
            fontFamily="System"
          >
            {brandName.toLowerCase()}
          </SvgText>
        </Svg>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <Svg width={resolvedWidth} height={resolvedHeight} viewBox="0 0 1040 320">
        <Defs>
          <LinearGradient id="montlyGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#3B6EF5" />
            <Stop offset="100%" stopColor="#2ED47A" />
          </LinearGradient>
        </Defs>
        <G transform="translate(8 40) scale(0.75)">
          <MontlyMarkShape />
        </G>
        <SvgText
          x="420"
          y="214"
          fontSize="154"
          fontWeight="800"
          letterSpacing={-4}
          fill={textColor}
          fontFamily="System"
        >
          {brandName.toLowerCase()}
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
