# Reveal Unicode Poisoning (Local Layer A Detector)

A local VS Code extension for detecting and exposing suspicious **Layer A Unicode characters** in open source files and text documents.

It is designed for reviewing generated, pasted, or imported text for deterministic character-layer payloads and rendering tricks: invisible Unicode controls, Unicode tag payloads, bidirectional controls, unusual spaces, private-use code points, variation selectors outside allowed contexts, and selected Latin-script lookalikes.

> This extension is a local Unicode integrity/review tool. It does not detect, prove, or remove statistical text watermarks based on ordinary word or token selection.

## Sources
This extension was build from this as a baseline:
https://github.com/resatcaner-sp/reveal-unicode-poisoning

And includes updated detection of layer A from
https://github.com/guillaumemeyer/watermarks-remover

Credits to resatscaner-sp for the extension code itself and guillaumemeyer for the detection code.
This was build using Perplexity AI.

## What it detects

The scanner works at Unicode code-point level and reports these finding categories:

| Kind | Examples | Default handling |
|---|---|---|
| `tag_chars` | Unicode Tags block, `U+E0001–U+E007F` | Flagged; tag payload can be decoded and shown |
| `bidi` | LRM/RLM, embeddings, overrides, isolates | Flagged for review because display order can differ from stored order |
| `zwj_family` | Zero-width space, non-joiner, joiner, word joiner, zero-width no-break space | Flagged outside contextually valid uses |
| `strip` | Soft hyphen, combining grapheme joiner, invisible operators/separators, annotation controls | Flagged |
| `variation_selector` | `U+FE00–U+FE0F`, supplementary variation selectors, Mongolian selectors | Flagged outside supported CJK/Mongolian/emoji contexts |
| `private_use` | BMP and supplementary Private Use Area characters | Flagged because they have no portable Unicode meaning |
| `space` | No-break, thin, narrow no-break, ideographic, and related Unicode spaces | Informational; suggests replacement with U+0020 SPACE |
| `confusable` | Selected Cyrillic and fullwidth Latin lookalikes | Flagged when aggressive mode is enabled |
| `other_cf` | Other known Layer A Unicode format controls | Flagged |

## Context-aware behavior

The scanner is intentionally not an “all non-ASCII is bad” checker.

By default, it preserves rather than flags contextually valid invisible Unicode used by legitimate rendering systems, including:

- Emoji presentation selectors and emoji ZWJ sequences such as `❤️‍🔥` and `👨‍💻`.
- Complete emoji subdivision-flag tag sequences.
- CJK and Mongolian variation-selector contexts.
- Script joiners in supported joining-script contexts.
- Selected Khmer/Hangul/Mongolian orthographic glue contexts.

Bidi controls are always reported in inspection mode. This is intentional: they can be legitimate in multilingual text, but they deserve explicit review in code, configuration, and generated content.

## Why this matters

Visible source text can contain characters that are not obvious in an editor or rendered document. These can be accidental copy/paste artifacts, deliberate text steganography, or source-review hazards.

Examples include:

```text
alpha​beta     # contains U+200B ZERO WIDTH SPACE
co­operate     # contains U+00AD SOFT HYPHEN
abc‮def        # contains U+202E RIGHT-TO-LEFT OVERRIDE
раypal         # can contain Cyrillic lookalikes rather than Latin letters
```

Unicode Tag characters are especially notable because a sequence can encode printable text while appearing invisible in ordinary renderers. The extension reconstructs that encoded tag payload in the Reveal panel.

## Features

- **Status bar** — green `Unicode OK` when no Layer A findings exist; warning/error styling when findings exist.
- **Automatic scan on active-editor change and save** — configurable in VS Code settings.
- **Debounced live scan** — re-scans a visible edited document after a short typing delay.
- **Gutter markers and decorations** — colour-coded underlines, gutter dots, and overview-ruler markers.
- **Hover details** — code point, category, confidence, line/column, replacement hint where applicable, and explanation.
- **Problems panel diagnostics** — findings appear as VS Code diagnostics.
- **Reveal panel** — shows an annotated rendering of the full source and a complete findings table.
- **Unicode Tag decoding** — reconstructs tag-character payloads, with an explicit Copy button.
- **No automatic destructive cleanup** — the old strip action is intentionally disabled in this local fork pending a diff-based, category-aware cleanup workflow.
- **Local-only implementation** — the extension scans text in the visible VS Code editor. It has no network client, subprocess execution, workspace filesystem crawling, telemetry, or external runtime dependencies.

