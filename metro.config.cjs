const path = require("path");
const { getDefaultConfig } = require("@expo/metro-config");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// pnpm / monorepo için kritik ayarlar
config.resolver.unstable_enableSymlinks = true;
config.resolver.disableHierarchicalLookup = true;

// workspace root'u izle
config.watchFolders = [projectRoot];

// root node_modules'u öncelikle kullan
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
];

module.exports = config;