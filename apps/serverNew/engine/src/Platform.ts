export const PLATFORM_BASE_NUM: int = 10000000000
export const SID_BASE_NUM: int = 1000000

/**
 * 通过用户id获取用户的区服
 * @param uId 
 * @returns 
 */
export function getServerIdByUid(uId: int): int {
    const mod = uId % PLATFORM_BASE_NUM
    return Math.trunc(mod / SID_BASE_NUM)
}

/**
 * 平台线路相关
 */
export class PlatformLineInfo {

    /** 平台分配的id，平台的正式环境与平台的其他环境通过不同段来划分 */
    static platformIdMap: { [platfor: string]: int } = {}

    static register(ids: { [platfor: string]: int }) {
        this.platformIdMap = ids
    }

    /**
     * 判断uid是否为区服玩家编号
     * @param uId 
     * @returns 
     */
    static isUser(uId: int) {
        return uId > PLATFORM_BASE_NUM
    }

    /**
     * 判断uid是否为区服玩家编号
     * @param uid 
     * @returns 
     */
    static isNPC(uId: int) {
        return uId < PLATFORM_BASE_NUM
    }

    /**
     * 获取平台的基础值
     * @returns 
     */
    static getPlatformBaseNum() {
        if (!this.platformIdMap[PLATFORM]) {
            throw new Error('no server platform id!')
        }
        return this.platformIdMap[PLATFORM] * PLATFORM_BASE_NUM
    }
}
