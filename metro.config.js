/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */
// Learn more https://docs.expo.io/guides/customizing-metro

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push("tflite", "json", "txt");

// On web, redirect native-only modules to safe stubs
const webStubs = {
  "@sbaiahmed1/react-native-blur": path.resolve(
    __dirname,
    "stubs/web/react-native-blur.js"
  ),
};

const originalResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && webStubs[moduleName]) {
    return { filePath: webStubs[moduleName], type: "sourceFile" };
  }
  if (originalResolver) {
    return originalResolver(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
