import { UtilObject, millisecond, timestamp } from '@arthropoda/game-engine'
import { GameAction } from '../../../runtime/action/GameAction'
import { FeatureAccess } from '../../../modules/user/access/FeatureAccess'
import { UserTextValidation } from '../../../modules/user/rules/UserTextValidation'
import { SystemErrors } from '../../../runtime/errors/SystemErrors'
import { ChatMessge } from '../../../runtime/protocol/C2S/commom'
import { EquipErrors } from '../../equip/EquipErrors'
import { FriendErrors } from '../../friend/FriendErrors'
import { ActionFriend } from '../../friend/action/ActionFriend'
import { UserForbidType } from '../../gm/rules/UserForbidType'
import { ModuleOpenType } from '../../user/access/ModuleOpenType'
import { UserProfileFormatter } from '../../user/action/UserProfileFormatter'
import { UserTempStore } from '../../user/action/UserTempStore'
import { User } from '../../user/bean/User'
import { UserTempBean } from '../../user/bean/UserTempBean'
import { ChatErrors } from '../ChatErrors'
import { ChatRecord } from '../persistence/ChatRecord'
import { ChatDefine } from '../rules/ChatDefine'
import { ChatMessageKeys } from '../messaging/ChatMessageKeys'

interface IChatConf {
    /** 上次聊天时间缓存key */
    timeField: keyof UserTempBean
    /** 聊天数据缓存key */
    cacheKey: string
    /** 是否普通聊天类型 */
    isCom: boolean
}

interface IChatShareParam {
    /** 分享消息的类型 */
    shareType: int
    /** 额外参数 */
    params: string
    /** msgType == 4 时的分享的id 或者 msgType == 3 系统消息id */
    paramId: int
    /** 过期时间 */
    expiredTime: int
    /** 分享内容 */
    shareContent: string
}

interface IChatCrossParam {
    modelId: int
    activityName: string
}

/**
 * 聊天模块
 */
export class ActionChat extends GameAction {
    /** 分享类型时间限制 */
    static readonly SHARE_TIME_LIMIT_FIELD_MAP: { [key: int]: keyof UserTempBean } = {}

    /** 聊天配置 世界、妖盟、陌生人聊天间隔公用 */
    static readonly CHAT_CONF: { [key: int]: IChatConf } = {
        [ChatDefine.CHAT_TYPE_WORLD]: {
            timeField: 'chatTime',
            cacheKey: ChatMessageKeys.CHAT_WORLD_KEY,
            isCom: true,
        },
        [ChatDefine.CHAT_TYPE_GUILD]: {
            timeField: 'guildChatTime',
            cacheKey: ChatMessageKeys.CHAT_GUILD_KEY,
            isCom: true,
        },
        [ChatDefine.CHAT_TYPE_CROSS_ACTIVITY]: {
            timeField: 'crossChatTime',
            cacheKey: ChatMessageKeys.CHAT_CROSS_ACTIVITY_KEY,
            isCom: false,
        },
        [ChatDefine.CHAT_TYPE_FRIEND]: {
            timeField: 'chatTime',
            cacheKey: ChatMessageKeys.CHAT_FRIEND_KEY,
            isCom: true,
        },
        [ChatDefine.CHAT_TYPE_SYSTEM]: {
            timeField: 'chatTime', //系统消息无用
            cacheKey: ChatMessageKeys.CHAT_SYSTEM_KEY,
            isCom: true,
        },
    }

    /**
     * 获取聊天列表
     * @param time 获取指定时间前的消息
     * @param cacheKey
     * @returns
     */
    static async getChatList(time: int, cacheKey: string) {
        const record = ChatRecord.load(cacheKey)
        const datas = await record.get(time > 0 ? -1 : 100)

        // 判断过期的消息
        const expiredTime = timestamp() - Param.ChatDay

        const chatList = []
        for (const message of datas) {
            if (message.time > expiredTime) {
                //未过期
                if (time > 0 && message.time >= time) {
                    continue
                }
                chatList.push(message)
                if (chatList.length > 100) {
                    //客户端要求不分批请求，一次性给100条
                    break
                }
                continue
            }
            await record.remove(message)
        }

        return chatList
    }

    /**
     * 删除某个玩家的聊天记录
     * @param uId
     * @param cacheKey
     * @returns
     */
    static async removeUserChat(uId: int, cacheKey: string) {
        const record = ChatRecord.load(cacheKey)
        const chatList = await record.get(-1)
        if (chatList.length == 0) {
            return
        }
        for (const chat of chatList) {
            if (chat.proId == uId) {
                await record.remove(chat)
            }
        }
    }

