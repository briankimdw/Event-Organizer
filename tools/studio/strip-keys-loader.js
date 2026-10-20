// photomatch Studio: webpack loader for miniPaint's src/js/config.js only.
// Upstream ships its own Pixabay and Google Fonts API keys there. They aren't ours and this repo is
// public, so the assignments are replaced with empty strings before bundling (the upstream file on
// disk is untouched). build.mjs fails if a key still shows up in the bundle.
// Copyright (c) 2026 photomatch contributors. MIT License.
module.exports = function stripKeys(source) {
  let out = source
  let n = 0
  for (const name of ['pixabay_key', 'google_webfonts_key']) {
    const re = new RegExp(`(config\\.${name}\\s*=\\s*)[^;\\n]+;`)
    if (re.test(out)) { out = out.replace(re, "$1'';"); n++ }
  }
  if (n !== 2) this.emitError(new Error(`strip-keys-loader: expected 2 API key assignments in config.js, replaced ${n}. Check upstream before updating the pin.`))
  return out
}
