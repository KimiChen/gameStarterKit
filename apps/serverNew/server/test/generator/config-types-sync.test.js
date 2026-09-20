const assert = require('assert')
const fs = require('fs')
const path = require('path')
const json5 = require('json5')

const projectRoot = path.resolve(__dirname, '../..')

describe('config type synchronization', () => {
    it('keeps credentials outside the tracked tool configuration', () => {
        const config = json5.parse(read('tools-cfg.json'))
        assert.strictEqual(config.pwd, '')
        assert.strictEqual(config.typingsPath, 'generated/configTypes')
        assert.strictEqual(config.autoGen.system_id.codePath, 'generated/configTypes/SystemId.ts')
    })

    it('writes config types directly to their generated owner', () => {
        const source = read('scripts/generator/configTypes/SyncConfigTypes.ts')
        assert.match(source, /generated\/configTypes/)
        assert.match(source, /\['exec', 'game-sync'/)
    })

    it('uses a pnpm patch to require or override the password from the environment', () => {
        const packageJson = JSON.parse(read('package.json'))
        const patchPath = packageJson.pnpm?.patchedDependencies?.['@arthropoda/game-sync@0.0.36']
        assert.strictEqual(patchPath, 'patches/@arthropoda__game-sync@0.0.36.patch')

        const patch = read(patchPath)
        assert.match(patch, /src\/common\.ts/)
        assert.match(patch, /lib\/common\.js/)
        assert.match(patch, /GAME_SYNC_PASSWORD/)
        assert.match(patch, /cfg\.pwd = environmentPassword/)
    })
})

function read(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}
