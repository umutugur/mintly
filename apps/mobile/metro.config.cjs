const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Monorepo: workspace kökünü izle
config.watchFolders = [workspaceRoot];

// Monorepo: node_modules arama yolları
config.resolver.nodeModulesPaths = [
  path.resolve(workspaceRoot, "node_modules"),
  path.resolve(projectRoot, "node_modules"),
];

// En kritik: react-native alanını önce resolve et
config.resolver.resolverMainFields = ["react-native", "browser", "main"];

// Package exports (SDK 54+)
config.resolver.unstable_enablePackageExports = true;

module.exports = config;