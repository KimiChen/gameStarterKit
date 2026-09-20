import { createHash } from 'crypto'
import { AbstractConsumer } from './AbstractConsumer'
import { ThinkingDataException } from './ThinkingDataException'
import moment from 'moment'

/**
 * 数数统计
 * @package StatTa
 * @version Id
 */
export class ThinkingDataAnalytics {
    private readonly SDK_VERSION = '1.5.0'

    private _consumer: AbstractConsumer

    private _public_properties: { [key: string]: string } = {}

    private _enableUUID

    constructor(consumer: AbstractConsumer, enableUUID = false) {
        this._consumer = consumer
        this._enableUUID = enableUUID
        this.clear_public_properties()
    }

    /**
     * 设置用户属性, 覆盖之前设置的属性.
     * @param string distinct_id 访客 ID
     * @param string account_id  账户 ID
     * @param array  properties  用户属性
     * @return boolean
     * @throws Exception 数据传输，或者写文件失败
     */
    public user_set(distinct_id: string, account_id: string, properties: { [key: string]: any } = {}) {
        return this._add(distinct_id, account_id, 'user_set', undefined, undefined, properties)
    }

    /**
     * 设置用户属性, 如果属性已经存在, 则操作无效.
     * @param string distinct_id 访客 ID
     * @param string account_id  账户 ID
     * @param array  properties  用户属性
     * @return boolean
     * @throws Exception 数据传输，或者写文件失败
     */
    public user_setOnce(distinct_id: string, account_id: string, properties: { [key: string]: any } = {}) {
        return this._add(distinct_id, account_id, 'user_setOnce', undefined, undefined, properties)
    }

    /**
     * 修改数值类型的用户属性.
     * @param string distinct_id 访客 ID
     * @param string account_id  账户 ID
     * @param array  properties  用户属性, 其值需为 Number 类型
     * @return boolean
     * @throws Exception 数据传输，或者写文件失败
     */
    public user_add(distinct_id: string, account_id: string, properties: { [key: string]: any } = {}) {
        return this._add(distinct_id, account_id, 'user_add', undefined, undefined, properties)
    }

    /**
     * 追加一个用户的某一个或者多个集合
     * @param string distinct_id 访客 ID
     * @param string account_id  账户 ID
     * @param array  properties  key上传的是非关联数组
     * @return boolean
     * @throws Exception 数据传输，或者写文件失败
     */
    public user_append(distinct_id: string, account_id: string, properties: { [key: string]: any } = {}) {
        return this._add(distinct_id, account_id, 'user_append', undefined, undefined, properties)
    }

    /**
     * 删除用户属性
     * @param string distinct_id 访客 ID
     * @param string account_id  账户 ID
     * @param array  properties  key上传的是删除的用户属性
     * @return boolean
     * @throws Exception 数据传输，或者写文件失败
     */
    public user_unset(distinct_id: string, account_id: string, properties: { [key: string]: any } = {}) {
        if (properties.length == 0) {
            throw new ThinkingDataException('property cannot be empty .')
        }
        return this._add(distinct_id, account_id, 'user_unset', undefined, undefined, properties)
    }

    /**
     * 删除用户, 此操作不可逆, 请谨慎使用.
     * @param string distinct_id 访客 ID
     * @param string account_id  账户 ID
     * @return boolean
     * @throws Exception 数据传输，或者写文件失败
     */
    public user_del(distinct_id: string, account_id: string) {
        return this._add(distinct_id, account_id, 'user_del', undefined, undefined, {})
    }

    /**
     * 上报事件.
     * @param string distinct_id 访客 ID
     * @param string account_id  账户 ID
     * @param string event_name  事件名称
     * @param array  properties  事件属性
     * @return boolean
     * @throws Exception 数据传输，或者写文件失败
     */
    public track(distinct_id: string, account_id: string, event_name: string, properties: { [key: string]: any } = {}) {
        return this._add(distinct_id, account_id, 'track', event_name, undefined, properties)
    }

    /**
     * 上报事件.
     * @param string distinct_id 访客 ID
     * @param string account_id  账户 ID
     * @param string event_name  事件名称
     * @param string event_id    事件ID
     * @param array  properties  事件属性
     * @return boolean
     * @throws Exception 数据传输，或者写文件失败
     */
    public track_update(
        distinct_id: string,
        account_id: string,
        event_name?: string,
        event_id?: string,
        properties: { [key: string]: any } = {},
    ) {
        return this._add(distinct_id, account_id, 'track_update', event_name, event_id, properties)
    }

    /**
     * 上报事件.
     * @param string distinct_id 访客 ID
     * @param string account_id  账户 ID
     * @param string event_name  事件名称
     * @param string event_id    事件ID
     * @param array  properties  事件属性
     * @return boolean
     * @throws Exception 数据传输，或者写文件失败
     */
    public track_overwrite(
        distinct_id: string,
        account_id: string,
        event_name?: string,
        event_id?: string,
        properties = {},
    ) {
        return this._add(distinct_id, account_id, 'track_overwrite', event_name, event_id, properties)
    }

