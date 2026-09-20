import assert from "node:assert/strict";
import { test } from "node:test";
import {
    SGZZ_MAX_ALLIANCE_MEMBERS, SgzzAllianceRelation, SgzzAllianceRole,
    isSgzzAllianceAct, sgzzAllianceRefusal, sgzzAllianceRelation,
    validateSgzzAlliance, validateSgzzAllianceName, validateSgzzAllianceTag, validateSgzzMembership,
    type ISgzzAlliance,
} from "@game/shared/kits/sgzzmap/api/alliance/index";
import {
    validateSgzzAllianceReq, validateSgzzAllianceRes,
} from "@game/shared/protocol/lobbyRpc/domains/sgzzmap";
import { SgzzGridState, sgzzGridState, sgzzConnects, sgzzEmptyTile } from "@game/shared/kits/sgzzmap/api/territory/index";
import { sgzzCellOf } from "@game/shared/kits/sgzzmap/api/hexmap/index";

const ally: ISgzzAlliance = { allianceId: "a7", name: "青州军", tag: "青", leaderUid: "u-lead", members: 3 };

test("sgzzmap alliance: 名称与标签 fail-closed（⛔ 首尾空白不可伪装）", () => {
    assert.equal(validateSgzzAllianceName("青州军"), "青州军");
    assert.equal(validateSgzzAllianceTag("青"), "青");
    for (const bad of [" 青州军", "青州军 ", "", " ", "x".repeat(17)]) {
        assert.throws(() => validateSgzzAllianceName(bad), `必须拒：${JSON.stringify(bad)}`);
    }
    for (const bad of [" 青", "青 ", "", "xxxxx"]) {
        assert.throws(() => validateSgzzAllianceTag(bad), `必须拒：${JSON.stringify(bad)}`);
    }
    assert.doesNotThrow(() => validateSgzzAlliance(ally));
    assert.throws(() => validateSgzzAlliance({ ...ally, members: 0 }), "人数至少 1");
    assert.throws(() => validateSgzzAlliance({ ...ally, members: SGZZ_MAX_ALLIANCE_MEMBERS + 1 }));
    assert.throws(() => validateSgzzAlliance({ ...ally, extra: 1 }), "多余键必须拒");
    assert.doesNotThrow(() => validateSgzzMembership({ uid: "u1", allianceId: "a7", role: "leader" }));
    assert.throws(() => validateSgzzMembership({ uid: "u1", allianceId: "a7", role: "boss" }), "职位白名单");
});

test("sgzzmap alliance: 动作闸 —— 一人一盟、满员拒、盟主要等只剩自己才能退", () => {
    assert.equal(isSgzzAllianceAct("create"), true);
    assert.equal(isSgzzAllianceAct("kick"), false);

    const base = { currentAid: "", currentRole: SgzzAllianceRole.MEMBER, target: null as ISgzzAlliance | null };
    assert.equal(sgzzAllianceRefusal({ ...base, act: "create" }), null);
    assert.equal(sgzzAllianceRefusal({ ...base, act: "create", currentAid: "a1" }), "SGZZMAP_ALLIANCE_EXISTS");

    assert.equal(sgzzAllianceRefusal({ ...base, act: "join", target: ally }), null);
    assert.equal(sgzzAllianceRefusal({ ...base, act: "join", target: null }), "SGZZMAP_ALLIANCE_NOT_FOUND");
    assert.equal(sgzzAllianceRefusal({ ...base, act: "join", currentAid: "a1", target: ally }),
        "SGZZMAP_ALLIANCE_EXISTS", "已有盟不能再入");
    assert.equal(sgzzAllianceRefusal({
        ...base, act: "join", target: { ...ally, members: SGZZ_MAX_ALLIANCE_MEMBERS },
    }), "SGZZMAP_ALLIANCE_FULL");

    assert.equal(sgzzAllianceRefusal({ ...base, act: "leave" }), "SGZZMAP_ALLIANCE_NOT_MEMBER");
    assert.equal(sgzzAllianceRefusal({
        act: "leave", currentAid: "a7", currentRole: SgzzAllianceRole.MEMBER, target: ally,
    }), null, "普通成员随时可退");
    assert.equal(sgzzAllianceRefusal({
        act: "leave", currentAid: "a7", currentRole: SgzzAllianceRole.LEADER, target: ally,
    }), "SGZZMAP_ALLIANCE_LEADER_BUSY", "⚠ 盟主不能把同盟扔在没有盟主的状态");
    assert.equal(sgzzAllianceRefusal({
        act: "leave", currentAid: "a7", currentRole: SgzzAllianceRole.LEADER, target: { ...ally, members: 1 },
    }), null, "只剩自己时盟主可退（同盟随之解散）");
});

