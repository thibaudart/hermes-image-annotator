# Desktop integration test

The test uses a disposable Hermes home, a seeded conversation with a sample PNG, an isolated Electron window, and a loopback mock model server. It checks runtime plugin discovery, marker color and pixels, undo, a real PNG download through Electron, preservation of existing draft text, no draft attachment or auto-send, and closing the editor.

Run it in a Hermes Agent source checkout with its Desktop E2E dependencies installed and `apps/desktop/dist` built. It was exercised against source revision `caafe5389a`. From the Hermes Agent checkout (set `PLUGIN_REPO` to your clone of this repository):

```sh
PLUGIN_REPO=/path/to/hermes-image-annotator
cp "$PLUGIN_REPO/tests/local-image-annotator.spec.ts" apps/desktop/e2e/
cd apps/desktop
IMAGE_ANNOTATOR_JS="$PLUGIN_REPO/plugin.js" pnpm exec playwright test local-image-annotator.spec.ts --workers=1 --reporter=list
```

Remove the copied spec from your Hermes checkout when finished. To observe the missing-feature assertion without installing the plugin in the sandbox, run the same test with `IMAGE_ANNOTATOR_JS` unset.
