# AI photo tools: API contract

The AI photo tools (remove background, erase objects, upscale) are served by the ML service
(`services/ml`, FastAPI). They run open-source models on the server's CPU through ONNX Runtime.
Setup, models, licenses and timings: `services/ml/README.md` → "AI photo tools".

This file is the contract the web app (`frontend/`) and the mobile app (`mobile/`) build against.

## Base URL and auth

| Client | Base URL |
|---|---|
| Web | `import.meta.env.VITE_ML_URL` (default `http://localhost:8000`) |
| Mobile | `process.env.EXPO_PUBLIC_ML_URL` (e.g. `http://192.168.1.20:8000` on the same Wi-Fi; `localhost` does not reach your PC from a phone) |

Every endpoint below needs the signed-in user's Supabase access token:

```
Authorization: Bearer <session.access_token>
```

(`supabase.auth.getSession()` → `data.session.access_token`.) The server checks it with Supabase
Auth and caches a valid token for 60 s.

CORS (browsers): allowed origins are `http://localhost:5173`, `http://127.0.0.1:5173` and
`http://<private LAN IP>:5173` (10.x, 192.168.x, 172.16–31.x). Allowed request headers:
`Authorization`, `Content-Type`. The `X-*` response headers listed below are exposed to JS.
React Native is not subject to CORS.

**Uploading from the Expo app (SDK 57):** the global fetch is `expo/fetch`, whose FormData
encoder rejects a bare `{ uri, name, type }` part (the request fails and looks "offline").
Append `{ uri, name, type, size, bytes() }` instead; `bytes()` returns the file's bytes.
Results come back as React Native Blobs without `arrayBuffer()`; read them with FileReader.
`mobile/src/screens/editor/ai/client.ts` does both.

## Common rules

- **Requests** are `multipart/form-data` (`FormData`). Do not set `Content-Type` yourself; let
  `fetch` add the boundary. Images may be JPEG, PNG, WebP (also BMP, TIFF, GIF first frame;
  HEIC is **not** supported: convert on the device first).
- **EXIF orientation** is applied on the server first, so the result is always upright and has
  no EXIF. Masks must be drawn on the upright image.
- **Responses** on success are the image bytes (`image/png` or `image/jpeg`); read them with
  `res.blob()` (web) or write them to a file (mobile). Headers on every image response:

  | Header | Meaning |
  |---|---|
  | `X-Image-Width`, `X-Image-Height` | Size of the returned image, in pixels |
  | `X-Input-Downscaled` | `true` when the input was larger than the tool's limit and was shrunk before processing |
  | `X-Processing-Ms` | Server time spent on the request (decode + model + encode) |

- **Errors** are JSON with a stable `code` to switch on and a human `message` you can show:

  ```json
  { "detail": { "code": "too_many_pixels", "message": "Image is larger than 50 megapixels." } }
  ```

  | HTTP | `code` | When |
  |---|---|---|
  | 400 | `missing_image` | No `image` field |
  | 400 | `bad_image` | Not a readable image |
  | 400 | `missing_mask`, `bad_mask` | Erase: no mask / unreadable mask |
  | 400 | `mask_size_mismatch` | Erase: mask aspect ratio differs from the image by more than 2% |
  | 400 | `empty_mask` | Erase: nothing painted (no white pixels) |
  | 400 | `bad_option` | Unknown `output`, `format` or `scale` value |
  | 401 | `unauthorized` | Missing, expired or invalid token (header `WWW-Authenticate: Bearer`). Refresh the session and retry once. |
  | 413 | `file_too_large` | Upload over 30 MB (per file) |
  | 413 | `too_many_pixels` | Decoded image over 50 megapixels |
  | 413 | `upscale_input_too_large` | Upscale input longer than 1024 px on its long edge |
  | 429 | `rate_limited` | Over 30 AI requests per user per 10 minutes. `Retry-After` header (seconds). |
  | 503 | `tool_unavailable` | Model not installed on this server (check `/ai/capabilities` first) |
  | 503 | `busy` | The tool was busy with other requests for too long (60 s). `Retry-After` header. |
  | 500 | `inference_failed` | Unexpected model error |

  A network error (service not running) should show "AI tools are offline" and keep the editor usable.

- **Concurrency:** each tool runs one request at a time per server process; others wait in line
  (up to 60 s, then `503 busy`). Show a spinner and disable the button while a request runs; do not
  fire parallel requests from one client.

## `GET /ai/capabilities`

Which tools this server can run, and its limits. Call it when the editor opens; hide or disable
tools whose `available` is `false`.