test("sgzzmap alliance: 关系判定 v1 只有 NONE/SELF/RIVAL —— ⛔ 没有外交就没有 FRIEND", () => {
    assert.equal(sgzzAllianceRelation("a1", ""), SgzzAllianceRelation.NONE);
    assert.equal(sgzzAllianceRelation("a1", "a1"), SgzzAllianceRelation.SELF);
    assert.equal(sgzzAllianceRelation("a1", "a2"), SgzzAllianceRelation.RIVAL);
    assert.equal(sgzzAllianceRelation("", "a2"), SgzzAllianceRelation.RIVAL);
    const produced = new Set([
        sgzzAllianceRelation("a1", ""), sgzzAllianceRelation("a1", "a1"),
        sgzzAllianceRelation("a1", "a2"), sgzzAllianceRelation("", ""), sgzzAllianceRelation("", "a1"),
    ]);
    assert.ok(!produced.has(SgzzAllianceRelation.FRIEND), "FRIEND 在 v1 必须构造不出来");
});

test("sgzzmap alliance: 接上同盟后 UNION / GANG_MASTER 真的可达，且能连地", () => {
    const cell = sgzzCellOf(700, 700);
    const me = { uid: "u-me", aid: "a7", leaderUid: "u-lead", friendAids: [] as string[] };
    const mate = { ...sgzzEmptyTile(cell), ownerUid: "u-mate", ownerAid: "a7", durability: 2 };
    const lead = { ...sgzzEmptyTile(cell), ownerUid: "u-lead", ownerAid: "a7", durability: 2 };
    const foe = { ...sgzzEmptyTile(cell), ownerUid: "u-foe", ownerAid: "a9", durability: 2 };

    assert.equal(sgzzGridState(mate, me), SgzzGridState.UNION);
    assert.equal(sgzzGridState(lead, me), SgzzGridState.GANG_MASTER);
    assert.equal(sgzzGridState(foe, me), SgzzGridState.RIVAL);
    assert.equal(sgzzConnects(mate, me), true, "盟友的地可连");
    assert.equal(sgzzConnects(lead, me), true, "盟主的地可连");
    assert.equal(sgzzConnects(foe, me), false);

    // 退盟以后同一块地立刻变成 RIVAL —— 关系态是按观察者算的，不是烙在地块上的
    const loner = { ...me, aid: "", leaderUid: "" };
    assert.equal(sgzzGridState(mate, loner), SgzzGridState.RIVAL);
    assert.equal(sgzzConnects(mate, loner), false);
});

test("sgzzmap alliance: 线型校验 —— 每个动作只许带自己的字段，响应不许半截", () => {
    assert.deepEqual(validateSgzzAllianceReq({ clientReqId: "c", act: "create", name: "青州军", tag: "青" }),
        { clientReqId: "c", act: "create", name: "青州军", tag: "青" });
    assert.deepEqual(validateSgzzAllianceReq({ clientReqId: "c", act: "join", allianceId: "a7" }),
        { clientReqId: "c", act: "join", allianceId: "a7" });
    assert.deepEqual(validateSgzzAllianceReq({ clientReqId: "c", act: "leave" }),
        { clientReqId: "c", act: "leave" });
    const bad: [string, unknown][] = [
        ["create 带 allianceId", { clientReqId: "c", act: "create", name: "n", tag: "t", allianceId: "a7" }],
        ["create 缺 name", { clientReqId: "c", act: "create", tag: "t" }],
        ["join 带 name", { clientReqId: "c", act: "join", allianceId: "a7", name: "n" }],
        ["join 缺 allianceId", { clientReqId: "c", act: "join" }],
        ["leave 带字段", { clientReqId: "c", act: "leave", allianceId: "a7" }],
        ["act 非法", { clientReqId: "c", act: "kick" }],
        ["缺 clientReqId", { act: "leave" }],
    ];
    for (const [why, fixture] of bad) assert.throws(() => validateSgzzAllianceReq(fixture), `必须拒：${why}`);

    const m = { uid: "u1", allianceId: "a7", role: "leader" };
    assert.doesNotThrow(() => validateSgzzAllianceRes({ membership: m, alliance: ally }));
    assert.doesNotThrow(() => validateSgzzAllianceRes({ membership: null, alliance: null }));
    assert.throws(() => validateSgzzAllianceRes({ membership: m, alliance: null }), "⛔ 半截状态");
    assert.throws(() => validateSgzzAllianceRes({ membership: null, alliance: ally }), "⛔ 半截状态");
    assert.throws(() => validateSgzzAllianceRes({ membership: { ...m, allianceId: "aX" }, alliance: ally }),
        "membership 与 alliance 的 id 必须一致");
});
