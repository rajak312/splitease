// Expo's Metro config handles npm-workspace monorepos automatically
// (watchFolders + nodeModulesPaths). We only add the "@splitease/source" export
// condition so @splitease/shared is consumed as TypeScript source instead of
// its prebuilt dist bundle.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_conditionNames = [...(config.resolver.unstable_conditionNames ?? []), '@splitease/source'];

module.exports = config;
