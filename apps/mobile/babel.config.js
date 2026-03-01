module.exports = {
  presets: ['babel-preset-expo'],
  plugins: [
    'react-native-worklets-core/plugin',
    [
      'module-resolver',
      {
        cwd: 'babelrc',
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        alias: {
          '@app': './src/app',
          '@core': './src/core',
          '@shared': './src/shared',
          '@features': './src/features',
        },
      },
    ],
  ],
};
