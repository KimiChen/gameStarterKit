import { ErrorCode } from '../../../src/config/ErrorCode'

const a = Math.round(Math.random() * 100)
if (a % 2 == 1) {
    throw ErrorCode.ProtectRequest.params({ noLogin: true, vars: '我是调试信息' })
} else {
    throw ErrorCode.ProtectRequest
}
