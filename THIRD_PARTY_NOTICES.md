# Third-party notices

This file lists third-party code that is **shipped with the app** (copied or bundled into it), as
opposed to ordinary npm dependencies (see each `package.json`). Each entry has the name, the
version or commit, the licence, the copyright holder and where the code comes from.

## Studio (`frontend/public/studio/`)

Studio is the Photoshop-style editor (docs/STUDIO.md). `frontend/public/studio/minipaint.js` is
built by `tools/studio/build.mjs` from the projects below. The licence comments that were in the
sources are kept in `frontend/public/studio/minipaint.js.LICENSE.txt`. The build writes the full
list of npm packages it bundled, with their licences, to `frontend/public/studio/bundled-packages.json`.
If any bundled package has a licence other than MIT, ISC, BSD or Apache-2.0, the build fails.

**Excluded on purpose:** miniPaint depends on **AlertifyJS** (GPL-3.0). It is not installed and not
bundled. The build replaces it with our own MIT notice shim (`tools/studio/alertify-shim.*`).

| Component | Version / commit | Licence | Copyright | Source |
|---|---|---|---|---|
| miniPaint | v4.14.3, commit `a79733eb803fc97084ef0ee4faa96b031e69e1c0` (source tarball SHA-256 `21f1cadb…c34fb4`) | MIT | Copyright (c) ViliusL | https://github.com/viliusle/miniPaint (licence text: `frontend/public/studio/MINIPAINT-LICENSE.txt`) |
| miniPaint icons and GIF worker (`frontend/public/studio/images/`, `src/js/libs/gifjs/gif.worker.js`) | same commit | MIT | Copyright (c) ViliusL; gif.js (c) 2013 Johan Nordberg | as above |
| Layout markup in `frontend/public/studio/index.html` | adapted from miniPaint's `index.html`, same commit | MIT | Copyright (c) ViliusL | as above |
| hermite-resize | 2.2.10, commit `fae53290d2b03520a6fc81d734c3028902a599c0` | MIT | Copyright (c) ViliusL | https://github.com/viliusle/Hermite-resize |
| jQuery | 3.7.1 | MIT | Copyright OpenJS Foundation and other contributors | https://github.com/jquery/jquery |
| pica (dist bundle, which includes glur, multimath, webworkify and object-assign, all MIT) | 7.1.1 | MIT | Copyright (C) 2014-2017 Vitaly Puzrin | https://github.com/nodeca/pica |
| Web Font Loader | 1.6.28 | Apache-2.0 | Copyright (c) 2010-2017 Adobe Systems Incorporated, Google Incorporated | https://github.com/typekit/webfontloader |
| JavaScript Canvas to Blob | 3.29.0 | MIT | Copyright © 2012 Sebastian Tschan | https://github.com/blueimp/JavaScript-Canvas-to-Blob |
| Exif.js | 2.3.0 | MIT | Copyright (c) 2008 Jacob Seidelin | https://github.com/exif-js/exif-js |
| FileSaver.js | 2.0.5 | MIT | Copyright © 2016 Eli Grey | https://github.com/eligrey/FileSaver.js |
| fuzzysort | 1.9.0 | MIT | Copyright (c) 2018 Stephen Kamenar | https://github.com/farzher/fuzzysort |
| gif.js.optimized | 1.0.1 | MIT | Copyright (c) 2013 Johan Nordberg | https://github.com/terikon/gif.js.optimized |
| semver-compare | 1.0.0 | MIT | James Halliday (substack) | https://github.com/substack/semver-compare |
| uuid | 8.3.2 | MIT | Copyright (c) 2010-2020 Robert Kieffer and other contributors | https://github.com/uuidjs/uuid |
| style-loader, css-loader (runtime helpers) | 2.0.0, 5.2.7 | MIT | Copyright JS Foundation and other contributors | https://github.com/webpack-contrib |
| Libraries vendored inside miniPaint's `src/js/libs/` | same miniPaint commit | MIT | glfx.js © 2011 Evan Wallace; ImageFilters.js © 2011 ARAKI Hayato; Color Thief © 2011, 2015 Lokesh Dhakar; quantize.js © 2008 Nick Rabinowitz; Protovis block © 2010 Stanford Visualization Group (BSD); EaselJS ColorMatrix (MIT, gskinner.com); translate.js (MIT); CanvasToTIFF (MIT, Epistemex) | see the headers in miniPaint's `src/js/libs/` |

