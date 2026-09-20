const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { captureCompatibilityBaseline } = require('../../../scripts/structure-baseline/compatibility-contract')

describe('action runtime compatibility', () => {
    const compatibility = captureCompatibilityBaseline().compatibility

    it('keeps the C2S and S2S default fallback routes stable', () => {
        // 旧数字协议号已随 P6 删除；这里只钉住回退路由的存在与形状（api 且无 serviceType）。
        assert.deepStrictEqual(
            compatibility.protocol.routes.filter((item) => item.name.startsWith('default/')),
            [
                { direction: 'C2S', kind: 'api', name: 'default/Default', serviceType: undefined },
                { direction: 'S2S', kind: 'api', name: 'default/Default', serviceType: undefined },
            ],
        )
    })

    it('keeps the S2S default fallback bound to ActionDefault', () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, '../../../generated/protocol/server/S2S/actions.ts'),
            'utf8',
        )
        assert.match(source, /^\s{4}'default\/Default':\s*ActionDefault,$/m)
    })
})
