import { forwardRef, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { radius, spacing, typography, useTheme } from '@shared/theme';

// no touch/keyboard behavior changed by this PR.
interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  error?: string | null;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  autoComplete?: 'off' | 'name' | 'email' | 'password' | 'username' | 'tel';
  textContentType?:
    | 'none'
    | 'name'
    | 'givenName'
    | 'familyName'
    | 'emailAddress'
    | 'password'
    | 'newPassword'
    | 'telephoneNumber'
    | 'username';
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  blurOnSubmit?: boolean;
  editable?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  inputWrapStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  onFocus?: () => void;
  onBlur?: () => void;
  leftAdornment?: ReactNode;
  rightAdornment?: ReactNode;
  labelRight?: ReactNode;
  multiline?: boolean;
  numberOfLines?: number;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    value,
    onChangeText,
    placeholder,
    error,
    secureTextEntry,
    keyboardType = 'default',
    autoCapitalize = 'none',
    autoCorrect = false,
    autoComplete = 'off',
    textContentType = 'none',
    returnKeyType = 'done',
    onSubmitEditing,
    blurOnSubmit = true,
    editable = true,
    containerStyle,
    inputWrapStyle,
    inputStyle,
    onFocus,
    onBlur,
    leftAdornment,
    rightAdornment,
    labelRight,
    multiline = false,
    numberOfLines,
  },
  ref,
) {
  const { theme } = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.wrapper, containerStyle]}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: theme.colors.label }]}>{label}</Text>
        {labelRight ? <View>{labelRight}</View> : null}
      </View>

      <View
        style={[
          styles.inputWrap,
          {
            backgroundColor: theme.colors.inputBackground,
            borderColor: theme.colors.inputBorder,
            borderWidth: isFocused ? 1.5 : 1,
          },
          isFocused && { borderColor: theme.colors.inputBorderFocused },
          error && { borderColor: theme.colors.inputBorderError },
          !editable && styles.inputWrapDisabled,
          multiline ? styles.inputWrapMultiline : null,
          inputWrapStyle,
        ]}
      >
        {leftAdornment ? (
          <View pointerEvents="none" style={styles.leftAdornment}>
            {leftAdornment}
          </View>
        ) : null}

        <TextInput
          ref={ref}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          autoCorrect={autoCorrect}
          blurOnSubmit={blurOnSubmit}
          editable={editable}
          keyboardType={keyboardType}
          onBlur={() => {
            setIsFocused(false);
            onBlur?.();
          }}
          onChangeText={onChangeText}
          onFocus={() => {
            setIsFocused(true);
            onFocus?.();
          }}
          onSubmitEditing={onSubmitEditing}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.inputPlaceholder}
          returnKeyType={returnKeyType}
          secureTextEntry={secureTextEntry}
          multiline={multiline}
          numberOfLines={numberOfLines}
          style={[
            styles.input,
            { color: theme.colors.inputText },
            leftAdornment ? styles.inputWithLeftAdornment : null,
            rightAdornment ? styles.inputWithRightAdornment : null,
            multiline ? styles.inputMultiline : null,
            inputStyle,
          ]}
          textContentType={textContentType}
          value={value}
        />

        {rightAdornment ? <View style={styles.rightAdornment}>{rightAdornment}</View> : null}
      </View>

      {error ? <Text style={[styles.errorText, { color: theme.colors.inputBorderError }]}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  inputWrap: {
    borderRadius: radius.md,
    height: 54,
    justifyContent: 'center',
  },
  inputWrapMultiline: {
    height: 'auto',
    minHeight: 54,
    justifyContent: 'flex-start',
  },
  inputWrapDisabled: {
    opacity: 0.7,
  },
  input: {
    ...typography.body,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
  },
  inputMultiline: {
    minHeight: 96,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    textAlignVertical: 'top',
  },
  inputWithLeftAdornment: {
    paddingLeft: 44,
  },
  inputWithRightAdornment: {
    paddingRight: 46,
  },
  leftAdornment: {
    left: spacing.md,
    position: 'absolute',
    top: 16,
  },
  rightAdornment: {
    alignItems: 'center',
    height: 54,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.md,
    top: 0,
  },
  errorText: {
    ...typography.caption,
    fontSize: 12,
  },
});
