import assert from "node:assert/strict";
import { test } from "node:test";
import {
    SgzzGridState, SGZZ_GRID_STATE_MIN, SGZZ_GRID_STATE_MAX, SGZZ_V1_UNREACHABLE_STATES,
    SGZZ_COMMON_CONNECT_STATE, SGZZ_MAX_DURABILITY, SGZZ_MAX_TILES_PER_PLAYER,
    sgzzEmptyTile, validateSgzzTile, sgzzGridState, sgzzConnects,
    applySgzzTileAction, applySgzzTileAbandon, sgzzOccupyRefusal,
    type ISgzzTile, type ISgzzViewer, type SgzzGridStateValue,
} from "@game/shared/kits/sgzzmap/api/territory/index";
import { sgzzCellOf } from "@game/shared/kits/sgzzmap/api/hexmap/index";

const CELL = sgzzCellOf(700, 700);
const me: ISgzzViewer = { uid: "u-me", aid: "a-1", leaderUid: "u-lead", friendAids: [] };
const loner: ISgzzViewer = { uid: "u-me", aid: "", leaderUid: "", friendAids: [] };

function tile(over: Partial<ISgzzTile> = {}): ISgzzTile {
    return { ...sgzzEmptyTile(CELL), ...over };
}
function owned(uid: string, aid = "", over: Partial<ISgzzTile> = {}): ISgzzTile {
    return tile({ ownerUid: uid, ownerAid: aid, durability: 3, ...over });
}

test("sgzzmap territory: 19 态编号连续且唯一，⛔ 编号即线型不得重排", () => {
    const values = Object.values(SgzzGridState) as number[];
    assert.equal(values.length, 19);
    assert.equal(new Set(values).size, 19, "编号不得重复");
    assert.deepEqual([...values].sort((a, b) => a - b),
        Array.from({ length: 19 }, (_v, i) => i + 1), "必须是连续 1..19");
    assert.equal(SGZZ_GRID_STATE_MIN, 1);
    assert.equal(SGZZ_GRID_STATE_MAX, 19);
    // 钉死几个关键编号（对照 aoi_attr.lua GRID_STATE_LIST）
    assert.equal(SgzzGridState.UNDEFINE, 1);
    assert.equal(SgzzGridState.MY, 2);
    assert.equal(SgzzGridState.RIVAL, 3);
    assert.equal(SgzzGridState.UNION, 4);
    assert.equal(SgzzGridState.GANG_MASTER, 7);
    assert.equal(SgzzGridState.UNION_CAPTURE, 9);
    assert.equal(SgzzGridState.MY_ADDITION_LAND, 16);
});

test("sgzzmap territory: v1 可达集恰为不可达集的补集 —— 加系统必须同时改登记", () => {
    const all = Object.values(SgzzGridState) as SgzzGridStateValue[];
    const unreachable = new Set<number>(SGZZ_V1_UNREACHABLE_STATES);
    assert.equal(unreachable.size, SGZZ_V1_UNREACHABLE_STATES.length, "不可达集不得有重复");
    const expectedReachable = all.filter((s) => !unreachable.has(s)).sort((a, b) => a - b);

    // 穷举 v1 能构造出来的全部输入，收集实际可达的状态
    const produced = new Set<number>();
    const viewers: ISgzzViewer[] = [me, loner];
    const tiles: ISgzzTile[] = [
        tile(),                                            // 无主
        owned("u-me", "a-1"),                              // 我的
        owned("u-me", "a-1", { addition: true }),          // 我的扩张地
        owned("u-lead", "a-1"),                            // 我盟盟主的
        owned("u-mate", "a-1"),                            // 我盟成员的
        owned("u-foe", "a-2"),                             // 敌方（有盟）
        owned("u-foe", ""),                                // 敌方（无盟）
        tile({ capturingAid: "a-1" }),                     // 我盟正在攻占
        tile({ capturingAid: "a-2" }),                     // 别人正在攻占
    ];
    for (const v of viewers) for (const t of tiles) produced.add(sgzzGridState(t, v));
    assert.deepEqual([...produced].sort((a, b) => a - b), expectedReachable,
        "实际可达集必须与 SGZZ_V1_UNREACHABLE_STATES 的补集一致");
    for (const s of SGZZ_V1_UNREACHABLE_STATES) {
        assert.ok(!produced.has(s), `${s} 登记为 v1 不可达，却被构造出来了`);
    }
});

