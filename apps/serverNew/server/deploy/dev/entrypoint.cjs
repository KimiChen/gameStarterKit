// 开发态多进程垫片。
//
// 为什么存在：alloy-core fork 子进程时写死 execArgv: []（node-child-process-adapter.ts），
// pm2 / CLI 的 `-r ts-node/register -r tsconfig-paths/register` 传不进子进程，
// 所以 ts-node 与 paths 由本文件显式注册，master 与 worker 走同一条注册路径。
//
// 两个必须显式、不能靠「配置发现」的点：
// 1. compiler 必须是 ts-patch/compiler。bean 编译靠 tsconfig plugins 的
//    transformProgram（scripts/bean-compile/transformer.ts）生效，裸 ts-node 会静默丢掉
//    bean transform —— 不报错，只表现为依赖注入 / 存档行为异常，非常难查。
// 2. 禁止 transpileOnly。transformProgram 需要 Program，transpile-only 模式不建 Program，
//    transform 同样静默跳过。显式传 transpileOnly: false 压住 TS_NODE_TRANSPILE_ONLY 环境变量。
//
// 以下校验在启动时把「静默丢 transform」变成 fail-fast，见文件底部金丝雀。
const path = require('path')

const SERVER_ROOT = path.resolve(__dirname, '..', '..')
const TSCONFIG_PATH = path.join(SERVER_ROOT, 'tsconfig.json')
process.env.ALLOY_CORE_RUNTIME_BUNDLE ??= path.join(SERVER_ROOT, 'build', 'alloy-core', 'index.mjs')
process.env.ALLOY_DEV_BOOTSTRAP ??= 'src/main.ts'

require('ts-node').register({
    project: TSCONFIG_PATH,
    compiler: 'ts-patch/compiler',
    files: true,
    transpileOnly: false,
})

// 显式注册 paths，不依赖 cwd 下的 tsconfig 发现（pm2 的 cwd 不一定可靠）
const tsconfigPaths = require('tsconfig-paths')
const loaded = tsconfigPaths.loadConfig(TSCONFIG_PATH)
if (loaded.resultType === 'failed') {
    console.error(`[entrypoint] 加载 tsconfig paths 失败: ${loaded.message}`)
    process.exit(1)
}
tsconfigPaths.register({
    baseUrl: loaded.absoluteBaseUrl,
    paths: loaded.paths,
})

// bean transform 金丝雀：transform 生效时会为 bean 类注入 static _class_info
// （transformer.ts 注入，源码里不存在）。缺失即说明 transform 被静默跳过，立刻退出。
const { User } = require(path.join(SERVER_ROOT, 'src', 'modules', 'user', 'bean', 'User.ts'))
if (!Object.prototype.hasOwnProperty.call(User, '_class_info')) {
    console.error(
        '[entrypoint] bean transform 未生效（User._class_info 缺失）。' +
            '检查 ts-node 是否使用了 ts-patch/compiler，且未开启 transpileOnly。',
    )
    process.exit(1)
}

const bootstrap = process.env.ALLOY_DEV_BOOTSTRAP
    ? path.resolve(SERVER_ROOT, process.env.ALLOY_DEV_BOOTSTRAP)
    : path.join(SERVER_ROOT, 'src', 'main.ts')
require(bootstrap)
