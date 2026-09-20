import assert from 'node:assert/strict'
import { ResError } from '../../src/http/constants/httpError'
import { HttpErrorMiddleware } from '../../src/http/middlewares/HttpErrorMiddleware'

const response = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
        this.statusCode = code
        return this
    },
    json(body: unknown) {
        this.body = body
        return this
    },
}

const error = new ResError('用例名称已存在')
assert.equal(error instanceof ResError, true)
new HttpErrorMiddleware().error(error, {} as never, response as never, () => undefined)

assert.equal(response.statusCode, 200)
assert.deepEqual(response.body, {
    status: 1,
    msg: '用例名称已存在',
    data: [],
})

console.log('ok - ResError JSON response contract')