The full MIT licence text is in `frontend/public/studio/MINIPAINT-LICENSE.txt`. The Apache-2.0
text is at https://www.apache.org/licenses/LICENSE-2.0. Web Font Loader ships no NOTICE file.

**One caveat:** miniPaint's `src/js/libs/zoomView.js` (canvas zoom and pan) and a smoothing helper
in `tools/brush.js` cite Stack Overflow answers as their source. Stack Overflow content is under
CC BY-SA. These are short snippets in upstream code that we haven't changed. Upstream ships them
under its MIT licence. The attribution comments are in upstream's source, at the commit above.
Minifying removes them from `minipaint.js`.

## AI photo tools (`services/ml`, `/ai/*`)

Server-side only: nothing below is bundled into the web or mobile apps. The model files are **not
in the repository**. `services/ml/scripts/fetch_models.py` downloads them from the pinned URLs below
into `services/ml/models/` (git-ignored) and checks their SHA-256. Licences were checked on
2026-10-19 against the upstream LICENSE files and model cards. Details: `services/ml/README.md` →
"AI photo tools".

| Component | Version / revision | Licence | Copyright | Source |
|---|---|---|---|---|
| BiRefNet lite (model weights, `birefnet-lite.onnx`, background removal) | `ZhengPeng7/BiRefNet_lite`; ONNX export `onnx-community/BiRefNet_lite-ONNX` revision `de15b22ba131738a16dff04aab8bdf8dc32e3ac1`, `onnx/model.onnx`, SHA-256 `5600024376f5…0f03333` | MIT (code repo LICENSE and both model cards) | Copyright (c) 2024 ZhengPeng | https://github.com/ZhengPeng7/BiRefNet, https://huggingface.co/onnx-community/BiRefNet_lite-ONNX |
| LaMa big-lama (model weights, `lama.onnx`, object removal) | ONNX port `Carve/LaMa-ONNX` revision `c3c0c9e468934d62e79c329e35d82dd09ff8c444`, `lama_fp32.onnx`, SHA-256 `1faef5301d78…a4eb68d6` | Apache-2.0 (repo LICENSE; model cards of `Carve/LaMa-ONNX` and `smartywu/big-lama`) | Copyright 2021 Samsung Research; ONNX port by Carve (Carve-Photos/lama, Apache-2.0) | https://github.com/advimman/lama, https://huggingface.co/Carve/LaMa-ONNX |
| Real-ESRGAN `realesr-general-x4v3` (model weights, upscaling) | release v0.2.5.0, `realesr-general-x4v3.pth`, SHA-256 `8dc7edb9ac80…bece96292`; converted locally to ONNX | BSD-3-Clause | Copyright (c) 2021, Xintao Wang | https://github.com/xinntao/Real-ESRGAN |
| SRVGGNetCompact architecture (re-implemented in `services/ml/app/ai/srvgg.py`, used for the ONNX export) | from Real-ESRGAN `realesrgan/archs/srvgg_arch.py` | BSD-3-Clause | Copyright (c) 2021, Xintao Wang | https://github.com/xinntao/Real-ESRGAN |
| ONNX Runtime (Python package) | 1.31.0 | MIT | Copyright (c) Microsoft Corporation | https://github.com/microsoft/onnxruntime |
| ONNX (Python package, used only by the fetch script) | 1.23.2 | Apache-2.0 | Copyright (c) ONNX Project Contributors | https://github.com/onnx/onnx |

BSD-3-Clause licence of Real-ESRGAN (applies to the weights and the re-implemented architecture), verbatim:

```
BSD 3-Clause License

Copyright (c) 2021, Xintao Wang
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

**Rejected on purpose:** BRIA RMBG 1.4 / 2.0 (rembg's default model) needs a paid licence for
commercial use. IS-Net / U²-Net weights have no licence of their own (only the code is Apache-2.0).