test("sgzzmap territory: 关系态按观察者解析 —— 同一格对不同人是不同状态", () => {
    const mateTile = owned("u-mate", "a-1");
    assert.equal(sgzzGridState(mateTile, me), SgzzGridState.UNION, "对同盟成员是 UNION");
    const outsider: ISgzzViewer = { uid: "u-x", aid: "a-9", leaderUid: "", friendAids: [] };
    assert.equal(sgzzGridState(mateTile, outsider), SgzzGridState.RIVAL, "对外人是 RIVAL");

    assert.equal(sgzzGridState(tile(), me), SgzzGridState.UNDEFINE);
    assert.equal(sgzzGridState(owned("u-me", "a-1"), me), SgzzGridState.MY);
    assert.equal(sgzzGridState(owned("u-me", "a-1", { addition: true }), me), SgzzGridState.MY_ADDITION_LAND);
    assert.equal(sgzzGridState(owned("u-lead", "a-1"), me), SgzzGridState.GANG_MASTER);
    assert.equal(sgzzGridState(owned("u-foe", "a-2"), me), SgzzGridState.RIVAL);
    // 攻占中优先于归属
    assert.equal(sgzzGridState(owned("u-foe", "a-2", { capturingAid: "a-1" }), me), SgzzGridState.UNION_CAPTURE);
    // 无盟观察者：盟内关系一律降级成 RIVAL
    assert.equal(sgzzGridState(owned("u-mate", "a-1"), loner), SgzzGridState.RIVAL);
    assert.equal(sgzzGridState(owned("u-me", ""), loner), SgzzGridState.MY, "自己的地不依赖同盟");
});

test("sgzzmap territory: 连地集 —— 友盟已落定的地⛔不连，正在攻占的才连", () => {
    for (const s of SGZZ_COMMON_CONNECT_STATE) {
        assert.ok(s >= 1 && s <= 19, "连地集只能装合法状态");
    }
    assert.ok(SGZZ_COMMON_CONNECT_STATE.has(SgzzGridState.MY));
    assert.ok(SGZZ_COMMON_CONNECT_STATE.has(SgzzGridState.MY_ADDITION_LAND), "扩张地也是我的地");
    assert.ok(SGZZ_COMMON_CONNECT_STATE.has(SgzzGridState.UNION));
    assert.ok(SGZZ_COMMON_CONNECT_STATE.has(SgzzGridState.GANG_MASTER), "盟主的地也是我盟的地");
    assert.ok(SGZZ_COMMON_CONNECT_STATE.has(SgzzGridState.UNION_CAPTURE));
    assert.ok(SGZZ_COMMON_CONNECT_STATE.has(SgzzGridState.FRIEND_UNION_CAPTURE));
    // ★ 这条不对称是规则本身：友盟的领土不延伸我的可及范围
    assert.ok(!SGZZ_COMMON_CONNECT_STATE.has(SgzzGridState.GANG_FRIEND),
        "友盟已落定的地⛔不得进连地集");
    assert.ok(!SGZZ_COMMON_CONNECT_STATE.has(SgzzGridState.RIVAL));
    assert.ok(!SGZZ_COMMON_CONNECT_STATE.has(SgzzGridState.UNDEFINE), "无主格自己不提供连地");

    assert.equal(sgzzConnects(owned("u-me", "a-1"), me), true);
    assert.equal(sgzzConnects(owned("u-mate", "a-1"), me), true);
    assert.equal(sgzzConnects(owned("u-foe", "a-2"), me), false);
    assert.equal(sgzzConnects(tile(), me), false);
});

test("sgzzmap territory: 占领结算 —— 打到零的当次即改主，⛔ 不留无主带守军的中间态", () => {
    // 无主 → 占领
    let r = applySgzzTileAction(tile(), me);
    assert.equal(r.outcome, "captured");
    assert.equal(r.tile.ownerUid, "u-me");
    assert.equal(r.tile.ownerAid, "a-1");
    assert.equal(r.tile.durability, 1);
    // 自己的 → 加固，且有上限
    r = applySgzzTileAction(owned("u-me", "a-1", { durability: 3 }), me);
    assert.equal(r.outcome, "reinforced");
    assert.equal(r.tile.durability, 4);
    r = applySgzzTileAction(owned("u-me", "a-1", { durability: SGZZ_MAX_DURABILITY }), me);
    assert.equal(r.tile.durability, SGZZ_MAX_DURABILITY, "加固不得越过上限");
    // 敌方守军 >1 → 削减
    r = applySgzzTileAction(owned("u-foe", "a-2", { durability: 2 }), me);
    assert.equal(r.outcome, "damaged");
    assert.equal(r.tile.ownerUid, "u-foe");
    assert.equal(r.tile.durability, 1);
    // 敌方守军 ==1 → 当次改主
    r = applySgzzTileAction(owned("u-foe", "a-2", { durability: 1 }), me);
    assert.equal(r.outcome, "captured");
    assert.equal(r.tile.ownerUid, "u-me");
    assert.equal(r.tile.durability, 1);
    assert.equal(r.tile.addition, false, "改主要清掉前主的扩张标记");
    assert.equal(r.tile.capturingAid, "", "改主要清掉攻占中标记");
    // 每一步产物都过得了线型校验（= 不会产生非法中间态）
    for (const start of [tile(), owned("u-foe", "a-2", { durability: 1 }), owned("u-me", "a-1")]) {
        assert.doesNotThrow(() => validateSgzzTile(applySgzzTileAction(start, me).tile));
    }
    assert.throws(() => applySgzzTileAction(tile(), { ...me, uid: "" }));
});

test("sgzzmap territory: 弃地只有地主能做，结果回到干净的无主格", () => {
    const t = applySgzzTileAbandon(owned("u-me", "a-1", { addition: true }), me);
    assert.deepEqual(t, sgzzEmptyTile(CELL));
    assert.doesNotThrow(() => validateSgzzTile(t));
    assert.throws(() => applySgzzTileAbandon(owned("u-foe", "a-2"), me), "非地主不得弃地");
});

