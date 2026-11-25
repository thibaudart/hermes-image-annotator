# Hermes Catalog status

This unified package is an SDK-only prerelease, not a catalog listing. The older standalone prototype remains on `main` and is not in this package tree.

## Compatibility gate

- [SDK request #159971](https://github.com/NousResearch/hermes-agent/issues/159971) tracks the workflow. The public composer staging API, `host.composer.attachImage(draft, png, { filename })`, is proposed in [open PR #160115](https://github.com/NousResearch/hermes-agent/pull/160115).
- The companion `IMAGE_LIGHTBOX_ACTIONS_AREA` is also unmerged. Its SDK context gives the plugin a lazy `readImage()` for the selected image and an opaque, immutable `draft` handle for the originating chat. The [reviewed Desktop candidate](https://github.com/thibaudart/hermes-agent/tree/030feb7d1ef954709e7bf4fa541f473ea50efcf4) contains both seams.
- There is no released compatibility floor to declare today. On a host that lacks either required SDK seam, the plugin registers no action. Local `hermes plugins validate` is an admission check for the package shape, declared capabilities and source, **not** a compatibility test of the Desktop runtime. Use the isolated [Desktop integration test](../tests/README.md) for that.
- Do not submit a catalog pin until an upstream release ships both APIs, the matching verified SemVer floor is set in `plugin.yaml` and the future catalog entry, and the pinned tree passes released-host E2E and the full admission command (`hermes plugins validate <path> --install-deps`). See the [catalog rules](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins/catalog-submission).
