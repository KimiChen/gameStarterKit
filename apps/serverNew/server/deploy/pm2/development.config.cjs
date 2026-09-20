module.exports = {
    apps: [
        {
            cwd: './', // 项目的目录位置
            name: 'engine',
            // 走 dev 垫片：显式注册 ts-patch/compiler + tsconfig-paths，并带 bean transform 金丝雀。
            // 多进程下 alloy-core fork 子进程时 execArgv 被清空，-r 参数传不进去，垫片是唯一可靠路径。
            script: './deploy/dev/entrypoint.cjs',
            args: '-p bearjoy -v dev --sid 1',
            interpreter: 'node',
            exec_mode: 'fork',
            kill_timeout: 10000,
            env: {
                PM2_KILL_SIGNAL: 'SIGTERM',
            },
            watch: false, // 是否监听文件改动，而重新启动服务
        },
        {
            cwd: './', // 项目的目录位置
            name: 'http',
            script: './src/http/main.ts',
            interpreter: 'node',
            args: '-p bearjoy -v dev -ap 25001',
            interpreter_args: '-r ts-node/register -r tsconfig-paths/register',
            env: {
                TS_NODE_PROJECT: './tsconfig.json',
            },
            exec_mode: 'fork',
            watch: false, // 是否监听文件改动，而重新启动服务
        },
    ],
}
