# Snake S1 headless acceptance evidence

Generated deterministically from repository-owned inputs by `node tools/snake-s1-assets/cli.mjs --write`. Normal generation and checking do not read the external archive.

- Frozen source commit: `6367f65bf210d75ba39c0e48ecace5b30b538a06`
- Public catalog: 16 active/player-usable skins, default `1`
- AI pool: `101, 111, 112, 132, 133, 139, 401, 403, 411, 701`
- Imported presentation resources: 27
- Individual previews: 16
- Public hash: `a1cdecbc5e31db3f90ac2fd15465768ef9206b2520000d4ab9f88d6c2135b075`
- Server business hash: `9ed3762e5f5d24d168aafd14fcaccac1d4de83413d0acb17f6308cea1ccbfa19`
- Client presentation hash: `62e1a6683a71db3ef0724cd6030114b7d9a64845723b14fa8c7c6d58a9302efe`
- Creator import/final visual validation: explicitly deferred to S5.

## Files

- `completeness-matrix.json`: one closed row per frozen skin ID.
- `conversion-report.json`: source frame times, normalized durations and known structure facts.
- `provenance.json`: copy/normalized-input/preview provenance with source and output hashes.
- `validation-report.json`, `catalog-hashes.json`: headless gate results and the three intentionally heterogeneous hashes.
- `execution-record.md`: commands, exit codes, suite counts, visual review and explicit non-applicable gates.
- `technical-contact-sheet.png`, `technical-review.json`: frame/track inspection and closed issue list.
- `contact-sheet.png`, `previews/`, `content-review-package.json`: S3 content-review input.
- `SHA256SUMS`: deterministic evidence integrity list.

The technical labels and acquisition fields are drafts; `content-review-package.json` is the S3 review input, not an approval record.