    /**
     * 添加系统消息，推送到世界聊天
     * @param list
     */
    static async addSystemMsg(serverId: int, list: ChatMessge[]) {
        const record = ChatRecord.load(ChatMessageKeys.CHAT_WORLD_KEY)
        for (const msg of list) {
            msg.type = ChatDefine.CHAT_TYPE_WORLD // 系统消息推送到世界聊天
            msg.time = millisecond()
            msg.msgType = ChatDefine.MSG_TYPE_SYSTEM
            await record.add(msg)
        }
        // 旧二进制推送已删除；原生 Lobby 领域推送待接入
    }

    /**
     * 检查是否被禁言
     * @param user
     * @returns
     */
    static checkForbid(user: User) {
        if (!FeatureAccess.checkUserForbid(user, UserForbidType.FORBID_CHAT)) {
            return
        }
        // 被禁言要返回禁言时间
        const forbidTime = user.refuse.get(UserForbidType.FORBID_CHAT)?.endTime ?? 0
        if (forbidTime == UserForbidType.FORBID_TIME) {
            throw SystemErrors.ForbidChatForbid
        }
        const minutes = Math.ceil((forbidTime - timestamp()) / 60)
        throw SystemErrors.ForbidChatForbidTime.params({ vars: { time: minutes } })
    }

    /**
     * 检查是否解锁
     * @param user
     */
    static checkLocked(user: User) {
        // 功能模块检测
        if (!FeatureAccess.check(user, ModuleOpenType.SYS_CHAT)) {
            throw ChatErrors.ChatLocked
        }
    }

