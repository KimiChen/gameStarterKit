const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '../..')
const sharedRoot = path.resolve(projectRoot, '../../shared/src')
const outputRoot = path.join(projectRoot, 'generated/lobby-contract')
const check = process.argv.includes('--check')
// 仅编译消费面及 TypeScript 发现的传递依赖；shared 真源和旧服务端均只读。
// `gameplays/snake/cosmetics.ts` 是衣柜路由需要的双端公开皮肤身份目录；它本来就属于 shared 的公开导出，
// 纳入消费面只是让新框架复用同一份真源，禁止在 serverNew 再维护第二份皮肤目录。
// `gameplays/catalog.generated.ts` 是 `room.prepareCreate` 的玩法目录校验真源（mode/modeVersion/profiles）；
// 私房目录同样只能有一份，⛔ 不要在 serverNew 抄一份 mode 清单。
const entries = [
    'protocol/lobbyRpc/index.ts',
    'generated/webplatform/index.ts',
    'gameplays/snake/cosmetics.ts',
    'gameplays/catalog.generated.ts',
]
const program = ts.createProgram(
    entries.map((entry) => path.join(sharedRoot, entry)),
    {
        target: ts.ScriptTarget.ES2017,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        rootDir: sharedRoot,
        outDir: outputRoot,
        declaration: true,
        strict: true,
        skipLibCheck: true,
        types: [],
        lib: ['lib.es2017.d.ts'],
        noEmitOnError: true,
    },
)
const diagnostics = ts.getPreEmitDiagnostics(program)
if (diagnostics.length) {
    console.error(
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
            getCurrentDirectory: () => projectRoot,
            getCanonicalFileName: (name) => name,
            getNewLine: () => '\n',
        }),
    )
    process.exitCode = 1
} else {
    const outputs = new Map()
    const result = program.emit(undefined, (file, content) => outputs.set(file, content))
    if (result.emitSkipped) throw new Error('shared contract compilation skipped')
    const existing = walk(outputRoot)
    if (check) {
        const changes = [...outputs]
            .filter(([file, content]) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content)
            .map(([file]) => file)
        changes.push(...existing.filter((file) => !outputs.has(file)))
        if (changes.length) {
            console.error(
                'shared contract build is stale; run pnpm gen:lobby-contract\n' +
                    changes.map((file) => path.relative(projectRoot, file)).join('\n'),
            )
            process.exitCode = 1
        } else console.log('shared Lobby contract build matches its source')
    } else {
        for (const [file, content] of outputs) {
            fs.mkdirSync(path.dirname(file), { recursive: true })
            if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) fs.writeFileSync(file, content)
        }
        for (const file of existing) if (!outputs.has(file)) fs.unlinkSync(file)
        console.log(`compiled shared Lobby contract (${outputs.size} artifacts)`)
    }
}

function walk(root) {
    if (!fs.existsSync(root)) return []
    return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(root, entry.name)
        if (entry.isSymbolicLink()) throw new Error('contract build directory must not contain symlinks')
        return entry.isDirectory() ? walk(file) : [file]
    })
}
