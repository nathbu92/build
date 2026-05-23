// Web stub for @sbaiahmed1/react-native-blur
// Native blur effects are not supported on web — replaced with plain View
import React from "react";
import { View } from "react-native";

export const BlurView = ({ children, style, ...props }) =>
  React.createElement(View, { style, ...props }, children);

export const LiquidGlassView = ({ children, style, ...props }) =>
  React.createElement(View, { style, ...props }, children);

export const VibrancyView = ({ children, style, ...props }) =>
  React.createElement(View, { style, ...props }, children);

export default { BlurView, LiquidGlassView, VibrancyView };