## Commands

| Command | Title | Behavior |
|---|---|---|
| `unicodePoisonDetector.scan` | Scan File for Layer A Unicode | Scan the active editor and update decorations/diagnostics |
| `unicodePoisonDetector.reveal` | Reveal Hidden Payload | Open the annotated Layer A review panel |
| `unicodePoisonDetector.strip` | Strip All Suspicious Characters (Disabled) | Shows a warning; it does not change or save files |

## Configuration

| Setting | Default | Description |
|---|---:|---|
| `unicodePoisonDetector.scanOnSave` | `true` | Scan the active visible file after save |
| `unicodePoisonDetector.scanOnOpen` | `true` | Scan a visible file when it becomes active |
| `unicodePoisonDetector.severity` | `"error"` | Severity used for Unicode Tag diagnostics: `error`, `warning`, or `info` |
| `unicodePoisonDetector.aggressive` | `true` | Also flag the selected Cyrillic and fullwidth Latin confusables from the Layer A policy |
| `unicodePoisonDetector.stripEmojiGlue` | `false` | Also flag contextually valid emoji selectors/joiners and script glue; leave disabled for normal documents |

For English/French/German/Italian code and documentation, the default profile is generally appropriate:

```json
{
  "unicodePoisonDetector.aggressive": true,
  "unicodePoisonDetector.stripEmojiGlue": false
}
```

## Build locally

### Prerequisites

- A supported Node.js LTS version.
- npm.
- VS Code 1.85 or newer.

Verify your environment:

```bash
node --version
npm --version
code --version
```

### Install and compile

From the repository root:

```bash
npm install
npm run compile
```

TypeScript compiles the files from `src/` into `out/`:

```text
src/extension.ts     -> out/extension.js
src/scanner.ts       -> out/scanner.js
src/decoder.ts       -> out/decoder.js
src/decorations.ts   -> out/decorations.js
src/panel.ts         -> out/panel.js
```

The extension manifest loads:

```json
"main": "./out/extension.js"
```

If your npm configuration points to a private registry that is unavailable, perform a one-off public-registry installation without changing global configuration:

```bash
npm install --registry=https://registry.npmjs.org/ --prefer-online --verbose
```

## Run in Extension Development Host

Create `.vscode/launch.json` in the project root:

```json
{
  "version": "0.1.0",
  "configurations": [
    {
      "name": "Run Unicode Layer A Detector",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}"
      ],
      "outFiles": [
        "${workspaceFolder}/out/**/*.js"
      ],
      "preLaunchTask": "npm: compile"
    }
  ]
}
```

Then:

```bash
code .
```

In VS Code:

1. Open **Run and Debug** with `Ctrl+Shift+D`.
2. Select **Run Unicode Layer A Detector**.
3. Press `F5`.
4. A separate **Extension Development Host** window opens.
5. Open a disposable text file or a file under `samples/` in that Development Host window.
6. Run **Scan File for Layer A Unicode** or **Reveal Hidden Payload** from the Command Palette if needed.

The Extension Development Host tests your local compiled extension without installing it in your primary VS Code profile.

## Test fixture

Open `layer-a-extended-test.txt` in the Extension Development Host. With default settings, expected results are:

| Fixture | Expected result |
|---|---|
| U+200B ZERO WIDTH SPACE | `zwj_family` |
| U+200C between Latin letters | `zwj_family` |
| U+00AD SOFT HYPHEN | `strip` |
| U+034F COMBINING GRAPHEME JOINER | `strip` |
| U+2060 WORD JOINER | `zwj_family` |
| U+2063 INVISIBLE SEPARATOR | `strip` |
| U+FEFF ZERO WIDTH NO-BREAK SPACE | `zwj_family` |
| U+00A0 NO-BREAK SPACE | `space`, informational |
| U+2009 THIN SPACE | `space`, informational |
| U+E000 private-use point | `private_use` |
| `ｈｅｌｌｏ` | five `confusable` findings |
| `раypal` | two `confusable` findings |
| `❤️‍🔥` | no finding by default |
| `👨‍💻` | no finding by default |

`samples/poisoned.ts` should also demonstrate Unicode tag payload decoding, a bidi override, and a Cyrillic-confusable identifier.

