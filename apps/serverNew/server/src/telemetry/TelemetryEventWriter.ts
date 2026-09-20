import { FileConsumer } from './consumers/FileConsumer'
import { ThinkingDataAnalytics } from './consumers/ThinkingDataAnalytics'

/**
 * 数数统计
 * @uses
 * @version Id
 * @notice  属性强类型，属性类型不匹配会导致上报失败
 */
export class TelemetryEventWriter {
    public trackItems: { [eventName: string]: { [name: string]: any }[] } = {}

    public addProperties: { [accountId: string]: { [name: string]: any } } = {}

    public setProperties: { [accountId: string]: { [name: string]: any } } = {}

    public setOnceProperties: { [accountId: string]: { [name: string]: any } } = {}

    /**
     * 获取路径
     * @returns
     */
    public static logPath(): string {
        return ROOT_PATH + '/log/stat_ta'
    }

    /**
     * 判断是否开启
     * @returns
     */
    public static isEnabled(): boolean {
        return CP.platform.onOffs.staTaOpen === 'true'
    }

    /**
     * 批量上报同一玩家不同事件，多形式上报
     * @param user
     * @param trackItems
     * @param addProperties
     * @param setProperties
     * @param setOnceProperties
     * @param distinctId
     * @returns
     */
    public accountBatchTrack(
        accountId: string,
        publicProperties: { [key: string]: any },
        trackItems: { [key: string]: string[] },
        addProperties: string[] = [],
        setProperties: string[] = [],
        setOnceProperties: string[] = [],
        distinctId: string = '',
    ) {
        if (!TelemetryEventWriter.isEnabled()) {
            return false
        }

        if (
            Object.keys(trackItems).length == 0 &&
            addProperties.length == 0 &&
            setProperties.length == 0 &&
            setOnceProperties.length == 0
        ) {
            return false
        }

        try {
            const taHandler = new ThinkingDataAnalytics(new FileConsumer(TelemetryEventWriter.logPath()), true)
            // 玩家属性累加
            addProperties && taHandler.user_add(distinctId, accountId, addProperties)
            // 设置玩家属性，使用该接口上传的属性将会覆盖原有的属性值
            setProperties && taHandler.user_set(distinctId, accountId, setProperties)
            // 设置用户属性, 如果属性已经存在, 则操作无效.
            setOnceProperties && taHandler.user_setOnce(distinctId, accountId, setOnceProperties)
            // 上报事件
            trackItems && taHandler.register_public_properties(publicProperties)
            for (const eventName in trackItems) {
                const properties = trackItems[eventName]
                taHandler.track(distinctId, accountId, eventName, properties)
            }

            taHandler.flush()
            taHandler.close()
        } catch (e) {
            Log.error('数数上报', e)
            return false
        }

        return true
    }

    /**
     * 批量上报不同玩家不同事件
     * @param trackItems
     * @param publicProperties
     * @returns
     */
    public accountMultiEventTrack(trackItems: { [key: string]: any }, publicProperties: { [key: string]: any } = {}) {
        if (!TelemetryEventWriter.isEnabled()) {
            return true
        }

        if (Object.keys(trackItems).length == 0) {
            return false
        }

        try {
            const taHandler = new ThinkingDataAnalytics(new FileConsumer(TelemetryEventWriter.logPath()), true)
            publicProperties && taHandler.register_public_properties(publicProperties)

            for (const eventName in trackItems) {
                const propertiesArr = trackItems[eventName]

                for (const key in propertiesArr) {
                    const properties = propertiesArr[key]
                    if (properties['#account_id']) {
                        Log.error('数数上报#account_id为空:' + eventName + ' => ' + JSON.stringify(properties))
                        continue
                    }
                    try {
                        taHandler.track('', properties['#account_id'], eventName, properties)
                    } catch (e) {
                        Log.error('数数上报异常：' + eventName + ' => ' + JSON.stringify(properties), e)
                    }
                }
            }

            taHandler.flush()
            taHandler.close()
        } catch (e) {
            Log.error('数数上报', e)
            return true
        }

        return true
    }

    /**
     * 将缓存日志写到文件中
     * @returns
     */
    public flushLog() {
        if (!this.trackItems && !this.setProperties && !this.addProperties && !this.setOnceProperties) {
            return
        }

        if (!TelemetryEventWriter.isEnabled()) {
            this.clear()
            return
        }

        try {
            const taHandler = new ThinkingDataAnalytics(new FileConsumer(TelemetryEventWriter.logPath()), true)

            for (const uId in this.addProperties) {
                const property = this.addProperties[uId]
                if (!property) {
                    continue
                }
                taHandler.user_add('', uId, property)
            }
            for (const uId in this.setOnceProperties) {
                const property = this.setOnceProperties[uId]
                if (!property) {
                    continue
                }
                taHandler.user_setOnce('', uId, property)
            }
            for (const uId in this.setProperties) {
                const property = this.setProperties[uId]
                if (!property) {
                    continue
                }
                taHandler.user_set('', uId, property)
            }
            for (const eventName in this.trackItems) {
                const propertiesArr = this.trackItems[eventName]
                for (const key in propertiesArr) {
                    const properties = propertiesArr[key]
                    if (!properties['#account_id']) {
                        Log.error('数数上报#account_id为空:' + eventName + ' => ' + JSON.stringify(properties))
                        continue
                    }
                    try {
                        taHandler.track('', properties['#account_id'], eventName, properties)
                    } catch (e) {
                        Log.error('数数上报异常：' + eventName + ' => ' + JSON.stringify(properties), e)
                    }
                }
            }

            taHandler.flush()
            taHandler.close()
        } catch (e) {
            Log.error('数数上报', e, {
                setProperties: this.setProperties,
                addProperties: this.addProperties,
                setOnceProperties: this.setOnceProperties,
                trackItems: this.trackItems,
            })
        } finally {
            this.clear()
        }
    }

