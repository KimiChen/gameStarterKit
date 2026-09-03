# Snake S1 execution record

Date: 2026-09-03 (Asia/Shanghai). Commands ran from `/Users/kimi/work/gameStarterKit` unless noted.

| Command | Exit | Raw terminal result / trailer |
|---|---:|---|
| `git pull --ff-only` | 0 | `Already up to date.` |
| `node tools/snake-s1-assets/cli.mjs --refresh-source --source /Users/kimi/work/tanchishe/wegameVersion` | 0 | final run: `[snake-s1] refreshed 68 frozen source files and wrote 65 artifacts` |
| `node tools/snake-s1-assets/cli.mjs --write` (run twice before and once after adding this record) | 0 | pre-record runs wrote 64 artifacts byte-identically; final run: `[snake-s1] wrote 65 deterministic artifacts` |
| `node tools/snake-s1-assets/cli.mjs --check` | 0 | final run: `[snake-s1] check passed (65 deterministic artifacts)` |
| `node --permission --allow-fs-read=/Users/kimi/work/gameStarterKit tools/snake-s1-assets/cli.mjs --check` | 0 | final run: `[snake-s1] check passed (65 deterministic artifacts)`; the approved external archive was outside the process read allowlist |
| `node --test tools/snake-s1-assets/snake-s1-assets.test.mjs` | 0 | `tests 8`, `pass 8`, `fail 0` |
| `npm run sync:shared` | 0 | `[sync-shared] 同步完成：54 个文件`; chained client mirror sync completed |
| `npm run sync:client` | 0 | `[sync-client] 同步完成：169 个文件` |
| `npm run typecheck` | 0 | shared/server/client strict/client legacy all completed with 0 TypeScript errors; embedded `verify:sync` reported both mirrors consistent |
| `npm run test:client` | 0 | `tests 377`, `pass 377`, `fail 0` |
| `npm --workspace @game/server run test` | 0 | `tests 489`, `pass 489`, `fail 0` |
| `npm run verify:sync` | 0 | shared/client mirrors consistent; checked-in `.meta` files complete |
| `npm run verify:inventory` | 0 | `inventory 14 项能力、5 个默认入口校验通过` |
| `(cd docs/s/evidence/s1 && shasum -a 256 -c SHA256SUMS)` | 0 | all 28 generated evidence entries reported `OK` |

Focused catalog gates, also included by the full suites:

- Server S1 tests: 5/5 passed (business exactness, AI pool, draft write gate, public-hash mismatch, repo-only freshness and converter suite dispatch).
- Client catalog tests: 8/8 passed (public/client exactness, known animation structures, `bodyScale=1.0..2.8` layout, runtime fallback, presentation policy).
- Two generated contact sheets were visually inspected: 16/16 skins identifiable; 403 tail, 411 12-frame boost head, 701 2/7 heads and 3/4 inherited boost were visible; blocking issue count is zero.

Not applicable / deliberately not claimed:

- `codegen:gameplays`, `codegen:features` and protocol fingerprint re-pin were not run because S1 changed no gameplay schema, feature descriptor or protocol source.
- Creator 3.8.8 import, UUID round-trip, pivot/blending and device validation were not run. They remain S5 gates and are not marked passed here.
