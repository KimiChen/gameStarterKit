import assert from 'node:assert/strict'
import { buildAdjustQuickMenus } from '../../../src/modules/adjust/http/quickMenu'

global.PLATFORM = 'bearjoy'
global.PLATFORM_VERSION = 'dev'
global.CP = {
    platform: {
        project: 'alloy-test',
        adjustQuickMenus: [
            { name: '发布平台', url: '{webApi}/publish' },
            { name: '本地项目', url: 'http://127.0.0.1/{project}' },
            { name: '当前线路', url: 'http://127.0.0.1/{platform}/{version}' },
            { name: '内嵌工具', routeName: 'tools', target: '_self' },
        ],
    } as any,
    service: {} as any,
}

const menus = buildAdjustQuickMenus('http://10.130.0.130:25001')
assert.equal(menus.length, 4)
assert.equal(menus[0].name, '发布平台')
assert.equal(menus[0].target, '_blank')
assert.ok(menus.filter((menu) => menu.url).every((menu) => menu.url?.startsWith('http://')))
assert.equal(menus[3].target, '_self')

console.log('ok - adjust quick menu contract')
