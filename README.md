# Image Annotator for Hermes Desktop

[Documentation en français](README.fr.md)

Draw on a supported chat image and stage an annotated PNG in the same conversation's reply draft. The original image and draft text stay unchanged. Nothing is sent until you send the reply yourself.

**SDK prerelease (`0.2.0-alpha.1`).** This unified package is not in the Hermes Catalog and is not intended for currently released Desktop builds. It needs both the proposed transcript-image lightbox action (including `readImage()` and the originating draft handle) and the draft-scoped `host.composer.attachImage` SDK API. See the [compatibility and catalog status](docs/catalog.md) and [isolated test instructions](tests/README.md). The `main` branch carries the separate standalone PNG-download prototype; it is not part of this package.

## Use on a compatible candidate build

1. In an isolated Hermes home, place the unified package under `$HERMES_HOME/plugins/image-annotator/`, with `plugin.yaml`, `__init__.py` and `desktop/plugin.js` in their original locations. In **Capabilities → Plugins**, enable the package's **Desktop** switch. The Agent half is an inert shim and need not be enabled.
2. Open an eligible **image in a chat transcript** and click **Annotate** in the viewer. Choose a color and marker width, then draw on the copy. **Undo stroke** removes the last stroke; **Cancel** or **Esc** discards the editor without attaching.
3. Click **Attach to reply**. Hermes stages the PNG locally on the original draft using its normal attachment validation. If the original draft is no longer available, the operation fails rather than attaching to another chat.

The UI follows Desktop's language (English or French; other locales fall back to English). Only images the SDK can supply as already-loaded renderer bytes are eligible. Images may be reduced to at most 4,096 pixels on the longest side and 12 megapixels; animated images become a still PNG. The encoded PNG must fit Hermes's 16 MiB attachment limit.

## Privacy and permissions

- Reads only the selected image, through the Desktop SDK, after you click **Annotate**. Draws and encodes locally. It does not look up other messages, read source paths or refetch URLs.
- Its only write to Hermes is the PNG attachment you explicitly request. Hermes stages the bytes in its local composer storage; there is no plugin upload or auto-send.
- No telemetry, external network requests, clipboard access, shell commands, background services, credentials, backend routes, or plugin dependencies. The Python entrypoint registers nothing.

[MIT License](LICENSE)
