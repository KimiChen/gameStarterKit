import { program } from 'commander'

program.option('-ap | --apiPort <int>', 'api服务的端口')

import { E_APP_TYPE, EngineInitHelper } from '@arthropoda/game-engine'

import { initializeManagementHttp } from './initializeManagementHttp'
import app from './app'
import http from 'http'
import path from 'path'
import { initializeApplication } from '../startup/initializeApplication'
import { FixedServerEndpoint } from './FixedServerEndpoint'
import { GameModuleLifecycle } from '../startup/GameModuleLifecycle'

let port: number
/**
 * Event listener for HTTP server "error" event.
 */

function onError(error: { syscall: string; code: any }) {
    if (error.syscall !== 'listen') {
        throw error
    }

    const bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port

    // handle specific listen errors with friendly messages
    switch (error.code) {
        case 'EACCES':
            console.error(bind + ' requires elevated privileges')
            process.exit(1)
            break
        case 'EADDRINUSE':
            console.error(bind + ' is already in use')
            process.exit(1)
            break
        default:
            throw error
    }
}

/** 改为初始化后,完成表结构迁移之后才能监听端口 */
initializeApplication({ appType: E_APP_TYPE.API })
    .then(() => {
        initializeManagementHttp()
            .then((r) => {
                /**
                 * Get port from environment and store in Express.
                 */
                port = program.opts().apiPort
                if (port !== undefined) {
                    CP.platform.port = port
                } else {
                    port = CP.platform.port
                }

                app.set('port', port)

                /**
                 * Create HTTP server.
                 */

                const server = http.createServer(app)

                server.on('error', onError)
                server.on('listening', () => {
                    const addr = server.address()
                    if (addr == null) {
                        return
                    }
                    const bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port
                })

                server.on('uncaughtException', (err) => {
                    console.error('Caught exception: ' + err)
                })

                server.on('unhandledRejection', (reason, promise) => {
                    console.error('Unhandled Rejection at:', promise, 'reason:', reason)
                })

                process.on('uncaughtException', (err) => {
                    console.error('Caught exception: ' + err)
                })

                process.on('unhandledRejection', (reason, promise) => {
                    console.error('Unhandled Rejection at:', promise, 'reason:', reason)
                })

                server.listen(port, CP.platform.host, () => {
                    console.log(`Http server listen:${CP.platform.host}:${port} 启动成功`)
                    // 初始化配置
                    EngineInitHelper.InitHttpConfig({
                        protoJsonPath: path.resolve(ROOT_PATH, 'generated/records/proto.json5'),
                        platformPath: FixedServerEndpoint.configPath('platform.json5'),
                        beanPath: path.resolve(ROOT_PATH, 'generated/records/bean.json5'),
                    })
                    GameModuleLifecycle.run('management', 'server-started').catch((error) => console.error(error))
                })
            })
            .catchError('src/http/main.ts#1:')
    })
    .catchError('src/http/main.ts#2:')
