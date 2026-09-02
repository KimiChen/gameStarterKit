import { assertExactKeys, boundedString, finiteInteger, guardWire, isPlainRecord, type PlainRecord, WireValidationError } from "./http";

/**
 * 房间名定义 —— 双端共享。
 * 服务端 gameServer.define(RoomName.Game, ...) 与客户端 client.joinOrCreate(RoomName.Game)
 * 必须使用同一份常量，避免手写字符串不一致。
 */
export const RoomName = {
    /** 主玩法房间 */
    Game: "game",
    /** 网关大厅房（服务端框架 M5）：取数/排位/邮件走单一 rpc 消息通道（docs/SERVER.md §4 Lobby RPC） */
    Lobby: "lobby",
} as const;

export type RoomNameType = (typeof RoomName)[keyof typeof RoomName];

/** Starter 中已装配的玩法 mode id；作为 join/matchmaking wire 值的双端单源。 */
export const GameplayModeId = {
    BallMove: "ballMove",
    Idle: "idle",
    Snake: "snake",
} as const;

export type GameplayModeIdType = (typeof GameplayModeId)[keyof typeof GameplayModeId];

/**
 * 双端协议身份（Non-intrusive §4.8：两个人工判定的兼容整数）。房间 onAuth 以此挡
 * 「服务端已升协议、旧包还在跑」的旧客户端（灰度/热更混跑期的部署自检）；
 * HTTP /version 与 /healthz 同时报告两类身份供启动期探测。
 * Schema 字段增删、消息名/语义变更时对应整数 +1，双端随 sync:shared 同步。
 *
 * 分工（口径以 docs/Non-intrusive.md §4.8 为准）：
 *  - `GAME_ROOM_PROTOCOL_VERSION` = framework protocol version：管 join 信封与 core wire 兼容，
 *    GameRoom join 只比较它；per-mode 契约兼容由各玩法 manifest 的 `modeVersion` 承担。
 *  - `LOBBY_PROTOCOL_VERSION`：管 Lobby RPC 面（envelope/push/域路由）兼容，Lobby join 只比较它。
 *  - 仓库级 protocol fingerprint（scripts/protocol.fingerprint）只做字节审计锁，⛔ 不参与运行时
 *    join 判定。
 * wire 字段名仍是 `v`：两类房间各自携带并各自比较自己的整数。
 *
 * 版本流水（新版本在上；7 之前两整数同源于单一 PROTOCOL_VERSION）：
 *   8 = join envelope 必填化（§4.4/§9 阶段 8）：Game join options 的 `modeVersion` 与 `profile`
 *       变必填（`access`/`modeData` 仍可选、exactOptionalPropertyTypes 条件展开），并新增可选
 *       `modeData` 顶层字段（玩法自有参数，由对应玩法 exact-validate）。旧 v=7 客户端不带
 *       profile/modeVersion，⛔ 不做「缺省时随便匹配」的兼容——Game join 在版本闸明确拒绝
 *       （ProtocolMismatch）；Lobby join 与 LOBBY_PROTOCOL_VERSION 不受影响。
 *   7 = 身份拆分：`PROTOCOL_VERSION` 拆为 `GAME_ROOM_PROTOCOL_VERSION` 与 `LOBBY_PROTOCOL_VERSION`，
 *       两值起点都取 7——wire 字段 `v` 名与取值不变，旧客户端零破坏（拆分不是 bump）。
 *       同版：GameRoom state manifest 改为按 mode 选择 root Schema，并新增 idle 专用 `c2s.idle.pulse`；
 *       v6 客户端只理解单一 GameRoomState，不能参与异构 state patch 或 idle 结算，因此显式切断混跑。
 *   6 = `setField` 文本长度从 UTF-16 码元统一为 UTF-8 字节，并拒绝不成对代理项；v5 客户端按旧口径
 *       可能接受服务端现已拒绝的输入，因此在首次承担线上兼容义务前显式切断混跑。
 *   5 = join options 增加受校验的玩法 mode；同一 GameRoom 按 mode 隔离撮合并选择注册的 GameMode。
 *   4 = 删除未被服务端验证的可选 `listHash` join 字段；目录 hash 仍保留在 HTTP 响应中，但不伪装成进服闸。
 *   3 = WebPlatform 拆为独立 HTTP 服务：会话由外部 Public 契约签发，游戏服只做 Internal verify（提交 01fcbf5）。
 *   2 = M12e「会话按区」：单端语义作用域从账号收窄到 `(账号, 区)`。老包登录不带 `sId` ⇒ 拿到 s0 的 token，
 *       join `sId=1` 时 onAuth 去比 s1 的会话（不存在）⇒ 玩家看到「登录已过期」；bump 后旧包在 join 处
 *       被 `ProtocolMismatch` 明确拒掉（见 GameRoom.onAuth 注释）。
 *   1 = 首版。
 */
