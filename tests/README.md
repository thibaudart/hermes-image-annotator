# Verification

Use Node **26.12.1**. From this package checkout:

```sh
node --test tests/plugin.test.mjs
hermes plugins validate "$PWD"
```

The CLI checks package admission rules but does not exercise Electron or certify Desktop SDK compatibility. This package declares no Python dependencies. The catalog CI command additionally passes `--install-deps`; use a disposable Hermes checkout/environment for that command because it can resync the environment.

## Desktop integration

Use a **scratch** Hermes Agent checkout of the reviewed candidate `41d40e5df804e393f6b83cbafdedfe7a30c7693e`, with Desktop E2E dependencies, a matching `apps/desktop/dist` build, and a Python interpreter with that candidate's Hermes dependencies. A matching existing build can be copied into the scratch checkout instead of reinstalling dependencies. Do not copy the spec into a long-lived or installed Hermes checkout.

From that scratch checkout, with Node 26.12.1 on `PATH`:

```sh
PLUGIN_REPO=/absolute/path/to/hermes-image-annotator
HERMES_E2E_PYTHON=/absolute/path/to/venv/bin/python
cp "$PLUGIN_REPO/tests/image-annotator.spec.ts" apps/desktop/e2e/core/
cd apps/desktop
IMAGE_ANNOTATOR_PACKAGE="$PLUGIN_REPO" HERMES_E2E_PYTHON="$HERMES_E2E_PYTHON" \
  node node_modules/@playwright/test/cli.js test -c e2e/core/playwright.config.ts image-annotator.spec.ts
```

The spec uses the candidate's Core Desktop harness: a disposable home and Electron data dir, the real local gateway with manual approvals, and a loopback scripted model serving a seeded sample image. It copies the actual unified package into the disposable home, enables its Desktop half using the normal UI, and exercises the native lightbox, SDK dialog, and host attachment path. It independently decodes the source and staged PNG, checking the dimensions, custom ink, undone and untouched pixels, unchanged source and draft text, cancel without staging, and no extra `prompt.submit`. No personal profile or chats are used.
