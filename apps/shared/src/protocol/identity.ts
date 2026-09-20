/**
 * 资产主体与 persona 引用（docs/MMO.md §3「资产主体」/ §5 MF2-B1；零依赖，双端共享）。
 *
 *  - `AssetOwnerRef`：钱包 / 流水 / outbox 的主体——`account(uid)`（缺省；MF2 之前的全部存量）或
 *    `persona(personaId)`（MF2 起的角色级资产，persona 行在框架 `persona` 表）。SQL 列形态是
 *    `(owner_kind, owner_id)`：account = (0, "")，persona = (1, personaId)——0 / "" 让存量行无损并入（MMO.md §5 MF2）。
 *  - `PersonaRef`：跨端引用一个 persona；`controlEpoch` 是控制权世代（MF4 `assertControl` 的 CAS 谓词），可选。
 *  - 校验器与 protocol/rooms.ts 同一套零依赖 helper（WireValidationError，⛔ 不引入运行时依赖）。
 *
 * `personaId` 形状：base64url 字符集 16–64 位（框架 `tx.createPersona` 产出；DB `VARCHAR(64) ascii`）。
 */
import { assertExactKeys, boundedString, finiteInteger, isPlainRecord, WireValidationError } from "./http";

export type AssetOwnerRef =
    | { readonly kind: "account"; readonly uid: string }
    | { readonly kind: "persona"; readonly personaId: string };

export interface PersonaRef {
    readonly personaId: string;
    /** 控制权世代（MF4）：持有方在 CAS 谓词里用它证明自己仍是控制者；未拿到控制权时缺省。 */
    readonly controlEpoch?: number;
}

/** `owner_kind` 列取值（currency_ledger / user_currency / gameplay_outbox；0 = account 存量无损）。 */
export const ASSET_OWNER_KIND_ACCOUNT = 0;
export const ASSET_OWNER_KIND_PERSONA = 1;
export type AssetOwnerKind = typeof ASSET_OWNER_KIND_ACCOUNT | typeof ASSET_OWNER_KIND_PERSONA;

/** persona 槽位硬上限（MMO.md §11.2 冻结值 PERSONA_MAX_SLOTS_HARD）；产品上限归 kit，框架只保证唯一与硬上限。 */
export const PERSONA_MAX_SLOTS_HARD = 16;

const PERSONA_ID_SHAPE = /^[A-Za-z0-9_-]{16,64}$/;
const UID_SHAPE = /^[A-Za-z0-9_-]{1,32}$/;

export function validatePersonaId(value: unknown, path = "personaId"): string {
    const personaId = boundedString(value, path, 16, 64);
    if (!PERSONA_ID_SHAPE.test(personaId)) throw new WireValidationError("PERSONA_ID", path);
    return personaId;
}

function validateOwnerUid(value: unknown, path: string): string {
    const uid = boundedString(value, path, 1, 32);
    if (!UID_SHAPE.test(uid)) throw new WireValidationError("ASSET_OWNER_UID", path);
    return uid;
}

/** exact 校验：`{ kind: "account", uid }` 或 `{ kind: "persona", personaId }`，多余键 / 混搭一律拒。 */
export function validateAssetOwnerRef(input: unknown, path = "owner"): AssetOwnerRef {
    if (!isPlainRecord(input)) throw new WireValidationError("ASSET_OWNER", path);
    const kind = input.kind;
    if (kind === "account") {
        assertExactKeys(input, ["kind", "uid"], [], path);
        return { kind: "account", uid: validateOwnerUid(input.uid, `${path}.uid`) };
    }
    if (kind === "persona") {
        assertExactKeys(input, ["kind", "personaId"], [], path);
        return { kind: "persona", personaId: validatePersonaId(input.personaId, `${path}.personaId`) };
    }
    throw new WireValidationError("ASSET_OWNER_KIND", `${path}.kind`);
}

export function validatePersonaRef(input: unknown, path = "persona"): PersonaRef {
    if (!isPlainRecord(input)) throw new WireValidationError("PERSONA_REF", path);
    assertExactKeys(input, ["personaId"], ["controlEpoch"], path);
    const personaId = validatePersonaId(input.personaId, `${path}.personaId`);
    if (input.controlEpoch === undefined) return { personaId };
    const controlEpoch = finiteInteger(input.controlEpoch, `${path}.controlEpoch`, 0, Number.MAX_SAFE_INTEGER);
    return { personaId, controlEpoch };
}

export function accountOwner(uid: string): AssetOwnerRef {
    return { kind: "account", uid: validateOwnerUid(uid, "owner.uid") };
}

export function personaOwner(personaId: string): AssetOwnerRef {
    return { kind: "persona", personaId: validatePersonaId(personaId, "owner.personaId") };
}

/** SQL 列形态：account → (0, "")，persona → (1, personaId)。 */
export function assetOwnerColumns(owner: AssetOwnerRef): { readonly ownerKind: AssetOwnerKind; readonly ownerId: string } {
    return owner.kind === "account"
        ? { ownerKind: ASSET_OWNER_KIND_ACCOUNT, ownerId: "" }
        : { ownerKind: ASSET_OWNER_KIND_PERSONA, ownerId: owner.personaId };
}

/** 列形态 → 引用（读 ledger / 钱包行时用）；(0, 非空) / (1, "") / 未知 kind 一律拒。 */
export function assetOwnerFromColumns(uid: string, ownerKind: unknown, ownerId: unknown, path = "owner"): AssetOwnerRef {
    if (ownerKind === ASSET_OWNER_KIND_ACCOUNT || ownerKind === String(ASSET_OWNER_KIND_ACCOUNT)) {
        if (ownerId !== "" && ownerId !== null && ownerId !== undefined) throw new WireValidationError("ASSET_OWNER_COLUMNS", `${path}.ownerId`);
        return accountOwner(uid);
    }
    if (ownerKind === ASSET_OWNER_KIND_PERSONA || ownerKind === String(ASSET_OWNER_KIND_PERSONA)) {
        return personaOwner(validatePersonaId(ownerId, `${path}.ownerId`));
    }
    throw new WireValidationError("ASSET_OWNER_KIND", `${path}.ownerKind`);
}

/** 缓存 / 幂等命名空间用的稳定串：`account:<uid>` / `persona:<personaId>`（两族不可能相撞）。 */
export function assetOwnerKey(owner: AssetOwnerRef): string {
    return owner.kind === "account" ? `account:${owner.uid}` : `persona:${owner.personaId}`;
}

export function isSameAssetOwner(left: AssetOwnerRef, right: AssetOwnerRef): boolean {
    return assetOwnerKey(left) === assetOwnerKey(right);
}
