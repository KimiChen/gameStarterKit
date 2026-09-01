/**
 * 错误码 —— 双端共享。
 * 0 为成功；1xxx 通用；2xxx 登录/账号；3xxx 房间/对局。
 */
export const ErrorCode = {
    Ok: 0,

    /** 未知错误 */
    Unknown: 1000,
    /** 参数非法 */
    BadRequest: 1001,

    /** 登录态失效 */
    TokenExpired: 2001,
    /** 登录失败 */
    LoginFailed: 2002,

    /** 房间已满 */
    RoomFull: 3001,
    /** 对局已开始，禁止加入 */
    GameAlreadyStarted: 3002,
    /** 技能不存在或未解锁 */
    SkillUnavailable: 3003,
    /** 双端协议版本不匹配（join options.v ≠ 服务端对应房型的协议整数：GameRoom 比 GAME_ROOM_PROTOCOL_VERSION、Lobby 比 LOBBY_PROTOCOL_VERSION，见 protocol/rooms.ts） */
    ProtocolMismatch: 3004,
    /** 目标区服不属于本进程/组（串服）或不可进入（维护/未开服）——进服硬闸拒连，客户端重新选服（docs/DUAL_MODE.md §4.3） */
    WrongServer: 3005,
    /** 建角失败（进区时角色注册/创建未成功，M12c D5）——可重试，客户端提示重进（docs/DUAL_MODE.md §2.7） */
    CharCreateFailed: 3006,
    /** 同一账号已在本对局房（禁占双座：证据里同 userId 出现两个名次会污染战绩） */
    AlreadyInRoom: 3007,
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/** 错误码对应的默认文案（客户端可覆盖为多语言） */
/** 穷尽映射：新增 ErrorCode 后若未登记文案，shared 类型检查会直接失败。 */
export const ErrorMessage: { [K in ErrorCodeType]: string } = {
    [ErrorCode.Ok]: "成功",
    [ErrorCode.Unknown]: "未知错误",
    [ErrorCode.BadRequest]: "参数非法",
    [ErrorCode.TokenExpired]: "登录已过期，请重新登录",
    [ErrorCode.LoginFailed]: "登录失败",
    [ErrorCode.RoomFull]: "房间已满",
    [ErrorCode.GameAlreadyStarted]: "对局已开始",
    [ErrorCode.SkillUnavailable]: "技能不可用",
    [ErrorCode.ProtocolMismatch]: "客户端版本过旧，请更新后再试",
    [ErrorCode.WrongServer]: "该区服不可进入，请重新选服",
    [ErrorCode.CharCreateFailed]: "进入失败，请重试",
    [ErrorCode.AlreadyInRoom]: "该账号已在本对局中",
};

export const ERROR_CODE_VALUES: readonly ErrorCodeType[] = Object.values(ErrorCode);

export function isErrorCode(value: unknown): value is ErrorCodeType {
    return typeof value === "number" && Number.isSafeInteger(value)
        && (ERROR_CODE_VALUES as readonly number[]).includes(value);
}

export function errorMessageOf(code: ErrorCodeType): string {
    return ErrorMessage[code];
}

// ── 房内 core control 错误域（Non-intrusive §4.7 三类错误域之二） ─────────────
//
// Ready/Start/owner/phase 等通用房间控制错误，经 `s2c.room.error` 下发。
// ⛔ 独立于上方 ErrorCode（§4.7 明令三域不合并为一个万能 enum）；数字段 31xx 专用，
// 与 3xxx 房间 join refusal 段不重叠。新增码必须同步 RoomControlErrorMessage（穷尽映射）。

export const RoomControlError = {
    /** Start 只能由当前 owner 发起 */
    NotOwner: 3101,
    /** 有成员未 Ready（精确 roster 必须全员 Ready） */
    NotAllReady: 3102,
    /** 人数低于该 mode 的 roster.min */
    BelowMin: 3103,
    /** Start 在途（starting 已置位 / 重试 fence 未收敛）：Ready/Unready/重复 Start 都以此拒绝 */
    StartInProgress: 3104,
    /** phase 已离开 Waiting（Ready/Start 只在 Waiting 合法） */
    AlreadyStarted: 3105,
    /** 有成员掉线且仍在重连宽限内（roster 必须全部在线才能 Start） */
    MemberOffline: 3106,
    /** owner-ready Start 失败并已回滚 Waiting：稳定可重试（⛔ 不移除房主、不触发 owner 转移） */
    StartFailed: 3107,
} as const;

export type RoomControlErrorType = (typeof RoomControlError)[keyof typeof RoomControlError];

/** 穷尽映射：新增 RoomControlError 后若未登记文案，shared 类型检查会直接失败。 */
export const RoomControlErrorMessage: { [K in RoomControlErrorType]: string } = {
    [RoomControlError.NotOwner]: "只有房主可以开始游戏",
    [RoomControlError.NotAllReady]: "还有成员未准备",
    [RoomControlError.BelowMin]: "人数不足，无法开始",
    [RoomControlError.StartInProgress]: "正在开局中，请稍候",
    [RoomControlError.AlreadyStarted]: "对局已开始",
    [RoomControlError.MemberOffline]: "有成员掉线，等待重连",
    [RoomControlError.StartFailed]: "开局失败，请重试",
};

export const ROOM_CONTROL_ERROR_VALUES: readonly RoomControlErrorType[] = Object.values(RoomControlError);

export function isRoomControlError(value: unknown): value is RoomControlErrorType {
    return typeof value === "number" && Number.isSafeInteger(value)
        && (ROOM_CONTROL_ERROR_VALUES as readonly number[]).includes(value);
}

// ── 进房/建连拒绝的 message 编码（双端单源） ──────────────────────────────
//
// ⚠ Colyseus 的 join 失败只给 `{code, error}` 两个字段，且 **code 会被当 HTTP status**
// （框架自身取值 520–526），业务码放不进去 ⇒ 约定：**业务码走 message**。
// 两种形态（都可由 `joinErrCodeOf` 判别）：
//   - 房间业务码：`"3004|客户端版本过旧，请更新后再试"`（码 + 文案，日志也可读）
//   - 鉴权失败：RPC 错误码字符串 `"AUTH_REQUIRED"` / `"ACCOUNT_BANNED"` / …（客户端按 code 分支）

/** join 失败 message → 房间业务码；非业务码形态（鉴权 RPC 码字符串）返回 null。 */
export function joinErrCodeOf(msg: string | undefined): number | null {
    const n = Number((msg ?? "").split("|")[0]);
    return Number.isFinite(n) && n !== 0 ? n : null;
}

/** join 失败 message → 可展示文案（业务码查表；鉴权码/未知一律回退通用文案）。 */
export function joinErrText(msg: string | undefined, fallback = "进入失败，请重试"): string {
    const code = joinErrCodeOf(msg);
    return (code !== null && isErrorCode(code) ? ErrorMessage[code] : undefined) ?? fallback;
}
