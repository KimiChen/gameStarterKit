import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { GenerationPaths } from '../../scripts/generator/GenerationPaths'
import { RecBean } from '../../scripts/generator/differ/record/RecBean'
import { RecProject } from '../../scripts/generator/differ/record/RecProject'
import { RecProtocolFile } from '../../scripts/generator/differ/record/RecProtocolFile'
import { RecProtocolGroup } from '../../scripts/generator/differ/record/RecProtocolGroup'
import { SourceFileFingerprint } from '../../scripts/generator/differ/SourceFileFingerprint'
import { GenBean } from '../../scripts/generator/differ/GenBean'
import { RecBeanProperty } from '../../scripts/generator/differ/record/RecBeanProperty'
import { DifferType } from '../../scripts/generator/differ/DifferType'
import { BeanRecordContract, normalizeBeanRelativePath } from '../../scripts/bean-compile/record-contract'
const { normalizeCompiledSourceMaps } = require(
    path.resolve(process.cwd(), 'scripts/bean-compile/normalizeCompiledSourceMaps.js'),
) as {
    normalizeCompiledSourceMaps(outputRoot: string): number
}

describe('GenerationPaths', () => {
    let projectRoot: string
    let paths: GenerationPaths

    beforeEach(() => {
        projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'alloy-generation-paths-'))
        paths = new GenerationPaths(projectRoot)
    })

    afterEach(() => fs.rmSync(projectRoot, { recursive: true, force: true }))

    it('discovers only module-owned Bean and runtime protocol sources', () => {
        write('src/modules/user/bean/Profile.ts', 'export class Profile {}')
        write('src/modules/guild/ref/GuildRef.ts', 'export class GuildRef {}')
        write('src/bean/user/Profile.ts', 'export class LegacyProfile {}')
        write('src/bean/base/Hero.ts', 'export class Hero {}')
        write('src/bean/refView/GuildRef.ts', 'export class LegacyGuildRef {}')
        write('src/modules/user/UserC2S.ts', 'export interface ReqEnter {}')
        write('src/protocols/C2S/user.ts', 'export interface ReqLegacyEnter {}')
        write('src/protocols/C2S/base.ts', 'export interface ReqLogin {}')

        assert.deepStrictEqual(
            paths.discoverBeanSources().map((source) => source.logicalPath),
            ['/refView/GuildRef', '/user/Profile'],
        )
        assert.deepStrictEqual(
            paths.discoverProtocolSources('C2S').map((source) => [source.packageName, source.moduleOwned]),
            [['user', true]],
        )
    })

    it('discovers runtime protocol sources without treating them as business modules', () => {
        write('src/runtime/protocol/C2S/default.ts', 'export interface ReqDefault {}')
        write('src/protocols/C2S/default.ts', 'export interface ReqLegacyDefault {}')
        write('src/runtime/action/C2S/default/ActionDefault.ts', 'export class ActionDefault {}')
        write('src/action/C2S/default/ActionDefault.ts', 'export class LegacyActionDefault {}')

        const source = paths.discoverProtocolSources('C2S').find((item) => item.packageName === 'default')
        assert.deepStrictEqual(source, {
            direction: 'C2S',
            filePath: path.join(projectRoot, 'src/runtime/protocol/C2S/default.ts'),
            fileName: 'default.ts',
            packageName: 'default',
            moduleOwned: false,
        })
        assert.strictEqual(
            paths.actionSourceFile('C2S', 'default', 'ActionDefault'),
            path.join(projectRoot, 'src/runtime/action/C2S/default/ActionDefault.ts'),
        )
        assert.strictEqual(
            paths.actionTargetFile('C2S', 'default', 'ActionDefault'),
            path.join(projectRoot, 'src/runtime/action/C2S/default/ActionDefault.ts'),
        )

        const project = new RecProject()
        const group = new RecProtocolGroup()
        group.protocols = new Map([['default.ts', Object.assign(new RecProtocolFile(), { relativePath: '/default' })]])
        assert.strictEqual(project.protocolRecordKey(group, source), 'default.ts')
    })

    it('maps generated outputs to the stable server contract', () => {
        assert.strictEqual(
            relative(paths.serverBeanFile('/user/Profile')),
            'generated/protocol/server/C2S/mod/user/Profile.ts',
        )
        assert.strictEqual(relative(paths.serverBeanFile('/Mod/Mod')), 'generated/protocol/server/C2S/mod/Mod.ts')
        assert.strictEqual(relative(paths.recordFile), 'generated/records/record.json')
        assert.strictEqual(relative(paths.adjustDocumentFile), 'generated/adjust/change_document.json5')
    })

    it('requires the authoritative compatibility record and ignores legacy resources', () => {
        write(path.join('resources', 'record.json'), '{"beans": {}}')

        assert.throws(() => new RecProject().init(projectRoot), /请从 Git 恢复 generated\/records\/record\.json/)
        assert.throws(() => new BeanRecordContract({ projectRoot }), /请从 Git 恢复 generated\/records\/record\.json/)

        write('fixtures/record.json', '{"beans": {}}')
        assert.doesNotThrow(
            () => new BeanRecordContract({ projectRoot, recordPath: path.join(projectRoot, 'fixtures/record.json') }),
        )
    })

    it('keeps generated config declarations in the Bean compile test entrypoint', () => {
        const config = JSON.parse(
            fs.readFileSync(path.resolve(process.cwd(), 'test/bean-compile/tsconfig.json'), 'utf8'),
        ) as { include: string[] }
        assert.strictEqual(config.include.includes('../../generated/configTypes/**/*.d.ts'), true)
        assert.strictEqual(config.include.includes('../../generated/**/*.ts'), false)
    })

    it('keeps migrated sources on their existing record keys', () => {
        const project = new RecProject()
        project.paths = paths
        project.beans = new Map()
        const bean = new RecBean()
        bean.relativePath = '/test/UserHashTestBean'
        project.beans.set('UserHashTestBean.ts', bean)

        const group = new RecProtocolGroup()
        group.protocols = new Map()
        const protocol = new RecProtocolFile()
        protocol.relativePath = '/test'
        group.protocols.set('test.ts', protocol)

        assert.strictEqual(
            project.beanRecordKey('/test/UserHashTestBean', 'UserHashTestBean.ts'),
            'UserHashTestBean.ts',
        )
        assert.strictEqual(
            project.protocolRecordKey(group, {
                direction: 'C2S',
                filePath: path.join(projectRoot, 'src/modules/test/TestC2S.ts'),
                fileName: 'TestC2S.ts',
                packageName: 'test',
                moduleOwned: true,
            }),
            'test.ts',
        )
    })

    it('does not classify sibling project Bean files as server Bean sources', () => {
        const siblingBean = path.resolve(projectRoot, '../engine/src/bean/redis/userRedis.ts')
        assert.strictEqual(paths.beanLogicalPath(siblingBean), undefined)
    })

    it('maps module-owned ref sources to the stable refView logical namespace', () => {
        const source = path.join(projectRoot, 'src/modules/guild/ref/GuildRef.ts')
        write('src/modules/guild/ref/GuildRef.ts', 'export class GuildRef extends RefHash {}')

        assert.strictEqual(paths.beanLogicalPath(source), '/refView/GuildRef')
        assert.strictEqual(normalizeBeanRelativePath(source), '/refView/GuildRef')
    })

    it('keeps the module-owned User Bean on the stable base logical path', () => {
        const moduleUser = path.join(projectRoot, 'src/modules/user/bean/User.ts')
        const moduleProfile = path.join(projectRoot, 'src/modules/user/bean/Profile.ts')
        write('src/modules/user/bean/User.ts', 'export class User {}')
        write('src/modules/user/bean/Profile.ts', 'export class Profile {}')
        write('src/bean/base/User.ts', 'export class LegacyUser {}')

        const sources = paths.discoverBeanSources()
        const userSource = sources.find((source) => source.logicalPath === '/base/User')

        assert.strictEqual(userSource?.filePath, moduleUser)
        assert.strictEqual(sources.filter((source) => source.logicalPath === '/base/User').length, 1)
        assert.strictEqual(paths.beanLogicalPath(moduleUser), '/base/User')
        assert.strictEqual(normalizeBeanRelativePath(moduleUser), '/base/User')
        assert.strictEqual(paths.beanLogicalPath(moduleProfile), '/user/Profile')
        assert.strictEqual(normalizeBeanRelativePath(moduleProfile), '/user/Profile')
    })

    it('rejects another module Bean that collides with the stable User logical path', () => {
        write('src/modules/user/bean/User.ts', 'export class User {}')
        write('src/modules/base/bean/User.ts', 'export class DuplicateUser {}')

        assert.throws(() => paths.discoverBeanSources(), /Bean 逻辑路径 \/base\/User 同时对应多个模块源码/)
    })

    it('rejects duplicate refView logical paths across module owners', () => {
        write('src/modules/guild/ref/SharedRef.ts', 'export class SharedRef {}')
        write('src/modules/user/ref/SharedRef.ts', 'export class SharedRef {}')

        assert.throws(() => paths.discoverBeanSources(), /\/refView\/SharedRef/)
    })

    it('refreshes moved RefHash source paths without changing logical identity or generating mirrors', async () => {
        const source = 'src/modules/guild/ref/GuildRef.ts'
        write(source, 'export class GuildRef extends RefHash {}')
        const project = new RecProject()
        project.projectPath = projectRoot
        project.paths = paths
        project.genAll = false
        project.protocols = new Map()
        project.beans = new Map()
        const record = new RecBean()
        record.relativePath = '/refView/GuildRef'
        record.sourcePath = 'src/bean/refView/GuildRef.ts'
        record.className = 'GuildRef'
        record.diffType = DifferType.Invalid
        record.properties = new Map()
        const sourceInfo = new SourceFileFingerprint(path.join(projectRoot, 'src/modules/guild/ref'), 'GuildRef.ts')
        record.md5 = sourceInfo.md5()
        record.mtime = sourceInfo.mtime()
        project.beans.set('GuildRef.ts', record)

        await new GenBean(project).gen()

        assert.strictEqual(record.sourcePath, source)
        assert.strictEqual(record.relativePath, '/refView/GuildRef')
        assert.strictEqual(record.deleted, undefined)
        assert.strictEqual(fs.existsSync(paths.serverBeanFile('/refView/GuildRef')), false)
    })

    it('refreshes a record when a source moves without changing content', () => {
        const movedFile = 'src/modules/shop/bean/Shop.ts'
        write(movedFile, 'export class Shop {}')
        const project = new RecProject()
        project.projectPath = projectRoot
        project.genAll = false
        const record = new RecBean()
        record.sourcePath = 'src/bean/shop/Shop.ts'
        record.md5 = new SourceFileFingerprint(path.join(projectRoot, 'src/modules/shop/bean'), 'Shop.ts').md5()
        record.mtime = 0
        const records = new Map<string, RecBean>([['Shop.ts', record]])

        const [matched, modified] = project.modifiedByKey(
            new SourceFileFingerprint(path.join(projectRoot, 'src/modules/shop/bean'), 'Shop.ts'),
            records,
            'Shop.ts',
            () => new RecBean(),
        )

        assert.strictEqual(modified, true)
        assert.strictEqual(matched, record)
        assert.strictEqual(record.sourcePath, movedFile)
    })

    it('removes old mirrors and preserves field IDs when a Bean changes owner', async () => {
        const source = 'src/modules/worship/bean/WorshipSkillBean.ts'
        write(source, 'export class WorshipSkillBean extends Bean { id!: int }')
        const project = new RecProject()
        project.projectPath = projectRoot
        project.paths = paths
        project.genAll = false
        project.protocols = new Map()
        project.beans = new Map()
        const record = new RecBean()
        record.relativePath = '/user/WorshipSkillBean'
        record.sourcePath = 'src/bean/user/WorshipSkillBean.ts'
        record.className = 'WorshipSkillBean'
        record.diffType = DifferType.Bean
        record.properties = new Map()
        const id = new RecBeanProperty()
        id.id = 17
        id.name = 'id'
        record.properties.set('id', id)
        const sourceInfo = new SourceFileFingerprint(
            path.join(projectRoot, 'src/modules/worship/bean'),
            'WorshipSkillBean.ts',
        )
        record.md5 = sourceInfo.md5()
        record.mtime = sourceInfo.mtime()
        project.beans.set('WorshipSkillBean.ts', record)
        write(relative(paths.serverBeanFile('/user/WorshipSkillBean')), 'old server mirror')

        const generator = new GenBean(project)
        await generator.gen()
        generator.genC2SBean(record)

        assert.strictEqual(fs.existsSync(paths.serverBeanFile('/user/WorshipSkillBean')), false)
        assert.strictEqual(fs.existsSync(paths.serverBeanFile('/worship/WorshipSkillBean')), true)
        assert.strictEqual(record.properties.get('id')?.id, 17)
    })

    it('removes stale compiled output after a Bean source moves', () => {
        const outputRoot = path.join(projectRoot, 'build/compiled')
        const javaScriptFile = path.join(outputRoot, 'ChatDailyItem.js')
        const sourceMapFile = javaScriptFile + '.map'
        const missingBean = path.resolve(process.cwd(), 'src/modules/user/bean/__MovedChatDailyItem__.ts')
        write(relative(javaScriptFile), 'module.exports = {}\n//# sourceMappingURL=ChatDailyItem.js.map')
        write(
            relative(sourceMapFile),
            JSON.stringify({ version: 3, sources: [missingBean], names: [], mappings: '', file: 'ChatDailyItem.js' }),
        )

        assert.strictEqual(normalizeCompiledSourceMaps(outputRoot), 1)
        assert.strictEqual(fs.existsSync(javaScriptFile), false)
        assert.strictEqual(fs.existsSync(sourceMapFile), false)
    })

    function write(fileName: string, content: string) {
        const filePath = path.join(projectRoot, fileName)
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, content)
    }

    function relative(fileName: string) {
        return path.relative(projectRoot, fileName).replace(/\\/g, '/')
    }
})
