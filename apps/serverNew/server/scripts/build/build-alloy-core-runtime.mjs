import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const mode = process.argv[2] ?? 'development'

export function prepareRuntime(root, selectedMode, env = process.env) {
    const major = Number(process.versions.node.split('.')[0])
    if (major < 20 || major >= 23) throw new Error(`Node ${process.versions.node} 不受支持，请先切换到 Node 22`)
    if (!['development', 'production'].includes(selectedMode)) throw new Error(`无效构建模式: ${selectedMode}`)
    const outdir = path.join(root, selectedMode === 'production' ? 'dist/app/runtime' : 'build/alloy-core')
    if (env.ALLOY_CORE_RUNTIME_PREBUILT === '1') {
        if (selectedMode !== 'development') throw new Error('预编译 runtime 仅供开发启动；production 必须从源码构建')
        const bundle = path.join(outdir, 'index.mjs')
        const addon = path.join(root, 'build/Release/ts_swoole_runtime_state.node')
        for (const file of [bundle, addon]) {
            if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile())
                throw new Error(`预编译 runtime 文件缺失: ${file}`)
        }
        // 在独立进程中实际加载，提前报告损坏的 bundle、平台/Node ABI 不兼容的 addon。
        const source = `import { createRequire } from 'node:module';
            const runtime = await import(process.argv[1]);
            if (typeof runtime.RuntimeServer !== 'function') throw Error('RuntimeServer export missing');
            createRequire(process.argv[1])(process.argv[2]);`
        const checked = spawnSync(
            process.execPath,
            ['--input-type=module', '-e', source, pathToFileURL(bundle).href, addon],
            {
                cwd: root,
                env,
                stdio: 'inherit',
                timeout: 30000,
            },
        )
        if (checked.error) throw checked.error
        if (checked.status !== 0)
            throw new Error(`预编译 runtime 加载失败: exit=${checked.status}, signal=${checked.signal}`)
        console.log(`[runtime] 已显式选择并校验预编译 runtime: ${bundle}`)
        return
    }
    const coreRoot = env.ALLOY_CORE_ROOT
        ? path.resolve(env.ALLOY_CORE_ROOT)
        : path.resolve(root, '..', '..', 'alloy-core')
    const builder = path.join(coreRoot, 'tools/build-runtime-bundle.mjs')
    if (!fs.statSync(builder, { throwIfNoEntry: false })?.isFile()) {
        throw new Error(
            `alloy-core 构建源码缺失: ${builder}\n设置 ALLOY_CORE_ROOT 指向源码仓库；开发期已有完整产物时可显式设置 ALLOY_CORE_RUNTIME_PREBUILT=1`,
        )
    }
    const result = spawnSync(process.execPath, [builder, '--outdir', outdir], { cwd: coreRoot, env, stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`alloy-core 构建失败: exit=${result.status}, signal=${result.signal}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        prepareRuntime(serverRoot, mode)
    } catch (error) {
        console.error(`[runtime] ${error.message}`)
        process.exitCode = 1
    }
}