    /**
     * 玩家发送聊天
     * @param serverId 区服ID
     * @param user 为null是系统分享的消息
     * @param chatType 聊天类型
     * @param msg 内容
     * @param emojiId 表情Id
     * @param msgType 类型
     * @param proId
     * @param p_Share  聊天分享数据
     * @param p_Cross 跨服数据
     * @param atIds
     */
    static async sendChat(
        user: User,
        chatType: int,
        msg: string,
        emojiId: int,
        msgType: int,
        proId: int = 0,
        atIds: number[] = [],
        p_Share: IChatShareParam = { shareType: 0, params: '', paramId: 0, expiredTime: 0, shareContent: '' },
        p_Cross: IChatCrossParam = { modelId: 0, activityName: '' },
    ) {
        // 判断功能是否解锁
        this.checkLocked(user)
        const uTemp = await UserTempStore.load(user)

        const time = timestamp()
        // 5s内只能发送一次消息 没有时间限制的 系统消息类型
        let isNoLimit = msgType == ChatDefine.MSG_TYPE_SYSTEM
        // 如果是陌生人，要加限制
        let isFriend = false
        if (chatType == ChatDefine.CHAT_TYPE_FRIEND) {
            isFriend = await ActionFriend.checkFriend(user.id, proId)
            isNoLimit = isFriend
            // 不是好友，对方未回复前，最多只能发送3条临时消息
            if (!isFriend) {
                if (!(await this.checkStrangerReply(user.id, proId))) {
                    throw ChatErrors.ChatStrangerNotReply
                }
                // 至多能给10个陌生人发消息
                await this.checkStrangerLimit(user.id, proId)
            }
        }

        // 聊天基本配置
        const chatConf = this.CHAT_CONF[chatType] ?? null
        if (chatConf == null) {
            throw ChatErrors.ChatTypeErr
        }

        // 聊天存储key
        let chatRecordKey = ''
        if (chatConf.isCom) {
            const uId = chatType == ChatDefine.CHAT_TYPE_FRIEND ? user?.id : 0
            chatRecordKey = this.getRecordKey(chatConf.cacheKey, proId, uId)
        } else if (chatType == ChatDefine.CHAT_TYPE_CROSS_ACTIVITY) {
            // 跨服聊天
            // const zoneId = CrossManager.getCrossZoneId(modelId, activityName);
            // if (!zoneId) {// 跨服尚未开始
            //     throw ChatErrors.CrossNotOpen
            // }
            // chatRecordKey = Chat.getCrossCacheKey(activityName, zoneId);
        }

        if (chatRecordKey == '') {
            throw ChatErrors.ChatTypeErr
        }

        // 获取上次发言或者分享缓存时间key
        const timeField = this.getTimeField(chatType, p_Share.shareType)
        if (timeField && !isNoLimit && uTemp != null) {
            // 发言间隔时间
            const lastSendTime = (UtilObject.getField(uTemp, timeField) as number) ?? 0
            if (chatType == ChatDefine.CHAT_TYPE_GUILD) {
                if (time - lastSendTime < Param.GuildChatInterval) {
                    throw ChatErrors.ChatTimeLimit.params({ vars: { interval: Param.GuildChatInterval } })
                }
            } else {
                if (time - lastSendTime < Param.ChatInterval) {
                    throw ChatErrors.ChatTimeLimit.params({ vars: { interval: Param.ChatInterval } })
                }
            }
        }

        // 玩家对玩家聊天检测
        if (chatType == ChatDefine.CHAT_TYPE_FRIEND) {
            if (!user || uTemp == null) {
                throw SystemErrors.SysParamError
            }
            await this.checkFriendChat(user, proId)
        }

        msg = decodeURIComponent(msg)

        // 字符长度检测
        if (user != null) {
            UserTextValidation.checkUtf8StringLenValid(msg, Param.ChatLength)
        }
        // 敏感词检测--系统消息不检测
        const filterMsg = msg
        if (msgType != ChatDefine.MSG_TYPE_SYSTEM) {
            // filterMsg = GameFilter.filterChar(msg)
        }

        const chatMsg: ChatMessge = {
            time: millisecond(),
            msg: filterMsg,
            emojiId: emojiId,
            type: chatType,
            msgType: msgType,
            proId: proId,
            shareType: p_Share.shareType,
            params: p_Share.params,
            paramId: p_Share.paramId,
            expiredTime: p_Share.expiredTime,
            shareContent: p_Share.shareType > 0 ? p_Share.shareContent : '',
            atIds: atIds.length > 0 ? atIds : [],
        }
        if (user) {
            //设置玩家信息
            chatMsg.uInfo = UserProfileFormatter.format(user).toModData() as any
        }

        const record = ChatRecord.load(chatRecordKey)
        await record.add(chatMsg)
        if (chatType == ChatDefine.CHAT_TYPE_FRIEND) {
            await record.expire(Param.ChatDay)
        }

        // 聊天监控，存入center，定时器定时保存到数据库
        // const log = {
        //     'from_id': user?.id ?? 0,
        //     'to_id': cm.proId,
        //     'message': cm.msg,
        //     'chat_type': cm.type,
        //     'msg_type': cm.msgType,
        //     'create_time': cm.time,
        //     's_id': user?.sId ?? 0,
        // }
        // GameLog.printModuleLog([log], 'chatLog');

        // 记录上次发言时间，用于判断下次是否5s内重复发言
        if (timeField && !isNoLimit && uTemp != undefined) {
            uTemp.getClassInfo().fieldMap[timeField].setVal(uTemp, time)
        }

        // 聊天消息推送
        switch (chatType) {
            case ChatDefine.CHAT_TYPE_SYSTEM:
            case ChatDefine.CHAT_TYPE_WORLD:
                {
                    // 旧二进制推送已删除；原生 Lobby 领域推送待接入
                }
                break
            case ChatDefine.CHAT_TYPE_GUILD: // 联盟聊天
                {
                    // 旧二进制推送已删除；原生 Lobby 领域推送待接入
                }
                break
            case ChatDefine.CHAT_TYPE_CROSS_ACTIVITY: // 跨服聊天
                {
                    // 旧二进制推送已删除；原生 Lobby 领域推送待接入
                    Log.info(`[${user.sId}区]跨服聊天(${p_Cross.activityName})待接入原生 Lobby`)
                }
                break
            case ChatDefine.CHAT_TYPE_FRIEND: // 添加最近的聊天记录
                {
                    await ActionFriend.addChatRecently(user.id, proId)
                    // 旧二进制推送已删除；原生 Lobby 领域推送待接入
                }
                break
        }
    }

