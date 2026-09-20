import moment from 'moment'
import { TimeAdd } from './TimeAdd'
import { timestamp } from './common'

/**
 * 时间日期相关的方法
 */
export class UtilTime {

    /** 一分钟秒数 */
    static readonly MINUTE_SECOND = 60

    /** 一小时秒数 */
    static readonly HOUR_SECOND = 3600

    /** 一天秒数 */
    static readonly DAY_SECOND = this.HOUR_SECOND * 24

    /** 一周秒数 */
    static readonly WEEK_SECOND = this.DAY_SECOND * 7

    /** 周一的枚举  */
    static readonly WEEK_MONDAY_ENUM = 1

    /** 月1号 */
    static readonly WEEK_MONTY_START_ENUM = 1

    /**
     * 基于当前时间，获取下次重置的时间戳
     * @param resetHour 
     * @returns 
     */
    static getCurrentResetTime(resetHour: int = 0) {
        const time = timestamp()
        const now = moment.unix(time)
        let dateTime
        if (now.hours() < resetHour) {
            dateTime = now.startOf('day').set('hour', resetHour)
        } else {
            dateTime = now.startOf('day').add(1, 'days').set('hour', resetHour)
        }
        return dateTime.unix()
    }

    /**
     * 计算2个时间相差多少自然天，如昨天任意时间点到今天任意时间点为1天
     * TODO 要验证冬令时、夏令时的问题
     * @param startTime 
     * @param endTime 
     * @returns 
     */
    static dayDiffOfNature(startTime: int, endTime: int): int {
        const startDate = moment.unix(startTime).startOf('day')
        const endDate = moment.unix(endTime).startOf('day')
        return Math.abs(startDate.diff(endDate, 'day'))
    }

    /**
     * 获取指定时间戳的上一个指定小时 整点的时间戳，默认获取今天零点的时间戳
     * @param time 指定时间戳，默认为当前时间
     * @param resetHour 指定小时
     * @returns 
     */
    public static getDayStartTime(time: number = 0, resetHour: number = 0): number {
        if (!time) {
            time = timestamp()
        }
        const curHour = moment.unix(time).format('H')
        let datetime
        if (parseInt(curHour) < resetHour) {
            datetime = moment.unix(time).subtract(1, 'days').startOf('day').set('hour', resetHour)
        } else {
            datetime = moment.unix(time).startOf('day').set('hour', resetHour)
        }

        return datetime.unix()
    }

    /**
     * 获取下一天时间戳
     */
    public static nextDayTime(time: number = 0): number {
        if (!time) {
            time = timestamp()
        }
        return moment.unix(time).startOf('day').add(1, 'days').unix()
    }

    /**
     * 添加时间
     */
    public static addDays(add: int, time: number = 0): number {
        if (!time) {
            time = timestamp()
        }
        return moment.unix(time).add(add, 'days').unix()
    }

    /**
     * 计算当前是周几 （1-7 对应周一到周日）
     */
    public static getCurWeekDay(time: number = 0): number {
        if (!time) {
            time = timestamp()
        }
        const weekday = moment.unix(time).weekday()

        return weekday == 0 ? 7 : weekday
    }

    /**
     * 计算本周的周一、周二...的 0点 时间戳（需要考虑小时偏移的 在业务中自行处理）
     * @param getDay 
     * @param time 
     * @returns 
     */
    public static getWeekDayStartTime(getDay: int = 1, time: int = 0) {
        if (!time) {
            time = timestamp()
        }

        return moment.unix(time).startOf('week').add(getDay, 'days').unix()
    }

    /**
     * 下周的周几的时间
     * @param getDay 
     * @param time 
     * @returns 
     */
    public static getNextWeekDayStartTime(getDay: int = 1, time: int = 0) {
        if (!time) {
            time = timestamp()
        }
        return moment.unix(time).startOf('week').add(7 + getDay, 'days').unix()
    }

    /**
     * 计算当前是月几号
     * @param int $time 不传表示当前时间
     * @return int
     */
    public static getCurMonthDay(time: int = 0): int {
        if (!time) {
            time = timestamp()
        }
        return moment.unix(time).get('dates')
    }

    /**
     * 计算当前是几分 （0-59）
     * @param int $time 不传表示当前时间
     * @return int
     */
    public static getCurMinute(time: int = 0): int {
        if (!time) {
            time = timestamp()
        }
        return moment.unix(time).get('minutes')
    }

    /**
     * 计算当前是几点 （0-23）
     * @param time 
     * @returns 
     */
    public static getCurHour(time: int = 0) {
        if (!time) {
            time = timestamp()
        }
        return moment.unix(time).get('hours')
    }

    public static nextMonthTime(time: int = 0, resetHour: int = 0): int {
        if (!time) {
            time = timestamp()
        }

        const date = moment.unix(time)
        const nextMonthDate = date.clone().add(1, 'months').startOf('month').hour(resetHour)

        return nextMonthDate.unix()
    }

    public static nextYearTime(time: int = 0) {
        if (!time) {
            time = timestamp()
        }
        return moment.unix(time).add(1, 'years').startOf('year').unix()
    }

    /**
     * 获取指定时间戳的下一个指定小时 整点的时间戳，默认获取今天零点的时间戳
     */
    public static getNextHourTime(time: int = 0, resetHour: int = 0, contained: boolean = false) {
        if (!time) {
            time = timestamp()
        }
        const curHour = this.getCurHour(time)
        //如果包含当前，并且当前正好整点，返回当前时间戳
        if (contained && curHour == resetHour) {
            const hourTime = moment.unix(time).startOf('day').set('hour', resetHour).unix()
            if (time == hourTime) {
                return time
            }
        }
        let datetime
        if (curHour < resetHour) {
            datetime = moment.unix(time).startOf('day').set('hour', resetHour)
        } else {
            datetime = moment.unix(time).add(1, 'days').startOf('day').set('hour', resetHour)
        }
        return datetime.unix()
    }

    /**
     * 格式化时间[YYYY-MM-DD HH:mm:ss]
     */
    public static format(time: int = 0, formatStr: string ='YYYY-MM-DD HH:mm:ss') {
        if (!time) {
            time = timestamp()
        }
        return moment.unix(time).format(formatStr)
    }

    /**
     * 解析成时间戳
     */
    public static parse(timeStr: string, formatStr = 'YYYYMMDDHHmmss'): number {
        const momentObj = moment(timeStr, formatStr)
        return momentObj.unix()
    }

    /**
     * 格式化时间[YYYYMMDD]
     */
    public static formatYMD(time: int = 0) {
        if (!time) {
            time = timestamp()
        }
        return moment.unix(time).format('YYYYMMDD')
    }

    /**
     * 格式化时间[YYYYMMDDHHmmss]
     */
    public static formatYmdHis(time: int = 0) {
        if (!time) {
            time = timestamp()
        }
        return moment.unix(time).format('YYYYMMDDHHmmss')
    }

    /**
     * 解析成时间戳[YYYYMMDDHHmmss]
     */
    public static parseYmdHis(timeStr: string): number {
        const momentObj = moment(timeStr, 'YYYYMMDDHHmmss')
        return momentObj.unix()
    }

    /**
     * 获取区服时间偏移
     * @param int $sId
     * @return int
     */
    public static getTimeAdd(): number {
        if (!ADJUST_OPEN) {//非调试环境不允许 修改时间偏移
            return 0
        }
        return TimeAdd.getTimeAdd()
    }
}