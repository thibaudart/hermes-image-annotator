# Hermes Catalog status

The standalone build is distributed here for manual installation. It is not listed in the Hermes Catalog. The [catalog's Desktop SDK policy](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins/catalog-submission) excludes direct access to app markup. This repository does not present the standalone implementation as a compliant catalog build. Its PNG export writes no draft data: the original prototype's synthetic paste relied on async image staging that could finish against the wrong draft after a chat switch.

Track the [Desktop SDK request on Hermes Agent](https://github.com/NousResearch/hermes-agent/issues/159971). The same click → annotate → attach workflow needs two public SDK hooks:

1. **An image-viewer action contribution.** Hermes renders a plugin action alongside its own actions when a user opens a chat image. The callback receives the image source (or an opaque readable handle), optional alt text, and the owning draft/surface address. It does not receive the DOM or read other messages. The renderer should expose only the pixels of the image the user opened and only when they invoke the action.
2. **Draft image attachment.** An acknowledged `host.composer.attachImage(...)` operation (name illustrative) accepts a bounded image blob, a safe suggested filename, and the address of the originating draft. Hermes applies the normal file/size checks and attachment staging. It neither changes the draft text nor submits it, and returns a failure if the exact originating surface is no longer available.

After both hooks are available, the canvas can stay in a plugin-owned dialog and the catalog build can remove lightbox DOM lookup, observation of app containers, and synthetic paste. The listing should pin the verified SDK-only commit after admission checks pass.
