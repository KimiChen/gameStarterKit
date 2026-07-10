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
};
