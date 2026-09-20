import { TimesBean } from '../../user/bean/TimesBean'

/**
 * 场景通用的次数记录
 */
export class SceneTimeItem {
    /** 次数 */
    times = 0

    /** 上次记录的时间 */
    lastTime = 0

    // #region 对象转换

    /**
     * @param TimesItem|SceneTimeItem timesItem
     * @return void
     */
    toModel(timesItem: TimesBean) {
        this.times = timesItem.times
        this.lastTime = timesItem.lastTime
    }

    // #endregion
}
