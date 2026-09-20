import moment, { Moment } from 'moment'

class Time<P extends Date | string | number> {
    protected _addTime: number

    constructor(addTime: number) {
        this._addTime = addTime
    }

    /**
     * 计算两个日期相差多少毫秒，date - startDate 相差时间
     * date 比 startDate 小，会返回负数
     * @param date
     * @param startDate 默认当前日期
     * @returns
     */
    diff(date: P, startDate: P = '' as P): number {
        startDate = (startDate ? startDate : this.now()) as P

        const start = moment(startDate)

        return moment(date).diff(start)
    }

    /**
     * 给定一个日期，算出该日期所在周的周一
     * @param date
     * @returns
     */
    getMonday(date: P): Moment {
        date = (date ? date : this.now()) as P
        return moment(date).startOf('W')
    }

    /**
     * 给定一个日期，算出该日期所在周的周日
     * @param date
     * @returns
     */
    getSunday(date: P): Moment {
        date = (date ? date : this.now()) as P
        return moment(date).endOf('W')
    }

    /**
     * 给定一个日期，算出该日期所在周的周日
     * @param date
     * @returns
     */
    getMonthFirstDay(date: P): Moment {
        date = (date ? date : this.now()) as P
        return moment(date).startOf('M')
    }

    /**
     * 给定一个日期，算出该日期所在周的周日
     * @param date
     * @returns
     */
    getMonthLastDay(date: P): Moment {
        date = (date ? date : this.now()) as P
        return moment(date).endOf('M')
    }

    now() {
        // 获取当前时间
        const now = new Date()

        // 增加 n 毫秒秒
        return moment(new Date(now.getTime() + this._addTime))
    }
}
