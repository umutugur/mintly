module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
          alias: {
            '@app': './apps/mobile/src/app',
            '@core': './apps/mobile/src/core',
            '@shared': './apps/mobile/src/shared',
            '@features': './apps/mobile/src/features',
          },
        },
      ],
    ],
  };
};