    /**
     * 聊天分享
     * @param HUser|null user  为空是系统分享消息
     * @param int        shareType
     * @param int        chatType
     * @param array      ids
     * @param int        proId 聊天类型对应的proId
     * @param string     msg
     * @param array      atIds
     */
    static async chatShare(
        user: User,
        shareType: int,
        chatType: int,
        ids: number[] = [],
        proId = 0,
        msg = '',
        atIds: number[] = [],
    ) {
        const expiredTime = 0
        const params = ''
        let shareContent = ''
        // 去重
        ids = [...new Set(ids)]
        switch (shareType) {
            case ChatDefine.SHARE_TYPE_EQUIP: //装备分享
                {
                    const equips = []
                    for (const id of ids) {
                        const equip = user.equip.equipProps.get(id)
                        if (equip == null) {
                            throw EquipErrors.EquipNotExist
                        }
                        equips.push(equip?.toModData())
                    }
                    shareContent = JSON.stringify(equips)
                }
                break
            default: // 聊天分享类型错误
                throw SystemErrors.SysParamError
        }

        // 发送聊天分享消息
        await this.sendChat(
            user,
            chatType,
            msg,
            0,
            ChatDefine.MSG_TYPE_GENERAL,
            proId,
            atIds,
            { shareType: shareType, params: params, paramId: 0, expiredTime: expiredTime, shareContent: shareContent },
            { modelId: 0, activityName: '' },
        )
    }

    /**
     * 系统消息发送到各聊天频道
     * @param chatType
     * @param systemId
     * @param paramsArr
     * @param args
     */
    static async chatSystem(serverId: int, chatType: int, systemId: int, paramsArr = [], args = []) {
        const expiredTime = 0
        let proId = 0 // chatType == 2 时联盟ID
        const params = JSON.stringify(paramsArr)
        switch (chatType) {
            case ChatDefine.CHAT_TYPE_GUILD: // 联盟聊天
                proId = args[1]
                break
        }

        // 聊天基本配置
        const chatConf = this.CHAT_CONF[chatType] ?? null
        if (chatConf == null) {
            throw ChatErrors.ChatTypeErr
        }

        // 存储key
        const recordKey = this.getRecordKey(chatConf.cacheKey, proId, 0)

        const chatMsg: ChatMessge = {
            time: millisecond(),
            msg: '',
            emojiId: 0,
            type: chatType,
            msgType: ChatDefine.MSG_TYPE_SYSTEM,
            proId: proId,
            shareType: 0,
            params: params,
            paramId: systemId,
            expiredTime: expiredTime,
            shareContent: '',
            atIds: [],
        }
        const record = ChatRecord.load(recordKey)
        await record.add(chatMsg)

        //推送
        switch (chatType) {
            case ChatDefine.CHAT_TYPE_SYSTEM:
            case ChatDefine.CHAT_TYPE_WORLD:
                {
                    // 旧二进制推送已删除；原生 Lobby 领域推送待接入
                    Log.info(`[${serverId}区]系统/世界聊天待接入原生 Lobby`)
                }
                break
            case ChatDefine.CHAT_TYPE_GUILD: // 联盟聊天
                {
                    // 旧二进制推送已删除；原生 Lobby 领域推送待接入
                }
                break
            default:
                throw ChatErrors.ChatTypeErr
        }
    }

    /**
     * 获取聊天类型对应的proId
     * @param user
     * @param chatType
     * @param proId
     * @returns
     */
    static getProId(user: User, chatType: int, proId = 0): int {
        switch (chatType) {
            case ChatDefine.CHAT_TYPE_GUILD: // 联盟聊天
                {
                    proId = user.guild // 获取当前用户的联盟id
                    // 尚未加入联盟
                    if (!proId) {
                        throw SystemErrors.SysParamError
                    }
                }
                break
            case ChatDefine.CHAT_TYPE_FRIEND:
                {
                    if (proId <= 0) {
                        throw SystemErrors.SysParamError
                    }
                }
                break
        }
        return proId
    }

    /**
     * 获取redisKey
     * @param cacheKey
     * @param proId
     * @param uId
     * @returns
     */
    static getRecordKey(cacheKey: string, proId = 0, uId = 0) {
        let chatRecordKey = cacheKey
        if (uId > 0) {
            chatRecordKey = `${chatRecordKey}${Math.min(uId, proId)}_${Math.max(uId, proId)}`
        } else if (proId > 0) {
            chatRecordKey = `${chatRecordKey}${proId}`
        }
        return chatRecordKey
    }

    /**
     * 获取好友记录key
     * @param proId
     * @param uId
     * @returns
     */
    static getFriendRecordKey(proId: number, uId: number) {
        const cacheKey = ActionChat.CHAT_CONF[ChatDefine.CHAT_TYPE_FRIEND].cacheKey
        return this.getRecordKey(cacheKey, proId, uId)
    }

