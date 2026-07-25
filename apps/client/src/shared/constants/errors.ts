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
    /** 双端协议版本不匹配（join options.v ≠ 服务端 PROTOCOL_VERSION，见 protocol/rooms.ts） */
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
export const ErrorMessage: Record<number, string> = {
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
