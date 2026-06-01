const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Explicitly add 'vrm' and ensure standard 3D formats are recognized
config.resolver.assetExts = [...config.resolver.assetExts, 'vrm', 'gltf', 'glb'];

module.exports = config;