import { GuildDefine } from './GuildDefine'

export class GuildRoleDefine {
    /**基础权限*/
    static readonly ACTION_BASE = 1

    /**解散*/
    static readonly ACTION_DISSOLUTION = 1 << 1

    /**移除成员*/
    static readonly ACTION_KICK = 1 << 2

    /**审核*/
    static readonly ACTION_AUDIT = 1 << 3

    /**退出联盟*/
    static readonly ACTION_QUIT = 1 << 4

    /**修改公告*/
    static readonly ACTION_SET_NOTICE = 1 << 5

    /**任命*/
    static readonly ACTION_ASSIGN = 1 << 6

    /**移交帮主*/
    static readonly ACTION_TRANSFER = 1 << 7

    /**捐献*/
    static readonly ACTION_DONATE = 1 << 8

    /**妖盟阵法权限*/
    static readonly ACTION_MAGIC = 1 << 9

    /**捐献妖丹权限*/
    static readonly ACTION_DONATE_PILL = 1 << 10

    /**修改旗帜*/
    static readonly ACTION_SET_HEAD = 1 << 11

    /**修改名称*/
    static readonly ACTION_SET_NAME = 1 << 12

    /**修改名称*/
    static readonly ACTION_SET_OPEN = 1 << 13

    /**修改联系方式*/
    static readonly ACTION_SET_CONTACT = 1 << 14

    /**聊天置顶*/
    static readonly ACTION_CHAT_TOP = 1 << 15

    /**日常提醒*/
    static readonly ACTION_NOTICE = 1 << 16

    // 记录计算的权限
    static roleMap: Map<int, int> = new Map()

    /**
     * 获取角色权限
     * @param role
     * @returns
     */
    static getRolePower(role: int): int {
        if (this.roleMap.size == 0) {
            // 盟主权限，除了退出联盟以外的所有权限
            this.roleMap.set(
                GuildDefine.ROLE_LEADER,
                this.ACTION_BASE +
                    this.ACTION_DISSOLUTION +
                    this.ACTION_KICK +
                    this.ACTION_AUDIT +
                    this.ACTION_ASSIGN +
                    this.ACTION_TRANSFER +
                    this.ACTION_DONATE + // 捐献
                    this.ACTION_MAGIC + // 阵法
                    this.ACTION_DONATE_PILL + // 捐献妖丹
                    this.ACTION_SET_CONTACT + // 联系方式
                    this.ACTION_SET_NOTICE + // 改通知
                    this.ACTION_SET_NAME + // 改盟名称
                    this.ACTION_SET_HEAD + // 改旗帜
                    this.ACTION_SET_OPEN + // 开放方式
                    this.ACTION_NOTICE + // 日常提醒
                    this.ACTION_CHAT_TOP,
            )
            // 副盟主权限
            this.roleMap.set(
                GuildDefine.ROLE_DEPUTY_LEADER,
                this.ACTION_BASE + // 基础信息
                    this.ACTION_KICK + // 踢人
                    this.ACTION_ASSIGN + // 任免
                    this.ACTION_AUDIT + // 审核
                    this.ACTION_DONATE + // 捐献
                    this.ACTION_MAGIC + // 阵法
                    this.ACTION_DONATE_PILL + // 捐献妖丹
                    this.ACTION_QUIT + // 退出联盟
                    this.ACTION_SET_NOTICE + // 公告
                    this.ACTION_SET_HEAD + // 旗帜
                    this.ACTION_SET_OPEN + // 申请条件
                    this.ACTION_NOTICE + // 日常提醒
                    this.ACTION_CHAT_TOP,
            )
            // 长老权限
            this.roleMap.set(
                GuildDefine.ROLE_OLDER,
                this.ACTION_BASE + // 基础信息
                    this.ACTION_KICK + // 踢人
                    this.ACTION_AUDIT + // 审核
                    this.ACTION_DONATE + // 捐献
                    this.ACTION_SET_NOTICE +
                    this.ACTION_MAGIC + // 阵法
                    this.ACTION_DONATE_PILL + // 捐献妖丹
                    this.ACTION_QUIT, // 退出联盟
            )
            // 普通成员权限
            this.roleMap.set(
                GuildDefine.ROLE_MEMBER,
                this.ACTION_BASE + // 基础信息
                    this.ACTION_DONATE + // 捐献
                    this.ACTION_DONATE_PILL + // 捐献妖丹
                    this.ACTION_QUIT, // 退出联盟
            )
        }
        return this.roleMap.get(role) ?? 0
    }
}
