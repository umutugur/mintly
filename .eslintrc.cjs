const UI_TEXT_REGEX = '[A-Za-zÀ-ÖØ-öø-ÿА-Яа-яЁёÇĞÜİÖŞçğıöş]';

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  ignorePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.expo/**',
    '**/coverage/**',
    '**/*.d.ts',
    'apps/mobile/src/shared/i18n/locales/*.json',
  ],
  overrides: [
    {
      files: [
        '**/*.tsx',
        '**/navigation/**/*.ts',
        '**/navigation/**/*.tsx',
      ],
      excludedFiles: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: `JSXText[value=/${UI_TEXT_REGEX}/]`,
            message: 'Hardcoded UI text is forbidden. Use t("...") keys.',
          },
          {
            selector: `JSXExpressionContainer > Literal[value=/${UI_TEXT_REGEX}/]`,
            message: 'Hardcoded UI text is forbidden. Use t("...") keys.',
          },
          {
            selector: 'JSXExpressionContainer > TemplateLiteral[expressions.length=0]',
            message: 'Hardcoded UI text is forbidden. Use t("...") keys.',
          },
          {
            selector:
              `JSXAttribute[name.name=/^(placeholder|accessibilityLabel|title|headerTitle|tabBarLabel|label|subtitle|description)$/] > Literal[value=/${UI_TEXT_REGEX}/]`,
            message: 'UI attribute text must come from i18n: use t("...").',
          },
          {
            selector:
              `JSXAttribute[name.name=/^(placeholder|accessibilityLabel|title|headerTitle|tabBarLabel|label|subtitle|description)$/] JSXExpressionContainer > Literal[value=/${UI_TEXT_REGEX}/]`,
            message: 'UI attribute text must come from i18n: use t("...").',
          },
          {
            selector:
              `Property[key.name=/^(title|headerTitle|tabBarLabel|label|placeholder|subtitle|description|accessibilityLabel)$/] > Literal[value=/${UI_TEXT_REGEX}/]`,
            message: 'Navigation/UI config strings must use i18n keys.',
          },
          {
            selector:
              `Property[key.value=/^(title|headerTitle|tabBarLabel|label|placeholder|subtitle|description|accessibilityLabel)$/] > Literal[value=/${UI_TEXT_REGEX}/]`,
            message: 'Navigation/UI config strings must use i18n keys.',
          },
          {
            selector:
              `CallExpression[callee.object.name='Alert'][callee.property.name='alert'] > Literal[value=/${UI_TEXT_REGEX}/]`,
            message: 'Alert text must use i18n: Alert.alert(t("...")).',
          },
          {
            selector:
              "CallExpression[callee.object.name='Alert'][callee.property.name='alert'] > TemplateLiteral[expressions.length=0]",
            message: 'Alert text must use i18n: Alert.alert(t("...")).',
          },
        ],
      },
    },
  ],
};
