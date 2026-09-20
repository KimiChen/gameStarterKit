import 'reflect-metadata'
import assert from 'assert'
import { getMetadataArgsStorage } from 'routing-controllers'
import { buildSwaggerSpec } from '../../src/http/swagger'
import { GmExecutionContext } from '../../src/modules/gm/http/GmExecutionContext'
import { PaymentCallback } from '../../src/modules/pay/http/callback/PaymentCallback'
import { PackageVersionResolver } from '../../src/modules/clientConfig/http/PackageVersionResolver'
import '../../src/modules/adjust/http/NewUserQuery'
import '../../src/modules/clientConfig/http/DownloadQuery'
import '../../src/modules/pay/http/order/OrderCreateReq'
import '../../src/modules/user/http/UserLoginQuery'

describe('management HTTP runtime contracts', () => {
    before(() => {
        ;(global as any).Log = {
            error() {},
            info() {},
            pay: { info() {}, error() {} },
            http: { info() {}, error() {} },
        }
    })

    it('publishes complete DTO schemas and bearer metadata', () => {
        const spec: any = buildSwaggerSpec(getMetadataArgsStorage, {
            routePrefix: '',
            defaultErrorHandler: false,
            cors: true,
            authorizationChecker: undefined,
            controllers: [],
            middlewares: [],
            interceptors: [],
        })

        assert.deepStrictEqual(spec.security, [{ bearerAuth: [] }])
        assert.deepStrictEqual(spec.components.securitySchemes.bearerAuth, {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
        })
        for (const schemaName of [
            'AdjustApiChangeBody',
            'AdjustGetCustomBody',
            'ConfigZipQuery',
            'DownloadQuery',
            'NewUserQuery',
            'OrderCreateReq',
            'PackageVersionQuery',
            'ParseCommitActionBody',
            'UserLoginQuery',
        ]) {
            assert.ok(spec.components.schemas[schemaName], `missing Swagger schema: ${schemaName}`)
        }
        assert.strictEqual(spec.info.title, 'game-service')
        assert.strictEqual(spec.info.version, '1.0.0')
    })

    it('keeps representative GM, payment, and package-version responses stable', async () => {
        const gmContext = new GmExecutionContext()
        gmContext.mod = 'server'
        gmContext.do = 'all'
        assert.deepStrictEqual(gmContext.gmSuccessResponse({ ok: true }), {
            code: 0,
            msg: '成功',
            data: { ok: true },
            mod: 'server',
            do: 'all',
        })

        const payment = new PaymentCallback()
        assert.deepStrictEqual(payment.jsonResponse({}, 0, 'success'), {
            code: '00000',
            tips: 'success',
            description: 'success',
            data: {},
        })
        assert.deepStrictEqual(payment.jsonResponse({}, 4, 'send err'), {
            code: 4,
            tips: 'send err',
            description: 'send err',
            data: {},
        })

        ;(global as any).CP = {
            platform: {
                cdn: { baseUrl: 'http://cdn.example', silentDownloadFlag: 1, silentDownloadLimit: 2048 },
                host: '127.0.0.1',
                port: 18080,
            },
        }
        ;(global as any).CA = { game_url: {} }
        ;(global as any).PLATFORM = 'bearjoy'
        const packageResponse = await new PackageVersionResolver().returnData({}, -1, 'android', 'bearjoy', '', '')
        assert.deepStrictEqual(packageResponse, {
            code: 0,
            loginUrl: 'http://127.0.0.1:18080',
            resUrl: 'http://cdn.example',
            frontWhite: 0,
            logOn: 1,
            baseVersion: '',
            packageUrl: '',
            packageForceUpdate: 0,
            resVersion: '',
            resForceUpdate: 0,
            packageCdnVer: '',
            packageCdnVer2: '',
            updateRestart: 0,
            isJump: 0,
            downLoadType: 0,
            codeVer: '',
            pytsVer: '',
            separateVer: '',
            silentDownloadFlag: 1,
            silentDownloadLimit: 2048,
            isAb: 1,
        })
    })
})
