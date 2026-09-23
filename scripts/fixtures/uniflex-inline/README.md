# Inline UniFlex PSD test fixtures

These two repository-owned PSD snapshots keep the inline editable text and nested
smart-object representation exercised by the import and binary identity tests.
Product art now uses separate override documents and page-level component links;
changing that authoring layout must not silently remove coverage of importing
inline documents. Current product art and link layout remain covered separately
by `scripts/uniflex-art.test.mjs`.

The fixtures are byte-for-byte copies from commit `7997aa976f0aadf85cdd159804fb3f7db8be2321`:
`apps/art/uniflex/components/<name>/<name>.psd`. Tests read these checked-in files
directly and need neither Git history nor Creator/Photoshop export. Do not refresh
them from product art as part of ordinary art sync.

| File | SHA-256 |
| --- | --- |
| `BackpackItemCard.psd` | `ff0df4b410c494ecdf05fee1d32283625ec0799a1e132864f2a47e2403f7ad3e` |
| `ActionButton.psd` | `51f1df8d36c924e52878f0d7eecb2ec401aa2b61657af84156a61fd470ce2e58` |
