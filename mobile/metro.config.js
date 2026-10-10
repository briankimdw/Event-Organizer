// Metro config: the "shared-code bridge" that lets the app import the web app's
// plain-JS data layer (frontend/src/api, lib, verticals) without copying it.
// See README.md > "Shared code" before changing anything here.
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const MOBILE = __dirname
const SHARED = path.resolve(MOBILE, '../frontend/src') // the web app's source
const ENTRY = path.join(MOBILE, 'index.ts') // a file inside mobile/, used as the origin for bare imports

const config = getDefaultConfig(MOBILE)

// 1. Let Metro see (and watch) files in frontend/src. Only src: frontend/node_modules
//    must never be crawled or used.
config.watchFolders = [...(config.watchFolders || []), SHARED]

// 2. Only ever load packages from mobile/node_modules (one React, one supabase-js).
config.resolver.nodeModulesPaths = [path.join(MOBILE, 'node_modules')]
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList || []),
  new RegExp(`${escape(path.resolve(MOBILE, '../frontend/node_modules'))}.*`),
]

// 3. Web-only shared modules swapped for native versions (absolute paths, both sides).
//    Add a line here when a shared file needs something the phone doesn't have,
//    and list it in README.md > "Portability issues".
const REDIRECTS = {
  [path.join(SHARED, 'lib/supabase.js')]: path.join(MOBILE, 'src/lib/supabase.ts'), // import.meta.env + browser auth storage
  [path.join(SHARED, 'lib/images.js')]: path.join(MOBILE, 'src/shims/images.ts'), // canvas, createImageBitmap, exifr
  [path.join(SHARED, 'components/planner/devMock.js')]: path.join(MOBILE, 'src/shims/planner-dev-mock.ts'), // web dev tool
}

const isShared = (file) => !!file && path.resolve(file).startsWith(SHARED + path.sep)
const isBare = (name) => !name.startsWith('.') && !path.isAbsolute(name) && !name.startsWith('@shared/') && !name.startsWith('@/')

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // `@shared/api/catalog.js` -> frontend/src/api/catalog.js
  if (moduleName.startsWith('@shared/')) {
    moduleName = path.join(SHARED, moduleName.slice('@shared/'.length))
  }
  // A package imported by a shared file (react, @supabase/supabase-js...): resolve it
  // as if mobile/ imported it, so it comes from mobile/node_modules.
  const ctx = isShared(context.originModulePath) && isBare(moduleName) ? { ...context, originModulePath: ENTRY } : context
  const result = ctx.resolveRequest(ctx, moduleName, platform)
  if (result?.type === 'sourceFile') {
    const target = REDIRECTS[path.resolve(result.filePath)]
    if (target) return { type: 'sourceFile', filePath: target }
  }
  return result
}

function escape(s) {
  return s.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&')
}

module.exports = config
