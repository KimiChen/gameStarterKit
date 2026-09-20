const assert = require('assert')
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '../..')

describe('runtime boundary', () => {
    it('splits client pushes from local Action dispatch', () => {
        // 旧的 `ClientPush`（框架级隐式推送入口）已随 P6 删除，不得复活：
        // 客户端推送只由原生 Lobby 的 shared 领域推送承载。
        assert.strictEqual(fs.existsSync(path.join(projectRoot, 'src/runtime/action/ClientPush.ts')), false)
        assert.doesNotMatch(read('src/runtime/action/LocalAction.ts'), /export class C2S/)
        assert.doesNotMatch(read('src/runtime/action/LocalAction.ts'), /pushMsgByUIds/)
    })

    it('registers business protocol executors outside runtime implementations', () => {
        assert.doesNotMatch(read('src/runtime/protocol/ProtocolConfigInitializer.ts'), /modules\/adjust/)
        assert.doesNotMatch(read('src/runtime/action/S2S/http/ActionOnlyJson.ts'), /modules\/adjust/)
        const startup = read('src/startup/initializeApplication.ts')
        const adjustModule = read('src/modules/adjust/AdjustModule.ts')
        assert.match(startup, /GameModuleCatalog\.systems\.protocol\.entries/)
        assert.doesNotMatch(startup, /ApiChangeAction/)
        assert.match(
            adjustModule,
            /kind: 'actionExecutor',[\s\S]*name: 'adjust-action-executor',[\s\S]*executor: ApiChangeAction\.execAction/,
        )
        assert.match(
            adjustModule,
            /kind: 'internalJsonAction',[\s\S]*key: 'adjust',[\s\S]*handler: ApiChangeAction\.execAction/,
        )
    })
})

function read(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}
