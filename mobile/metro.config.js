const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add MP3, M4A, and WAV to asset extensions so Metro bundles them
if (!config.resolver.assetExts.includes('mp3')) {
  config.resolver.assetExts.push('mp3');
}
if (!config.resolver.assetExts.includes('m4a')) {
  config.resolver.assetExts.push('m4a');
}
if (!config.resolver.assetExts.includes('wav')) {
  config.resolver.assetExts.push('wav');
}

// Use prebuilt react-native-svg (lib/) instead of src/ fabric NativeComponent files.
// Compiling src/ triggers RN codegen and can fail with "Cannot find module '../parser/flow'".
const svgCommonJsRoot = path.resolve(__dirname, 'node_modules/react-native-svg/lib/commonjs');
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-svg') {
    return {
      type: 'sourceFile',
      filePath: path.join(svgCommonJsRoot, 'index.js'),
    };
  }
  if (moduleName.startsWith('react-native-svg/')) {
    const subpath = moduleName.slice('react-native-svg/'.length);
    const candidate = path.join(svgCommonJsRoot, `${subpath}.js`);
    if (require('fs').existsSync(candidate)) {
      return { type: 'sourceFile', filePath: candidate };
    }
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
