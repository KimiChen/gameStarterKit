import { GameError } from '@arthropoda/game-engine'

export class UserErrors {
    static readonly UserNoUid = new GameError(1005, '没传用户id')

    static readonly UserNoCoin = new GameError(1006, '传入的修改数值不正确')

    static readonly UserNoUser = new GameError(1007, '用户不存在')

    static readonly UserGcIsSmall = new GameError(1009, '元宝不足')

    static readonly UserLvIsSmall = new GameError(1010, '等级不足')

    static readonly UserScIsSmall = new GameError(1011, '银两不足')

    static readonly UserCashIsSmall = new GameError(1012, '货币不足')

    static readonly UserNumIsSmall = new GameError(1013, '道具不足')

    static readonly UserVipIsSmall = new GameError(1014, 'vip等级不足')

    static readonly UserNoTequan = new GameError(1015, '您的特权卡已过期')

    static readonly UserAlreadyGet = new GameError(1016, '您今天已领取')

    static readonly UserSensitiveWord = new GameError(1017, '输入文本中包含敏感词或屏蔽词')

    static readonly UserPlayerExpIsSmall = new GameError(1020, '政绩不足')

    static readonly UserMaxUserLevel = new GameError(1021, '超出最大等级')

    static readonly UserHUserError = new GameError(1028, '获取用户信息异常')

    static readonly UserNewUser = new GameError(1029, '新注册玩家限制')

    static readonly UserTooLong = new GameError(1031, '您的输入太长了')

    static readonly UserNationNameError = new GameError(1032, '名字存在敏感字符')

    static readonly UserNameSame = new GameError(1033, '昵称重复，请输入一个新的昵称')

    static readonly UserLvMax = new GameError(1035, '官品已达上限')

    static readonly UserLoginFail = new GameError(1036, '登录失败')

    static readonly UserHasAward = new GameError(1038, '已领取奖励')

    static readonly UserNoHead = new GameError(1039, '该头像已过期')

    static readonly UserNoHeadFrame = new GameError(1040, '该头像框已过期')

    static readonly UserNoLocationNum = new GameError(1041, '修改位置次数已达上限')

    static readonly UserInitIconNotExist = new GameError(1042, '创建角色只能选取默认头像')

    static readonly UserNoTitle = new GameError(1043, '该称号已过期')

    static readonly UserNoFashion = new GameError(1044, '该时装已过期')

    static readonly UserNoChatFrame = new GameError(1045, '该聊天气泡已过期')

    static readonly UserFashionSexNotFit = new GameError(1046, '时装性别不匹配')

    static readonly UserClientDataLen = new GameError(1047, '客户端数据长度超过')

    static readonly UserNoRace = new GameError(1048, '玩家种族不存在')

    static readonly UserNoLv = new GameError(1056, '官品等级不足')

    static readonly UserNoEmpty = new GameError(1057, '输入的编号或昵称不能为空')

    static readonly UserSearchNoUser = new GameError(1059, '输入的玩家名称或编号不存在')

    static readonly UserNameNotModify = new GameError(1060, '昵称未修改')

    static readonly UserNoOnLine = new GameError(1061, '玩家没有在线')

    static readonly UserIllegalWord = new GameError(1062, '输入文本中包含非法字符')

    static readonly UserNoConditon = new GameError(1063, '突破条件不满足')

    static readonly UserAttrAddLimit = new GameError(1064, '自由属性加点已达上限')

    static readonly UserAttrPropLimit = new GameError(1065, '属性果使用已达上限')

    static readonly UserChangeNameCd = new GameError(1066, '改名冷却中')

    static readonly UserFpMethodNotExsit = new GameError(1067, '评分更新方法不存在')

    static readonly UserPositionErr = new GameError(1068, '捏脸部位错误')

    static readonly UserAdTimes = new GameError(1069, '观看次数不足')

    static readonly UserAdCding = new GameError(1070, '观看冷却中')

    static readonly UserNoAdConditon = new GameError(1071, '观看条件不足')

    static readonly SignRepeatSign = new GameError(13001, '已签到领奖')

    static readonly MagicNoHave = new GameError(20001, '未拥有该神通')
}
