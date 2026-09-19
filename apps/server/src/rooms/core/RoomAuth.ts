/**
 * 房间建连鉴权（MF3-B2 自 `GameRoom.onAuth` 抽出；docs/MMO.md §5.4 MF3）。固定六步 ⛔ 不得重排：
 *  ① join options exact 校验（多余键 / 畸形值 → BadRequest；sId / v / token 三个路径映射到可识别错误码）；
 *  ② 房型协议整数硬闸（注入常量：GameRoom = GAME_ROOM_PROTOCOL_VERSION，MF4 WorldRoom = WORLD_ROOM_PROTOCOL_VERSION；
 *     §4.8：各房型只比较自己的整数，⛔ LOBBY_PROTOCOL_VERSION 不参与）；
 *  ③ mode 已登记 → modeVersion 与 catalog 一致（§4.8 第三层，⛔ 不参与 core 信封闸）→ profile ∈ catalog[mode].profiles；
 *  ④ 区号规范化 → 进服区归属（docs/DUAL_MODE.md §4.3：sId ∉ 本组 GROUP_ZONES 即拒；缺省 / 空组放行）；
 *  ⑤ token：Colyseus 标准 auth token 是连接凭证的唯一权威来源，`options.token` 只为旧客户端保留、若存在必须逐字相等；
 *     token 是 WebPlatform 的不透明句柄，只做空值 / 契约长度防护，⛔ 不解析内部格式；
 *  ⑥ session verify：建连点 HTTP 回权威（strict，⛔ 快路径只比组缓存会让被封账号一直开新房），
 *     只有 WebPlatform 的 valid:false 才是玩家身份失败；超时 / 5xx / 服务密钥错误保持 INTERNAL，⛔ 不谎报成 token 过期。
 *
 * `assertEnvelope`（① + ②）同时供 onAuth 与 onCreate 使用——两处必须同口径（protocol-version-matrix 钉）。
 */
import {
    ErrorCode,
    GAME_ROOM_PROTOCOL_VERSION,
    GAMEPLAY_CATALOG,
    validateGameRoomJoinOptions,
    WireValidationError,
    type IGameRoomJoinOptions,
} from "@game/shared";
import { groupAdmitsZone, normalizeSId } from "../../core/infra/config";
import { safeSecretEqual } from "../../core/auth/session";
import { joinRefused, joinRefusedAuth, toErrCode } from "../../core/errors";
import { verifyAndCacheWebPlatformSession } from "../../platform/webPlatformClient";
import { gameModeRegistry } from "../GameMode";
import { modeDeclaresProfile } from "./RoomProfile";

/** onAuth 产出、只有 onJoin 才信的权威身份四元组。 */
export interface RoomAuthResult {
    userId: string;
    /** 已由 onAuth 规范化并用对应区会话验证过，onJoin 只信该值。 */
    sId: number;
    mode: string;
    /** onAuth 已验证 ∈ catalog[mode].profiles；onJoin 用它对房间实际 profile 双查（关 joinById 串 profile 洞）。 */
    profile: string;
}

export interface RoomAuthDeps {
    /** 本房型的协议整数（注入，⛔ 不在本类里写死任何一个房型的常量）。 */
    readonly protocolVersion: number;
    modeRegistered(mode: string): boolean;
    /** null = mode 不在 catalog（生产 registry mode 必在 catalog；仅注入式测试 mode 例外）。 */
    catalogModeVersion(mode: string): number | null;
    modeDeclaresProfile(mode: string, profile: string): boolean;
    /** 建连点权威校验；成功返回 uid。 */
    verifySession(token: string, sId: number): Promise<string>;
}

/**
 * per-mode 契约版本闸（§4.8 三层分工的第三层）：join 携带的 modeVersion 必须与本进程 catalog 一致，
 * 否则单玩法拒绝。⛔ 这不是 core 信封闸——协议整数的比较在 assertEnvelope，本函数不读 `v`。
 */
export function catalogModeVersion(mode: string): number | null {
    const entry = (GAMEPLAY_CATALOG as Readonly<Partial<Record<string, { readonly modeVersion: number }>>>)[mode];
    return entry ? entry.modeVersion : null;
}

/** 凭据 / ticket 的恒时逐字比较（creation ticket 落座核对用；实现见 core/auth/session）。 */
export const credentialMatches = safeSecretEqual;

export class RoomAuth {
    constructor(private readonly deps: RoomAuthDeps) {}