```json
{
  "tools": {
    "remove_background": {
      "available": true,
      "model": "birefnet-lite",
      "max_input_edge": 2048,
      "outputs": ["cutout", "mask"]
    },
    "erase": {
      "available": true,
      "model": "lama",
      "max_input_edge": 2048,
      "formats": ["jpeg", "png"]
    },
    "upscale": {
      "available": false,
      "model": "realesr-general-x4v3",
      "max_input_edge": 1024,
      "scales": [2, 4],
      "formats": ["jpeg", "png"],
      "reason": "Model not installed (run scripts/fetch_models.py)"
    }
  },
  "limits": {
    "max_upload_bytes": 31457280,
    "max_pixels": 50000000,
    "rate_limit": { "requests": 30, "window_seconds": 600 }
  }
}
```

`reason` is present only when `available` is `false`.

## `POST /ai/remove-background`

| Field | Type | Required | Notes |
|---|---|---|---|
| `image` | file | yes | |
| `output` | text | no | `cutout` (default) or `mask` |

- Input longer than 2048 px is downscaled to 2048 px on its long edge (`X-Input-Downscaled: true`).
- `output=cutout` → `image/png`, RGBA: the photo with the background transparent (soft edges in the alpha).
- `output=mask` → `image/png`, 8-bit grayscale: white = subject, black = background, grey = soft edge.
  Same size as the processed image. Useful for "replace background" or blur-the-background in the client.

## `POST /ai/erase`

Removes what the user painted over and fills it in from the surroundings (LaMa inpainting).

| Field | Type | Required | Notes |
|---|---|---|---|
| `image` | file | yes | |
| `mask` | file (PNG) | yes | **White = remove**, black or transparent = keep. Any size with the same aspect ratio as the upright image; it is resized to the image. |
| `format` | text | no | `jpeg` (default, quality 92) or `png` |

- Input longer than 2048 px is downscaled to 2048 px on its long edge; the result has that size.
- The server grows the painted area slightly (a few pixels) so edges of the object are covered;
  paint loosely over the object, not exactly on its outline.
- Best for small and medium objects (people in the background, wires, litter, blemishes). The fill
  is computed at 512×512 around the painted area, so very large areas come out soft.
- How to build the mask on the client: a canvas the size of the displayed image, black fill
  (or transparent), white brush strokes, exported as PNG.

## `POST /ai/upscale`

| Field | Type | Required | Notes |
|---|---|---|---|
| `image` | file | yes | Long edge at most 1024 px, otherwise `413 upscale_input_too_large` (no silent shrink: shrinking then upscaling would make it worse) |
| `scale` | text | no | `2` (default) or `4` |
| `format` | text | no | `jpeg` (default, quality 92) or `png` |

- Output is `scale` × the input size (max 2048 px for ×2, 4096 px for ×4).
- Transparency is flattened onto white.
- Only offer this for small images (e.g. long edge ≤ 1024 px); larger photos don't need it.

## Typical times (server CPU, after the size limits)

Measured on an 8-core desktop CPU with a 12 MP photo (details: `services/ml/README.md` → "AI photo tools"):

| Request | Time |
|---|---|
| remove-background (cutout or mask) | ~5–6 s |
| erase | ~2 s |
| upscale ×2 / ×4 of a 1024 px image | ~5 s |

Right after the server starts, the first request can take up to ~20 s more while the model loads,
and a request waits behind any other request for the same tool. Show progress (an indeterminate
spinner, with "This can take a few seconds"), use a client timeout of at least 90 s, and let the
user cancel (abort the fetch) without leaving the editor.

## Example (web)

```js
const { data: { session } } = await supabase.auth.getSession()
const form = new FormData()
form.append('image', fileOrBlob, 'photo.jpg')
form.append('output', 'cutout')
const res = await fetch(`${import.meta.env.VITE_ML_URL}/ai/remove-background`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${session.access_token}` },
  body: form,
  signal: abortController.signal,
})
if (!res.ok) {
  const { detail } = await res.json().catch(() => ({ detail: { code: 'http_' + res.status, message: res.statusText } }))
  throw Object.assign(new Error(detail.message), { code: detail.code })
}
const png = await res.blob()
```

## Example (mobile, Expo)

```ts
const form = new FormData()
form.append('image', { uri: localUri, name: 'photo.jpg', type: 'image/jpeg' } as any)
form.append('mask', { uri: maskUri, name: 'mask.png', type: 'image/png' } as any)
const res = await fetch(`${process.env.EXPO_PUBLIC_ML_URL}/ai/erase`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${session.access_token}` },
  body: form,
})
```
