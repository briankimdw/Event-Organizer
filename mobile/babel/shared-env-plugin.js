// Babel plugin: makes the web app's Vite env reads work in the Expo app.
//
// Shared files in frontend/src read config with `import.meta.env.VITE_*` (Vite only;
// Hermes has no import.meta). In those files only, this rewrites
//   import.meta.env.X  ->  globalThis.__SHARED_ENV__.X
//   import.meta.env    ->  globalThis.__SHARED_ENV__
// __SHARED_ENV__ is filled from EXPO_PUBLIC_* variables by src/shims/env.ts, which
// index.ts loads before anything else. Mapping: see SHARED_ENV in src/shims/env.ts.
const path = require('path')

const SHARED = path.resolve(__dirname, '../../frontend/src') + path.sep

module.exports = function sharedEnvPlugin({ types: t }) {
  const isImportMetaEnv = (node) =>
    t.isMemberExpression(node) &&
    t.isMetaProperty(node.object) &&
    node.object.meta.name === 'import' &&
    node.object.property.name === 'meta' &&
    !node.computed &&
    t.isIdentifier(node.property, { name: 'env' })

  const target = () => t.memberExpression(t.identifier('globalThis'), t.identifier('__SHARED_ENV__'))

  return {
    name: 'shared-env',
    visitor: {
      MemberExpression(p, state) {
        const file = state.filename && path.resolve(state.filename)
        if (!file || !file.startsWith(SHARED)) return
        if (isImportMetaEnv(p.node)) p.replaceWith(target())
      },
    },
  }
}
