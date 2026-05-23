// Web stub for lottie-react-native
// Lottie animations are not supported on web without extra deps — replaced with empty View
import React from "react";
import { View } from "react-native";

const LottieView = React.forwardRef(({ style, ...props }, ref) =>
  React.createElement(View, { style, ref })
);

LottieView.displayName = "LottieView";

export default LottieView;
export { LottieView };
