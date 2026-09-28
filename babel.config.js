module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Must remain the last plugin in the list.
    plugins: ['react-native-worklets/plugin'],
  };
};
