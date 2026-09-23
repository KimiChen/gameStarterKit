import Joi from 'joi'
import { ChannelUser } from './ChannelUser'

export class ChannelProvider {
    /**
     * 渠道游戏ID
     */
    public appId: string = ''

    /**
     * 渠道游戏key
     */
    public appKey: string = ''

    /**
     * 渠道游戏公钥
     */
    public appPayKey: string = ''

    /** 渠道服务地址，由线路配置显式提供。 */
    public serverUrl: string = ''

    /**
     * 从渠道获取的用户id的后缀, 一般都是需要增加后缀的，防止多个渠道用户id有一样的情况
     */
    protected UID_SUFFIX = ''

    /**
     * 渠道标识
     */
    protected CHANNEL_CODE = ''

    /**
     * 进入游戏的参数验证
     */
    protected gameValidate?: Joi.ObjectSchema

    /**
     * 支付回调参数验证
     */
    protected payValidate?: Joi.ObjectSchema

    /**
     * 查询角色的参数验证
     */
    protected roleValidate?: Joi.ObjectSchema

    /**
     * 聊天推送的参数验证
     */
    protected chatValidate?: Joi.ObjectSchema

    /**
     * 管理员操作参数验证
     */
    protected adminValidate?: Joi.ObjectSchema

    login(loginParams: any): Promise<ChannelUser | null> {
        return new Promise((resolve, reject) => {
            resolve(null)
        })
    }

    /**
     * 给渠道用户id添加后缀
     * @param uId
     * @returns
     */
    addUidSuffix(uId: string) {
        if (this.UID_SUFFIX == '') {
            throw new Error(`class:${this.constructor.name} no set uIdSuffix!`)
        }
        return uId + this.UID_SUFFIX
    }

    /**
     * 验证需要的参数是否足够
     */
    checkParamValidate<T>(params: any): T | undefined {
        if (!this.gameValidate) {
            return undefined
        }
        const result = this.gameValidate.validate(params)
        if (result.error) {
            return undefined
        }
        return result.value as T
    }
}
