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
    // S3-1 起业务层已填值，hash 随之搬家；⛔ 与 S1 草稿 hash 9ed3762e… 必须不同。
    assert.equal(SERVER_SNAKE_SKIN_BUSINESS_HASH, "b851e3453a39071a01771d0e8e5127343a95cba5fbe502cea9885f372f2d9d2c");
    assert.notEqual(SERVER_SNAKE_SKIN_BUSINESS_HASH, "9ed3762e5f5d24d168aafd14fcaccac1d4de83413d0acb17f6308cea1ccbfa19");
    assert.match(SERVER_SNAKE_SKIN_BUSINESS_HASH, /^[a-f0-9]{64}$/);
    for (const entry of SNAKE_SKIN_BUSINESS_CATALOG) {
        assert.deepEqual(Object.keys(entry).sort(), ["acquisition", "aiEligible", "displayName", "fragmentItemId", "fragmentThreshold", "ownershipItemId", "price", "rarity", "saleState", "skinId"]);
        // 未开放的三项保持 fail-closed。
        for (const decision of [entry.ownershipItemId, entry.fragmentItemId, entry.price]) {
            assert.equal(decision.value, null);
        }
        assert.equal(entry.saleState.value, "off-sale");
        assert.ok(entry.rarity.value >= 0 && entry.rarity.value <= 5, `skin ${entry.skinId} rarity in 原作 6 档`);
        assert.equal("speed" in entry, false);
        assert.equal("score" in entry, false);
        assert.equal("collision" in entry, false);
    }
});

test("S3-1 展示名只用原作实测值，其余保留技术占位（⛔ 不编造产品名）", () => {
    const byId = new Map(SNAKE_SKIN_BUSINESS_CATALOG.map((entry) => [entry.skinId, entry]));
    // 全归档带名字的皮肤记录只有 701/702/703（FeedGameStore bounty_config.skin_list），
    // 加上 Constant.defaultSkinName = "小红" 对应皮肤 1；702/703 不在冻结 16 之列。
    assert.deepEqual(
        SNAKE_SKIN_BUSINESS_CATALOG.filter((e) => e.displayName.state === "approved").map((e) => [e.skinId, e.displayName.value]),
        [[1, "小红"], [701, "招财喵"]],
    );
    for (const entry of SNAKE_SKIN_BUSINESS_CATALOG) {
        if (entry.displayName.state === "approved") continue;
        assert.equal(entry.displayName.value, `皮肤 ${entry.skinId}`, `skin ${entry.skinId} 没有原作实测名，须保留技术占位`);
    }
    // 701 的稀有度是原作实测 worth_level=3（传说/S），⛔ 改动前先回源。
    assert.equal(byId.get(701)?.rarity.value, 3);
    // 四款碎片皮肤门槛齐备，其余一律 unavailable。
    const craft = SNAKE_SKIN_BUSINESS_CATALOG.filter((e) => e.acquisition.value === "fragmentCraft");
    assert.deepEqual(craft.map((e) => [e.skinId, e.fragmentThreshold.value]), [[133, 300], [401, 10], [403, 120], [411, 300]]);
});

test("S3 收尾后外观写总闸开启；战斗读仍是确定性皮肤 1 回退", () => {
    // S3 收尾已翻开总闸（不变量 8 的锚点）；⛔ 改回 false 会让衣柜整条写路径 fail-closed。
    assert.equal(SNAKE_SKIN_COSMETIC_WRITES_ENABLED, true);
    assert.equal(canWriteSnakeSkinCosmetics(), true, "服务端单方面权威：无 peer 目录不构成拒绝理由");
    assert.equal(canWriteSnakeSkinCosmetics(PUBLIC_SNAKE_SKIN_CATALOG_HASH), true);
    assert.equal(canWriteSnakeSkinCosmetics("stale"), false, "显式传入且不一致仍须拒");
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

test("S3-1 放开的字段仍然 fail-closed：approved 空值、越界稀有度、门槛错配一律拒", () => {
    const clone = (): Array<Record<string, unknown>> => JSON.parse(JSON.stringify(SNAKE_SKIN_BUSINESS_CATALOG_DATA)) as Array<Record<string, unknown>>;
    const idx = (skinId: number): number => SNAKE_SKIN_BUSINESS_CATALOG.findIndex((e) => e.skinId === skinId);
    {   // ⛔ approved 但 value=null：不能靠「填了 state」蒙混过关
        const entries = clone();
        entries[0].rarity = { state: "approved", value: null };
        assert.throws(() => validateSnakeSkinBusinessCatalog(entries, PUBLIC_SNAKE_SKIN_CATALOG_HASH), /rarity must be an approved/);
    }
    {   // 原作只有 0..5 六档
        const entries = clone();
        entries[0].rarity = { state: "approved", value: 6 };
        assert.throws(() => validateSnakeSkinBusinessCatalog(entries, PUBLIC_SNAKE_SKIN_CATALOG_HASH), /rarity must be an approved/);
    }
    {   // 获取方式必须在 demo 枚举内
        const entries = clone();
        entries[0].acquisition = { state: "approved", value: "buy" };
        assert.throws(() => validateSnakeSkinBusinessCatalog(entries, PUBLIC_SNAKE_SKIN_CATALOG_HASH), /acquisition must be one of/);
    }
    {   // fragmentCraft 皮肤丢了门槛
        const entries = clone();
        entries[idx(401)].fragmentThreshold = { state: "unavailable", value: null };
        assert.throws(() => validateSnakeSkinBusinessCatalog(entries, PUBLIC_SNAKE_SKIN_CATALOG_HASH), /needs an approved positive threshold/);
    }
    {   // 非 fragmentCraft 皮肤不得带门槛
        const entries = clone();
        entries[idx(1)].fragmentThreshold = { state: "approved", value: 10 };
        assert.throws(() => validateSnakeSkinBusinessCatalog(entries, PUBLIC_SNAKE_SKIN_CATALOG_HASH), /must leave fragmentThreshold unavailable/);
    }
    {   // demo 期间不得开卖
        const entries = clone();
        entries[0].saleState = { state: "approved", value: "on-sale" };
        assert.throws(() => validateSnakeSkinBusinessCatalog(entries, PUBLIC_SNAKE_SKIN_CATALOG_HASH), /saleState must stay approved off-sale/);
    }
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
