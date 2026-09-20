import { HttpError } from 'routing-controllers'

export enum HttpStatusCode {
    OK = 200,
    BAD_REQUEST = 400,
    FORBIDDEN = 403,
    NOT_FOUND = 404,
    INTERNAL_SERVER = 500,
    UNAUTHORIZED = 401,
}

export class ResError extends HttpError {
    status: 1 | 0

    msg: string

    data?: any[]

    constructor(msg: string, data: any[] = []) {
        super(HttpStatusCode.OK, msg)
        Object.setPrototypeOf(this, new.target.prototype)
        this.name = 'ResError'
        this.status = 1
        this.msg = msg
        this.data = data
    }

    toJson() {
        return {
            status: this.status,
            msg: this.msg,
            data: this.data,
        }
    }
}

export class ResSuccess {
    status: 1 | 0

    msg: string = '操作成功'

    data?: any[]

    constructor(data: any, msg: string = '操作成功') {
        this.status = 0
        this.msg = msg
        this.data = data
    }

    toJson() {
        return {
            status: HttpStatusCode.OK,
            msg: this.msg,
            data: this.data,
        }
    }
}
