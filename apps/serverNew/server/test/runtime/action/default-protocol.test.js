const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { captureCompatibilityBaseline } = require('../../../scripts/structure-baseline/compatibility-contract')

describe('action runtime default protocol compatibility', () => {
    it('keeps default package routes and generated bindings stable before runtime source relocation', () => {
        const compatibility = captureCompatibilityBaseline().compatibility
        // 旧数字协议号已随 P6 删除；这里只钉住回退路由的存在与形状（api 且无 serviceType）。
        assert.deepStrictEqual(
            compatibility.protocol.routes.filter((route) => route.name === 'default/Default'),
            [
                { direction: 'C2S', kind: 'api', name: 'default/Default', serviceType: undefined },
                { direction: 'S2S', kind: 'api', name: 'default/Default', serviceType: undefined },
            ],
        )

        const root = path.resolve(__dirname, '../../..')
        for (const direction of ['C2S', 'S2S']) {
            const registry = fs.readFileSync(
                path.join(root, 'generated/protocol/server', direction, 'actions.ts'),
                'utf8',
            )
            assert.match(registry, /'default\/Default': ActionDefault/)
        }
    })
})
