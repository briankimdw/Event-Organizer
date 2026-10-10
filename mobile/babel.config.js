module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    // Rewrites import.meta.env in shared web files (frontend/src). See babel/shared-env-plugin.js.
    plugins: ['./babel/shared-env-plugin.js'],
  }
}
