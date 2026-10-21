// The app <-> Studio page protocol (docs/STUDIO.md "Mobile"). Pure strings and types, no imports,
// so the same code runs in the WebView (StudioSheet.tsx) and in the headless bridge test
// (node --experimental-strip-types loads this file as is).
//
// The Studio page (frontend/public/studio/index.html, served from EXPO_PUBLIC_STUDIO_URL) exposes
// window.studioBridge { ready, open(url, { name }), exportImage(opts), isDirty(), onChange, onEscape }.
// Over a WebView there is no shared JS realm, so:
//
//   app -> page: injectJavaScript(...) of the strings below. PAGE_SCRIPT (passed as the WebView's
//     injectedJavaScript) installs window.__pmStudio; then:
//       begin(n)            start receiving an image in n base64 parts
//       part(i, "<b64>")    one part (CHUNK chars at most; big strings are split so no single
//                           evaluateJavaScript call carries megabytes)
//       open(name)          join the parts into a data: URL and studioBridge.open() it
//       exportImage({ id, maxEdge, quality })   flatten -> JPEG -> base64, sent back in parts
//
//   page -> app: window.ReactNativeWebView.postMessage(JSON) with source: 'pm-studio':
//       { type: 'ready', version }                    studioBridge.ready resolved
//       { type: 'opened', width, height }             the image is open (history starts fresh)
//       { type: 'change', dirty }                     studioBridge.onChange
//       { type: 'escape' }                            Escape with no Studio popup open (hardware keyboard)
//       { type: 'export-begin', id, n, width, height, changed, length }
//       { type: 'export-part', id, i, data }          n of these, in order
//       { type: 'export-end', id }
//       { type: 'error', stage: 'start' | 'open' | 'export', id?, message }

/** Characters of base64 per message / injection (about 190 KB of JPEG). */
export const CHUNK = 256 * 1024

export type StudioMessage =
  | { source: 'pm-studio'; type: 'ready'; version: string }
  | { source: 'pm-studio'; type: 'opened'; width: number; height: number }
  | { source: 'pm-studio'; type: 'change'; dirty: boolean }
  | { source: 'pm-studio'; type: 'escape' }
  | { source: 'pm-studio'; type: 'export-begin'; id: string; n: number; width: number; height: number; changed: boolean; length: number }
  | { source: 'pm-studio'; type: 'export-part'; id: string; i: number; data: string }
  | { source: 'pm-studio'; type: 'export-end'; id: string }
  | { source: 'pm-studio'; type: 'error'; stage: 'start' | 'open' | 'export'; id?: string; message: string }

/** Parse a WebView message; null when it isn't ours. */
export function parseMessage(data: string): StudioMessage | null {
  if (!data || data.charCodeAt(0) !== 123 /* { */) return null
  try {
    const m = JSON.parse(data)
    return m && m.source === 'pm-studio' && typeof m.type === 'string' ? (m as StudioMessage) : null
  } catch {
    return null
  }
}

