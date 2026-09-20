import moment from 'moment'
import { millisecond, mt_rand, strtotime, timestamp } from '../../../src/utils/common'
import { UtilTime } from '../../../src/utils/UtilTime'
import { TimeAdd } from '../../../src/utils/TimeAdd'

function testTimes() {
    const time = UtilTime.getDayStartTime(undefined, 12)
    console.log(time)
}

function testRandom() {
    const min = 5
    const max = 10
    const res = new Map<int, int>()
    for (let i = 0; i < 10000; i++) {
        const ran = mt_rand(min, max)
        res.set(ran, (res.get(ran) ?? 0) + 1)
    }
    console.log(res)
}

function testWeek() {
    // console.log(UtilTime.getCurWeekDay())

    // console.log(UtilTime.getCurWeekDay(1700379224))

    // console.log(UtilTime.getCurWeekDay(1700465624))

    // 获取weekDaytime

    console.log(UtilTime.getWeekDayStartTime(6))
    console.log(UtilTime.getWeekDayStartTime(7))

    console.log(UtilTime.getWeekDayStartTime(3, 1700236800))

    console.log(UtilTime.getCurHour())
}

function testGetCurrentResetTime() {
    console.log('today:', UtilTime.getCurrentResetTime(20))
    console.log('next day:', UtilTime.getCurrentResetTime(10))
}
function testDayDiffOfNature() {
    const startDate1 = moment('2023-11-17 03:00:00')
    const endDate1 = moment('2023-11-18 02:00:00')
    console.log('diff1:', UtilTime.dayDiffOfNature(startDate1.unix(), endDate1.unix()))

    const startDate2 = moment('2023-11-17 05:00:00')
    const endDate2 = moment('2023-11-18 10:00:00')
    console.log('diff2:', UtilTime.dayDiffOfNature(startDate2.unix(), endDate2.unix()))

    const startDate3 = moment('2023-11-16 05:00:00')
    const endDate3 = moment('2023-11-18 10:00:00')
    console.log('diff3:', UtilTime.dayDiffOfNature(startDate3.unix(), endDate3.unix()))

    const startDate4 = moment('2023-09-29 05:00:00')
    const endDate4 = moment('2023-11-01 10:00:00')
    console.log('diff4:', UtilTime.dayDiffOfNature(startDate4.unix(), endDate4.unix()))
}

function testNextDayTime() {
    console.log('next day:', UtilTime.format(UtilTime.nextDayTime()))
    console.log('cur hours:', UtilTime.getCurHour())

    const nextMonthTime = UtilTime.nextMonthTime()
    console.log('nextMonthTime:', nextMonthTime, UtilTime.format(nextMonthTime))

    const nextYearTime = UtilTime.nextYearTime()
    console.log('nextYearTime:', nextYearTime, UtilTime.format(nextYearTime))
}

function testGetWeekDayStartTime() {
    console.log('weekday1:', UtilTime.format(UtilTime.getWeekDayStartTime(1)))
    console.log('weekday3:', UtilTime.format(UtilTime.getWeekDayStartTime(3)))
    console.log('weekday7:', UtilTime.format(UtilTime.getWeekDayStartTime(7)))

    const nextTime = timestamp() + 7 * 86400
    console.log('next weekday1:', UtilTime.format(UtilTime.getWeekDayStartTime(1, nextTime)))
    console.log('next weekday4:', UtilTime.format(UtilTime.getWeekDayStartTime(4, nextTime)))
    console.log('next weekday7:', UtilTime.format(UtilTime.getWeekDayStartTime(7, nextTime)))

    // 直接调用方法
    console.log('method, next weekday1:', UtilTime.format(UtilTime.getNextWeekDayStartTime(1)))
    console.log('method, next weekday4:', UtilTime.format(UtilTime.getNextWeekDayStartTime(4)))
    console.log('method, next weekday7:', UtilTime.format(UtilTime.getNextWeekDayStartTime(7)))
}

function testGetNextHourTime() {
    let nextHourTime = UtilTime.getNextHourTime()
    console.log('nextHourTime:', nextHourTime, UtilTime.format(nextHourTime))
    nextHourTime = UtilTime.getNextHourTime(0, 19)
    console.log('nextHourTime1:', nextHourTime, UtilTime.format(nextHourTime))
    nextHourTime = UtilTime.getNextHourTime(0, 9)
    console.log('nextHourTime2:', nextHourTime, UtilTime.format(nextHourTime))
}

function testZone() {
    process.env.TZ = 'America/New_York'
    console.log(UtilTime.format())

    // 冬令时
    const startDate = moment('2023-10-28 05:00:00')
    const endDate = moment('2023-10-29 10:00:00')
    console.log('diff:', UtilTime.dayDiffOfNature(startDate.unix(), endDate.unix()))

    const startDate2 = moment('2023-10-29 05:00:00')
    const endDate2 = moment('2023-10-30 10:00:00')
    console.log('diff2:', UtilTime.dayDiffOfNature(startDate2.unix(), endDate2.unix()))

    process.env.TZ = 'Asia/Shanghai'

    console.log(UtilTime.format())
}

function testTimeAdd() {

    global.ADJUST_OPEN = true

    TimeAdd.initTimeAdd(10)
    TimeAdd.addTime(5)

    console.log('now:', Date.now())
    console.log('timestamp:', timestamp())
    console.log('millisecond:', millisecond())

}

function testStrtotime() {
    const t1 = '2023-12-22'
    console.log(strtotime(t1))

    const t2 = '2023-12-22 12:29:13'
    console.log(strtotime(t2))

    const t3 = '20231222 12:29:13'
    console.log(strtotime(t3))

    const t4 = '1'
    console.log(strtotime(t4))

    const t5 = 'qqw'
    console.log(strtotime(t5))
}

function testgetCurMonthDay() {
    const d = UtilTime.getCurMonthDay()
    console.log(d)
    const d2 = UtilTime.getCurMinute()
    console.log(d2)
}

//testTimes()

//testZone()

testStrtotime()