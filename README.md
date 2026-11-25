# Image Annotator for Hermes Desktop

[Documentation en français](README.fr.md)

Draw on a supported image in a Hermes Desktop conversation and export a PNG copy. The original image and the chat draft stay unchanged. Nothing is sent automatically.

## Install locally

1. Download [`plugin.js`](plugin.js) from this repository.
2. Save it as `$HERMES_HOME/desktop-plugins/image-annotator/plugin.js`. The default Hermes home is `~/.hermes` on macOS and Linux, or `%USERPROFILE%\.hermes` on Windows.
3. Hermes Desktop detects the plugin. If it doesn't appear, open the command palette (`⌘K` on macOS, `Ctrl+K` on Windows/Linux) and run **Reload desktop plugins**.

No build step, packages, or API keys are required. This plugin is for **Hermes Desktop**, not the CLI. To uninstall, remove the `image-annotator` folder and reload desktop plugins.

## Use it

1. Click an image in the conversation to open the image viewer, then click **Annotate**.
2. Choose the marker color and width, and draw directly on the image.
3. Click **Save PNG**, then choose where to save the copy. To reply with it, attach it using Hermes Desktop's **+** menu or drag the saved file into the draft.

Use **Undo stroke** to remove the last stroke, or **Esc** to leave the editor. The plugin UI follows Hermes Desktop's language in English or French.

## Compatibility and privacy

- This is the **standalone** build. It was tested on macOS in Hermes Desktop (source revision `caafe5389a`). It uses Desktop's current image viewer markup, which may change after an application update. Other platforms have not been tested.
- No telemetry, image upload, or access to the system clipboard. Drawing happens locally. The PNG is written only when you save it. For a displayed HTTP(S) image, the editor may retry the same URL without a referrer using an anonymous CORS request. Websites that block image export cannot be annotated by this plugin.
- Very large images are resized to at most 4,096 pixels on the longest side and about 12 megapixels. Animated images become a still PNG.
- **Hermes Catalog:** not listed yet. The standalone build uses the app's internal markup to extend the image viewer. Direct attachment to a draft is intentionally disabled until Hermes can target the original draft safely. See [the proposed SDK integration](docs/catalog.md).

[Desktop integration test](tests/README.md) · [MIT License](LICENSE)