export const GAME_ROOM_PROTOCOL_VERSION = 8;
export const LOBBY_PROTOCOL_VERSION = 7;

/** 两类房间共享的 join options 字段。 */
export interface IRoomJoinOptions {
    /**
     * 协议版本：Game join 携带 GAME_ROOM_PROTOCOL_VERSION，Lobby join 携带
     * LOBBY_PROTOCOL_VERSION；服务端各自只比较自己的整数。缺省视为 1（首版客户端未带 v）。
     */
    v?: number;
    /** WebPlatform Public API 签发的不透明 access token；缺失或伪造一律拒绝。 */
    token?: string;
    /**
     * 目标区服 sId（区服形态）。服务端 onAuth 进服硬闸校验 `sId ∈ 本进程/组 GROUP_ZONES`，
     * 不属于本组即拒（防串服）。缺省 = 单形态 / 大混服 / legacy，服务端不做区归属闸。
     * 详见 docs/DUAL_MODE.md §4.3（进服硬闸）/ §5.1（M11）。sId=0 保留大混服池。
     */
    sId?: number;
}

/** Lobby 不分玩法；mode 对它是非法字段。 */
export interface ILobbyRoomJoinOptions extends IRoomJoinOptions {}

/** core 私房准入凭证（§4.4）：create 与 join purpose 不可互换，⛔ 禁止写入 state、日志或错误文本。 */
export interface IGameRoomAccess {
    readonly kind: "create" | "join";
    /** 不透明 ticket 串（服务端只存 sha256 记录；串本身不携带任何自描述声明，§6.8）。 */
    readonly ticket: string;
}

/** GameRoom 必须显式携带 mode，供 Colyseus 在 onAuth 前完成撮合隔离。 */
export interface IGameRoomJoinOptions extends IRoomJoinOptions {
    mode: string;
    /**
     * 该玩法 manifest 的契约版本（§4.8 第三层：per-mode 兼容判定）。v8 起必填；服务端
     * admission 对 catalog 的 modeVersion 不一致即拒（单玩法拒绝，⛔ 不参与 core 信封闸）。
     */
    modeVersion: number;
    /**
     * 房间组合 profile（§4.4）。v8 起必填（generated catalog 声明的组合 id，如 "default"/
     * "private"）；服务端 admission 在 matchmaker filter 之外再次拒绝未知或不属该 mode 的取值。
     */
    profile: string;
    /** 私房准入 ticket；普通撮合 join 不携带。 */
    access?: IGameRoomAccess;
    /** 玩法自有参数（§4.4）：core 只透传，由对应玩法 exact-validate；⛔ 不再向顶层加玩法专用字段。 */
    modeData?: unknown;
}

/**
 * Join options 的运行时校验。Colyseus 会把它们直接交给 onAuth，不能只依赖 TS
 * interface；未知字段、NaN/Infinity、越界区号及空 token 必须在进入连接流程前拒绝。
 */
