import { format } from 'util'
import { MsgError } from '../protocol/MsgError'

export class ErrorData implements MsgError {

    /**错误描述*/
    message: string

    /**错误码*/
    code: int

    /**是否禁止登录*/
    noLogin: boolean = false

    /**message模板替换参数*/
    params: string[] = []

    /**调试参数*/
    vars?: string[] = []

    stack?: string

    constructor(code: int, msg: string) {
        this.code = code
        this.message = msg
    }

    fill(params: {
        code?: number,
        message?: string,
        noLogin?: boolean,
        params?: string[],
        vars?: any[] | { [key: string]: any },
        stack?: string
    }) {
        this.code = params.code ?? this.code
        this.message = params.message ?? this.message
        this.noLogin = params.noLogin ?? this.noLogin
        this.params = params.params ?? this.params
        if (params.vars !== undefined) {
            this.vars = this.convertVars(params.vars)
        }
    }

    convertVars(vars?: any[] | { [key: string]: any }): string[] {
        const r = []
        if (vars) {
            if (Array.isArray(vars)) {
                for (const el of vars) {
                    r.push(format('%s', el))
                }
            } else {
                for (const key in vars) {
                    r.push(format('%s=%s', key, vars[key]))
                }
            }
        }
        return r
    }
}
