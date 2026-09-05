# Snake S1 headless acceptance evidence

Generated deterministically from repository-owned inputs by `node tools/snake-s1-assets/cli.mjs --write`. Normal generation and checking do not read the external archive.

- Frozen source commit: `6367f65bf210d75ba39c0e48ecace5b30b538a06`
- Public catalog: 16 active/player-usable skins, default `1`
- AI pool: `101, 111, 112, 132, 133, 139, 401, 403, 411, 701`
- Presentation envelope: explicit version `2`
- Copied resources: 34; S1-12 magnet runtime resources: 8 (7 copied + 1 generated recipe)
- Individual previews: 16
- Public hash: `a1cdecbc5e31db3f90ac2fd15465768ef9206b2520000d4ab9f88d6c2135b075` (unchanged from `d18846a`)
- Server business hash: `b851e3453a39071a01771d0e8e5127343a95cba5fbe502cea9885f372f2d9d2c` (unchanged from `d18846a`)
- Client presentation hash: `8615596acd12651307cc885bdc606517f6094bba47e729fb8cb59203c93ed629`
- Historical pre-S1-12 client hash at `d18846a`: `62e1a6683a71db3ef0724cd6030114b7d9a64845723b14fa8c7c6d58a9302efe`
- Creator import/final aura blending, hierarchy and device validation: explicitly deferred to S5.

## Files

- `completeness-matrix.json`: one closed row per frozen skin ID.
- `magnet-completeness.json`: world frame/icon alias, five-texture aura, audio and eight-file runtime inventory.
- `conversion-report.json`: skin frame normalization plus magnet atlas/aura conversion facts.
- `provenance.json`: copy/alias/normalized-input/generated-recipe/preview provenance with source and output hashes.
- `validation-report.json`, `catalog-hashes.json`: headless gate results, presentation version and current/historical hashes.
- `execution-record.md`: commands, exit codes, suite counts, visual review and explicit non-applicable gates.
- `technical-contact-sheet.png`, `technical-review.json`: skin frame/track inspection and closed issue list.
- `contact-sheet.png`, `previews/`, `content-review-package.json`: S3 content-review input.
- `SHA256SUMS`: deterministic evidence integrity list.

The technical labels and acquisition fields are drafts; `content-review-package.json` is the S3 review input, not an approval record. S1-12 performs headless conversion/validation only; it does not claim the deferred Creator S5 visual gate.
