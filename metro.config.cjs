const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

// workspace paketlerini izle
const watchFolders = [
  path.resolve(projectRoot, 'packages'),
];

// @mintly/shared gibi workspace importlarını doğru yere sabitle
const extraNodeModules = {
  '@mintly/shared': path.resolve(projectRoot, 'packages/shared'),
};

const config = getDefaultConfig(projectRoot);

config.watchFolders = watchFolders;

// pnpm symlink + monorepo için gerekli ayarlar
config.resolver.unstable_enableSymlinks = true;
config.resolver.disableHierarchicalLookup = true;

config.resolver.extraNodeModules = new Proxy(extraNodeModules, {
  get: (target, name) =>
    name in target ? target[name] : path.join(projectRoot, 'node_modules', name),
});

module.exports = config;