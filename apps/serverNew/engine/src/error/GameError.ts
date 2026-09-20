import { format } from 'util'
import { ErrorData } from './ErrorData'

/** 
 * 注意该类里的方法都是复制一个新对象的
 */
export class GameError {
    private item: ErrorData

    static runtimeError: GameError

    static logicError: GameError

    static requestError: GameError

    static sysNoConf: GameError

    static apiCallQueueTimeout: GameError

    /**
     * 构造函数
     * @param code 错误码
     * @param msg 错误描述
     */
    constructor(code: int, msg: string) {
        this.item = new ErrorData(code, msg)
    }

    get code(): int {
        return this.getItem().code
    }

    /**
     * 追加参数
     * @param params
     * @returns
     */
    params(params: { noLogin?: boolean; p?: any[]; vars?: any[] | { [key: string]: any } }): GameError {
        const err = new GameError(this.item.code, this.item.message)
        err.item.fill({
            ...params,
        })
        return err
    }

    /**
     * 追加调试变量
     * @param params
     */
    vars(vars?: any[] | { [key: string]: any }) {
        const err = new GameError(this.item.code, this.item.message)
        err.item.fill({
            vars: vars,
        })
        return err
    }

    /**
     * 返回item
     * @returns
     */
    getItem(): ErrorData {
        return this.item
    }

    getFailResponse(): any {
        return {
            s: this.item.code,
            msg: this.item.message,
            params: this.item.params,
            vars: this.item.vars,
        }
    }

    /** 调试信息, 不能输出给客户端查看 */
    getDebugStr(): string {
        const item = this.item
        let str = `code:${item.code},msg:${item.message},vars=${JSON.stringify(item.vars)}`
        if (item.stack) {
            str += '\n' + item.stack
        }
        return str
    }
}

