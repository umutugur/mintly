module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          extensions: [".js", ".jsx", ".ts", ".tsx", ".json"],
          alias: {
            "@app": "./apps/mobile/src/app",
            "@core": "./apps/mobile/src/core",
            "@features": "./apps/mobile/src/features",
              "@shared": "./apps/mobile/src/shared",
            "@ui": "./apps/mobile/src/ui",
            "@assets": "./apps/mobile/assets",
          },
        },
      ],
    ],
  };
};