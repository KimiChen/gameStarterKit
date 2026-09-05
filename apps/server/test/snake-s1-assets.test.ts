import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { PUBLIC_SNAKE_SKIN_CATALOG_HASH } from "@game/shared";
import {
    SERVER_SNAKE_SKIN_BUSINESS_HASH,
    SNAKE_AI_SKIN_POOL,
    SNAKE_SKIN_BUSINESS_CATALOG,
    SNAKE_SKIN_COSMETIC_WRITES_ENABLED,
    assertSnakeSkinPublicHash,
    canWriteSnakeSkinCosmetics,
    resolveServerBattleSkin,
    validateSnakeSkinBusinessCatalog,
} from "../src/rooms/modes/snake/skinBusinessCatalog";
import {
    EMBEDDED_PUBLIC_SNAKE_SKIN_CATALOG_HASH,
    SNAKE_SKIN_BUSINESS_CATALOG_DATA,
} from "../src/rooms/modes/snake/skinBusinessCatalog.generated";

const REPO_ROOT = join(import.meta.dirname, "../../..");
const AI_IDS = [101, 111, 112, 132, 133, 139, 401, 403, 411, 701];

test("server business catalog owns the exact frozen AI pool and no gameplay attributes", () => {
    assert.equal(SNAKE_SKIN_BUSINESS_CATALOG.length, 16);
    assert.deepEqual(SNAKE_AI_SKIN_POOL, AI_IDS);
    assert.equal(EMBEDDED_PUBLIC_SNAKE_SKIN_CATALOG_HASH, PUBLIC_SNAKE_SKIN_CATALOG_HASH);
    assert.equal(PUBLIC_SNAKE_SKIN_CATALOG_HASH, "a1cdecbc5e31db3f90ac2fd15465768ef9206b2520000d4ab9f88d6c2135b075");
    assert.equal(SERVER_SNAKE_SKIN_BUSINESS_HASH, "9ed3762e5f5d24d168aafd14fcaccac1d4de83413d0acb17f6308cea1ccbfa19");
    assert.match(SERVER_SNAKE_SKIN_BUSINESS_HASH, /^[a-f0-9]{64}$/);
    for (const entry of SNAKE_SKIN_BUSINESS_CATALOG) {
        assert.deepEqual(Object.keys(entry).sort(), ["acquisition", "aiEligible", "displayName", "fragmentItemId", "ownershipItemId", "price", "rarity", "saleState", "skinId"]);
        assert.equal(entry.displayName.state, "technical-draft");
        assert.equal(entry.displayName.value, `皮肤 ${entry.skinId}`);
        for (const decision of [entry.rarity, entry.ownershipItemId, entry.fragmentItemId, entry.acquisition, entry.saleState, entry.price]) {
            assert.equal(decision.value, null);
        }
        assert.equal("speed" in entry, false);
        assert.equal("score" in entry, false);
        assert.equal("collision" in entry, false);
    }
});

test("S1 cosmetic writes fail closed while battle reads use deterministic skin-1 fallback", () => {
    assert.equal(SNAKE_SKIN_COSMETIC_WRITES_ENABLED, false);
    assert.equal(canWriteSnakeSkinCosmetics(PUBLIC_SNAKE_SKIN_CATALOG_HASH), false, "S3 has not enabled writes");
    assert.equal(canWriteSnakeSkinCosmetics("stale"), false);
    assert.doesNotThrow(() => assertSnakeSkinPublicHash(PUBLIC_SNAKE_SKIN_CATALOG_HASH));
    assert.throws(() => assertSnakeSkinPublicHash("stale"), /operation rejected/);
    assert.deepEqual(resolveServerBattleSkin(701), { requestedSkinId: 701, resolvedSkinId: 701, usedFallback: false, reason: "ok" });
    assert.deepEqual(resolveServerBattleSkin(999), { requestedSkinId: 999, resolvedSkinId: 1, usedFallback: true, reason: "unknown-or-unavailable" });
    assert.deepEqual(resolveServerBattleSkin(701, "stale"), { requestedSkinId: 701, resolvedSkinId: 1, usedFallback: true, reason: "catalog-hash-mismatch" });
});

test("business validator rejects orphan IDs, AI drift, sentinel decisions and public hash mismatch", () => {
    const clone = (): Array<Record<string, unknown>> => JSON.parse(JSON.stringify(SNAKE_SKIN_BUSINESS_CATALOG_DATA)) as Array<Record<string, unknown>>;
    {
        const entries = clone();
        entries[0].skinId = 999;
        assert.throws(() => validateSnakeSkinBusinessCatalog(entries, PUBLIC_SNAKE_SKIN_CATALOG_HASH), /unknown or duplicate/);
    }
    {
        const entries = clone();
        [entries[0], entries[1]] = [entries[1], entries[0]];
        assert.throws(() => validateSnakeSkinBusinessCatalog(entries, PUBLIC_SNAKE_SKIN_CATALOG_HASH), /out of public catalog order/);
    }
    {
        const entries = clone();
        entries[0].aiEligible = true;
        assert.throws(() => validateSnakeSkinBusinessCatalog(entries, PUBLIC_SNAKE_SKIN_CATALOG_HASH), /AI pool differs/);
    }
    {
        const entries = clone();
        entries[0].price = { state: "approved", value: 0 };
        assert.throws(() => validateSnakeSkinBusinessCatalog(entries, PUBLIC_SNAKE_SKIN_CATALOG_HASH), /sentinel business value/);
    }
    assert.throws(() => validateSnakeSkinBusinessCatalog(clone(), "stale"), /embedded public catalog hash/);
});

test("repo-only S1 generator check is fresh and never requires the external source archive", () => {
    const result = spawnSync(process.execPath, ["tools/snake-s1-assets/cli.mjs", "--check"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: { ...process.env, SNAKE_S1_EXTERNAL_SOURCE_MUST_NOT_BE_USED: "/definitely/missing" },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /check passed/);
});

test("S1 converter fixture suite passes from the server test gate", () => {
    // 确定性 deflate（tools/snake-s0-replication/deflate.mjs）是 S1/S0 全部 PNG 产物的字节来源：它的契约测试随本闸一起跑。
    const result = spawnSync(process.execPath, ["--test", "tools/snake-s1-assets/snake-s1-assets.test.mjs", "tools/snake-s0-replication/deflate.test.mjs"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