/** Installed once per page load (WebView injectedJavaScript). Ends with `true;` as iOS requires. */
export const PAGE_SCRIPT = `(function () {
  if (window.__pmStudio) return;
  var CHUNK = ${CHUNK};
  function post(msg) {
    msg.source = 'pm-studio';
    try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {}
  }
  function text(e) { return String((e && e.message) || e || 'Unknown error'); }
  var parts = [];
  window.__pmStudio = {
    begin: function (n) { parts = new Array(n); },
    part: function (i, s) { parts[i] = s; },
    open: function (name) {
      var missing = 0;
      for (var i = 0; i < parts.length; i++) if (typeof parts[i] !== 'string') missing++;
      if (!parts.length || missing) { parts = []; post({ type: 'error', stage: 'open', message: 'The photo didn’t arrive in Studio. Try again.' }); return; }
      var url = 'data:image/jpeg;base64,' + parts.join('');
      parts = [];
      window.studioBridge.open(url, { name: name }).then(function (r) {
        post({ type: 'opened', width: r.width, height: r.height });
      }, function (e) { post({ type: 'error', stage: 'open', message: text(e) }); });
    },
    exportImage: function (o) {
      var b = window.studioBridge;
      var changed = !!b.isDirty();
      b.exportImage({ type: 'image/jpeg', quality: o.quality, maxEdge: o.maxEdge }).then(function (out) {
        return new Promise(function (resolve, reject) {
          var fr = new FileReader();
          fr.onload = function () { resolve({ out: out, url: String(fr.result) }); };
          fr.onerror = function () { reject(new Error('Couldn’t read the exported image.')); };
          fr.readAsDataURL(out.blob);
        });
      }).then(function (r) {
        var b64 = r.url.slice(r.url.indexOf(',') + 1);
        var n = Math.max(1, Math.ceil(b64.length / CHUNK));
        post({ type: 'export-begin', id: o.id, n: n, width: r.out.width, height: r.out.height, changed: changed, length: b64.length });
        for (var i = 0; i < n; i++) post({ type: 'export-part', id: o.id, i: i, data: b64.slice(i * CHUNK, (i + 1) * CHUNK) });
        post({ type: 'export-end', id: o.id });
      }).catch(function (e) { post({ type: 'error', stage: 'export', id: o.id, message: text(e) }); });
    },
  };
  var tries = 0;
  (function wait() {
    var b = window.studioBridge;
    if (!b || !b.ready) {
      if (++tries > 600) { post({ type: 'error', stage: 'start', message: 'Studio didn’t start.' }); return; }
      setTimeout(wait, 50);
      return;
    }
    b.onChange = function (d) { post({ type: 'change', dirty: !!d }); };
    b.onEscape = function () { post({ type: 'escape' }); };
    b.ready.then(function () { post({ type: 'ready', version: String(b.version || '') }); },
      function (e) { post({ type: 'error', stage: 'start', message: text(e) }); });
  })();
})();
true;`

/** Split base64 into CHUNK-sized parts. */
export function chunks(b64: string): string[] {
  const out: string[] = []
  for (let i = 0; i < b64.length; i += CHUNK) out.push(b64.slice(i, i + CHUNK))
  return out.length ? out : ['']
}

/** The injections that open a JPEG (base64, no data: prefix) in Studio, in order. */
export function openCommands(b64: string, name: string): string[] {
  const parts = chunks(b64)
  return [
    `window.__pmStudio.begin(${parts.length}); true;`,
    ...parts.map((p, i) => `window.__pmStudio.part(${i}, ${JSON.stringify(p)}); true;`),
    `window.__pmStudio.open(${JSON.stringify(name)}); true;`,
  ]
}

/** The injection that asks for the flattened JPEG (answered with export-* messages). */
export function exportCommand(id: string, maxEdge: number, quality: number): string {
  return `window.__pmStudio.exportImage(${JSON.stringify({ id, maxEdge, quality })}); true;`
}

/** Collects export-* messages into one base64 string. */
export class ExportCollector {
  id: string
  n = 0
  width = 0
  height = 0
  changed = false
  length = 0
  parts: string[] = []
  constructor(id: string) {
    this.id = id
  }
  /** Feed a message; returns the finished result on export-end, else null. Throws on a broken transfer. */
  add(m: StudioMessage): { base64: string; width: number; height: number; changed: boolean } | null {
    if (!('id' in m) || m.id !== this.id) return null
    if (m.type === 'export-begin') {
      this.n = m.n
      this.width = m.width
      this.height = m.height
      this.changed = m.changed
      this.length = m.length
      this.parts = new Array(m.n)
    } else if (m.type === 'export-part') {
      this.parts[m.i] = m.data
    } else if (m.type === 'export-end') {
      const base64 = this.parts.join('')
      if (!this.n || this.parts.length !== this.n || base64.length !== this.length) throw new Error('The image from Studio arrived incomplete. Try again.')
      return { base64, width: this.width, height: this.height, changed: this.changed }
    }
    return null
  }
}
