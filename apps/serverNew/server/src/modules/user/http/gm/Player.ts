import { GmAction } from '../../../gm/http/GmAction'

export abstract class Player extends GmAction {
    // 聊天类型
    static readonly CHAT_TYPE: RecordU<number, string> = {
        1: '世界聊天',
        2: '仙盟聊天',
        3: '跨服聊天',
    }

    static readonly MENU_MAP: any = {}

    /**
     * 获取查询类型
     */
    public static getLogType() {
        return this.MENU_MAP
    }

    public static getMethod(item: string, type: string, detail_type = '') {
        if (!this.MENU_MAP[item]?.data?.[type]) {
            return
        }
        if (!detail_type) {
            return this.MENU_MAP[item]?.data?.[type]?.class
        }
        if (this.MENU_MAP[item]?.data?.[type]?.data?.[detail_type]) {
            return this.MENU_MAP[item].data[type].data[detail_type].class
        }
        return
    }
}