function validateRoomJoinBase(value: PlainRecord): IRoomJoinOptions {
    const out: IRoomJoinOptions = {};
    if (Object.prototype.hasOwnProperty.call(value, "v") && value.v !== undefined) {
        out.v = finiteInteger(value.v, "options.v", 1, 0xffff);
    }
    if (Object.prototype.hasOwnProperty.call(value, "token") && value.token !== undefined) {
        out.token = boundedString(value.token, "options.token", 1, 256);
    }
    if (Object.prototype.hasOwnProperty.call(value, "sId") && value.sId !== undefined) {
        out.sId = finiteInteger(value.sId, "options.sId", 0, 0xffff);
    }
    return out;
}

function roomOptionsRecord(input: unknown): PlainRecord {
    if (input === undefined) return {};
    if (!isPlainRecord(input)) throw new WireValidationError("ROOM_OPTIONS_OBJECT", "options");
    return input as PlainRecord;
}

export function validateGameplayModeId(value: unknown, path = "options.mode"): string {
    const mode = boundedString(value, path, 1, 64);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(mode)) {
        throw new WireValidationError("ROOM_MODE", path);
    }
    return mode;
}

/** profile id 与 mode id 同一形状约束（generated catalog 的 profiles 成员，§4.4/§6.2）。 */
export function validateRoomProfileId(value: unknown, path = "options.profile"): string {
    const profile = boundedString(value, path, 1, 64);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(profile)) {
        throw new WireValidationError("ROOM_PROFILE", path);
    }
    return profile;
}

/** ticket 串的形状闸（base64url 字符集；权威校验在服务端 sha256 记录侧，§6.8）。 */
const ACCESS_TICKET_SHAPE = /^[A-Za-z0-9_-]{16,128}$/;

function validateGameRoomAccess(value: unknown, path = "options.access"): IGameRoomAccess {
    if (!isPlainRecord(value)) throw new WireValidationError("ROOM_ACCESS", path);
    assertExactKeys(value, ["kind", "ticket"], [], path);
    const kind = value.kind;
    if (kind !== "create" && kind !== "join") {
        throw new WireValidationError("ROOM_ACCESS_KIND", `${path}.kind`);
    }
    const ticket = boundedString(value.ticket, `${path}.ticket`, 16, 128);
    if (!ACCESS_TICKET_SHAPE.test(ticket)) {
        throw new WireValidationError("ROOM_ACCESS_TICKET", `${path}.ticket`);
    }
    return { kind, ticket };
}

/** Shared/common validator retained for callers that intentionally handle only base keys. */
export function validateRoomJoinOptions(input: unknown): IRoomJoinOptions {
    return validateLobbyRoomJoinOptions(input);
}

export function validateLobbyRoomJoinOptions(input: unknown): ILobbyRoomJoinOptions {
    return guardWire("options", () => {
        const value = roomOptionsRecord(input);
        assertExactKeys(value, [], ["v", "token", "sId"], "options");
        return validateRoomJoinBase(value);
    });
}

export function validateGameRoomJoinOptions(input: unknown): IGameRoomJoinOptions {
    return guardWire("options", () => {
        const value = roomOptionsRecord(input);
        assertExactKeys(value, ["mode", "modeVersion", "profile"], ["v", "token", "sId", "access", "modeData"], "options");
        const out: IGameRoomJoinOptions = {
            ...validateRoomJoinBase(value),
            mode: validateGameplayModeId(value.mode),
            // v8 必填（§4.4）：取值边界与 domains/room.ts 的 prepareCreate 同一口径。
            modeVersion: finiteInteger(value.modeVersion, "options.modeVersion", 1, 1_000_000),
            profile: validateRoomProfileId(value.profile),
        };
        // exactOptionalPropertyTypes：可选字段一律条件展开，⛔ 不得赋 undefined（§4.4）。
        if (Object.prototype.hasOwnProperty.call(value, "access") && value.access !== undefined) {
            out.access = validateGameRoomAccess(value.access);
        }
        // modeData 是玩法自有参数：core 只透传（形状/字段由对应玩法 exact-validate，§4.4）。
        if (Object.prototype.hasOwnProperty.call(value, "modeData") && value.modeData !== undefined) {
            out.modeData = value.modeData;
        }
        return out;
    });
}