test("sgzzmap territory: 占领闸 —— 出生豁免只给零地块玩家，其余一律要连地", () => {
    const base = { passable: true, heldTiles: 5, inSpawnRegion: false, target: tile(), neighbours: [] as ISgzzTile[] };
    assert.equal(sgzzOccupyRefusal({ ...base, passable: false }, me), "SGZZMAP_IMPASSABLE",
        "不可通行地形先于一切被拒");
    assert.equal(sgzzOccupyRefusal(base, me), "SGZZMAP_NOT_ADJACENT", "无连地邻居必须拒");
    assert.equal(sgzzOccupyRefusal({ ...base, neighbours: [owned("u-me", "a-1")] }, me), null);
    assert.equal(sgzzOccupyRefusal({ ...base, neighbours: [owned("u-mate", "a-1")] }, me), null, "盟友的地可连");
    assert.equal(sgzzOccupyRefusal({ ...base, neighbours: [owned("u-foe", "a-2")] }, me), "SGZZMAP_NOT_ADJACENT");

    // 出生豁免
    const fresh = { ...base, heldTiles: 0 };
    assert.equal(sgzzOccupyRefusal({ ...fresh, inSpawnRegion: true }, me), null);
    assert.equal(sgzzOccupyRefusal({ ...fresh, inSpawnRegion: false }, me), "SGZZMAP_NOT_ADJACENT",
        "出生区外不给豁免");
    assert.equal(sgzzOccupyRefusal({ ...fresh, inSpawnRegion: true, target: owned("u-foe") }, me),
        "SGZZMAP_NOT_ADJACENT", "出生豁免只落无主格");
    assert.equal(sgzzOccupyRefusal({ ...fresh, inSpawnRegion: true, neighbours: [owned("u-me", "a-1")] }, me),
        null, "零地块但有连地邻居也放行");

    // 上限：满了还能加固自己的地，⛔ 不能再扩
    const full = { ...base, heldTiles: SGZZ_MAX_TILES_PER_PLAYER, neighbours: [owned("u-me", "a-1")] };
    assert.equal(sgzzOccupyRefusal(full, me), "SGZZMAP_TILE_LIMIT");
    assert.equal(sgzzOccupyRefusal({ ...full, target: owned("u-me", "a-1") }, me), null, "满地时仍可加固自己的地");
});

test("sgzzmap territory: 地块线型校验 fail-closed", () => {
    assert.doesNotThrow(() => validateSgzzTile(tile()));
    assert.doesNotThrow(() => validateSgzzTile(owned("u-me", "a-1")));
    const bad: [string, unknown][] = [
        ["有主无守军", { ...owned("u-me", "a-1"), durability: 0 }],
        ["无主有守军", { ...tile(), durability: 2 }],
        ["无主带盟", { ...tile(), ownerAid: "a-1" }],
        ["无主带扩张标记", { ...tile(), addition: true }],
        ["守军越上限", { ...owned("u-me", "a-1"), durability: SGZZ_MAX_DURABILITY + 1 }],
        ["cell 越界", { ...tile(), cell: 15000000 }],
        ["addition 非布尔", { ...tile(), addition: 0 }],
        ["多余键", { ...tile(), extra: 1 }],
    ];
    for (const [why, fixture] of bad) {
        assert.throws(() => validateSgzzTile(fixture), `必须拒：${why}`);
    }
});

test("sgzzmap territory: ★ 加固自己的地不查邻居 —— 孤地也必须加得动", () => {
    // ⚠ 真机重放抓到的：只看六邻的话，一块四周都不是自己的**孤地**永远加固不了，
    //   「回领地 → 加固」一路被回 SGZZMAP_NOT_ADJACENT。目标本身就是我的领地，它天然连着。
    const lone = { passable: true, heldTiles: 1, inSpawnRegion: false,
                   target: owned("u-me", "a-1"), neighbours: [] as ISgzzTile[] };
    assert.equal(sgzzOccupyRefusal(lone, me), null, "四周无我方地也要能加固自己的地");
    assert.equal(sgzzOccupyRefusal({ ...lone, neighbours: [owned("u-foe", "a-2")] }, me), null,
        "四周全是敌地同样要能加固");
    assert.equal(applySgzzTileAction(lone.target, me).outcome, "reinforced");

    // ⛔ 豁免只对**自己的**地：盟友的地、敌人的地照旧要连地
    assert.equal(sgzzOccupyRefusal({ ...lone, target: owned("u-mate", "a-1") }, me), "SGZZMAP_NOT_ADJACENT");
    assert.equal(sgzzOccupyRefusal({ ...lone, target: owned("u-foe", "a-2") }, me), "SGZZMAP_NOT_ADJACENT");
    // ⛔ 不可通行仍然先于一切（自己的地本不该不可通行，但闸的次序要稳）
    assert.equal(sgzzOccupyRefusal({ ...lone, passable: false }, me), "SGZZMAP_IMPASSABLE");
});