## Static check of emitted code

After compiling, inspect the JavaScript actually executed by VS Code:

```bash
rg -n \
  'fetch\(|axios|https?://|WebSocket|child_process|exec\(|spawn\(|process\.env|workspace\.fs|readFile|writeFile|eval\(|new Function' \
  out/
```

For this local implementation, the expected match is only the XML namespace in the inline SVG gutter icon:

```text
xmlns="http://www.w3.org/2000/svg"
```

That is embedded SVG markup used to construct a local `data:image/svg+xml` decoration icon; it is not a network request.

## Package a local VSIX

Install the VS Code extension packager as a local development dependency:

```bash
npm install --save-dev @vscode/vsce
```

Package the compiled extension:

```bash
npx vsce package --no-dependencies
```

`vsce` warns if `package.json` has no `repository` field; the manifest declares
`repository`, `bugs` and `homepage` pointing at
[aviscido/reveal-unicode-poisoning](https://github.com/aviscido/reveal-unicode-poisoning),
so packaging runs clean.

The `.vscodeignore` file keeps sources, source maps, samples and editor
configuration out of the package, so only the compiled extension, the manifest,
the license, the README and the icon are shipped.

This writes a local `.vsix` file in the repository root. Inspect it before installing:

```bash
unzip -l ./*.vsix
```

Expected package contents are exactly:

```text
extension.vsixmanifest
[Content_Types].xml
extension/package.json
extension/readme.md
extension/LICENSE.txt
extension/out/extension.js
extension/out/scanner.js
extension/out/decoder.js
extension/out/decorations.js
extension/out/panel.js
extension/icon/icon.png
```

The VSIX should not contain `node_modules/`, credentials, unrelated scripts, unknown binaries, or unnecessary application files.

Install the exact generated VSIX file:

```bash
code --install-extension ./<generated-vsix-file>.vsix
```

Alternatively, in VS Code:

1. Open the Extensions view.
2. Open the `...` menu.
3. Choose **Install from VSIX…**.
4. Select the generated local VSIX.
5. Reload VS Code if prompted.

The package uses a distinct local identity:

```json
{
  "name": "reveal-unicode-poisoning-local",
  "displayName": "Reveal Unicode Poisoning (Local)",
  "publisher": "aviscido"
}
```

This avoids colliding with the upstream marketplace extension. If you installed the upstream version, disable or uninstall it after your local fork is installed to avoid duplicate diagnostics/decorations.

## Project structure

```text
.
├── package.json
├── tsconfig.json
├── src/
│   ├── extension.ts      # activation, commands, lifecycle, diagnostics
│   ├── scanner.ts        # Layer A code-point scanner and contextual policy
│   ├── decoder.ts        # annotated token stream and summary builder
│   ├── decorations.ts    # gutter markers, underlines, hover cards
│   └── panel.ts          # CSP-restricted local review webview
├── out/                  # generated JavaScript and source maps
├── icon/
├── samples/
└── .vscode/
    └── launch.json       # optional local development configuration
```

## Limitations

- This is a deterministic **character-layer** scanner. It does not detect statistical/token-choice watermarks, stylometric signals, image-domain marks, PDF/DOCX metadata, signed provenance records, hidden HTML/CSS, or OCR artifacts.
- JavaScript does not expose an equivalent of Python’s `unicodedata.category()` API. The scanner explicitly covers the relevant Layer A `Cf` ranges and controls, but it is not a full generated Unicode-database implementation for every possible format code point.
- Detection is a review signal, not proof of malicious intent. Some Unicode controls have valid language, typography, or emoji uses; this implementation preserves several known contextually valid uses by default.
- Cleanup is intentionally disabled until a category-aware, preview/diff-based cleanup implementation is added. Do not rely on deletion of every finding as a safe sanitization strategy.

## References

- [Unicode Tags block](https://www.unicode.org/charts/PDF/UE0000.pdf)
- [Unicode Bidirectional Algorithm](https://www.unicode.org/reports/tr9/)
- [Unicode Security Mechanisms, UTS #39](https://www.unicode.org/reports/tr39/)
- [Trojan Source](https://trojansource.codes/)
- [GitHub hidden Unicode warnings](https://github.blog/changelog/2025-05-01-github-now-provides-a-warning-about-hidden-unicode-text/)
