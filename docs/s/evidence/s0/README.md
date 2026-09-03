# Snake S0 replication evidence

Status: **complete**. Evidence date: 2026-09-03.

This directory is a deterministic evidence bundle for `newEndlessPortraitV2Map4096TotalTime0`. The PNG files are
**source-derived static reconstructions**, not unmodified screenshots of a running original.
They establish auditable source values, geometry, source atlas identity, and repeatable comparison
fixtures; they do not establish WeChat plugin, original engine-runtime, or device-renderer behavior.

## Frozen identities

| Item | Identity |
|---|---|
| Source archive commit | `6367f65bf210d75ba39c0e48ecace5b30b538a06` |
| Target gap baseline commit | `ecd75148efc3c355ab8dc2d36c98cd3395509c52` |
| Evidence tool | `snake-s0-replication@1` |
| Combination hash | `2319d173326602d85fc4c6a85f5b4ca16452cd778f0794896398294a1d5f87e2` |
| Deterministic seed | `20260903` |
| Source inputs read | 34 |
| Golden PNG files | 14 |

The source manifest records a source-relative path, symbolic-link target string where applicable,
resolved path, resolved content SHA-256, size, and read purpose. The target gap matrix is taken with
`git show` from the frozen target commit, so later S1/S2 work cannot rewrite the historical S0
baseline.

## Important artifacts

- `config/new-endless-v2-source-4896.json`: exact source object parsed without executing source JS.
- `config/new-endless-portrait-v2-map-4096.json`: exact object with only map width/height changed.
- `config/config-hashes.json`: five independent layer hashes and the combination hash.
- `fixtures/path-point-vectors.json`: full 71-step table plus the seven frozen boundary vectors.
- `fixtures/deadline-vectors.json`: `totalTime=0`/no-deadline behavior and the independent relive deadline.
- `presentation/palette.json`: exact light/dark source values and boundary semantics.
- `goldens/manifest.json`: PNG identities and per-image metadata sidecars.
- `current-gap-matrix.json`: current-vs-target facts, stage owners, and verification routes.
- `SHA256SUMS`: byte identities for every payload file in the bundle.

## Rebuild and check

From the target repository root:

```bash
node tools/snake-s0-replication/cli.mjs \
  --source /Users/kimi/work/tanchishe/wegameVersion \
  --write

node tools/snake-s0-replication/cli.mjs \
  --source /Users/kimi/work/tanchishe/wegameVersion \
  --check
```

`--check` rebuilds in a fresh temporary directory and requires the complete file list and every
byte to match. No generated evidence file is imported by `apps/**`.