    /**
     * 版本预检：在完整 validator 之前保留旧客户端的版本判定结果（v5 新增必填字段缺失时仍给出
     * ProtocolMismatch 而不是含混的 BadRequest）。Proxy / getter 失败交给下方完整 validator 映射到 BadRequest。
     */
    private assertCompatibleProtocolVersion(options: unknown): void {
        let version: unknown = 1;
        try {
            if (options !== undefined) {
                if (options === null || typeof options !== "object" || Array.isArray(options)) return;
                const record = options as Record<string, unknown>;
                version = Object.prototype.hasOwnProperty.call(record, "v") ? record.v : 1;
                if (version === undefined) version = 1;
            }
        } catch {
            return;
        }
        if (typeof version === "number"
            && Number.isSafeInteger(version)
            && version >= 1
            && version <= 0xffff
            && version !== this.deps.protocolVersion) {
            throw joinRefused(ErrorCode.ProtocolMismatch);
        }
    }

    /** ①：完整 exact 校验（Colyseus 交来的是不可信 JSON；多余键不得静默改变准入语义）。 */
    validatedJoinOptions(options: IGameRoomJoinOptions | undefined): IGameRoomJoinOptions {
        this.assertCompatibleProtocolVersion(options);
        try {
            return validateGameRoomJoinOptions(options);
        } catch (error) {
            if (!(error instanceof WireValidationError)) throw error;
            if (error.path === "options.sId") {
                throw joinRefused(ErrorCode.WrongServer);
            }
            if (error.path === "options.v") {
                throw joinRefused(ErrorCode.ProtocolMismatch);
            }
            if (error.path === "options.token") {
                throw joinRefused(ErrorCode.TokenExpired, "auth");
            }
            throw joinRefused(ErrorCode.BadRequest);
        }
    }

    /** ① + ②：join 信封 = exact 校验 + 协议整数硬闸（缺省按 1 兼容首版客户端）；onAuth 与 onCreate 同口径。 */
    assertEnvelope(options: IGameRoomJoinOptions | undefined): IGameRoomJoinOptions {
        const joinOptions = this.validatedJoinOptions(options);
        // 服务端升协议后旧包 join 即拒——给出可识别错误码，而不是让旧客户端在 Schema 对不上的畸形状态里挂死。
        if ((joinOptions.v ?? 1) !== this.deps.protocolVersion) {
            throw joinRefused(ErrorCode.ProtocolMismatch); // ⚠ 业务码走 message（status 必须 200–599）
        }
        return joinOptions;
    }

    /** ①–⑥ 全序。`token` 是 Colyseus 转交的标准 auth token（不可信）。 */
    async authenticate(token: unknown, options: IGameRoomJoinOptions | undefined): Promise<RoomAuthResult> {
        const joinOptions = this.assertEnvelope(options);
        const requestedMode = joinOptions.mode;
        if (!this.deps.modeRegistered(requestedMode)) {
            throw joinRefused(ErrorCode.BadRequest);
        }
        // per-mode 契约版本（§4.8 第三层）：与 catalog 不一致 = 该玩法的旧客户端，单玩法拒绝。
        if (joinOptions.modeVersion !== this.deps.catalogModeVersion(requestedMode)) {
            throw joinRefused(ErrorCode.ProtocolMismatch);
        }
        // profile 硬闸（§4.4）：matchmaker filterBy 只影响撮合选择，admission 必须再次拒绝未知或不属该 mode 的 profile。
        if (!this.deps.modeDeclaresProfile(requestedMode, joinOptions.profile)) {
            throw joinRefused(ErrorCode.BadRequest);
        }
        const sId = normalizeSId(joinOptions.sId);
        if (sId === null) {
            throw joinRefused(ErrorCode.WrongServer);
        }
        // ⚠ groupAdmitsZone 必须看到原始 undefined：真区服组下缺 sId 仍应拒绝，不能被规范化的 0 绕过。
        if (!groupAdmitsZone(joinOptions.sId === undefined ? undefined : sId)) {
            throw joinRefused(ErrorCode.WrongServer);
        }
        const standardToken = typeof token === "string" ? token : "";
        if (standardToken.length < 1 || standardToken.length > 256
            || (joinOptions.token !== undefined && joinOptions.token !== standardToken)) {
            throw joinRefused(ErrorCode.TokenExpired, "auth");
        }
        try {
            // ⚠ 带区：token 只对签发它的那个区有效（M12e）。成本 = 每次进房一次远程 verify，不在 per-message 路径上。
            return {
                userId: await this.deps.verifySession(standardToken, sId),
                sId,
                mode: requestedMode,
                profile: joinOptions.profile,
            };
        } catch (e) {
            throw joinRefusedAuth(toErrCode(e));
        }
    }
}

export function createRoomAuth(deps: RoomAuthDeps): RoomAuth {
    return new RoomAuth(deps);
}

/** GameRoom 房型：协议整数 = GAME_ROOM_PROTOCOL_VERSION（protocol-version-matrix 钉此绑定）。 */
export const gameRoomAuth = createRoomAuth({
    protocolVersion: GAME_ROOM_PROTOCOL_VERSION,
    modeRegistered: (mode) => gameModeRegistry.has(mode),
    catalogModeVersion,
    modeDeclaresProfile,
    verifySession: verifyAndCacheWebPlatformSession,
});