    private _add(
        distinct_id: string,
        account_id: string,
        type: string,
        event_name?: string,
        event_id?: string,
        properties: { [key: string]: string } = {},
    ) {
        const event: { [key: string]: any } = {}

        if (event_name !== undefined && event_name === '') {
            throw new ThinkingDataException('event name must be a str.')
        }

        if (distinct_id === '' && account_id === '') {
            throw new ThinkingDataException('account_id 和 distinct_id 不能同时为空')
        }

        if (distinct_id !== '') {
            event['#distinct_id'] = distinct_id
        }

        if (account_id !== '') {
            event['#account_id'] = account_id
        }

        if (event_name !== undefined) {
            event['#event_name'] = event_name
        }

        if (type == 'track') {
            properties = Object.assign({}, properties, this._public_properties)
            if (properties['#first_check_id']) {
                event['#first_check_id'] = properties['#first_check_id']
                delete properties['#first_check_id']
            }
        }

        if (type == 'track_update' || type == 'track_overwrite') {
            properties = Object.assign({}, properties, this._public_properties)
            event['#event_id'] = event_id
        }

        event['#type'] = type
        event['#ip'] = this._extract_ip(properties)
        event['#time'] = this._extract_user_time(properties)

        // #uuid需要标准格式 xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxx
        if (properties['#uuid']) {
            event['#uuid'] = properties['#uuid']
            delete properties['#uuid']
        } else if (this._enableUUID) {
            event['#uuid'] = this.uuid()
        }

        // 检查properties
        if (properties) {
            event.properties = properties
        }

        return this._consumer.send(JSON.stringify(event))
    }

    private _assert_properties(type: string, properties: { [key: string]: any }) {
        const name_pattern = '/^(#|[a-z])[a-z0-9_]{0,49}/i'
        if (!properties) {
            return false
        }
        for (const key in properties) {
            const value = properties[key]

            if (value == undefined || value == null) {
                continue
            }
            if (key.length > 50) {
                throw new ThinkingDataException('the max length of property key is 50. [key=key]')
            }
            if (!key.match(name_pattern)) {
                throw new ThinkingDataException("property key must be a valid variable name. [key='key']]")
            }
            if (type == 'user_add' && !Number(value)) {
                throw new ThinkingDataException("Type user_add only support Number [key='key']")
            }

            // 如果是DateTime，Format成字符串
            if (value instanceof Date) {
                properties[key] = this.getFormatDate(value.getTime() / 1000)
            }

            // 如果是数组
            if (Array.isArray(value)) {
                for (let i = 0; i < value.length; i++) {
                    const val = value[i]
                    if (val instanceof Date) {
                        value[i] = this.getFormatDate(val.getTime() / 1000)
                    }
                }
            }
        }

        return properties
    }

    public getDatetime() {
        return this.getFormatDate()
    }

    public getFormatDate(time?: int, format = 'Y-M-D HH:mm:ss') {
        const data = new Date()
        let timestamp = Math.floor(data.getTime() / 1000)
        let milliseconds = data.getMilliseconds()
        if (milliseconds == 1000) {
            timestamp = timestamp + 60 * 1000
            milliseconds = 0
        }

        if (time) {
            return moment.unix(time).format(format) + '.' + milliseconds
        }

        return moment.unix(timestamp).format(format) + '.' + milliseconds
    }

    private _extract_user_time(properties: { [key: string]: any } = {}) {
        if (properties['#time']) {
            const time = properties['#time']
            delete properties['#time']
            return time
        }
        return this.getFormatDate()
    }

    private _extract_ip(properties: { [key: string]: any } = {}) {
        if (properties['#ip']) {
            const ip = properties['#ip']
            delete properties['#ip']
            return ip
        }
        return ''
    }

    public uuid(): string {
        const uniqidStr = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
        const md5Hash = createHash('md5').update(uniqidStr).digest('hex')
        // eslint-disable-next-line max-len
        const uuid = `${md5Hash.substring(0, 8)}-${md5Hash.substring(8, 12)}-${md5Hash.substring(12, 16)}-${md5Hash.substring(16, 20)}-${md5Hash.substring(20)}`
        return uuid
    }

    public clear_public_properties() {
        this._public_properties = {
            ['#lib']: 'tga_php_sdk',
            ['#lib_version']: this.SDK_VERSION,
        }
    }

    public register_public_properties(super_properties: { [key: string]: any }) {
        this._public_properties = Object.assign({}, this._public_properties, super_properties)
    }

    public flush() {
        this._consumer.flush()
    }

    public close() {
        this._consumer.close()
    }
}
