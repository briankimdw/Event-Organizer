// Webpack config for the photomatch Studio bundle (miniPaint + our bridge).
// build.mjs copies this file into the scratch build folder and runs it there, so paths are
// relative to that folder: src/ = upstream miniPaint src (unmodified), bridge/ = tools/studio files.
const path = require('path')
const webpack = require('webpack')

const ROOT = __dirname
const OUT = process.env.STUDIO_OUT || path.join(ROOT, 'out')
const VERSION = require(path.join(ROOT, 'upstream-package.json')).version

// Writes bundled-packages.json: every npm package that ended up in the bundle, with its licence,
// so build.mjs can refuse copyleft code and THIRD_PARTY_NOTICES.md can be checked against it.
class BundledPackages {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('BundledPackages', (compilation) => {
      compilation.hooks.processAssets.tap({ name: 'BundledPackages', stage: webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT }, () => {
        const found = new Map()
        for (const m of compilation.modules) {
          const res = m.resource || (m.rootModule && m.rootModule.resource)
          const inner = m.modules ? m.modules.map((x) => x.resource).filter(Boolean) : []
          for (const r of [res, ...inner]) {
            if (!r) continue
            const at = r.lastIndexOf(`node_modules${path.sep}`)
            if (at < 0) continue
            const rest = r.slice(at + 13).split(path.sep)
            const name = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0]
            if (found.has(name)) continue
            const dir = r.slice(0, at + 13) + name.split('/').join(path.sep)
            let pkg = {}
            try { pkg = require(path.join(dir, 'package.json')) } catch (e) { /* none */ }
            const lic = typeof pkg.license === 'string' ? pkg.license : pkg.license && pkg.license.type
            found.set(name, { name, version: pkg.version || '?', license: lic || '?', repository: (pkg.repository && (pkg.repository.url || pkg.repository)) || pkg.homepage || '' })
          }
        }
        const list = [...found.values()].sort((a, b) => a.name.localeCompare(b.name))
        compilation.emitAsset('bundled-packages.json', new webpack.sources.RawSource(JSON.stringify(list, null, 2) + '\n'))
      })
    })
  }
}

module.exports = {
  mode: 'production',
  context: ROOT,
  entry: { minipaint: './bridge/entry.js' },
  output: { path: OUT, filename: '[name].js', publicPath: '', clean: false },
  resolve: {
    extensions: ['.js', '.css'],
    alias: { minipaint: path.join(ROOT, 'src') },
    modules: [path.join(ROOT, 'node_modules'), 'node_modules'],
  },
  resolveLoader: { modules: [path.join(ROOT, 'node_modules')] },
  module: {
    rules: [
      { test: /\.css$/, use: ['style-loader', { loader: 'css-loader', options: { url: false } }] },
      // Upstream's own API keys in config.js are blanked (bridge/strip-keys-loader.js). Runs before babel.
      { test: /[\\/]src[\\/]js[\\/]config\.js$/, enforce: 'pre', use: [path.join(ROOT, 'bridge', 'strip-keys-loader.js')] },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            babelrc: false,
            configFile: false,
            presets: [['@babel/preset-env', { targets: 'defaults' }]],
            plugins: [['@babel/plugin-transform-runtime', { regenerator: true }]],
          },
        },
      },
    ],
  },
  plugins: [
    // AlertifyJS is GPL-3.0: every import of it is replaced by our MIT shim (bridge/alertify-shim.*).
    new webpack.NormalModuleReplacementPlugin(/alertifyjs[\\/]build[\\/]alertify\.min\.js$/, path.join(ROOT, 'bridge', 'alertify-shim.js')),
    new webpack.NormalModuleReplacementPlugin(/alertifyjs[\\/]build[\\/]css[\\/]alertify\.min\.css$/, path.join(ROOT, 'bridge', 'alertify-shim.css')),
    new webpack.ProvidePlugin({ $: 'jquery', jQuery: 'jquery', 'window.jQuery': 'jquery' }),
    new webpack.DefinePlugin({ VERSION: JSON.stringify(VERSION) }),
    new BundledPackages(),
  ],
  devtool: false,
  performance: { hints: false },
}