    /**
     * 获取跨服聊天的key
     * @param activityName
     * @param zoneId
     * @returns
     */
    static getCrossCacheKey(activityName: string, zoneId: int): string {
        return ChatMessageKeys.CHAT_CROSS_ACTIVITY_KEY + ':' + activityName + ':' + zoneId
    }

    /**
     * 获取上次发言或者分享缓存时间key
     * @param chatType
     * @param shareType
     * @returns
     */
    static getTimeField(chatType: int, shareType: int): keyof UserTempBean {
        let timeField = this.SHARE_TIME_LIMIT_FIELD_MAP[shareType]
        if (timeField == null) {
            timeField = this.CHAT_CONF[chatType].timeField
        }
        return timeField ?? 'chatTime'
    }

    /**
     * 好友聊天检测
     * @param user
     * @param targetId
     */
    static async checkFriendChat(user: User, targetId: int) {
        const uId = user.id
        // 检测是否是发给自己
        if (uId == targetId) {
            throw ChatErrors.ChatNotSelf
        }
        // 检测玩家是否存在
        const target = await User.load(targetId)
        if (target == undefined) {
            throw FriendErrors.FriendTargetNotExists
        }
        // 检测是否在黑名单
        if (await ActionFriend.checkBlack(uId, targetId)) {
            throw FriendErrors.FriendHadBlack
        }
        // 检测是否是对方黑名单
        if (await ActionFriend.checkBlack(targetId, uId)) {
            throw FriendErrors.FriendHadTargetBlack
        }
        // 对方聊天功能模块检测
        if (!FeatureAccess.check(target, ModuleOpenType.SYS_CHAT)) {
            throw FriendErrors.FriendTargetModuleOff
        }

        // 书信陌生人聊天功能开关
        if (!(await ActionFriend.checkFriend(uId, targetId))) {
            // 功能模块检测
            if (!FeatureAccess.check(user, ModuleOpenType.SYS_FRIEND)) {
                throw FriendErrors.FriendModuleOff
            }
            // 对方功能模块检测
            if (!FeatureAccess.check(target, ModuleOpenType.SYS_FRIEND)) {
                throw FriendErrors.FriendTargetModuleOff
            }
        }
    }

    /**
     * 检测at的目标id
     * @param uId
     * @param atIds
     * @returns
     */
    static checkAtIds(uId: number, atIds: number[]) {
        if (atIds.length == 0) {
            return
        }
        if (atIds.length > 10) {
            throw SystemErrors.SysParamError
        }
        if (atIds.includes(uId)) {
            throw ChatErrors.ChatNotAtSelf
        }
        if ([...new Set(atIds)].length != atIds.length) {
            throw SystemErrors.SysParamError
        }
    }

    /**
     * 最老的消息的时间
     * @param chatType
     * @returns
     */
    static async getOldestChatTime(chatType: int) {
        const cacheKey = ActionChat.CHAT_CONF[chatType].cacheKey
        const records = ChatRecord.load(ActionChat.getRecordKey(cacheKey))
        const chatList = await records.get(-1, -1)
        if (chatList.length == 0) {
            return 0
        }
        return chatList[0].time ?? 0
    }

    /**
     * 判断临时消息是否回复,对方未回复前，最多只能发送3条临时消息
     * @param uId
     * @param fId
     * @returns
     */
    static async checkStrangerReply(uId: int, fId: int) {
        const friendItem = await ActionFriend.load(uId)
        const recentlyItem = friendItem!.recently.get(fId) ?? null
        if (recentlyItem != null && recentlyItem.lastId == uId && recentlyItem.num >= Param.ChatStrangerNum) {
            return false
        }
        return true
    }

    /**
     * 最多可以给多少陌生人发送消息
     * @param uId
     * @param proId
     * @returns
     */
    static async checkStrangerLimit(uId: int, proId: int) {
        const meItem = await ActionFriend.load(uId)
        if (meItem == null) {
            return
        }
        if (meItem.recently.size() < Param.LetterStrangerLimit) {
            return
        }
        let strangerNum = 0
        for (const [fId] of meItem.recently) {
            if (!meItem.list.has(fId)) {
                strangerNum++
            }
        }
        if (!meItem.recently.has(proId)) {
            strangerNum++
        }
        if (strangerNum > Param.LetterStrangerLimit) {
            throw FriendErrors.FriendStrangerLimit
        }
    }
}
