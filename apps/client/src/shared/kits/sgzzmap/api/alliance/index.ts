/**
 * sgzzmap alliance v1：最小同盟的零依赖单源。
 *
 * ⚠ 存在的理由是让 territory 面的 19 态 GRID_STATE 里的 UNION / GANG_MASTER 真正可达
 * —— 大地图「花花绿绿」的观感就来自这里。⛔ 不做外交、不做职位体系、不做仓库。
 */
import { assertExactKeys, boundedString, finiteInteger, WireValidationError } from "../../../../protocol/http";
import { rpcRecord as requireRecord } from "../../../../protocol/lobbyRpc/primitives";

export const SGZZ_MAX_ALLIANCE_MEMBERS = 50;
export const SGZZ_ALLIANCE_NAME_MIN = 1;
export const SGZZ_ALLIANCE_NAME_MAX = 16;
export const SGZZ_ALLIANCE_TAG_MIN = 1;
export const SGZZ_ALLIANCE_TAG_MAX = 4;

export const SgzzAllianceRole = { LEADER: "leader", MEMBER: "member" } as const;
export type SgzzAllianceRoleValue = (typeof SgzzAllianceRole)[keyof typeof SgzzAllianceRole];
const ROLES: readonly string[] = [SgzzAllianceRole.LEADER, SgzzAllianceRole.MEMBER];

/** 观察者与某个同盟的关系。v1 只有前三种：⛔ 没有外交就没有 FRIEND。 */
export const SgzzAllianceRelation = { NONE: 0, SELF: 1, RIVAL: 2, FRIEND: 3 } as const;
export type SgzzAllianceRelationValue = (typeof SgzzAllianceRelation)[keyof typeof SgzzAllianceRelation];

export interface ISgzzAlliance {
    readonly allianceId: string;
    readonly name: string;
    readonly tag: string;
    readonly leaderUid: string;
    readonly members: number;
}
export interface ISgzzMembership {
    readonly uid: string;
    readonly allianceId: string;
    readonly role: SgzzAllianceRoleValue;
}

export type SgzzAllianceAct = "create" | "join" | "leave";
const ACTS: readonly string[] = ["create", "join", "leave"];

export function isSgzzAllianceAct(value: unknown): value is SgzzAllianceAct {
    return typeof value === "string" && ACTS.indexOf(value) >= 0;
}

/** 盟名与标签：⛔ 不允许首尾空白（视觉上可伪装成别的盟）。 */
export function validateSgzzAllianceName(value: unknown, path = "payload.name"): string {
    const name = boundedString(value, path, SGZZ_ALLIANCE_NAME_MIN, SGZZ_ALLIANCE_NAME_MAX);
    if (name !== name.trim() || name.length === 0) throw new WireValidationError("SGZZMAP_ALLIANCE_NAME", path);
    return name;
}
export function validateSgzzAllianceTag(value: unknown, path = "payload.tag"): string {
    const tag = boundedString(value, path, SGZZ_ALLIANCE_TAG_MIN, SGZZ_ALLIANCE_TAG_MAX);
    if (tag !== tag.trim() || tag.length === 0) throw new WireValidationError("SGZZMAP_ALLIANCE_TAG", path);
    return tag;
}

export function validateSgzzAlliance(value: unknown, path = "alliance"): ISgzzAlliance {
    const r = requireRecord(value, path);
    assertExactKeys(r, ["allianceId", "name", "tag", "leaderUid", "members"], [], path);
    return {
        allianceId: boundedString(r.allianceId, `${path}.allianceId`, 1, 32),
        name: validateSgzzAllianceName(r.name, `${path}.name`),
        tag: validateSgzzAllianceTag(r.tag, `${path}.tag`),
        leaderUid: boundedString(r.leaderUid, `${path}.leaderUid`, 1, 32),
        members: finiteInteger(r.members, `${path}.members`, 1, SGZZ_MAX_ALLIANCE_MEMBERS),
    };
}
export function validateSgzzMembership(value: unknown, path = "membership"): ISgzzMembership {
    const r = requireRecord(value, path);
    assertExactKeys(r, ["uid", "allianceId", "role"], [], path);
    if (typeof r.role !== "string" || ROLES.indexOf(r.role) < 0) {
        throw new WireValidationError("SGZZMAP_ALLIANCE_ROLE", `${path}.role`);
    }
    return {
        uid: boundedString(r.uid, `${path}.uid`, 1, 32),
        allianceId: boundedString(r.allianceId, `${path}.allianceId`, 1, 32),
        role: r.role as SgzzAllianceRoleValue,
    };
}

/** 观察者对某盟的关系。v1 ⛔ 没有 FRIEND —— 没有外交系统就构造不出来。 */
export function sgzzAllianceRelation(viewerAid: string, targetAid: string): SgzzAllianceRelationValue {
    if (targetAid === "") return SgzzAllianceRelation.NONE;
    if (viewerAid !== "" && viewerAid === targetAid) return SgzzAllianceRelation.SELF;
    return SgzzAllianceRelation.RIVAL;
}

export type SgzzAllianceRefusal =
    | "SGZZMAP_ALLIANCE_EXISTS"
    | "SGZZMAP_ALLIANCE_NOT_FOUND"
    | "SGZZMAP_ALLIANCE_FULL"
    | "SGZZMAP_ALLIANCE_NOT_MEMBER"
    | "SGZZMAP_ALLIANCE_LEADER_BUSY";

export interface ISgzzAllianceCheck {
    readonly act: SgzzAllianceAct;
    /** 我当前的同盟，"" = 无盟。 */
    readonly currentAid: string;
    /** 我在当前同盟里的职位；无盟时忽略。 */
    readonly currentRole: SgzzAllianceRoleValue;
    /** join 的目标盟；不存在传 null。 */
    readonly target: ISgzzAlliance | null;
}

/**
 * 纯判定：可执行返回 null，否则返回拒绝码。
 * ⚠ 盟主只有在「盟里只剩自己」时才能退——否则同盟会没有盟主，GANG_MASTER 态就悬空了。
 * ⛔ v1 不做转让，退盟前请先把人踢光（本身也不做踢人 —— 最小同盟）。
 */
export function sgzzAllianceRefusal(check: ISgzzAllianceCheck): SgzzAllianceRefusal | null {
    if (check.act === "create") {
        return check.currentAid === "" ? null : "SGZZMAP_ALLIANCE_EXISTS";
    }
    if (check.act === "join") {
        if (check.currentAid !== "") return "SGZZMAP_ALLIANCE_EXISTS";
        if (!check.target) return "SGZZMAP_ALLIANCE_NOT_FOUND";
        return check.target.members >= SGZZ_MAX_ALLIANCE_MEMBERS ? "SGZZMAP_ALLIANCE_FULL" : null;
    }
    if (check.currentAid === "") return "SGZZMAP_ALLIANCE_NOT_MEMBER";
    if (check.currentRole === SgzzAllianceRole.LEADER && check.target && check.target.members > 1) {
        return "SGZZMAP_ALLIANCE_LEADER_BUSY";
    }
    return null;
}
