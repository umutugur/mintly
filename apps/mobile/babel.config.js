const path = require('path');

module.exports = {
  presets: ['babel-preset-expo'],
  plugins: [
    [
      'module-resolver',
      {
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        alias: {
          '@app': path.join(__dirname, 'src/app'),
          '@core': path.join(__dirname, 'src/core'),
          '@shared': path.join(__dirname, 'src/shared'),
          '@features': path.join(__dirname, 'src/features'),
        },
      },
    ],
  ],
};