interface GmErrorMsg {
    code: number
    msg: string
    vars?: { [key: string]: any }
    line?: string
    debug?: any[]
}

interface GmResponse extends GmErrorMsg {
    code: number
    msg: string
    data?: any
    mod?: string
    do?: string
}

export class GmExecutionContext {
    static readonly CODE_SIGN_ERROR = 1 // 签名错误

    static readonly CODE_MOD_ERROR = 2 // mod do错误

    protected gmErrorMsg: GmErrorMsg[] = []

    public mod: string = ''

    public do: string = ''

    public requestData: any

    public setGmMsg(code: number, message: string, vars: { [key: string]: any } = {}): void {
        const fileLine = ''
        const item: GmErrorMsg = {
            code,
            msg: message,
            vars,
            line: fileLine,
        }

        this.gmErrorMsg.push(item)
    }

    public gmFailResponse(): GmResponse {
        let response: GmErrorMsg = {
            code: -1,
            msg: '未知错误',
        }

        if (this.gmErrorMsg.length > 0) {
            response = { ...this.gmErrorMsg[this.gmErrorMsg.length - 1] }
            response.debug = [...this.gmErrorMsg]
        }

        Log.error(`gmApiFail: mod:${this.mod},do:${this.do},error:${JSON.stringify(this.gmErrorMsg)}
        ,req:${JSON.stringify(this.requestData)},res:${JSON.stringify(response)}`)

        const gmRes: GmResponse = { ...response }
        gmRes.mod = this.mod
        gmRes.do = this.do

        return response
    }

    public gmSuccessResponse(resData: any): GmResponse {
        const response: GmResponse = {
            code: 0,
            msg: '成功',
            data: resData,
            mod: this.mod,
            do: this.do,
        }

        return response
    }

    public checkSidsValid(sIds: number[], serverItems: any[]) {
        if (!serverItems) {
            this.setGmMsg(1010, '传递的区服IDs不正确，没有查询到区服', [sIds])
            return false
        }
        if (sIds.length != serverItems.length) {
            this.setGmMsg(1011, '传递的区服IDs不正确，存在异常区服ID', [sIds])
            return false
        }
        return true
    }
}
