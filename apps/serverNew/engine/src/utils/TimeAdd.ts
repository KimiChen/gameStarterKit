// 时间偏移量相关
export class TimeAdd {

    static readonly TIME_ADD_KEY = '__timeAdd'

    // 单位是秒
    public static __time_add: int = 0

    static initTimeAdd(timeAdd: int = 0) {
        if (!ADJUST_OPEN && timeAdd !== 0) {
            throw new Error('非测试环境不能设置时间偏移量')
        }
        if (this.__time_add > timeAdd) {
            throw new Error('时间偏移量只能往大了设置不能缩小')
        }
        this.__time_add = timeAdd
    }

    static getTimeAdd() {
        return this.__time_add
    }

    /**
     * 设定时间偏移
     * @param addSecond 偏移量
     */
    static addTime(addSecond: int) {
        if (!ADJUST_OPEN) {
            throw new Error('非测试环境不能设置时间偏移量')
        }
        this.__time_add += addSecond
    }
}