import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, typography, useTheme } from '@shared/theme';

type SplitMode = 'equal' | 'custom';

interface SplitToggleProps {
  value: SplitMode;
  onChange: (value: SplitMode) => void;
  equalLabel: string;
  customLabel: string;
}

export function SplitToggle({ value, onChange, equalLabel, customLabel }: SplitToggleProps) {
  const { theme, mode } = useTheme();
  const dark = mode === 'dark';

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: dark ? '#0E1528' : '#EEF3FC',
          borderColor: dark ? 'rgba(255,255,255,0.10)' : '#DCE5F4',
        },
      ]}
    >
      {([
        { key: 'equal', label: equalLabel },
        { key: 'custom', label: customLabel },
      ] as const).map((item) => {
        const selected = item.key === value;

        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            onPress={() => onChange(item.key)}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: selected ? theme.colors.primary : 'transparent',
                borderColor: selected ? theme.colors.primary : 'transparent',
              },
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={[styles.label, { color: selected ? '#FFFFFF' : theme.colors.textMuted }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 3,
  },
  option: {
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing.sm,
  },
  pressed: {
    opacity: 0.86,
  },
  label: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
  },
});
