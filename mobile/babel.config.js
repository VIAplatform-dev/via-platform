// Without this file Metro transforms the app with no Expo preset at all, and React Native's own
// Flow-typed core does not survive it — Libraries/BatchedBridge/BatchedBridge.js annotates
// `const BatchedBridge: MessageQueue = new MessageQueue()`, the annotation is left in place, and
// the app dies on launch with "Property 'MessageQueue' doesn't exist" before any screen renders.
//
// react-native-worklets/plugin must stay LAST in the plugin list: it rewrites the function bodies
// Reanimated 4 runs on the UI thread, and it has to see them after every other transform.
module.exports = function (api) {
 api.cache(true);
 return {
  presets: ["babel-preset-expo"],
  plugins: ["react-native-worklets/plugin"],
 };
};
