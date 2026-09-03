# Snake S1 execution record

Date: 2026-09-03 (Asia/Shanghai). Commands ran from `/Users/kimi/work/gameStarterKit` unless noted.

| Command | Exit | Raw terminal result / trailer |
|---|---:|---|
| `git pull --ff-only` | 0 | `Already up to date.` |
| `node tools/snake-s1-assets/cli.mjs --refresh-source --source /Users/kimi/work/tanchishe/wegameVersion` | 0 | source commit `6367f65bf210d75ba39c0e48ecace5b30b538a06` was clean and exact; `[snake-s1] refreshed 77 frozen source files and wrote 68 artifacts` |
| `node tools/snake-s1-assets/cli.mjs --write` | 0 | final post-record run: `[snake-s1] wrote 68 deterministic artifacts` |
| `node tools/snake-s1-assets/cli.mjs --check` | 0 | final run: `[snake-s1] check passed (68 deterministic artifacts)` |
| `node --permission --allow-fs-read=/Users/kimi/work/gameStarterKit tools/snake-s1-assets/cli.mjs --check` | 0 | final run: `[snake-s1] check passed (68 deterministic artifacts)`; the approved external archive was outside the process read allowlist |
| `node --test tools/snake-s1-assets/snake-s1-assets.test.mjs` | 0 | `tests 13`, `pass 13`, `fail 0` |
| `npm run sync:shared` | 0 | `[sync-shared] 同步完成：54 个文件`; chained client mirror sync completed |
| `npm run sync:client` | 0 | `[sync-client] 同步完成：169 个文件` |
| `npm run typecheck` (initial audit) | 1 | TypeScript stages passed, then `verify:sync` identified six pre-existing S1 code/directory mirrors without checked-in `.meta`; no type error or S1-12 catalog failure occurred |
| `npm run typecheck` (after adding the six repository-owned mirror `.meta` files) | 0 | shared/server/client strict/client legacy all completed with 0 TypeScript errors; embedded `verify:sync` reported both mirrors consistent and `.meta` complete |
| `npm run test:client` | 0 | `tests 380`, `pass 380`, `fail 0` |
| `npm --workspace @game/server run test` | 0 | `tests 489`, `pass 489`, `fail 0` |
| `npm run verify:sync` | 0 | shared/client mirrors consistent; checked-in `.meta` files complete |
| `npm run verify:inventory` | 0 | `inventory 14 项能力、5 个默认入口校验通过` |
| `(cd docs/s/evidence/s1 && shasum -a 256 -c SHA256SUMS)` | 0 | all 29 generated evidence entries reported `OK` |
| `git commit -m "新增：完成 Snake S1-12 磁铁表现目录"` | 0 | `[new bc5bb97]` (45 S1-12-scoped files) |
| `git push` | 0 | `b97a0b2..bc5bb97  new -> new` |

Focused catalog gates, also included by the full suites:

- Server S1 tests: 5/5 passed (business exactness, AI pool, draft write gate, invariant public/server hashes, repo-only freshness and converter suite dispatch).
- Client catalog tests: 11/11 passed (existing skin/layout/fallback rules plus presentation v2, exact magnet world/icon/aura/audio/identity policy, negative drift cases and runtime fallback).
- Converter tests: 13/13 passed (existing skin conversion plus exact `10001` atlas, safe data-only Cocos 2 decoder, UUID-free five-texture aura recipe, MP3 format, deletion/mutation freshness and hash/version invariants).
- Two generated contact sheets were visually inspected: 16/16 skins identifiable; 403 tail, 411 12-frame boost head, 701 2/7 heads and 3/4 inherited boost were visible; blocking issue count is zero.

Not applicable / deliberately not claimed:

- `codegen:gameplays`, `codegen:features` and protocol fingerprint re-pin were not run because S1 changed no gameplay schema, feature descriptor or protocol source.
- Creator 3.8.8 import, UUID round-trip, aura hierarchy/pivot/blending and device validation were not run. They remain S5 gates and are not marked passed here.
