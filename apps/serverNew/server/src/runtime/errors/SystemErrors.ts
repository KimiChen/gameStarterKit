import { GameError } from '@arthropoda/game-engine'

export class SystemErrors {
    static readonly ProtectSign = new GameError(1, '签名出错')

    static readonly ProtectRequest = new GameError(2, '您尝试次数过多，请稍后重试')

    static readonly ProtectClientIdError = new GameError(3, '您在不同的设备同时登录了，请重新登录')

    static readonly ProtectClientIdNotExist = new GameError(4, '请重新登录')

    static readonly ProtectClientNeedDownload = new GameError(5, '有新版本更新咯，您可以退出游戏，重新进入')

    static readonly ProtectClientNeedUpdate = new GameError(6, '您的版本不是最新版本')

    static readonly ProtectMaintenance = new GameError(7, '您好，目前正在例行维护中')

    static readonly ProtectUserBlock = new GameError(9, '您已被禁止进入')

    static readonly ProtectActionException = new GameError(10, '请求响应异常，请联系客服')

    static readonly ProtectModuleForbid = new GameError(11, '您该项功能已被封禁')

    static readonly ProtectModuleOff = new GameError(12, '该项功能暂未开启')

    static readonly ProtectClosedCreateRole = new GameError(13, '当前服务器已爆满，正在排队中…')

    static readonly ProtectNoMaintain = new GameError(14, '游戏更新中，请稍后重试')

    static readonly ProtectRequestError = new GameError(15, '请求错误，请稍后重试')

    static readonly InvalidIp = new GameError(16, '请求ip不在白名单')

    static readonly ApiCallQueueTimeout = new GameError(17, '当前服务器繁忙,业务排队执行超时')

    static readonly RuntimeError = new GameError(18, '运行错误')

    static readonly ForbidLoginForbid = new GameError(101, '您已被限制登录，如有疑问请联系客服')

    static readonly ForbidLoginForbidTime = new GameError(102, '您已被限制登录！如有疑问请联系客服')

    static readonly ForbidChatForbid = new GameError(103, '您已被永久禁言！如有疑问请联系客服')

    static readonly ForbidChatForbidTime = new GameError(104, '您已被禁言！如有疑问请联系客服')

    static readonly ForbidGcForbid = new GameError(105, '您的元宝出现异常，请联系客服！')

    static readonly ForbidGcForbidTime = new GameError(106, '您的元宝时间出现异常，请联系客服！')

    static readonly ForbidRenameForbid = new GameError(107, '您已被限制改名！如有疑问请联系客服')

    static readonly ForbidRenameForbidTime = new GameError(108, '您已被限制改名！如有疑问请联系客服')

    static readonly ForbidScForbid = new GameError(109, '您的银两出现异常，请联系客服！')

    static readonly ForbidScForbidTime = new GameError(110, '您的银两时间出现异常，请联系客服！')

    static readonly ForbidSystem = new GameError(197, '系统异常，请联系客服！')

    static readonly ForbidSystemTime = new GameError(198, '系统异常，请联系客服！')

    static readonly ForbidBase = new GameError(199, '您该项功能被封禁')

    static readonly SysNoConf = new GameError(401, '读取配置错误')

    static readonly SysParamErr = new GameError(402, '参数错误')

    static readonly SysRequestError = new GameError(403, '请求出错')

    static readonly SysParamError = new GameError(404, '传入的参数不正确或为空')

    static readonly SysLockFail = new GameError(405, 'moddo lock fail')

    static readonly SysSaveFail = new GameError(406, '保存失败')

    static readonly SysGcErr = new GameError(407, '元宝数量异常')

    static readonly SysComponentErr = new GameError(408, '货币类型在玩家身上找不到映射')

    static readonly SysConfErr = new GameError(409, '配置数值异常')

    static readonly SysNotOpen = new GameError(410, '功能尚未开启')

    static readonly SysForbid = new GameError(411, '功能封禁')

    static readonly SysForbidDevice = new GameError(412, '设备不合法或者未在白名单中')

    static readonly SysTimesError = new GameError(413, '次数不足')

    static readonly SysServerBusy = new GameError(414, '过多玩家请sys_timesError求，稍后再试')

    static readonly SysInitFightResult = new GameError(415, '服务器启动消费战斗异常')

    static readonly SysModNameError = new GameError(416, 'Mod名称错误')
}
