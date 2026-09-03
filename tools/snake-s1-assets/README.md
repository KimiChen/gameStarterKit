# Snake S1 assets and catalog generator

This tool owns the deterministic S1 conversion boundary described by
[`docs/s/s1-assets-and-catalog.md`](../../docs/s/s1-assets-and-catalog.md).

Normal development and CI are repository-only:

```bash
node tools/snake-s1-assets/cli.mjs --write
node tools/snake-s1-assets/cli.mjs --check
node --test tools/snake-s1-assets/snake-s1-assets.test.mjs
```

Only an explicit refresh may access the approved frozen archive. It verifies the exact clean Git commit before reading,
normalizes body/atlas inputs plus the `SnakeMagnet` Cocos 2 hierarchy/animation/particle recipe into `source/`, copies
approved bytes without source metadata, creates repository-owned type-correct Cocos metadata for new assets, and then
regenerates every output:

```bash
node tools/snake-s1-assets/cli.mjs --refresh-source --source /absolute/path/to/approved/archive
```

Ownership:

- Hand-edited source: `source/catalog.json`.
- Frozen, replayable inputs: `source/manifest.json`, `source/internal-skins/`, `source/presentation/`.
- Generated catalogs: shared public identity, server business draft, client presentation.
- Generated QA: runtime preview PNGs and `docs/s/evidence/s1/`.
- Runtime PNG/audio bytes live under `apps/Cocos/assets/resources/snakeoff/`; their `.meta` files are repository-owned.
- `source/presentation/magnet.atlas.json` contains only tools frame `10001`; `magnet-aura.json` is the UUID-free,
  component-whitelisted replay input used to generate the Cocos 3 JsonAsset recipe.
- Historical envelopes without `presentationVersion` are migration version 1. Current output is explicit version 2;
  S1-12 must preserve the public/server hashes while changing only the client presentation hash.

Do not hand-edit generated catalog files or preview/evidence outputs. Fix `source/catalog.json`, the converter, or use the
explicit refresh path, then regenerate.