    /**
     * 清理缓存信息
     */
    public clear() {
        this.setProperties = {}
        this.addProperties = {}
        this.setOnceProperties = {}
        this.trackItems = {}
    }

    /**
     * 批量track事件，不同玩家多条同类型事件
     * @param eventName
     * @param trackItems
     * @param publicProperties
     * @returns
     */
    public batchMultiTrack(
        eventName: string,
        trackItems: { [key: string]: { [name: string]: any } },
        publicProperties: { [key: string]: any },
    ) {
        if (!TelemetryEventWriter.isEnabled()) {
            return false
        }

        if (Object.keys(trackItems).length == 0) {
            return false
        }

        try {
            const taHandler = new ThinkingDataAnalytics(new FileConsumer(TelemetryEventWriter.logPath()), true)
            publicProperties && taHandler.register_public_properties(publicProperties)
            for (const key in trackItems) {
                for (const key2 in trackItems[key]) {
                    taHandler.track('', key, eventName, trackItems[key2])
                }
            }
            taHandler.flush()
            taHandler.close()
        } catch (e) {
            Log.error('数数上报', e)
            return false
        }

        return true
    }

    /**
     * track事件
     * @param user
     * @param eventName
     * @param properties
     * @param distinctId
     * @returns
     */
    public track(
        accountId: string,
        eventName: string,
        properties: { [key: string]: any },
        publicProperties: { [key: string]: any } = {},
        distinctId: string = '',
    ) {
        if (!TelemetryEventWriter.isEnabled()) {
            return false
        }

        if (!eventName || Object.keys(properties).length == 0) {
            return false
        }

        try {
            const taHandler = new ThinkingDataAnalytics(new FileConsumer(TelemetryEventWriter.logPath()), true)
            taHandler.register_public_properties(publicProperties)
            taHandler.track(distinctId, accountId, eventName, properties)
            taHandler.flush()
            taHandler.close()
        } catch (e) {
            Log.error('数数上报', e)
            return false
        }

        return true
    }

    /**
     * 设置玩家属性，使用该接口上传的属性将会覆盖原有的属性值
     * @param accountId
     * @param properties
     * @param distinctId
     * @returns
     */
    public userSet(accountId: string, properties: { [key: string]: any }, distinctId: string = '') {
        if (!TelemetryEventWriter.isEnabled()) {
            return false
        }

        if (!distinctId && !accountId) {
            return false
        }

        if (Object.keys(properties).length == 0) {
            return false
        }

        try {
            const taHandler = new ThinkingDataAnalytics(new FileConsumer(TelemetryEventWriter.logPath()), true)
            taHandler.user_set(distinctId, accountId, properties)
            taHandler.flush()
            taHandler.close()
        } catch (e) {
            Log.error('数数上报', e)
            return false
        }

        return true
    }

    /**
     * 设置玩家属性，当该属性之前已经有值将会忽略
     * @param accountId
     * @param properties
     * @param distinctId
     * @returns
     */
    public userSetOnce(accountId: string, properties: { [key: string]: any }, distinctId: string = '') {
        if (!TelemetryEventWriter.isEnabled()) {
            return false
        }

        if (!distinctId && !accountId) {
            return false
        }

        if (Object.keys(properties).length == 0) {
            return false
        }

        try {
            const taHandler = new ThinkingDataAnalytics(new FileConsumer(TelemetryEventWriter.logPath()), true)
            taHandler.user_setOnce(distinctId, accountId, properties)
            taHandler.flush()
            taHandler.close()
        } catch (e) {
            Log.error('数数上报', e)
            return false
        }

        return true
    }

    /**
     * 玩家属性累加
     * @param accountId
     * @param properties
     * @param distinctId
     * @returns
     */
    public userAdd(accountId: string, properties: { [key: string]: any }, distinctId: string = '') {
        if (!TelemetryEventWriter.isEnabled()) {
            return false
        }

        if (!distinctId && !accountId) {
            return false
        }

        if (Object.keys(properties).length == 0) {
            return false
        }

        try {
            const taHandler = new ThinkingDataAnalytics(new FileConsumer(TelemetryEventWriter.logPath()), true)
            taHandler.user_add(distinctId, accountId, properties)
            taHandler.flush()
            taHandler.close()
        } catch (e) {
            Log.error('数数上报', e)
            return false
        }

        return true
    }
}
